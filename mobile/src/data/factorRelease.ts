/**
 * The downloadable factor-release contract.
 *
 * A release is useful only as one unit: manifest, catalogue, and every table.
 * This module validates that unit before it is allowed anywhere near the
 * engine. Hashes cover the exact UTF-8 response bytes served by the API.
 */
import * as Crypto from 'expo-crypto';
import {
  buildTables,
  estimate,
  type QuantityUnit,
  type RawTables,
  type Tables,
} from '@drop/water-engine';

export const RELEASE_FORMAT_VERSION = 1;
export const FACTOR_SCHEMA_VERSION = 1;

export const RELEASE_FILES = [
  'catalog.json',
  'food_sueatable.json',
  'food_hestia_country.json',
  'food_owid_proxy.json',
  'transport_factors.json',
  'sector_useeio.json',
] as const;

export type ReleaseFile = (typeof RELEASE_FILES)[number];
export type ReleaseFileTexts = Record<ReleaseFile, string>;

export type ManifestFile = {
  path: string;
  sha256: string;
  bytes: number;
  rows?: number;
};

export type FactorManifest = {
  version: string;
  release_format_version: number;
  factor_schema_version: number;
  generated_at: string;
  files: ManifestFile[];
};

export class ReleaseValidationError extends Error {
  constructor(
    readonly kind: 'manifest' | 'incompatible' | 'incomplete' | 'integrity' | 'schema',
    message: string,
  ) {
    super(message);
    this.name = 'ReleaseValidationError';
  }
}

const VERSION_PATTERN = /^\d{4}\.\d{2}\.\d+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ReleaseValidationError('schema', `${label} is not valid JSON`);
  }
}

/** The manifest is the trust root, so reject every ambiguous contract shape. */
export function parseFactorManifest(text: string): FactorManifest {
  const body = object(parseJson(text, 'manifest'));
  if (!body) throw new ReleaseValidationError('manifest', 'manifest must be an object');

  if (
    typeof body.version !== 'string' ||
    !VERSION_PATTERN.test(body.version) ||
    typeof body.generated_at !== 'string' ||
    !Number.isFinite(Date.parse(body.generated_at)) ||
    !Array.isArray(body.files)
  ) {
    throw new ReleaseValidationError('manifest', 'manifest identity is invalid');
  }
  if (body.release_format_version !== RELEASE_FORMAT_VERSION) {
    throw new ReleaseValidationError(
      'incompatible',
      `release format ${String(body.release_format_version)} is unsupported`,
    );
  }
  if (body.factor_schema_version !== FACTOR_SCHEMA_VERSION) {
    throw new ReleaseValidationError(
      'incompatible',
      `factor schema ${String(body.factor_schema_version)} is unsupported`,
    );
  }

  const files: ManifestFile[] = [];
  const paths = new Set<string>();
  for (const candidate of body.files) {
    const entry = object(candidate);
    if (
      !entry ||
      typeof entry.path !== 'string' ||
      entry.path.includes('/') ||
      paths.has(entry.path) ||
      typeof entry.sha256 !== 'string' ||
      !SHA256_PATTERN.test(entry.sha256) ||
      !Number.isSafeInteger(entry.bytes) ||
      (entry.bytes as number) < 0 ||
      (entry.rows !== undefined &&
        (!Number.isSafeInteger(entry.rows) || (entry.rows as number) < 0))
    ) {
      throw new ReleaseValidationError('manifest', 'manifest file metadata is invalid');
    }
    paths.add(entry.path);
    files.push(entry as ManifestFile);
  }

  for (const path of RELEASE_FILES) {
    const entry = files.find((file) => file.path === path);
    if (!entry || entry.rows === undefined) {
      throw new ReleaseValidationError('incomplete', `manifest is missing ${path}`);
    }
  }

  return {
    version: body.version,
    release_format_version: RELEASE_FORMAT_VERSION,
    factor_schema_version: FACTOR_SCHEMA_VERSION,
    generated_at: body.generated_at,
    files,
  };
}

export function compareFactorVersions(left: string, right: string): number {
  if (!VERSION_PATTERN.test(left) || !VERSION_PATTERN.test(right)) {
    throw new ReleaseValidationError('manifest', 'factor version is not comparable');
  }
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  }
  return 0;
}

export function releasePath(file: ReleaseFile): string {
  return file === 'catalog.json'
    ? '/v1/catalog'
    : `/v1/factors/${file.slice(0, -'.json'.length)}`;
}

export async function sha256Text(text: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
}

/** UTF-8 byte count without relying on a browser-only Blob implementation. */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

function rows(value: unknown, key: string, file: string): Record<string, unknown>[] {
  const list = object(value)?.[key];
  if (!Array.isArray(list) || list.some((row) => object(row) === null)) {
    throw new ReleaseValidationError('schema', `${file}.${key} must be an object array`);
  }
  return list as Record<string, unknown>[];
}

function assertUniqueStrings(
  list: Record<string, unknown>[],
  key: string,
  label: string,
): void {
  const found = new Set<string>();
  for (const row of list) {
    const id = row[key];
    if (typeof id !== 'string' || id.length === 0 || found.has(id)) {
      throw new ReleaseValidationError('schema', `${label} has an invalid or duplicate ${key}`);
    }
    found.add(id);
  }
}

const METRIC_TYPES = new Set([
  'total_water_footprint',
  'freshwater_withdrawal',
  'freshwater_consumption',
  'scarcity_weighted_water_use',
]);

function finite(value: unknown, nullable = false): boolean {
  return (nullable && value === null) || (typeof value === 'number' && Number.isFinite(value));
}

function assertFactorRows(
  list: Record<string, unknown>[],
  label: string,
  valueKey: string,
  nullable = false,
): void {
  for (const row of list) {
    if (
      typeof row.dataset !== 'string' ||
      typeof row.dataset_release !== 'string' ||
      !METRIC_TYPES.has(String(row.metric_type)) ||
      !finite(row[valueKey], nullable)
    ) {
      throw new ReleaseValidationError('schema', `${label} contains an invalid factor row`);
    }
  }
}

function countJsonRows(value: unknown): number {
  const body = object(value);
  if (!body) return 0;
  let total = 0;
  for (const candidate of Object.values(body)) {
    if (Array.isArray(candidate)) total += candidate.length;
  }
  return total;
}

function validateRawSchema(manifest: FactorManifest, parsed: Record<ReleaseFile, unknown>): RawTables {
  const catalogBody = object(parsed['catalog.json']);
  if (catalogBody?.catalog_version !== manifest.version) {
    throw new ReleaseValidationError('schema', 'catalog version does not match manifest version');
  }
  const catalog = rows(parsed['catalog.json'], 'entries', 'catalog.json');
  assertUniqueStrings(catalog, 'catalog_id', 'catalog');
  for (const entry of catalog) {
    const quantity = object(entry.default_quantity);
    if (
      typeof entry.display_name !== 'string' ||
      !['food', 'drink', 'transport', 'product'].includes(String(entry.category)) ||
      !quantity ||
      typeof quantity.value !== 'number' ||
      !Number.isFinite(quantity.value) ||
      quantity.value <= 0 ||
      typeof quantity.unit !== 'string' ||
      !object(entry.factor_links)
    ) {
      throw new ReleaseValidationError('schema', 'catalog contains an invalid calculation entry');
    }
  }

  const selItems = rows(parsed['food_sueatable.json'], 'food_items', 'food_sueatable.json');
  const selTypes = rows(
    parsed['food_sueatable.json'],
    'food_typologies',
    'food_sueatable.json',
  );
  const hestia = rows(
    parsed['food_hestia_country.json'],
    'hestia_factors',
    'food_hestia_country.json',
  );
  const owid = rows(parsed['food_owid_proxy.json'], 'owid_factors', 'food_owid_proxy.json');
  const transport = rows(
    parsed['transport_factors.json'],
    'transport_factors',
    'transport_factors.json',
  );
  const useeio = rows(
    parsed['sector_useeio.json'],
    'useeio_sectors',
    'sector_useeio.json',
  );
  for (const [list, label] of [
    [selItems, 'food items'],
    [selTypes, 'food typologies'],
    [hestia, 'HESTIA factors'],
    [owid, 'OWID factors'],
    [useeio, 'USEEIO sectors'],
  ] as const) {
    assertUniqueStrings(list, 'factor_id', label);
  }
  assertFactorRows(selItems, 'food items', 'value_l_per_kg');
  for (const row of selTypes) {
    if (
      typeof row.dataset !== 'string' ||
      typeof row.dataset_release !== 'string' ||
      !METRIC_TYPES.has(String(row.metric_type)) ||
      !object(row.stats)
    ) {
      throw new ReleaseValidationError('schema', 'food typologies contain an invalid factor row');
    }
  }
  assertFactorRows(hestia, 'HESTIA factors', 'value_l_per_kg', true);
  assertFactorRows(owid, 'OWID factors', 'value_l_per_kg');
  assertFactorRows(useeio, 'USEEIO sectors', 'value_l_per_usd_purchaser', true);
  const transportIds = new Set<string>();
  for (const row of transport) {
    const id =
      typeof row.factor_id === 'string'
        ? row.factor_id
        : typeof row.mode === 'string'
          ? `unsupported:${row.mode}`
          : null;
    const value = row.value_l_per_pkm ?? row.value_l_per_tkm;
    const validValue = row.unsupported === true ? value === undefined : finite(value);
    if (
      !id ||
      transportIds.has(id) ||
      typeof row.mode !== 'string' ||
      !validValue ||
      (row.unsupported !== true && !METRIC_TYPES.has(String(row.metric_type)))
    ) {
      throw new ReleaseValidationError('schema', 'transport factors have an invalid identity');
    }
    transportIds.add(id);
  }

  const factorIds = new Set<string>([
    ...selItems.map((row) => row.factor_id as string),
    ...selTypes.map((row) => row.factor_id as string),
    ...hestia.map((row) => row.factor_id as string),
    ...owid.map((row) => row.factor_id as string),
    ...useeio.map((row) => row.factor_id as string),
    ...transportIds,
  ]);
  for (const entry of catalog) {
    const links = object(entry.factor_links)!;
    const references: unknown[] = [];
    for (const key of ['primary', 'typology', 'proxy', 'spend']) {
      const link = object(links[key]);
      if (link?.factor_id != null) references.push(link.factor_id);
    }
    if (Array.isArray(links.secondary)) {
      for (const link of links.secondary) references.push(object(link)?.factor_id);
    }
    if (Array.isArray(entry.recipe)) {
      for (const part of entry.recipe) references.push(object(part)?.factor_id);
    }
    if (
      references.some(
        (factorId) => typeof factorId !== 'string' || !factorIds.has(factorId),
      )
    ) {
      throw new ReleaseValidationError('schema', `${String(entry.catalog_id)} has a dangling factor`);
    }
  }

  return {
    manifest,
    catalog: parsed['catalog.json'],
    food_sueatable: parsed['food_sueatable.json'],
    food_hestia_country: parsed['food_hestia_country.json'],
    food_owid_proxy: parsed['food_owid_proxy.json'],
    transport_factors: parsed['transport_factors.json'],
    sector_useeio: parsed['sector_useeio.json'],
  } as RawTables;
}

function buildAndSmokeTest(raw: RawTables, version: string): Tables {
  let tables: Tables;
  try {
    tables = buildTables(raw);
  } catch {
    throw new ReleaseValidationError('schema', 'factor tables could not be built');
  }
  if (tables.version !== version || tables.catalog.size !== raw.catalog.entries.length) {
    throw new ReleaseValidationError('schema', 'built table identity is inconsistent');
  }

  for (const entry of raw.catalog.entries) {
    try {
      const result = estimate(
        {
          catalog_id: entry.catalog_id,
          quantity: {
            value: entry.default_quantity.value,
            unit: entry.default_quantity.unit as QuantityUnit,
            source: 'catalog_default',
          },
        },
        tables,
      );
      if (
        result.factors_version !== version ||
        (result.headline &&
          (!Number.isFinite(result.headline.value_l) ||
            result.headline.range_l?.some((value) => !Number.isFinite(value))))
      ) {
        throw new Error('invalid estimate');
      }
    } catch {
      throw new ReleaseValidationError(
        'schema',
        `catalog entry ${entry.catalog_id} is incompatible with the engine`,
      );
    }
  }
  return tables;
}

export type ValidatedFactorRelease = {
  manifest: FactorManifest;
  manifestText: string;
  files: ReleaseFileTexts;
  raw: RawTables;
  tables: Tables;
};

/** Validate exact bytes, declared row counts, runtime shape, and engine compatibility. */
export async function validateFactorRelease(
  manifestText: string,
  files: Partial<Record<ReleaseFile, string>>,
  digest: (text: string) => Promise<string> = sha256Text,
): Promise<ValidatedFactorRelease> {
  const manifest = parseFactorManifest(manifestText);
  const complete = {} as ReleaseFileTexts;
  const parsed = {} as Record<ReleaseFile, unknown>;

  for (const path of RELEASE_FILES) {
    const text = files[path];
    if (typeof text !== 'string') {
      throw new ReleaseValidationError('incomplete', `release is missing ${path}`);
    }
    const metadata = manifest.files.find((file) => file.path === path)!;
    if (utf8Bytes(text) !== metadata.bytes || (await digest(text)) !== metadata.sha256) {
      throw new ReleaseValidationError('integrity', `${path} does not match its manifest hash`);
    }
    const value = parseJson(text, path);
    if (countJsonRows(value) !== metadata.rows) {
      throw new ReleaseValidationError('integrity', `${path} does not match its manifest row count`);
    }
    complete[path] = text;
    parsed[path] = value;
  }

  const raw = validateRawSchema(manifest, parsed);
  const tables = buildAndSmokeTest(raw, manifest.version);
  return { manifest, manifestText, files: complete, raw, tables };
}
