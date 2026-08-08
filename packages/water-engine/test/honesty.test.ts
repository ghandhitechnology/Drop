/** Guardrails for the claims the product makes about its own numbers:
 * every emitted litre is a real number, every band has width, every fallback
 * names itself, and no confidence is bought with an unverified quantity. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildTables, estimate } from '../src/index';
import type {
  CatalogEntry, EstimateInput, RawTables, SelItem, SelStats, SelTypology,
  Tables, TransportFactor,
} from '../src/index';

const dataDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'factors', 'data', '2026.08.2',
);
const load = (name: string) =>
  JSON.parse(readFileSync(join(dataDir, name), 'utf-8'));

const raw: RawTables = {
  manifest: load('manifest.json'),
  catalog: load('catalog.json'),
  food_sueatable: load('food_sueatable.json'),
  food_hestia_country: load('food_hestia_country.json'),
  food_owid_proxy: load('food_owid_proxy.json'),
  transport_factors: load('transport_factors.json'),
  sector_useeio: load('sector_useeio.json'),
};
const tables = buildTables(raw);

/* ---------- synthetic tables, for shapes the real data cannot show ------- */

const stats = (s: Partial<SelStats>): SelStats => ({
  n: 1, mean: null, median: null, min: null, max: null, q1: null, q3: null, ...s,
});

const typology = (over: Partial<SelTypology>): SelTypology => ({
  factor_id: 'sel:typ:test__thing',
  dataset: 'su_eatable_life',
  dataset_release: 'test release',
  typology: 'THING',
  typology_key: 'TEST|THING',
  group: 'TEST',
  metric_type: 'total_water_footprint',
  stats: stats({ n: 4, median: 100, min: 100, max: 100, q1: 100, q3: 100 }),
  geography: 'GLO',
  system_boundary: 'cradle-to-distribution-centre',
  rights: 'CC BY 4.0',
  ...over,
});

const item = (over: Partial<SelItem>): SelItem => ({
  factor_id: 'sel:item:test',
  dataset: 'su_eatable_life',
  dataset_release: 'test release',
  display_name: 'Test',
  group: 'TEST',
  typology: 'THING',
  typology_key: 'TEST|THING',
  metric_type: 'total_water_footprint',
  value_l_per_kg: 100,
  typology_value_l_per_kg: 100,
  functional_unit: 'kg',
  uncertainty: 'L',
  suggested_value: 'ok_item',
  stats: stats({ n: 1, median: 100, min: 100, max: 100, q1: 100, q3: 100 }),
  flags: { size: 'G', outlier: 'G', normality: 'G' },
  geography: 'GLO',
  system_boundary: 'cradle-to-distribution-centre',
  rights: 'CC BY 4.0',
  ...over,
});

const entryOf = (over: Partial<CatalogEntry>): CatalogEntry => ({
  catalog_id: 'test_thing',
  display_name: 'Test Thing',
  synonyms: [],
  category: 'food',
  state: 'solid',
  default_quantity: { value: 0.1, unit: 'kg', basis: 'a serving' },
  factor_links: {
    primary: { factor_id: 'sel:item:test', match_level: 'exact_item' },
    typology: null,
    secondary: [],
    proxy: null,
    spend: null,
  },
  recipe: null,
  search_tokens: 'test thing',
  ...over,
});

function synthetic(over: {
  entries?: CatalogEntry[];
  items?: SelItem[];
  typologies?: SelTypology[];
  transport?: TransportFactor[];
}): Tables {
  return buildTables({
    manifest: { version: 'test' },
    catalog: { catalog_version: 'test', entries: over.entries ?? [entryOf({})] },
    food_sueatable: {
      food_items: over.items ?? [item({})],
      food_typologies: over.typologies ?? [typology({})],
    },
    food_hestia_country: { hestia_factors: [] },
    food_owid_proxy: { owid_factors: [] },
    transport_factors: { transport_factors: over.transport ?? [] },
    sector_useeio: { useeio_sectors: [] },
  });
}

const ask = (q: Partial<EstimateInput['quantity']>, id = 'apple') => estimate({
  catalog_id: id,
  quantity: { value: 1, unit: 'kg', source: 'user_entered', ...q },
}, tables);

/* ------------------------------ E1 ------------------------------------- */

describe('quantity validation', () => {
  it.each([NaN, Infinity, -Infinity, 0, -1, 1e9 + 1])(
    'refuses the quantity %p', (value) => {
      expect(() => ask({ value })).toThrow(/quantity must be a finite number/);
    },
  );

  it('accepts the largest allowed quantity', () => {
    expect(() => ask({ value: 1e9 })).not.toThrow();
  });

  it('refuses a broken quantity even for an unsupported entry', () => {
    expect(() => estimate({
      catalog_id: 'transport_ev_car',
      quantity: { value: NaN, unit: 'km', source: 'user_entered' },
    }, tables)).toThrow(/quantity must be a finite number/);
  });

  it('never emits a non-finite litre value', () => {
    const t = synthetic({
      items: [item({ value_l_per_kg: Number.POSITIVE_INFINITY })],
    });
    expect(() => estimate({
      catalog_id: 'test_thing',
      quantity: { value: 1, unit: 'kg', source: 'user_entered' },
    }, t)).toThrow(/non-finite headline/);
  });
});

/* ------------------------------ E2 ------------------------------------- */

describe('borrowed ranges', () => {
  it('drops a band with no width instead of publishing false precision', () => {
    // Single-study item borrowing a group whose quartiles sit on one number.
    const t = synthetic({
      items: [item({ value_l_per_kg: 100 })],
      typologies: [typology({
        stats: stats({ n: 4, median: 100, min: 100, max: 100, q1: 100, q3: 100 }),
      })],
    });
    const e = estimate({
      catalog_id: 'test_thing',
      quantity: { value: 1, unit: 'kg', source: 'user_entered' },
    }, t);
    expect(e.headline!.range_l).toBeNull();
  });

  it('widens the borrowed band to contain the value it is shown next to', () => {
    const t = synthetic({
      items: [item({ value_l_per_kg: 900 })],
      typologies: [typology({
        stats: stats({
          n: 6, median: 200, min: 50, max: 400, q1: 100, q3: 300,
          lower_fence: 0, upper_fence: 500,
        }),
      })],
    });
    const e = estimate({
      catalog_id: 'test_thing',
      quantity: { value: 1, unit: 'kg', source: 'user_entered' },
    }, t);
    // Upper fence clips the group spread at 300, but the headline is 900 — the
    // band has to reach it.
    expect(e.headline!.range_l).toEqual([100, 900]);
    expect(e.headline!.value_l).toBe(900);
  });
});

/* ---------------------------- E3 / E4 / E12 ---------------------------- */

describe('dataset-recommended typology values', () => {
  it.each([
    'better_typology', 'item_matching_typology', 'item_or_typology',
    'better_sub_typology',
  ])('follows suggested_value=%s even when uncertainty is low', (suggested) => {
    const t = synthetic({
      items: [item({ value_l_per_kg: 700, suggested_value: suggested, uncertainty: 'L' })],
      typologies: [typology({
        stats: stats({ n: 8, median: 200, min: 50, max: 400, q1: 100, q3: 300 }),
      })],
    });
    const e = estimate({
      catalog_id: 'test_thing',
      quantity: { value: 1, unit: 'kg', source: 'user_entered' },
    }, t);
    expect(e.headline!.value_l).toBe(200);
    expect(e.match_level).toBe('typology');
    expect(e.fallback_reason).toBe('dataset_recommends_typology');
  });

  it('still redirects a high-uncertainty item the dataset calls ok', () => {
    const t = synthetic({
      items: [item({ suggested_value: 'ok_item', uncertainty: 'H', value_l_per_kg: 700 })],
      typologies: [typology({
        stats: stats({ n: 8, median: 200, min: 50, max: 400, q1: 100, q3: 300 }),
      })],
    });
    const e = estimate({
      catalog_id: 'test_thing',
      quantity: { value: 1, unit: 'kg', source: 'user_entered' },
    }, t);
    expect(e.fallback_reason).toBe('high_item_uncertainty_typology');
    expect(e.headline!.value_l).toBe(200);
  });

  it('a one-study group is demoted exactly like a one-study item', () => {
    const e = estimate({
      // MARGARINE*: the group holds a single published value.
      catalog_id: 'generic_agricultural_processed_margarine',
      quantity: { value: 1, unit: 'kg', source: 'user_entered' },
    }, tables);
    expect(e.match_level).toBe('typology');
    expect(e.confidence).toBe('low');
    expect(e.fallback_reason).toBe('single_source');
    expect(e.headline!.range_l).toBeNull();
  });

  it('a liquid item borrows its group value per litre, not per kilogram', () => {
    const e = ask({ value: 0.125, unit: 'l' }, 'coffee_standard');
    expect(e.factor!.factor_id).toMatch(/^sel:typ:/);
    expect(e.factor!.functional_unit).toBe('l');
  });
});

/* ------------------------------ E6 ------------------------------------- */

describe('quantity source caps confidence', () => {
  it('a photo-estimated quantity caps at low', () => {
    const e = ask({ unit: 'l', source: 'vision_estimate' }, 'cow_milk');
    expect(e.confidence).toBe('low');
  });

  it('a labelled quantity does not cap', () => {
    const e = ask({ unit: 'l', source: 'package_label' }, 'cow_milk');
    expect(e.confidence).toBe('high');
  });

  it('an unrecognised source fails closed', () => {
    const e = estimate({
      catalog_id: 'cow_milk',
      quantity: { value: 1, unit: 'l', source: 'trust_me' as never },
    }, tables);
    expect(e.confidence).toBe('low');
    expect(e.assumptions.join(' ')).toMatch(/unrecognised/);
  });
});

/* ------------------------------ E7 ------------------------------------- */

describe('transport provenance', () => {
  it('names both halves of the composite factor', () => {
    const e = ask({ value: 10, unit: 'km' }, 'transport_petrol_car');
    expect(e.factor!.dataset).toBe('drop_transport');
    expect(e.factor!.dataset_release).toMatch(/USLCI FY2025 Q2/);
    expect(e.factor!.dataset_release).toMatch(/Wu, M\./);
    expect(e.factor!.functional_unit).toBe('l_water_per_pkm');
    expect(e.factor!.geography).toBe('US');
    expect(e.factor!.system_boundary).toMatch(/well-to-pump/);
  });

  it.each([
    ['metric_type', { metric_type: undefined }],
    ['functional_unit', { functional_unit: undefined }],
    ['geography', { geography: undefined }],
    ['provenance', { provenance: undefined }],
    ['confidence', { confidence: undefined }],
  ])('refuses a transport row with no %s', (missing, patch) => {
    const row: TransportFactor = {
      factor_id: 'drop:transport:test',
      mode: 'test',
      metric_type: 'freshwater_consumption',
      functional_unit: 'l_water_per_pkm',
      geography: 'US',
      system_boundary: 'fuel cycle only',
      value_l_per_pkm: 0.1,
      confidence: 'low',
      provenance: {
        activity: { dataset_release: 'USLCI test' },
        water_intensity: { citation: 'Someone (2009)' },
      },
      ...patch,
    };
    const t = synthetic({
      entries: [entryOf({
        catalog_id: 'test_transport',
        category: 'transport',
        factor_links: {
          primary: { factor_id: 'drop:transport:test', match_level: 'transport_mode' },
          typology: null, secondary: [], proxy: null, spend: null,
        },
      })],
      transport: [row],
    });
    expect(() => estimate({
      catalog_id: 'test_transport',
      quantity: { value: 10, unit: 'km', source: 'user_entered' },
    }, t)).toThrow(new RegExp(`no ${missing}`));
  });

  it('refuses a tonne-kilometre freight row wired to a per-km entry', () => {
    const t = synthetic({
      entries: [entryOf({
        catalog_id: 'test_freight',
        category: 'transport',
        factor_links: {
          primary: { factor_id: 'drop:transport:truck_tkm', match_level: 'transport_mode' },
          typology: null, secondary: [], proxy: null, spend: null,
        },
      })],
      transport: [{
        factor_id: 'drop:transport:truck_tkm',
        mode: 'truck_tkm',
        metric_type: 'freshwater_consumption',
        functional_unit: 'l_water_per_tkm',
        value_l_per_tkm: 0.11,
      }],
    });
    expect(() => estimate({
      catalog_id: 'test_freight',
      quantity: { value: 10, unit: 'km', source: 'user_entered' },
    }, t)).toThrow(/transport factor missing/);
  });
});

/* ------------------------------ E8 ------------------------------------- */

describe('secondary metrics', () => {
  it('falls back to the global line when the origin has no data of its own', () => {
    const e = estimate({
      catalog_id: 'banana',
      quantity: { value: 1, unit: 'kg', source: 'user_entered' },
      origin_country: 'KR',
    }, tables);
    const hestia = e.secondary.filter((s) => !s.proxy_metric);
    expect(hestia).toHaveLength(1);
    expect(hestia[0]!.geography).toBe('GLO');
    expect(hestia[0]!.label).toMatch(/global/);
    expect(e.assumptions.join(' ')).toMatch(/No country-specific .* for KR/);
  });

  it('uses the country line when the origin has data', () => {
    const e = estimate({
      catalog_id: 'banana',
      quantity: { value: 1, unit: 'kg', source: 'user_entered' },
      origin_country: 'EC',
    }, tables);
    expect(e.secondary.some((s) => s.geography === 'EC')).toBe(true);
    expect(e.assumptions.join(' ')).not.toMatch(/No country-specific/);
  });

  it('states the 1:1 reading when per-kilogram factors are applied to a drink', () => {
    const e = ask({ value: 1, unit: 'l' }, 'cow_milk');
    expect(e.secondary.length).toBeGreaterThan(0);
    expect(e.assumptions.join(' ')).toMatch(
      /Secondary factors are published per kilogram; mass and volume treated 1:1/,
    );
  });

  it('says nothing about density for a solid', () => {
    const e = ask({ value: 1, unit: 'kg' }, 'apple');
    expect(e.assumptions.join(' ')).not.toMatch(/Secondary factors are published/);
  });

  it('carries the row metric type onto the secondary line', () => {
    const e = ask({ value: 1, unit: 'kg' }, 'rice');
    for (const s of e.secondary) {
      expect(s.metric_type).toBe(s.factor.metric_type);
    }
  });
});

/* ------------------------------ E9 ------------------------------------- */

describe('kilogram / litre substitution', () => {
  it('caps confidence and names the substitution', () => {
    const e = ask({ value: 250, unit: 'ml' }, 'olive_oil');
    expect(e.quantity.unit).toBe('kg');
    expect(e.confidence).toBe('low');
    expect(e.fallback_reason).toBe('unit_substitution');
    expect(e.assumptions.join(' ')).toMatch(
      /given in litres but the factor is per kilogram/,
    );
  });

  it('applies to recipes too', () => {
    const e = ask({ value: 0.25, unit: 'l' }, 'cheeseburger');
    expect(e.confidence).toBe('low');
    expect(e.fallback_reason).toBe('unit_substitution');
  });

  it('leaves a matching unit alone', () => {
    const e = ask({ value: 0.25, unit: 'kg' }, 'olive_oil');
    expect(e.fallback_reason).not.toBe('unit_substitution');
  });
});

/* ------------------------------ E10 ------------------------------------ */

describe('statistical flags', () => {
  it('names the flag on a two-study item', () => {
    // Olive oil: n=2, normality flagged R.
    const e = ask({ value: 0.25, unit: 'kg' }, 'olive_oil');
    expect(e.confidence).toBe('medium');
    expect(e.fallback_reason).toBe('stat_flags');
  });

  it('demotes a flagged item that has plenty of studies', () => {
    const t = synthetic({
      items: [item({
        value_l_per_kg: 100,
        stats: stats({ n: 12, median: 100, min: 40, max: 300, q1: 80, q3: 160 }),
        flags: { size: 'G', outlier: 'R', normality: 'G' },
      })],
    });
    const e = estimate({
      catalog_id: 'test_thing',
      quantity: { value: 1, unit: 'kg', source: 'user_entered' },
    }, t);
    expect(e.confidence).toBe('medium');
    expect(e.fallback_reason).toBe('stat_flags');
    // The IQR is still the honest band for a well-sampled item.
    expect(e.headline!.range_l).toEqual([80, 160]);
  });

  it('leaves an unflagged item at high confidence', () => {
    const e = ask({ value: 1, unit: 'l' }, 'cow_milk');
    expect(e.confidence).toBe('high');
    expect(e.fallback_reason).toBeNull();
  });
});

/* ------------------------------ E11 ------------------------------------ */

describe('unsupported entries', () => {
  it.each(['km', 'item', 'g'] as const)('echoes the caller unit %s', (unit) => {
    const e = estimate({
      catalog_id: 'transport_ev_car',
      quantity: { value: 3, unit, source: 'user_entered' },
    }, tables);
    expect(e.headline).toBeNull();
    expect(e.quantity).toEqual({ value: 3, unit, source: 'user_entered' });
    expect(e.unsupported!.reason).toMatch(/grid water intensity/);
  });

  it('freight entries from the catalog say why, and give no number', () => {
    for (const id of [
      'transport_truck_tkm', 'transport_rail_freight_tkm', 'transport_air_freight_tkm',
    ]) {
      const e = estimate({
        catalog_id: id,
        quantity: { value: 10, unit: 'km', source: 'user_entered' },
      }, tables);
      expect(e.headline).toBeNull();
      expect(e.unsupported!.reason).toMatch(/tonne-kilometre/);
    }
  });
});

/* ------------------------------ E13 ------------------------------------ */

describe('typology names in assumptions', () => {
  it('drops the bookkeeping marks', () => {
    const e = ask({ value: 1, unit: 'l' }, 'generic_agricultural_processed_vegetal_milk');
    const text = e.assumptions.join(' ');
    // Raw name is 'VEGETAL MILK* (Soy milk)'.
    expect(text).toMatch(/vegetal milk/);
    expect(text).not.toMatch(/\*/);
    expect(text).not.toMatch(/\(Soy milk\)/i);
  });

  it('keeps the marks out of a redirected item assumption', () => {
    const e = ask({ value: 1, unit: 'kg' }, 'beef_bone_free_meat');
    const text = e.assumptions.join(' ');
    expect(text).toMatch(/beef bone free meat group median/);
    expect(text).not.toMatch(/\*/);
  });
});

/* --------------------------- whole catalog ----------------------------- */

describe('every catalog entry', () => {
  it('either produces finite numbers or says it is unsupported', () => {
    for (const entry of raw.catalog.entries) {
      const unit = entry.category === 'transport' ? 'km'
        : entry.category === 'product' ? 'usd'
          : entry.state === 'liquid' ? 'l' : 'kg';
      const e = estimate({
        catalog_id: entry.catalog_id,
        quantity: { value: 1, unit, source: 'user_entered' },
      }, tables);
      if (e.unsupported) {
        expect(e.headline).toBeNull();
        expect(e.unsupported.reason.length).toBeGreaterThan(0);
        continue;
      }
      expect(Number.isFinite(e.headline!.value_l)).toBe(true);
      if (e.headline!.range_l) {
        const [lo, hi] = e.headline!.range_l;
        expect(Number.isFinite(lo)).toBe(true);
        expect(Number.isFinite(hi)).toBe(true);
        expect(hi).toBeGreaterThan(lo);
        expect(lo).toBeLessThanOrEqual(e.headline!.value_l);
        expect(hi).toBeGreaterThanOrEqual(e.headline!.value_l);
      }
      for (const s of e.secondary) {
        expect(Number.isFinite(s.value_l)).toBe(true);
      }
    }
  });
});
