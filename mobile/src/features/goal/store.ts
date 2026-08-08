/**
 * The mark, and the week measured against it.
 *
 * Held apart from the history store because the two answer different questions
 * and change at different rates: history is re-read on every arrival and after
 * every removal, while the mark changes when a person moves it and at no other
 * time. Both re-read together, though, so a removal moves the hero figure and
 * the bar in the same commit.
 *
 * The mark itself is durable, in the same key-value table preferences use. It
 * is a small enough thing that a row of its own would be ceremony.
 */

import { create } from 'zustand';

import { kvGet, kvSet } from '../../data/db';
import { thisWeekTotal, weekLeaders, weekTotals } from '../../data/entries';
import type { WeekLeader, WeekTotal } from '../../data/types';
import { dayOfLocalWeek } from '../../lib/time';
import {
  baselineFrom,
  clampGoal,
  progressFor,
  type GoalProgress,
} from './goal';

const KEY = 'goal.weekly.v1';

/** Weeks read for the baseline, the current one included and then dropped. */
const BASELINE_WINDOW = 5;

export type GoalState = {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  /** Litres a week, or nothing while no mark has been set. */
  goal: number | null;
  /** This week so far. */
  week: WeekTotal | null;
  /** The window behind it, oldest first, current week last. */
  history: WeekTotal[];
  /** The heaviest items in the current week, heaviest first. */
  leaders: WeekLeader[];
  /** 1 = Monday … 7 = Sunday, in the person's own zone. */
  dayOfWeek: number;
  error: string | null;

  load: () => Promise<void>;
  setGoal: (litres: number) => Promise<void>;
  clearGoal: () => Promise<void>;
};

/**
 * What the bar draws, or nothing while there is no mark to draw against.
 *
 * Not for use as a hook selector: it builds a fresh object on every call, and
 * a selector that never returns the same reference twice re-renders on every
 * store read. Components take the three figures off the store and derive this
 * in a memo.
 */
export function progressOf(state: GoalState): GoalProgress | null {
  if (state.goal === null || !state.week) return null;
  return progressFor(state.week.totalLitres, state.goal, state.dayOfWeek);
}

/**
 * The average of the completed weeks behind this one.
 *
 * The current week is dropped before averaging — it is still running, and a
 * Tuesday counted as a whole week drags the number down every time.
 *
 * Safe as a selector: a number compares by value.
 */
export function baselineOf(state: GoalState): number | null {
  return baselineFrom(state.history.slice(0, -1));
}

async function read(): Promise<Pick<GoalState, 'week' | 'history' | 'leaders' | 'dayOfWeek'>> {
  const now = new Date();
  const [week, history] = await Promise.all([
    thisWeekTotal(now),
    weekTotals(BASELINE_WINDOW, now),
  ]);
  return {
    week,
    history,
    leaders: await weekLeaders(week.localWeek),
    dayOfWeek: dayOfLocalWeek(now),
  };
}

/** A stored mark, or nothing when the key is empty, unparseable, or nonsense. */
export function parseGoal(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return clampGoal(value);
}

export const useGoalStore = create<GoalState>((set, get) => ({
  status: 'idle',
  goal: null,
  week: null,
  history: [],
  leaders: [],
  dayOfWeek: dayOfLocalWeek(),
  error: null,

  load: async () => {
    if (get().status === 'idle') set({ status: 'loading' });
    try {
      const [stored, counts] = await Promise.all([kvGet(KEY), read()]);
      set({ ...counts, goal: parseGoal(stored), status: 'ready', error: null });
    } catch (error) {
      set({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  setGoal: async (litres) => {
    const goal = clampGoal(litres);
    // Set first, write second. The bar should move under the thumb that moved
    // it; a failed write costs the mark on next launch, not the interaction.
    set({ goal });
    await kvSet(KEY, String(goal));
  },

  clearGoal: async () => {
    set({ goal: null });
    await kvSet(KEY, '');
  },
}));
