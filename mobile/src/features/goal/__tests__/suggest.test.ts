import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WeekLeader } from '../../../data/types';

const catalog = new Map([
  [
    'heavy',
    {
      catalog_id: 'heavy',
      display_name: 'Heavy food',
      category: 'food',
      state: 'solid',
      default_quantity: { value: 0.2, unit: 'kg', basis: 'serving' },
      factor_links: {
        primary: null,
        typology: { factor_id: 'same-kind' },
        secondary: [],
        proxy: null,
        spend: null,
      },
      recipe: null,
      search_tokens: '',
      synonyms: [],
    },
  ],
  [
    'light',
    {
      catalog_id: 'light',
      display_name: 'Light food',
      category: 'food',
      state: 'solid',
      default_quantity: { value: 0.1, unit: 'kg', basis: 'serving' },
      factor_links: {
        primary: null,
        typology: { factor_id: 'same-kind' },
        secondary: [],
        proxy: null,
        spend: null,
      },
      recipe: null,
      search_tokens: '',
      synonyms: [],
    },
  ],
]);

vi.mock('../../../data/tables', () => ({
  getTables: () => ({ catalog }),
}));

vi.mock('../../search/estimate', () => ({
  estimateFor: ({ catalogId, quantity }: {
    catalogId: string;
    quantity?: { value: number; unit: string };
  }) => {
    const compatible = quantity?.unit === 'kg' || quantity?.unit === 'g';
    const valueKg = quantity?.unit === 'g' ? quantity.value / 1000 : quantity?.value ?? 0.1;
    const value = catalogId === 'heavy' ? valueKg * 1_000 : valueKg * 400;
    return {
      usedServing: !compatible,
      estimate: { headline: { value_l: compatible ? value : 40 } },
    };
  },
}));

const { findSwap } = await import('../suggest');

function leader(quantities: WeekLeader['quantities']): WeekLeader {
  return {
    itemId: 'heavy',
    label: 'Heavy food',
    category: 'food',
    litres: 2_000,
    times: 2,
    quantities,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('findSwap', () => {
  it('prices the alternative at the actual custom quantities logged', () => {
    const swap = findSwap(leader([
      { value: 750, unit: 'g', source: 'user_entered' },
      { value: 1.25, unit: 'kg', source: 'package_label' },
    ]));

    expect(swap).toMatchObject({ catalogId: 'light', litres: 800, freed: 1_200 });
  });

  it('offers no saving when logged quantities mix incompatible dimensions', () => {
    expect(findSwap(leader([
      { value: 1, unit: 'kg', source: 'user_entered' },
      { value: 5, unit: 'km', source: 'user_entered' },
    ]))).toBeNull();
  });
});
