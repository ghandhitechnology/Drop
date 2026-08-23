import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  activeFactorReleaseVersion,
  clearAllData,
  getDb,
  setActiveFactorRelease,
  stageFactorRelease,
} from '../db';
import {
  FACTOR_SCHEMA_VERSION,
  RELEASE_FILES,
  RELEASE_FORMAT_VERSION,
  ReleaseValidationError,
  type ReleaseFile,
  type ReleaseFileTexts,
  validateFactorRelease,
} from '../factorRelease';
import { useCatalogStore } from '../catalogStore';
import {
  BUNDLED_FACTORS_VERSION,
  FACTORS_VERSION,
  activateFactorRelease,
  getTables,
  initializeFactorTables,
  resetFactorTablesForTests,
} from '../tables';

type Fixture = {
  version: string;
  manifestText: string;
  files: ReleaseFileTexts;
  metadata: Record<string, { sha256: string; bytes: number }>;
};

function jsonRows(text: string): number {
  const value = JSON.parse(text) as Record<string, unknown>;
  let total = 0;
  for (const candidate of Object.values(value)) {
    if (Array.isArray(candidate)) total += candidate.length;
  }
  return total;
}

function hash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function makeRelease(version = '2026.09.1'): Fixture {
  const directory = resolve(process.cwd(), 'src/data/seed');
  const files = {} as ReleaseFileTexts;
  for (const path of RELEASE_FILES) {
    files[path] = readFileSync(resolve(directory, path), 'utf8');
  }
  const catalog = JSON.parse(files['catalog.json']) as Record<string, unknown>;
  catalog.catalog_version = version;
  files['catalog.json'] = `${JSON.stringify(catalog)}\n`;

  const entries = RELEASE_FILES.map((path) => ({
    path,
    sha256: hash(files[path]),
    bytes: Buffer.byteLength(files[path], 'utf8'),
    rows: jsonRows(files[path]),
  }));
  const manifestText = JSON.stringify({
    factor_schema_version: FACTOR_SCHEMA_VERSION,
    files: entries,
    generated_at: '2026-09-01T00:00:00+00:00',
    release_format_version: RELEASE_FORMAT_VERSION,
    version,
  });
  return {
    version,
    manifestText,
    files,
    metadata: Object.fromEntries(
      entries.map((entry) => [entry.path, { sha256: entry.sha256, bytes: entry.bytes }]),
    ),
  };
}

function rehashFile(fixture: Fixture, path: ReleaseFile): void {
  const manifest = JSON.parse(fixture.manifestText) as {
    files: { path: string; sha256: string; bytes: number; rows: number }[];
  };
  const entry = manifest.files.find((candidate) => candidate.path === path)!;
  entry.sha256 = hash(fixture.files[path]);
  entry.bytes = Buffer.byteLength(fixture.files[path], 'utf8');
  entry.rows = jsonRows(fixture.files[path]);
  fixture.metadata[path] = { sha256: entry.sha256, bytes: entry.bytes };
  fixture.manifestText = JSON.stringify(manifest);
}

async function stage(fixture: Fixture): Promise<void> {
  await stageFactorRelease(
    {
      version: fixture.version,
      manifestText: fixture.manifestText,
      files: fixture.files,
    },
    fixture.metadata,
  );
}

beforeEach(async () => {
  await clearAllData();
  resetFactorTablesForTests();
});

describe('release validation', () => {
  it('accepts one complete internally consistent release', async () => {
    const fixture = makeRelease();
    const release = await validateFactorRelease(fixture.manifestText, fixture.files);
    expect(release.manifest.version).toBe(fixture.version);
    expect(release.tables.version).toBe(fixture.version);
    expect(release.tables.catalog.size).toBe(1000);
  });

  it('rejects a corrupt file even when it is still readable JSON', async () => {
    const fixture = makeRelease();
    const corrupt = {
      ...fixture.files,
      'food_owid_proxy.json': fixture.files['food_owid_proxy.json'].replace(
        'freshwater_withdrawal',
        'freshwater_consumption',
      ),
    };
    await expect(validateFactorRelease(fixture.manifestText, corrupt)).rejects.toMatchObject({
      kind: 'integrity',
    });
  });

  it('rejects a partial download', async () => {
    const fixture = makeRelease();
    const partial: Partial<Record<ReleaseFile, string>> = { ...fixture.files };
    delete partial['transport_factors.json'];
    await expect(validateFactorRelease(fixture.manifestText, partial)).rejects.toMatchObject({
      kind: 'incomplete',
    });
  });

  it('rejects a manifest for an unknown engine schema before reading files', async () => {
    const fixture = makeRelease();
    const manifest = JSON.parse(fixture.manifestText) as Record<string, unknown>;
    manifest.factor_schema_version = FACTOR_SCHEMA_VERSION + 1;
    await expect(
      validateFactorRelease(JSON.stringify(manifest), fixture.files),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ReleaseValidationError>>({ kind: 'incompatible' }),
    );
  });

  it('rejects a hash-valid table whose calculation schema is malformed', async () => {
    const fixture = makeRelease();
    const owid = JSON.parse(fixture.files['food_owid_proxy.json']) as {
      owid_factors: Record<string, unknown>[];
    };
    owid.owid_factors[0]!.value_l_per_kg = 'not a number';
    fixture.files['food_owid_proxy.json'] = JSON.stringify(owid);
    rehashFile(fixture, 'food_owid_proxy.json');

    await expect(validateFactorRelease(fixture.manifestText, fixture.files)).rejects.toMatchObject({
      kind: 'schema',
    });
  });
});

describe('atomic activation and recovery', () => {
  it('activates the complete version as one engine table set', async () => {
    const fixture = makeRelease();
    const catalog = JSON.parse(fixture.files['catalog.json']) as {
      entries: { catalog_id: string; default_quantity: { value: number } }[];
    };
    catalog.entries.find((entry) => entry.catalog_id === 'apple')!.default_quantity.value = 0.151;
    fixture.files['catalog.json'] = JSON.stringify(catalog);
    rehashFile(fixture, 'catalog.json');
    await stage(fixture);

    await expect(activateFactorRelease(fixture.version)).resolves.toBe(fixture.version);
    expect(FACTORS_VERSION).toBe(fixture.version);
    expect(getTables().version).toBe(fixture.version);
    expect(getTables().catalog.get('apple')?.default_quantity.value).toBe(0.151);
    expect(useCatalogStore.getState().version).toBe(fixture.version);
    expect(
      useCatalogStore.getState().items.find((entry) => entry.id === 'apple')?.defaultQuantity,
    ).toBe(0.151);
    expect(await activeFactorReleaseVersion()).toBe(fixture.version);
  });

  it('restores the validated active version after a process restart', async () => {
    const fixture = makeRelease();
    await stage(fixture);
    await activateFactorRelease(fixture.version);

    resetFactorTablesForTests();
    expect(FACTORS_VERSION).toBe(BUNDLED_FACTORS_VERSION);
    await expect(initializeFactorTables()).resolves.toBe(fixture.version);
    expect(FACTORS_VERSION).toBe(fixture.version);
    expect(getTables().version).toBe(fixture.version);
  });

  it('falls back to the bundle and clears a corrupt active pointer on restart', async () => {
    const fixture = makeRelease();
    await stage(fixture);
    await activateFactorRelease(fixture.version);
    const db = await getDb();
    await db.runAsync(
      `UPDATE factor_release_files SET payload_text = payload_text || ' '
       WHERE version = ? AND path = ?`,
      fixture.version,
      'food_hestia_country.json',
    );

    resetFactorTablesForTests();
    await expect(initializeFactorTables()).resolves.toBe(BUNDLED_FACTORS_VERSION);
    expect(FACTORS_VERSION).toBe(BUNDLED_FACTORS_VERSION);
    expect(getTables().version).toBe(BUNDLED_FACTORS_VERSION);
    expect(await activeFactorReleaseVersion()).toBeNull();
  });

  it('leaves the previous release active when a new activation is corrupt', async () => {
    const first = makeRelease('2026.09.1');
    await stage(first);
    await activateFactorRelease(first.version);

    const second = makeRelease('2026.10.1');
    second.files['sector_useeio.json'] += ' ';
    await stage(second);
    await expect(activateFactorRelease(second.version)).rejects.toMatchObject({
      kind: 'integrity',
    });
    expect(FACTORS_VERSION).toBe(first.version);
    expect(getTables().version).toBe(first.version);
    expect(await activeFactorReleaseVersion()).toBe(first.version);
  });

  it('never lets an older downloaded pointer override a newer bundle', async () => {
    const older = makeRelease('2026.07.1');
    await stage(older);
    await setActiveFactorRelease(older.version);

    resetFactorTablesForTests();
    await expect(initializeFactorTables()).resolves.toBe(BUNDLED_FACTORS_VERSION);
    expect(FACTORS_VERSION).toBe(BUNDLED_FACTORS_VERSION);
    expect(await activeFactorReleaseVersion()).toBeNull();
  });
});
