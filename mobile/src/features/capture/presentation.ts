import type { CaptureStateName } from './types';

/**
 * A shortest-side check distinguishes a tablet from a phone in landscape.
 * Width alone turns many rotated phones into the split capture layout.
 */
export const TABLET_MIN_SHORT_SIDE = 600;

export type CaptureViewport = { width: number; height: number };

export function isTabletCaptureViewport({ width, height }: CaptureViewport): boolean {
  return Math.min(width, height) >= TABLET_MIN_SHORT_SIDE;
}

export type TabletCapturePhase =
  | 'ready'
  | 'reading'
  | 'review'
  | 'recover'
  | 'saved';

/**
 * The tablet panel narrates the same capture run beside the viewfinder. Keeping
 * this mapping exhaustive prevents a new machine state from leaving it blank.
 */
export function tabletCapturePhase(state: CaptureStateName): TabletCapturePhase {
  switch (state) {
    case 'idle':
    case 'framing':
      return 'ready';
    case 'captured':
    case 'recognizing':
    case 'analyzing':
      return 'reading';
    case 'presenting':
    case 'expanded':
    case 'adjusting':
    case 'plating':
      return 'review';
    case 'unresolved':
    case 'limited':
      return 'recover';
    case 'confirmed':
    case 'plateConfirmed':
      return 'saved';
  }
}
