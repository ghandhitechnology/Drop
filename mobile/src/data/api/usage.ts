export type UsageSnapshot = {
  limit: number;
  used: number;
  remaining: number;
  local_day: string;
  resets_at: string;
};

export type UsageReservation = {
  usage: UsageSnapshot;
  expires_at: string;
};

function finiteInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export function readUsageSnapshot(value: unknown): UsageSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const limit = finiteInteger(source.limit);
  const used = finiteInteger(source.used);
  const remaining = finiteInteger(source.remaining);
  if (
    limit === null ||
    limit === 0 ||
    used === null ||
    remaining === null ||
    typeof source.local_day !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(source.local_day) ||
    typeof source.resets_at !== 'string' ||
    !Number.isFinite(Date.parse(source.resets_at))
  )
    return null;
  return {
    limit,
    used,
    remaining,
    local_day: source.local_day,
    resets_at: source.resets_at,
  };
}

export function readUsageReservation(value: unknown): UsageReservation | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const usage = readUsageSnapshot(source.usage);
  if (
    !usage ||
    typeof source.expires_at !== 'string' ||
    !Number.isFinite(Date.parse(source.expires_at))
  ) {
    return null;
  }
  return { usage, expires_at: source.expires_at };
}

let observer: ((snapshot: UsageSnapshot) => void) | null = null;

export function observeUsage(next: ((snapshot: UsageSnapshot) => void) | null): void {
  observer = next;
}

export function publishUsage(snapshot: UsageSnapshot): void {
  observer?.(snapshot);
}

export function usageFromHeaders(headers: Headers): UsageSnapshot | null {
  const limit = Number(headers.get('RateLimit-Limit'));
  const remaining = Number(headers.get('RateLimit-Remaining'));
  const used = Number(headers.get('X-Drop-Usage-Used'));
  const localDay = headers.get('X-Drop-Usage-Day');
  const resetSeconds = Number(headers.get('RateLimit-Reset'));
  if (
    !Number.isInteger(limit) ||
    limit <= 0 ||
    !Number.isInteger(remaining) ||
    remaining < 0 ||
    !Number.isInteger(used) ||
    used < 0 ||
    !localDay ||
    !/^\d{4}-\d{2}-\d{2}$/.test(localDay) ||
    !Number.isFinite(resetSeconds) ||
    resetSeconds <= 0
  )
    return null;
  return {
    limit,
    used,
    remaining,
    local_day: localDay,
    resets_at: new Date(resetSeconds * 1000).toISOString(),
  };
}
