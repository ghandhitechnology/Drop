/**
 * Chart arithmetic, kept away from the drawing.
 *
 * Everything here is a pure function of the day totals and the box they have
 * to fit in, so the numbers a bar claims can be checked against a hand
 * computation without a renderer, a canvas, or a device in the loop.
 */

import type { DailyTotal } from '../../data/types';

/** How many horizontal guides the plot carries, at most. Zero counts. */
export const MAX_TICKS = 3;

/** Widest a single bar is allowed to get, however few there are. */
export const MAX_BAR_WIDTH = 22;
/** Narrowest a bar is drawn, however many there are. */
export const MIN_BAR_WIDTH = 3;
/** A day with water in it always shows, even when the day is a rounding error. */
export const MIN_BAR_HEIGHT = 3;

const STEPS = [1, 2, 2.5, 5, 10];

/**
 * The axis top: the smallest 1 / 2 / 2.5 / 5 × 10ⁿ figure at or above `value`.
 *
 * Halving it has to stay readable too, because the middle guide is exactly
 * half — which is why 2.5 is in the ladder and 3 is not.
 */
export function niceMax(value: number): number {
  if (!(value > 0)) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of STEPS) {
    const candidate = step * magnitude;
    // Guard the float: 1000 against a max of exactly 1000 must not step up.
    if (candidate >= value - value * 1e-12) return candidate;
  }
  return 10 * magnitude;
}

/** The guide values, top first. An empty window carries the baseline alone. */
export function ticksFor(max: number): number[] {
  if (max <= 0) return [0];
  return [max, max / 2, 0];
}

export type ChartBar = {
  /** The `YYYY-MM-DD` key this bar stands for. */
  day: string;
  litres: number;
  /** Left edge and width of the drawn bar, in plot coordinates. */
  x: number;
  width: number;
  /** Top edge. The bar runs from here down to `baselineY`. */
  y: number;
  height: number;
  /** Index into the source array, oldest first. */
  index: number;
  /** The cell the bar is centred in — used for the accessible hit area. */
  cellX: number;
  cellWidth: number;
};

export type ChartLayout = {
  bars: ChartBar[];
  /** Guide values with the y they sit at, top first. */
  ticks: { value: number; y: number }[];
  baselineY: number;
  max: number;
  /** Total across the window. */
  total: number;
  /** Mean over every day in the window, open days included. */
  average: number;
  /** The busiest day, or nothing while the whole window is still open. */
  peak: { day: string; litres: number } | null;
};

/**
 * Lay the window out inside a `width × height` plot.
 *
 * The plot's own origin is its top-left; the baseline is its bottom edge. Bars
 * are centred in equal cells so the spacing stays even whether the window holds
 * seven days or thirty.
 */
export function layoutChart(
  days: DailyTotal[],
  width: number,
  height: number,
): ChartLayout {
  const count = days.length;
  const baselineY = height;

  let total = 0;
  let peak: { day: string; litres: number } | null = null;
  for (const day of days) {
    total += day.totalLitres;
    if (day.totalLitres > 0 && (!peak || day.totalLitres > peak.litres)) {
      peak = { day: day.localDay, litres: day.totalLitres };
    }
  }

  const max = niceMax(peak ? peak.litres : 0);
  const cellWidth = count > 0 ? width / count : 0;
  const barWidth = Math.max(
    MIN_BAR_WIDTH,
    Math.min(MAX_BAR_WIDTH, cellWidth * 0.62),
  );

  const bars: ChartBar[] = days.map((day, index) => {
    const scaled = max > 0 ? (day.totalLitres / max) * height : 0;
    const barHeight =
      day.totalLitres > 0 ? Math.max(MIN_BAR_HEIGHT, scaled) : 0;
    const cellX = index * cellWidth;
    return {
      day: day.localDay,
      litres: day.totalLitres,
      x: cellX + (cellWidth - barWidth) / 2,
      width: barWidth,
      y: baselineY - barHeight,
      height: barHeight,
      index,
      cellX,
      cellWidth,
    };
  });

  const ticks = ticksFor(max).map((value) => ({
    value,
    y: max > 0 ? baselineY - (value / max) * height : baselineY,
  }));

  return {
    bars,
    ticks,
    baselineY,
    max,
    total,
    average: count > 0 ? total / count : 0,
    peak,
  };
}
