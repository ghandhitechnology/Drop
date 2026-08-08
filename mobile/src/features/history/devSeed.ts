/**
 * Forty days of plausible history, for looking at the screen.
 *
 * Developer tooling. It goes through exactly the shipping path — the real
 * engine produces each estimate and `insertConfirmed` writes it — so the totals,
 * the chart, and the frozen snapshots on the detail page are the same objects a
 * real confirmation would have produced. Nothing here fabricates a litre.
 *
 * The whole run is seeded, so the same device produces the same forty days
 * every time and a bar can be checked against a hand computation.
 */

import { estimate as runEstimate } from '@drop/water-engine';
import type { QuantitySource, QuantityUnit } from '@drop/water-engine';

import { insertConfirmed } from '../../data/entries';
import { getTables } from '../../data/tables';
import type { InputMethod } from '../../data/types';
import { mulberry32 } from '../../drawing/seededRandom';

/** Fixed root seed. Change it to get a different — but still stable — history. */
export const SEED_ROOT = 0x0d0a17;

/** Days with nothing on them, so the chart has real gaps to fill. */
const QUIET_DAY_CHANCE = 0.1;

const MORNING = [
  'coffee_standard',
  'cow_milk',
  'bread',
  'oat_flakes',
  'eggs',
  'apple',
  'banana',
  'yogurt_white',
  'orange_juice',
];

const MAIN = [
  'rice',
  'pasta',
  'chicken_bone_free_meat',
  'salmon',
  'beef_bone_free_meat',
  'pork_bone_free_meat',
  'tomato',
  'broccoli',
  'potato',
  'cheese',
  'lettuce',
  'carrot',
];

const EXTRA = [
  'beer',
  'wine',
  'chocolate',
  'apple_juice',
  'soy_milk',
  'butter',
  'olive_oil',
  'avocado',
];

const TRAVEL = [
  'transport_bus',
  'transport_petrol_car',
  'transport_diesel_car',
  'transport_bus_intercity',
];

const THINGS = [
  'product_315000',
  'product_325620',
  'product_339930',
  'product_322230',
  'product_335110',
  'product_339940',
];

const INPUT_METHODS: InputMethod[] = ['camera', 'camera', 'camera', 'barcode', 'search'];

type Slot = { pool: string[]; from: number; to: number };

/** When in the day each kind of thing tends to happen. */
const SLOTS: Slot[] = [
  { pool: MORNING, from: 7, to: 9 },
  { pool: MAIN, from: 12, to: 14 },
  { pool: MAIN, from: 18, to: 20 },
  { pool: EXTRA, from: 15, to: 22 },
  { pool: TRAVEL, from: 8, to: 19 },
  { pool: THINGS, from: 11, to: 20 },
];

/** How often each slot actually happens. The two meals nearly always do. */
const SLOT_CHANCE = [0.92, 0.86, 0.7, 0.5, 0.45, 0.1];

function pick<T>(items: T[], roll: number): T {
  return items[Math.min(items.length - 1, Math.floor(roll * items.length))];
}

/** Three significant figures — the precision a person would actually type. */
function tidy(value: number): number {
  if (value <= 0) return value;
  const magnitude = 10 ** (2 - Math.floor(Math.log10(value)));
  return Math.round(value * magnitude) / magnitude;
}

export type SeedResult = { entries: number; days: number };

/**
 * Fill the last `days` local days with entries.
 *
 * Timestamps are built from local calendar fields at civil hours, so the day a
 * row lands on is the day it looks like — including across a daylight-saving
 * change, which only ever moves the middle of the night.
 */
export async function seedHistory(days = 40): Promise<SeedResult> {
  const tables = getTables();
  const today = new Date();
  let written = 0;
  let filled = 0;

  for (let back = days - 1; back >= 0; back -= 1) {
    const next = mulberry32(SEED_ROOT ^ (back * 2654435761));
    if (next() < QUIET_DAY_CHANCE) continue;

    let onThisDay = 0;

    for (let slot = 0; slot < SLOTS.length; slot += 1) {
      if (next() > SLOT_CHANCE[slot]) continue;

      const { pool, from, to } = SLOTS[slot];
      const catalogId = pick(pool, next());
      const entry = tables.catalog.get(catalogId);
      if (!entry) continue;

      // A person who moved the stepper has entered the quantity themselves;
      // one who accepted the serving has not. The engine reads that distinction.
      const adjusted = next() < 0.6;
      const scale = adjusted ? 0.7 + next() * 0.9 : 1;
      const source: QuantitySource = adjusted ? 'user_entered' : 'catalog_default';

      const result = runEstimate(
        {
          catalog_id: catalogId,
          quantity: {
            value: tidy(entry.default_quantity.value * scale),
            unit: entry.default_quantity.unit as QuantityUnit,
            source,
          },
        },
        tables,
      );
      if (!result.headline) continue;

      const hour = from + Math.floor(next() * (to - from + 1));
      const minute = Math.floor(next() * 60);
      const at = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - back,
        // Today never gets an entry from later than right now.
        back === 0 ? Math.min(hour, today.getHours()) : hour,
        minute,
      );

      await insertConfirmed(result, {
        inputMethod: pick(INPUT_METHODS, next()),
        createdAt: at.getTime(),
      });

      written += 1;
      onThisDay += 1;
    }

    if (onThisDay > 0) filled += 1;
  }

  return { entries: written, days: filled };
}
