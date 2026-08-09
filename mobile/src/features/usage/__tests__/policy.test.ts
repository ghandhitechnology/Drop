import { describe, expect, it } from 'vitest';

import { usageIsFullForDay } from '../policy';

const full = {
  limit: 20,
  used: 20,
  remaining: 0,
  local_day: '2026-08-10',
  resets_at: '2026-08-10T15:00:00.000Z',
};

describe('usage capture policy', () => {
  it('blocks a same-day full snapshot even while refresh is offline', () => {
    expect(usageIsFullForDay({ status: 'ready', snapshot: full }, '2026-08-10')).toBe(true);
    expect(usageIsFullForDay({ status: 'error', snapshot: full }, '2026-08-10')).toBe(true);
  });

  it('never lets a previous day keep the shutter closed', () => {
    expect(usageIsFullForDay({ status: 'stale', snapshot: full }, '2026-08-11')).toBe(false);
    expect(usageIsFullForDay({ status: 'error', snapshot: full }, '2026-08-11')).toBe(false);
  });
});
