import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { buildTables, estimate } from '../src/index';
import type { RawTables } from '../src/index';

const dataDir = join(process.cwd(), '..', 'factors', 'data', '2026.08.2');
const load = (name: string) => JSON.parse(readFileSync(join(dataDir, name), 'utf-8'));
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

describe('oil density claim', () => {
  it('olive_oil in ml converts 1:1 to kg', () => {
    const r = estimate({ catalog_id: 'olive_oil', quantity: { value: 250, unit: 'ml', source: 'user_entered' } }, tables);
    console.log('olive_oil ml->kg quantity', JSON.stringify(r.quantity));
    console.log('assumptions', JSON.stringify(r.assumptions));
    console.log('headline', JSON.stringify(r.headline));
  });
  it('olive_oil in kg (no conversion) for comparison', () => {
    const r = estimate({ catalog_id: 'olive_oil', quantity: { value: 0.25, unit: 'kg', source: 'user_entered' } }, tables);
    console.log('olive_oil kg quantity', JSON.stringify(r.quantity));
    console.log('assumptions', JSON.stringify(r.assumptions));
    console.log('headline', JSON.stringify(r.headline));
  });
  it('cheeseburger with l unit as claimed', () => {
    const r = estimate({ catalog_id: 'cheeseburger', quantity: { value: 0.25, unit: 'l', source: 'user_entered' } }, tables);
    console.log('cheeseburger l quantity', JSON.stringify(r.quantity));
    console.log('assumptions', JSON.stringify(r.assumptions));
    console.log('headline', JSON.stringify(r.headline));
  });
  it('cheeseburger with kg unit for comparison', () => {
    const r = estimate({ catalog_id: 'cheeseburger', quantity: { value: 0.25, unit: 'kg', source: 'user_entered' } }, tables);
    console.log('cheeseburger kg quantity', JSON.stringify(r.quantity));
    console.log('assumptions', JSON.stringify(r.assumptions));
    console.log('headline', JSON.stringify(r.headline));
  });
});
