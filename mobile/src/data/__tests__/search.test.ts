import { describe, expect, it } from 'vitest';

import {
  MATCH_TIER,
  lengthFactor,
  normalizeForSearch,
  scoreItem,
  searchCatalog,
  tierScore,
} from '../search';
import type { CatalogItem } from '../types';

function item(partial: Partial<CatalogItem> & { id: string; label: string }): CatalogItem {
  const aliases = partial.aliases ?? [];
  return {
    aliases,
    category: 'food',
    defaultUnit: 'kg',
    defaultQuantity: 0.15,
    typology: null,
    searchBlob: normalizeForSearch([partial.label, ...aliases].join(' ')),
    normalizedLabel: normalizeForSearch(partial.label),
    normalizedAliases: aliases.map(normalizeForSearch),
    sortRank: partial.label.length,
    ...partial,
  };
}

const CATALOG: CatalogItem[] = [
  item({ id: 'apple', label: 'Apple', aliases: ['apple', '사과'] }),
  item({ id: 'apple_juice', label: 'Apple Juice', aliases: ['apple juice'] }),
  item({ id: 'pineapple', label: 'Pineapple' }),
  item({ id: 'green_apple_tart', label: 'Green Apple Tart' }),
  item({ id: 'jalapeno', label: 'Jalapeño Pepper', aliases: ['jalapeno'] }),
  item({ id: 'almond_shelled', label: 'Almond Shelled' }),
  item({ id: 'beef_mince', label: 'Beef Mince', aliases: ['ground beef', '소고기'] }),
];

const find = (id: string) => CATALOG.find((c) => c.id === id)!;

describe('normalizeForSearch', () => {
  it('lowercases', () => {
    expect(normalizeForSearch('Apple Juice')).toBe('apple juice');
  });

  it('strips accents', () => {
    expect(normalizeForSearch('Jalapeño')).toBe('jalapeno');
    expect(normalizeForSearch('Crème Brûlée')).toBe('creme brulee');
  });

  it('collapses punctuation and whitespace to single spaces', () => {
    expect(normalizeForSearch('  Oat-milk  flat/white, large ')).toBe(
      'oat milk flat white large',
    );
  });

  it('leaves non-Latin scripts intact', () => {
    expect(normalizeForSearch('사과')).toBe('사과');
  });

  it('returns an empty string for punctuation alone', () => {
    expect(normalizeForSearch('   ---   ')).toBe('');
  });
});

describe('tierScore', () => {
  it('ranks the five tiers in order', () => {
    expect(tierScore('apple', 'apple')).toBe(MATCH_TIER.exact);
    expect(tierScore('apple juice', 'apple')).toBe(MATCH_TIER.labelPrefix);
    expect(tierScore('green apple tart', 'apple')).toBe(MATCH_TIER.wordPrefix);
    expect(tierScore('pineapple', 'apple')).toBe(MATCH_TIER.substring);
    expect(tierScore('almond shelled', 'ase')).toBe(MATCH_TIER.subsequence);
  });

  it('scores no match as zero', () => {
    expect(tierScore('apple', 'zzz')).toBe(0);
    expect(tierScore('', 'apple')).toBe(0);
    expect(tierScore('apple', '')).toBe(0);
  });

  it('keeps a single character out of the subsequence tier', () => {
    expect(tierScore('beef mince', 'z')).toBe(0);
    // A leading character still matches as a prefix.
    expect(tierScore('beef mince', 'b')).toBe(MATCH_TIER.labelPrefix);
  });

  it('requires subsequence characters in order', () => {
    expect(tierScore('almond shelled', 'dna')).toBe(0);
    expect(tierScore('almond shelled', 'and')).toBe(MATCH_TIER.subsequence);
  });
});

describe('lengthFactor', () => {
  it('scores a full-length match at 1', () => {
    expect(lengthFactor('apple', 'apple')).toBe(1);
  });

  it('stays within [0.9, 1] however long the candidate', () => {
    const long = lengthFactor('a'.repeat(500), 'ap');
    expect(long).toBeGreaterThanOrEqual(0.9);
    expect(long).toBeLessThanOrEqual(1);
  });

  it('favours the shorter of two candidates', () => {
    expect(lengthFactor('apple', 'apple')).toBeGreaterThan(
      lengthFactor('apple juice', 'apple'),
    );
  });

  it('never lets a length bonus jump a tier', () => {
    const bestOfLowerTier = MATCH_TIER.wordPrefix * lengthFactor('apple', 'apple');
    const worstOfHigherTier = MATCH_TIER.labelPrefix * 0.9;
    expect(worstOfHigherTier).toBeGreaterThan(bestOfLowerTier);
  });
});

describe('scoreItem', () => {
  it('takes the best candidate across label and aliases', () => {
    expect(scoreItem(find('beef_mince'), 'ground')).toBeGreaterThan(0);
    expect(scoreItem(find('beef_mince'), 'beef')).toBeGreaterThan(
      scoreItem(find('beef_mince'), 'ground'),
    );
  });

  it('matches an accented label through its unaccented query', () => {
    expect(scoreItem(find('jalapeno'), 'jalapeno')).toBeGreaterThan(0);
  });

  it('matches a non-Latin alias', () => {
    expect(scoreItem(find('apple'), '사과')).toBeGreaterThan(0);
    expect(scoreItem(find('beef_mince'), '소고기')).toBeGreaterThan(0);
  });

  it('scores an unrelated query at zero', () => {
    expect(scoreItem(find('apple'), 'locomotive')).toBe(0);
  });
});

describe('searchCatalog', () => {
  it('orders exact, then prefix, then word prefix, then substring', () => {
    const ids = searchCatalog(CATALOG, 'apple').map((hit) => hit.item.id);
    expect(ids.slice(0, 4)).toEqual([
      'apple',
      'apple_juice',
      'green_apple_tart',
      'pineapple',
    ]);
  });

  it('returns descending scores', () => {
    const scores = searchCatalog(CATALOG, 'apple').map((hit) => hit.score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });

  it('returns nothing for an empty or punctuation-only query', () => {
    expect(searchCatalog(CATALOG, '')).toEqual([]);
    expect(searchCatalog(CATALOG, '   ')).toEqual([]);
    expect(searchCatalog(CATALOG, '--')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(searchCatalog(CATALOG, 'a', 2)).toHaveLength(2);
  });

  it('is case and accent insensitive', () => {
    expect(searchCatalog(CATALOG, 'JALAPEÑO')[0]?.item.id).toBe('jalapeno');
    expect(searchCatalog(CATALOG, 'jalapeno')[0]?.item.id).toBe('jalapeno');
  });

  it('breaks ties deterministically by sort rank then label', () => {
    const tied: CatalogItem[] = [
      { ...item({ id: 'b', label: 'Tea' }), sortRank: 5 },
      { ...item({ id: 'a', label: 'Tea' }), sortRank: 1 },
    ];
    expect(searchCatalog(tied, 'tea').map((hit) => hit.item.id)).toEqual(['a', 'b']);
  });

  it('stays well inside a frame on a catalog-sized list', () => {
    const many: CatalogItem[] = [];
    for (let i = 0; i < 463; i += 1) {
      many.push(item({ id: `item_${i}`, label: `Sample Item Number ${i}` }));
    }
    const startedAt = performance.now();
    for (let i = 0; i < 50; i += 1) searchCatalog(many, 'sample item');
    const perQuery = (performance.now() - startedAt) / 50;
    expect(perQuery).toBeLessThan(16);
  });
});
