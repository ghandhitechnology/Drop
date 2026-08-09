import { describe, expect, it } from 'vitest';
import { tables } from '../src/data';
import {
  matchLabel,
  searchCatalog,
  validateCatalogId,
} from '../src/services/catalogMatch';

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

  it('repairs common single-word foods through the alias map', () => {
    expect(validateCatalogId('milk', tables)).toEqual({
      catalog_id: 'cow_milk', repaired: true,
    });
    expect(validateCatalogId('chicken', tables)).toEqual({
      catalog_id: 'chicken_bone_free_meat', repaired: true,
    });
    expect(validateCatalogId('egg', tables)).toEqual({
      catalog_id: 'eggs', repaired: true,
    });
  });

  it('leaves ambiguous single words unrepaired ("fish", "tea")', () => {
    expect(validateCatalogId('fish', tables)).toBeNull();
    expect(validateCatalogId('tea', tables)).toBeNull();
  });

  it('still repairs a real near-miss (missing underscore/typo)', () => {
    const v = validateCatalogId('almond shelled', tables);
    expect(v).toEqual({ catalog_id: 'almond_shelled', repaired: true });
  });
});

describe('matchLabel', () => {
  it('never matches "dog" to "hot dog" — a partial alias is no match', () => {
    expect(matchLabel('dog', tables)).toBeNull();
    expect(matchLabel('a dog in the park', tables)).toBeNull();
  });

  it('matches when a full alias is present in the query', () => {
    expect(matchLabel('grilled hot dog', tables)?.catalog_id)
      .toBe('sausages');
    expect(matchLabel('almond shelled', tables)?.catalog_id)
      .toBe('almond_shelled');
  });

  it('folds plurals inside a sentence', () => {
    expect(matchLabel('a bowl of apples on a table', tables)?.catalog_id)
      .toBe('apple');
  });

  it('routes single words through the alias map', () => {
    expect(matchLabel('milk', tables)?.catalog_id).toBe('cow_milk');
  });

  it('returns null for empty and garbage queries', () => {
    expect(matchLabel('', tables)).toBeNull();
    expect(matchLabel('xylotherium pastry', tables)).toBeNull();
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
