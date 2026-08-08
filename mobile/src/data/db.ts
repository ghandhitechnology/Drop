/**
 * The single SQLite connection for the app.
 *
 * Opened once, lazily, and shared. WAL is switched on before any migration
 * runs so readers never block behind the writer — the history list keeps
 * rendering while a confirmed entry is being committed.
 */
import * as SQLite from 'expo-sqlite';

import { migrate } from './schema';

export const DATABASE_NAME = 'drop.db';

let handle: Promise<SQLite.SQLiteDatabase> | null = null;

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  // journal_mode has to be set outside a transaction, hence before migrate().
  // synchronous=NORMAL is the documented safe pairing with WAL: durable across
  // an app crash, and one fsync per checkpoint rather than one per commit.
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `);
  await migrate(db);
  return db;
}

/** The shared connection, migrated and ready. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!handle) {
    handle = open().catch((error) => {
      handle = null;
      throw error;
    });
  }
  return handle;
}

/** Journal mode actually in force — surfaced by the data lab as proof of WAL. */
export async function journalMode(): Promise<string> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
  return row?.journal_mode ?? 'unknown';
}

export async function schemaVersion(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/* ------------------------------------------------------------------ kv ---- */

export async function kvGet(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM kv WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    Date.now(),
  );
}

/* -------------------------------------------------------- factors cache --- */

export type CachedFactors = { payload: unknown; fetchedAt: number };

export async function factorsCacheGet(key: string): Promise<CachedFactors | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ payload_json: string; fetched_at: number }>(
    'SELECT payload_json, fetched_at FROM factors_cache WHERE key = ?',
    key,
  );
  if (!row) return null;
  return { payload: JSON.parse(row.payload_json), fetchedAt: row.fetched_at };
}

export async function factorsCachePut(key: string, payload: unknown): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO factors_cache (key, payload_json, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET payload_json = excluded.payload_json,
                                    fetched_at   = excluded.fetched_at`,
    key,
    JSON.stringify(payload),
    Date.now(),
  );
}

/* ------------------------------------------------------------ dev only ---- */

/**
 * Drops every row and reopens. Used by the data lab to get back to a clean
 * slate; the schema itself is left in place.
 */
export async function clearAllData(): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.execAsync(`
      DELETE FROM entries;
      DELETE FROM daily_totals;
      DELETE FROM catalog_items;
      DELETE FROM factors_cache;
      DELETE FROM kv;
    `);
  });
}
