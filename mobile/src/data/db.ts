/**
 * The single SQLite connection for the app.
 *
 * Opened once, lazily, and shared. WAL is switched on before any migration
 * runs so readers never block behind the writer — the history list keeps
 * rendering while a confirmed entry is being committed.
 */
import * as SQLite from 'expo-sqlite';

import { migrate } from './schema';

const ACTIVE_FACTORS_KEY = 'factors.active_version';

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

/* ----------------------------------------------------- factor releases --- */

export type StoredFactorRelease = {
  version: string;
  manifestText: string;
  files: Record<string, string>;
};

/**
 * Persist a complete, already validated release in one transaction. A crash
 * before commit leaves no release row and therefore nothing activatable.
 */
export async function stageFactorRelease(
  release: StoredFactorRelease,
  metadata: Record<string, { sha256: string; bytes: number }>,
  now = Date.now(),
): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM factor_releases WHERE version = ?', release.version);
    await tx.runAsync(
      'INSERT INTO factor_releases (version, manifest_json, staged_at) VALUES (?, ?, ?)',
      release.version,
      release.manifestText,
      now,
    );
    const statement = await tx.prepareAsync(
      `INSERT INTO factor_release_files
         (version, path, payload_text, sha256, bytes, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    try {
      for (const [path, payload] of Object.entries(release.files)) {
        const file = metadata[path];
        if (!file) throw new Error(`missing staged metadata for ${path}`);
        await statement.executeAsync([
          release.version,
          path,
          payload,
          file.sha256,
          file.bytes,
          now,
        ]);
      }
    } finally {
      await statement.finalizeAsync();
    }
  });
}

export async function readFactorRelease(version: string): Promise<StoredFactorRelease | null> {
  const db = await getDb();
  const release = await db.getFirstAsync<{ manifest_json: string }>(
    'SELECT manifest_json FROM factor_releases WHERE version = ?',
    version,
  );
  if (!release) return null;
  const rows = await db.getAllAsync<{ path: string; payload_text: string }>(
    'SELECT path, payload_text FROM factor_release_files WHERE version = ? ORDER BY path',
    version,
  );
  return {
    version,
    manifestText: release.manifest_json,
    files: Object.fromEntries(rows.map((row) => [row.path, row.payload_text])),
  };
}

export async function activeFactorReleaseVersion(): Promise<string | null> {
  return kvGet(ACTIVE_FACTORS_KEY);
}

/** Switch the durable pointer only if its complete release row still exists. */
export async function setActiveFactorRelease(version: string): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const release = await tx.getFirstAsync<{ version: string }>(
      'SELECT version FROM factor_releases WHERE version = ?',
      version,
    );
    if (!release) throw new Error(`factor release ${version} is not staged`);
    await tx.runAsync(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ACTIVE_FACTORS_KEY,
      version,
      Date.now(),
    );
  });
}

export async function clearActiveFactorRelease(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM kv WHERE key = ?', ACTIVE_FACTORS_KEY);
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
      DELETE FROM factor_release_files;
      DELETE FROM factor_releases;
      DELETE FROM kv;
    `);
  });
}
