/**
 * The plate aggregation, against real engine output, and the merged write:
 * several cards in, one row out, with the day total keeping step.
 */
import { estimate } from '@drop/water-engine';
import type { Estimate, QuantityUnit } from '@drop/water-engine';
import { beforeEach, describe, expect, it } from 'vitest';

import { clearAllData } from '../db';
import { dayTotal, getEntry, insertPlate, listByDay } from '../entries';
import {
  PLATE_ITEM_ID,
  buildPlateEstimate,
  isPlate,
  plateLabel,
} from '../plate';
import { FACTORS_VERSION, getTables } from '../tables';

const TZ = 'Asia/Seoul';
const tables = getTables();

function sample(id: string, value: number, unit: QuantityUnit): Estimate {
  return estimate(
    { catalog_id: id, quantity: { value, unit, source: 'vision_estimate' } },
    tables,
  );
}

/** An item whose figure arrives in a later release — no headline. */
function arriving(label: string): Estimate {
  return {
    catalog_id: '',
    display_name: label,
    category: 'food',
    headline: null,
    quantity: { value: 1, unit: 'item', source: 'vision_estimate' },
    factor: null,
    match_level: null,
    confidence: null,
    fallback_reason: null,
    assumptions: [],
    secondary: [],
    unsupported: { reason: 'not_in_catalog' },
    factors_version: FACTORS_VERSION,
  } as unknown as Estimate;
}

const APPLE = () => sample('apple', 0.15, 'kg');
const COFFEE = () => sample('coffee_standard', 0.125, 'l');
const BUS = () => sample('transport_bus', 10, 'km');

/** 2026-08-08 09:00 in Seoul. */
const MORNING = Date.parse('2026-08-08T00:00:00Z');
const DAY = '2026-08-08';

describe('buildPlateEstimate', () => {
  it('sums the headline litres across the cards', () => {
    const a = APPLE();
    const b = COFFEE();
    const plate = buildPlateEstimate([a, b]);
    expect(plate.headline!.value_l).toBeCloseTo(
      a.headline!.value_l + b.headline!.value_l,
      6,
    );
  });

  it('sums range ends, a rangeless item contributing its point to both', () => {
    const a = APPLE();
    const b = COFFEE();
    const aLow = a.headline!.range_l ? a.headline!.range_l[0] : a.headline!.value_l;
    const aHigh = a.headline!.range_l ? a.headline!.range_l[1] : a.headline!.value_l;
    const bLow = b.headline!.range_l ? b.headline!.range_l[0] : b.headline!.value_l;
    const bHigh = b.headline!.range_l ? b.headline!.range_l[1] : b.headline!.value_l;
    const plate = buildPlateEstimate([a, b]);
    if (aLow + bLow === aHigh + bHigh) {
      expect(plate.headline!.range_l).toBeNull();
    } else {
      expect(plate.headline!.range_l).toEqual([aLow + bLow, aHigh + bHigh]);
    }
  });

  it('keeps the lowest confidence on the pile', () => {
    const a = APPLE();
    const b = COFFEE();
    const ranks = { high: 3, medium: 2, low: 1, very_low: 0 } as const;
    const worst =
      a.confidence && b.confidence
        ? ranks[a.confidence] <= ranks[b.confidence]
          ? a.confidence
          : b.confidence
        : null;
    expect(buildPlateEstimate([a, b]).confidence).toBe(worst);
  });

  it('claims no match level and marks the plate_sum route', () => {
    const plate = buildPlateEstimate([APPLE(), COFFEE()]);
    expect(plate.match_level).toBeNull();
    expect(plate.fallback_reason).toBe('plate_sum');
  });

  it('takes the category with the most litres', () => {
    const plate = buildPlateEstimate([APPLE(), BUS()]);
    const food = APPLE().headline!.value_l;
    const transport = BUS().headline!.value_l;
    expect(plate.category).toBe(food >= transport ? 'food' : 'transport');
  });

  it('carries arriving-later cards in the snapshot, adding nothing', () => {
    const a = APPLE();
    const plate = buildPlateEstimate([a, COFFEE(), arriving('mystery pastry')]);
    expect(plate.headline!.value_l).toBeCloseTo(
      a.headline!.value_l + COFFEE().headline!.value_l,
      6,
    );
    expect(plate.plate.items).toHaveLength(3);
    expect(
      plate.assumptions.some((line) => line.includes('later release')),
    ).toBe(true);
  });

  it('says when the total follows the largest item across mixed metrics', () => {
    const plate = buildPlateEstimate([APPLE(), BUS()]);
    const metrics = new Set(
      [APPLE(), BUS()].map((e) => e.headline!.metric_type),
    );
    expect(
      plate.assumptions.some((line) => line.includes('largest item')),
    ).toBe(metrics.size > 1);
  });

  it('refuses a plate of nothing but arriving-later cards', () => {
    expect(() => buildPlateEstimate([arriving('one'), arriving('two')])).toThrow();
  });

  it('wears the plate label and counts its items', () => {
    const plate = buildPlateEstimate([APPLE(), COFFEE(), BUS()]);
    expect(plate.display_name).toBe(plateLabel(3));
    expect(plate.quantity).toEqual({
      value: 3,
      unit: 'item',
      source: 'vision_estimate',
    });
    expect(isPlate(plate)).toBe(true);
    expect(isPlate(APPLE())).toBe(false);
  });
});

describe('insertPlate', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('writes several cards as one row and the day total equals the sum', async () => {
    const a = APPLE();
    const b = COFFEE();
    const entry = await insertPlate([a, b], {
      inputMethod: 'camera',
      createdAt: MORNING,
      timeZone: TZ,
    });

    expect(entry.item_id).toBe(PLATE_ITEM_ID);
    expect(entry.item_label).toBe(plateLabel(2));
    expect(entry.quantity_value).toBe(2);
    expect(entry.quantity_unit).toBe('item');
    expect(entry.litres).toBeCloseTo(a.headline!.value_l + b.headline!.value_l, 6);

    const rows = await listByDay(DAY);
    expect(rows).toHaveLength(1);

    const total = await dayTotal(DAY);
    expect(total.totalLitres).toBeCloseTo(entry.litres, 6);
    expect(total.entryCount).toBe(1);
  });

  it('freezes every card inside the snapshot and reads them back', async () => {
    const entry = await insertPlate([APPLE(), COFFEE()], {
      inputMethod: 'camera',
      createdAt: MORNING,
      timeZone: TZ,
    });
    const read = await getEntry(entry.id);
    expect(read).toBeTruthy();
    expect(isPlate(read!.estimate)).toBe(true);
    if (isPlate(read!.estimate)) {
      expect(read!.estimate.plate.items.map((i) => i.catalog_id)).toEqual([
        'apple',
        'coffee_standard',
      ]);
    }
  });

  it('saves a single survivor as an ordinary entry', async () => {
    const a = APPLE();
    const entry = await insertPlate([a], {
      inputMethod: 'camera',
      createdAt: MORNING,
      timeZone: TZ,
    });
    expect(entry.item_id).toBe('apple');
    expect(isPlate(entry.estimate)).toBe(false);
  });

  it('refuses an empty plate', async () => {
    await expect(
      insertPlate([], { inputMethod: 'camera' }),
    ).rejects.toThrow();
  });
});
