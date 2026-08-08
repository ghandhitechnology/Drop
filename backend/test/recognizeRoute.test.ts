import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { app } from '../src/index';
import { MODEL } from '../src/services/openrouter';

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

describe('POST /v1/recognize inference configuration', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(MODEL_RECOGNITION) } }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses high private reasoning for photo recognition without changing the response', async () => {
    const response = await app.request('/v1/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: 'unique-high-effort-recognition-fixture',
        mime: 'image/jpeg',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      model: MODEL,
      item_count: 1,
      items: [{
        label: 'apple',
        candidates: [{ catalog_id: 'apple' }],
      }],
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const request = JSON.parse(String(init?.body));
    expect(request.reasoning).toEqual({ effort: 'high', exclude: true });
    expect(request.max_tokens).toBe(12_000);
    expect(request.temperature).toBe(0);
  });

  it('uses low reasoning in fast mode without reducing the token budget', async () => {
    const response = await app.request('/v1/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: 'unique-low-effort-recognition-fixture',
        mime: 'image/jpeg',
        mode: 'fast',
      }),
    });

    expect(response.status).toBe(200);

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const request = JSON.parse(String(init?.body));
    expect(request.reasoning).toEqual({ effort: 'low', exclude: true });
    expect(request.max_tokens).toBe(12_000);
  });

  it('rejects an unknown mode instead of silently running at high effort', async () => {
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
