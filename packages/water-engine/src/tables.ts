import type {
  CatalogEntry, HestiaFactor, OwidFactor, SelItem, SelTypology, Tables,
  TransportFactor, UseeioSector,
} from './types';

/** Raw JSON payloads exactly as the pipeline emits them. */
export interface RawTables {
  manifest: { version: string };
  catalog: { catalog_version: string; entries: CatalogEntry[] };
  food_sueatable: {
    food_items: SelItem[];
    food_typologies: SelTypology[];
  };
  food_hestia_country: { hestia_factors: HestiaFactor[] };
  food_owid_proxy: { owid_factors: OwidFactor[] };
  transport_factors: { transport_factors: TransportFactor[] };
  sector_useeio: { useeio_sectors: UseeioSector[] };
}

export function buildTables(raw: RawTables): Tables {
  const byId = <T extends { factor_id?: string }>(rows: T[]) => {
    const m = new Map<string, T>();
    for (const r of rows) if (r.factor_id) m.set(r.factor_id, r);
    return m;
  };
  const catalog = new Map<string, CatalogEntry>();
  for (const e of raw.catalog.entries) catalog.set(e.catalog_id, e);

  const transport = new Map<string, TransportFactor>();
  for (const t of raw.transport_factors.transport_factors) {
    transport.set(t.factor_id ?? `unsupported:${t.mode}`, t);
  }

  return {
    version: raw.catalog.catalog_version,
    catalog,
    selItems: byId(raw.food_sueatable.food_items),
    selTypologies: byId(raw.food_sueatable.food_typologies),
    hestia: byId(raw.food_hestia_country.hestia_factors),
    owid: byId(raw.food_owid_proxy.owid_factors),
    transport,
    useeio: byId(raw.sector_useeio.useeio_sectors),
  };
}
