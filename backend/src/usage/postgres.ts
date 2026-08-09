import { Pool, type PoolClient } from 'pg';

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

type DayInfo = { local_day: string; resets_at: Date };

function snapshot(day: DayInfo, used: number, active = 0): UsageSnapshot {
  return {
    limit: DAILY_USAGE_LIMIT,
    used,
    remaining: Math.max(0, DAILY_USAGE_LIMIT - used - active),
    local_day: day.local_day,
    resets_at: day.resets_at.toISOString(),
  };
}

async function dayInfo(client: PoolClient, timezone: string): Promise<DayInfo> {
  const result = await client.query<DayInfo>(
    `
    SELECT
      (CURRENT_TIMESTAMP AT TIME ZONE $1)::date::text AS local_day,
      ((date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE $1) + interval '1 day')
        AT TIME ZONE $1) AS resets_at
  `,
    [timezone],
  );
  return result.rows[0]!;
}

async function transaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export class PostgresUsageRepository implements UsageRepository {
  readonly ready = true;
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10 });
  }

  async probe(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async status(identity: UsageIdentity): Promise<UsageSnapshot> {
    const client = await this.pool.connect();
    try {
      const day = await dayInfo(client, identity.timezone);
      const row = await client.query<{ used_count: number }>(
        `
        SELECT used_count FROM usage_days WHERE device_hash = $1 AND local_day = $2
      `,
        [identity.deviceHash, day.local_day],
      );
      const active = await client.query<{ count: string }>(
        `
        SELECT COUNT(*)::text AS count FROM usage_reservations
        WHERE device_hash = $1 AND local_day = $2
          AND state = 'reserved' AND expires_at > CURRENT_TIMESTAMP
      `,
        [identity.deviceHash, day.local_day],
      );
      return snapshot(day, row.rows[0]?.used_count ?? 0, Number(active.rows[0]?.count ?? 0));
    } finally {
      client.release();
    }
  }

  reserve(identity: UsageIdentity, analysisId: string): Promise<ReservationResult> {
    return transaction(this.pool, async (client) => {
      const day = await dayInfo(client, identity.timezone);
      await client.query(
        `
        INSERT INTO usage_days (device_hash, local_day, timezone)
        VALUES ($1, $2, $3)
        ON CONFLICT (device_hash, local_day)
        DO UPDATE SET timezone = EXCLUDED.timezone, updated_at = CURRENT_TIMESTAMP
      `,
        [identity.deviceHash, day.local_day, identity.timezone],
      );

      const counter = await client.query<{ used_count: number }>(
        `
        SELECT used_count FROM usage_days
        WHERE device_hash = $1 AND local_day = $2
        FOR UPDATE
      `,
        [identity.deviceHash, day.local_day],
      );
      const used = counter.rows[0]!.used_count;

      await client.query(
        `
        DELETE FROM usage_reservations
        WHERE device_hash = $1 AND local_day = $2
          AND state = 'reserved' AND expires_at <= CURRENT_TIMESTAMP
      `,
        [identity.deviceHash, day.local_day],
      );

      const existing = await client.query<{ state: string; expires_at: Date }>(
        `
        SELECT state, expires_at FROM usage_reservations
        WHERE device_hash = $1 AND local_day = $2 AND analysis_id = $3
      `,
        [identity.deviceHash, day.local_day, analysisId],
      );
      if (existing.rows[0]) {
        const active = await client.query<{ count: string }>(
          `
          SELECT COUNT(*)::text AS count FROM usage_reservations
          WHERE device_hash = $1 AND local_day = $2
            AND state = 'reserved' AND expires_at > CURRENT_TIMESTAMP
        `,
          [identity.deviceHash, day.local_day],
        );
        return {
          usage: snapshot(day, used, Number(active.rows[0]?.count ?? 0)),
          expires_at: existing.rows[0].expires_at.toISOString(),
        };
      }

      const active = await client.query<{ count: string }>(
        `
        SELECT COUNT(*)::text AS count FROM usage_reservations
        WHERE device_hash = $1 AND local_day = $2
          AND state = 'reserved' AND expires_at > CURRENT_TIMESTAMP
      `,
        [identity.deviceHash, day.local_day],
      );
      const activeCount = Number(active.rows[0]?.count ?? 0);
      if (used + activeCount >= DAILY_USAGE_LIMIT) {
        throw new UsageLimitError(snapshot(day, used, activeCount));
      }

      const inserted = await client.query<{ expires_at: Date }>(
        `
        INSERT INTO usage_reservations
          (device_hash, local_day, analysis_id, state, expires_at)
        VALUES ($1, $2, $3, 'reserved', CURRENT_TIMESTAMP + ($4 * interval '1 millisecond'))
        RETURNING expires_at
      `,
        [identity.deviceHash, day.local_day, analysisId, RESERVATION_TTL_MS],
      );
      const expires = inserted.rows[0]!.expires_at;
      return {
        usage: snapshot(day, used, activeCount + 1),
        expires_at: expires.toISOString(),
      };
    });
  }

  async authorize(lease: UsageLease): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ active: boolean }>(
        `
        SELECT (state = 'consumed' OR expires_at > CURRENT_TIMESTAMP) AS active
        FROM usage_reservations
        WHERE device_hash = $1 AND analysis_id = $2
        ORDER BY local_day DESC LIMIT 1
      `,
        [lease.deviceHash, lease.analysisId],
      );
      const row = result.rows[0];
      if (!row?.active) {
        throw new UsageReservationError('analysis reservation missing or expired');
      }
    } finally {
      client.release();
    }
  }

  consume(lease: UsageLease, branch: AnalysisBranch, fingerprint: string): Promise<UsageSnapshot> {
    return transaction(this.pool, async (client) => {
      const reservation = await client.query<{
        state: string;
        expires_at: Date;
        active: boolean;
        local_day: string;
        timezone: string;
        resets_at: Date;
        barcode_fingerprint: string | null;
        recognize_fingerprint: string | null;
      }>(
        `
        SELECT r.state, r.expires_at,
          (r.state = 'consumed' OR r.expires_at > CURRENT_TIMESTAMP) AS active,
          r.local_day::text, d.timezone,
          r.barcode_fingerprint, r.recognize_fingerprint,
          ((r.local_day::timestamp + interval '1 day') AT TIME ZONE d.timezone) AS resets_at
        FROM usage_reservations r
        JOIN usage_days d USING (device_hash, local_day)
        WHERE r.device_hash = $1 AND r.analysis_id = $2
        ORDER BY r.local_day DESC LIMIT 1
        FOR UPDATE OF r
      `,
        [lease.deviceHash, lease.analysisId],
      );
      const row = reservation.rows[0];
      if (!row?.active) {
        throw new UsageReservationError('analysis reservation missing or expired');
      }
      const day: DayInfo = {
        local_day: row.local_day,
        resets_at: row.resets_at,
      };
      const prior = branch === 'barcode' ? row.barcode_fingerprint : row.recognize_fingerprint;
      if (prior && prior !== fingerprint) {
        throw new UsageReservationError(`analysis id already used for another ${branch} request`);
      }
      const fingerprintColumn =
        branch === 'barcode' ? 'barcode_fingerprint' : 'recognize_fingerprint';
      const counter = await client.query<{ used_count: number }>(
        `
        SELECT used_count FROM usage_days
        WHERE device_hash = $1 AND local_day = $2
        FOR UPDATE
      `,
        [lease.deviceHash, day.local_day],
      );
      if (!counter.rows[0]) throw new UsageReservationError('usage day missing');

      let used = counter.rows[0].used_count;
      if (!prior) {
        await client.query(
          `
          UPDATE usage_reservations SET ${fingerprintColumn} = $3
          WHERE device_hash = $1 AND local_day = $2 AND analysis_id = $4
        `,
          [lease.deviceHash, day.local_day, fingerprint, lease.analysisId],
        );
      }
      if (row.state === 'reserved') {
        await client.query(
          `
          UPDATE usage_reservations
          SET state = 'consumed', consumed_at = CURRENT_TIMESTAMP
          WHERE device_hash = $1 AND local_day = $2 AND analysis_id = $3
        `,
          [lease.deviceHash, day.local_day, lease.analysisId],
        );
        const updated = await client.query<{ used_count: number }>(
          `
          UPDATE usage_days
          SET used_count = used_count + 1, updated_at = CURRENT_TIMESTAMP
          WHERE device_hash = $1 AND local_day = $2
          RETURNING used_count
        `,
          [lease.deviceHash, day.local_day],
        );
        used = updated.rows[0]!.used_count;
      }
      const active = await client.query<{ count: string }>(
        `
        SELECT COUNT(*)::text AS count FROM usage_reservations
        WHERE device_hash = $1 AND local_day = $2
          AND state = 'reserved' AND expires_at > CURRENT_TIMESTAMP
      `,
        [lease.deviceHash, day.local_day],
      );
      return snapshot(day, used, Number(active.rows[0]?.count ?? 0));
    });
  }

  async release(lease: UsageLease): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `
        DELETE FROM usage_reservations
        WHERE device_hash = $1 AND analysis_id = $2
          AND state = 'reserved'
      `,
        [lease.deviceHash, lease.analysisId],
      );
    } finally {
      client.release();
    }
  }

  async cleanup(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        DELETE FROM usage_reservations
        WHERE (state = 'reserved' AND expires_at <= CURRENT_TIMESTAMP)
           OR local_day < (CURRENT_DATE - interval '35 days')
      `);
      await client.query(`
        DELETE FROM usage_days
        WHERE local_day < (CURRENT_DATE - interval '35 days')
      `);
    } finally {
      client.release();
    }
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}
