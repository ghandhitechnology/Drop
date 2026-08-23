/**
 * The factor tables, refreshed.
 *
 * Drop estimates offline. The tables that produce every litre ship inside the
 * bundle, and this module exists only so a newer release can arrive without a
 * new build. Three rules shape it:
 *
 *  1. **It never blocks.** It is fired once from the camera route and awaited
 *     by nobody. Every failure — radio off, service asleep, a body that does
 *     not parse — is swallowed and the app carries on with the bundle.
 *  2. **It asks at most once a day.** The check timestamp is written before the
 *     request goes out, so a cold-start loop cannot turn into a poll.
 *  3. **It changes nothing a person has already seen.** A downloaded release
 *     is validated and activated as one unit. History keeps the figures it was
 *     recorded with; recomputing a past entry behind someone's back would
 *     rewrite a record they confirmed.
 *
 * The engine reads one in-memory set from `src/data/tables.ts`. Until a complete
 * release passes manifest, byte hash, row count, schema, and engine smoke tests,
 * that set remains the bundled fallback.
 */
import { getText } from './api/client';
import { kvGet, kvSet, stageFactorRelease } from './db';
import {
  RELEASE_FILES,
  ReleaseValidationError,
  compareFactorVersions,
  parseFactorManifest,
  releasePath,
  validateFactorRelease,
  type ReleaseFile,
  type ReleaseFileTexts,
} from './factorRelease';
import { hydrateCatalog } from './catalogStore';
import { activateFactorRelease, FACTORS_VERSION } from './tables';
import { isCheckDue } from './syncPolicy';

export {
  SYNC_INTERVAL_MS,
  cacheKey,
  isCheckDue,
  readManifestVersion,
} from './syncPolicy';

/** The factor endpoints, retained as a public diagnostic list. */
export const SYNC_TABLES = RELEASE_FILES.filter((file) => file !== 'catalog.json').map(
  (file) => file.slice(0, -'.json'.length),
) as readonly string[];

export type SyncTable = string;

/**
 * A manifest is small; a table is not. The manifest call is kept short so a
 * dead network costs a boot almost nothing, and the table calls are given room
 * because by then something is genuinely being downloaded.
 */
export const MANIFEST_TIMEOUT_MS = 4_000;
export const TABLE_TIMEOUT_MS = 20_000;

const LAST_CHECK_KEY = 'sync.factors.checkedAt';
const AVAILABLE_KEY = 'sync.factors.available';

/* ------------------------------------------------------------- the state */

/** A newer release, downloaded and waiting. */
export type AvailableRelease = {
  version: string;
  fetchedAt: number;
  tables: string[];
};

export type SyncOutcome =
  /** Checked recently enough. Nothing left the device. */
  | { status: 'recent'; available: AvailableRelease | null }
  /** The service answered with the active release or an older one. */
  | { status: 'current'; version: string }
  /** A newer release was fetched and cached. */
  | { status: 'fetched'; available: AvailableRelease }
  /** A complete newer release was validated, persisted, and made active. */
  | { status: 'activated'; version: string }
  /** The server answered, but the advertised release was unsafe to use. */
  | { status: 'rejected'; reason: ReleaseValidationError['kind'] }
  /** The service was out of reach, or answered with something unreadable. */
  | { status: 'unreachable' };

/* --------------------------------------------------------------- storage */

/** The release waiting in the cache, if any. Read by the settings screen. */
export async function readAvailableRelease(): Promise<AvailableRelease | null> {
  const raw = await kvGet(AVAILABLE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AvailableRelease;
    if (typeof parsed?.version !== 'string') return null;
    // A release that has since become the bundled one is no longer news.
    if (parsed.version === FACTORS_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- the check */

export type SyncOptions = {
  /** Runs the check whatever the last timestamp says. */
  force?: boolean;
  now?: number;
};

/**
 * Ask once, and only if it is time.
 *
 * The order matters: the timestamp is written *before* the request, so a crash
 * or a hang mid-fetch still costs a day rather than repeating on every launch.
 */
export async function syncFactors(options: SyncOptions = {}): Promise<SyncOutcome> {
  const now = options.now ?? Date.now();

  if (!options.force) {
    const due = isCheckDue(await kvGet(LAST_CHECK_KEY), now);
    if (!due) return { status: 'recent', available: await readAvailableRelease() };
  }

  await kvSet(LAST_CHECK_KEY, String(now));

  let manifestText: string;
  try {
    manifestText = await getText('/v1/manifest', {
      timeoutMs: MANIFEST_TIMEOUT_MS,
    });
  } catch {
    return { status: 'unreachable' };
  }

  let manifest;
  try {
    manifest = parseFactorManifest(manifestText);
  } catch (error) {
    if (error instanceof ReleaseValidationError) {
      return { status: 'rejected', reason: error.kind };
    }
    return { status: 'unreachable' };
  }

  if (compareFactorVersions(manifest.version, FACTORS_VERSION) <= 0) {
    // The bundle caught up with the service. Clear any stale note.
    await kvSet(AVAILABLE_KEY, '');
    return { status: 'current', version: FACTORS_VERSION };
  }

  const files = {} as ReleaseFileTexts;
  for (const file of RELEASE_FILES) {
    try {
      files[file] = await getText(releasePath(file), {
        timeoutMs: TABLE_TIMEOUT_MS,
      });
    } catch {
      // Nothing is persisted until every file has arrived and validated.
      return { status: 'unreachable' };
    }
  }

  let validated;
  try {
    validated = await validateFactorRelease(manifestText, files);
  } catch (error) {
    if (error instanceof ReleaseValidationError) {
      return { status: 'rejected', reason: error.kind };
    }
    return { status: 'unreachable' };
  }

  const metadata = Object.fromEntries(
    validated.manifest.files
      .filter((file): file is typeof file & { path: ReleaseFile } =>
        RELEASE_FILES.includes(file.path as ReleaseFile),
      )
      .map((file) => [file.path, { sha256: file.sha256, bytes: file.bytes }]),
  );

  try {
    await stageFactorRelease(
      {
        version: validated.manifest.version,
        manifestText,
        files: validated.files,
      },
      metadata,
      now,
    );
    await activateFactorRelease(validated.manifest.version);
    await kvSet(AVAILABLE_KEY, '');
    await hydrateCatalog({ force: true });
    return { status: 'activated', version: validated.manifest.version };
  } catch {
    // The previous active set remains live; a restart will make the same safe
    // choice from the durable pointer.
    return { status: 'unreachable' };
  }
}

/**
 * The boot call.
 *
 * Deliberately returns nothing and rejects never: the camera route fires this
 * and forgets it. It is also deferred off the first frames, because the only
 * thing that matters in the first second of a cold start is the viewfinder.
 */
export function startFactorSync(delayMs = 3_000): () => void {
  const timer = setTimeout(() => {
    syncFactors().catch(() => {});
  }, delayMs);
  return () => clearTimeout(timer);
}
