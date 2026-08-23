/**
 * Unit tests cover the parts of the data layer that can run outside the app:
 * the calendar keys, the search scorer, and the repository's SQL.
 *
 * `expo-sqlite` is aliased to a thin adapter over Node's own SQLite build, so
 * `db.ts` / `schema.ts` / `entries.ts` execute unmodified against a real
 * database file — the tests check the shipping SQL rather than a mock of it.
 * Nothing that needs a native view (Skia, Reanimated, the screens) is imported.
 */
import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'expo-sqlite': resolve(
        __dirname,
        'src/data/__tests__/expoSqliteNodeAdapter.ts',
      ),
      'expo-crypto': resolve(
        __dirname,
        'src/data/__tests__/expoCryptoNodeAdapter.ts',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['node_modules/**', 'android/**', '.expo/**'],
  },
});
