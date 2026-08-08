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
    unit: 'kg' | 'l' | 'km' | 'usd';
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
  | { name: 'confirmed'; photoUri: string; anchor: Rect; estimate: Estimate; entryId: string }
  | { name: 'unresolved'; photoUri: string };

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

const RESULT_STATES: ReadonlySet<CaptureStateName> = new Set([
  'presenting',
  'expanded',
  'adjusting',
  'confirmed',
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
