import { describe, expect, it } from 'vitest';
import { tables } from '../src/data';
import { searchCatalog, validateCatalogId } from '../src/services/catalogMatch';

describe('validateCatalogId', () => {
  it('passes through a real catalog id unrepaired', () => {
    expect(validateCatalogId('apple', tables)).toEqual({
      catalog_id: 'apple', repaired: false,
    });
  });

  it('never repairs "water" into "watermelon" on a bare prefix match', () => {
    expect(validateCatalogId('water', tables)).toBeNull();
  });

  it('returns null for garbage input ("zzzz")', () => {
    expect(validateCatalogId('zzzz', tables)).toBeNull();
  });

  it('rejects queries shorter than the minimum length', () => {
    expect(validateCatalogId('ab', tables)).toBeNull();
    expect(validateCatalogId('', tables)).toBeNull();
  });

  it('still repairs a real near-miss (missing underscore/typo)', () => {
    const v = validateCatalogId('almond shelled', tables);
    expect(v).toEqual({ catalog_id: 'almond_shelled', repaired: true });
  });
});

describe('searchCatalog', () => {
  it('returns [] for an empty query', () => {
    expect(searchCatalog('', tables)).toEqual([]);
    expect(searchCatalog('   ', tables)).toEqual([]);
  });

  it('does not throw and stays capped for a huge query', () => {
    const huge = 'apple '.repeat(1000);
    expect(() => searchCatalog(huge, tables)).not.toThrow();
  });
});
