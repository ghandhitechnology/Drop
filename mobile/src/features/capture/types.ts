/**
 * Capture-side contracts.
 *
 * The `Estimate` shape below is a faithful mirror of
 * `packages/water-engine/src/types.ts`. The mobile app is outside the npm
 * workspace and Metro does not watch `packages/`, so the engine cannot be
 * imported here yet. When the Wire phase adds the workspace link, this block
 * is replaced by `export type { Estimate, ... } from '@drop/water-engine'`
 * and nothing else in the feature has to move.
 *
 * Keep this file in sync with the engine. It is the only duplicate.
 */

/* ------------------------------------------------- mirrored engine types */

export type MetricType =
  | 'total_water_footprint'
  | 'freshwater_withdrawal'
  | 'freshwater_consumption'
  | 'scarcity_weighted_water_use';

export type Confidence = 'high' | 'medium' | 'low' | 'very_low';

export type MatchLevel =
  | 'exact_item'
  | 'sub_typology'
  | 'typology'
  | 'recipe_sum'
  | 'transport_mode'
  | 'proxy_sector'
  | 'proxy_owid'
  | 'broad_group';

export type QuantitySource =
  | 'package_label'
  | 'user_entered'
  | 'vision_estimate'
  | 'catalog_default';

export interface FactorRef {
  factor_id: string;
  dataset: string;
  dataset_release: string;
  /** Optional so estimates frozen before validity provenance shipped still load. */
  valid_from?: string | null;
  valid_until?: string | null;
  geography: string;
  system_boundary: string | null;
  functional_unit: string;
  metric_type: MetricType;
  rights?: string | null;
}

export interface SecondaryMetric {
  metric_type: MetricType;
  label: string;
  value_l: number;
  geography: string;
  proxy_metric: boolean;
  factor: FactorRef;
}

export interface Estimate {
  catalog_id: string;
  display_name: string;
  category: 'food' | 'drink' | 'transport' | 'product';
  headline: {
    value_l: number;
    range_l: [number, number] | null;
    metric_type: MetricType;
    proxy_metric: boolean;
  } | null;
  quantity: {
    value: number;
    unit: 'kg' | 'g' | 'l' | 'ml' | 'km' | 'usd' | 'item';
    source?: QuantitySource;
  };
  factor: FactorRef | null;
  match_level: MatchLevel | null;
  confidence: Confidence | null;
  fallback_reason: string | null;
  assumptions: string[];
  secondary: SecondaryMetric[];
  unsupported: { reason: string } | null;
  factors_version: string;
}

/* -------------------------------------------------------- capture types */

/** Recognition behavior selected from the live camera. */
export type CaptureMode = 'normal' | 'fast';

/**
 * A rectangle in **capture-stage coordinates** — the origin is the top-left of
 * the view that holds the camera, so it is directly usable as the start
 * geometry for the signature expansion without another measure pass.
 */
export type Rect = { x: number; y: number; width: number; height: number };

export const BARCODE_SYMBOLOGIES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;
export type Symbology = (typeof BARCODE_SYMBOLOGIES)[number];

export type BarcodeHint = {
  symbology: Symbology;
  /** Digits as the symbology defines them: 13 for ean13, 12 for upc_a, and so on. */
  value: string;
  /** Zero-padded GTIN-14 — the one key every product lookup uses. */
  gtin14: string;
  /** Bounds in capture-stage coordinates, when the platform reports them. */
  bounds: Rect | null;
};

/** What recognition resolved the photo to, before any factor lookup runs. */
export type RecognizedItem = {
  catalog_id: string;
  /** Shown while the lookup runs, so the label never pops in late. */
  display_name: string;
  /** Present when a barcode carried the identification. */
  gtin14?: string;
  /** How many things the frame held, when it held more than one. */
  count?: number;
};

/** A rectangle normalised to the captured frame, origin top-left, 0–1. */
export type NormalizedBox = { x: number; y: number; w: number; h: number };

/**
 * One card in a plate.
 *
 * The estimate is the engine's own output, unchanged — the box rides beside it
 * rather than inside it, because `Estimate` is the shape that gets frozen into
 * history and the engine owns every field of it.
 */
export type PlateItem = {
  estimate: Estimate;
  /** Where it was in the frame. Null falls the card back to the capture anchor. */
  box: NormalizedBox | null;
};

/**
 * The capture state union.
 *
 * `photoUri` and `anchor` ride along from `captured` onward: the frozen frame
 * stays on screen for the whole run and the signature expansion grows out of
 * the anchor, so both are needed at every later step.
 */
export type CaptureState =
  | { name: 'idle' }
  | { name: 'framing'; barcodeHint?: BarcodeHint }
  | { name: 'captured'; photoUri: string; anchor: Rect }
  | { name: 'recognizing'; photoUri: string; anchor: Rect }
  | { name: 'analyzing'; photoUri: string; anchor: Rect; item: RecognizedItem }
  | { name: 'presenting'; photoUri: string; anchor: Rect; estimate: Estimate }
  | { name: 'expanded'; photoUri: string; anchor: Rect; estimate: Estimate }
  | { name: 'adjusting'; photoUri: string; anchor: Rect; estimate: Estimate }
  | {
      name: 'confirmed';
      photoUri: string;
      anchor: Rect;
      estimate: Estimate;
      entryId: string;
    }
  | {
      name: 'plating';
      photoUri: string;
      anchor: Rect;
      /** In the order they read off the photo. Frozen for the life of the state. */
      items: PlateItem[];
      /** Indices of cards the person has set aside. Index, never id: a plate
       *  can carry the same catalogue entry twice. */
      dismissed: readonly number[];
      /**
       * Indices swiped toward history but not yet written.
       *
       * Nothing here has reached SQLite. A plate is one row, so the cards are
       * held until the run ends and then written in a single `insertPlate` —
       * closing the result throws the queue away, which is the whole reason it
       * lives in state rather than in the database.
       */
      queued: readonly number[];
    }
  | {
      name: 'plateConfirmed';
      photoUri: string;
      anchor: Rect;
      items: PlateItem[];
      kept: readonly number[];
      /** What had already been swiped across when the write happened. */
      queued: readonly number[];
      entryId: string;
      /** What actually went into history — the merged plate, or the one survivor. */
      saved: Estimate;
    }
  | { name: 'unresolved'; photoUri: string; anchor: Rect }
  | {
      name: 'limited';
      photoUri: string;
      anchor: Rect;
      usage: import('../../data/api/usage').UsageSnapshot;
    };

export type CaptureStateName = CaptureState['name'];

/* ------------------------------------------------------------ selectors */

/** The frozen frame, if one is being held. */
export function photoUriOf(state: CaptureState): string | null {
  return 'photoUri' in state ? state.photoUri : null;
}

export function anchorOf(state: CaptureState): Rect | null {
  return 'anchor' in state ? state.anchor : null;
}

export function estimateOf(state: CaptureState): Estimate | null {
  return 'estimate' in state ? state.estimate : null;
}

/** Every card of a plate, whichever side of the confirm it is on. */
export function plateItemsOf(state: CaptureState): PlateItem[] | null {
  return state.name === 'plating' || state.name === 'plateConfirmed' ? state.items : null;
}

/**
 * The cards a save would write, in order.
 *
 * A queued card is kept — it has been swiped toward history, not away from it.
 * The only thing that leaves this list is a dismissal.
 */
export function keptItemsOf(state: CaptureState): PlateItem[] {
  if (state.name !== 'plating') return [];
  return state.items.filter((_, index) => !state.dismissed.includes(index));
}

/** Indices of the cards a save would write, in the order they read off the photo. */
export function keptIndicesOf(state: CaptureState): number[] {
  if (state.name !== 'plating') return [];
  return state.items.map((_, index) => index).filter((index) => !state.dismissed.includes(index));
}

/**
 * The cards still under the thumb: kept, and not yet swiped across.
 *
 * This is what the pile draws. A queued card has left the paper for the tray,
 * so it is out of the stack's arrangement even though it is still going to be
 * saved.
 */
export function pileIndicesOf(state: CaptureState): number[] {
  if (state.name === 'plateConfirmed') {
    return state.kept.filter((index) => !state.queued.includes(index));
  }
  if (state.name !== 'plating') return [];
  return state.items
    .map((_, index) => index)
    .filter((index) => !state.dismissed.includes(index) && !state.queued.includes(index));
}

/** How many cards are waiting in the tray, unwritten. */
export function queuedCountOf(state: CaptureState): number {
  return state.name === 'plating' || state.name === 'plateConfirmed' ? state.queued.length : 0;
}

/**
 * Everything on screen as a list, so the stage can treat one card and a pile
 * through the same eyes. A single state yields its one estimate.
 */
export function estimatesOf(state: CaptureState): Estimate[] {
  if (state.name === 'plating' || state.name === 'plateConfirmed') {
    return state.items.map((item) => item.estimate);
  }
  return 'estimate' in state ? [state.estimate] : [];
}

const RESULT_STATES: ReadonlySet<CaptureStateName> = new Set([
  'presenting',
  'expanded',
  'adjusting',
  'confirmed',
  'plating',
  'plateConfirmed',
]);

/**
 * True once a result is on screen. From here the camera behind it dims and
 * blurs so the number owns the eye.
 */
export function isResultVisible(state: CaptureState): boolean {
  return RESULT_STATES.has(state.name);
}

/** True while the pipeline is working and the shutter should stay quiet. */
export function isBusy(state: CaptureState): boolean {
  return state.name === 'captured' || state.name === 'recognizing' || state.name === 'analyzing';
}

/**
 * True while a new photo would be accepted — a live frame, nothing held.
 *
 * Every way into the machine asks this first: the shutter, and the library
 * picker that can sit open for a minute before it hands a file back. `capture()`
 * enforces the same rule at the door, so the predicate is a courtesy to the
 * caller rather than the thing that keeps the machine honest.
 */
export function acceptsCapture(state: CaptureState): boolean {
  return state.name === 'idle' || state.name === 'framing';
}

/** True while the full captured photo must stay behind the framed print. */
export function isFrameObscured(state: CaptureState): boolean {
  return isBusy(state) || state.name === 'unresolved' || state.name === 'limited';
}
