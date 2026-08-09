import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const MIGRATION_LOCK = 1_186_794_201;

async function migrate(): Promise<void> {
  const enforcement = process.env.USAGE_ENFORCEMENT ?? 'on';
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (enforcement === 'off') return;
    throw new Error('DATABASE_URL is required while usage enforcement is on');
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrations = [
      [1, '../../migrations/001_usage.sql'],
      [2, '../../migrations/002_usage_fingerprints.sql'],
    ] as const;
    for (const [version, resource] of migrations) {
      const applied = await client.query<{ version: number }>(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [version],
      );
      if (applied.rowCount !== 0) continue;
      const path = fileURLToPath(new URL(resource, import.meta.url));
      const sql = await readFile(path, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {});
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error('[usage/migrate]', error);
  process.exitCode = 1;
});
