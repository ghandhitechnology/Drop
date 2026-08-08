import { create } from 'zustand';

/**
 * The signal a fresh save sends to the History door.
 *
 * The saved card flies to the top-right chip; this is the chip hearing about
 * it. A counter rather than a flag, so two saves in quick succession pulse
 * twice instead of the second one vanishing into an already-true boolean.
 */
export const useHistoryPulse = create<{ count: number }>(() => ({ count: 0 }));

export function pulseHistory(): void {
  useHistoryPulse.setState((s) => ({ count: s.count + 1 }));
}
