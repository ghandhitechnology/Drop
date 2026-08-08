/**
 * Reading a stored day key back into words.
 *
 * The keys were computed in the person's own zone at write time. Formatting one
 * must therefore never consult the device zone again, or a flight would rename
 * everybody's Tuesdays.
 */
import { describe, expect, it } from 'vitest';

import {
  dayHeading,
  litresShort,
  litresSpoken,
  longDate,
  parseDayKey,
  previousDayKey,
  quantityText,
  shortDate,
  timeOfDay,
  weekdayName,
  weekdayShort,
} from '../format';

describe('day keys', () => {
  it('anchors a key to UTC midnight', () => {
    const at = parseDayKey('2026-08-08');
    expect(at.toISOString()).toBe('2026-08-08T00:00:00.000Z');
  });

  it('steps back a day across a month boundary', () => {
    expect(previousDayKey('2026-08-01')).toBe('2026-07-31');
    expect(previousDayKey('2026-01-01')).toBe('2025-12-31');
    expect(previousDayKey('2026-03-01')).toBe('2026-02-28');
    // 2028 is a leap year.
    expect(previousDayKey('2028-03-01')).toBe('2028-02-29');
  });
});

describe('weekday names', () => {
  it('names the day the key actually is', () => {
    // 2026-08-08 is a Saturday.
    expect(weekdayName('2026-08-08')).toBe('Saturday');
    expect(weekdayShort('2026-08-08')).toBe('Sat');
    expect(weekdayName('2026-08-10')).toBe('Monday');
  });

  it('reads the same in a zone far behind UTC', () => {
    // A key is a calendar fact, so a device in Honolulu must not shift it back
    // a day the way a local-midnight Date would.
    const before = process.env.TZ;
    process.env.TZ = 'Pacific/Honolulu';
    try {
      expect(weekdayName('2026-08-08')).toBe('Saturday');
      expect(shortDate('2026-08-08')).toContain('8');
    } finally {
      process.env.TZ = before;
    }
  });
});

describe('dayHeading', () => {
  it('uses the two names a person actually says', () => {
    expect(dayHeading('2026-08-08', '2026-08-08')).toBe('Today');
    expect(dayHeading('2026-08-07', '2026-08-08')).toBe('Yesterday');
  });

  it('dates anything older', () => {
    const heading = dayHeading('2026-08-05', '2026-08-08');
    expect(heading).toBe(longDate('2026-08-05'));
    expect(heading).toContain('Wednesday');
  });
});

describe('litres', () => {
  it('groups the digits and names the unit', () => {
    expect(litresSpoken(4200)).toBe('4,200 litres');
    expect(litresShort(4200)).toBe('4,200 L');
  });

  it('keeps one decimal under a hundred', () => {
    expect(litresShort(93.34)).toBe('93.3 L');
    expect(litresShort(0)).toBe('0 L');
  });
});

describe('quantityText', () => {
  it('speaks the four units a computed estimate normalises to', () => {
    expect(quantityText(0.15, 'kg')).toBe('150 g');
    expect(quantityText(1.2, 'kg')).toBe('1.2 kg');
    expect(quantityText(0.125, 'l')).toBe('125 ml');
    expect(quantityText(10, 'km')).toBe('10 km');
    expect(quantityText(25, 'usd')).toBe('$25');
  });

  it('prints the raw units a frozen snapshot can also carry', () => {
    expect(quantityText(120, 'g')).toBe('120 g');
    expect(quantityText(250, 'ml')).toBe('250 ml');
    expect(quantityText(2, 'item')).toBe('×2');
  });
});

describe('timeOfDay', () => {
  it('reads the clock in the zone the entry was recorded in', () => {
    // 2026-08-08T01:30Z is 10:30 in Seoul and 21:30 the evening before in New York.
    const at = Date.UTC(2026, 7, 8, 1, 30);
    expect(timeOfDay(at, 'Asia/Seoul')).toContain('10:30');
    expect(timeOfDay(at, 'America/New_York')).toContain('9:30');
  });

  it('still says something when the zone label is unknown', () => {
    expect(timeOfDay(Date.UTC(2026, 7, 8, 1, 30), 'UTC+09:00')).not.toBe(undefined);
  });
});
