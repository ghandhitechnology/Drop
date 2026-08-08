/**
 * Filling a shape the way a hand fills one.
 *
 * A bar with a flat 20%-opacity rectangle inside it has a hand-drawn outline
 * around a machine-drawn interior, and the eye reads the interior. A hand
 * fills a box by running the pencil up and down without lifting it: the passes
 * lean, they overrun the edge at the turns, and they are never evenly spaced.
 *
 * One continuous path per bar, so a seven-day chart costs seven more strokes
 * rather than thirty. Everything is seeded off the bar's own day key, so a bar
 * is filled identically every time it is drawn and the chart never shimmers
 * between renders.
 */

import { Skia, type SkPath } from '@shopify/react-native-skia';

import { mulberry32 } from '../../drawing/seededRandom';

/** Gap between passes. Below this the fill turns into a solid block. */
const PITCH = 4.5;
/**
 * How far a pass leans off vertical, as a share of the bar's height — and the
 * share of the bar's width it may ever take.
 *
 * The second cap is what keeps a tall narrow bar drawable. A chart bar is
 * around 22 points wide and can be 130 tall, and a lean taken from the height
 * alone is then wider than the bar it has to fit inside: the run available for
 * passes goes negative and the fill silently disappears from exactly the bars
 * that most need one.
 */
const LEAN = 0.16;
const LEAN_MAX_SHARE = 0.25;
/** How far a turn carries past the edge it turned at. */
const OVERRUN = 1.6;
/** Under this there is no room to run a pass. */
const MIN_SIDE = 5;

/**
 * A serpentine fill for one bar.
 *
 * Passes run bottom-to-top and back, joined at the turns, so the whole fill is
 * a single unbroken stroke — which is what makes it read as drawn rather than
 * hatched. Returns nothing when the bar is too small to hold a pass.
 */
export function scribbleFill(
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
): SkPath | null {
  if (width < MIN_SIDE || height < MIN_SIDE) return null;

  const random = mulberry32(seed);
  const lean = Math.min(height * LEAN, width * LEAN_MAX_SHARE);
  const top = y + 1;
  const bottom = y + height - 1;
  // Inset by the lean so a leaning pass stays inside the bar it fills.
  const left = x + 1 + lean / 2;
  const right = x + width - 1 - lean / 2;
  if (right <= left) return null;

  const passes = Math.max(2, Math.round((right - left) / PITCH));
  const step = (right - left) / passes;

  const builder = Skia.PathBuilder.Make();
  let atBottom = true;
  builder.moveTo(left, bottom - random() * OVERRUN);

  for (let index = 0; index <= passes; index += 1) {
    // Jitter within the pass's own slot, so passes stay in order and no two
    // ever cross into each other's space. Held to the run so the last pass
    // plus its lean cannot walk out of the bar it is filling.
    const jittered = left + index * step + (random() - 0.5) * step * 0.35;
    const base = Math.min(right, Math.max(left, jittered));
    const tilt = atBottom ? lean / 2 : -lean / 2;
    const end = atBottom
      ? top + random() * OVERRUN
      : bottom - random() * OVERRUN;

    builder.lineTo(base + tilt, end);
    if (index < passes) {
      // The turn: a short run along the edge before the pen goes back.
      const turn = base + step * (0.5 + random() * 0.3) + tilt;
      builder.lineTo(Math.min(turn, right), end + (atBottom ? -OVERRUN : OVERRUN) * 0.4);
    }
    atBottom = !atBottom;
  }

  return builder.detach();
}
