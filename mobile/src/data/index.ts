/** Public surface of the local data layer. */

export {
  DATABASE_NAME,
  clearAllData,
  factorsCacheGet,
  factorsCachePut,
  activeFactorReleaseVersion,
  clearActiveFactorRelease,
  getDb,
  journalMode,
  kvGet,
  kvSet,
  readFactorRelease,
  schemaVersion,
  setActiveFactorRelease,
  stageFactorRelease,
  type CachedFactors,
  type StoredFactorRelease,
} from './db';

export { MIGRATIONS, SCHEMA_VERSION, migrate, type Migration } from './schema';

export {
  getCatalogItem,
  loadCatalogItems,
  activeCatalogItems,
  rowToItem,
  seedCatalogItems,
  toCatalogItemRow,
} from './catalog';

export {
  catalogItems,
  hydrateCatalog,
  useCatalogStore,
  type CatalogStatus,
} from './catalogStore';

export {
  dayTotal,
  entryCounts,
  getEntry,
  insertConfirmed,
  insertPlate,
  listByDay,
  listRecent,
  newEntryId,
  softDelete,
  todayTotal,
  trends,
  undoDelete,
  type EntryMeta,
} from './entries';

export {
  PLATE_ITEM_ID,
  buildPlateEstimate,
  isPlate,
  plateLabel,
  type PlateEstimate,
} from './plate';

export {
  DEFAULT_SEARCH_LIMIT,
  MATCH_TIER,
  lengthFactor,
  normalizeForSearch,
  scoreItem,
  searchCatalog,
  tierScore,
  type MatchTier,
  type SearchHit,
} from './search';

export {
  BUNDLED_FACTORS_VERSION,
  FACTORS_VERSION,
  activateFactorRelease,
  getFactorsVersion,
  getTables,
  initializeFactorTables,
  rawTables,
  subscribeFactorsVersion,
  tableSizes,
} from './tables';

export type {
  CatalogItem,
  CatalogItemRow,
  DailyTotal,
  DailyTotalRow,
  Entry,
  EntryCategory,
  EntryRow,
  InputMethod,
} from './types';
