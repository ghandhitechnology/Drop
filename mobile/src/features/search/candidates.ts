/**
 * The shortlist.
 *
 * When recognition is sure, there is one answer and this store stays empty.
 * When it is not — top score under `MULTI_CANDIDATE_SCORE` — the three it
 * considered are held here, and the result card offers them under the name.
 * Switching re-runs the engine on the device, so the number moves the instant
 * the chip is pressed with nothing to wait for.
 *
 * The store holds the amount recognition read as well as the ids: a shortlist
 * is a disagreement about *what* the thing is, and the 250 g it saw applies
 * just as well to whichever one turns out to be right.
 */

import { create } from 'zustand';

import type { RecognizeCandidate } from '../../data/api';
import type { PickedQuantity } from './estimate';

export type Candidate = {
  catalogId: string;
  label: string;
  score: number;
};

type CandidateState = {
  /** Best first. Empty whenever a single answer is the honest one. */
  list: Candidate[];
  /** Which one the card is currently showing. */
  picked: string | null;
  /** The amount recognition read, carried across a switch. */
  quantity: PickedQuantity | null;
  offer: (list: Candidate[], quantity: PickedQuantity | null) => void;
  pick: (catalogId: string) => void;
  clear: () => void;
};

/** How many alternatives fit under a name without becoming a menu. */
export const MAX_CANDIDATES = 3;

export const useCandidates = create<CandidateState>((set) => ({
  list: [],
  picked: null,
  quantity: null,

  offer: (list, quantity) =>
    set({
      list: list.slice(0, MAX_CANDIDATES),
      picked: list[0]?.catalogId ?? null,
      quantity,
    }),

  pick: (catalogId) => set({ picked: catalogId }),

  clear: () => set({ list: [], picked: null, quantity: null }),
}));

/* -------------------------------------------------- non-hook access ---- */

/**
 * Offer a shortlist, or clear one.
 *
 * The pipeline calls this at the moment it settles on a top candidate. Below
 * the threshold the alternatives go on the card; at or above it, the single
 * answer stands alone and anything left from a previous run is dropped.
 */
export function offerCandidates(
  candidates: readonly RecognizeCandidate[],
  quantity: PickedQuantity | null,
): void {
  const list = candidates.slice(0, MAX_CANDIDATES).map((candidate) => ({
    catalogId: candidate.catalog_id,
    label: candidate.display_name,
    score: candidate.score,
  }));
  useCandidates.getState().offer(list, quantity);
}

export function clearCandidates(): void {
  useCandidates.getState().clear();
}
