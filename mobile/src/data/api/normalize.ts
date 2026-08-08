/**
 * Reading the service's answers.
 *
 * Every field is checked before it is believed, and the rule is the same
 * everywhere: **a half-read value is dropped rather than passed on.** A
 * quantity missing its unit becomes no quantity at all, which sends the engine
 * to the catalogue's published serving — a known figure — instead of to a
 * number assembled out of two different answers.
 *
 * This file imports nothing but its own types, so the whole reading layer runs
 * under test with no native module and no network.
 */

import { ApiError } from './errors';
import {
  WIRE_UNITS,
  type BarcodeResponse,
  type ItemCategory,
  type OffStatus,
  type QuantityBasis,
  type RecognizeCandidate,
  type RecognizeResponse,
  type ResearchEvidence,
  type ResearchResponse,
  type WireQuantity,
  type WireUnit,
} from './types';

/* ----------------------------------------------------------- primitives */

export function requireObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError('malformed', `${what} was not an object`);
  }
  return value as Record<string, unknown>;
}

export function requireArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new ApiError('malformed', `${what} was not a list`);
  return value;
}

export function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function strings(value: unknown, what: string): string[] {
  return requireArray(value ?? [], what).filter(
    (line): line is string => typeof line === 'string',
  );
}

/* ------------------------------------------------------------- vocabulary */

const CATEGORIES: readonly ItemCategory[] = ['food', 'drink', 'transport', 'product'];
const OFF_STATUSES: readonly OffStatus[] = ['found', 'missing', 'unavailable'];
const RELIABILITIES = ['peer_reviewed', 'report', 'database', 'news'] as const;

export function asCategory(value: unknown): ItemCategory | null {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)
    ? (value as ItemCategory)
    : null;
}

export function asUnit(value: unknown): WireUnit | null {
  return typeof value === 'string' && (WIRE_UNITS as readonly string[]).includes(value)
    ? (value as WireUnit)
    : null;
}

/* --------------------------------------------------------------- readers */

/** A quantity is kept only when every part of it is usable. */
export function readQuantity(value: unknown): WireQuantity | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const amount = finiteNumber(raw.value);
  const unit = asUnit(raw.unit);
  if (amount === null || amount <= 0 || unit === null) return null;
  const basis: QuantityBasis =
    raw.basis === 'package_label' ? 'package_label' : 'vision_estimate';
  return { value: amount, unit, basis, evidence: optionalString(raw.evidence) };
}

export function readCandidate(value: unknown): RecognizeCandidate | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const id = optionalString(raw.catalog_id);
  const category = asCategory(raw.category);
  if (!id || !category) return null;
  return {
    catalog_id: id,
    display_name: optionalString(raw.display_name) ?? id,
    category,
    score: Math.max(0, Math.min(1, finiteNumber(raw.score) ?? 0)),
    reason: optionalString(raw.reason) ?? '',
    repaired: raw.repaired === true,
  };
}

/**
 * Recognition, read.
 *
 * Candidates are re-sorted best-first here rather than trusted to arrive that
 * way, because the top one becomes the name on screen and the threshold that
 * decides whether a shortlist is offered at all is read off its score.
 */
export function readRecognize(body: unknown): RecognizeResponse {
  const raw = requireObject(body, 'recognize');

  const candidates: RecognizeCandidate[] = [];
  for (const entry of requireArray(raw.candidates ?? [], 'recognize.candidates')) {
    const candidate = readCandidate(entry);
    if (candidate) candidates.push(candidate);
  }
  candidates.sort((a, b) => b.score - a.score);

  return {
    request_id: optionalString(raw.request_id) ?? '',
    model: optionalString(raw.model) ?? '',
    catalog_version: optionalString(raw.catalog_version) ?? '',
    candidates,
    quantity: readQuantity(raw.quantity),
    detected_text: strings(raw.detected_text, 'recognize.detected_text'),
    unmatched: raw.unmatched === true || candidates.length === 0,
  };
}

/**
 * A retail code, read.
 *
 * `coverage_miss` is the field the pipeline branches on. The flag is
 * authoritative when the service sends it and derived when it does not, so a
 * hit always carries a catalogue id and a miss never pretends to.
 */
export function readBarcode(body: unknown, fallbackEan: string): BarcodeResponse {
  const raw = requireObject(body, 'barcode');
  const off = requireObject(raw.off ?? {}, 'barcode.off');
  const mapping = requireObject(raw.mapping ?? {}, 'barcode.mapping');
  const catalogId = optionalString(mapping.catalog_id);
  const status = optionalString(off.status);

  return {
    ean: optionalString(raw.ean) ?? fallbackEan,
    catalog_version: optionalString(raw.catalog_version) ?? '',
    off: {
      status:
        status && (OFF_STATUSES as readonly string[]).includes(status)
          ? (status as OffStatus)
          : 'unavailable',
      product_name: optionalString(off.product_name),
      brands: optionalString(off.brands),
      quantity: optionalString(off.quantity),
      last_modified_t: finiteNumber(off.last_modified_t),
    },
    mapping: {
      catalog_id: catalogId,
      match_level: optionalString(mapping.match_level) ?? 'none',
      confidence: optionalString(mapping.confidence) ?? 'none',
      evidence: strings(mapping.evidence, 'barcode.mapping.evidence'),
    },
    quantity: readQuantity(raw.quantity),
    coverage_miss: raw.coverage_miss === true || !catalogId,
  };
}

export function readEvidence(value: unknown): ResearchEvidence | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const claim = optionalString(raw.claim);
  if (!claim) return null;
  const reliability = optionalString(raw.reliability);
  return {
    claim,
    value: finiteNumber(raw.value),
    unit: optionalString(raw.unit),
    metric_type: optionalString(raw.metric_type),
    geography: optionalString(raw.geography),
    year: finiteNumber(raw.year),
    source_title: optionalString(raw.source_title) ?? '',
    source_publisher: optionalString(raw.source_publisher) ?? '',
    reliability:
      reliability && (RELIABILITIES as readonly string[]).includes(reliability)
        ? (reliability as ResearchEvidence['reliability'])
        : 'unclear',
  };
}

/**
 * Retrieved reading, read.
 *
 * `may_be_used_as_factor` is forced to `false` here whatever arrived on the
 * wire. Evidence and factors are different kinds of thing, and this is the
 * line between them.
 */
export function readResearch(body: unknown, catalogId: string): ResearchResponse {
  const raw = requireObject(body, 'research');

  const evidence: ResearchEvidence[] = [];
  for (const entry of requireArray(raw.evidence ?? [], 'research.evidence')) {
    const read = readEvidence(entry);
    if (read) evidence.push(read);
  }

  return {
    request_id: optionalString(raw.request_id) ?? '',
    question: optionalString(raw.question) ?? catalogId,
    summary: optionalString(raw.summary) ?? '',
    evidence,
    status: 'unverified_evidence',
    may_be_used_as_factor: false,
  };
}
