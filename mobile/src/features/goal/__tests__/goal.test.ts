import { describe, expect, it } from 'vitest';

import {
  MAX_WEEKLY_LITRES,
  MIN_WEEKLY_LITRES,
  STEP_LITRES,
  baselineFrom,
  clampGoal,
  progressFor,
  suggestionsFrom,
} from '../goal';
import { parseGoal } from '../store';

const week = (totalLitres: number, entryCount = 1) => ({ totalLitres, entryCount });

describe('progressFor', () => {
  it('reports a week inside its mark', () => {
    const progress = progressFor(7000, 14000, 4);

    expect(progress.ratio).toBe(0.5);
    expect(progress.fill).toBe(0.5);
    expect(progress.status).toBe('under');
    expect(progress.remaining).toBe(7000);
    expect(progress.over).toBe(0);
    expect(progress.daysLeft).toBe(3);
  });

  it('turns near at 85% of the mark and no sooner', () => {
    expect(progressFor(13_999, 14_000, 4).status).toBe('near');
    expect(progressFor(11_900, 14_000, 4).status).toBe('near');
    expect(progressFor(11_899, 14_000, 4).status).toBe('under');
  });

  it('reports the overshoot once the mark is passed', () => {
    const progress = progressFor(15_100, 14_000, 7);

    expect(progress.status).toBe('over');
    expect(progress.over).toBe(1100);
    expect(progress.remaining).toBe(0);
    // The fill is clipped to the track; the ratio keeps the real figure so the
    // run-on past the end can be drawn from it.
    expect(progress.fill).toBe(1);
    expect(progress.ratio).toBeCloseTo(1.0786, 4);
  });

  it('paces on whole days, so a day just begun is already spent', () => {
    // Monday is the first of seven, not zero of seven: logging Monday's lunch
    // on Monday has not overspent Monday.
    expect(progressFor(0, 14_000, 1).pace).toBeCloseTo(1 / 7, 6);
    expect(progressFor(0, 14_000, 7).pace).toBe(1);
  });

  it('holds the weekday inside the week', () => {
    expect(progressFor(0, 14_000, 0).daysLeft).toBe(6);
    expect(progressFor(0, 14_000, 99).daysLeft).toBe(0);
  });

  it('survives a zero mark rather than dividing by it', () => {
    const progress = progressFor(500, 0, 3);

    expect(Number.isFinite(progress.ratio)).toBe(true);
    expect(progress.status).toBe('over');
  });

  it('reads a negative total as an empty week', () => {
    expect(progressFor(-200, 14_000, 3).spent).toBe(0);
    expect(progressFor(-200, 14_000, 3).ratio).toBe(0);
  });
});

describe('clampGoal', () => {
  it('snaps to the step the thumb moves in', () => {
    expect(clampGoal(14_240)).toBe(14_000);
    expect(clampGoal(14_260)).toBe(14_500);
    expect(clampGoal(14_000) % STEP_LITRES).toBe(0);
  });

  it('holds the mark inside the range the bar can draw', () => {
    expect(clampGoal(1)).toBe(MIN_WEEKLY_LITRES);
    expect(clampGoal(9_999_999)).toBe(MAX_WEEKLY_LITRES);
  });
});

describe('baselineFrom', () => {
  it('averages the weeks that have something in them', () => {
    expect(baselineFrom([week(10_000), week(20_000)])).toBe(15_000);
  });

  it('drops open weeks rather than counting them as zero', () => {
    // A fortnight away would otherwise halve the mark it suggests.
    expect(baselineFrom([week(10_000), week(0, 0), week(20_000)])).toBe(15_000);
  });

  it('waits for two logged weeks before claiming an average', () => {
    expect(baselineFrom([week(10_000)])).toBeNull();
    expect(baselineFrom([week(10_000), week(0, 0)])).toBeNull();
    expect(baselineFrom([])).toBeNull();
  });
});

describe('suggestionsFrom', () => {
  it('offers a tenth under, a quarter under, and the average held', () => {
    const marks = suggestionsFrom(16_000);

    expect(marks?.map((mark) => mark.litres)).toEqual([14_500, 12_000, 16_000]);
  });

  it('offers nothing without a baseline to build on', () => {
    expect(suggestionsFrom(null)).toBeNull();
    expect(suggestionsFrom(0)).toBeNull();
  });
});

describe('parseGoal', () => {
  it('reads a stored mark back', () => {
    expect(parseGoal('14000')).toBe(14_000);
  });

  it('falls back to no mark rather than to a nonsense one', () => {
    expect(parseGoal(null)).toBeNull();
    expect(parseGoal('')).toBeNull();
    expect(parseGoal('later')).toBeNull();
    expect(parseGoal('-4')).toBeNull();
    expect(parseGoal('Infinity')).toBeNull();
  });

  it('holds a stored mark to the same range a new one gets', () => {
    expect(parseGoal('99999999')).toBe(MAX_WEEKLY_LITRES);
  });
});
