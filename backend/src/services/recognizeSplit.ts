/** Orchestrates the split recognition pipeline:
 *
 *   detect (vision, no catalog) -> ground (deterministic shortlist)
 *                               -> rerank (text-only, pick-from-5 or null)
 *
 * Output items match the monolithic pipeline's shape exactly, so the route's
 * envelope, cache and clients see no difference. If the re-rank call fails,
 * only entries a whole alias vouches for survive — the pipeline degrades to
 * fewer matches, never to wrong ones. */
import type { Tables } from '@drop/water-engine';
import { detectItems, type RawDetection } from './detect';
import { groundItem, type GroundedCandidate } from './ground';
import { rerankItems, type RerankInputItem } from './rerank';
import { sanitizeModelOutput } from './sanitize';
import {
  MAX_ITEMS,
  shapeBox,
  shapeQuantity,
  type OutCandidate,
  type RecognizedItemOut,
} from './recognizeShape';

/** Confidence reported when a match came from alias text instead of the
 * re-ranker's judgment. Same register as the old local-match score. */
const ALIAS_FALLBACK_SCORE = 0.4;

const CATEGORIES = new Set(['food', 'drink', 'transport', 'product']);

export type SplitResult =
  | { ok: true; items: RecognizedItemOut[] }
  | { ok: false; violations: string[] };

interface WorkItem {
  label: string;
  description: string;
  category: RecognizedItemOut['category'];
  quantity: RecognizedItemOut['quantity'];
  detected_text: string[];
  box: RecognizedItemOut['box'];
  shortlist: GroundedCandidate[];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function toCandidate(
  g: GroundedCandidate, score: number, reason: string, repaired: boolean,
): OutCandidate {
  return {
    catalog_id: g.entry.catalog_id,
    display_name: g.entry.display_name,
    category: g.entry.category,
    score,
    reason,
    repaired,
  };
}

/** The no-model fallback: trust an entry only when a complete alias of it
 * appeared in the item's text. Partial overlap ("dog" against "hot dog")
 * never survives this. */
function aliasFallback(shortlist: GroundedCandidate[]): OutCandidate[] {
  const full = shortlist.find((g) => g.full);
  return full
    ? [toCandidate(full, ALIAS_FALLBACK_SCORE, 'full alias match', true)]
    : [];
}

export async function recognizeSplit(
  imageDataUrl: string,
  hint: string | undefined,
  mode: 'normal' | 'fast',
  tables: Tables,
): Promise<SplitResult> {
  // Without the catalog in the prompt, detection no longer needs the deep
  // deliberation the monolithic call ran at — medium keeps the latency tail
  // inside the mobile deadline.
  const detection: RawDetection = await detectItems(
    imageDataUrl, hint, mode === 'fast' ? 'low' : 'medium');

  const sanity = sanitizeModelOutput(detection);
  if (!sanity.ok) return { ok: false, violations: sanity.violations };

  const work: WorkItem[] = [];
  for (const item of (detection.items ?? []).slice(0, MAX_ITEMS)) {
    const label = (item.label ?? '').trim();
    const category = (item.category ?? '').trim();
    // "other" is the model's honest name for a non-consumable that dominated
    // the frame; it has no place in a footprint list.
    if (!label || !CATEGORIES.has(category)) continue;
    const description = (item.description ?? '').trim();
    const detected_text = (item.detected_text ?? []).filter(
      (t): t is string => typeof t === 'string');
    work.push({
      label,
      description,
      category: category as RecognizedItemOut['category'],
      quantity: shapeQuantity(item.quantity),
      detected_text,
      box: shapeBox(item.box),
      shortlist: groundItem(
        [label, description, ...detected_text].join(' '), tables),
    });
  }

  const rerankable = work
    .map((w, index) => ({ w, index }))
    .filter(({ w }) => w.shortlist.length > 0);

  const decisions = new Map<number, OutCandidate[]>();
  if (rerankable.length > 0) {
    const input: RerankInputItem[] = rerankable.map(({ w, index }) => ({
      index,
      label: w.label,
      description: w.description,
      detected_text: w.detected_text,
      shortlist: w.shortlist.map((g) => g.entry),
    }));
    try {
      for (const d of await rerankItems(
        input, mode === 'fast' ? 'minimal' : 'low')) {
        const target = rerankable.find(({ index }) => index === d.index);
        if (!target) continue;
        if (d.catalog_id === null) {
          decisions.set(d.index, []);
          continue;
        }
        const chosen = target.w.shortlist.find(
          (g) => g.entry.catalog_id === d.catalog_id);
        // An id from outside the item's own shortlist is the exact failure
        // mode this pipeline exists to kill; fall back to alias evidence.
        decisions.set(d.index, chosen
          ? [toCandidate(
              chosen, clamp01(d.confidence), d.reason ?? '', false)]
          : aliasFallback(target.w.shortlist));
      }
    } catch (err) {
      console.error('rerank failed, degrading to alias matches', err);
    }
  }

  const items: RecognizedItemOut[] = work.map((w, index) => {
    const candidates = decisions.get(index) ?? aliasFallback(w.shortlist);
    return {
      index,
      label: w.label,
      category: w.category,
      candidates,
      quantity: w.quantity,
      detected_text: w.detected_text,
      box: w.box,
      unmatched: candidates.length === 0,
    };
  });

  return { ok: true, items };
}
