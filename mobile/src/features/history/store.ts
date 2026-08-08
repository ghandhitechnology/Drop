/**
 * What history knows, held in one place.
 *
 * The screen, the chart, and the detail page all read the same snapshot, so a
 * removal moves the hero figure, the bars, and the list in the same commit
 * rather than in three. Every mutation goes through the repository and is
 * followed by a full re-read: the repository recomputes `daily_totals` inside
 * its own transaction, and re-reading is how this store inherits that guarantee
 * instead of trying to reproduce it.
 *
 * A re-read is four indexed queries over a few hundred rows. Cheap enough that
 * being obviously correct is the better trade.
 */

import { create } from 'zustand';

import {
  listRecent,
  softDelete,
  todayTotal,
  trends,
  undoDelete,
} from '../../data/entries';
import type { DailyTotal, Entry } from '../../data/types';

/** How far back the list reaches in one read. */
export const HISTORY_LIMIT = 400;

/** How long the way back stays offered after a removal. */
export const UNDO_WINDOW_MS = 5000;

export type ChartRange = 7 | 30;

export type PendingRemoval = { id: string; label: string };

export type HistoryState = {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  entries: Entry[];
  today: DailyTotal;
  week: DailyTotal[];
  month: DailyTotal[];
  range: ChartRange;
  pending: PendingRemoval | null;
  error: string | null;

  load: () => Promise<void>;
  setRange: (range: ChartRange) => void;
  remove: (id: string) => Promise<void>;
  restore: () => Promise<void>;
  dismissUndo: () => void;
};

const EMPTY_TOTAL: DailyTotal = {
  localDay: '',
  totalLitres: 0,
  entryCount: 0,
  byCategory: {},
  updatedAt: 0,
};

let undoTimer: ReturnType<typeof setTimeout> | null = null;

function clearUndoTimer(): void {
  if (undoTimer) {
    clearTimeout(undoTimer);
    undoTimer = null;
  }
}

async function read(): Promise<Pick<HistoryState, 'entries' | 'today' | 'week' | 'month'>> {
  const [entries, today, week, month] = await Promise.all([
    listRecent(HISTORY_LIMIT),
    todayTotal(),
    trends(7),
    trends(30),
  ]);
  return { entries, today, week, month };
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  status: 'idle',
  entries: [],
  today: EMPTY_TOTAL,
  week: [],
  month: [],
  range: 7,
  pending: null,
  error: null,

  load: async () => {
    if (get().status === 'idle') set({ status: 'loading' });
    try {
      set({ ...(await read()), status: 'ready', error: null });
    } catch (error) {
      set({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  setRange: (range) => set({ range }),

  remove: async (id) => {
    const entry = get().entries.find((row) => row.id === id);
    const label = entry ? entry.item_label : '';
    // `softDelete` names the day it touched, or nothing when the row was
    // already out. A second removal must never offer a way back to a state it
    // did not create.
    const day = await softDelete(id);
    if (!day) {
      set(await read());
      return;
    }
    set({ ...(await read()), pending: { id, label } });

    clearUndoTimer();
    undoTimer = setTimeout(() => {
      undoTimer = null;
      // Only retire the offer if it is still the one this timer was set for.
      if (get().pending?.id === id) set({ pending: null });
    }, UNDO_WINDOW_MS);
  },

  restore: async () => {
    const pending = get().pending;
    if (!pending) return;
    clearUndoTimer();
    await undoDelete(pending.id);
    set({ ...(await read()), pending: null });
  },

  dismissUndo: () => {
    clearUndoTimer();
    set({ pending: null });
  },
}));

/* ------------------------------------------------------------- grouping -- */

export type DaySection = {
  /** `YYYY-MM-DD`, the key the entries were stamped with. */
  day: string;
  /** Litres across the day's live entries. */
  total: number;
  data: Entry[];
};

/**
 * Entries arrive newest first, so walking them in order yields days in the same
 * order with no sort. The day total is summed from the very rows on screen,
 * which is what makes the header and the list impossible to disagree.
 */
export function groupByDay(entries: Entry[]): DaySection[] {
  const sections: DaySection[] = [];
  let current: DaySection | null = null;

  for (const entry of entries) {
    if (!current || current.day !== entry.local_day) {
      current = { day: entry.local_day, total: 0, data: [] };
      sections.push(current);
    }
    current.total += entry.litres;
    current.data.push(entry);
  }

  return sections;
}
