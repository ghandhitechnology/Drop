import { describe, expect, it } from 'vitest';
import { tables } from '../src/data';
import {
  MAX_ITEMS,
  shapeItems,
  type RawRecognition,
} from '../src/services/recognizeShape';

const APPLE = {
  label: 'apple',
  category: 'food',
  candidates: [{ catalog_id: 'apple', score: 0.9, reason: 'red apple' }],
  quantity: { value: 180, unit: 'g', basis: 'vision_estimate', evidence: null },
  detected_text: [],
  box: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
  unmatched: false,
};

describe('shapeItems', () => {
  it('keeps valid items with their own candidates, quantities and boxes', () => {
    const items = shapeItems({ items: [APPLE] }, tables);
    expect(items).toHaveLength(1);
    expect(items[0]!.candidates[0]!.catalog_id).toBe('apple');
    expect(items[0]!.quantity).toMatchObject({ value: 180, unit: 'g' });
    expect(items[0]!.box).toEqual({ x: 0.1, y: 0.1, w: 0.3, h: 0.3 });
    expect(items[0]!.unmatched).toBe(false);
  });

  it('slices past MAX_ITEMS and reindexes sequentially', () => {
    const raw: RawRecognition = {
      items: Array.from({ length: MAX_ITEMS + 4 }, () => ({ ...APPLE })),
    };
    const items = shapeItems(raw, tables);
    expect(items).toHaveLength(MAX_ITEMS);
    expect(items.map((i) => i.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('drops invalid catalog ids and falls back to a label text match', () => {
    const items = shapeItems({
      items: [{
        ...APPLE,
        label: 'almond shelled',
        candidates: [{ catalog_id: 'zzzz', score: 0.9, reason: 'x' }],
      }],
    }, tables);
    expect(items).toHaveLength(1);
    expect(items[0]!.unmatched).toBe(false);
    expect(items[0]!.candidates[0]!.catalog_id).toBe('almond_shelled');
    expect(items[0]!.candidates[0]!.repaired).toBe(true);
  });

  it('believes the model\'s unmatched flag — a dog never becomes a hot dog', () => {
    const items = shapeItems({
      items: [{
        ...APPLE,
        label: 'dog',
        category: 'product',
        candidates: [],
        unmatched: true,
      }],
    }, tables);
    expect(items).toHaveLength(1);
    expect(items[0]!.unmatched).toBe(true);
    expect(items[0]!.candidates).toEqual([]);
  });

  it('does not repair a partial-alias label even when the model tried to match', () => {
    const items = shapeItems({
      items: [{
        ...APPLE,
        label: 'dog',
        candidates: [{ catalog_id: 'zzzz', score: 0.9, reason: 'x' }],
      }],
    }, tables);
    expect(items).toHaveLength(1);
    expect(items[0]!.unmatched).toBe(true);
    expect(items[0]!.candidates).toEqual([]);
  });

  it('keeps an unmatchable labelled item as unmatched instead of dropping it', () => {
    const items = shapeItems({
      items: [{ ...APPLE, label: 'xylotherium pastry', candidates: [] }],
    }, tables);
    expect(items).toHaveLength(1);
    expect(items[0]!.unmatched).toBe(true);
    expect(items[0]!.label).toBe('xylotherium pastry');
  });

  it('drops items with no candidates and no label', () => {
    const items = shapeItems({
      items: [{ ...APPLE, label: '', candidates: [] }],
    }, tables);
    expect(items).toHaveLength(0);
  });

  it('nulls the full-frame sentinel box and degenerate boxes', () => {
    const sentinel = shapeItems({
      items: [{ ...APPLE, box: { x: 0, y: 0, w: 1, h: 1 } }],
    }, tables);
    expect(sentinel[0]!.box).toBeNull();

    const sliver = shapeItems({
      items: [{ ...APPLE, box: { x: 0.5, y: 0.5, w: 0.01, h: 0.4 } }],
    }, tables);
    expect(sliver[0]!.box).toBeNull();
  });

  it('clamps out-of-range boxes into the frame', () => {
    const items = shapeItems({
      items: [{ ...APPLE, box: { x: 0.8, y: -0.2, w: 0.6, h: 0.5 } }],
    }, tables);
    expect(items[0]!.box).toEqual({
      x: 0.8, y: 0, w: expect.closeTo(0.2, 5), h: 0.5,
    });
  });

  it('clamps candidate scores into 0..1 and caps at three per item', () => {
    const items = shapeItems({
      items: [{
        ...APPLE,
        candidates: [
          { catalog_id: 'apple', score: 7, reason: 'a' },
          { catalog_id: 'apple', score: -1, reason: 'b' },
          { catalog_id: 'apple', score: 0.5, reason: 'c' },
          { catalog_id: 'apple', score: 0.4, reason: 'd' },
        ],
      }],
    }, tables);
    expect(items[0]!.candidates).toHaveLength(3);
    expect(items[0]!.candidates[0]!.score).toBe(1);
    expect(items[0]!.candidates[1]!.score).toBe(0);
  });

  it('falls back to a scene-description search when no items survive', () => {
    const items = shapeItems({
      items: [],
      scene_description: 'a bowl of apples on a table',
    }, tables);
    expect(items).toHaveLength(1);
    expect(items[0]!.unmatched).toBe(false);
    expect(items[0]!.candidates.length).toBeGreaterThan(0);
    expect(items[0]!.candidates[0]!.reason).toBe(
      'text match on scene description',
    );
  });

  it('returns [] when the model saw nothing at all', () => {
    expect(shapeItems({ items: [], scene_description: null }, tables))
      .toEqual([]);
  });
});
