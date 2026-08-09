import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { app } from '../src/index';
import { MODEL } from '../src/services/openrouter';

const MODEL_DETECTION = {
  items: [{
    label: 'apple',
    description: 'one whole red apple on a wooden table',
    category: 'food',
    quantity: {
      value: 180,
      unit: 'g',
      basis: 'vision_estimate',
      evidence: 'one medium apple',
    },
    detected_text: [],
    box: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 },
  }],
  scene_description: null,
};

const MODEL_RERANK = {
  decisions: [
    { index: 0, catalog_id: 'apple', confidence: 0.92, reason: 'is an apple' },
  ],
};

const MODEL_RECOGNITION = {
  items: [{
    label: 'apple',
    category: 'food',
    candidates: [{ catalog_id: 'apple', score: 0.92, reason: 'whole red apple' }],
    quantity: {
      value: 180,
      unit: 'g',
      basis: 'vision_estimate',
      evidence: 'one medium apple',
    },
    detected_text: [],
    box: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 },
    unmatched: false,
  }],
  scene_description: null,
};

function modelResponse(payload: unknown): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /v1/recognize split-pipeline inference configuration', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(modelResponse(MODEL_DETECTION))
      .mockResolvedValueOnce(modelResponse(MODEL_RERANK)));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('runs detect at medium effort then rerank at low, same wire shape', async () => {
    const response = await app.request('/v1/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: 'unique-split-normal-fixture',
        mime: 'image/jpeg',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      model: MODEL,
      item_count: 1,
      items: [{
        label: 'apple',
        candidates: [{ catalog_id: 'apple', score: 0.92 }],
        unmatched: false,
      }],
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    const [, detectInit] = vi.mocked(fetch).mock.calls[0]!;
    const detect = JSON.parse(String(detectInit?.body));
    expect(detect.reasoning).toEqual({ effort: 'medium', exclude: true });
    expect(detect.max_tokens).toBe(8_000);
    expect(detect.temperature).toBe(0);
    // The whole point of the split: no thousand-row catalog in the vision call.
    expect(JSON.stringify(detect.messages)).not.toContain('CONTROLLED CATALOG');

    const [, rerankInit] = vi.mocked(fetch).mock.calls[1]!;
    const rerank = JSON.parse(String(rerankInit?.body));
    expect(rerank.reasoning).toEqual({ effort: 'low', exclude: true });
    expect(rerank.max_tokens).toBe(3_000);
  });

  it('drops both calls to low/minimal effort in fast mode', async () => {
    const response = await app.request('/v1/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: 'unique-split-fast-fixture',
        mime: 'image/jpeg',
        mode: 'fast',
      }),
    });

    expect(response.status).toBe(200);

    const [, detectInit] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(String(detectInit?.body)).reasoning)
      .toEqual({ effort: 'low', exclude: true });
    const [, rerankInit] = vi.mocked(fetch).mock.calls[1]!;
    expect(JSON.parse(String(rerankInit?.body)).reasoning)
      .toEqual({ effort: 'minimal', exclude: true });
  });

  it('rejects an unknown mode instead of silently running at medium effort', async () => {
    const response = await app.request('/v1/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: 'unique-bad-mode-fixture',
        mime: 'image/jpeg',
        mode: 'Fast',
      }),
    });

    expect(response.status).toBe(400);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe('POST /v1/recognize mono rollback switch', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubEnv('RECOGNIZE_PIPELINE', 'mono');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      modelResponse(MODEL_RECOGNITION)));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('runs the original single call at high effort with the full catalog', async () => {
    const response = await app.request('/v1/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: 'unique-mono-rollback-fixture',
        mime: 'image/jpeg',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      model: MODEL,
      item_count: 1,
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const request = JSON.parse(String(init?.body));
    expect(request.reasoning).toEqual({ effort: 'high', exclude: true });
    expect(request.max_tokens).toBe(12_000);
    expect(JSON.stringify(request.messages)).toContain('CONTROLLED CATALOG');
  });
});

/** An upstream model failure is a 502 with a body the app can read, never
 * Hono's plain-text 500. */
describe('model failures on the two model-backed routes', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('upstream on fire', { status: 502 }),
    ));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POST /v1/recognize answers 502 model unavailable', async () => {
    const res = await app.request('/v1/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: 'unique-model-failure-fixture',
        mime: 'image/jpeg',
      }),
    });

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: 'model unavailable' });
  });

  it('POST /v1/research answers 502 model unavailable', async () => {
    const res = await app.request('/v1/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catalog_id: 'apple' }),
    });

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: 'model unavailable' });
  });
});
