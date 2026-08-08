import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseLabelQuantity } from '../src/routes/barcode';
import { app } from '../src/index';
import { tables } from '../src/data';

describe('parseLabelQuantity', () => {
  it('passes grams through unchanged', () => {
    expect(parseLabelQuantity(150, 'g')).toEqual({ value: 150, unit: 'g' });
  });

  it('passes millilitres through unchanged', () => {
    expect(parseLabelQuantity(330, 'ml')).toEqual({ value: 330, unit: 'ml' });
  });

  it('converts centilitres to millilitres (x10, not /100)', () => {
    expect(parseLabelQuantity(33, 'cl')).toEqual({ value: 330, unit: 'ml' });
  });

  it('passes litres through unchanged', () => {
    expect(parseLabelQuantity(1.5, 'l')).toEqual({ value: 1.5, unit: 'l' });
  });

  it('is case-insensitive on the unit', () => {
    expect(parseLabelQuantity(33, 'CL')).toEqual({ value: 330, unit: 'ml' });
  });
});

/** The mapping prompt must carry a searched shortlist, never the whole
 * catalog. Every product below uses a tag the catalog index cannot match, so
 * the route always reaches the LLM step. */
describe('barcode LLM mapping shortlist', () => {
  const jsonResponse = (body: object) => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const modelPrompts: string[] = [];

  /** Answers OFF with `product`, and answers OpenRouter by picking a
   * candidate id back out of the prompt it was handed. */
  const stubUpstreams = (product: object) => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      if (String(input).includes('openfoodfacts')) {
        return jsonResponse({ status: 1, product });
      }
      const sent = JSON.parse(String(init?.body)) as {
        messages: { content: string }[];
      };
      const prompt = sent.messages[1]!.content;
      modelPrompts.push(prompt);
      const picked = prompt.split('\n').at(-1)!.split('|')[0];
      return jsonResponse({
        choices: [{
          message: {
            content: JSON.stringify({ catalog_id: picked, confident: true }),
          },
        }],
      });
    });
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  beforeEach(() => {
    modelPrompts.length = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('offers at most 25 real catalog rows as catalog_id|display_name', async () => {
    stubUpstreams({
      product_name: 'Organic Apple Juice',
      brands: 'Testbrand',
      categories_tags: ['en:zzqx'],
    });

    const res = await app.request('/v1/barcode/50000001');
    expect(res.status).toBe(200);

    const candidates = modelPrompts[0]!
      .split('Candidates (catalog_id|display_name):\n')[1]!
      .split('\n');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(25);
    for (const line of candidates) {
      const [id, name] = line.split('|');
      expect(tables.catalog.has(id!)).toBe(true);
      expect(name).toBeTruthy();
    }
    // The pre-fix prompt named every row; the shortlist must not.
    expect(candidates.length).toBeLessThan(tables.catalog.size);
  });

  it('keeps a shortlisted pick at medium confidence', async () => {
    stubUpstreams({
      product_name: 'Apple Juice',
      categories_tags: ['en:zzqx'],
    });

    const res = await app.request('/v1/barcode/50000002');
    const body = await res.json() as {
      mapping: { catalog_id: string; match_level: string; confidence: string };
      coverage_miss: boolean;
    };
    expect(body.mapping.match_level).toBe('llm_assisted');
    expect(body.mapping.confidence).toBe('medium');
    expect(tables.catalog.has(body.mapping.catalog_id)).toBe(true);
    expect(body.coverage_miss).toBe(false);
  });

  it('skips the model entirely when nothing shortlists', async () => {
    const fetchMock = stubUpstreams({
      product_name: 'Zzqxv',
      categories_tags: ['en:zzqx'],
    });

    const res = await app.request('/v1/barcode/50000003');
    const body = await res.json() as { coverage_miss: boolean };

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(modelPrompts).toHaveLength(0);
    expect(body.coverage_miss).toBe(true);
  });
});
