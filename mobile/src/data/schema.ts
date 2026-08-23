/**
 * Schema and forward-only migrations.
 *
 * Version is tracked with SQLite's own `PRAGMA user_version`, so the schema
 * state travels with the database file and needs no bookkeeping table. Each
 * migration runs inside a transaction; the pragma bump is part of that same
 * transaction, so a half-applied step rolls back whole.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

export type Migration = {
  version: number;
  label: string;
  up: (db: SQLiteDatabase) => Promise<void>;
};

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    label: 'entries, daily totals, catalog, caches',
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE entries (
          id              TEXT    PRIMARY KEY NOT NULL,
          created_at      INTEGER NOT NULL,
          local_day       TEXT    NOT NULL,
          local_week      TEXT    NOT NULL,
          tz              TEXT    NOT NULL,
          item_id         TEXT    NOT NULL,
          item_label      TEXT    NOT NULL,
          category        TEXT    NOT NULL,
          quantity_value  REAL    NOT NULL,
          quantity_unit   TEXT    NOT NULL,
          quantity_source TEXT    NOT NULL,
          litres          REAL    NOT NULL,
          litres_low      REAL,
          litres_high     REAL,
          metric_type     TEXT    NOT NULL,
          match_level     TEXT,
          confidence      TEXT,
          input_method    TEXT    NOT NULL,
          factors_version TEXT    NOT NULL,
          estimate_json   TEXT    NOT NULL,
          photo_uri       TEXT,
          note            TEXT,
          deleted_at      INTEGER
        );

        CREATE INDEX idx_entries_local_day   ON entries (local_day);
        CREATE INDEX idx_entries_created_at  ON entries (created_at DESC);

        CREATE TABLE daily_totals (
          local_day        TEXT    PRIMARY KEY NOT NULL,
          total_litres     REAL    NOT NULL,
          entry_count      INTEGER NOT NULL,
          by_category_json TEXT    NOT NULL,
          updated_at       INTEGER NOT NULL
        );

        CREATE TABLE catalog_items (
          id               TEXT    PRIMARY KEY NOT NULL,
          label            TEXT    NOT NULL,
          aliases          TEXT    NOT NULL,
          category         TEXT    NOT NULL,
          default_unit     TEXT    NOT NULL,
          default_quantity REAL    NOT NULL,
          typology         TEXT,
          search_blob      TEXT    NOT NULL,
          sort_rank        INTEGER NOT NULL
        );

        CREATE TABLE factors_cache (
          key          TEXT    PRIMARY KEY NOT NULL,
          payload_json TEXT    NOT NULL,
          fetched_at   INTEGER NOT NULL
        );

        CREATE TABLE kv (
          key        TEXT    PRIMARY KEY NOT NULL,
          value      TEXT    NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    },
  },
  {
    version: 2,
    label: 'complete factor releases and active pointer',
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE factor_releases (
          version       TEXT    PRIMARY KEY NOT NULL,
          manifest_json TEXT    NOT NULL,
          staged_at     INTEGER NOT NULL
        );

        CREATE TABLE factor_release_files (
          version      TEXT    NOT NULL,
          path         TEXT    NOT NULL,
          payload_text TEXT    NOT NULL,
          sha256       TEXT    NOT NULL,
          bytes        INTEGER NOT NULL,
          fetched_at   INTEGER NOT NULL,
          PRIMARY KEY (version, path),
          FOREIGN KEY (version) REFERENCES factor_releases(version) ON DELETE CASCADE
        );

        DELETE FROM kv WHERE key = 'sync.factors.available';
      `);
    },
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

/** Applies every migration newer than the file's `user_version`. */
export async function migrate(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    await db.withExclusiveTransactionAsync(async (tx) => {
      await migration.up(tx);
      // PRAGMA does not accept bound parameters; the number is our own literal.
      await tx.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
    current = migration.version;
  }

  return current;
}
