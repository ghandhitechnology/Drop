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

describe('repro', () => {
  it('banana with/without origin', () => {
    const catalogEntries = raw.catalog.entries.filter((e: any) => /banana/i.test(e.catalog_id) || /banana/i.test(e.display_name));
    console.log('banana catalog entries', catalogEntries.map((e:any)=>e.catalog_id));
    const first = catalogEntries[0];
    if (!first) throw new Error('no banana entry in the catalog');
    const id = first.catalog_id;
    const noOrigin = estimate({ catalog_id: id, quantity: { value: 1, unit: 'kg', source: 'user_entered' } }, tables);
    const withOrigin = estimate({ catalog_id: id, quantity: { value: 1, unit: 'kg', source: 'user_entered' }, origin_country: 'EC' }, tables);
    console.log('headline no origin', noOrigin.headline);
    console.log('headline with origin EC', withOrigin.headline);
    console.log('secondary no origin', JSON.stringify(noOrigin.secondary));
    console.log('secondary with origin EC', JSON.stringify(withOrigin.secondary));
  });
});
