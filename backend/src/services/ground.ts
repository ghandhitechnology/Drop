/** Stage 2 of the split recognition pipeline: ground each free-text detection
 * in the controlled catalog as a deterministic shortlist.
 *
 * Deliberately looser than matchLabel: the shortlist is an input to the
 * re-ranker, not a decision, so "dog" MAY put "hot dog" on the list — the
 * re-ranker sees the item's description and answers null. Only `full` entries
 * (a whole alias present in the text) are trusted without the re-ranker. */
import type { CatalogEntry, Tables } from '@drop/water-engine';
import { tokenize } from './catalogMatch';

export const SHORTLIST_SIZE = 5;
/** Fraction of an alias's tokens that must appear before an entry is worth
 * showing the re-ranker at all. */
const MIN_COVERAGE = 0.5;

export interface GroundedCandidate {
  entry: CatalogEntry;
  /** Best alias's fraction of tokens found in the item text. */
  coverage: number;
  /** A complete alias appeared — safe to use without the re-ranker. */
  full: boolean;
  /** Token count of that best alias; more matched tokens = more specific. */
  hits: number;
}

export function groundItem(text: string, tables: Tables): GroundedCandidate[] {
  const queryTokens = new Set(tokenize(text));
  if (queryTokens.size === 0) return [];

  const scored: GroundedCandidate[] = [];
  for (const entry of tables.catalog.values()) {
    let best: { coverage: number; hits: number } | null = null;
    for (const alias of [entry.display_name, ...entry.synonyms]) {
      const aliasTokens = tokenize(alias);
      if (aliasTokens.length === 0) continue;
      let hits = 0;
      for (const t of aliasTokens) if (queryTokens.has(t)) hits += 1;
      const coverage = hits / aliasTokens.length;
      if (coverage < MIN_COVERAGE) continue;
      if (
        !best
        || coverage > best.coverage
        || (coverage === best.coverage && hits > best.hits)
      ) {
        best = { coverage, hits };
      }
    }
    if (best) {
      scored.push({
        entry,
        coverage: best.coverage,
        full: best.coverage === 1,
        hits: best.hits,
      });
    }
  }

  scored.sort((a, b) =>
    Number(b.full) - Number(a.full)
    || b.coverage - a.coverage
    || b.hits - a.hits);
  return scored.slice(0, SHORTLIST_SIZE);
}
