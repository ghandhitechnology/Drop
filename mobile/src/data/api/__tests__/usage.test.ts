import { describe, expect, it } from 'vitest';

import { readUsageReservation, readUsageSnapshot, usageFromHeaders } from '../usage';

const snapshot = {
  limit: 20,
  used: 7,
  remaining: 13,
  local_day: '2026-08-10',
  resets_at: '2026-08-10T15:00:00.000Z',
};

describe('usage wire validation', () => {
  it('accepts the complete authoritative snapshot', () => {
    expect(readUsageSnapshot(snapshot)).toEqual(snapshot);
    expect(
      readUsageReservation({
        usage: snapshot,
        expires_at: '2026-08-10T03:02:00.000Z',
      }),
    ).toEqual({
      usage: snapshot,
      expires_at: '2026-08-10T03:02:00.000Z',
    });
  });

  it('rejects partial, negative, and unreadable values', () => {
    expect(readUsageSnapshot({ ...snapshot, remaining: -1 })).toBeNull();
    expect(readUsageSnapshot({ ...snapshot, local_day: 'today' })).toBeNull();
    expect(readUsageSnapshot({ ...snapshot, resets_at: 'midnight' })).toBeNull();
    expect(readUsageReservation({ usage: snapshot })).toBeNull();
  });

  it('reconstructs snapshots from rate-limit response headers', () => {
    expect(
      usageFromHeaders(
        new Headers({
          'RateLimit-Limit': '20',
          'RateLimit-Remaining': '13',
          'RateLimit-Reset': String(Date.parse(snapshot.resets_at) / 1000),
          'X-Drop-Usage-Used': '7',
          'X-Drop-Usage-Day': '2026-08-10',
        }),
      ),
    ).toEqual(snapshot);
  });
});
