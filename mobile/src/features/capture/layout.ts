/**
 * Where a held frame lives on the stage.
 *
 * The viewfinder folds its reticle down into the snapshot's slot and the result
 * stage draws the snapshot there, so the two have to arrive at the same
 * rectangle to the pixel. Measuring it once, here, is what lets the fold read
 * as one continuous move rather than two animations that happen to line up.
 *
 * The whole stack is measured upward from the spot the shutter had: the
 * character takes the thumb's place, its line sits above it, the pull target
 * above that, and the print above all of them.
 */

import { MIN_TOUCH_SIZE, space } from '../../design/tokens';
import { SHUTTER_SIZE } from './Shutter';
import type { Rect } from './types';

export type StageSize = { width: number; height: number };

/** Height of the line the character says. */
export const TEASER_HEIGHT = 38;

/** The pull target stacked above that line, and the chevron drawn inside it. */
export const PULL_ROW = MIN_TOUCH_SIZE;

/** The supplied frame includes transparent canvas around its pencil outline. */
const SNAPSHOT_FRACTION = 0.76;
const SNAPSHOT_MIN = 232;
const SNAPSHOT_MAX = 348;

/**
 * How much of a short frame the character may take.
 *
 * The anchor decides how big Drop wants to be; the stage decides how big it can
 * be. Everything stacked above it — its line, the pull, the print — lives in
 * whatever is left, so on a small screen the character gives way first.
 */
const HERO_STAGE_SHARE = 0.23;
const HERO_MIN = 96;

export type CaptureLayout = {
  /** The character's side, after the stage has had its say on the anchor's. */
  hero: number;
  /** Where the character stands once the frame is held — the shutter's old spot. */
  bubble: { x: number; y: number };
  /** Top of the row holding the pull target, with the character's line under it. */
  teaserTop: number;
  /** Centre of the drawn chevron, inside that pull target. */
  chevronY: number;
  /** The square the held frame folds down into. */
  slot: Rect;
};

/** The print's side. Large enough to inspect, while still clearing its line. */
function snapshotSide(stage: StageSize, teaserTop: number): number {
  const shorter = Math.min(stage.width, stage.height);
  const preferred = Math.max(
    SNAPSHOT_MIN,
    Math.min(SNAPSHOT_MAX, shorter * SNAPSHOT_FRACTION),
  );

  // Short phones give up frame size before letting it disappear under the top
  // edge. On ordinary phones this cap is inactive.
  return Math.min(preferred, Math.max(0, teaserTop - space.lg));
}

/**
 * @param heroSide what the anchor asks the character to be, before the stage
 * has had its say — see `characterSideForAnchor`.
 */
export function captureLayout(
  stage: StageSize,
  bottomInset: number,
  heroSide: number,
): CaptureLayout {
  const hero = Math.max(
    HERO_MIN,
    Math.min(heroSide, stage.height * HERO_STAGE_SHARE),
  );

  // The character lands where the thumb just was — and never hangs off the
  // bottom edge on a device that gives the controls no inset to sit in.
  const shutterY = stage.height - bottomInset - space.xl - SHUTTER_SIZE / 2;
  const y = Math.min(shutterY, stage.height - hero / 2 - space.md);

  const lineTop = y - hero / 2 - space.sm - TEASER_HEIGHT;
  const teaserTop = lineTop - PULL_ROW;
  const side = snapshotSide(stage, teaserTop);

  return {
    hero,
    bubble: { x: stage.width / 2, y },
    teaserTop,
    chevronY: teaserTop + PULL_ROW / 2,
    slot: {
      x: (stage.width - side) / 2,
      y: teaserTop - space.md - side,
      width: side,
      height: side,
    },
  };
}
