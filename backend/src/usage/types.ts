export const DAILY_USAGE_LIMIT = 20 as const;
export const RESERVATION_TTL_MS = 2 * 60 * 1000;

export type UsageSnapshot = {
  limit: typeof DAILY_USAGE_LIMIT;
  used: number;
  remaining: number;
  local_day: string;
  resets_at: string;
};

export type UsageIdentity = {
  deviceHash: string;
  timezone: string;
};

export type UsageLease = UsageIdentity & {
  analysisId: string;
};

export type AnalysisBranch = 'barcode' | 'recognize';

export type ReservationResult = {
  usage: UsageSnapshot;
  expires_at: string;
};

export interface UsageRepository {
  readonly ready: boolean;
  probe(): Promise<boolean>;
  status(identity: UsageIdentity): Promise<UsageSnapshot>;
  reserve(identity: UsageIdentity, analysisId: string): Promise<ReservationResult>;
  authorize(lease: UsageLease): Promise<void>;
  consume(lease: UsageLease, branch: AnalysisBranch, fingerprint: string): Promise<UsageSnapshot>;
  release(lease: UsageLease): Promise<void>;
  cleanup(): Promise<void>;
  close(): Promise<void>;
}

export class UsageLimitError extends Error {
  constructor(readonly usage: UsageSnapshot) {
    super('daily analysis limit reached');
    this.name = 'UsageLimitError';
  }
}

export class UsageReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageReservationError';
  }
}
