import { beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({
  post: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../../../data/api/client', () => ({
  getJson: vi.fn(),
  postJson: transport.post,
  deleteJson: transport.remove,
}));
vi.mock('../identity', () => ({
  installationId: vi.fn().mockResolvedValue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
}));
vi.mock('../../../lib/time', () => ({ deviceTimeZone: () => 'Asia/Seoul' }));
vi.mock('expo-crypto', () => ({
  randomUUID: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
}));

const ANALYSIS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const snapshot = {
  limit: 20,
  used: 0,
  remaining: 19,
  local_day: '2026-08-10',
  resets_at: '2026-08-10T15:00:00.000Z',
};

describe('usage API protocol', () => {
  beforeEach(() => {
    transport.post.mockReset().mockResolvedValue({
      usage: snapshot,
      expires_at: '2026-08-10T03:02:00.000Z',
    });
    transport.remove.mockReset().mockResolvedValue(undefined);
  });

  it('uses the same analysis ID in the reservation body and headers', async () => {
    const { reserveAnalysis } = await import('../api');
    await reserveAnalysis(ANALYSIS);

    expect(transport.post).toHaveBeenCalledWith(
      '/v1/usage/reservations',
      { analysis_id: ANALYSIS },
      {
        headers: {
          'X-Drop-Device-Id': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'X-Drop-Time-Zone': 'Asia/Seoul',
          'X-Drop-Analysis-Id': ANALYSIS,
        },
      },
    );
  });

  it('carries the analysis ID when releasing a reservation', async () => {
    const { releaseAnalysis } = await import('../api');
    await releaseAnalysis(ANALYSIS);

    expect(transport.remove).toHaveBeenCalledWith(`/v1/usage/reservations/${ANALYSIS}`, {
      timeoutMs: 5_000,
      headers: {
        'X-Drop-Device-Id': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'X-Drop-Time-Zone': 'Asia/Seoul',
        'X-Drop-Analysis-Id': ANALYSIS,
      },
    });
  });
});
