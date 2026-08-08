/** Benchmark regression suite — protects the product's honesty claims.
 * Values anchored to literature (Mekonnen & Hoekstra, WFN, King & Webber). */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildTables, estimate, assertMetricType } from '../src/index';
import type { RawTables } from '../src/index';

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

describe('food benchmarks', () => {
  // The dataset's `Suggested WF value` column reads "item matching typology"
  // for beef: the item and its group are the same 25 studies, and the group is
  // the figure the dataset asks us to publish. Same litres, same IQR, but the
  // match level and confidence say where the number came from.
  it('1 kg boneless beef: 15,139 L from the group the dataset points at', () => {
    const e = estimate({
      catalog_id: 'beef_bone_free_meat',
      quantity: { value: 1, unit: 'kg', source: 'user_entered' },
    }, tables);
    expect(e.headline!.value_l).toBeCloseTo(15139, 0);
    expect(e.headline!.metric_type).toBe('total_water_footprint');
    expect(e.match_level).toBe('typology');
    expect(e.fallback_reason).toBe('dataset_recommends_typology');
    expect(e.confidence).toBe('medium');
    expect(e.headline!.range_l).toEqual([13089, 20852]);
  });

  it('1 kg chocolate (n=1): honest low confidence with borrowed range', () => {
    const e = estimate({
      catalog_id: 'chocolate',
      quantity: { value: 1, unit: 'kg', source: 'user_entered' },
    }, tables);
    expect(e.headline!.value_l).toBeCloseTo(17196, 0);
    expect(e.confidence).toBe('low');
    expect(e.fallback_reason).toBe('single_source');
  });

  it('150 g apple: ≈93 L', () => {
    const e = estimate({
      catalog_id: 'apple',
      quantity: { value: 150, unit: 'g', source: 'user_entered' },
    }, tables);
    expect(e.headline!.value_l).toBeGreaterThan(80);
    expect(e.headline!.value_l).toBeLessThan(130);
  });

  it('1 L milk: 1,260 L', () => {
    const e = estimate({
      catalog_id: 'cow_milk',
      quantity: { value: 1, unit: 'l', source: 'user_entered' },
    }, tables);
    expect(e.headline!.value_l).toBeGreaterThan(900);
    expect(e.headline!.value_l).toBeLessThan(1700);
  });

  it('125 ml coffee redirects to the liquid typology the dataset recommends (~120 L)', () => {
    const e = estimate({
      catalog_id: 'coffee_standard',
      quantity: { value: 125, unit: 'ml', source: 'user_entered' },
    }, tables);
    expect(e.headline!.value_l).toBeGreaterThan(90);
    expect(e.headline!.value_l).toBeLessThan(160);
    expect(e.match_level).toBe('typology');
    // `Suggested WF value` = "better typology" for this item, so the dataset's
    // own recommendation is the reason, not the uncertainty flag.
    expect(e.fallback_reason).toBe('dataset_recommends_typology');
    // The item is measured per litre of drink, so the group value it borrows
    // is per litre too.
    expect(e.factor!.functional_unit).toBe('l');
  });

  it('cheeseburger (250 g recipe): 1,500–4,000 L, confidence capped at medium', () => {
    const e = estimate({
      catalog_id: 'cheeseburger',
      quantity: { value: 0.25, unit: 'kg', source: 'user_entered' },
    }, tables);
    expect(e.match_level).toBe('recipe_sum');
    expect(e.headline!.value_l).toBeGreaterThan(1500);
    expect(e.headline!.value_l).toBeLessThan(4000);
    expect(['medium', 'low', 'very_low']).toContain(e.confidence);
  });

  // water_logic/README.md: "Low: global category, estimated serving size, or
  // incomplete origin." A guessed serving size is a low-confidence estimate.
  it('default-quantity estimates cap confidence at low', () => {
    const e = estimate({
      catalog_id: 'apple',
      quantity: { value: 1, unit: 'item', source: 'catalog_default' },
    }, tables);
    expect(e.confidence).toBe('low');
    expect(e.assumptions.join(' ')).toMatch(/typical serving size/);
  });

  it('FNDDS supplies the portion while SU-EATABLE supplies a category factor', () => {
    const entry = tables.catalog.get('fndds_11111000')!;
    expect(entry.catalog_source?.dataset).toBe('usda_fndds');
    expect(entry.default_quantity).toEqual({
      value: 0.244,
      unit: 'l',
      basis: 'FNDDS: 1 cup',
    });

    const e = estimate({
      catalog_id: entry.catalog_id,
      quantity: { value: 1, unit: 'item', source: 'catalog_default' },
    }, tables);
    expect(e.match_level).toBe('category_match');
    expect(e.factor?.dataset).toBe('su_eatable_life');
    expect(e.quantity).toMatchObject({ value: 0.244, unit: 'l' });
    expect(e.assumptions.join(' ')).toMatch(/food category/i);
  });
});

describe('transport benchmarks', () => {
  it('10 km petrol drive: 1–25 L consumptive, low confidence, with range', () => {
    const e = estimate({
      catalog_id: 'transport_petrol_car',
      quantity: { value: 10, unit: 'km', source: 'user_entered' },
    }, tables);
    expect(e.headline!.metric_type).toBe('freshwater_consumption');
    expect(e.headline!.value_l).toBeGreaterThan(1);
    expect(e.headline!.value_l).toBeLessThan(25);
    expect(e.confidence).toBe('low');
    expect(e.headline!.range_l).not.toBeNull();
    expect(e.assumptions.join(' ')).toMatch(/fuel/i);
  });

  it('EV drive is unsupported with a stated reason, never a number', () => {
    const e = estimate({
      catalog_id: 'transport_ev_car',
      quantity: { value: 10, unit: 'km', source: 'user_entered' },
    }, tables);
    expect(e.unsupported).not.toBeNull();
    expect(e.headline).toBeNull();
  });
});

describe('everyday products', () => {
  it('$20 of clothing: spend proxy, very low confidence, labelled withdrawal', () => {
    const e = estimate({
      catalog_id: 'product_315000',
      quantity: { value: 20, unit: 'usd', source: 'user_entered' },
    }, tables);
    expect(e.headline!.metric_type).toBe('freshwater_withdrawal');
    expect(e.headline!.proxy_metric).toBe(true);
    expect(e.confidence).toBe('very_low');
    expect(e.headline!.value_l).toBeGreaterThan(100);
    expect(e.headline!.value_l).toBeLessThan(900);
    // USEEIO publishes a sector mean and no spread; a band here would be made up.
    expect(e.headline!.range_l).toBeNull();
  });
});

describe('metric-type guard', () => {
  it('refuses to mix withdrawal into a total-footprint sum', () => {
    expect(() => assertMetricType('total_water_footprint', {
      factor_id: 'owid:beef_beef_herd',
      dataset: 'owid_poore_nemecek',
      dataset_release: 'x',
      geography: 'GLO',
      system_boundary: null,
      functional_unit: 'kg',
      metric_type: 'freshwater_withdrawal',
    })).toThrow(/metric type mismatch/);
  });

  it('OWID appears only as a labelled proxy secondary line', () => {
    const e = estimate({
      catalog_id: 'beef_bone_free_meat',
      quantity: { value: 1, unit: 'kg', source: 'user_entered' },
    }, tables);
    const proxies = e.secondary.filter((s) => s.proxy_metric);
    for (const p of proxies) {
      expect(p.metric_type).toBe('freshwater_withdrawal');
    }
    expect(e.headline!.metric_type).toBe('total_water_footprint');
  });
});

describe('estimate integrity', () => {
  it('every estimate carries factor provenance and factors_version', () => {
    const e = estimate({
      catalog_id: 'rice',
      quantity: { value: 100, unit: 'g', source: 'user_entered' },
    }, tables);
    expect(e.factors_version).toBe('2026.08.2');
    expect(e.factor?.dataset).toBe('su_eatable_life');
    expect(e.factor?.dataset_release).toMatch(/Petersson/);
  });
});
