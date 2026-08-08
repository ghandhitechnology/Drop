/**
 * What is driving the week, and the lighter thing of the same kind.
 *
 * Both halves are grounded the same way the rest of Drop is. The heavy item is
 * read straight out of the person's own confirmed entries — it is not a guess
 * about their diet, it is the row they saved. The lighter alternative is a
 * catalogue item of the same typology, run through the same engine at the same
 * amount, so the saving is two curated factors subtracted rather than a number
 * the product invented to make a point.
 *
 * When the catalogue holds nothing comparable, this returns the heavy item
 * alone. Naming what is heaviest is useful by itself, and a swap conjured out
 * of a different category ("bread instead of a flight") is worse than silence.
 */

import { getTables } from '../../data/tables';
import type { WeekLeader } from '../../data/types';
import { estimateFor } from '../search/estimate';

/** A swap has to free at least this share of the heavy item to be worth saying. */
const WORTH_SAYING = 0.35;

/** Candidates scanned per suggestion. The catalogue is ~1,000 items. */
const SCAN_LIMIT = 400;

export type Swap = {
  catalogId: string;
  label: string;
  /** Litres the same number of servings would have cost. */
  litres: number;
  /** Litres freed across the week, against what was actually logged. */
  freed: number;
};

export type WeekDriver = {
  leader: WeekLeader;
  /** The lighter item of the same kind, where the catalogue holds one. */
  swap: Swap | null;
};

/** The litres one published serving of an item costs, or nothing when unsupported. */
function servingLitres(catalogId: string): number | null {
  const outcome = estimateFor({ catalogId, source: 'catalog_default' });
  const headline = outcome?.estimate.headline;
  return headline ? headline.value_l : null;
}

/**
 * The lighter item of the same kind.
 *
 * "Same kind" is the catalogue's own typology, falling back to the category.
 * Typology is the tighter of the two — it keeps a red meat compared against
 * other proteins rather than against a category that also holds lettuce.
 */
export function findSwap(leader: WeekLeader): Swap | null {
  const tables = getTables();
  const source = tables.catalog.get(leader.itemId);
  if (!source) return null;

  const leaderServing = servingLitres(leader.itemId);
  if (leaderServing === null || leaderServing <= 0) return null;

  const typology = source.factor_links?.typology?.factor_id ?? null;
  let best: Swap | null = null;
  let scanned = 0;

  for (const [catalogId, entry] of tables.catalog) {
    if (scanned >= SCAN_LIMIT) break;
    if (catalogId === leader.itemId) continue;
    if (entry.category !== source.category) continue;

    const entryTypology = entry.factor_links?.typology?.factor_id ?? null;
    // With a typology on the heavy item, only its own kind is comparable.
    if (typology && entryTypology !== typology) continue;
    scanned += 1;

    const litres = servingLitres(catalogId);
    if (litres === null || litres <= 0) continue;
    if (litres > leaderServing * (1 - WORTH_SAYING)) continue;
    if (best && litres >= best.litres) continue;

    best = {
      catalogId,
      label: entry.display_name,
      litres,
      // The person logged `times` servings. The saving is what those servings
      // would have cost as the lighter item instead.
      freed: (leaderServing - litres) * leader.times,
    };
  }

  return best;
}

/**
 * The week's heaviest item, with a swap where one exists.
 *
 * Returns nothing when the leader is a rounding error against the week — there
 * is no single thing driving a week made of forty even entries, and pointing at
 * one anyway would be a story rather than a finding.
 */
export function driverOf(
  leaders: WeekLeader[],
  weekLitres: number,
  minShare = 0.15,
): WeekDriver | null {
  const leader = leaders[0];
  if (!leader || weekLitres <= 0) return null;
  if (leader.litres / weekLitres < minShare) return null;
  return { leader, swap: findSwap(leader) };
}
