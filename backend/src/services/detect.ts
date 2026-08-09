/** Stage 1 of the split recognition pipeline: open-vocabulary detection.
 * The model never sees the catalog here — it names what is in the frame in
 * its own words. Grounding those names in the catalog is stage 2's job, so
 * this prompt is ~10x smaller than the monolithic one and the model spends
 * its attention on the image instead of on a thousand-row list. */
import { chatJSONRetry, type ReasoningEffort } from './openrouter';
import { MAX_ITEMS } from './recognizeShape';

export const DETECT_SYSTEM_PROMPT = `You identify everyday items for a water-footprint tracker.

Look at the WHOLE frame and list every distinct thing a person would eat,
drink, ride, or buy. Name each one as exactly what it is, in plain words, and
describe it richly enough that someone could look it up in a food database
without seeing the photo: kind, preparation or cooking method, packaging,
visible brand or label text.

Before returning the final JSON, inspect the frame internally in this order:
1. Inventory distinct consumable or purchasable objects across the whole frame.
2. Inspect visible packaging and label text.
3. Separate adjacent items while combining identical repeated items.
4. Check quantities against visible count, package size, and scale.
5. Return only the final schema; do not include your working.

Rules:
- Return between 1 and ${MAX_ITEMS} items, most prominent first (largest area
  in frame).
- One entry per distinct item. Identical repeats are ONE entry: count them and
  give the combined amount (three dumplings -> one item, 90 g, evidence
  "3 x ~30 g").
- A mixed dish served as one thing is one item. Separate portions sitting side
  by side on the plate are separate items.
- Skip empty plates, bowls and glasses, cutlery, the table, hands, packaging
  that is not the product, and garnish under a spoonful.
- Never rename a thing into something consumable. An animal, a person, or a
  houseplant is not an item at all — if something non-consumable dominates the
  frame and nothing consumable is present, return it with category "other".
- If a package label states a net weight/volume, use it (basis package_label).
  Otherwise estimate from what is visible (basis vision_estimate).
- box is that item's bounding box, normalised 0-1 against the whole image,
  origin top-left. Use {"x":0,"y":0,"w":1,"h":1} when you cannot localise it.`;

const DETECT_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'label', 'description', 'category', 'quantity', 'detected_text', 'box',
  ],
  properties: {
    label: { type: 'string' },
    description: { type: 'string' },
    category: {
      type: 'string',
      enum: ['food', 'drink', 'transport', 'product', 'other'],
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
        basis: { type: 'string', enum: ['package_label', 'vision_estimate'] },
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
  },
} as const;

export const DETECT_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'scene_description'],
  properties: {
    items: { type: 'array', maxItems: MAX_ITEMS, items: DETECT_ITEM_SCHEMA },
    scene_description: { type: ['string', 'null'] },
  },
} as const;

export interface RawDetectedItem {
  label?: string;
  description?: string;
  category?: string;
  quantity?: {
    value?: number;
    unit?: string;
    basis?: string;
    evidence?: string | null;
  } | null;
  detected_text?: string[];
  box?: { x?: number; y?: number; w?: number; h?: number } | null;
}

export interface RawDetection {
  items?: RawDetectedItem[];
  scene_description?: string | null;
}

export async function detectItems(
  imageDataUrl: string,
  hint: string | undefined,
  reasoningEffort: ReasoningEffort,
): Promise<RawDetection> {
  return await chatJSONRetry({
    schemaName: 'detection',
    schema: DETECT_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    // The mobile client aborts at 28s; detect and rerank share that budget.
    timeoutMs: 18_000,
    reasoningEffort,
    maxTokens: 8_000,
    messages: [
      { role: 'system', content: DETECT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: hint
              ? `Identify everything here. Context: ${hint}`
              : 'Identify everything here.',
          },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
  }) as RawDetection;
}
