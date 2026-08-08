/**
 * The write path, end to end: the real engine produces an estimate, the real
 * repository writes it, and the real SQL keeps `daily_totals` in step.
 *
 * `expo-sqlite` is aliased to Node's SQLite in vitest.config.ts, so everything
 * below runs the code that ships.
 */
import { estimate } from '@drop/water-engine';
import type { Estimate, QuantityUnit } from '@drop/water-engine';
import { beforeEach, describe, expect, it } from 'vitest';

import { seedCatalogItems } from '../catalog';
import { clearAllData, getDb, journalMode, kvGet, kvSet, schemaVersion } from '../db';
import {
  dayTotal,
  entryCounts,
  getEntry,
  insertConfirmed,
  listByDay,
  listRecent,
  newEntryId,
  softDelete,
  thisWeekTotal,
  todayTotal,
  trends,
  undoDelete,
  weekLeaders,
  weekTotals,
} from '../entries';
import { getTables } from '../tables';

const TZ = 'Asia/Seoul';
const tables = getTables();

function sample(id: string, value: number, unit: QuantityUnit): Estimate {
  return estimate(
    { catalog_id: id, quantity: { value, unit, source: 'catalog_default' } },
    tables,
  );
}

const APPLE = () => sample('apple', 0.15, 'kg');
const COFFEE = () => sample('coffee_standard', 0.125, 'l');
const BUS = () => sample('transport_bus', 10, 'km');

/** 2026-08-08 09:00 in Seoul. */
const MORNING = Date.parse('2026-08-08T00:00:00Z');
const DAY = '2026-08-08';

beforeEach(async () => {
  await clearAllData();
});

describe('schema', () => {
  it('opens in WAL at the current schema version', async () => {
    expect(await journalMode()).toBe('wal');
    expect(await schemaVersion()).toBe(1);
  });

  it('indexes local_day and created_at on entries', async () => {
    const db = await getDb();
    const indexes = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entries'",
    );
    const names = indexes.map((row) => row.name);
    expect(names).toContain('idx_entries_local_day');
    expect(names).toContain('idx_entries_created_at');
  });

  it('creates every table the app relies on', async () => {
    const db = await getDb();
    const tableRows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    expect(tableRows.map((row) => row.name)).toEqual([
      'catalog_items',
      'daily_totals',
      'entries',
      'factors_cache',
      'kv',
    ]);
  });

  it('round-trips kv values', async () => {
    await kvSet('greeting', 'hello');
    expect(await kvGet('greeting')).toBe('hello');
    await kvSet('greeting', 'again');
    expect(await kvGet('greeting')).toBe('again');
    expect(await kvGet('absent')).toBeNull();
  });
});

describe('insertConfirmed', () => {
  it('stamps the local day, week, and zone from the write moment', async () => {
    const entry = await insertConfirmed(APPLE(), {
      inputMethod: 'sample',
      createdAt: MORNING,
      timeZone: TZ,
    });
    expect(entry.local_day).toBe(DAY);
    expect(entry.local_week).toBe('2026-W32');
    expect(entry.tz).toBe(TZ);
  });

  it('copies the engine figures onto the row', async () => {
    const value = APPLE();
    const entry = await insertConfirmed(value, {
      inputMethod: 'search',
      createdAt: MORNING,
      timeZone: TZ,
    });
    expect(entry.litres).toBe(value.headline!.value_l);
    expect(entry.litres_low).toBe(value.headline!.range_l![0]);
    expect(entry.litres_high).toBe(value.headline!.range_l![1]);
    expect(entry.metric_type).toBe('total_water_footprint');
    expect(entry.match_level).toBe(value.match_level);
    expect(entry.confidence).toBe(value.confidence);
    expect(entry.item_label).toBe('Apple');
    expect(entry.category).toBe('food');
    expect(entry.input_method).toBe('search');
    expect(entry.factors_version).toBe(value.factors_version);
  });

  it('freezes the estimate so a later factors release leaves it alone', async () => {
    const value = APPLE();
    const entry = await insertConfirmed(value, {
      inputMethod: 'sample',
      createdAt: MORNING,
      timeZone: TZ,
    });
    const stored = await getEntry(entry.id);
    expect(stored?.estimate).toEqual(value);
    expect(JSON.parse(stored!.estimate_json)).toEqual(value);
    expect(stored?.estimate.factor?.factor_id).toBe(value.factor?.factor_id);
  });

  it('keeps a headline-free estimate out of history', async () => {
    const unsupported: Estimate = { ...APPLE(), headline: null };
    await expect(
      insertConfirmed(unsupported, { inputMethod: 'sample' }),
    ).rejects.toThrow(/headline/);
    expect((await entryCounts()).live).toBe(0);
  });

  it('records the photo and note when they are supplied', async () => {
    const entry = await insertConfirmed(APPLE(), {
      inputMethod: 'camera',
      photoUri: 'file:///photo.jpg',
      note: 'One piece of fruit',
      createdAt: MORNING,
      timeZone: TZ,
    });
    expect(entry.photo_uri).toBe('file:///photo.jpg');
    expect(entry.note).toBe('One piece of fruit');
  });

  it('rejects a duplicate id rather than overwriting history', async () => {
    const meta = { inputMethod: 'sample' as const, id: 'fixed-id', timeZone: TZ };
    await insertConfirmed(APPLE(), meta);
    await expect(insertConfirmed(COFFEE(), meta)).rejects.toThrow();
    // The failed write leaves the day exactly as it was.
    const total = await dayTotal((await listRecent())[0]!.local_day);
    expect(total.entryCount).toBe(1);
  });
});

describe('daily_totals', () => {
  it('is maintained by the insert itself', async () => {
    const apple = APPLE();
    const coffee = COFFEE();
    await insertConfirmed(apple, { inputMethod: 'sample', createdAt: MORNING, timeZone: TZ });
    await insertConfirmed(coffee, {
      inputMethod: 'sample',
      createdAt: MORNING + 1000,
      timeZone: TZ,
    });

    const total = await dayTotal(DAY);
    expect(total.entryCount).toBe(2);
    expect(total.totalLitres).toBeCloseTo(
      apple.headline!.value_l + coffee.headline!.value_l,
      6,
    );
    expect(total.byCategory.food).toBeCloseTo(apple.headline!.value_l, 6);
    expect(total.byCategory.drink).toBeCloseTo(coffee.headline!.value_l, 6);
  });

  it('splits by category across all three kinds of entry', async () => {
    for (const [value, offset] of [
      [APPLE(), 0],
      [COFFEE(), 1000],
      [BUS(), 2000],
    ] as const) {
      await insertConfirmed(value, {
        inputMethod: 'sample',
        createdAt: MORNING + offset,
        timeZone: TZ,
      });
    }
    const total = await dayTotal(DAY);
    expect(Object.keys(total.byCategory).sort()).toEqual(['drink', 'food', 'transport']);
    expect(total.entryCount).toBe(3);
  });

  it('keeps separate days separate', async () => {
    await insertConfirmed(APPLE(), {
      inputMethod: 'sample',
      createdAt: MORNING,
      timeZone: TZ,
    });
    await insertConfirmed(COFFEE(), {
      inputMethod: 'sample',
      createdAt: MORNING + 86_400_000,
      timeZone: TZ,
    });
    expect((await dayTotal(DAY)).entryCount).toBe(1);
    expect((await dayTotal('2026-08-09')).entryCount).toBe(1);
  });

  it('agrees with a fresh recomputation after a mix of writes and removals', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const entry = await insertConfirmed(i % 2 === 0 ? APPLE() : COFFEE(), {
        inputMethod: 'sample',
        createdAt: MORNING + i * 1000,
        timeZone: TZ,
      });
      ids.push(entry.id);
    }
    await softDelete(ids[1]!);
    await softDelete(ids[4]!);
    await undoDelete(ids[1]!);

    const db = await getDb();
    const fresh = await db.getFirstAsync<{ total: number; n: number }>(
      `SELECT SUM(litres) AS total, COUNT(*) AS n
         FROM entries WHERE local_day = ? AND deleted_at IS NULL`,
      DAY,
    );
    const stored = await dayTotal(DAY);
    expect(stored.totalLitres).toBeCloseTo(fresh!.total, 9);
    expect(stored.entryCount).toBe(fresh!.n);
    expect(stored.entryCount).toBe(5);
  });
});

describe('softDelete and undoDelete', () => {
  it('takes the entry out of the day and puts it back', async () => {
    const apple = await insertConfirmed(APPLE(), {
      inputMethod: 'sample',
      createdAt: MORNING,
      timeZone: TZ,
    });
    const before = await dayTotal(DAY);

    expect(await softDelete(apple.id)).toBe(DAY);
    const removed = await dayTotal(DAY);
    expect(removed.entryCount).toBe(0);
    expect(removed.totalLitres).toBe(0);
    expect(await listByDay(DAY)).toHaveLength(0);

    expect(await undoDelete(apple.id)).toBe(DAY);
    const restored = await dayTotal(DAY);
    expect(restored.entryCount).toBe(before.entryCount);
    expect(restored.totalLitres).toBeCloseTo(before.totalLitres, 9);
    expect(await listByDay(DAY)).toHaveLength(1);
  });

  it('keeps the row and its snapshot while it is removed', async () => {
    const apple = await insertConfirmed(APPLE(), {
      inputMethod: 'sample',
      createdAt: MORNING,
      timeZone: TZ,
    });
    await softDelete(apple.id, MORNING + 5000);
    const stored = await getEntry(apple.id);
    expect(stored?.deleted_at).toBe(MORNING + 5000);
    expect(stored?.estimate.headline?.value_l).toBe(apple.litres);
    expect(await entryCounts()).toEqual({ live: 0, deleted: 1 });
  });

  it('is idempotent', async () => {
    const apple = await insertConfirmed(APPLE(), {
      inputMethod: 'sample',
      createdAt: MORNING,
      timeZone: TZ,
    });
    expect(await softDelete(apple.id)).toBe(DAY);
    expect(await softDelete(apple.id)).toBeNull();
    expect(await undoDelete(apple.id)).toBe(DAY);
    expect(await undoDelete(apple.id)).toBeNull();
    expect((await dayTotal(DAY)).entryCount).toBe(1);
  });

  it('reports nothing for an unknown id', async () => {
    expect(await softDelete('e_missing')).toBeNull();
    expect(await undoDelete('e_missing')).toBeNull();
  });

  it('drops the daily_totals row once a day is emptied', async () => {
    const apple = await insertConfirmed(APPLE(), {
      inputMethod: 'sample',
      createdAt: MORNING,
      timeZone: TZ,
    });
    await softDelete(apple.id);
    const db = await getDb();
    const row = await db.getFirstAsync('SELECT * FROM daily_totals WHERE local_day = ?', DAY);
    expect(row).toBeNull();
    expect((await dayTotal(DAY)).totalLitres).toBe(0);
  });
});

describe('reads', () => {
  it('lists a day newest first and hides removed entries', async () => {
    const first = await insertConfirmed(APPLE(), {
      inputMethod: 'sample',
      createdAt: MORNING,
      timeZone: TZ,
    });
    const second = await insertConfirmed(COFFEE(), {
      inputMethod: 'sample',
      createdAt: MORNING + 1000,
      timeZone: TZ,
    });
    expect((await listByDay(DAY)).map((e) => e.id)).toEqual([second.id, first.id]);
    await softDelete(second.id);
    expect((await listByDay(DAY)).map((e) => e.id)).toEqual([first.id]);
  });

  it('caps listRecent at the requested limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      await insertConfirmed(APPLE(), {
        inputMethod: 'sample',
        createdAt: MORNING + i * 1000,
        timeZone: TZ,
      });
    }
    expect(await listRecent(3)).toHaveLength(3);
  });

  it('reads today from the maintained aggregate', async () => {
    const apple = APPLE();
    await insertConfirmed(apple, { inputMethod: 'sample', createdAt: MORNING, timeZone: TZ });
    const total = await todayTotal(new Date(MORNING), TZ);
    expect(total.localDay).toBe(DAY);
    expect(total.totalLitres).toBeCloseTo(apple.headline!.value_l, 9);
  });

  it('returns a zeroed total for a day with nothing in it', async () => {
    expect(await dayTotal('2020-01-01')).toEqual({
      localDay: '2020-01-01',
      totalLitres: 0,
      entryCount: 0,
      byCategory: {},
      updatedAt: 0,
    });
  });
});

describe('trends', () => {
  it('returns one point per day, oldest first, with quiet days at zero', async () => {
    await insertConfirmed(APPLE(), {
      inputMethod: 'sample',
      createdAt: MORNING,
      timeZone: TZ,
    });
    await insertConfirmed(COFFEE(), {
      inputMethod: 'sample',
      createdAt: MORNING - 2 * 86_400_000,
      timeZone: TZ,
    });

    const series = await trends(7, new Date(MORNING), TZ);
    expect(series).toHaveLength(7);
    expect(series.map((d) => d.localDay)).toEqual([
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
    ]);
    expect(series[4]!.totalLitres).toBeGreaterThan(0); // 08-06
    expect(series[6]!.totalLitres).toBeGreaterThan(0); // 08-08
    expect(series[5]!.totalLitres).toBe(0); // 08-07
  });

  it('leaves days outside the window out', async () => {
    await insertConfirmed(APPLE(), {
      inputMethod: 'sample',
      createdAt: MORNING - 30 * 86_400_000,
      timeZone: TZ,
    });
    const series = await trends(7, new Date(MORNING), TZ);
    expect(series.every((d) => d.totalLitres === 0)).toBe(true);
  });
});

describe('week reads', () => {
  // MORNING is 2026-08-08 09:00 in Seoul — a Saturday, in 2026-W32.
  const THIS_WEEK = '2026-W32';

  it('sums a week off the key the rows were stamped with', async () => {
    await insertConfirmed(APPLE(), {
      inputMethod: 'sample',
      createdAt: MORNING,
      timeZone: TZ,
    });
    // Two days earlier — a Thursday, so the same week.
    await insertConfirmed(COFFEE(), {
      inputMethod: 'sample',
      createdAt: MORNING - 2 * 86_400_000,
      timeZone: TZ,
    });

    const week = await thisWeekTotal(new Date(MORNING), TZ);
    const [apple, coffee] = [await dayTotal('2026-08-08'), await dayTotal('2026-08-06')];

    expect(week.localWeek).toBe(THIS_WEEK);
    expect(week.entryCount).toBe(2);
    expect(week.totalLitres).toBeCloseTo(apple.totalLitres + coffee.totalLitres, 6);
  });

  it('keeps last week out of this one', async () => {
    await insertConfirmed(APPLE(), {
      inputMethod: 'sample',
      createdAt: MORNING - 7 * 86_400_000,
      timeZone: TZ,
    });

    const [previous, current] = await weekTotals(2, new Date(MORNING), TZ);
    expect(previous!.localWeek).toBe('2026-W31');
    expect(previous!.entryCount).toBe(1);
    expect(current!.localWeek).toBe(THIS_WEEK);
    expect(current!.entryCount).toBe(0);
  });

  it('returns quiet weeks as zeros so a window maps straight over', async () => {
    const window = await weekTotals(4, new Date(MORNING), TZ);
    expect(window).toHaveLength(4);
    expect(window.every((week) => week.totalLitres === 0 && week.entryCount === 0)).toBe(true);
    expect(window.at(-1)!.localWeek).toBe(THIS_WEEK);
  });

  it('leaves a removed entry out of its week', async () => {
    const entry = await insertConfirmed(APPLE(), {
      inputMethod: 'sample',
      createdAt: MORNING,
      timeZone: TZ,
    });
    await softDelete(entry.id);

    expect((await thisWeekTotal(new Date(MORNING), TZ)).totalLitres).toBe(0);
  });

  it('groups the week leaders by item rather than by row', async () => {
    for (const offset of [0, 1000, 2000]) {
      await insertConfirmed(COFFEE(), {
        inputMethod: 'sample',
        createdAt: MORNING + offset,
        timeZone: TZ,
      });
    }
    await insertConfirmed(APPLE(), {
      inputMethod: 'sample',
      createdAt: MORNING,
      timeZone: TZ,
    });

    const leaders = await weekLeaders(THIS_WEEK);
    const coffee = leaders.find((leader) => leader.itemId === 'coffee_standard');

    expect(coffee?.times).toBe(3);
    // Heaviest first, and three coffees outweigh one apple.
    expect(leaders[0]!.itemId).toBe('coffee_standard');
    expect(leaders[0]!.litres).toBeGreaterThan(leaders[1]!.litres);
  });
});

describe('newEntryId', () => {
  it('produces unique ids under a tight loop', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5000; i += 1) ids.add(newEntryId(MORNING));
    expect(ids.size).toBe(5000);
  });
});

describe('catalog seeding', () => {
  it('fills catalog_items from the bundled tables and remembers the version', async () => {
    const count = await seedCatalogItems();
    expect(count).toBe(1000);
    expect(await kvGet('catalog_items.seeded_version')).toBe('2026.08.2');
  });

  it('skips the rebuild when the version and the row count both match', async () => {
    await seedCatalogItems();
    const db = await getDb();
    await db.runAsync('UPDATE catalog_items SET label = ? WHERE id = ?', 'Sentinel', 'apple');
    await seedCatalogItems();
    const row = await db.getFirstAsync<{ label: string }>(
      'SELECT label FROM catalog_items WHERE id = ?',
      'apple',
    );
    expect(row?.label).toBe('Sentinel');
  });

  it('rebuilds when the row count drifts, and on demand', async () => {
    await seedCatalogItems();
    const db = await getDb();
    await db.runAsync('DELETE FROM catalog_items WHERE id = ?', 'apple');
    expect(await seedCatalogItems()).toBe(1000);
    expect(
      await db.getFirstAsync('SELECT id FROM catalog_items WHERE id = ?', 'apple'),
    ).toEqual({ id: 'apple' });

    await db.runAsync('UPDATE catalog_items SET label = ? WHERE id = ?', 'Sentinel', 'apple');
    await seedCatalogItems(true);
    const rebuilt = await db.getFirstAsync<{ label: string }>(
      'SELECT label FROM catalog_items WHERE id = ?',
      'apple',
    );
    expect(rebuilt?.label).toBe('Apple');
  });

  it('normalises the search blob at seed time, non-Latin synonyms included', async () => {
    await seedCatalogItems();
    const db = await getDb();
    const row = await db.getFirstAsync<{ search_blob: string; sort_rank: number }>(
      'SELECT search_blob, sort_rank FROM catalog_items WHERE id = ?',
      'apple',
    );
    expect(row?.search_blob).toBe('apple 사과');
    expect(row?.sort_rank).toBe(5); // food (0) * 1000 + len('Apple')
  });
});
