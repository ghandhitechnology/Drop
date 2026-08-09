/** Stage 3 of the split recognition pipeline: one text-only call decides
 * which shortlist entry each detected item actually is. Choosing among five
 * with the item's full description in hand is a job a cheap, low-effort call
 * handles reliably; choosing among a thousand mid-vision was not. */
import type { CatalogEntry } from '@drop/water-engine';
import { chatJSONRetry, type ReasoningEffort } from './openrouter';

const RERANK_SYSTEM_PROMPT = `You match identified real-world items to a controlled catalog.

For each numbered item, pick the ONE catalog entry from that item's own
shortlist that IS the same kind of thing, or null when none genuinely is.

Rules:
- Only ids from that item's shortlist are allowed. Never borrow from another
  item's shortlist.
- null beats a stretch. A live animal, a person, furniture, or a decoration
  matches nothing, no matter how similar a catalog name sounds.
- Prefer the entry matching the item's preparation and specificity (grilled
  chicken breast -> a chicken meat entry, not a whole raw chicken).
- confidence is 0-1: your belief the chosen entry is the right identification.
- Keep every reason under eight words.`;

const RERANK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['decisions'],
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'catalog_id', 'confidence', 'reason'],
        properties: {
          index: { type: 'number' },
          catalog_id: { type: ['string', 'null'] },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;

export interface RerankInputItem {
  index: number;
  label: string;
  description: string;
  detected_text: string[];
  shortlist: CatalogEntry[];
}

export interface RerankDecision {
  index: number;
  catalog_id: string | null;
  confidence: number;
  reason: string;
}

function entryRow(e: CatalogEntry): string {
  const syn = e.synonyms.join(',');
  const dq = e.default_quantity;
  return `${e.catalog_id}|${e.display_name}|${syn}|${e.category}` +
    `|${dq.value}${dq.unit}${e.unsupported ? '|unsupported' : ''}`;
}

function itemBlock(item: RerankInputItem): string {
  const text = item.detected_text.length > 0
    ? `\n  label text: ${item.detected_text.join(' / ')}`
    : '';
  return `ITEM ${item.index}: ${item.label}
  ${item.description}${text}
  shortlist (id|name|synonyms|category|default quantity):
${item.shortlist.map((e) => `    ${entryRow(e)}`).join('\n')}`;
}

export async function rerankItems(
  items: RerankInputItem[],
  reasoningEffort: ReasoningEffort,
): Promise<RerankDecision[]> {
  const raw = await chatJSONRetry({
    schemaName: 'rerank',
    schema: RERANK_SCHEMA as unknown as Record<string, unknown>,
    // Text-only pick-from-5; the tail of the mobile client's 28s budget.
    timeoutMs: 8_000,
    reasoningEffort,
    maxTokens: 3_000,
    messages: [
      { role: 'system', content: RERANK_SYSTEM_PROMPT },
      { role: 'user', content: items.map(itemBlock).join('\n\n') },
    ],
  }) as { decisions?: RerankDecision[] };
  return raw.decisions ?? [];
}
