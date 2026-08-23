/** Loads the versioned factor tables once at boot and exposes them to
 * routes plus the shared water engine. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTables } from '@drop/water-engine';
import type { RawTables, Tables } from '@drop/water-engine';

export const FACTORS_VERSION = '2026.08.2';

const dataDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'packages', 'factors', 'data', FACTORS_VERSION,
);

const readText = (name: string) => readFileSync(join(dataDir, name), 'utf-8');
const readJson = (name: string) => JSON.parse(readText(name));

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

/**
 * Exact generated release bytes. The manifest hashes these bytes, so factor
 * download routes must serve them verbatim instead of reserializing `raw`.
 */
export const rawText = {
  manifest: readText('manifest.json'),
  catalog: readText('catalog.json'),
  food_sueatable: readText('food_sueatable.json'),
  food_hestia_country: readText('food_hestia_country.json'),
  food_owid_proxy: readText('food_owid_proxy.json'),
  transport_factors: readText('transport_factors.json'),
  sector_useeio: readText('sector_useeio.json'),
} as const;

export const tables: Tables = buildTables(raw);

export const catalogPrompt = readFileSync(
  join(dataDir, 'catalog.prompt.txt'), 'utf-8',
);

export function rawTableText(name: string): string | null {
  if (!(TABLE_NAMES as readonly string[]).includes(name)) return null;
  return rawText[name as keyof typeof rawText];
}
