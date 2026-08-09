import {
  DAILY_USAGE_LIMIT,
  RESERVATION_TTL_MS,
  UsageLimitError,
  UsageReservationError,
  type ReservationResult,
  type AnalysisBranch,
  type UsageIdentity,
  type UsageLease,
  type UsageRepository,
  type UsageSnapshot,
} from './types';

type Reservation = {
  state: 'reserved' | 'consumed';
  expiresAt: number;
  fingerprints: Partial<Record<AnalysisBranch, string>>;
};
type Day = {
  used: number;
  timezone: string;
  reservations: Map<string, Reservation>;
};

const parts = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let value = parts.get(timezone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    parts.set(timezone, value);
  }
  return value;
}

function fields(at: Date, timezone: string): Record<string, number> {
  return Object.fromEntries(
    formatter(timezone)
      .formatToParts(at)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

/** Converts a wall-clock instant in an IANA zone to its UTC epoch. Two passes
 * cover DST offset changes around the first guess. */
function wallClockEpoch(
  value: { year: number; month: number; day: number; hour: number },
  timezone: string,
): number {
  const desired = Date.UTC(value.year, value.month - 1, value.day, value.hour);
  let guess = desired;
  for (let pass = 0; pass < 3; pass += 1) {
    const found = fields(new Date(guess), timezone);
    const represented = Date.UTC(
      found.year!,
      found.month! - 1,
      found.day!,
      found.hour!,
      found.minute!,
      found.second!,
    );
    guess += desired - represented;
  }
  return guess;
}

export function memoryDayInfo(at: Date, timezone: string) {
  const current = fields(at, timezone);
  const localDay = `${current.year}-${String(current.month).padStart(2, '0')}-${String(current.day).padStart(2, '0')}`;
  const tomorrow = new Date(Date.UTC(current.year!, current.month! - 1, current.day! + 1));
  const reset = wallClockEpoch(
    {
      year: tomorrow.getUTCFullYear(),
      month: tomorrow.getUTCMonth() + 1,
      day: tomorrow.getUTCDate(),
      hour: 0,
    },
    timezone,
  );
  return { local_day: localDay, resets_at: new Date(reset).toISOString() };
}

function resetForLocalDay(localDay: string, timezone: string): string {
  const [year, month, day] = localDay.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(year!, month! - 1, day! + 1));
  const reset = wallClockEpoch(
    {
      year: tomorrow.getUTCFullYear(),
      month: tomorrow.getUTCMonth() + 1,
      day: tomorrow.getUTCDate(),
      hour: 0,
    },
    timezone,
  );
  return new Date(reset).toISOString();
}

export class InMemoryUsageRepository implements UsageRepository {
  readonly ready = true;
  private readonly days = new Map<string, Day>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async probe(): Promise<boolean> {
    return true;
  }

  private locate(identity: UsageIdentity): {
    key: string;
    day: Day;
    info: ReturnType<typeof memoryDayInfo>;
  } {
    const info = memoryDayInfo(this.now(), identity.timezone);
    const key = `${identity.deviceHash}:${info.local_day}`;
    let day = this.days.get(key);
    if (!day) {
      day = { used: 0, timezone: identity.timezone, reservations: new Map() };
      this.days.set(key, day);
    }
    day.timezone = identity.timezone;
    for (const [id, reservation] of day.reservations) {
      if (reservation.state === 'reserved' && reservation.expiresAt <= this.now().getTime()) {
        day.reservations.delete(id);
      }
    }
    return { key, day, info };
  }

  private view(day: Day, info: ReturnType<typeof memoryDayInfo>): UsageSnapshot {
    const active = [...day.reservations.values()].filter((r) => r.state === 'reserved').length;
    return {
      limit: DAILY_USAGE_LIMIT,
      used: day.used,
      remaining: Math.max(0, DAILY_USAGE_LIMIT - day.used - active),
      local_day: info.local_day,
      resets_at: info.resets_at,
    };
  }

  private findReservation(deviceHash: string, analysisId: string) {
    for (const [key, day] of this.days) {
      if (!key.startsWith(`${deviceHash}:`)) continue;
      const reservation = day.reservations.get(analysisId);
      if (!reservation) continue;
      const localDay = key.slice(deviceHash.length + 1);
      const info = { local_day: localDay, resets_at: resetForLocalDay(localDay, day.timezone) };
      return { day, reservation, info };
    }
    return null;
  }

  async status(identity: UsageIdentity): Promise<UsageSnapshot> {
    const { day, info } = this.locate(identity);
    return this.view(day, info);
  }

  async reserve(identity: UsageIdentity, analysisId: string): Promise<ReservationResult> {
    const { day, info } = this.locate(identity);
    const existing = day.reservations.get(analysisId);
    if (existing) {
      return {
        usage: this.view(day, info),
        expires_at: new Date(existing.expiresAt).toISOString(),
      };
    }
    if (this.view(day, info).remaining <= 0) {
      throw new UsageLimitError(this.view(day, info));
    }
    const expiresAt = this.now().getTime() + RESERVATION_TTL_MS;
    day.reservations.set(analysisId, {
      state: 'reserved',
      expiresAt,
      fingerprints: {},
    });
    return {
      usage: this.view(day, info),
      expires_at: new Date(expiresAt).toISOString(),
    };
  }

  async authorize(lease: UsageLease): Promise<void> {
    const found = this.findReservation(lease.deviceHash, lease.analysisId);
    if (
      !found ||
      (found.reservation.state === 'reserved' &&
        found.reservation.expiresAt <= this.now().getTime())
    ) {
      throw new UsageReservationError('analysis reservation missing or expired');
    }
  }

  async consume(
    lease: UsageLease,
    branch: AnalysisBranch,
    fingerprint: string,
  ): Promise<UsageSnapshot> {
    const found = this.findReservation(lease.deviceHash, lease.analysisId);
    if (
      !found ||
      (found.reservation.state === 'reserved' &&
        found.reservation.expiresAt <= this.now().getTime())
    ) {
      throw new UsageReservationError('analysis reservation missing or expired');
    }
    const { day, info, reservation } = found;
    const prior = reservation.fingerprints[branch];
    if (prior && prior !== fingerprint) {
      throw new UsageReservationError(`analysis id already used for another ${branch} request`);
    }
    reservation.fingerprints[branch] = fingerprint;
    if (reservation.state === 'reserved') {
      reservation.state = 'consumed';
      day.used += 1;
    }
    return this.view(day, info);
  }

  async release(lease: UsageLease): Promise<void> {
    const found = this.findReservation(lease.deviceHash, lease.analysisId);
    if (found?.reservation.state === 'reserved') {
      const { day } = found;
      day.reservations.delete(lease.analysisId);
    }
  }

  async cleanup(): Promise<void> {
    for (const [key, day] of this.days) {
      for (const [id, reservation] of day.reservations) {
        if (reservation.state === 'reserved' && reservation.expiresAt <= this.now().getTime()) {
          day.reservations.delete(id);
        }
      }
      if (day.used === 0 && day.reservations.size === 0) this.days.delete(key);
    }
  }

  async close(): Promise<void> {}
}
