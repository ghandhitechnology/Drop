import { describe, expect, it } from 'vitest';

import { downscalePlan, MAX_LONGEST_SIDE } from '../library';

describe('downscalePlan', () => {
  it('brings a full-resolution phone photo down to the long edge', () => {
    expect(downscalePlan(4032, 3024)).toEqual({ width: 1600, height: 1200 });
  });

  it('measures the long edge whichever way the photo is held', () => {
    expect(downscalePlan(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it('scales a square by its side', () => {
    expect(downscalePlan(2000, 2000)).toEqual({ width: 1600, height: 1600 });
  });

  it('leaves a photo that already fits alone', () => {
    expect(downscalePlan(1200, 900)).toBeNull();
  });

  it('does not re-sample an image that is exactly at the limit', () => {
    expect(downscalePlan(MAX_LONGEST_SIDE, 900)).toBeNull();
  });

  it('declines to guess when the picker reports no dimensions', () => {
    expect(downscalePlan(0, 0)).toBeNull();
    expect(downscalePlan(4032, 0)).toBeNull();
    expect(downscalePlan(-1, 400)).toBeNull();
  });

  it('holds the aspect ratio of an extreme panorama', () => {
    const plan = downscalePlan(6000, 800);
    expect(plan).not.toBeNull();
    expect(plan!.width).toBe(1600);
    expect(plan!.width / plan!.height).toBeCloseTo(6000 / 800, 1);
  });

  it('never rounds a very thin edge away to nothing', () => {
    const plan = downscalePlan(20000, 40);
    expect(plan!.height).toBeGreaterThanOrEqual(1);
  });

  it('takes the limit as an argument so the rule can be moved', () => {
    expect(downscalePlan(4000, 2000, 1000)).toEqual({ width: 1000, height: 500 });
  });
});
