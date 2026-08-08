/**
 * The thump, away from any motor.
 *
 * The stamp haptic is fired off a crossing test rather than a timer, and the
 * property that matters cannot be seen on a device without capturing a dozen
 * photos in a row: it has to fire once per capture, on the way in only, and it
 * has to survive the reset that sets up the next frame. All of that is pure
 * arithmetic on the fold, so all of it is pinned here.
 */
import { describe, expect, it } from 'vitest';

import { crossedStamp, STAMP_BOTTOM, STAMP_CONTACT, STAMP_PRESS } from '../stamp';

/** Replays a fold animation frame by frame and counts the thumps. */
function thumps(folds: readonly number[]): number {
  let previous: number | null = null;
  let count = 0;
  for (const fold of folds) {
    if (crossedStamp(fold, previous)) count += 1;
    previous = fold;
  }
  return count;
}

/** A fold running 0 → 1 over `frames` steps, as `withTiming` would drive it. */
function sweep(frames = 24): number[] {
  return Array.from({ length: frames + 1 }, (_, i) => i / frames);
}

describe('the stamp beat', () => {
  it('fires before the press bottoms out, not after', () => {
    // The whole point of the lead: contact is felt on the way into the page.
    expect(STAMP_CONTACT).toBeLessThan(STAMP_BOTTOM);
    // But not so early that it detaches from the squash it belongs to.
    expect(STAMP_BOTTOM - STAMP_CONTACT).toBeLessThan(0.1);
  });

  it('presses the print into the page by a visible amount', () => {
    expect(STAMP_PRESS).toBeGreaterThan(0);
  });
});

describe('crossedStamp', () => {
  it('says nothing on the very first reading', () => {
    expect(crossedStamp(0, null)).toBe(false);
    expect(crossedStamp(1, null)).toBe(false);
  });

  it('fires on the frame the fold passes the point of contact', () => {
    expect(crossedStamp(STAMP_CONTACT, STAMP_CONTACT - 0.01)).toBe(true);
    expect(crossedStamp(STAMP_CONTACT + 0.01, STAMP_CONTACT - 0.01)).toBe(true);
  });

  it('stays quiet on every other frame of the approach', () => {
    expect(crossedStamp(0.2, 0.1)).toBe(false);
    expect(crossedStamp(STAMP_CONTACT - 0.01, STAMP_CONTACT - 0.02)).toBe(false);
    // Already past it — the crossing has been and gone.
    expect(crossedStamp(1, STAMP_CONTACT)).toBe(false);
    expect(crossedStamp(0.95, 0.9)).toBe(false);
  });

  it('fires exactly once across a whole fold', () => {
    expect(thumps(sweep())).toBe(1);
    expect(thumps(sweep(3))).toBe(1);
    expect(thumps(sweep(120))).toBe(1);
  });

  it('fires once when reduced motion lands the print in a single frame', () => {
    // `motion.ms('draw')` collapses to 0, so the fold jumps the threshold whole.
    // The print still lands, so the thump still belongs.
    expect(thumps([0, 1])).toBe(1);
  });

  it('does not fire again when the fold is reset for the next frame', () => {
    // What `live` going false does: back to 0 without passing through anything.
    expect(crossedStamp(0, 1)).toBe(false);
    expect(thumps([...sweep(), 0])).toBe(1);
  });

  it('fires once per capture across a run of them', () => {
    const three = [...sweep(), 0, ...sweep(), 0, ...sweep()];
    expect(thumps(three)).toBe(3);
  });

  it('does not fire on a fold that is abandoned before contact', () => {
    // A capture cut short — the print never reached the paper.
    expect(thumps([0, 0.3, 0.6, 0.8, 0])).toBe(0);
  });
});
