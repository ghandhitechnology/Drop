import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';

import { kvGet, kvSet } from '../../data/db';
import { observeUsage, readUsageSnapshot, type UsageSnapshot } from '../../data/api/usage';
import { localDay } from '../../lib/time';
import { fetchUsage } from './api';
import { usageIsFullForDay } from './policy';

const CACHE_KEY = 'usage.snapshot.v1';

export type UsageStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'error';

export type UsageState = {
  status: UsageStatus;
  snapshot: UsageSnapshot | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
};

let resetTimer: ReturnType<typeof setTimeout> | null = null;

function isToday(snapshot: UsageSnapshot): boolean {
  return snapshot.local_day === localDay();
}

function scheduleReset(snapshot: UsageSnapshot): void {
  if (resetTimer) clearTimeout(resetTimer);
  const delay = Math.max(0, Date.parse(snapshot.resets_at) - Date.now() + 250);
  resetTimer = setTimeout(
    () => {
      const current = useUsage.getState().snapshot;
      if (current && !isToday(current)) useUsage.setState({ status: 'stale' });
      useUsage
        .getState()
        .refresh()
        .catch(() => {});
    },
    Math.min(delay, 2_147_000_000),
  );
}

export function applyUsageSnapshot(snapshot: UsageSnapshot): void {
  useUsage.setState({
    snapshot,
    status: isToday(snapshot) ? 'ready' : 'stale',
    refreshing: false,
  });
  scheduleReset(snapshot);
  kvSet(CACHE_KEY, JSON.stringify(snapshot)).catch(() => {});
}

export const useUsage = create<UsageState>((set, get) => ({
  status: 'idle',
  snapshot: null,
  refreshing: false,
  refresh: async () => {
    if (get().refreshing) return;
    const hadSnapshot = Boolean(get().snapshot);
    set({ refreshing: true, status: hadSnapshot ? get().status : 'loading' });
    try {
      applyUsageSnapshot(await fetchUsage());
    } catch {
      const snapshot = get().snapshot;
      set({
        refreshing: false,
        status: snapshot && !isToday(snapshot) ? 'stale' : 'error',
      });
    }
  },
}));

let started = false;

export async function startUsageSync(): Promise<() => void> {
  if (started) return () => {};
  started = true;
  observeUsage(applyUsageSnapshot);

  try {
    const cached = readUsageSnapshot(JSON.parse((await kvGet(CACHE_KEY)) ?? 'null'));
    if (cached) {
      useUsage.setState({
        snapshot: cached,
        status: isToday(cached) ? 'ready' : 'stale',
      });
      scheduleReset(cached);
    }
  } catch {}

  useUsage
    .getState()
    .refresh()
    .catch(() => {});
  const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state !== 'active') return;
    const snapshot = useUsage.getState().snapshot;
    if (snapshot && !isToday(snapshot)) useUsage.setState({ status: 'stale' });
    useUsage
      .getState()
      .refresh()
      .catch(() => {});
  });

  return () => {
    subscription.remove();
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = null;
    observeUsage(null);
    started = false;
  };
}

export function usageIsFull(state: Pick<UsageState, 'status' | 'snapshot'>): boolean {
  return usageIsFullForDay(state, localDay());
}
