/**
 * What the Drop service answers with.
 *
 * One rule shapes every shape in this file: **the service identifies, the
 * device computes.** Nothing here carries a litre figure, a factor row, or a
 * confidence about water. Recognition returns catalogue ids and an amount;
 * barcode lookup returns a catalogue id and a label quantity; the estimate is
 * then built on the phone by `@drop/water-engine` against one active release.
 * That is what keeps a number identical whether the radio is on or off.
 */

export type ItemCategory = 'food' | 'drink' | 'transport' | 'product';

/** The units recognition is allowed to answer in — the engine's own set. */
export type WireUnit = 'g' | 'kg' | 'ml' | 'l' | 'km' | 'usd' | 'item';

export const WIRE_UNITS: readonly WireUnit[] = [
  'g', 'kg', 'ml', 'l', 'km', 'usd', 'item',
];

/** How the amount was arrived at. */
export type QuantityBasis = 'package_label' | 'vision_estimate';

export interface WireQuantity {
  value: number;
  unit: WireUnit;
  basis: QuantityBasis;
  /** The words on the packet, when that is where the number came from. */
  evidence?: string | null;
}

/* ------------------------------------------------------------- recognize */

export interface RecognizeCandidate {
  catalog_id: string;
  display_name: string;
  category: ItemCategory;
  /** 0–1. Below `MULTI_CANDIDATE_SCORE` the card offers the alternatives. */
  score: number;
  reason: string;
  /** True when the id came back close enough to repair rather than exact. */
  repaired: boolean;
}

/** A rectangle normalised to the captured frame, origin top-left, 0–1. */
export interface WireBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * One thing recognition saw in the frame.
 *
 * A photo of one banana answers with a single item and the pipeline treats it
 * exactly as it always has. A plate answers with several, in the order they
 * read off the picture — most prominent first.
 */
export interface RecognizeItem {
  /** Position in the answer, and the stable key for a card in the stack. */
  index: number;
  /** What the model would call it, in its own words. Used when nothing matched. */
  label: string;
  category: ItemCategory | null;
  /** Best first, already filtered to real catalogue ids by the service. */
  candidates: RecognizeCandidate[];
  quantity: WireQuantity | null;
  detected_text: string[];
  /** Where it sits in the frame, when the model could localise it. */
  box: WireBox | null;
  /** True when the catalogue has no word for this one yet. */
  unmatched: boolean;
}

export interface RecognizeResponse {
  request_id: string;
  model: string;
  catalog_version: string;
  /** Every item in the frame. Never empty unless the photo held nothing. */
  items: RecognizeItem[];
  /* The first item, flattened — kept so the single-item path reads as before. */
  /** Best first. Empty when the photo held nothing the catalogue knows. */
  candidates: RecognizeCandidate[];
  quantity: WireQuantity | null;
  detected_text: string[];
  unmatched: boolean;
}

/* --------------------------------------------------------------- barcode */

export type OffStatus = 'found' | 'missing' | 'unavailable';

export interface BarcodeMapping {
  catalog_id: string | null;
  match_level: string;
  confidence: string;
  evidence: string[];
}

export interface BarcodeResponse {
  ean: string;
  catalog_version: string;
  off: {
    status: OffStatus;
    product_name?: string | null;
    brands?: string | null;
    quantity?: string | null;
    last_modified_t?: number | null;
  };
  mapping: BarcodeMapping;
  /** The net weight or volume printed on the packet, when it is published. */
  quantity: (WireQuantity & { confidence?: string }) | null;
  /** True when the code resolved to no catalogue entry. */
  coverage_miss: boolean;
}

/* -------------------------------------------------------------- research */

export interface ResearchEvidence {
  claim: string;
  value?: number | null;
  unit?: string | null;
  metric_type?: string | null;
  geography?: string | null;
  year?: number | null;
  source_title: string;
  source_publisher: string;
  reliability: 'peer_reviewed' | 'report' | 'database' | 'news' | 'unclear';
}

/**
 * Retrieved reading, kept structurally apart from validated factors.
 * `may_be_used_as_factor` is a literal `false` on the wire and this type
 * repeats it, so no code path can quietly promote evidence into a number.
 */
export interface ResearchResponse {
  request_id: string;
  question: string;
  summary: string;
  evidence: ResearchEvidence[];
  status: 'unverified_evidence';
  may_be_used_as_factor: false;
}
