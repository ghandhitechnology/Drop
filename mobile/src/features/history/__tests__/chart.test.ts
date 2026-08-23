/**
 * The chart's arithmetic, checked against hand computation.
 *
 * A bar is a claim about a number, so the mapping from litres to pixels is
 * worth pinning down away from a renderer: given a window of day totals and a
 * box, every bar's height here is a figure that can be worked out on paper.
 */
import { describe, expect, it } from 'vitest';

import type { DailyTotal, Entry } from '../../../data/types';
import {
  MIN_BAR_HEIGHT,
  MIN_BAR_WIDTH,
  MAX_BAR_WIDTH,
  layoutChart,
  niceMax,
  ticksFor,
} from '../chart';
import { groupByDay } from '../store';

function day(localDay: string, totalLitres: number, entryCount = 1): DailyTotal {
  return { localDay, totalLitres, entryCount, byCategory: {}, updatedAt: 0 };
}

describe('niceMax', () => {
  it('lands on the ladder', () => {
    expect(niceMax(1)).toBe(1);
    expect(niceMax(1.1)).toBe(2);
    expect(niceMax(180)).toBe(200);
    expect(niceMax(230)).toBe(250);
    expect(niceMax(300)).toBe(500);
    expect(niceMax(4200)).toBe(5000);
    expect(niceMax(0.4)).toBe(0.5);
  });

  it('leaves an exact power of ten alone', () => {
    expect(niceMax(10)).toBe(10);
    expect(niceMax(100)).toBe(100);
    expect(niceMax(1000)).toBe(1000);
  });

  it('treats an empty window as having no axis', () => {
    expect(niceMax(0)).toBe(0);
    expect(niceMax(-5)).toBe(0);
  });

  it('always halves into a figure worth printing', () => {
    // The middle guide is exactly half the top, which is why 3 is off the
    // ladder: 1500 would print as a guide nobody reads.
    for (const value of [7, 73, 640, 1234, 98765]) {
      const max = niceMax(value);
      expect(max).toBeGreaterThanOrEqual(value);
      const half = max / 2;
      expect(Number.isFinite(half)).toBe(true);
      expect(String(half).replace(/[0.]/g, '').length).toBeLessThanOrEqual(3);
    }
  });
});

describe('ticksFor', () => {
  it('carries three guides at most, top first', () => {
    expect(ticksFor(500)).toEqual([500, 250, 0]);
  });

  it('carries the baseline alone when the window is empty', () => {
    expect(ticksFor(0)).toEqual([0]);
  });
});

describe('layoutChart', () => {
  const week: DailyTotal[] = [
    day('2026-08-02', 0, 0),
    day('2026-08-03', 1200, 4),
    day('2026-08-04', 600, 3),
    day('2026-08-05', 2400, 5),
    day('2026-08-06', 0, 0),
    day('2026-08-07', 900, 3),
    day('2026-08-08', 300, 2),
  ];

  const layout = layoutChart(week, 280, 100);

  it('sums and averages over every day, quiet ones included', () => {
    expect(layout.total).toBe(5400);
    // 5400 over seven days, not over the five that had something on them.
    expect(layout.average).toBeCloseTo(5400 / 7, 10);
  });

  it('finds the busiest day', () => {
    expect(layout.peak).toEqual({ day: '2026-08-05', litres: 2400 });
  });

  it('takes its axis from the busiest day', () => {
    expect(layout.max).toBe(2500);
  });

  it('gives every bar the height its share of the axis earns', () => {
    // 2400 of an axis that tops out at 2500, in a plot 100 tall → 96.
    expect(layout.bars[3].height).toBeCloseTo(96, 10);
    // 1200 / 2500 × 100 = 48.
    expect(layout.bars[1].height).toBeCloseTo(48, 10);
    // 300 / 2500 × 100 = 12.
    expect(layout.bars[6].height).toBeCloseTo(12, 10);
  });

  it('runs every bar down to the baseline', () => {
    expect(layout.baselineY).toBe(100);
    for (const bar of layout.bars) {
      expect(bar.y + bar.height).toBeCloseTo(layout.baselineY, 10);
    }
  });

  it('leaves a quiet day with no bar at all', () => {
    expect(layout.bars[0].height).toBe(0);
    expect(layout.bars[4].height).toBe(0);
  });

  it('centres each bar in its own equal cell', () => {
    const cell = 280 / 7;
    layout.bars.forEach((bar, index) => {
      expect(bar.cellX).toBeCloseTo(index * cell, 10);
      expect(bar.cellWidth).toBeCloseTo(cell, 10);
      expect(bar.x + bar.width / 2).toBeCloseTo(bar.cellX + cell / 2, 10);
    });
  });

  it('places the guides where their own value falls', () => {
    expect(layout.ticks).toEqual([
      { value: 2500, y: 0 },
      { value: 1250, y: 50 },
      { value: 0, y: 100 },
    ]);
  });

  it('keeps a bar visible when a day holds a rounding error', () => {
    const tiny = layoutChart([day('2026-08-08', 0.2), day('2026-08-09', 4000)], 100, 100);
    expect(tiny.bars[0].height).toBe(MIN_BAR_HEIGHT);
  });

  it('holds the bar width between its bounds at either extreme', () => {
    const wide = layoutChart([day('2026-08-08', 10)], 400, 100);
    expect(wide.bars[0].width).toBe(MAX_BAR_WIDTH);

    const dense = layoutChart(
      Array.from({ length: 30 }, (_, i) => day(`2026-07-${String(i + 1).padStart(2, '0')}`, 10)),
      120,
      100,
    );
    expect(dense.bars[0].width).toBeGreaterThanOrEqual(MIN_BAR_WIDTH);
    expect(dense.bars[0].width).toBeLessThanOrEqual(MAX_BAR_WIDTH);
  });

  it('survives being laid out before it has been measured', () => {
    const unmeasured = layoutChart(week, 0, 100);
    expect(unmeasured.bars).toHaveLength(7);
    expect(unmeasured.total).toBe(5400);
  });

  it('draws a flat baseline when every day in the window is open', () => {
    const quiet = layoutChart([day('2026-08-07', 0), day('2026-08-08', 0)], 200, 100);
    expect(quiet.peak).toBeNull();
    expect(quiet.max).toBe(0);
    expect(quiet.ticks).toEqual([{ value: 0, y: 100 }]);
    expect(quiet.bars.every((bar) => bar.height === 0)).toBe(true);
  });
});

/* ------------------------------------------------------------- grouping -- */

function entry(id: string, localDay: string, litres: number): Entry {
  return {
    id,
    created_at: 0,
    local_day: localDay,
    local_week: '2026-W32',
    tz: 'Asia/Seoul',
    item_id: 'apple',
    item_label: 'Apple',
    category: 'food',
    quantity_value: 0.15,
    quantity_unit: 'kg',
    quantity_source: 'catalog_default',
    litres,
    litres_low: null,
    litres_high: null,
    metric_type: 'total_water_footprint',
    match_level: 'exact_item',
    confidence: 'low',
    input_method: 'sample',
    factors_version: '2026.08.1',
    estimate_json: '{}',
    photo_uri: null,
    note: null,
    deleted_at: null,
    estimate: {} as Entry['estimate'],
  };
}

describe('groupByDay', () => {
  it('keeps the order it was handed and totals each day from its own rows', () => {
    const sections = groupByDay([
      entry('c', '2026-08-08', 10),
      entry('b', '2026-08-08', 5),
      entry('a', '2026-08-06', 7),
    ]);

    expect(sections.map((s) => s.day)).toEqual(['2026-08-08', '2026-08-06']);
    expect(sections[0].total).toBe(15);
    expect(sections[0].data.map((e) => e.id)).toEqual(['c', 'b']);
    expect(sections[1].total).toBe(7);
  });

  it('starts a fresh day even when one comes back around', () => {
    // Ordering is the repository's job; grouping never reorders behind it.
    const sections = groupByDay([
      entry('a', '2026-08-08', 1),
      entry('b', '2026-08-06', 2),
      entry('c', '2026-08-08', 3),
    ]);
    expect(sections).toHaveLength(3);
  });

  it('has nothing to group when there is nothing', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
