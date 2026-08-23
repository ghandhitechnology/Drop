import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  sourceCode: {
    scriptURL: 'http://192.168.0.13:8081/index.bundle?platform=ios',
  },
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: {} },
}));

vi.mock('react-native', () => ({
  NativeModules: { SourceCode: { getConstants: () => native.sourceCode } },
  Platform: { OS: 'ios' },
}));

// Mocks must be registered before this native-facing module is evaluated.
// eslint-disable-next-line import/first
import { apiBaseUrl, getText, hostFromUri, postJson } from '../client';
// eslint-disable-next-line import/first
import { ApiError } from '../errors';
// eslint-disable-next-line import/first
import { observeUsage } from '../usage';

describe('development API host', () => {
  beforeEach(() => {
    native.sourceCode.scriptURL = 'http://192.168.0.13:8081/index.bundle?platform=ios';
  });

  it('uses the LAN host of the bundle loaded by a physical development build', () => {
    expect(apiBaseUrl()).toBe('http://192.168.0.13:8787');
  });

  it('reads both full bundle URLs and Expo host:port values', () => {
    expect(hostFromUri('http://10.0.2.2:8081/index.bundle')).toBe('10.0.2.2');
    expect(hostFromUri('192.168.1.8:8081')).toBe('192.168.1.8');
  });

  it('falls back safely for an embedded file URL', () => {
    native.sourceCode.scriptURL = 'file:///private/var/containers/main.jsbundle';
    expect(apiBaseUrl()).toBe('http://localhost:8787');
  });
});

describe('rate-limit transport', () => {
  afterEach(() => {
    observeUsage(null);
    vi.unstubAllGlobals();
  });

  it('publishes the authoritative snapshot and throws a typed 429 error', async () => {
    const usage = {
      limit: 20,
      used: 20,
      remaining: 0,
      local_day: '2026-08-10',
      resets_at: '2026-08-10T15:00:00.000Z',
    };
    const seen: unknown[] = [];
    observeUsage((snapshot) => seen.push(snapshot));
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: 'daily_analysis_limit', usage }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
    );

    const error = await postJson('/v1/usage/reservations', {}).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'rate_limited', status: 429, usage });
    expect(seen).toEqual([usage]);
  });

  it('accepts an empty 204 response for reservation cleanup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(postJson<void>('/cleanup', {})).resolves.toBeUndefined();
  });

  it('returns exact response text for hash-covered release artifacts', async () => {
    const artifact = '{\n "version": "2026.09.1"\n}\n';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(artifact)));
    await expect(getText('/v1/manifest')).resolves.toBe(artifact);
  });
});
