/**
 * The entries repository — the only writer of history.
 *
 * Two rules shape this file:
 *
 * 1. Nothing lands here without an explicit confirmation upstream. The single
 *    write entry point is named for it.
 * 2. The estimate is frozen. `estimate_json` stores the exact object the engine
 *    produced at confirmation time, so a later factors release changes future
 *    numbers and leaves recorded ones untouched.
 *
 * `daily_totals` is recomputed from `entries` inside the same transaction as
 * every insert, delete, and undo. Recomputing rather than incrementing costs a
 * grouped scan of one day (a handful of rows) and makes drift structurally
 * impossible.
 */
import type { Estimate } from '@drop/water-engine';
import type { SQLiteDatabase } from 'expo-sqlite';

import { deviceTimeZone, localDay, localWeek, recentDays } from '../lib/time';
import { getDb } from './db';
import type {
  DailyTotal,
  DailyTotalRow,
  Entry,
  EntryCategory,
  EntryRow,
  InputMethod,
} from './types';

export interface EntryMeta {
  /** How the item reached the confirm screen. */
  inputMethod: InputMethod;
  photoUri?: string | null;
  note?: string | null;
  /** Overrides, for tests and for replaying a queued confirmation. */
  id?: string;
  createdAt?: number;
  timeZone?: string;
}

let counter = 0;

/** Sortable, collision-resistant id without pulling in a uuid dependency. */
export function newEntryId(now: number = Date.now()): string {
  counter = (counter + 1) % 0xffff;
  const time = now.toString(36).padStart(9, '0');
  const seq = counter.toString(36).padStart(3, '0');
  const rand = Math.floor(Math.random() * 0xffffff).toString(36).padStart(5, '0');
  return `e_${time}${seq}${rand}`;
}

/* ------------------------------------------------------------- totals ---- */

async function refreshDailyTotal(
  tx: SQLiteDatabase,
  day: string,
  now: number,
): Promise<void> {
  const groups = await tx.getAllAsync<{ category: EntryCategory; litres: number; n: number }>(
    `SELECT category, SUM(litres) AS litres, COUNT(*) AS n
       FROM entries
      WHERE local_day = ? AND deleted_at IS NULL
      GROUP BY category`,
    day,
  );

  let total = 0;
  let count = 0;
  const byCategory: Record<string, number> = {};
  for (const group of groups) {
    total += group.litres;
    count += group.n;
    byCategory[group.category] = group.litres;
  }

  if (count === 0) {
    await tx.runAsync('DELETE FROM daily_totals WHERE local_day = ?', day);
    return;
  }

  await tx.runAsync(
    `INSERT INTO daily_totals
       (local_day, total_litres, entry_count, by_category_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(local_day) DO UPDATE SET
       total_litres     = excluded.total_litres,
       entry_count      = excluded.entry_count,
       by_category_json = excluded.by_category_json,
       updated_at       = excluded.updated_at`,
    day,
    total,
    count,
    JSON.stringify(byCategory),
    now,
  );
}

/* -------------------------------------------------------------- write ---- */

/**
 * Records a confirmed estimate. Call this only after the person has said yes.
 *
 * The estimate must carry a headline figure; an unsupported item has nothing to
 * add up and is kept out of history entirely.
 */
export async function insertConfirmed(
  estimate: Estimate,
  meta: EntryMeta,
): Promise<Entry> {
  if (!estimate.headline) {
    throw new Error(
      `estimate for ${estimate.catalog_id} carries no headline; it cannot enter history`,
    );
  }

  const createdAt = meta.createdAt ?? Date.now();
  const at = new Date(createdAt);
  const tz = meta.timeZone ?? deviceTimeZone();

  const row: EntryRow = {
    id: meta.id ?? newEntryId(createdAt),
    created_at: createdAt,
    local_day: localDay(at, tz),
    local_week: localWeek(at, tz),
    tz,
    item_id: estimate.catalog_id,
    item_label: estimate.display_name,
    category: estimate.category,
    quantity_value: estimate.quantity.value,
    quantity_unit: estimate.quantity.unit,
    quantity_source: estimate.quantity.source,
    litres: estimate.headline.value_l,
    litres_low: estimate.headline.range_l ? estimate.headline.range_l[0] : null,
    litres_high: estimate.headline.range_l ? estimate.headline.range_l[1] : null,
    metric_type: estimate.headline.metric_type,
    match_level: estimate.match_level,
    confidence: estimate.confidence,
    input_method: meta.inputMethod,
    factors_version: estimate.factors_version,
    estimate_json: JSON.stringify(estimate),
    photo_uri: meta.photoUri ?? null,
    note: meta.note ?? null,
    deleted_at: null,
  };

  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO entries
         (id, created_at, local_day, local_week, tz, item_id, item_label, category,
          quantity_value, quantity_unit, quantity_source, litres, litres_low,
          litres_high, metric_type, match_level, confidence, input_method,
          factors_version, estimate_json, photo_uri, note, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.created_at,
      row.local_day,
      row.local_week,
      row.tz,
      row.item_id,
      row.item_label,
      row.category,
      row.quantity_value,
      row.quantity_unit,
      row.quantity_source,
      row.litres,
      row.litres_low,
      row.litres_high,
      row.metric_type,
      row.match_level,
      row.confidence,
      row.input_method,
      row.factors_version,
      row.estimate_json,
      row.photo_uri,
      row.note,
      row.deleted_at,
    );
    await refreshDailyTotal(tx, row.local_day, createdAt);
  });

  return { ...row, estimate };
}

/**
 * Marks an entry deleted and rebalances its day. The row stays put so undo is
 * a flag flip rather than a re-insert.
 */
export async function softDelete(id: string, at: number = Date.now()): Promise<string | null> {
  const db = await getDb();
  let day: string | null = null;

  await db.withExclusiveTransactionAsync(async (tx) => {
    const found = await tx.getFirstAsync<{ local_day: string }>(
      'SELECT local_day FROM entries WHERE id = ? AND deleted_at IS NULL',
      id,
    );
    if (!found) return;
    day = found.local_day;
    await tx.runAsync('UPDATE entries SET deleted_at = ? WHERE id = ?', at, id);
    await refreshDailyTotal(tx, found.local_day, at);
  });

  return day;
}

/** Puts a soft-deleted entry back, day total included. */
export async function undoDelete(id: string, at: number = Date.now()): Promise<string | null> {
  const db = await getDb();
  let day: string | null = null;

  await db.withExclusiveTransactionAsync(async (tx) => {
    const found = await tx.getFirstAsync<{ local_day: string }>(
      'SELECT local_day FROM entries WHERE id = ? AND deleted_at IS NOT NULL',
      id,
    );
    if (!found) return;
    day = found.local_day;
    await tx.runAsync('UPDATE entries SET deleted_at = NULL WHERE id = ?', id);
    await refreshDailyTotal(tx, found.local_day, at);
  });

  return day;
}

/* --------------------------------------------------------------- read ---- */

function hydrate(row: EntryRow): Entry {
  return { ...row, estimate: JSON.parse(row.estimate_json) as Estimate };
}

/** Live entries for one local day, newest first. */
export async function listByDay(day: string): Promise<Entry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<EntryRow>(
    `SELECT * FROM entries
      WHERE local_day = ? AND deleted_at IS NULL
      ORDER BY created_at DESC`,
    day,
  );
  return rows.map(hydrate);
}

/** The most recent live entries across all days. */
export async function listRecent(limit = 50): Promise<Entry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<EntryRow>(
    'SELECT * FROM entries WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?',
    limit,
  );
  return rows.map(hydrate);
}

export async function getEntry(id: string): Promise<Entry | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<EntryRow>('SELECT * FROM entries WHERE id = ?', id);
  return row ? hydrate(row) : null;
}

function toDailyTotal(day: string, row: DailyTotalRow | null): DailyTotal {
  if (!row) {
    return { localDay: day, totalLitres: 0, entryCount: 0, byCategory: {}, updatedAt: 0 };
  }
  let byCategory: Partial<Record<EntryCategory, number>> = {};
  try {
    byCategory = JSON.parse(row.by_category_json) as Partial<Record<EntryCategory, number>>;
  } catch {
    byCategory = {};
  }
  return {
    localDay: row.local_day,
    totalLitres: row.total_litres,
    entryCount: row.entry_count,
    byCategory,
    updatedAt: row.updated_at,
  };
}

export async function dayTotal(day: string): Promise<DailyTotal> {
  const db = await getDb();
  const row = await db.getFirstAsync<DailyTotalRow>(
    'SELECT * FROM daily_totals WHERE local_day = ?',
    day,
  );
  return toDailyTotal(day, row);
}

/** Today's running total, read straight off the maintained aggregate. */
export async function todayTotal(
  now: Date = new Date(),
  tz: string = deviceTimeZone(),
): Promise<DailyTotal> {
  return dayTotal(localDay(now, tz));
}

/**
 * The last `days` day-totals, oldest first, with quiet days present as zeros so
 * a chart can map straight over the array.
 */
export async function trends(
  days = 7,
  now: Date = new Date(),
  tz: string = deviceTimeZone(),
): Promise<DailyTotal[]> {
  const keys = recentDays(days, now, tz);
  if (keys.length === 0) return [];

  const db = await getDb();
  const placeholders = keys.map(() => '?').join(', ');
  const rows = await db.getAllAsync<DailyTotalRow>(
    `SELECT * FROM daily_totals WHERE local_day IN (${placeholders})`,
    keys,
  );
  const byDay = new Map(rows.map((row) => [row.local_day, row]));
  return keys.map((key) => toDailyTotal(key, byDay.get(key) ?? null));
}

/** Live and soft-deleted counts — the data lab's health readout. */
export async function entryCounts(): Promise<{ live: number; deleted: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ live: number; deleted: number }>(
    `SELECT SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS live,
            SUM(CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END) AS deleted
       FROM entries`,
  );
  return { live: row?.live ?? 0, deleted: row?.deleted ?? 0 };
}
