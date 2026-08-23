/**
 * ============================== THE SEAM ==============================
 * The recognition + analysis pipeline, as a single injectable function.
 *
 * `useCaptureMachine` only ever calls `getPipeline()`, so the machine, the
 * camera and every screen are identical whichever run is bound. Two live here:
 *
 *   `fakePipeline` — timings on a setTimeout chain and one hard-coded
 *     Estimate. Kept for driving the screens with no service and no camera.
 *   `realPipeline` — the shipped run. Bound once at boot by
 *     `installRealPipeline()` from `app/index.tsx`. See its own block below.
 *
 * The contract a real pipeline must honour:
 *   - report `recognizing` as soon as the photo is on its way,
 *   - report `analyzing` the moment an item id exists, with a display name
 *     good enough to put on screen,
 *   - end in exactly one of `presenting` or `unresolved`,
 *   - stop emitting after `cancel()` returns.
 * ==================================================================
 */

import {
  ApiError,
  MULTI_CANDIDATE_SCORE,
  barcode as lookupBarcode,
  encodePhoto,
  recognize as recognizePhoto,
  type RecognizeCandidate,
  type RecognizeItem,
} from '../../data/api';
import { hydrateCatalog } from '../../data/catalogStore';
import { getDb } from '../../data/db';
import { FACTORS_VERSION, getTables } from '../../data/tables';
import { copy } from '../../lib/copy';
import { createAnalysisId, releaseAnalysis, reserveAnalysis, type UsageSnapshot } from '../usage';
import { clearCandidates, offerCandidates } from '../search/candidates';
import { estimateFor, type PickedQuantity } from '../search/estimate';
import { takeSearchPicks, type SearchPick } from '../search/pick';
import { BARCODE_TIMEOUT_MS, HARD_CEILING_MS } from './pace';
import type { BarcodeHint, CaptureMode, Estimate, PlateItem, RecognizedItem } from './types';

export type PipelineInput = {
  photoUri: string;
  mode: CaptureMode;
  /** Present when a barcode was in frame at the moment of capture. */
  barcode?: BarcodeHint;
};

export type PipelineHandlers = {
  onRecognizing: () => void;
  onAnalyzing: (item: RecognizedItem) => void;
  onPresenting: (estimate: Estimate) => void;
  /**
   * Two or more things in one frame. The list is ordered as they read off the
   * photo and every entry is a card, including ones the catalogue has no word
   * for — those arrive with no headline and draw as "arriving later".
   */
  onPresentingMany: (items: PlateItem[]) => void;
  /** The photo is held and the person is invited to find it by name. */
  onUnresolved: () => void;
  /** The server-authoritative daily allowance has been used. */
  onLimited: (usage: UsageSnapshot) => void;
};

export type PipelineRun = { cancel: () => void };

export type Pipeline = (input: PipelineInput, handlers: PipelineHandlers) => PipelineRun;

/* --------------------------------------------------------- fake payload */

/**
 * A real engine output, captured from
 * `estimate({ catalog_id: 'banana', quantity: { value: 0.12, unit: 'kg' } })`
 * against factor tables 2026.08.2. Kept verbatim so the placeholder UI is
 * exercised by the same shape the wired pipeline will deliver — range,
 * medium confidence, a fallback reason, and a proxy secondary metric.
 */
export const SAMPLE_ESTIMATE: Estimate = {
  catalog_id: 'banana',
  display_name: 'Banana',
  category: 'food',
  factors_version: '2026.08.2',
  quantity: { value: 0.12, unit: 'kg', source: 'catalog_default' },
  headline: {
    value_l: 89.76,
    range_l: [57.54, 204.24],
    metric_type: 'total_water_footprint',
    proxy_metric: false,
  },
  factor: {
    factor_id: 'sel:typ:crops__fruit',
    dataset: 'su_eatable_life',
    dataset_release:
      'SuEatableLife_Food_Footprint_database.xlsx (Petersson et al. 2021, Sci Data, doi:10.1038/s41597-021-00909-8)',
    geography: 'GLO',
    system_boundary: 'cradle-to-distribution-centre',
    functional_unit: 'kg',
    metric_type: 'total_water_footprint',
    rights: 'CC BY 4.0',
  },
  match_level: 'typology',
  confidence: 'medium',
  fallback_reason: 'high_item_uncertainty_typology',
  assumptions: [
    'Value uses the FRUIT group median (the dataset marks the single-item figure as high-uncertainty).',
  ],
  secondary: [
    {
      metric_type: 'freshwater_withdrawal',
      label: 'Freshwater withdrawal · global',
      value_l: 11.72,
      geography: 'GLO',
      proxy_metric: false,
      factor: {
        factor_id: 'hestia:fw:bananaFruit-world-2010-2025-20250501',
        dataset: 'hestia',
        dataset_release: 'v1.0 (2025-05-01)',
        valid_from: '2010',
        valid_until: '2025',
        geography: 'GLO',
        system_boundary: 'cradle-to-farm-gate (HESTIA aggregated)',
        functional_unit: 'kg',
        metric_type: 'freshwater_withdrawal',
        rights: 'HESTIA open data (hestia.earth)',
      },
    },
  ],
  unsupported: null,
};

const SAMPLE_ITEM: RecognizedItem = {
  catalog_id: SAMPLE_ESTIMATE.catalog_id,
  display_name: SAMPLE_ESTIMATE.display_name,
};

/** Stand-in latencies, chosen to feel like the real thing rather than instant. */
export const FAKE_TIMINGS = {
  recognizing: 220,
  analyzing: 760,
  presenting: 620,
} as const;

/* ------------------------------------------------------------ fake impl */

export const fakePipeline: Pipeline = (input, handlers) => {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cancelled = false;

  const at = (ms: number, run: () => void) => {
    timers.push(
      setTimeout(() => {
        if (!cancelled) run();
      }, ms),
    );
  };

  console.log('[capture/pipeline] fake run', {
    photoUri: input.photoUri,
    barcode: input.barcode?.gtin14,
  });

  let elapsed = FAKE_TIMINGS.recognizing;
  at(elapsed, handlers.onRecognizing);

  elapsed += FAKE_TIMINGS.analyzing;
  at(elapsed, () => {
    handlers.onAnalyzing(
      input.barcode ? { ...SAMPLE_ITEM, gtin14: input.barcode.gtin14 } : SAMPLE_ITEM,
    );
  });

  elapsed += input.mode === 'fast' ? 0 : FAKE_TIMINGS.presenting;
  at(elapsed, () => handlers.onPresenting(SAMPLE_ESTIMATE));

  return {
    cancel: () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      timers.length = 0;
    },
  };
};

/* ------------------------------------------------------------ real impl */

/**
 * ============================ THE WIRED RUN ============================
 *
 * The service names things. The device does the arithmetic. Every litre on
 * screen comes from `@drop/water-engine` running against the factor tables in
 * the bundle, whether the answer arrived over the network or out of the
 * catalogue sheet — which is why an estimate is byte-identical with the radio
 * on and off.
 *
 * The run, in order:
 *
 *   1. A pick staged by the search sheet short-circuits everything. No photo
 *      was taken, so there is nothing to read: the sequence goes straight to
 *      the name and then the number.
 *   2. A barcode in frame is authoritative. Normal mode looks it up before
 *      reading the photo; fast mode starts both together but still lets a valid
 *      code win. A `coverage_miss` falls through to vision already in flight.
 *   3. The photo's top candidate becomes the name; its amount, the quantity.
 *      A shortlist under `MULTI_CANDIDATE_SCORE` is offered on the
 *      card so the choice stays with the person.
 *   4. Anything that goes wrong at any step — radio off, service asleep, a
 *      frame that will not read, a photo of a room the catalogue has no word
 *      for — lands in the same place: the frame stays held and finding it by
 *      name is offered. There is no state where a spinner outlives the moment.
 *
 * A hard ceiling sits over the whole thing. Whatever is in flight when it
 * fires is abandoned and the frame is held.
 * ======================================================================
 */

/**
 * The service's own budget, kept under the ceiling so a slow answer still
 * leaves room for the engine and the beat that follows it.
 */
const RECOGNIZE_TIMEOUT_MS = 28_000;

/**
 * Timings for the beats the network does not own.
 *
 * `analyzing` is how long the item's name sits on screen before its number
 * arrives in normal mode. Fast mode deliberately removes this presentation
 * beat and continues as soon as the local engine has the recognition.
 */
export const REAL_TIMINGS = { analyzing: 620 } as const;

/** The two clock operations the run owns, injectable so tests never wait on wall time. */
export type PipelineClock = {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (timer: unknown) => void;
};

export type RealPipelineDependencies = {
  clock: PipelineClock;
  lookupBarcode: typeof lookupBarcode;
  encodePhoto: typeof encodePhoto;
  recognizePhoto: typeof recognizePhoto;
  getTables: typeof getTables;
  createAnalysisId: typeof createAnalysisId;
  reserveAnalysis: typeof reserveAnalysis;
  releaseAnalysis: typeof releaseAnalysis;
  clearCandidates: typeof clearCandidates;
  offerCandidates: typeof offerCandidates;
  estimateFor: typeof estimateFor;
  takeSearchPicks: typeof takeSearchPicks;
};

const systemClock: PipelineClock = {
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

const realDependencies: RealPipelineDependencies = {
  clock: systemClock,
  lookupBarcode,
  encodePhoto,
  recognizePhoto,
  getTables,
  createAnalysisId,
  reserveAnalysis,
  releaseAnalysis,
  clearCandidates,
  offerCandidates,
  estimateFor,
  takeSearchPicks,
};

const delay = (clock: PipelineClock, ms: number) =>
  new Promise<void>((resolve) => clock.setTimeout(resolve, ms));

type Resolution = {
  catalogId: string;
  displayName: string;
  quantity: PickedQuantity | null;
  gtin14?: string;
  /** The shortlist to offer, when recognition was offering rather than saying. */
  shortlist: RecognizeCandidate[];
  source: 'search' | 'barcode' | 'photo';
  /** True when a thumb moved the amount off the catalogue's own serving. */
  userEntered?: boolean;
};

/** A retail code identified it, so the amount is a label reading. */
function fromBarcode(
  catalogId: string,
  displayName: string,
  quantity: PickedQuantity | null,
  gtin14: string,
): Resolution {
  return {
    catalogId,
    displayName,
    quantity,
    gtin14,
    shortlist: [],
    source: 'barcode',
  };
}

/**
 * What identification decided: one thing, or a plate of them.
 *
 * The single arm carries today's resolution unchanged; the many arm carries
 * the wire items so each can run the engine for itself; the picked arm is a
 * plate the catalogue sheet assembled by hand, already priced.
 */
type Identified =
  | { kind: 'single'; resolution: Resolution }
  | { kind: 'many'; items: RecognizeItem[] }
  | { kind: 'picked'; plate: PlateItem[] };

/** A pile taller than this reads as clutter, whatever the model saw. */
export const MAX_PLATE_ITEMS = 6;

function runRealPipeline(
  input: PipelineInput,
  handlers: PipelineHandlers,
  dependencies: RealPipelineDependencies,
): PipelineRun {
  let settled = false;
  let cancelled = false;
  const controller = new AbortController();
  let analysisId: string | null = null;
  let reservationPending = false;

  const releasePending = () => {
    if (!analysisId || !reservationPending) return;
    reservationPending = false;
    dependencies.releaseAnalysis(analysisId).catch(() => {});
  };

  /** Exactly one ending, whoever gets there first. */
  const finish = (emit: () => void) => {
    if (settled || cancelled) return;
    settled = true;
    emit();
  };

  const ceiling = dependencies.clock.setTimeout(() => {
    controller.abort();
    finish(handlers.onUnresolved);
  }, HARD_CEILING_MS);

  const alive = () => !cancelled && !settled;

  const holdAnalysisBeat = async () => {
    if (input.mode !== 'fast') await delay(dependencies.clock, REAL_TIMINGS.analyzing);
    return alive();
  };

  /* ------------------------------------------------------ identification */

  async function identify(): Promise<Identified | null> {
    const tables = dependencies.getTables();

    // 1 — the catalogue sheet already decided.
    const picks = dependencies.takeSearchPicks();
    if (picks.length > 1) {
      const plate = picks
        .slice(0, MAX_PLATE_ITEMS)
        .map(pickToPlateItem)
        .filter((entry): entry is PlateItem => entry !== null);
      if (plate.length > 1) return { kind: 'picked', plate };
    }
    const pick = picks[0];
    if (pick) {
      return {
        kind: 'single',
        resolution: {
          catalogId: pick.catalogId,
          displayName: pick.displayName,
          quantity: pick.quantity,
          shortlist: [],
          source: 'search',
          userEntered: pick.userEntered,
        },
      };
    }

    analysisId = dependencies.createAnalysisId();
    await dependencies.reserveAnalysis(analysisId, {
      signal: controller.signal,
    });
    reservationPending = true;

    /**
     * A net weight read off the packet, kept even when the code itself
     * resolved to nothing. "330 ml" is printed on the tin whatever the
     * catalogue decides the tin contains, and it beats any amount a model
     * estimates from a photograph of it.
     */
    let labelQuantity: PickedQuantity | null = null;

    const visionController = input.mode === 'fast' ? new AbortController() : null;
    if (visionController) {
      controller.signal.addEventListener('abort', () => visionController.abort(), { once: true });
    }

    const readPhoto = async () => {
      const photo = await dependencies.encodePhoto(input.photoUri);
      console.log('[capture/pipeline] photo', photo.bytes, 'bytes');
      return dependencies.recognizePhoto(photo.base64, {
        mime: photo.mime,
        timeoutMs: RECOGNIZE_TIMEOUT_MS,
        signal: visionController?.signal ?? controller.signal,
        mode: input.mode,
        analysisId: analysisId!,
        ...(input.barcode ? { hint: `retail code ${input.barcode.value}` } : {}),
      });
    };

    // Fast mode starts vision immediately. The settled wrapper prevents a
    // quick vision failure becoming an unhandled rejection while barcode —
    // which always has precedence — is still in flight.
    const parallelVision =
      input.mode === 'fast'
        ? readPhoto().then(
            (seen) => ({ ok: true as const, seen }),
            (error: unknown) => ({ ok: false as const, error }),
          )
        : null;

    // 2 — a code in frame. In fast mode the photo is already being read.
    if (input.barcode) {
      try {
        const hit = await dependencies.lookupBarcode(input.barcode.value, {
          timeoutMs: BARCODE_TIMEOUT_MS,
          signal: controller.signal,
          analysisId: analysisId!,
        });
        if (hit.quantity?.basis === 'package_label') labelQuantity = hit.quantity;

        const catalogId = hit.mapping.catalog_id;
        if (!hit.coverage_miss && catalogId && tables.catalog.has(catalogId)) {
          const entry = tables.catalog.get(catalogId)!;
          visionController?.abort();
          console.log(
            '[capture/pipeline] barcode',
            hit.ean,
            '→',
            catalogId,
            hit.mapping.match_level,
          );
          return {
            kind: 'single',
            resolution: fromBarcode(
              catalogId,
              entry.display_name,
              hit.quantity,
              input.barcode.gtin14,
            ),
          };
        }
        console.log('[capture/pipeline] barcode', hit.ean, 'reads the photo instead');
      } catch (error) {
        // A code that will not resolve is a reason to look at the picture, not
        // a reason to stop. The photo path carries its own failure handling.
        console.log('[capture/pipeline] barcode lookup', describe(error));
      }
    }

    if (!alive()) return null;

    // 3 — normal mode starts the photo here; fast mode collects the request
    // that has been running alongside the barcode lookup.
    const settledVision = parallelVision
      ? await parallelVision
      : await readPhoto().then(
          (seen) => ({ ok: true as const, seen }),
          (error: unknown) => ({ ok: false as const, error }),
        );
    if (!settledVision.ok) {
      if (visionController?.signal.aborted) return null;
      throw settledVision.error;
    }
    const seen = settledVision.seen;

    // A frame holding several things becomes a plate. A packet's label
    // quantity stays on the single arm — one tin's 330 ml says nothing about
    // the rest of a plate.
    const usable = seen.items.filter((item) => item.candidates.length > 0 || item.label !== '');
    if (usable.length > 1) {
      console.log('[capture/pipeline] recognized plate of', usable.length);
      return { kind: 'many', items: usable.slice(0, MAX_PLATE_ITEMS) };
    }

    const known = seen.candidates.filter((candidate) => tables.catalog.has(candidate.catalog_id));
    const top = known[0];
    if (!top) return null;

    console.log(
      '[capture/pipeline] recognized',
      top.catalog_id,
      top.score,
      known.length > 1 ? `+${known.length - 1} more` : '',
    );

    return {
      kind: 'single',
      resolution: {
        catalogId: top.catalog_id,
        displayName: top.display_name,
        quantity: labelQuantity ?? seen.quantity,
        shortlist: top.score < MULTI_CANDIDATE_SCORE ? known : [],
        ...(input.barcode ? { gtin14: input.barcode.gtin14 } : {}),
        source: 'photo',
      },
    };
  }

  /* ------------------------------------------------------------ per item */

  /**
   * One catalogue pick, run through the engine. No box: nothing was framed.
   * A serving nobody moved is a serving, the same rule the single arm keeps.
   */
  function pickToPlateItem(pick: SearchPick): PlateItem | null {
    const outcome = dependencies.estimateFor({
      catalogId: pick.catalogId,
      quantity: pick.quantity,
      source: pick.userEntered ? 'user_entered' : 'catalog_default',
    });
    return outcome ? { estimate: outcome.estimate, box: null } : null;
  }

  /**
   * One wire item, run through the engine.
   *
   * The engine already retries with the catalogue's published serving when the
   * model hands back a unit the entry rejects — that is the whole defence
   * against unreliable per-item quantities.
   */
  function toPlateItem(item: RecognizeItem): PlateItem {
    const tables = dependencies.getTables();
    const box = item.box ?? null;
    const known = item.candidates.filter((c) => tables.catalog.has(c.catalog_id));
    const top = known[0];

    if (top) {
      const outcome = dependencies.estimateFor({
        catalogId: top.catalog_id,
        quantity: item.quantity,
        source:
          item.quantity?.basis === 'package_label'
            ? 'package_label'
            : item.quantity
              ? 'vision_estimate'
              : 'catalog_default',
      });
      if (outcome) return { estimate: outcome.estimate, box };
    }
    return { estimate: arrivingLater(item), box };
  }

  /* -------------------------------------------------------------- the run */

  async function run(): Promise<void> {
    dependencies.clearCandidates();

    // One tick, so the first transition never lands inside the machine's own
    // `captured` update.
    await delay(dependencies.clock, 0);
    if (!alive()) return;
    handlers.onRecognizing();

    const identified = await identify();
    if (!alive()) return;
    if (!identified) {
      finish(handlers.onUnresolved);
      return;
    }
    // A presentable barcode or recognition response consumes the reservation
    // on the server. Releasing a consumed row is harmless, but avoiding the
    // extra call keeps the success path quiet.
    reservationPending = false;

    if (identified.kind === 'picked') {
      const first = identified.plate[0]!;
      handlers.onAnalyzing({
        catalog_id: first.estimate.catalog_id,
        display_name: first.estimate.display_name,
        count: identified.plate.length,
      });

      if (!(await holdAnalysisBeat())) return;

      finish(() => handlers.onPresentingMany(identified.plate));
      return;
    }

    if (identified.kind === 'many') {
      const first = identified.items[0]!;
      handlers.onAnalyzing({
        catalog_id: first.candidates[0]?.catalog_id ?? '',
        display_name: first.candidates[0]?.display_name ?? first.label,
        count: identified.items.length,
      });

      if (!(await holdAnalysisBeat())) return;

      const plate = identified.items.map(toPlateItem);
      finish(() => handlers.onPresentingMany(plate));
      return;
    }

    const resolved = identified.resolution;
    handlers.onAnalyzing({
      catalog_id: resolved.catalogId,
      display_name: resolved.displayName,
      ...(resolved.gtin14 ? { gtin14: resolved.gtin14 } : {}),
    });

    // Normal mode lets the name land before its number; fast mode continues.
    if (!(await holdAnalysisBeat())) return;

    const outcome = dependencies.estimateFor({
      catalogId: resolved.catalogId,
      quantity: resolved.quantity,
      source: quantitySource(resolved),
    });

    if (!outcome) {
      finish(handlers.onUnresolved);
      return;
    }

    if (resolved.shortlist.length > 1) {
      dependencies.offerCandidates(resolved.shortlist, resolved.quantity);
    }

    finish(() => handlers.onPresenting(outcome.estimate));
  }

  run()
    .catch((error) => {
      console.log('[capture/pipeline] held', describe(error));
      if (error instanceof ApiError && error.kind === 'rate_limited' && error.usage) {
        finish(() => handlers.onLimited(error.usage!));
      } else {
        finish(handlers.onUnresolved);
      }
    })
    .finally(() => {
      dependencies.clock.clearTimeout(ceiling);
      releasePending();
    });

  return {
    cancel: () => {
      cancelled = true;
      settled = true;
      dependencies.clock.clearTimeout(ceiling);
      controller.abort();
      releasePending();
    },
  };
}

/**
 * Build the shipped pipeline with selected effects replaced.
 *
 * Production uses the defaults below. Tests replace only the radio, usage,
 * and clock edges while leaving catalogue lookup and estimation untouched.
 */
export function createRealPipeline(overrides: Partial<RealPipelineDependencies> = {}): Pipeline {
  const dependencies: RealPipelineDependencies = { ...realDependencies, ...overrides };
  return (input, handlers) => runRealPipeline(input, handlers, dependencies);
}

/** The production binding: the factory above with every shipped dependency. */
export const realPipeline: Pipeline = createRealPipeline();

/**
 * Where the amount came from, in the engine's own vocabulary. The engine caps
 * confidence by this, so a reading off a packet and a guess from a frame are
 * never treated as equally solid.
 */
function quantitySource(resolved: Resolution) {
  // A catalogue pick whose serving nobody moved is a serving, not an answer.
  // Saying otherwise would skip the confidence cap the engine applies to it.
  if (resolved.source === 'search') {
    return resolved.userEntered ? ('user_entered' as const) : ('catalog_default' as const);
  }
  if (resolved.quantity?.basis === 'package_label') return 'package_label' as const;
  if (resolved.quantity) return 'vision_estimate' as const;
  return 'catalog_default' as const;
}

/**
 * A card for something the catalogue has no word for yet.
 *
 * It carries no headline, which is exactly what the result card already reads
 * to draw the "arriving later" face — and exactly what `insertConfirmed`
 * refuses, so an unknown can never be counted as zero litres by accident.
 */
function arrivingLater(item: RecognizeItem): Estimate {
  const q = item.quantity;
  return {
    catalog_id: '',
    display_name: item.label || copy.plate.unknownItem,
    category: item.category ?? 'product',
    headline: null,
    quantity: q
      ? { value: q.value, unit: q.unit, source: 'vision_estimate' }
      : { value: 1, unit: 'item', source: 'vision_estimate' },
    factor: null,
    match_level: null,
    confidence: null,
    fallback_reason: null,
    assumptions: [],
    secondary: [],
    unsupported: { reason: 'not_in_catalog' },
    factors_version: FACTORS_VERSION,
  };
}

function describe(error: unknown): string {
  if (error instanceof ApiError) return `${error.kind}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

/* ---------------------------------------------------------- the binding */

let active: Pipeline = fakePipeline;

/** Read at call time, so a swap takes effect on the very next capture. */
export function getPipeline(): Pipeline {
  return active;
}

/** Wire phase entry point. Call once, at boot. */
export function setPipeline(next: Pipeline): void {
  active = next;
}

/* ------------------------------------------------------------- install */

let installed = false;

/**
 * Point the machine at the wired run, once, at boot.
 *
 * Three warmups ride along on a later tick so none of them lands inside a
 * beat: building the seven factor tables takes about a second cold, opening
 * the database runs the WAL pragmas and the migrations, and hydrating the
 * catalogue is what makes the search sheet answer inside a keystroke. Left
 * lazy, the database one lands on the first confirmation — measured at three
 * and a half seconds between the press and the tick, which is far too long for
 * the moment a person hands something to their own record.
 */
export function installRealPipeline(): void {
  if (installed) return;
  installed = true;
  setPipeline(realPipeline);

  setTimeout(() => {
    try {
      getTables();
    } catch (error) {
      console.log('[capture/pipeline] table warmup', describe(error));
    }
    getDb().catch((error) => console.log('[capture/pipeline] database warmup', describe(error)));
    hydrateCatalog().catch((error) =>
      console.log('[capture/pipeline] catalogue warmup', describe(error)),
    );
  }, 0);
}
