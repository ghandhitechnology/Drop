/**
 * What the catalogue sheet chose, waiting for the pipeline to collect it.
 *
 * The search route and the pipeline never meet: the sheet stages its picks
 * here and dismisses, the camera screen starts a run, and the pipeline takes
 * them on its way past. That keeps this module free of every import that
 * would tie it to the machine or to a screen — which is what lets
 * `pipeline.ts` read it without a cycle.
 *
 * One pick plays the single-card sequence; several play as a plate. Either
 * way the staging is taken exactly once, and a run that starts with nothing
 * staged is a photo.
 */

import type { WireUnit } from '../../data/api';

export type SearchPick = {
  /** The exact catalogue/factor release that supplied this pick and amount. */
  factorsVersion: string;
  catalogId: string;
  /** Shown the instant the sequence starts, before the engine has run. */
  displayName: string;
  /** The amount the sheet settled on, in the catalogue's own unit. */
  quantity: { value: number; unit: WireUnit };
  /** True once a thumb has moved the amount off the published serving. */
  userEntered: boolean;
};

let pending: SearchPick[] = [];

/** Called by the sheet, immediately before it dismisses. Order is kept. */
export function stageSearchPick(pick: SearchPick): void {
  pending = [...pending, pick];
}

/** Called by the pipeline, once, at the top of a run. */
export function takeSearchPicks(): SearchPick[] {
  const picks = pending;
  pending = [];
  return picks;
}

/** Drop staged picks that no run will collect — a dismissed sheet. */
export function clearSearchPicks(): void {
  pending = [];
}
