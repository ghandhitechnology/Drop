import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getText } from '../api/client';
import { clearAllData, getDb } from '../db';
import { syncFactors } from '../sync';
import { BUNDLED_FACTORS_VERSION, resetFactorTablesForTests } from '../tables';

vi.mock('../api/client', () => ({ getText: vi.fn() }));

const mockedGetText = vi.mocked(getText);

beforeEach(async () => {
  vi.clearAllMocks();
  await clearAllData();
  resetFactorTablesForTests();
});

describe('partial network download', () => {
  it('does not stage or activate any fragment when a later file fails', async () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/data/seed/manifest.json'), 'utf8'),
    ) as Record<string, unknown>;
    manifest.version = '2026.09.1';
    mockedGetText
      .mockResolvedValueOnce(JSON.stringify(manifest))
      .mockResolvedValueOnce('{}')
      .mockRejectedValueOnce(new Error('connection lost'));

    await expect(syncFactors({ force: true, now: 1_800_000_000_000 })).resolves.toEqual({
      status: 'unreachable',
    });
    const db = await getDb();
    const releases = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM factor_releases',
    );
    expect(releases?.n).toBe(0);
    expect(BUNDLED_FACTORS_VERSION).toBe('2026.08.2');
  });
});
