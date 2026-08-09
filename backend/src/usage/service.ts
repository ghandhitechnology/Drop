import { createHash } from 'node:crypto';

import { InMemoryUsageRepository, memoryDayInfo } from './memory';
import { PostgresUsageRepository } from './postgres';
import {
  DAILY_USAGE_LIMIT,
  UsageLimitError,
  UsageReservationError,
  type ReservationResult,
  type AnalysisBranch,
  type UsageIdentity,
  type UsageLease,
  type UsageRepository,
  type UsageSnapshot,
} from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE_HEADER = 'x-drop-device-id';
const TIMEZONE_HEADER = 'x-drop-time-zone';
const ANALYSIS_HEADER = 'x-drop-analysis-id';

export type LegacyPolicy = 'allow' | 'reject';

export class UsageProtocolError extends Error {
  constructor(
    readonly status: 400 | 409 | 426 | 503,
    message: string,
  ) {
    super(message);
    this.name = 'UsageProtocolError';
  }
}

export type AnalysisAuthorization = { kind: 'legacy' } | { kind: 'metered'; lease: UsageLease };

function validTimezone(timezone: string): boolean {
  if (timezone.length === 0 || timezone.length > 80) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function virtualSnapshot(timezone: string): UsageSnapshot {
  const info = memoryDayInfo(new Date(), timezone);
  return {
    limit: DAILY_USAGE_LIMIT,
    used: 0,
    remaining: DAILY_USAGE_LIMIT,
    local_day: info.local_day,
    resets_at: info.resets_at,
  };
}

export class UsageService {
  constructor(
    readonly repository: UsageRepository | null,
    readonly enforcement: boolean,
    readonly legacyPolicy: LegacyPolicy,
  ) {}

  get ready(): boolean {
    return !this.enforcement || Boolean(this.repository?.ready);
  }

  async health(): Promise<boolean> {
    if (!this.enforcement) return true;
    return (await this.repository?.probe()) ?? false;
  }

  private identity(headers: Headers): UsageIdentity {
    const deviceId = headers.get(DEVICE_HEADER) ?? '';
    const timezone = headers.get(TIMEZONE_HEADER) ?? '';
    if (!UUID.test(deviceId)) throw new UsageProtocolError(400, 'valid device id required');
    if (!validTimezone(timezone)) throw new UsageProtocolError(400, 'valid IANA timezone required');
    return {
      deviceHash: createHash('sha256').update(deviceId).digest('hex'),
      timezone,
    };
  }

  private requireRepository(): UsageRepository {
    if (!this.repository) throw new UsageProtocolError(503, 'usage store unavailable');
    return this.repository;
  }

  private analysis(headers: Headers, analysisId: string): void {
    if (!UUID.test(analysisId)) throw new UsageProtocolError(400, 'valid analysis id required');
    const header = headers.get(ANALYSIS_HEADER) ?? '';
    if (!UUID.test(header) || header.toLowerCase() !== analysisId.toLowerCase()) {
      throw new UsageProtocolError(400, 'matching analysis id header required');
    }
  }

  async status(headers: Headers): Promise<UsageSnapshot> {
    const identity = this.identity(headers);
    if (!this.enforcement) return virtualSnapshot(identity.timezone);
    return this.requireRepository().status(identity);
  }

  async reserve(headers: Headers, analysisId: string): Promise<ReservationResult> {
    const identity = this.identity(headers);
    this.analysis(headers, analysisId);
    if (!this.enforcement) {
      return {
        usage: virtualSnapshot(identity.timezone),
        expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      };
    }
    return this.requireRepository().reserve(identity, analysisId);
  }

  async authorize(
    headers: Headers,
    branch: AnalysisBranch,
    fingerprint: string,
  ): Promise<AnalysisAuthorization> {
    if (!this.enforcement) return { kind: 'legacy' };
    const device = headers.get(DEVICE_HEADER);
    const timezone = headers.get(TIMEZONE_HEADER);
    const analysisId = headers.get(ANALYSIS_HEADER);
    if (!device && !timezone && !analysisId) {
      if (this.legacyPolicy === 'allow') {
        console.warn('[usage] legacy analysis allowed');
        return { kind: 'legacy' };
      }
      throw new UsageProtocolError(426, 'usage protocol required');
    }
    if (!device || !timezone || !analysisId) {
      throw new UsageProtocolError(400, 'complete usage headers required');
    }
    if (!UUID.test(analysisId)) throw new UsageProtocolError(400, 'valid analysis id required');
    const lease = { ...this.identity(headers), analysisId };
    try {
      await this.requireRepository().authorize(lease, branch, fingerprint);
    } catch (error) {
      if (error instanceof UsageReservationError) {
        throw new UsageProtocolError(409, error.message);
      }
      throw error;
    }
    return { kind: 'metered', lease };
  }

  async consume(
    auth: AnalysisAuthorization,
    branch: AnalysisBranch,
    fingerprint: string,
  ): Promise<UsageSnapshot | null> {
    if (auth.kind === 'legacy' || !this.enforcement) return null;
    try {
      return await this.requireRepository().consume(auth.lease, branch, fingerprint);
    } catch (error) {
      if (error instanceof UsageReservationError) {
        throw new UsageProtocolError(409, error.message);
      }
      throw error;
    }
  }

  async release(headers: Headers, analysisId: string): Promise<void> {
    const identity = this.identity(headers);
    this.analysis(headers, analysisId);
    if (!this.enforcement) return;
    await this.requireRepository().release({ ...identity, analysisId });
  }

  cleanup(): Promise<void> {
    return this.repository?.cleanup() ?? Promise.resolve();
  }
}

export function createUsageServiceFromEnv(): UsageService {
  const enforcement = (process.env.USAGE_ENFORCEMENT ?? 'on') !== 'off';
  const legacyPolicy = process.env.USAGE_LEGACY_POLICY === 'reject' ? 'reject' : 'allow';
  if (!enforcement) return new UsageService(null, false, legacyPolicy);
  const connectionString = process.env.DATABASE_URL;
  return new UsageService(
    connectionString ? new PostgresUsageRepository(connectionString) : null,
    true,
    legacyPolicy,
  );
}

export function createTestUsageService(
  options: { now?: () => Date; legacyPolicy?: LegacyPolicy } = {},
): UsageService {
  return new UsageService(
    new InMemoryUsageRepository(options.now),
    true,
    options.legacyPolicy ?? 'reject',
  );
}

export { UsageLimitError };
