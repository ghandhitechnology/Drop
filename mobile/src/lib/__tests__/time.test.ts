import { describe, expect, it } from 'vitest';

import {
  calendarDateIn,
  dayOfLocalWeek,
  deviceTimeZone,
  localDay,
  localWeek,
  recentDays,
  recentWeeks,
  stampFor,
} from '../time';

const SEOUL = 'Asia/Seoul';
const LA = 'America/Los_Angeles';
const CHATHAM = 'Pacific/Chatham'; // UTC+12:45 / +13:45 — a 45-minute offset.

describe('localDay', () => {
  it('reads the calendar date in the requested zone', () => {
    const instant = new Date('2026-08-07T15:30:00Z');
    expect(localDay(instant, SEOUL)).toBe('2026-08-08');
    expect(localDay(instant, LA)).toBe('2026-08-07');
    expect(localDay(instant, 'UTC')).toBe('2026-08-07');
  });

  it('puts the same instant on different days either side of midnight', () => {
    // 16:00 UTC is 09:00 in Los Angeles and 01:00 the next day in Seoul.
    const instant = new Date('2026-01-01T16:00:00Z');
    expect(localDay(instant, LA)).toBe('2026-01-01');
    expect(localDay(instant, SEOUL)).toBe('2026-01-02');
  });

  it('handles zones with a 45-minute offset', () => {
    const instant = new Date('2026-06-30T11:20:00Z'); // 00:05 on 1 July in Chatham
    expect(localDay(instant, CHATHAM)).toBe('2026-07-01');
  });

  it('keeps a spring-forward DST day as one day', () => {
    // US DST starts 2026-03-08. 10:00 UTC is 02:00 PST → 03:00 PDT.
    expect(localDay(new Date('2026-03-08T09:00:00Z'), LA)).toBe('2026-03-08');
    expect(localDay(new Date('2026-03-08T11:00:00Z'), LA)).toBe('2026-03-08');
  });

  it('zero-pads month and day', () => {
    expect(localDay(new Date('2026-01-05T12:00:00Z'), 'UTC')).toBe('2026-01-05');
  });
});

describe('localWeek', () => {
  it('numbers ISO weeks from the Monday', () => {
    expect(localWeek(new Date('2026-08-03T12:00:00Z'), 'UTC')).toBe('2026-W32'); // Monday
    expect(localWeek(new Date('2026-08-09T12:00:00Z'), 'UTC')).toBe('2026-W32'); // Sunday
    expect(localWeek(new Date('2026-08-10T12:00:00Z'), 'UTC')).toBe('2026-W33'); // next Monday
  });

  it('assigns a week to the year holding its Thursday', () => {
    // 2027-01-01 is a Friday, so its week belongs to 2026 and is week 53.
    expect(localWeek(new Date('2027-01-01T12:00:00Z'), 'UTC')).toBe('2026-W53');
    // 2026-01-01 is a Thursday, so that week is 2026's first.
    expect(localWeek(new Date('2026-01-01T12:00:00Z'), 'UTC')).toBe('2026-W01');
    // 2025-12-29 is a Monday already inside that week.
    expect(localWeek(new Date('2025-12-29T12:00:00Z'), 'UTC')).toBe('2026-W01');
  });

  it('follows the zone across a week boundary', () => {
    // Sunday 22:00 UTC is still Sunday in LA and Monday in Seoul.
    const instant = new Date('2026-08-09T22:00:00Z');
    expect(localWeek(instant, LA)).toBe('2026-W32');
    expect(localWeek(instant, SEOUL)).toBe('2026-W33');
  });

  it('always emits a two-digit week', () => {
    expect(localWeek(new Date('2026-01-08T12:00:00Z'), 'UTC')).toBe('2026-W02');
  });
});

describe('calendarDateIn', () => {
  it('returns numeric parts, not strings', () => {
    expect(calendarDateIn(new Date('2026-08-07T15:30:00Z'), SEOUL)).toEqual({
      year: 2026,
      month: 8,
      day: 8,
    });
  });

  it('falls back to device-local fields for an unknown zone', () => {
    const instant = new Date('2026-08-07T15:30:00Z');
    expect(calendarDateIn(instant, 'Not/AZone')).toEqual({
      year: instant.getFullYear(),
      month: instant.getMonth() + 1,
      day: instant.getDate(),
    });
  });
});

describe('recentDays', () => {
  it('returns the window oldest first, ending on the given day', () => {
    expect(recentDays(4, new Date('2026-08-08T02:00:00Z'), 'UTC')).toEqual([
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
    ]);
  });

  it('walks back across a month boundary', () => {
    expect(recentDays(3, new Date('2026-03-01T12:00:00Z'), 'UTC')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
    ]);
  });

  it('walks back across a leap day', () => {
    expect(recentDays(3, new Date('2028-03-01T12:00:00Z'), 'UTC')).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });

  it('gives one key per day with no repeats over a long window', () => {
    const keys = recentDays(400, new Date('2026-08-08T12:00:00Z'), 'UTC');
    expect(keys).toHaveLength(400);
    expect(new Set(keys).size).toBe(400);
    expect(keys[399]).toBe('2026-08-08');
  });

  it('returns an empty window for a zero count', () => {
    expect(recentDays(0, new Date('2026-08-08T12:00:00Z'), 'UTC')).toEqual([]);
  });
});

describe('dayOfLocalWeek', () => {
  it('numbers Monday 1 through Sunday 7', () => {
    // 2026-08-10 is a Monday.
    expect(dayOfLocalWeek(new Date('2026-08-10T12:00:00Z'), 'UTC')).toBe(1);
    expect(dayOfLocalWeek(new Date('2026-08-13T12:00:00Z'), 'UTC')).toBe(4);
    expect(dayOfLocalWeek(new Date('2026-08-16T12:00:00Z'), 'UTC')).toBe(7);
  });

  it('reads the weekday in the given zone, not in UTC', () => {
    // 22:00 UTC Sunday is already Monday in Seoul.
    const at = new Date('2026-08-09T22:00:00Z');
    expect(dayOfLocalWeek(at, 'UTC')).toBe(7);
    expect(dayOfLocalWeek(at, SEOUL)).toBe(1);
  });

  it('agrees with the week key it has to divide', () => {
    // Day 1 is the first day of the week `localWeek` names, so stepping back
    // that many days minus one has to stay inside the same week, and one more
    // has to leave it.
    const at = new Date('2026-08-13T09:00:00Z');
    const day = dayOfLocalWeek(at, SEOUL);
    const inside = new Date(at.getTime() - (day - 1) * 86_400_000);
    const before = new Date(at.getTime() - day * 86_400_000);

    expect(localWeek(inside, SEOUL)).toBe(localWeek(at, SEOUL));
    expect(localWeek(before, SEOUL)).not.toBe(localWeek(at, SEOUL));
  });
});

describe('recentWeeks', () => {
  it('walks back one week at a time, oldest first', () => {
    expect(recentWeeks(4, new Date('2026-08-13T12:00:00Z'), 'UTC')).toEqual([
      '2026-W30',
      '2026-W31',
      '2026-W32',
      '2026-W33',
    ]);
  });

  it('ends on the week the date itself falls in', () => {
    const at = new Date('2026-08-13T12:00:00Z');
    const keys = recentWeeks(5, at, SEOUL);
    expect(keys.at(-1)).toBe(localWeek(at, SEOUL));
  });

  it('crosses the turn of the year without a special case', () => {
    // 2026-W53 exists; 2027 starts inside it.
    expect(recentWeeks(3, new Date('2027-01-07T12:00:00Z'), 'UTC')).toEqual([
      '2026-W52',
      '2026-W53',
      '2027-W01',
    ]);
  });

  it('gives one key per week with no repeats over a long window', () => {
    const keys = recentWeeks(60, new Date('2026-08-08T12:00:00Z'), 'UTC');
    expect(keys).toHaveLength(60);
    expect(new Set(keys).size).toBe(60);
  });

  it('returns an empty window for a zero count', () => {
    expect(recentWeeks(0, new Date('2026-08-08T12:00:00Z'), 'UTC')).toEqual([]);
  });
});

describe('stampFor', () => {
  it('carries the day, the week, and the zone that produced them', () => {
    expect(stampFor(new Date('2026-08-09T22:00:00Z'), SEOUL)).toEqual({
      localDay: '2026-08-10',
      localWeek: '2026-W33',
      tz: SEOUL,
    });
  });

  it('agrees with the individual helpers under the device zone', () => {
    const now = new Date('2026-05-14T08:15:00Z');
    const stamp = stampFor(now);
    expect(stamp.tz).toBe(deviceTimeZone());
    expect(stamp.localDay).toBe(localDay(now, stamp.tz));
    expect(stamp.localWeek).toBe(localWeek(now, stamp.tz));
  });
});
