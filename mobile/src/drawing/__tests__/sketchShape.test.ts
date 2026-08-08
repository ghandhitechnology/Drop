/**
 * The drawn-box generator, checked as maths.
 *
 * A wobble that is too small is invisible and a wobble that is too large is a
 * scribble, and neither shows up in a type error. These pin the three things
 * the drawing actually depends on: every point is finite, the trace stays
 * within a stroke's reach of the box it was given, and the same seed always
 * produces the same marks.
 *
 * Skia is replaced with a recorder. Nothing here needs a native view — the
 * module's only use of Skia is `Path.Make()` and the segment calls on it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Recorded = { op: string; args: number[] };

const paths: Recorded[][] = [];

vi.mock('@shopify/react-native-skia', () => ({
  Skia: {
    Path: {
      Make() {
        const ops: Recorded[] = [];
        paths.push(ops);
        return {
          ops,
          moveTo: (...args: number[]) => ops.push({ op: 'moveTo', args }),
          lineTo: (...args: number[]) => ops.push({ op: 'lineTo', args }),
          quadTo: (...args: number[]) => ops.push({ op: 'quadTo', args }),
        };
      },
    },
  },
}));

const { sketchRect, sketchUnderline } = await import('../sketchShape');

/** Every coordinate a path was built from, in order. */
function coordinates(recorded: Recorded[]): number[] {
  return recorded.flatMap((entry) => entry.args);
}

beforeEach(() => {
  paths.length = 0;
});

describe('sketchRect', () => {
  const box = { width: 220, height: 56, radius: 22 };

  it('refuses boxes with no room to trace', () => {
    expect(sketchRect({ ...box, width: 6, seed: 1 })).toBeNull();
    expect(sketchRect({ ...box, height: 4, seed: 1 })).toBeNull();
  });

  it('closes the loop through all four corners', () => {
    const drawn = sketchRect({ ...box, seed: 7 });
    expect(drawn).not.toBeNull();

    const ops = paths[0].map((entry) => entry.op);
    expect(ops[0]).toBe('moveTo');
    // Four edges and four corners, plus the carry past the seam when there is
    // one. Never fewer than the eight the loop itself needs.
    expect(ops.filter((op) => op === 'quadTo').length).toBeGreaterThanOrEqual(8);
  });

  /** The loosest hand `SketchButton`'s character ranges can ask for. */
  const WORST = { slack: 1.9, tilt: 0.6, retrace: true };

  it('never emits a coordinate that is not a number', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      paths.length = 0;
      sketchRect({ ...box, ...WORST, seed });
      for (const value of coordinates(paths.flat())) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('keeps the trace inside the margin SketchButton reserves for it', () => {
    // The pen carries past the seam and the tilt swings the corners out, so the
    // trace is allowed outside its box — but only as far as `INSET`. Any
    // further and the stroke clips against the edge of the canvas.
    const INSET = 6;

    for (let seed = 0; seed < 300; seed += 1) {
      paths.length = 0;
      const drawn = sketchRect({ ...box, ...WORST, seed });
      expect(drawn).not.toBeNull();

      for (const { args } of paths.flat()) {
        for (let i = 0; i < args.length; i += 2) {
          expect(args[i]).toBeGreaterThanOrEqual(-INSET);
          expect(args[i]).toBeLessThanOrEqual(box.width + INSET);
          expect(args[i + 1]).toBeGreaterThanOrEqual(-INSET);
          expect(args[i + 1]).toBeLessThanOrEqual(box.height + INSET);
        }
      }
    }
  });

  it('holds that margin on a control as small as a stepper', () => {
    const INSET = 6;
    const round = { width: 44, height: 44, radius: 22 };

    for (let seed = 0; seed < 300; seed += 1) {
      paths.length = 0;
      expect(sketchRect({ ...round, ...WORST, seed })).not.toBeNull();

      for (const { args } of paths.flat()) {
        for (let i = 0; i < args.length; i += 2) {
          expect(args[i]).toBeGreaterThanOrEqual(-INSET);
          expect(args[i]).toBeLessThanOrEqual(round.width + INSET);
          expect(args[i + 1]).toBeGreaterThanOrEqual(-INSET);
          expect(args[i + 1]).toBeLessThanOrEqual(round.height + INSET);
        }
      }
    }
  });

  it('draws the same seed the same way, and two seeds differently', () => {
    sketchRect({ ...box, seed: 42 });
    const first = coordinates(paths.flat());

    paths.length = 0;
    sketchRect({ ...box, seed: 42 });
    const again = coordinates(paths.flat());

    paths.length = 0;
    sketchRect({ ...box, seed: 43 });
    const other = coordinates(paths.flat());

    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it('actually wobbles — a seeded box is never the box it was given', () => {
    const drawn = sketchRect({ ...box, seed: 3 });
    expect(drawn).not.toBeNull();

    const values = coordinates(paths.flat());
    // A clean rounded rectangle would put every coordinate on a handful of
    // exact values. Distinct ones are the wobble.
    expect(new Set(values).size).toBeGreaterThan(values.length / 2);
  });

  it('adds the firming stroke only when one was asked for', () => {
    sketchRect({ ...box, seed: 11, retrace: false });
    expect(paths).toHaveLength(1);

    paths.length = 0;
    sketchRect({ ...box, seed: 11, retrace: true });
    expect(paths).toHaveLength(2);
  });
});

describe('sketchUnderline', () => {
  it('draws nothing under a word too short to underline', () => {
    expect(sketchUnderline({ width: 8, seed: 1 })).toEqual([]);
  });

  it('draws one stroke, and occasionally two', () => {
    const counts = new Set<number>();
    for (let seed = 0; seed < 60; seed += 1) {
      counts.add(sketchUnderline({ width: 74, seed }).length);
    }
    expect(counts).toEqual(new Set([1, 2]));
  });

  it('stays within reach of the word it sits under', () => {
    const WIDTH = 74;
    // `SketchLink` hangs the canvas `RULE_BLEED` left of the word and pads the
    // same amount on the right, so the mark has that much room and no more.
    const BLEED = 6;
    for (let seed = 0; seed < 300; seed += 1) {
      paths.length = 0;
      sketchUnderline({ width: WIDTH, seed, y: 3.4, slack: 1 });

      for (const { args } of paths.flat()) {
        for (let i = 0; i < args.length; i += 2) {
          expect(Number.isFinite(args[i])).toBe(true);
          expect(args[i]).toBeGreaterThanOrEqual(-BLEED);
          expect(args[i]).toBeLessThanOrEqual(WIDTH + BLEED);
          // And inside the band the rule is drawn in, so it never rides up
          // into the word or off the bottom of its canvas.
          expect(args[i + 1]).toBeGreaterThan(0);
          expect(args[i + 1]).toBeLessThan(9);
        }
      }
    }
  });
});
