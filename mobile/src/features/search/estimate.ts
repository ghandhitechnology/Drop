/**
 * The engine call, with an amount that came from somewhere else.
 *
 * `localEstimate` in the result feature runs the catalogue's own serving. This
 * runs an amount that arrived from a photo, a packet, or a thumb — which means
 * it can arrive in a unit the entry does not accept (a distance for a fruit, a
 * volume for something the tables measure by mass). The engine is strict about
 * that on purpose, so this is where the strictness is caught: the amount is
 * tried, and the catalogue's published serving is the answer when it fails.
 *
 * Falling back to a serving is a real change to what the number means, and the
 * caller is told which one it got so the card can say so.
 */

import { estimate as runEstimate, type QuantityUnit } from '@drop/water-engine';

import { getTables } from '../../data/tables';
import type { QuantityBasis, WireUnit } from '../../data/api';
import type { Estimate, QuantitySource } from '../capture/types';

/**
 * An amount, whatever decided it.
 *
 * A label reading, a guess from a frame, and a thumb on a stepper all arrive
 * here in the same shape; `basis` says which, and is absent when a person set
 * the number themselves.
 */
export type PickedQuantity = {
  value: number;
  unit: WireUnit;
  basis?: QuantityBasis;
};

export type EstimateRequest = {
  catalogId: string;
  /** The amount as it arrived, in its own unit. */
  quantity?: PickedQuantity | null;
  source: QuantitySource;
};

export type EstimateOutcome = {
  estimate: Estimate;
  /** True when the catalogue's serving stood in for the amount that arrived. */
  usedServing: boolean;
};

/** One serving of an item, as the catalogue publishes it. */
export function servingFor(
  catalogId: string,
): { value: number; unit: string; basis: string } | null {
  const entry = getTables().catalog.get(catalogId);
  return entry ? entry.default_quantity : null;
}

export function catalogEntry(catalogId: string) {
  return getTables().catalog.get(catalogId) ?? null;
}

/**
 * Run the engine and hand back what it produced.
 *
 * The engine's `Estimate` and the capture feature's mirror of it are the same
 * shape; the cast is the seam between a workspace package and the mobile copy,
 * and it goes away when the two share one type.
 */
export function estimateFor({
  catalogId,
  quantity,
  source,
}: EstimateRequest): EstimateOutcome | null {
  const tables = getTables();
  const entry = tables.catalog.get(catalogId);
  if (!entry) return null;

  const serving = entry.default_quantity;

  const attempts: { value: number; unit: QuantityUnit; source: QuantitySource; serving: boolean }[] = [];
  if (quantity && Number.isFinite(quantity.value) && quantity.value > 0) {
    attempts.push({
      value: quantity.value,
      unit: quantity.unit as QuantityUnit,
      source,
      serving: false,
    });
  }
  attempts.push({
    value: serving.value,
    unit: serving.unit as QuantityUnit,
    source: attempts.length === 0 ? source : 'catalog_default',
    serving: true,
  });

  for (const attempt of attempts) {
    try {
      const result = runEstimate(
        {
          catalog_id: catalogId,
          quantity: { value: attempt.value, unit: attempt.unit, source: attempt.source },
        },
        tables,
      );
      return { estimate: result as unknown as Estimate, usedServing: attempt.serving };
    } catch {
      // The next attempt is the published serving, which every entry accepts.
    }
  }

  return null;
}
