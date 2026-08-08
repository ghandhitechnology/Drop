/**
 * Catalog search.
 *
 * Pure functions over an in-memory array — 463 items is small enough that a
 * full linear scan per keystroke stays comfortably inside a frame, so there is
 * no index to keep in sync and no debounce to tune.
 *
 * Ranking is tiered: the tier decides the ordering and a length factor only
 * breaks ties inside a tier. The factor is clamped to [0.9, 1] precisely so a
 * long label can never jump a tier — a substring hit always sorts below every
 * word-boundary hit, whatever the lengths.
 */
import type { CatalogItem } from './types';

export const MATCH_TIER = {
  /** The whole candidate string is the query. */
  exact: 1000,
  /** The candidate starts with the query. */
  labelPrefix: 800,
  /** Some later word in the candidate starts with the query. */
  wordPrefix: 600,
  /** The query appears somewhere inside the candidate. */
  substring: 400,
  /** The query's characters appear in order, with gaps. */
  subsequence: 200,
} as const;

export type MatchTier = keyof typeof MATCH_TIER;

/** Candidate strings are weighted by how canonical they are. */
const SOURCE_WEIGHT = { label: 1, alias: 0.97, blob: 0.94 } as const;

/** Characters that separate words for the purposes of matching. */
const SEPARATORS = /[\s\-_/\\()[\]{}<>,.;:!?'"\u00ab\u00bb\u201c\u201d\u2018\u2019\u00b7\u2022+&*#@%~^|=$\u20a9\u20ac\u00a3\u00a5]+/g;

const COMBINING_MARKS = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20f0]/g;

/**
 * Lowercase, strip accents, collapse punctuation to single spaces.
 *
 * Applied to the catalog at seed time (into `search_blob`) and to the query at
 * search time, so both sides of every comparison are already flat.
 */
export function normalizeForSearch(value: string): string {
  let text = value;
  try {
    // NFD also splits Hangul syllables into jamo, so recompose afterwards: the
    // accents are already gone by then, and 사과 comes back as two characters
    // rather than six.
    text = text.normalize('NFD').replace(COMBINING_MARKS, '').normalize('NFC');
  } catch {
    // Runtimes without full Unicode normalisation still get the rest.
  }
  return text.toLowerCase().replace(SEPARATORS, ' ').trim();
}

function isSubsequence(candidate: string, query: string): boolean {
  let index = 0;
  for (let i = 0; i < candidate.length && index < query.length; i += 1) {
    if (candidate[i] === query[index]) index += 1;
  }
  return index === query.length;
}

function hasWordPrefix(candidate: string, query: string): boolean {
  let from = candidate.indexOf(' ');
  while (from !== -1) {
    if (candidate.startsWith(query, from + 1)) return true;
    from = candidate.indexOf(' ', from + 1);
  }
  return false;
}

/** The tier a single candidate string reaches for a query, or 0 for no match. */
export function tierScore(candidate: string, query: string): number {
  if (!candidate || !query) return 0;
  if (candidate === query) return MATCH_TIER.exact;
  if (candidate.startsWith(query)) return MATCH_TIER.labelPrefix;
  if (hasWordPrefix(candidate, query)) return MATCH_TIER.wordPrefix;
  if (candidate.includes(query)) return MATCH_TIER.substring;
  // A one-character query as a subsequence matches almost everything, so the
  // loosest tier asks for at least two characters.
  if (query.length >= 2 && isSubsequence(candidate, query)) {
    return MATCH_TIER.subsequence;
  }
  return 0;
}

/**
 * Inverse-length scaling, clamped to [0.9, 1].
 *
 * A query covering the whole candidate scores 1; a query buried in a long
 * candidate approaches 0.9. Short labels therefore win ties without ever
 * outranking a better tier.
 */
export function lengthFactor(candidate: string, query: string): number {
  if (candidate.length === 0) return 0.9;
  return 0.9 + 0.1 * Math.min(1, query.length / candidate.length);
}

function candidateScore(candidate: string, query: string, weight: number): number {
  const tier = tierScore(candidate, query);
  if (tier === 0) return 0;
  return tier * lengthFactor(candidate, query) * weight;
}

/**
 * Best score across an item's label, its aliases, and its search blob.
 *
 * Every candidate here is already normalised — `normalizedLabel`,
 * `normalizedAliases`, and `searchBlob` are built at hydration and seed time.
 * `query` must arrive normalised too; `searchCatalog` does that once per call.
 */
export function scoreItem(item: CatalogItem, query: string): number {
  let best = candidateScore(item.normalizedLabel, query, SOURCE_WEIGHT.label);

  for (const alias of item.normalizedAliases) {
    const score = candidateScore(alias, query, SOURCE_WEIGHT.alias);
    if (score > best) best = score;
  }

  const blobScore = candidateScore(item.searchBlob, query, SOURCE_WEIGHT.blob);
  return blobScore > best ? blobScore : best;
}

export interface SearchHit {
  item: CatalogItem;
  score: number;
}

export const DEFAULT_SEARCH_LIMIT = 24;

/**
 * Ranked matches for a raw query string. Ties fall back to `sortRank` (which
 * front-loads food and drink, then shorter labels) and finally to the label,
 * so the order is fully deterministic.
 */
export function searchCatalog(
  items: readonly CatalogItem[],
  rawQuery: string,
  limit: number = DEFAULT_SEARCH_LIMIT,
): SearchHit[] {
  const query = normalizeForSearch(rawQuery);
  if (!query) return [];

  const hits: SearchHit[] = [];
  for (const item of items) {
    const score = scoreItem(item, query);
    if (score > 0) hits.push({ item, score });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.item.sortRank !== b.item.sortRank) return a.item.sortRank - b.item.sortRank;
    return a.item.label < b.item.label ? -1 : a.item.label > b.item.label ? 1 : 0;
  });

  return hits.length > limit ? hits.slice(0, limit) : hits;
}
