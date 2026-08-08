/** Validates model-returned catalog ids and repairs near-misses against the
 * controlled catalog (whole-token match over search_tokens). */
import type { CatalogEntry, Tables } from '@drop/water-engine';

const MIN_REPAIR_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 200;
/** Fraction of the query's tokens that must exact-match a catalog entry's
 * tokens before we'll treat it as a repair. Below this we'd rather say
 * "no match" than silently substitute the wrong item (e.g. "water" must
 * never repair to "watermelon" just because it's a prefix). */
const REPAIR_SCORE_THRESHOLD = 0.6;

export function validateCatalogId(
  id: string, tables: Tables,
): { catalog_id: string; repaired: boolean } | null {
  if (tables.catalog.has(id)) return { catalog_id: id, repaired: false };

  const q = id.replace(/_/g, ' ').toLowerCase().trim();
  if (q.length < MIN_REPAIR_QUERY_LENGTH) return null;
  const queryTokens = q.split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) return null;

  let best: { e: CatalogEntry; score: number } | null = null;
  for (const e of tables.catalog.values()) {
    const hayTokens = new Set(e.search_tokens.split(/\s+/).filter(Boolean));
    let hits = 0;
    for (const t of queryTokens) if (hayTokens.has(t)) hits += 1;
    const score = hits / queryTokens.length;
    if (score > 0 && (!best || score > best.score)) best = { e, score };
  }
  if (best && best.score >= REPAIR_SCORE_THRESHOLD) {
    return { catalog_id: best.e.catalog_id, repaired: true };
  }
  return null;
}

export function searchCatalog(
  query: string, tables: Tables, limit = 8,
): CatalogEntry[] {
  const q = query.toLowerCase().trim().slice(0, MAX_QUERY_LENGTH);
  if (!q) return [];
  const terms = q.split(/\s+/);
  const scored: { e: CatalogEntry; score: number }[] = [];
  for (const e of tables.catalog.values()) {
    const hay = e.search_tokens;
    let score = 0;
    for (const t of terms) {
      if (!t) continue;
      if (hay === t) score += 1000;
      else if (hay.startsWith(t)) score += 800;
      else if (hay.includes(` ${t}`)) score += 600;
      else if (hay.includes(t)) score += 400;
    }
    if (score > 0) {
      score -= Math.min(hay.length / 8, 40);
      scored.push({ e, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.e);
}
