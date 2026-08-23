/**
 * The one active factor-table set.
 *
 * Drop estimates offline: the versioned JSON tables ship inside the bundle
 * (Metro treats `.json` as a module, so these are plain imports) and the engine
 * builds its lookup Maps from them on first use. A network round trip is a
 * refresh path, never a prerequisite.
 *
 * The bundle is always the process-safe starting point. A downloaded release
 * can replace it only after startup has re-read and revalidated the complete
 * staged set. The exported bindings and memoized engine tables switch together
 * in one synchronous turn, so callers can observe the old release or the new
 * one, never a mixture.
 */
import { buildTables, type RawTables, type Tables } from '@drop/water-engine';

import catalogJson from './seed/catalog.json';
import foodHestiaJson from './seed/food_hestia_country.json';
import foodOwidJson from './seed/food_owid_proxy.json';
import foodSueatableJson from './seed/food_sueatable.json';
import manifestJson from './seed/manifest.json';
import sectorUseeioJson from './seed/sector_useeio.json';
import transportJson from './seed/transport_factors.json';
import {
  activeFactorReleaseVersion,
  clearActiveFactorRelease,
  readFactorRelease,
  setActiveFactorRelease,
} from './db';
import {
  RELEASE_FILES,
  compareFactorVersions,
  validateFactorRelease,
} from './factorRelease';

/** The release that is guaranteed to exist even with no database or network. */
export const BUNDLED_FACTORS_VERSION: string = (manifestJson as { version: string }).version;

const bundledRawTables: RawTables = {
  manifest: manifestJson as RawTables['manifest'],
  catalog: catalogJson as unknown as RawTables['catalog'],
  food_sueatable: foodSueatableJson as unknown as RawTables['food_sueatable'],
  food_hestia_country: foodHestiaJson as unknown as RawTables['food_hestia_country'],
  food_owid_proxy: foodOwidJson as unknown as RawTables['food_owid_proxy'],
  transport_factors: transportJson as unknown as RawTables['transport_factors'],
  sector_useeio: sectorUseeioJson as unknown as RawTables['sector_useeio'],
};

/** Live bindings for attribution, catalog seeding, and estimate snapshots. */
export let FACTORS_VERSION: string = BUNDLED_FACTORS_VERSION;
export let rawTables: RawTables = bundledRawTables;

let built: Tables | null = null;
let initialization: Promise<string> | null = null;
const versionListeners = new Set<() => void>();

function publishVersion(previous: string): void {
  if (previous !== FACTORS_VERSION) versionListeners.forEach((listener) => listener());
}

function applyRelease(version: string, raw: RawTables, tables: Tables): void {
  const previous = FACTORS_VERSION;
  FACTORS_VERSION = version;
  rawTables = raw;
  built = tables;
  publishVersion(previous);
}

function applyBundle(): void {
  const previous = FACTORS_VERSION;
  FACTORS_VERSION = BUNDLED_FACTORS_VERSION;
  rawTables = bundledRawTables;
  built = null;
  publishVersion(previous);
}

/** React-compatible external-store surface for attribution/version UI. */
export function getFactorsVersion(): string {
  return FACTORS_VERSION;
}

export function subscribeFactorsVersion(listener: () => void): () => void {
  versionListeners.add(listener);
  return () => versionListeners.delete(listener);
}

/** Memoized engine tables. Safe to call on every render. */
export function getTables(): Tables {
  if (!built) built = buildTables(rawTables);
  return built;
}

/**
 * Revalidate and activate one complete staged release. The engine tables are
 * built before the durable pointer changes, so a validation/build failure
 * leaves both disk and memory on the previous release.
 */
export async function activateFactorRelease(version: string): Promise<string> {
  if (compareFactorVersions(version, FACTORS_VERSION) <= 0) {
    throw new Error(`factor release ${version} is not newer than ${FACTORS_VERSION}`);
  }
  const stored = await readFactorRelease(version);
  if (!stored) throw new Error(`factor release ${version} is not staged`);
  const validated = await validateFactorRelease(
    stored.manifestText,
    stored.files as Partial<Record<(typeof RELEASE_FILES)[number], string>>,
  );
  if (validated.manifest.version !== version) {
    throw new Error('staged factor release identity changed');
  }

  await setActiveFactorRelease(version);
  applyRelease(version, validated.raw, validated.tables);
  return version;
}

/**
 * Restore the durable active release after a process restart. Any missing,
 * corrupt, or newly incompatible cache is rolled back to the bundle and its
 * bad pointer is removed so subsequent calculations stay deterministic.
 */
export function initializeFactorTables(): Promise<string> {
  if (initialization) return initialization;
  initialization = (async () => {
    const active = await activeFactorReleaseVersion();
    if (!active) return FACTORS_VERSION;
    try {
      if (compareFactorVersions(active, BUNDLED_FACTORS_VERSION) <= 0) {
        await clearActiveFactorRelease();
        applyBundle();
        return FACTORS_VERSION;
      }
      return await activateFactorRelease(active);
    } catch {
      await clearActiveFactorRelease();
      applyBundle();
      return FACTORS_VERSION;
    }
  })().catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}

/** Test-only process restart: durable rows remain, in-memory state does not. */
export function resetFactorTablesForTests(): void {
  initialization = null;
  applyBundle();
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
