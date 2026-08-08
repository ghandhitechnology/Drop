/** Loads the versioned factor tables once at boot and exposes them to
 * routes plus the shared water engine. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTables } from '@drop/water-engine';
import type { RawTables, Tables } from '@drop/water-engine';

export const FACTORS_VERSION = '2026.08.1';

const dataDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'packages', 'factors', 'data', FACTORS_VERSION,
);

const readJson = (name: string) =>
  JSON.parse(readFileSync(join(dataDir, name), 'utf-8'));

export const TABLE_NAMES = [
  'food_sueatable', 'food_hestia_country', 'food_owid_proxy',
  'transport_factors', 'sector_useeio',
] as const;

export const raw: RawTables = {
  manifest: readJson('manifest.json'),
  catalog: readJson('catalog.json'),
  food_sueatable: readJson('food_sueatable.json'),
  food_hestia_country: readJson('food_hestia_country.json'),
  food_owid_proxy: readJson('food_owid_proxy.json'),
  transport_factors: readJson('transport_factors.json'),
  sector_useeio: readJson('sector_useeio.json'),
};

export const tables: Tables = buildTables(raw);

export const catalogPrompt = readFileSync(
  join(dataDir, 'catalog.prompt.txt'), 'utf-8',
);

export function rawTable(name: string): unknown | null {
  if (!(TABLE_NAMES as readonly string[]).includes(name)) return null;
  return (raw as unknown as Record<string, unknown>)[name];
}
