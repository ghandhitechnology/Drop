/**
 * The factor tables, bundled with the app.
 *
 * Drop estimates offline: the versioned JSON tables ship inside the bundle
 * (Metro treats `.json` as a module, so these are plain imports) and the engine
 * builds its lookup Maps from them on first use. A network round trip is a
 * refresh path, never a prerequisite.
 *
 * `buildTables` walks ~2,400 rows, so the result is memoized and every caller
 * shares one instance.
 */
import { buildTables, type RawTables, type Tables } from '@drop/water-engine';

import catalogJson from './seed/catalog.json';
import foodHestiaJson from './seed/food_hestia_country.json';
import foodOwidJson from './seed/food_owid_proxy.json';
import foodSueatableJson from './seed/food_sueatable.json';
import manifestJson from './seed/manifest.json';
import sectorUseeioJson from './seed/sector_useeio.json';
import transportJson from './seed/transport_factors.json';

/** The pipeline release these tables came from. */
export const FACTORS_VERSION: string = (manifestJson as { version: string }).version;

export const rawTables: RawTables = {
  manifest: manifestJson as RawTables['manifest'],
  catalog: catalogJson as unknown as RawTables['catalog'],
  food_sueatable: foodSueatableJson as unknown as RawTables['food_sueatable'],
  food_hestia_country: foodHestiaJson as unknown as RawTables['food_hestia_country'],
  food_owid_proxy: foodOwidJson as unknown as RawTables['food_owid_proxy'],
  transport_factors: transportJson as unknown as RawTables['transport_factors'],
  sector_useeio: sectorUseeioJson as unknown as RawTables['sector_useeio'],
};

let built: Tables | null = null;

/** Memoized engine tables. Safe to call on every render. */
export function getTables(): Tables {
  if (!built) built = buildTables(rawTables);
  return built;
}

/** Row counts, for the data lab's readout. */
export function tableSizes(): Record<string, number> {
  const t = getTables();
  return {
    catalog: t.catalog.size,
    selItems: t.selItems.size,
    selTypologies: t.selTypologies.size,
    hestia: t.hestia.size,
    owid: t.owid.size,
    transport: t.transport.size,
    useeio: t.useeio.size,
  };
}
