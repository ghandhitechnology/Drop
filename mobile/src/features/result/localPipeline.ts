/* eslint-disable no-console */
/**
 * The pipeline, running on the device.
 *
 * This is the Wire phase of the seam in `capture/pipeline.ts`: the machine
 * still only ever calls `getPipeline()`, and this installs a run that produces
 * **real engine output** — `estimate()` against the factor tables bundled with
 * the app. No network, no service, nothing to mock at the edges of the screen:
 * every number the result card shows comes from the same code path that will
 * serve a live recognition result.
 *
 * The one stand-in left is which item the photo *is*. Vision lands later; until
 * then a capture walks a short reel of catalogue entries chosen to exercise
 * every shape the card has to draw — a wide range, a tight one, a proxy
 * metric, a long assumption list, and an item whose figure arrives in a future
 * release. A barcode picks its entry by code instead of by turn, so scanning
 * the same tin twice always lands on the same item.
 */

import {
  estimate as runEstimate,
  type Estimate as EngineEstimate,
} from '@drop/water-engine';

import { getDb } from '../../data/db';
import { getTables } from '../../data/tables';
import { FAKE_TIMINGS, setPipeline, type Pipeline } from '../capture/pipeline';
import type { Estimate, RecognizedItem } from '../capture/types';

/**
 * The reel a capture walks, in order.
 *
 * Chosen for coverage rather than realism: banana carries a wide range and a
 * secondary metric, apple juice a range tight enough that the point value
 * leads, bus a long transport assumption list on a consumption metric, and the
 * electric car has its figure still on the way.
 */
export const RECOGNITION_REEL = [
  'banana',
  'apple_juice',
  'coffee_standard',
  'avocado',
  'transport_bus',
  'transport_ev_car',
] as const;

let turn = 0;

/** Reset the reel — used by the dev tooling to replay a specific beat. */
export function resetReel(to = 0): void {
  turn = to;
}

/** FNV-1a over the code, so one product always resolves the same way. */
function pickByCode(gtin14: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < gtin14.length; i += 1) {
    hash ^= gtin14.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return RECOGNITION_REEL[(hash >>> 0) % RECOGNITION_REEL.length];
}

/* --------------------------------------------------------------- engine */

export type LocalEstimateInput = {
  catalogId: string;
  /** Amount in the catalogue's own unit. Defaults to one serving. */
  quantity?: number;
  /** Set once a person has moved the stepper. */
  userEntered?: boolean;
};

/** One serving of an item, as the catalogue defines it. */
export function servingOf(catalogId: string): { value: number; unit: string; basis: string } | null {
  const entry = getTables().catalog.get(catalogId);
  return entry ? entry.default_quantity : null;
}

/**
 * Run the engine locally.
 *
 * The engine's `Estimate` and the capture feature's mirror of it are the same
 * shape; the cast is the seam between a workspace package and the mobile
 * mirror, and it goes away when the two share one type.
 */
export function localEstimate({
  catalogId,
  quantity,
  userEntered,
}: LocalEstimateInput): Estimate | null {
  const tables = getTables();
  const entry = tables.catalog.get(catalogId);
  if (!entry) return null;

  const serving = entry.default_quantity;
  const result = runEstimate(
    {
      catalog_id: catalogId,
      quantity: {
        value: quantity ?? serving.value,
        unit: serving.unit as 'kg',
        source: userEntered ? 'user_entered' : 'catalog_default',
      },
    },
    tables,
  );

  return result as unknown as Estimate;
}

/**
 * The other side of the same seam: hand a captured estimate back to code that
 * speaks the engine's own type, such as the entries repository.
 */
export function toEngineEstimate(value: Estimate): EngineEstimate {
  return value as unknown as EngineEstimate;
}

/* ------------------------------------------------------------- pipeline */

/**
 * Recognition timings are the ones the fake seam established, so the beats
 * keep the rhythm the rest of the screen was tuned against. The engine call
 * itself is synchronous and lands in well under a millisecond once the tables
 * are built.
 */
export const localPipeline: Pipeline = (input, handlers) => {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cancelled = false;

  const at = (ms: number, run: () => void) => {
    timers.push(
      setTimeout(() => {
        if (!cancelled) run();
      }, ms),
    );
  };

  const catalogId = input.barcode
    ? pickByCode(input.barcode.gtin14)
    : RECOGNITION_REEL[turn % RECOGNITION_REEL.length];
  if (!input.barcode) turn += 1;

  console.log('[result/pipeline] local run', {
    catalogId,
    barcode: input.barcode?.gtin14,
  });

  let elapsed = FAKE_TIMINGS.recognizing;
  at(elapsed, handlers.onRecognizing);

  elapsed += FAKE_TIMINGS.analyzing;
  at(elapsed, () => {
    const entry = getTables().catalog.get(catalogId);
    if (!entry) {
      handlers.onUnresolved();
      return;
    }
    const item: RecognizedItem = {
      catalog_id: catalogId,
      display_name: entry.display_name,
      ...(input.barcode ? { gtin14: input.barcode.gtin14 } : {}),
    };
    handlers.onAnalyzing(item);
  });

  elapsed += FAKE_TIMINGS.presenting;
  at(elapsed, () => {
    const result = localEstimate({ catalogId });
    if (result) handlers.onPresenting(result);
    else handlers.onUnresolved();
  });

  return {
    cancel: () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      timers.length = 0;
    },
  };
};

/**
 * Install the local pipeline, once, at boot.
 *
 * Two warmups ride along on a later tick, so neither lands inside a beat:
 * building the seven factor tables takes about a second on a cold start, and
 * opening the database runs the WAL pragmas and the migrations. Left lazy,
 * that second one lands on the first confirmation — measured at three and a
 * half seconds between the press and the tick, which is far too long for the
 * moment a person hands something to their own record.
 */
let installed = false;

export function installLocalPipeline(): void {
  if (installed) return;
  installed = true;
  setPipeline(localPipeline);

  setTimeout(() => {
    try {
      getTables();
    } catch (error) {
      console.log('[result/pipeline] table warmup', error);
    }
    getDb().catch((error) => console.log('[result/pipeline] database warmup', error));
  }, 0);
}
