import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tables } from '../src/data';
import { groundItem } from '../src/services/ground';
import { recognizeSplit } from '../src/services/recognizeSplit';
import type { RawDetection } from '../src/services/detect';
import type { RerankDecision } from '../src/services/rerank';

vi.mock('../src/services/detect', async (importOriginal) => ({
  ...await importOriginal<object>(),
  detectItems: vi.fn(),
}));
vi.mock('../src/services/rerank', async (importOriginal) => ({
  ...await importOriginal<object>(),
  rerankItems: vi.fn(),
}));

const { detectItems } = await import('../src/services/detect');
const { rerankItems } = await import('../src/services/rerank');
const mockDetect = vi.mocked(detectItems);
const mockRerank = vi.mocked(rerankItems);

function detection(items: RawDetection['items']): RawDetection {
  return { items, scene_description: null };
}

const DOG = {
  label: 'dog',
  description: 'a live golden retriever sitting on grass',
  category: 'product',
  quantity: { value: 1, unit: 'item', basis: 'vision_estimate', evidence: null },
  detected_text: [],
  box: { x: 0.2, y: 0.2, w: 0.5, h: 0.6 },
};

const HOTDOG = {
  label: 'hot dog',
  description: 'grilled hot dog sausage in a bun with mustard',
  category: 'food',
  quantity: { value: 150, unit: 'g', basis: 'vision_estimate', evidence: null },
  detected_text: [],
  box: { x: 0.1, y: 0.1, w: 0.4, h: 0.3 },
};

describe('groundItem', () => {
  it('puts sausages on the shortlist for actual hot dog text, as full', () => {
    const list = groundItem('grilled hot dog in a bun', tables);
    const sausages = list.find((g) => g.entry.catalog_id === 'sausages');
    expect(sausages?.full).toBe(true);
  });

  it('marks partial-alias overlap as not full ("dog" alone)', () => {
    const list = groundItem('dog sitting on grass', tables);
    for (const g of list) expect(g.full).toBe(false);
  });

  it('returns [] for empty text', () => {
    expect(groundItem('', tables)).toEqual([]);
  });
});

describe('recognizeSplit', () => {
  beforeEach(() => {
    mockDetect.mockReset();
    mockRerank.mockReset();
  });

  it('keeps an item unmatched when the re-ranker answers null', async () => {
    mockDetect.mockResolvedValue(detection([DOG]));
    mockRerank.mockResolvedValue([
      { index: 0, catalog_id: null, confidence: 0.9, reason: 'live animal' },
    ] satisfies RerankDecision[]);

    const result = await recognizeSplit('data:x', undefined, 'normal', tables);
    if (!result.ok) throw new Error('unexpected violation');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.unmatched).toBe(true);
    expect(result.items[0]!.candidates).toEqual([]);
  });

  it('accepts a shortlist pick from the re-ranker', async () => {
    mockDetect.mockResolvedValue(detection([HOTDOG]));
    mockRerank.mockResolvedValue([
      { index: 0, catalog_id: 'sausages', confidence: 0.85, reason: 'is one' },
    ]);

    const result = await recognizeSplit('data:x', undefined, 'normal', tables);
    if (!result.ok) throw new Error('unexpected violation');
    expect(result.items[0]!.candidates[0]).toMatchObject({
      catalog_id: 'sausages', score: 0.85, repaired: false,
    });
    expect(result.items[0]!.unmatched).toBe(false);
  });

  it('rejects a re-rank id from outside the shortlist', async () => {
    mockDetect.mockResolvedValue(detection([DOG]));
    mockRerank.mockResolvedValue([
      { index: 0, catalog_id: 'apple', confidence: 0.9, reason: 'nonsense' },
    ]);

    const result = await recognizeSplit('data:x', undefined, 'normal', tables);
    if (!result.ok) throw new Error('unexpected violation');
    // No full alias for "dog" -> alias fallback yields nothing.
    expect(result.items[0]!.unmatched).toBe(true);
  });

  it('degrades to full-alias matches when the re-ranker call dies', async () => {
    mockDetect.mockResolvedValue(detection([HOTDOG, DOG]));
    mockRerank.mockRejectedValue(new Error('boom'));

    const result = await recognizeSplit('data:x', undefined, 'normal', tables);
    if (!result.ok) throw new Error('unexpected violation');
    expect(result.items[0]!.candidates[0]).toMatchObject({
      catalog_id: 'sausages', repaired: true,
    });
    expect(result.items[1]!.unmatched).toBe(true);
  });

  it('drops category "other" items entirely', async () => {
    mockDetect.mockResolvedValue(detection([{ ...DOG, category: 'other' }]));
    mockRerank.mockResolvedValue([]);

    const result = await recognizeSplit('data:x', undefined, 'normal', tables);
    if (!result.ok) throw new Error('unexpected violation');
    expect(result.items).toHaveLength(0);
    expect(mockRerank).not.toHaveBeenCalled();
  });
});
