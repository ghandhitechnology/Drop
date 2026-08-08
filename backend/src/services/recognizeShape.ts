/** Shapes the model's multi-item recognition output into validated items.
 * Pure: no network, no globals — the route hands in the raw model JSON and
 * the catalog tables, and gets back items safe to put on the wire. */
import type { Tables } from '@drop/water-engine';
import { searchCatalog, validateCatalogId } from './catalogMatch';

export const MAX_ITEMS = 6;
export const MAX_CANDIDATES_PER_ITEM = 3;

/** Boxes thinner than this in either axis carry no visual information. */
const MIN_BOX_SIDE = 0.02;
const LOCAL_MATCH_SCORE = 0.2;

export interface OutBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OutCandidate {
  catalog_id: string;
  display_name: string;
  category: string;
  score: number;
  reason: string;
  repaired: boolean;
}

export interface RecognizedItemOut {
  index: number;
  label: string;
  category: 'food' | 'drink' | 'transport' | 'product' | null;
  candidates: OutCandidate[];
  quantity: {
    value: number;
    unit: string;
    basis: string;
    evidence?: string | null;
  } | null;
  detected_text: string[];
  box: OutBox | null;
  unmatched: boolean;
}

interface RawCandidate {
  catalog_id?: string;
  score?: number;
  reason?: string;
}

interface RawItem {
  label?: string;
  category?: string;
  candidates?: RawCandidate[];
  quantity?: {
    value?: number;
    unit?: string;
    basis?: string;
    evidence?: string | null;
  } | null;
  detected_text?: string[];
  box?: { x?: number; y?: number; w?: number; h?: number } | null;
  unmatched?: boolean;
}

export interface RawRecognition {
  items?: RawItem[];
  scene_description?: string | null;
}

const CATEGORIES = new Set(['food', 'drink', 'transport', 'product']);

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function shapeCandidates(raw: RawCandidate[], tables: Tables): OutCandidate[] {
  const out: OutCandidate[] = [];
  for (const cand of raw) {
    if (!cand.catalog_id) continue;
    const v = validateCatalogId(cand.catalog_id, tables);
    if (!v) continue;
    const entry = tables.catalog.get(v.catalog_id)!;
    out.push({
      catalog_id: v.catalog_id,
      display_name: entry.display_name,
      category: entry.category,
      score: clamp01(cand.score ?? 0),
      reason: cand.reason ?? '',
      repaired: v.repaired,
    });
    if (out.length >= MAX_CANDIDATES_PER_ITEM) break;
  }
  return out;
}

function shapeBox(raw: RawItem['box']): OutBox | null {
  if (!raw) return null;
  const x = clamp01(raw.x ?? 0);
  const y = clamp01(raw.y ?? 0);
  const w = Math.min(clamp01(raw.w ?? 0), 1 - x);
  const h = Math.min(clamp01(raw.h ?? 0), 1 - y);
  if (w < MIN_BOX_SIDE || h < MIN_BOX_SIDE) return null;
  // The full-frame sentinel means "could not localise" — same as no box.
  if (x === 0 && y === 0 && w === 1 && h === 1) return null;
  return { x, y, w, h };
}

function shapeQuantity(raw: RawItem['quantity']): RecognizedItemOut['quantity'] {
  if (!raw || typeof raw.value !== 'number' || !raw.unit || !raw.basis) {
    return null;
  }
  return {
    value: raw.value,
    unit: raw.unit,
    basis: raw.basis,
    evidence: raw.evidence ?? null,
  };
}

export function shapeItems(
  raw: RawRecognition, tables: Tables,
): RecognizedItemOut[] {
  const items: RecognizedItemOut[] = [];

  for (const item of (raw.items ?? []).slice(0, MAX_ITEMS)) {
    const label = (item.label ?? '').trim();
    let candidates = shapeCandidates(item.candidates ?? [], tables);

    // Nothing valid but the model named it: local text match on that name
    // beats a scene-level search because the label describes this one item.
    if (candidates.length === 0 && label) {
      candidates = searchCatalog(label, tables, 2).map((e) => ({
        catalog_id: e.catalog_id,
        display_name: e.display_name,
        category: e.category,
        score: LOCAL_MATCH_SCORE,
        reason: 'text match on item label',
        repaired: true,
      }));
    }

    if (candidates.length === 0 && !label) continue;

    items.push({
      index: items.length,
      label,
      category: CATEGORIES.has(item.category ?? '')
        ? (item.category as RecognizedItemOut['category'])
        : null,
      candidates,
      quantity: shapeQuantity(item.quantity),
      detected_text: (item.detected_text ?? []).filter(
        (t): t is string => typeof t === 'string',
      ),
      box: shapeBox(item.box),
      unmatched: candidates.length === 0,
    });
  }

  // Whole frame drew a blank: fall back to a text match over the scene, so a
  // photo with no listable items still answers the way it always has.
  if (items.length === 0 && raw.scene_description) {
    const found = searchCatalog(raw.scene_description, tables, 3);
    if (found.length > 0) {
      items.push({
        index: 0,
        label: raw.scene_description.slice(0, 80),
        category: null,
        candidates: found.map((e) => ({
          catalog_id: e.catalog_id,
          display_name: e.display_name,
          category: e.category,
          score: LOCAL_MATCH_SCORE,
          reason: 'text match on scene description',
          repaired: true,
        })),
        quantity: null,
        detected_text: [],
        box: null,
        unmatched: false,
      });
    }
  }

  return items;
}
