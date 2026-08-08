/**
 * Where the result grows from.
 *
 * The signature expansion starts at the anchor, so the anchor has to sit over
 * the thing the person actually pointed at. A barcode in frame gives a real
 * rectangle; without one, the centre square is the honest guess, because that
 * is where the framing hint asks people to put the subject.
 */

import type { BarcodeHint, Rect } from './types';

/**
 * Side of the centre square, as a fraction of the stage's shorter edge.
 *
 * Nearly the whole frame. "Fill the frame with one thing" is only an honest
 * instruction if the drawn square is the frame — a small box in the middle asks
 * people to hold the camera further back than the photo wants them to.
 */
const CENTER_FRACTION = 0.9;

/**
 * …and never more than this share of the height.
 *
 * On a stage wider than it is tall the shorter edge stops being the binding
 * constraint, and a square measured off it alone would run under the door row
 * above and the controls below.
 */
const CENTER_HEIGHT_SHARE = 0.72;

/** Smallest anchor the expansion reads as a shape rather than a dot. */
const MIN_SIDE = 56;

/** Bounds for the character ground that the capture frame folds into. */
const CHARACTER_MIN_SIDE = 108;
const CHARACTER_MAX_SIDE = 176;

export type StageSize = { width: number; height: number };

export function centerSquare(stage: StageSize): Rect {
  const side = Math.max(
    MIN_SIDE,
    Math.min(
      Math.min(stage.width, stage.height) * CENTER_FRACTION,
      stage.height * CENTER_HEIGHT_SHARE,
    ),
  );
  return {
    x: (stage.width - side) / 2,
    y: (stage.height - side) / 2,
    width: side,
    height: side,
  };
}

/** Keep a rect inside the stage and above the minimum readable size. */
export function clampToStage(rect: Rect, stage: StageSize): Rect {
  const width = Math.min(Math.max(rect.width, MIN_SIDE), stage.width);
  const height = Math.min(Math.max(rect.height, MIN_SIDE), stage.height);
  return {
    width,
    height,
    x: Math.min(Math.max(rect.x, 0), Math.max(0, stage.width - width)),
    y: Math.min(Math.max(rect.y, 0), Math.max(0, stage.height - height)),
  };
}

/**
 * The anchor for a capture: barcode bounds when the scan carried usable ones,
 * the centre square otherwise.
 */
export function anchorFor(stage: StageSize, hint?: BarcodeHint): Rect {
  if (stage.width <= 0 || stage.height <= 0) {
    return { x: 0, y: 0, width: MIN_SIDE, height: MIN_SIDE };
  }
  const bounds = hint?.bounds;
  if (bounds && bounds.width > 0 && bounds.height > 0) {
    return clampToStage(bounds, stage);
  }
  return centerSquare(stage);
}

/**
 * Size of the paper circle around Drop for a captured anchor.
 *
 * A tight barcode gives a small character and a full frame gives a large one,
 * so the thing that was pointed at is still legible in how big Drop arrives —
 * within bounds, because the character also has to fit where it stands.
 */
export function characterSideForAnchor(anchor: Rect): number {
  const side = Math.min(anchor.width, anchor.height) * 0.92;
  return Math.max(CHARACTER_MIN_SIDE, Math.min(CHARACTER_MAX_SIDE, side));
}
