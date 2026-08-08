/**
 * What the catalogue sheet chose, waiting for the pipeline to collect it.
 *
 * The search route and the pipeline never meet: the sheet stages a pick here
 * and dismisses, the camera screen starts a run, and the pipeline takes the
 * pick on its way past. That keeps this module free of every import that would
 * tie it to the machine or to a screen — which is what lets `pipeline.ts` read
 * it without a cycle.
 *
 * A pick is taken exactly once. A run that starts without one is a photo.
 */

import type { WireUnit } from '../../data/api';

export type SearchPick = {
  catalogId: string;
  /** Shown the instant the sequence starts, before the engine has run. */
  displayName: string;
  /** The amount the sheet settled on, in the catalogue's own unit. */
  quantity: { value: number; unit: WireUnit };
  /** True once a thumb has moved the amount off the published serving. */
  userEntered: boolean;
};

let pending: SearchPick | null = null;

/** Called by the sheet, immediately before it dismisses. */
export function stageSearchPick(pick: SearchPick): void {
  pending = pick;
}

/** Called by the pipeline, once, at the top of a run. */
export function takeSearchPick(): SearchPick | null {
  const pick = pending;
  pending = null;
  return pick;
}

/** Drop a staged pick that no run will collect — a dismissed sheet. */
export function clearSearchPick(): void {
  pending = null;
}
