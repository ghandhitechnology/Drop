/**
 * Whether this is the first run.
 *
 * One row in the key-value table, read once at boot. The key carries a version
 * so a future first-run flow can be shown again to people who have already seen
 * this one, without a migration and without showing *this* one twice.
 *
 * The flag is written the moment the flow is left by any door — finished,
 * skipped, or dismissed with the system Back gesture. Onboarding that reappears
 * because someone left it the "wrong" way is a bug that feels like an accusation.
 */
import { create } from 'zustand';

import { kvGet, kvSet } from '../../data/db';

export const FIRST_RUN_KEY = 'onboarding.seen.v1';

export type FirstRunStatus =
  /** The database has yet to answer. Nothing should render on this. */
  | 'unknown'
  /** Never seen. The flow owns the screen. */
  | 'pending'
  /** Seen, at some point. The camera owns the screen. */
  | 'done';

type FirstRunState = {
  status: FirstRunStatus;
  /** Reads the flag. Safe to call repeatedly; the first answer wins. */
  load: () => Promise<void>;
  /** Marks the flow as seen and lets the camera through. */
  complete: () => Promise<void>;
  /**
   * Clears the flag and offers the flow again, without touching history.
   *
   * For the data lab. Emptying the database also clears this key, but it takes
   * every entry with it, and wanting to see the welcome again is a poor reason
   * to lose a month of logging.
   */
  replay: () => Promise<void>;
};

export const useFirstRun = create<FirstRunState>((set, get) => ({
  status: 'unknown',

  load: async () => {
    if (get().status !== 'unknown') return;
    try {
      const seen = await kvGet(FIRST_RUN_KEY);
      set({ status: seen ? 'done' : 'pending' });
    } catch {
      // A database that will not open is a much larger problem than a missed
      // welcome. Let the person into the product.
      set({ status: 'done' });
    }
  },

  complete: async () => {
    // The screen changes first. Persisting is bookkeeping, and a person who
    // pressed "Show me" should already be looking at the camera.
    set({ status: 'done' });
    try {
      await kvSet(FIRST_RUN_KEY, String(Date.now()));
    } catch {
      // Worst case the welcome is offered once more next launch.
    }
  },

  replay: async () => {
    // Written before the status moves: `load` short-circuits once the status
    // has left 'unknown', so a failed write here would leave the flow offered
    // on this launch and gone on the next one.
    await kvSet(FIRST_RUN_KEY, '');
    set({ status: 'pending' });
  },
}));
