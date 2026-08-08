import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chatJSON, MODEL } from '../src/services/openrouter';

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
