/**
 * The pile's arithmetic, away from any paper.
 *
 * Two things about a stacked plate can be worked out on a page: which sheet is
 * where after a hand has been through it, and where a sheet at a given depth
 * sits. Both are pure, so both are pinned down here — the reducer against
 * hand-played sequences, the geometry against figures that can be checked with
 * a ruler and a calculator.
 *
 * The hook itself needs a UI thread and a finger, so the three native modules
 * it imports are stubbed at the door. Nothing below touches the hook.
 */
import { describe, expect, it, vi } from 'vitest';

import type { Estimate } from '../../capture/types';
import {
  EXIT_SCALE,
  FAN_OUT_POINT,
  SWIPE_TRAVEL,
  SWIPE_TRIGGER,
  MAX_PEEKS,
  PEEK_STEP,
  PEEK_STEP_MAX,
  PEEK_STEP_MIN,
  STACK_INSET_X,
  SWIPE_SAG,
  TILT_RANGE,
  clampPeekStep,
  contentOpacity,
  exitOpacity,
  exitScale,
  exitTilt,
  frontSheetOffset,
  nextOrder,
  peekOpacity,
  pileInset,
  pileOffset,
  pileTilt,
  reconcileOrder,
  savableEstimates,
  seedTiltFor,
  tiltDisplacement,
} from '../useStackOrder';

vi.mock('react-native-reanimated', () => ({
  runOnJS: (fn: unknown) => fn,
  useAnimatedReaction: () => {},
  useSharedValue: (value: unknown) => ({ value }),
  withDelay: (_ms: number, animation: unknown) => animation,
  withSpring: (to: unknown) => to,
  withTiming: (to: unknown) => to,
}));

vi.mock('react-native-gesture-handler', () => ({ Gesture: { Pan: () => ({}) } }));

vi.mock('../../../lib/haptics', () => ({ tapSelection: () => {} }));

/* --------------------------------------------------------- the reducer -- */

describe('nextOrder', () => {
  it('closes the pile up when the front sheet goes', () => {
    expect(nextOrder([0, 1, 2, 3], { type: 'dismiss', index: 0 })).toEqual([1, 2, 3]);
  });

  it('closes it up just the same when a buried sheet goes', () => {
    expect(nextOrder([0, 1, 2, 3], { type: 'dismiss', index: 2 })).toEqual([0, 1, 3]);
  });

  it('lets the plate come back empty — the stage decides what that means', () => {
    expect(nextOrder([4], { type: 'dismiss', index: 4 })).toEqual([]);
    expect(nextOrder([4], { type: 'queue', index: 4 })).toEqual([]);
  });

  it('closes the pile up the same way whichever direction the sheet went', () => {
    // The paper does not care where a sheet was headed. Only the stage does.
    expect(nextOrder([0, 1, 2, 3], { type: 'queue', index: 0 })).toEqual([1, 2, 3]);
    expect(nextOrder([0, 1, 2, 3], { type: 'queue', index: 2 })).toEqual([0, 1, 3]);
    expect(nextOrder([0, 1, 2], { type: 'queue', index: 9 })).toEqual([0, 1, 2]);
  });

  it('moves only the sheet that was tapped', () => {
    // b comes to the top; a slots in behind it and c, d never move at all.
    expect(nextOrder([0, 1, 2, 3], { type: 'bringToFront', index: 1 })).toEqual([
      1, 0, 2, 3,
    ]);
    expect(nextOrder([0, 1, 2, 3], { type: 'bringToFront', index: 3 })).toEqual([
      3, 0, 1, 2,
    ]);
  });

  it('leaves the arrangement alone when the front sheet is tapped', () => {
    expect(nextOrder([2, 5, 1], { type: 'bringToFront', index: 2 })).toEqual([2, 5, 1]);
  });

  it('ignores a sheet that is no longer on the plate', () => {
    expect(nextOrder([0, 2], { type: 'dismiss', index: 1 })).toEqual([0, 2]);
    expect(nextOrder([0, 2], { type: 'bringToFront', index: 1 })).toEqual([0, 2]);
  });

  it('plays a whole session through', () => {
    let order: number[] = [0, 1, 2, 3, 4];
    order = nextOrder(order, { type: 'bringToFront', index: 3 });
    expect(order).toEqual([3, 0, 1, 2, 4]);
    order = nextOrder(order, { type: 'dismiss', index: 3 });
    expect(order).toEqual([0, 1, 2, 4]);
    order = nextOrder(order, { type: 'bringToFront', index: 4 });
    expect(order).toEqual([4, 0, 1, 2]);
    order = nextOrder(order, { type: 'dismiss', index: 1 });
    expect(order).toEqual([4, 0, 2]);
  });

  it('never writes into the order it was handed', () => {
    const order = Object.freeze([0, 1, 2]) as readonly number[];
    expect(() => nextOrder(order, { type: 'dismiss', index: 1 })).not.toThrow();
    expect(order).toEqual([0, 1, 2]);
  });
});

describe('reconcileOrder', () => {
  it('keeps the arrangement a hand made when a sheet is set aside', () => {
    expect(reconcileOrder([2, 0, 1, 3], [0, 1, 3])).toEqual([0, 1, 3]);
  });

  it('takes the dismissed sheet out and leaves the rest in place', () => {
    expect(reconcileOrder([3, 0, 1, 2], [0, 1, 2])).toEqual([0, 1, 2]);
    expect(reconcileOrder([3, 0, 1, 2], [0, 2, 3])).toEqual([3, 0, 2]);
  });

  it('brings a restored sheet in at the back', () => {
    expect(reconcileOrder([2, 0], [0, 1, 2])).toEqual([2, 0, 1]);
  });

  it('hands back the very same array when nothing moved', () => {
    const order = [1, 0, 2];
    expect(reconcileOrder(order, [0, 1, 2])).toBe(order);
  });
});

/* -------------------------------------------------------------- the pile */

describe('pileOffset', () => {
  it('leaves the front sheet where it is', () => {
    expect(pileOffset(0)).toBeCloseTo(0, 10);
  });

  it('lifts each buried sheet one peek row higher', () => {
    expect(pileOffset(1)).toBe(-PEEK_STEP);
    expect(pileOffset(2)).toBe(-PEEK_STEP * 2);
    expect(pileOffset(3)).toBe(-PEEK_STEP * 3);
  });

  it('climbs without ever turning back', () => {
    let previous = pileOffset(0);
    for (let depth = 0.25; depth <= 5; depth += 0.25) {
      const here = pileOffset(depth);
      expect(here).toBeLessThanOrEqual(previous);
      previous = here;
    }
  });

  it('stops climbing past the third peek', () => {
    const ceiling = pileOffset(MAX_PEEKS);
    expect(pileOffset(MAX_PEEKS + 1)).toBe(ceiling);
    expect(pileOffset(9)).toBe(ceiling);
  });

  it('takes a measured peek row when one has been reported', () => {
    expect(pileOffset(2, 44)).toBe(-88);
  });

  it('treats a half-sprung depth as half a row', () => {
    expect(pileOffset(0.5)).toBeCloseTo(-PEEK_STEP / 2, 10);
  });
});

describe('pileInset', () => {
  it('pulls each buried sheet a little further in, then stops', () => {
    expect(pileInset(0)).toBe(0);
    expect(pileInset(1)).toBe(STACK_INSET_X);
    expect(pileInset(MAX_PEEKS)).toBe(STACK_INSET_X * MAX_PEEKS);
    expect(pileInset(MAX_PEEKS + 2)).toBe(STACK_INSET_X * MAX_PEEKS);
  });
});

describe('pileTilt', () => {
  it('lays the sheet under the thumb perfectly flat', () => {
    expect(pileTilt(0, 1.4)).toBe(0);
  });

  it('reaches its full lean by the first peek and holds it', () => {
    expect(pileTilt(1, 1.4)).toBeCloseTo(1.4, 10);
    expect(pileTilt(3, 1.4)).toBeCloseTo(1.4, 10);
    expect(pileTilt(0.5, 1.4)).toBeCloseTo(0.7, 10);
  });
});

describe('the cross-fade between a card and its peek row', () => {
  it('hands the ink over rather than showing both at once', () => {
    expect(contentOpacity(0)).toBe(1);
    expect(peekOpacity(0)).toBe(0);
    expect(contentOpacity(0.35)).toBe(0);
    expect(peekOpacity(0.35)).toBe(0);
    expect(contentOpacity(1)).toBe(0);
    expect(peekOpacity(1)).toBe(1);
  });

  it('keeps every peek up to the third fully drawn', () => {
    expect(peekOpacity(2)).toBe(1);
    expect(peekOpacity(MAX_PEEKS)).toBe(1);
  });

  it('fades the fourth sheet out — counted, not drawn', () => {
    expect(peekOpacity(MAX_PEEKS + 0.5)).toBeCloseTo(0.5, 10);
    expect(peekOpacity(MAX_PEEKS + 1)).toBe(0);
    expect(peekOpacity(MAX_PEEKS + 3)).toBe(0);
  });
});

describe('clampPeekStep', () => {
  it('trusts a measured row inside its bounds', () => {
    expect(clampPeekStep(38)).toBe(38);
  });

  it('holds a runaway measurement to the bounds', () => {
    expect(clampPeekStep(12)).toBe(PEEK_STEP_MIN);
    expect(clampPeekStep(120)).toBe(PEEK_STEP_MAX);
  });

  it('falls back to the assumed row before anything has been measured', () => {
    expect(clampPeekStep(0)).toBe(PEEK_STEP);
    expect(clampPeekStep(Number.NaN)).toBe(PEEK_STEP);
  });
});

/* ------------------------------------------------------------ the lean -- */

describe('the seeded lean', () => {
  it('gives the same sheet the same lean every time it is drawn', () => {
    expect(seedTiltFor('apple', 0)).toBe(seedTiltFor('apple', 0));
  });

  it('stays inside the range the design allows', () => {
    for (const id of ['apple', 'coffee_standard', 'transport_bus', '', 'x']) {
      for (let index = 0; index < 6; index += 1) {
        const tilt = seedTiltFor(id, index);
        expect(tilt).toBeGreaterThanOrEqual(-TILT_RANGE);
        expect(tilt).toBeLessThan(TILT_RANGE);
      }
    }
  });

  it('leans two helpings of the same thing differently', () => {
    // A plate can hold the same catalogue entry twice, and two sheets leaning
    // the same way read as a printing error rather than as paper.
    expect(seedTiltFor('apple', 0)).not.toBe(seedTiltFor('apple', 1));
  });

  it('never lets a lean carry a sheet out past its own inset', () => {
    // The whole point of the inset is that the sheet behind stays behind. A
    // corner swinging further than 8dp would poke out of the pile.
    for (const [width, height] of [
      [320, 240],
      [360, 320],
      [400, 420],
      [420, 520],
    ]) {
      expect(tiltDisplacement(TILT_RANGE, width, height)).toBeLessThan(STACK_INSET_X);
    }
  });

  it('has room to spare on every sheet a stacked card can be', () => {
    // 1.6° swings a 520-tall sheet's corner about 7.3dp. The lean holds up to
    // roughly 570dp of card, which is past anything a trimmed sheet reaches.
    expect(tiltDisplacement(TILT_RANGE, 400, 520)).toBeCloseTo(7.31, 1);
    expect(tiltDisplacement(TILT_RANGE, 400, 570)).toBeGreaterThan(
      STACK_INSET_X - 0.05,
    );
  });
});

/* ------------------------------------------------------------ the exit -- */

describe('the exit off the pile', () => {
  it('starts life-size and lands print-size', () => {
    expect(exitScale(0)).toBe(1);
    expect(exitScale(1)).toBeCloseTo(EXIT_SCALE, 10);
  });

  it('holds its ink most of the way, then goes', () => {
    expect(exitOpacity(0)).toBe(1);
    expect(exitOpacity(0.62)).toBe(1);
    expect(exitOpacity(0.81)).toBeCloseTo(0.5, 1);
    expect(exitOpacity(1)).toBe(0);
  });

  it('throws the sheet three times its resting lean, and no further', () => {
    expect(exitTilt(0, 1.2, 1)).toBe(0);
    expect(exitTilt(1, 1.2, 1)).toBeCloseTo(3.6, 10);
    expect(exitTilt(1, 4, 1)).toBe(5);
  });

  it('leans the sheet into the way it is travelling, whichever way that is', () => {
    // The seeded lean is a resting wobble and has no opinion about the exit;
    // the swipe does. A sheet thrown left leans left even if it was sitting
    // tilted the other way.
    expect(exitTilt(1, 1.2, -1)).toBeCloseTo(-3.6, 10);
    expect(exitTilt(1, -1.2, -1)).toBeCloseTo(-3.6, 10);
    expect(exitTilt(1, -1.2, 1)).toBeCloseTo(3.6, 10);
    expect(exitTilt(1, -4, -1)).toBe(-5);
  });
});

/* ------------------------------------------- paper and ink, together -- */

describe('the front sheet offset', () => {
  const card = { x: 200, y: 500 };
  const print = { x: 200, y: 200 };
  const tray = { x: 340, y: 120 };

  // Its whole job is to be the single answer two different renderers use: the
  // React view holding the words, and the Skia group holding the paper. If it
  // ever returned something either side had to adjust, they would drift apart
  // and the card would visibly come off its own frame.
  const at = (swipeX: number, away: number, direction = 1, lift = 0, tilt = 0) =>
    frontSheetOffset(swipeX, away, direction, lift, card, print, tray, tilt);

  it('leaves a sheet exactly where it lives when nothing is happening', () => {
    expect(at(0, 0)).toEqual({ x: 0, y: 0, scale: 1, rotate: 0 });
  });

  it('follows the thumb one-to-one before the sheet is let go', () => {
    expect(at(-40, 0).x).toBe(-40);
    expect(at(60, 0).x).toBe(60);
  });

  it('sags as it is dragged, and no further than the sag allows', () => {
    expect(at(0, 0).y).toBe(0);
    expect(at(-SWIPE_TRAVEL / 2, 0).y).toBeCloseTo(SWIPE_SAG / 2, 10);
    expect(at(-SWIPE_TRAVEL * 3, 0).y).toBe(SWIPE_SAG);
  });

  it('lands a swipe left in the print', () => {
    const landed = at(-80, 1, -1);
    expect(landed.x).toBeCloseTo(print.x - card.x, 10);
    expect(landed.y).toBeCloseTo(print.y - card.y, 10);
  });

  it('lands a swipe right in the tray', () => {
    const landed = at(80, 1, 1);
    expect(landed.x).toBeCloseTo(tray.x - card.x, 10);
    expect(landed.y).toBeCloseTo(tray.y - card.y, 10);
  });

  it('picks the sheet up from where the thumb left it rather than snapping first', () => {
    // Half way out, the sheet is half way between the thumb and the target —
    // it never jumps back to centre to start its trip.
    const half = at(-90, 0.5, -1);
    expect(half.x).toBeCloseTo(-90 + (print.x - card.x - -90) * 0.5, 10);
  });

  it('shrinks toward its destination', () => {
    expect(at(0, 0).scale).toBe(1);
    expect(at(0, 1, -1).scale).toBeCloseTo(EXIT_SCALE, 10);
  });

  it('leans the way it is being dragged before the direction is committed', () => {
    // Nothing has been let go yet, so the heading comes from the drag itself.
    expect(at(-50, 0, 1, 1, 1.2).rotate).toBeLessThan(0);
    expect(at(50, 0, -1, 1, 1.2).rotate).toBeGreaterThan(0);
  });

  it('lets the committed exit take over the lean once the thumb is off', () => {
    expect(at(-50, 1, -1, 1, 1.2).rotate).toBeLessThan(0);
    expect(at(5, 1, 1, 1, 1.2).rotate).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------- the save */

describe('savableEstimates', () => {
  const figured = (id: string): Estimate =>
    ({
      catalog_id: id,
      display_name: id,
      headline: { value_l: 70, range_l: null, metric_type: 'total_water_footprint', proxy_metric: false },
    }) as unknown as Estimate;

  const arriving = (label: string): Estimate =>
    ({
      catalog_id: '',
      display_name: label,
      headline: null,
      unsupported: { reason: 'not_in_catalog' },
    }) as unknown as Estimate;

  it('counts only the cards that carry litres', () => {
    const kept = [figured('apple'), arriving('mystery pastry'), figured('coffee_standard')];
    expect(savableEstimates(kept)).toHaveLength(2);
    expect(savableEstimates(kept).map((e) => e.catalog_id)).toEqual([
      'apple',
      'coffee_standard',
    ]);
  });

  it('has nothing to write when every figure on the plate arrives later', () => {
    expect(savableEstimates([arriving('one'), arriving('two')])).toEqual([]);
  });

  it('keeps the order the plate read them in', () => {
    const kept = [figured('b'), figured('a')];
    expect(savableEstimates(kept).map((e) => e.catalog_id)).toEqual(['b', 'a']);
  });
});

/* --------------------------------------------------------- the constants */

describe('the constants hold their relationships', () => {
  it('asks for less travel to commit than the full journey', () => {
    expect(SWIPE_TRIGGER).toBeLessThan(SWIPE_TRAVEL);
  });

  it('fans the pile out only once the card frame has room for it', () => {
    expect(FAN_OUT_POINT).toBeGreaterThan(0.5);
    expect(FAN_OUT_POINT).toBeLessThan(1);
  });

  it('draws fewer peeks than a plate can hold', () => {
    expect(MAX_PEEKS).toBeLessThan(6);
  });
});
