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
 *     lands in `factors_cache` and raises a note in settings. History keeps the
 *     figures it was recorded with; recomputing a past entry behind someone's
 *     back would rewrite a record they confirmed.
 *
 * The engine still reads `src/data/tables.ts` — the bundled tables. Promoting a
 * cached release into the running engine is a deliberate later step, and this
 * module's job stops at "a newer release is here".
 */
import { getJson } from './api/client';
import { factorsCachePut, kvGet, kvSet } from './db';
import { SYNC_INTERVAL_MS, cacheKey, isCheckDue, readManifestVersion } from './syncPolicy';
import { FACTORS_VERSION } from './tables';

export {
  SYNC_INTERVAL_MS,
  cacheKey,
  isCheckDue,
  readManifestVersion,
} from './syncPolicy';

/** The tables a release is made of, in the order they are fetched. */
export const SYNC_TABLES = [
  'food_sueatable',
  'food_hestia_country',
  'food_owid_proxy',
  'transport_factors',
  'sector_useeio',
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

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
  /** The service answered and its release is the one in the bundle. */
  | { status: 'current'; version: string }
  /** A newer release was fetched and cached. */
  | { status: 'fetched'; available: AvailableRelease }
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

  let version: string | null;
  try {
    const manifest = await getJson<unknown>('/v1/manifest', {
      timeoutMs: MANIFEST_TIMEOUT_MS,
    });
    version = readManifestVersion(manifest);
  } catch {
    return { status: 'unreachable' };
  }

  if (!version) return { status: 'unreachable' };
  if (version === FACTORS_VERSION) {
    // The bundle caught up with the service. Clear any stale note.
    await kvSet(AVAILABLE_KEY, '');
    return { status: 'current', version };
  }

  const fetched: string[] = [];
  for (const table of SYNC_TABLES) {
    try {
      const payload = await getJson<unknown>(`/v1/factors/${table}`, {
        timeoutMs: TABLE_TIMEOUT_MS,
      });
      await factorsCachePut(cacheKey(version, table), payload);
      fetched.push(table);
    } catch {
      // A release is only worth announcing whole. One table short and the
      // note stays down; tomorrow's check starts the download again.
      return { status: 'unreachable' };
    }
  }

  const available: AvailableRelease = { version, fetchedAt: now, tables: fetched };
  await kvSet(AVAILABLE_KEY, JSON.stringify(available));
  return { status: 'fetched', available };
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
