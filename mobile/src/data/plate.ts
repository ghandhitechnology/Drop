/**
 * A plate, as one estimate.
 *
 * Several things in one photo become one row in history: the litres add up and
 * the cards themselves are frozen inside the snapshot. The object this builds
 * is a real `Estimate` with one extra field, which is the whole trick — every
 * screen that already reads an estimate keeps working on a plate without
 * knowing what a plate is, and the detail page opts in to the sub-items by
 * checking for the marker.
 */
import type { Confidence, Estimate, MetricType } from '@drop/water-engine';

export const PLATE_ITEM_ID = 'plate';
export const PLATE_JSON_VERSION = 1;

export type PlateEstimate = Estimate & {
  plate: {
    version: typeof PLATE_JSON_VERSION;
    /** Every card kept at save time, in the order they were shown. */
    items: Estimate[];
  };
};

export function isPlate(estimate: Estimate): estimate is PlateEstimate {
  const plate = (estimate as Partial<PlateEstimate>).plate;
  return Boolean(plate && Array.isArray(plate.items));
}

export function plateLabel(count: number): string {
  return `Plate · ${count} items`;
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
  very_low: 0,
};

const CATEGORY_ORDER: Estimate['category'][] = [
  'food', 'drink', 'product', 'transport',
];

/**
 * Add the cards up.
 *
 * Only items carrying a headline contribute a number; the ones whose figure
 * arrives in a later release are still recorded inside the snapshot, because
 * the record should say what was on the plate rather than what Drop could
 * price. Aggregation is conservative everywhere it has a choice: the lowest
 * confidence wins, no match level is claimed, and no secondary metric is
 * carried across.
 */
export function buildPlateEstimate(
  items: Estimate[],
  label: string = plateLabel(items.length),
): PlateEstimate {
  const scored = items.filter((item) => item.headline !== null);
  if (scored.length === 0) {
    throw new Error('a plate needs at least one item with a headline figure');
  }

  let total = 0;
  let low = 0;
  let high = 0;
  let proxy = false;
  let lead = scored[0]!;
  let confidence: Confidence | null = scored[0]!.confidence;
  const litresByCategory = new Map<Estimate['category'], number>();

  for (const item of scored) {
    const headline = item.headline!;
    total += headline.value_l;
    low += headline.range_l ? headline.range_l[0] : headline.value_l;
    high += headline.range_l ? headline.range_l[1] : headline.value_l;
    proxy = proxy || headline.proxy_metric;
    if (headline.value_l > lead.headline!.value_l) lead = item;
    litresByCategory.set(
      item.category,
      (litresByCategory.get(item.category) ?? 0) + headline.value_l,
    );
    if (item.confidence === null || confidence === null) confidence = null;
    else if (CONFIDENCE_RANK[item.confidence] < CONFIDENCE_RANK[confidence]) {
      confidence = item.confidence;
    }
  }

  const metric: MetricType = lead.headline!.metric_type;
  const mixed = new Set(scored.map((item) => item.headline!.metric_type)).size > 1;
  const arriving = items.length - scored.length;

  const assumptions = [`Added up from ${items.length} things in one photo.`];
  if (mixed) {
    assumptions.push('The total follows the metric of the largest item on the plate.');
  }
  if (arriving > 0) {
    assumptions.push(
      `${arriving} of them have a water figure arriving in a later release, and add nothing here.`,
    );
  }

  return {
    catalog_id: PLATE_ITEM_ID,
    display_name: label,
    category: dominantCategory(litresByCategory),
    headline: {
      value_l: total,
      range_l: low === high ? null : [low, high],
      metric_type: metric,
      proxy_metric: proxy,
    },
    quantity: { value: items.length, unit: 'item', source: 'vision_estimate' },
    factor: null,
    match_level: null,
    confidence,
    fallback_reason: 'plate_sum',
    assumptions,
    secondary: [],
    unsupported: null,
    factors_version: lead.factors_version,
    plate: { version: PLATE_JSON_VERSION, items },
  };
}

function dominantCategory(
  litres: Map<Estimate['category'], number>,
): Estimate['category'] {
  let best: Estimate['category'] = 'food';
  let most = -1;
  for (const category of CATEGORY_ORDER) {
    const value = litres.get(category) ?? -1;
    if (value > most) {
      most = value;
      best = category;
    }
  }
  return best;
}
