/** The catalogue sheet, the hand-off back to the camera, and the shortlist. */

export { SearchSheet, type SearchSheetProps } from './SearchSheet';
export { SearchField, type SearchFieldProps } from './SearchField';
export { ResultRow, type ResultRowProps } from './ResultRow';
export { AmountStep, type AmountStepProps } from './AmountStep';
export { CategoryGlyph, GLYPH_SIZE, type CategoryGlyphProps } from './CategoryGlyph';
export { CandidateChips } from './CandidateChips';

export {
  MAX_CANDIDATES,
  clearCandidates,
  offerCandidates,
  useCandidates,
  type Candidate,
} from './candidates';

export {
  catalogEntry,
  estimateFor,
  servingFor,
  type EstimateOutcome,
  type EstimateRequest,
} from './estimate';

export {
  clearSearchPicks,
  stageSearchPick,
  takeSearchPicks,
  type SearchPick,
} from './pick';

export { HANDOFF_DELAY_MS, handOffAfterDismiss, runSearchPicks } from './handoff';
