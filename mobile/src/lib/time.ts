/**
 * Local calendar keys.
 *
 * Every entry is stamped at write time with the day and week it belongs to *in
 * the person's own timezone*, computed here in JS. SQLite never sees a timezone
 * and never does date arithmetic: it stores the two strings we hand it, so a
 * day bucket stays stable even if the device later moves timezone.
 */

/** IANA zone the device is currently in, e.g. `Asia/Seoul`. */
export function deviceTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) return zone;
  } catch {
    // Fall through to the offset-based label below.
  }
  return offsetZoneLabel(new Date());
}

/** `UTC+09:00`-style label, used when the runtime has no IANA zone database. */
function offsetZoneLabel(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export type CalendarDate = { year: number; month: number; day: number };

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  const cached = partsCache.get(timeZone);
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      era: 'short',
    });
    partsCache.set(timeZone, formatter);
    return formatter;
  } catch {
    return null;
  }
}

/**
 * The calendar date `date` falls on inside `timeZone`.
 *
 * Uses `Intl` when the runtime carries a zone database (Hermes on Android
 * does), and otherwise reads the device's own local fields, which is exactly
 * right whenever `timeZone` is the device zone.
 */
export function calendarDateIn(date: Date, timeZone: string): CalendarDate {
  const formatter = formatterFor(timeZone);
  if (formatter) {
    let year = NaN;
    let month = NaN;
    let day = NaN;
    let bce = false;
    for (const part of formatter.formatToParts(date)) {
      if (part.type === 'year') year = Number(part.value);
      else if (part.type === 'month') month = Number(part.value);
      else if (part.type === 'day') day = Number(part.value);
      else if (part.type === 'era') bce = part.value.startsWith('B');
    }
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return { year: bce ? 1 - year : year, month, day };
    }
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

/** `YYYY-MM-DD` for the given instant, in the given zone. */
export function localDay(date: Date = new Date(), timeZone: string = deviceTimeZone()): string {
  const { year, month, day } = calendarDateIn(date, timeZone);
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

/**
 * ISO-8601 week key, `YYYY-Www`.
 *
 * Weeks run Monday to Sunday and belong to the year holding their Thursday, so
 * the leading year is the ISO week-year and can differ from the calendar year
 * across a New Year boundary — `2027-01-01` sits in `2026-W53`.
 */
export function localWeek(date: Date = new Date(), timeZone: string = deviceTimeZone()): string {
  const { year, month, day } = calendarDateIn(date, timeZone);
  // Anchor the local calendar date to UTC midnight so the week walk is pure
  // integer arithmetic with no DST steps in it.
  const anchor = new Date(Date.UTC(year, month - 1, day));
  anchor.setUTCFullYear(year); // keeps years 0–99 out of the 1900s
  // Monday = 0 … Sunday = 6.
  const weekday = (anchor.getUTCDay() + 6) % 7;
  // The Thursday of this week decides which year the week belongs to.
  const thursday = new Date(anchor.getTime());
  thursday.setUTCDate(anchor.getUTCDate() - weekday + 3);
  const weekYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4));
  firstThursday.setUTCFullYear(weekYear);
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604800000);
  return `${String(weekYear).padStart(4, '0')}-W${pad2(week)}`;
}

/** Both keys plus the zone that produced them — what a write stamps on a row. */
export type DayStamp = { localDay: string; localWeek: string; tz: string };

export function stampFor(date: Date = new Date(), timeZone: string = deviceTimeZone()): DayStamp {
  return {
    localDay: localDay(date, timeZone),
    localWeek: localWeek(date, timeZone),
    tz: timeZone,
  };
}

/**
 * How far into its week `date` is, counting the day itself. Monday is 1 and
 * Sunday is 7, matching the Monday-to-Sunday week `localWeek` buckets into.
 *
 * A goal spread over a week needs this to say where the week ought to be by
 * now, and it has to agree with `localWeek` exactly or the mark drifts a day
 * every time one of them is changed.
 */
export function dayOfLocalWeek(
  date: Date = new Date(),
  timeZone: string = deviceTimeZone(),
): number {
  const { year, month, day } = calendarDateIn(date, timeZone);
  const anchor = new Date(Date.UTC(year, month - 1, day));
  anchor.setUTCFullYear(year, month - 1, day);
  return ((anchor.getUTCDay() + 6) % 7) + 1;
}

/**
 * The `count` ISO week keys ending at `date`, oldest first.
 *
 * Walks back seven calendar days at a time from the date itself rather than
 * doing arithmetic on the week number, so the turn of the year — where week 1
 * follows week 52 or 53 depending on the year — needs no special case.
 */
export function recentWeeks(
  count: number,
  date: Date = new Date(),
  timeZone: string = deviceTimeZone(),
): string[] {
  const { year, month, day } = calendarDateIn(date, timeZone);
  const out: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const stepped = new Date(Date.UTC(year, month - 1, day - offset * 7));
    stepped.setUTCFullYear(year, month - 1, day - offset * 7);
    // The stepped date is already a calendar date in the person's zone, so it
    // is keyed in UTC to keep the zone from being applied to it a second time.
    out.push(localWeek(stepped, 'UTC'));
  }
  return out;
}

/**
 * The `count` day keys ending at `date`, oldest first. Walks the calendar in
 * the given zone, so a DST day still contributes exactly one key.
 */
export function recentDays(
  count: number,
  date: Date = new Date(),
  timeZone: string = deviceTimeZone(),
): string[] {
  const { year, month, day } = calendarDateIn(date, timeZone);
  const out: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const stepped = new Date(Date.UTC(year, month - 1, day - offset));
    stepped.setUTCFullYear(year, month - 1, day - offset);
    out.push(
      `${String(stepped.getUTCFullYear()).padStart(4, '0')}-` +
        `${pad2(stepped.getUTCMonth() + 1)}-${pad2(stepped.getUTCDate())}`,
    );
  }
  return out;
}
