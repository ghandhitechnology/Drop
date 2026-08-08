import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { catalogPrompt, tables, FACTORS_VERSION } from '../data';
import { chatJSONRetry } from '../services/openrouter';
import { sanitizeModelOutput } from '../services/sanitize';
import { searchCatalog, validateCatalogId } from '../services/catalogMatch';

const SYSTEM_PROMPT = `You identify everyday items for a water-footprint tracker.
Map what you see to entries from the CONTROLLED CATALOG below. Estimate the
QUANTITY visible (net mass, volume, distance, or price) and read any package
label text. Footprint numbers are computed by a separate verified system —
your job is identification only.

Rules:
- catalog_id values MUST come from the catalog below.
- If a package label states a net weight/volume, use it (basis package_label).
- Otherwise estimate from what is visible (basis vision_estimate).
- If nothing fits, set unmatched true and describe what you see.
- Rows ending in |unsupported have no water factor yet. Still pick one when it
  is the right identification — the app says so honestly. Never substitute a
  different entry (e.g. an electric car is never a petrol car).

CONTROLLED CATALOG (id|name|synonyms|category|default quantity[|unsupported]):
${catalogPrompt}`;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates', 'quantity', 'detected_text', 'unmatched',
    'scene_description'],
  properties: {
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
        unit: { type: 'string', enum: ['g', 'kg', 'ml', 'l', 'km', 'usd', 'item'] },
        basis: {
          type: 'string',
          enum: ['package_label', 'vision_estimate'],
        },
        evidence: { type: ['string', 'null'] },
      },
    },
    detected_text: { type: 'array', items: { type: 'string' } },
    unmatched: { type: 'boolean' },
    scene_description: { type: ['string', 'null'] },
  },
} as const;

interface ModelResponse {
  candidates: { catalog_id: string; score: number; reason: string }[];
  quantity: {
    value: number;
    unit: string;
    basis: 'package_label' | 'vision_estimate';
    evidence?: string;
  };
  detected_text: string[];
  unmatched: boolean;
  scene_description?: string;
}

const cache = new Map<string, unknown>();
const CACHE_MAX = 200;

export const recognize = new Hono();

recognize.post('/', async (c) => {
  const body = await c.req.json<{
    image_base64?: string;
    mime?: string;
    hint?: string;
  }>();
  if (!body.image_base64) {
    return c.json({ error: 'image_base64 required' }, 400);
  }
  const mime = body.mime ?? 'image/jpeg';
  const hash = createHash('sha256').update(body.image_base64).digest('hex');
  if (cache.has(hash)) return c.json(cache.get(hash) as object);

  const out = await chatJSONRetry({
    schemaName: 'recognition',
    schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: body.hint
              ? `Identify this. Context: ${body.hint}`
              : 'Identify this.',
          },
          {
            type: 'image_url',
            image_url: { url: `data:${mime};base64,${body.image_base64}` },
          },
        ],
      },
    ],
  }) as ModelResponse;

  const sanity = sanitizeModelOutput(out);
  if (!sanity.ok) {
    console.error('prompt-integrity violation', sanity.violations);
    return c.json({
      error: 'model output rejected',
      violation: true,
      paths: sanity.violations,
    }, 502);
  }

  const candidates = [];
  for (const cand of out.candidates ?? []) {
    const v = validateCatalogId(cand.catalog_id, tables);
    if (!v) continue;
    const entry = tables.catalog.get(v.catalog_id)!;
    candidates.push({
      catalog_id: v.catalog_id,
      display_name: entry.display_name,
      category: entry.category,
      score: Math.max(0, Math.min(1, cand.score)),
      reason: cand.reason,
      repaired: v.repaired,
    });
  }

  // Model produced nothing usable: local text match over what it saw.
  if (candidates.length === 0 && out.scene_description) {
    for (const e of searchCatalog(out.scene_description, tables, 3)) {
      candidates.push({
        catalog_id: e.catalog_id,
        display_name: e.display_name,
        category: e.category,
        score: 0.2,
        reason: 'text match on scene description',
        repaired: true,
      });
    }
  }

  const response = {
    request_id: `rec_${hash.slice(0, 12)}`,
    model: 'openai/gpt-5.6-luna',
    catalog_version: FACTORS_VERSION,
    candidates,
    quantity: out.quantity ?? null,
    detected_text: out.detected_text ?? [],
    unmatched: candidates.length === 0,
  };

  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(hash, response);
  return c.json(response);
});
