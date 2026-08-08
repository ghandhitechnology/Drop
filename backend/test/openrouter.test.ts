import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  chatJSON, chatJSONRetry, OpenRouterError, MODEL,
} from '../src/services/openrouter';

const RESPONSE = {
  choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
};

const BASE_OPTIONS = {
  schemaName: 'test_response',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok'],
    properties: { ok: { type: 'boolean' } },
  },
  messages: [{ role: 'user' as const, content: 'Return JSON.' }],
};

describe('chatJSON request configuration', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends high private reasoning and an explicit token budget when requested', async () => {
    await expect(chatJSON({
      ...BASE_OPTIONS,
      reasoningEffort: 'high',
      maxTokens: 12_000,
    })).resolves.toEqual({ ok: true });

    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(String(init?.body));

    expect(body).toMatchObject({
      model: MODEL,
      temperature: 0,
      max_tokens: 12_000,
      reasoning: { effort: 'high', exclude: true },
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'test_response', strict: true },
      },
    });
  });

  it('omits reasoning and max_tokens from calls using existing defaults', async () => {
    await chatJSON(BASE_OPTIONS);

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(String(init?.body));

    expect(body).not.toHaveProperty('reasoning');
    expect(body).not.toHaveProperty('max_tokens');
    expect(body.temperature).toBe(0);
  });
});

/** A second attempt only helps when the first failure had nothing to do with
 * the request we sent. Everything else must fail once and fail fast. */
describe('chatJSONRetry transient-only retry', () => {
  const stubFetch = (fetchMock: ReturnType<typeof vi.fn>) => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  const jsonResponse = (status: number, body: object) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('retries a dropped connection and returns the second attempt', async () => {
    const fetchMock = stubFetch(vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse(200, RESPONSE)));

    await expect(chatJSONRetry(BASE_OPTIONS)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries an OpenRouter 5xx', async () => {
    const fetchMock = stubFetch(vi.fn()
      .mockResolvedValueOnce(jsonResponse(503, { error: 'overloaded' }))
      .mockResolvedValueOnce(jsonResponse(200, RESPONSE)));

    await expect(chatJSONRetry(BASE_OPTIONS)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 400 the request itself caused', async () => {
    const fetchMock = stubFetch(vi.fn()
      .mockResolvedValue(jsonResponse(400, { error: 'bad schema' })));

    await expect(chatJSONRetry(BASE_OPTIONS)).rejects.toMatchObject({
      name: 'OpenRouterError',
      kind: 'http',
      status: 400,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not retry a missing API key, and never reaches the network', async () => {
    const fetchMock = vi.fn();
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubGlobal('fetch', fetchMock);

    await expect(chatJSONRetry(BASE_OPTIONS)).rejects.toMatchObject({
      name: 'OpenRouterError',
      kind: 'config',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry an empty model response', async () => {
    const fetchMock = stubFetch(vi.fn()
      .mockResolvedValue(jsonResponse(200, { choices: [] })));

    await expect(chatJSONRetry(BASE_OPTIONS)).rejects.toMatchObject({
      name: 'OpenRouterError',
      kind: 'response',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not retry unparseable model content', async () => {
    const fetchMock = stubFetch(vi.fn().mockResolvedValue(jsonResponse(200, {
      choices: [{ message: { content: 'not json at all' } }],
    })));

    await expect(chatJSONRetry(BASE_OPTIONS)).rejects.toBeInstanceOf(SyntaxError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rethrows an abort immediately', async () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    const fetchMock = stubFetch(vi.fn().mockRejectedValue(abort));

    await expect(chatJSONRetry(BASE_OPTIONS)).rejects.toBe(abort);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('leaves a 500 wrapped with its status for callers to inspect', async () => {
    stubFetch(vi.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' })));

    const err = await chatJSON(BASE_OPTIONS).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OpenRouterError);
    expect((err as OpenRouterError).status).toBe(500);
  });
});
