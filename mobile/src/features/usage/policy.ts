import type { UsageSnapshot } from '../../data/api/usage';

export type UsagePolicyState = {
  status: 'idle' | 'loading' | 'ready' | 'stale' | 'error';
  snapshot: UsageSnapshot | null;
};

export function usageIsFullForDay(state: UsagePolicyState, today: string): boolean {
  return (
    state.status !== 'stale' &&
    state.snapshot?.local_day === today &&
    state.snapshot.remaining === 0
  );
}
