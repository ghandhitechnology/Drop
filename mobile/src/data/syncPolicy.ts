/**
 * The decisions the refresh makes, with nothing attached to them.
 *
 * Split out of `sync.ts` for the same reason `api/normalize.ts` is split out of
 * `api/client.ts`: the transport pulls in `react-native` and `expo-constants`,
 * and the rules that matter — how often the phone is allowed to ask, and what
 * counts as a readable answer — should be checkable without a device.
 */

/** One day. A factors release lands every few weeks; this is already generous. */
export const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a check is due.
 *
 * An absent or unreadable timestamp means "never checked", which is due — a
 * corrupted value should let the feature work, not disable it forever.
 */
export function isCheckDue(
  lastCheckAt: string | null,
  now: number,
  intervalMs: number = SYNC_INTERVAL_MS,
): boolean {
  if (lastCheckAt === null) return true;
  const parsed = Number(lastCheckAt);
  if (!Number.isFinite(parsed)) return true;
  // A clock that moved backwards (a manual time change, a timezone applied
  // late) would otherwise hold the check off for a day from a future stamp.
  if (parsed > now) return true;
  return now - parsed >= intervalMs;
}

/** Reads a version out of a manifest body, or nothing if the body is unusable. */
export function readManifestVersion(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const version = (body as { version?: unknown }).version;
  return typeof version === 'string' && version.length > 0 ? version : null;
}

/** Cache keys are namespaced by release, so two releases never overwrite. */
export function cacheKey(version: string, table: string): string {
  return `factors/${version}/${table}`;
}
