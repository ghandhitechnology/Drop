/**
 * The week-mark scene, checked as maths.
 *
 * A scene stroke that leaves its canvas is clipped rather than drawn, so it
 * fails by quietly disappearing — the one failure mode a type checker cannot
 * see and a glance at a device can miss. These pin that every point is finite,
 * that everything stays inside the square the scene is given, and that the
 * three marks arrive in the order they mean something in.
 *
 * Skia is replaced with a recorder, following `sketchShape.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Recorded = { op: string; args: unknown[] };

const paths: Recorded[][] = [];

vi.mock('@shopify/react-native-skia', () => ({
  Skia: {
    PathBuilder: {
      Make() {
        const ops: Recorded[] = [];
        paths.push(ops);
        const builder: Record<string, unknown> = { ops };
        for (const op of ['moveTo', 'lineTo', 'cubicTo', 'arcToOval', 'close']) {
          builder[op] = (...args: unknown[]) => {
            ops.push({ op, args });
            return builder;
          };
        }
        builder.detach = () => ({ ops });
        return builder;
      },
    },
  },
}));

const { weekMarks } = await import('../marks');

const SCENE = 320;

/** Every x/y pair the pen was put down at, across one recorded path. */
function pointsOf(ops: Recorded[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const { op, args } of ops) {
    if (op === 'close') continue;
    if (op === 'arcToOval') {
      const box = args[0] as { x: number; y: number; width: number; height: number };
      out.push({ x: box.x, y: box.y });
      out.push({ x: box.x + box.width, y: box.y + box.height });
      continue;
    }
    for (let index = 0; index + 1 < args.length; index += 2) {
      out.push({ x: args[index] as number, y: args[index + 1] as number });
    }
  }
  return out;
}

beforeEach(() => {
  paths.length = 0;
});

describe('weekMarks', () => {
  it('returns the track, the week, and the notch, in that order', () => {
    const strokes = weekMarks(SCENE);

    // The order is the order they draw on in, and the order they mean
    // something in: the box, then what is in it, then the annotation.
    expect(strokes).toHaveLength(3);
    expect(strokes.every((stroke) => stroke.strokeScale > 0)).toBe(true);
    expect(new Set(strokes.map((stroke) => stroke.seed)).size).toBe(3);
  });

  it('keeps every mark inside the scene', () => {
    weekMarks(SCENE);

    for (const ops of paths) {
      for (const point of pointsOf(ops)) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(SCENE);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(SCENE);
      }
    }
  });

  it('stops the week short of the mark, with the notch beyond it', () => {
    weekMarks(SCENE);
    const [, body, notch] = paths;

    const bodyRight = Math.max(...pointsOf(body!).map((point) => point.x));
    const notchX = pointsOf(notch!)[0]!.x;

    // The scene has to show the state the bar is quiet in — a week behind its
    // pace — or it teaches the wrong reading of the notch on first sight.
    expect(bodyRight).toBeLessThan(notchX);
  });

  it('runs the notch clear of the track, top and bottom', () => {
    weekMarks(SCENE);
    const [track, , notch] = paths;

    const trackYs = pointsOf(track!).map((point) => point.y);
    const notchYs = pointsOf(notch!).map((point) => point.y);

    expect(Math.min(...notchYs)).toBeLessThan(Math.min(...trackYs));
    expect(Math.max(...notchYs)).toBeGreaterThan(Math.max(...trackYs));
  });

  it('holds its proportions across the scene sizes the flow produces', () => {
    // SCENE_MAX is 320, and a small phone lands nearer 220.
    for (const size of [200, 260, 320]) {
      paths.length = 0;
      weekMarks(size);
      for (const ops of paths) {
        for (const point of pointsOf(ops)) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(size);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThanOrEqual(size);
        }
      }
    }
  });

  it('draws the same scene every time', () => {
    weekMarks(SCENE);
    const first = JSON.stringify(paths);
    paths.length = 0;
    weekMarks(SCENE);

    expect(JSON.stringify(paths)).toBe(first);
  });
});
