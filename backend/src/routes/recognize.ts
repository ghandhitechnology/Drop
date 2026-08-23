import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { catalogPrompt, tables, FACTORS_VERSION } from '../data';
import { chatJSONRetry, MODEL } from '../services/openrouter';
import { sanitizeModelOutput } from '../services/sanitize';
import {
  MAX_ITEMS,
  shapeItems,
  type RawRecognition,
  type RecognizedItemOut,
} from '../services/recognizeShape';
import { recognizeSplit } from '../services/recognizeSplit';
import { authorizeAnalysis, consumeAnalysis } from '../usage/http';
import type { UsageService } from '../usage/service';

const SYSTEM_PROMPT = `You identify everyday items for a water-footprint tracker.

Look at the WHOLE frame and list every distinct thing a person would eat,
drink, ride, or buy. Map each one to an entry from the CONTROLLED CATALOG
below, estimate the QUANTITY of that one item, and read any package label
text on it. Footprint numbers are computed by a separate verified system —
your job is identification only.

Before returning the final JSON, inspect the frame internally in this order:
1. Inventory distinct consumable or purchasable objects across the whole frame.
2. Inspect visible packaging and label text.
3. Separate adjacent items while combining identical repeated items.
4. Compare plausible interpretations against the controlled catalog.
5. Check quantities against visible count, package size, and scale.
6. Return only the final schema; do not include your working.

Rules:
- Return between 1 and ${MAX_ITEMS} items, most prominent first (largest area
  in frame).
- One entry per distinct item. Identical repeats are ONE entry: count them and
  give the combined amount (three dumplings -> one item, 90 g, evidence
  "3 x ~30 g").
- A mixed dish the catalog names as one thing is one item. Separate portions
  sitting side by side on the plate are separate items.
- Skip empty plates, bowls and glasses, cutlery, the table, hands, packaging
  that is not the product, and garnish under a spoonful.
- catalog_id values MUST come from the catalog below.
- If a package label states a net weight/volume, use it (basis package_label).
  Otherwise estimate from what is visible (basis vision_estimate).
- If nothing in the catalog fits an item, set unmatched true for that item,
  leave candidates empty, and still give label, category, quantity and box.
- Rows ending in |unsupported have no water factor yet. Still pick one when it
  is the right identification — the app says so honestly. Never substitute a
  different entry (e.g. an electric car is never a petrol car).
- box is that item's bounding box, normalised 0-1 against the whole image,
  origin top-left. Use {"x":0,"y":0,"w":1,"h":1} when you cannot localise it.
- Keep every reason under eight words.

CONTROLLED CATALOG (id|name|synonyms|category|default quantity[|unsupported]):
${catalogPrompt}`;

const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'category', 'candidates', 'quantity', 'detected_text', 'box', 'unmatched'],
  properties: {
    label: { type: 'string' },
    category: {
      type: 'string',
      enum: ['food', 'drink', 'transport', 'product'],
    },
    candidates: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['catalog_id', 'score', 'reason'],
        properties: {
          catalog_id: { type: 'string' },
          score: { type: 'number' },
          reason: { type: 'string' },
        },
      },
    },
    quantity: {
      type: 'object',
      additionalProperties: false,
      required: ['value', 'unit', 'basis', 'evidence'],
      properties: {
        value: { type: 'number' },
        unit: {
          type: 'string',
          enum: ['g', 'kg', 'ml', 'l', 'km', 'usd', 'item'],
        },
        basis: {
          type: 'string',
          enum: ['package_label', 'vision_estimate'],
        },
        evidence: { type: ['string', 'null'] },
      },
    },
    detected_text: { type: 'array', items: { type: 'string' } },
    box: {
      type: 'object',
      additionalProperties: false,
      required: ['x', 'y', 'w', 'h'],
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        w: { type: 'number' },
        h: { type: 'number' },
      },
    },
    unmatched: { type: 'boolean' },
  },
} as const;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'scene_description'],
  properties: {
    // maxItems is advisory under strict mode — shapeItems slices regardless.
    items: { type: 'array', maxItems: MAX_ITEMS, items: ITEM_SCHEMA },
    scene_description: { type: ['string', 'null'] },
  },
} as const;

const cache = new Map<string, unknown>();
const CACHE_MAX = 200;

/** Builds the wire envelope and caches it. Both pipelines end here, so the
 * response shape stays byte-compatible regardless of which one ran. */
function respond(hash: string, items: RecognizedItemOut[]): object {
  const first = items[0];
  const response = {
    request_id: `rec_${hash.slice(0, 12)}`,
    model: MODEL,
    catalog_version: FACTORS_VERSION,
    items,
    item_count: items.length,
    // Legacy mirror of items[0]: an un-upgraded client keeps working.
    candidates: first?.candidates ?? [],
    quantity: first?.quantity ?? null,
    detected_text: first?.detected_text ?? [],
    unmatched: items.length === 0 || items.every((i) => i.unmatched),
  };
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(hash, response);
  return response;
}

function isPresentable(items: RecognizedItemOut[]): boolean {
  const usable = items.filter((item) => item.candidates.length > 0 || item.label !== '');
  return usable.length > 1 || Boolean(usable[0]?.candidates.length);
}

export function createRecognize(usage: UsageService) {
  const recognize = new Hono();

  recognize.post('/', async (c) => {
    const body = await c.req.json<{
      image_base64?: string;
      mime?: string;
      hint?: string;
      mode?: 'normal' | 'fast';
    }>();
    if (!body.image_base64) {
      return c.json({ error: 'image_base64 required' }, 400);
    }
    const mode = body.mode ?? 'normal';
    if (mode !== 'normal' && mode !== 'fast') {
      return c.json({ error: "mode must be 'normal' or 'fast'" }, 400);
    }
    const mime = body.mime ?? 'image/jpeg';
    const requestFingerprint = createHash('sha256')
      .update(JSON.stringify([body.image_base64, mime, body.hint ?? '', mode]))
      .digest('hex');
    const authorization = await authorizeAnalysis(c, usage, 'recognize', requestFingerprint);
    if (authorization instanceof Response) return authorization;
    if (cache.has(requestFingerprint)) {
      const response = cache.get(requestFingerprint) as { items?: RecognizedItemOut[] };
      if (isPresentable(response.items ?? [])) {
        const failed = await consumeAnalysis(
          c,
          usage,
          authorization,
          'recognize',
          requestFingerprint,
        );
        if (failed) return failed;
      }
      return c.json(response as object);
    }

    // The split pipeline (detect -> ground -> rerank) is the default;
    // RECOGNIZE_PIPELINE=mono is the rollback switch to the original
    // single-call pipeline.
    const dataUrl = `data:${mime};base64,${body.image_base64}`;
    let items: RecognizedItemOut[];
    if (process.env.RECOGNIZE_PIPELINE !== 'mono') {
      try {
        const result = await recognizeSplit(dataUrl, body.hint, mode, tables);
        if (!result.ok) {
          console.error('prompt-integrity violation', result.violations);
          return c.json(
            {
              error: 'model output rejected',
              violation: true,
              paths: result.violations,
            },
            502,
          );
        }
        items = result.items;
      } catch (err) {
        console.error('recognize model call failed', err);
        return c.json({ error: 'model unavailable' }, 502);
      }
      const response = respond(requestFingerprint, items);
      if (isPresentable(items)) {
        const failed = await consumeAnalysis(
          c,
          usage,
          authorization,
          'recognize',
          requestFingerprint,
        );
        if (failed) return failed;
      }
      return c.json(response);
    }

    // A failed model call is an upstream problem, not ours: answer it as a
    // typed 502 so the app can tell it apart from a rejected request.
    let out: RawRecognition;
    try {
      out = (await chatJSONRetry({
        schemaName: 'recognition',
        schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
        timeoutMs: 25_000,
        reasoningEffort: mode === 'fast' ? 'low' : 'high',
        maxTokens: 12_000,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: body.hint
                  ? `Identify everything here. Context: ${body.hint}`
                  : 'Identify everything here.',
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      })) as RawRecognition;
    } catch (err) {
      console.error('recognize model call failed', err);
      return c.json({ error: 'model unavailable' }, 502);
    }

    const sanity = sanitizeModelOutput(out);
    if (!sanity.ok) {
      console.error('prompt-integrity violation', sanity.violations);
      return c.json(
        {
          error: 'model output rejected',
          violation: true,
          paths: sanity.violations,
        },
        502,
      );
    }

    items = shapeItems(out, tables);
    const response = respond(requestFingerprint, items);
    if (isPresentable(items)) {
      const failed = await consumeAnalysis(
        c,
        usage,
        authorization,
        'recognize',
        requestFingerprint,
      );
      if (failed) return failed;
    }
    return c.json(response);
  });

  return recognize;
}
