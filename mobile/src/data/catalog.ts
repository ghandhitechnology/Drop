/**
 * The searchable catalog: bundled JSON in, `catalog_items` rows out, then a
 * single in-memory array for search.
 *
 * The table is rebuilt whenever the bundled factors version changes, so an app
 * update that ships new items replaces them wholesale on first launch and every
 * launch after that is a plain read.
 */
import type { CatalogEntry } from '@drop/water-engine';

import { getDb, kvGet, kvSet } from './db';
import { normalizeForSearch } from './search';
import { FACTORS_VERSION, rawTables } from './tables';
import type { CatalogItem, CatalogItemRow, EntryCategory } from './types';

const SEEDED_VERSION_KEY = 'catalog_items.seeded_version';

/** Food and drink lead, since that is what people log most. */
const CATEGORY_RANK: Record<EntryCategory, number> = {
  food: 0,
  drink: 1,
  transport: 2,
  product: 3,
};

/** The pipeline emits a `subcategory` the engine's type does not model. */
type SeedEntry = CatalogEntry & { subcategory?: string };

function typologyOf(entry: SeedEntry): string | null {
  if (entry.subcategory) return entry.subcategory;
  const linked = entry.factor_links.typology?.factor_id;
  if (!linked) return null;
  return linked.replace(/^sel:typ:/, '').replace(/__/g, '/');
}

/** Unique words, so the blob stays short enough to scan a thousand per keystroke. */
function blobOf(entry: SeedEntry): string {
  const parts = [entry.display_name, ...entry.synonyms, entry.search_tokens ?? ''];
  const seen = new Set<string>();
  const words: string[] = [];
  for (const word of normalizeForSearch(parts.join(' ')).split(' ')) {
    if (!word || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
  }
  return words.join(' ');
}

export function toCatalogItemRow(entry: SeedEntry): CatalogItemRow {
  const label = entry.display_name;
  return {
    id: entry.catalog_id,
    label,
    aliases: JSON.stringify(entry.synonyms ?? []),
    category: entry.category,
    default_unit: entry.default_quantity.unit,
    default_quantity: entry.default_quantity.value,
    typology: typologyOf(entry),
    search_blob: blobOf(entry),
    sort_rank: CATEGORY_RANK[entry.category] * 1000 + Math.min(999, label.length),
  };
}

function rowToItem(row: CatalogItemRow): CatalogItem {
  let aliases: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.aliases);
    if (Array.isArray(parsed)) aliases = parsed.filter((a): a is string => typeof a === 'string');
  } catch {
    aliases = [];
  }
  return {
    id: row.id,
    label: row.label,
    aliases,
    category: row.category,
    defaultUnit: row.default_unit,
    defaultQuantity: row.default_quantity,
    typology: row.typology,
    searchBlob: row.search_blob,
    normalizedLabel: normalizeForSearch(row.label),
    normalizedAliases: aliases.map(normalizeForSearch),
    sortRank: row.sort_rank,
  };
}

/**
 * Fills `catalog_items` from the bundle when the stored version differs from
 * the bundled one. Returns the number of rows now in the table.
 */
export async function seedCatalogItems(force = false): Promise<number> {
  const db = await getDb();
  const seeded = await kvGet(SEEDED_VERSION_KEY);
  const entries = rawTables.catalog.entries as SeedEntry[];

  if (!force && seeded === FACTORS_VERSION) {
    const existing = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM catalog_items',
    );
    // The row count is checked as well as the version: a table regenerated
    // under the same version string still reseeds.
    if ((existing?.n ?? 0) === entries.length) return existing!.n;
  }

  const rows = entries.map(toCatalogItemRow);

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.execAsync('DELETE FROM catalog_items');
    const statement = await tx.prepareAsync(
      `INSERT INTO catalog_items
         (id, label, aliases, category, default_unit, default_quantity,
          typology, search_blob, sort_rank)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    try {
      for (const row of rows) {
        await statement.executeAsync([
          row.id,
          row.label,
          row.aliases,
          row.category,
          row.default_unit,
          row.default_quantity,
          row.typology,
          row.search_blob,
          row.sort_rank,
        ]);
      }
    } finally {
      await statement.finalizeAsync();
    }
  });

  await kvSet(SEEDED_VERSION_KEY, FACTORS_VERSION);
  return rows.length;
}

/** Every catalog item, ordered the way a browse list wants them. */
export async function loadCatalogItems(): Promise<CatalogItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CatalogItemRow>(
    'SELECT * FROM catalog_items ORDER BY sort_rank ASC, label ASC',
  );
  return rows.map(rowToItem);
}

export async function getCatalogItem(id: string): Promise<CatalogItem | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CatalogItemRow>(
    'SELECT * FROM catalog_items WHERE id = ?',
    id,
  );
  return row ? rowToItem(row) : null;
}
