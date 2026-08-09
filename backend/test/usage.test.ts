import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/index';
import { memoryDayInfo } from '../src/usage/memory';
import { createTestUsageService } from '../src/usage/service';

const DEVICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const headers = (analysisId?: string) => ({
  'X-Drop-Device-Id': DEVICE,
  'X-Drop-Time-Zone': 'Asia/Seoul',
  ...(analysisId ? { 'X-Drop-Analysis-Id': analysisId } : {}),
});
const id = (at: number) => `00000000-0000-4000-8000-${String(at).padStart(12, '0')}`;

describe('daily usage service', () => {
  it('reserves and consumes twenty distinct analyses, then rejects the next', async () => {
    const usage = createTestUsageService();
    for (let index = 1; index <= 20; index += 1) {
      const analysisId = id(index);
      const reservation = await usage.reserve(new Headers(headers(analysisId)), analysisId);
      expect(reservation.usage.used).toBe(index - 1);
      const authorization = await usage.authorize(new Headers(headers(analysisId)));
      const snapshot = await usage.consume(authorization, 'recognize', `photo-${index}`);
      expect(snapshot?.used).toBe(index);
    }
    await expect(usage.reserve(new Headers(headers(id(21))), id(21))).rejects.toMatchObject({
      usage: { used: 20, remaining: 0 },
    });
  });

  it('is idempotent across parallel consumers and never refunds consumed work', async () => {
    const usage = createTestUsageService();
    const analysisId = id(30);
    await usage.reserve(new Headers(headers(analysisId)), analysisId);
    const authorization = await usage.authorize(new Headers(headers(analysisId)));
    const [first, second] = await Promise.all([
      usage.consume(authorization, 'barcode', '00000001'),
      usage.consume(authorization, 'recognize', 'photo-hash'),
    ]);
    expect(first?.used).toBe(1);
    expect(second?.used).toBe(1);
    await expect(usage.consume(authorization, 'recognize', 'different-photo')).rejects.toThrow(
      /another recognize request/,
    );
    await usage.release(new Headers(headers(analysisId)), analysisId);
    await expect(usage.status(new Headers(headers()))).resolves.toMatchObject({
      used: 1,
    });
  });

  it('expires abandoned reservations and accepts capacity again', async () => {
    let now = new Date('2026-08-10T03:00:00.000Z');
    const usage = createTestUsageService({ now: () => now });
    await usage.reserve(new Headers(headers(id(40))), id(40));
    expect((await usage.status(new Headers(headers()))).remaining).toBe(19);
    now = new Date(now.getTime() + 121_000);
    expect((await usage.status(new Headers(headers()))).remaining).toBe(20);
  });

  it('keeps a reservation on the local day where it began across midnight', async () => {
    let now = new Date('2026-08-10T14:59:30.000Z');
    const usage = createTestUsageService({ now: () => now });
    const analysisId = id(50);
    await usage.reserve(new Headers(headers(analysisId)), analysisId);
    const authorization = await usage.authorize(new Headers(headers(analysisId)));
    now = new Date('2026-08-10T15:00:10.000Z');
    const priorDay = await usage.consume(authorization, 'recognize', 'midnight-photo');
    expect(priorDay).toMatchObject({ local_day: '2026-08-10', used: 1 });
    await expect(usage.status(new Headers(headers()))).resolves.toMatchObject({
      local_day: '2026-08-11',
      used: 0,
    });
  });

  it('computes the next local midnight through a DST boundary', () => {
    expect(memoryDayInfo(new Date('2026-03-08T06:30:00.000Z'), 'America/New_York')).toEqual({
      local_day: '2026-03-08',
      resets_at: '2026-03-09T04:00:00.000Z',
    });
  });
});

describe('usage HTTP protocol', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('validates identity and rejects legacy analysis when configured', async () => {
    const app = createApp({
      usage: createTestUsageService({ legacyPolicy: 'reject' }),
    });
    expect((await app.request('/v1/usage')).status).toBe(400);
    const legacy = await app.request('/v1/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: 'legacy' }),
    });
    expect(legacy.status).toBe(426);
  });

  it('requires the reservation body and analysis header to match', async () => {
    const app = createApp({ usage: createTestUsageService() });
    const response = await app.request('/v1/usage/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers(id(301)) },
      body: JSON.stringify({ analysis_id: id(302) }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'usage_protocol_error',
      message: 'matching analysis id header required',
    });
  });

  it('returns limit metadata and Retry-After on the twenty-first reservation', async () => {
    const usage = createTestUsageService();
    const app = createApp({ usage });
    for (let index = 1; index <= 20; index += 1) {
      const analysisId = id(100 + index);
      await usage.reserve(new Headers(headers(analysisId)), analysisId);
      const authorization = await usage.authorize(new Headers(headers(analysisId)));
      await usage.consume(authorization, 'recognize', `photo-${index}`);
    }
    const response = await app.request('/v1/usage/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers(id(121)) },
      body: JSON.stringify({ analysis_id: id(121) }),
    });
    expect(response.status).toBe(429);
    expect(response.headers.get('RateLimit-Remaining')).toBe('0');
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
    await expect(response.json()).resolves.toMatchObject({
      error: 'daily_analysis_limit',
      usage: { used: 20, remaining: 0 },
    });
  });

  it('consumes a presentable recognition once and exposes the new snapshot', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubEnv('RECOGNIZE_PIPELINE', 'mono');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    items: [
                      {
                        label: 'apple',
                        category: 'food',
                        candidates: [
                          {
                            catalog_id: 'apple',
                            score: 0.95,
                            reason: 'whole apple',
                          },
                        ],
                        quantity: {
                          value: 180,
                          unit: 'g',
                          basis: 'vision_estimate',
                          evidence: 'one apple',
                        },
                        detected_text: [],
                        box: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
                        unmatched: false,
                      },
                    ],
                    scene_description: null,
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const usage = createTestUsageService();
    const app = createApp({ usage });
    const analysisId = id(200);
    const reservation = await app.request('/v1/usage/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers(analysisId) },
      body: JSON.stringify({ analysis_id: analysisId }),
    });
    expect(reservation.status).toBe(201);

    const recognized = await app.request('/v1/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers(analysisId) },
      body: JSON.stringify({ image_base64: 'metered-success-fixture' }),
    });
    expect(recognized.status).toBe(200);
    expect(recognized.headers.get('X-Drop-Usage-Used')).toBe('1');

    const status = await app.request('/v1/usage', { headers: headers() });
    await expect(status.json()).resolves.toMatchObject({
      used: 1,
      remaining: 19,
    });
  });
});
