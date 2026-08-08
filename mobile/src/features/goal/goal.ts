/**
 * The mark, and where the week stands against it.
 *
 * Everything here is a pure function of two numbers and a weekday, so the
 * claim a bar makes can be checked by hand.
 *
 * The mark is weekly rather than daily on purpose. A single beef entry is
 * several thousand litres, so a daily ceiling reports which day held the beef
 * rather than how the week is going, and goes red on days nothing unusual
 * happened. A week absorbs one heavy meal and still moves when a habit does.
 *
 * A second thing worth stating plainly, because it shapes the copy: Drop only
 * counts what a person confirms, so a week total is a floor rather than a
 * measurement. That is why nothing here ever calls a week good or bad. It
 * reports the two figures and where the week sits between them.
 */

/** Below this the mark is not a mark. One low-water day clears it. */
export const MIN_WEEKLY_LITRES = 500;
/** Above this the bar can no longer move enough to be worth drawing. */
export const MAX_WEEKLY_LITRES = 400_000;
/** The thumb moves the mark in steps this size. */
export const STEP_LITRES = 500;

/** Weeks of history before the mark can be suggested from a person's own log. */
export const WEEKS_FOR_BASELINE = 2;

/** How close to the mark counts as close. */
const NEAR = 0.85;

export type GoalStatus = 'under' | 'near' | 'over';

export type GoalProgress = {
  /** Litres confirmed in the current week. */
  spent: number;
  /** The mark, in litres per week. */
  goal: number;
  /** `spent / goal`, uncapped — past the mark this runs above 1. */
  ratio: number;
  /** `ratio` clipped to the track, which is what the fill is drawn from. */
  fill: number;
  /** Where the week ought to be by now, 0–1, from the weekday alone. */
  pace: number;
  status: GoalStatus;
  /** Litres still inside the mark, or 0 once it is passed. */
  remaining: number;
  /** Litres past the mark, or 0 while still inside it. */
  over: number;
  /** Whole days left in the week, today excluded. Sunday is 0. */
  daysLeft: number;
};

/**
 * Where a week stands.
 *
 * `dayOfWeek` is 1 for Monday through 7 for Sunday — the same numbering
 * `dayOfLocalWeek` produces, which is the same Monday-to-Sunday week the
 * `local_week` key buckets into.
 *
 * Pace is the *whole* of the current day, not the part of it that has elapsed.
 * A person who has logged Monday's lunch on Monday has not overspent Monday,
 * and a mark that ticks forward hour by hour would say they had.
 */
export function progressFor(
  spent: number,
  goal: number,
  dayOfWeek: number,
): GoalProgress {
  const safeGoal = Math.max(goal, 1);
  const day = Math.min(7, Math.max(1, Math.round(dayOfWeek)));
  const ratio = Math.max(0, spent) / safeGoal;

  return {
    spent: Math.max(0, spent),
    goal: safeGoal,
    ratio,
    fill: Math.min(1, ratio),
    pace: day / 7,
    status: ratio > 1 ? 'over' : ratio >= NEAR ? 'near' : 'under',
    remaining: Math.max(0, safeGoal - Math.max(0, spent)),
    over: Math.max(0, Math.max(0, spent) - safeGoal),
    daysLeft: 7 - day,
  };
}

/** Keeps a mark inside the range the bar can draw, on the step the thumb moves in. */
export function clampGoal(litres: number): number {
  const stepped = Math.round(litres / STEP_LITRES) * STEP_LITRES;
  return Math.min(MAX_WEEKLY_LITRES, Math.max(MIN_WEEKLY_LITRES, stepped));
}

/**
 * The average of the weeks that actually have something in them.
 *
 * Open weeks are dropped rather than counted as zero: a person who logged
 * nothing while away would otherwise be handed a mark built from their silence.
 * The current week is the caller's to exclude — it is still running, and half a
 * week averaged in reads as a drop that never happened.
 */
export function baselineFrom(weeks: { totalLitres: number; entryCount: number }[]): number | null {
  const logged = weeks.filter((week) => week.entryCount > 0);
  if (logged.length < WEEKS_FOR_BASELINE) return null;
  const total = logged.reduce((sum, week) => sum + week.totalLitres, 0);
  return total / logged.length;
}

export type GoalSuggestion = {
  /** What the mark would be. */
  litres: number;
  /** The share of the baseline it asks for, e.g. 0.9 for a tenth under. */
  share: number;
};

/** The three marks offered beside a baseline, gentlest first. */
export const SUGGESTION_SHARES = [0.9, 0.75, 1] as const;

export function suggestionsFrom(baseline: number | null): GoalSuggestion[] | null {
  if (baseline === null || baseline <= 0) return null;
  return SUGGESTION_SHARES.map((share) => ({
    share,
    litres: clampGoal(baseline * share),
  }));
}

/**
 * The mark offered before there is any history to build one from.
 *
 * A person on day one has no average, and there is no defensible per-person
 * water figure to fall back on the way a calorie tracker falls back on
 * maintenance calories. So this is a round number to measure a first week
 * against, and the first-run copy says exactly that rather than dressing it up
 * as a recommendation. Once two weeks are logged, `suggestionsFrom` takes over
 * and the number becomes the person's own.
 */
export const OPENING_GOAL_LITRES = 16_000;
