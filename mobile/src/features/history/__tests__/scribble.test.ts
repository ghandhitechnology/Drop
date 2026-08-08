/**
 * The hand fill, checked as maths.
 *
 * A fill that escapes its bar is the failure this code can actually have, and
 * it is invisible to the type checker and to anything short of looking at a
 * device. So the three properties the drawing depends on are pinned here:
 * every point is finite, every point stays inside the bar it was handed, and
 * the same seed always produces the same marks.
 *
 * Skia is replaced with a recorder, following `sketchShape.test.ts`. The
 * module's only use of it is `PathBuilder.Make()` and the segment calls on it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Recorded = { op: string; args: number[] };

const paths: Recorded[][] = [];

vi.mock('@shopify/react-native-skia', () => ({
  Skia: {
    PathBuilder: {
      Make() {
        const ops: Recorded[] = [];
        paths.push(ops);
        const builder = {
          ops,
          moveTo(...args: number[]) {
            ops.push({ op: 'moveTo', args });
            return builder;
          },
          lineTo(...args: number[]) {
            ops.push({ op: 'lineTo', args });
            return builder;
          },
          detach: () => ({ ops }),
        };
        return builder;
      },
    },
  },
}));

const { scribbleFill } = await import('../scribble');

/** Every point the pen was put down at, in order. */
function pointsOf(index = paths.length - 1): { x: number; y: number }[] {
  return (paths[index] ?? []).map(({ args }) => ({ x: args[0]!, y: args[1]! }));
}

beforeEach(() => {
  paths.length = 0;
});

describe('scribbleFill', () => {
  const BAR = { x: 40, y: 30, width: 22, height: 90 };

  it('draws one unbroken stroke', () => {
    scribbleFill(BAR.x, BAR.y, BAR.width, BAR.height, 7);
    const ops = paths[0]!.map((op) => op.op);

    // A single `moveTo` is what makes this read as drawn rather than hatched.
    expect(ops.filter((op) => op === 'moveTo')).toHaveLength(1);
    expect(ops[0]).toBe('moveTo');
    expect(ops.length).toBeGreaterThan(6);
  });

  it('keeps every point inside the bar', () => {
    for (const seed of [1, 9, 41, 512, 99_991]) {
      paths.length = 0;
      scribbleFill(BAR.x, BAR.y, BAR.width, BAR.height, seed);

      for (const point of pointsOf(0)) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
        expect(point.x).toBeGreaterThanOrEqual(BAR.x);
        expect(point.x).toBeLessThanOrEqual(BAR.x + BAR.width);
        expect(point.y).toBeGreaterThanOrEqual(BAR.y);
        expect(point.y).toBeLessThanOrEqual(BAR.y + BAR.height);
      }
    }
  });

  it('walks left to right without a pass crossing its neighbour', () => {
    scribbleFill(BAR.x, BAR.y, BAR.width, BAR.height, 3);
    const xs = pointsOf(0).map((point) => point.x);

    // Non-decreasing to within one lean: the tilt leans a pass either way, and
    // nothing beyond that may put the pen back where it has already been.
    const lean = Math.min(BAR.height * 0.16, BAR.width * 0.25);
    for (let index = 1; index < xs.length; index += 1) {
      expect(xs[index]!).toBeGreaterThanOrEqual(xs[index - 1]! - lean);
    }
    expect(xs.at(-1)!).toBeGreaterThan(xs[0]! + BAR.width / 2);
  });

  it('alternates between the two edges', () => {
    scribbleFill(BAR.x, BAR.y, BAR.width, BAR.height, 5);
    const middle = BAR.y + BAR.height / 2;
    // Every other point is a turn along an edge, so the pass ends are read off
    // the stride the passes themselves take.
    const ends = pointsOf(0).filter((_, index) => index % 2 === 0);

    for (let index = 1; index < ends.length; index += 1) {
      const wasHigh = ends[index - 1]!.y < middle;
      expect(ends[index]!.y < middle).toBe(!wasHigh);
    }
  });

  it('draws the same bar the same way every time', () => {
    scribbleFill(BAR.x, BAR.y, BAR.width, BAR.height, 77);
    scribbleFill(BAR.x, BAR.y, BAR.width, BAR.height, 77);

    expect(paths[1]).toEqual(paths[0]);
  });

  it('draws different bars differently', () => {
    scribbleFill(BAR.x, BAR.y, BAR.width, BAR.height, 77);
    scribbleFill(BAR.x, BAR.y, BAR.width, BAR.height, 78);

    expect(paths[1]).not.toEqual(paths[0]);
  });

  it('declines a bar too small to hold a pass', () => {
    expect(scribbleFill(0, 0, 3, 90, 1)).toBeNull();
    expect(scribbleFill(0, 0, 22, 4, 1)).toBeNull();
    expect(scribbleFill(0, 0, 0, 0, 1)).toBeNull();
    expect(paths).toHaveLength(0);
  });

  /**
   * The regression this file was written for: a lean taken from the height
   * alone is wider than a chart bar, which left the run for passes negative and
   * dropped the fill off exactly the tallest bars.
   */
  it('fills the tallest bar a seven-day chart can draw', () => {
    // MAX_BAR_WIDTH is 22 and PLOT_HEIGHT is 132.
    expect(scribbleFill(0, 0, 22, 132, 11)).not.toBeNull();
    expect(paths[0]!.length).toBeGreaterThan(4);
    expect(paths[0]!.length).toBeLessThan(30);

    for (const point of pointsOf(0)) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(22);
    }
  });

  it('fills across the whole range of bar heights a window produces', () => {
    for (const height of [6, 12, 40, 80, 132]) {
      paths.length = 0;
      expect(scribbleFill(0, 0, 22, height, 21)).not.toBeNull();
    }
  });
});
