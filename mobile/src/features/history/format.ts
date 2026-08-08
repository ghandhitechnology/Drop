/**
 * Turning stored keys into words.
 *
 * Every day in history is stored as a `YYYY-MM-DD` string that was computed in
 * the person's own zone at write time (see `lib/time.ts`). Reading one back is
 * therefore pure string work — the key is anchored to UTC midnight and every
 * formatter is asked for UTC, so a device that has since flown to another
 * timezone still prints the same weekday against the same key.
 */

import { copy, formatLitres, formatQuantity } from '../../lib/copy';
import type { Entry } from '../../data/types';

/* ---------------------------------------------------------------- litres */

/** "4,200 litres" — for anything a screen reader says out loud. */
export function litresSpoken(value: number): string {
  return `${formatLitres(value)} ${copy.result.unit}`;
}

/** "4,200 L" — for anything printed beside other figures. */
export function litresShort(value: number): string {
  return `${formatLitres(value)} ${copy.result.unitShort}`;
}

/* ------------------------------------------------------------ day keys -- */

/** A `YYYY-MM-DD` key, anchored to UTC midnight so formatting never drifts. */
export function parseDayKey(key: string): Date {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  const at = new Date(Date.UTC(year, month - 1, day));
  at.setUTCFullYear(year, month - 1, day);
  return at;
}

function keyOf(at: Date): string {
  const year = String(at.getUTCFullYear()).padStart(4, '0');
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  const day = String(at.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The key one calendar day before `key`. */
export function previousDayKey(key: string): string {
  const at = parseDayKey(key);
  at.setUTCDate(at.getUTCDate() - 1);
  return keyOf(at);
}

/* --------------------------------------------------------- formatters --- */

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(name: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat | null {
  const hit = cache.get(name);
  if (hit) return hit;
  try {
    const made = new Intl.DateTimeFormat(undefined, options);
    cache.set(name, made);
    return made;
  } catch {
    return null;
  }
}

/** "Tuesday". Falls back to the key itself where no zone database exists. */
export function weekdayName(key: string): string {
  const format = formatter('weekday', { weekday: 'long', timeZone: 'UTC' });
  return format ? format.format(parseDayKey(key)) : key;
}

/** "Tue" — the axis tick under a seven-day bar. */
export function weekdayShort(key: string): string {
  const format = formatter('weekdayShort', { weekday: 'short', timeZone: 'UTC' });
  return format ? format.format(parseDayKey(key)) : key.slice(8, 10);
}

/** "Aug 5" — the compact form the 30-day chart and the row stamps use. */
export function shortDate(key: string): string {
  const format = formatter('short', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return format ? format.format(parseDayKey(key)) : key;
}

/** "Tuesday, August 5" — a day header that is neither today nor yesterday. */
export function longDate(key: string): string {
  const format = formatter('long', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return format ? format.format(parseDayKey(key)) : key;
}

/**
 * What a day header says. The two most recent days get their names, because
 * that is how a person refers to them; everything older gets its date.
 */
export function dayHeading(key: string, todayKey: string): string {
  if (key === todayKey) return copy.history.today;
  if (key === previousDayKey(todayKey)) return copy.history.yesterday;
  return longDate(key);
}

/** How a bar is named in the chart, which differs with how many there are. */
export function barDayName(key: string, todayKey: string, dense: boolean): string {
  if (key === todayKey) return copy.history.today;
  return dense ? shortDate(key) : weekdayName(key);
}

/** "09:12", in the zone the entry was actually recorded in. */
export function timeOfDay(at: number, timeZone: string): string {
  let format = cache.get(`clock:${timeZone}`);
  if (!format) {
    try {
      format = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone,
      });
      cache.set(`clock:${timeZone}`, format);
    } catch {
      format = formatter('clock', { hour: '2-digit', minute: '2-digit' }) ?? undefined;
    }
  }
  return format ? format.format(new Date(at)) : '';
}

/** "Today at 09:12" / "Tuesday, August 5 at 09:12". */
export function recordedAt(entry: Entry, todayKey: string): string {
  return `${dayHeading(entry.local_day, todayKey)} at ${timeOfDay(entry.created_at, entry.tz)}`;
}

/* ---------------------------------------------------------- quantities -- */

const PLAIN_UNIT: Record<string, string> = {
  g: 'g',
  ml: 'ml',
  item: '×',
};

/**
 * The amount, in one phrase.
 *
 * `formatQuantity` covers the four units a computed estimate normalises to.
 * A frozen snapshot can also carry the raw unit an unsupported item was asked
 * about, so those three are printed straight through.
 */
export function quantityText(value: number, unit: string): string {
  if (unit === 'kg' || unit === 'l' || unit === 'km' || unit === 'usd') {
    return formatQuantity(value, unit);
  }
  const suffix = PLAIN_UNIT[unit] ?? unit;
  const trimmed = String(Math.round(value * 100) / 100);
  return unit === 'item' ? `×${trimmed}` : `${trimmed} ${suffix}`;
}
