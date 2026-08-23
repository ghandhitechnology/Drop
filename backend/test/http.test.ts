/** Malformed/empty JSON bodies must return a clean 400 on every POST route,
 * never a raw 500 from an uncaught c.req.json() parse failure. */
import { describe, expect, it } from 'vitest';
import { app } from '../src/index';

const POST_ROUTES = ['/v1/estimate', '/v1/recognize', '/v1/research'];

describe('malformed JSON body handling', () => {
  for (const path of POST_ROUTES) {
    it(`${path} returns 400 invalid JSON body on unparseable body`, async () => {
      const res = await app.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not valid json',
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({ error: 'invalid JSON body' });
    });

    it(`${path} returns 400 invalid JSON body on empty body`, async () => {
      const res = await app.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({ error: 'invalid JSON body' });
    });
  }

  it('/v1/estimate translates engine throws into 400 with the message', async () => {
    const res = await app.request('/v1/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        catalog_id: 'not_a_real_catalog_id',
        quantity: { value: 1, unit: 'kg', source: 'user_entered' },
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/unknown catalog_id/);
  });

  it('/v1/estimate still works for a valid, well-formed body', async () => {
    const res = await app.request('/v1/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        catalog_id: 'apple',
        quantity: { value: 150, unit: 'g', source: 'user_entered' },
      }),
    });
    expect(res.status).toBe(200);
  });
});

describe('health contract', () => {
  it('reports every field required by production verification', async () => {
    const res = await app.request('/v1/health');
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'catalog_version',
      'factors_version',
      'model',
      'ok',
      'usage_enforcement',
      'usage_legacy_policy',
      'usage_store',
    ]);
    expect(body).toMatchObject({
      ok: true,
      factors_version: '2026.08.2',
      catalog_version: '2026.08.2',
      model: 'openai/gpt-5.6-luna',
    });
    expect(['ready', 'unavailable']).toContain(body.usage_store);
    expect(['on', 'off']).toContain(body.usage_enforcement);
    expect(['allow', 'reject']).toContain(body.usage_legacy_policy);
  });
});
