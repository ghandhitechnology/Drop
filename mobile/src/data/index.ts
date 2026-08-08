/** Public surface of the local data layer. */

export {
  DATABASE_NAME,
  clearAllData,
  factorsCacheGet,
  factorsCachePut,
  getDb,
  journalMode,
  kvGet,
  kvSet,
  schemaVersion,
  type CachedFactors,
} from './db';

export { MIGRATIONS, SCHEMA_VERSION, migrate, type Migration } from './schema';

export {
  getCatalogItem,
  loadCatalogItems,
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

export { FACTORS_VERSION, getTables, rawTables, tableSizes } from './tables';

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
