/**
 * When the print hits the paper.
 *
 * The arriving photo does not simply stop at its slot — it overshoots slightly,
 * drives into the page, and settles. That compression is the moment the capture
 * has been travelling toward, and it has to be felt as well as seen, so the
 * shape of the press and the instant the thump fires are defined together here.
 * Split across two files they drift, and a haptic that arrives a frame off the
 * squash reads as a second, unrelated event.
 *
 * All of it is pure and runs in a worklet on the UI thread.
 */

/** How far the print is driven into the page at the bottom of the press, in dp. */
export const STAMP_PRESS = 5;

/**
 * Where along the fold the press bottoms out.
 *
 * The travel is interpolated `[0, 0.8, 0.9, 1] → [0, 0, STAMP_PRESS, 0]`, so
 * this is the deepest point of the compression.
 */
export const STAMP_BOTTOM = 0.9;

/**
 * Where along the fold the thump fires.
 *
 * Ahead of `STAMP_BOTTOM`, for two reasons that point the same way: contact
 * begins as the press starts to bite rather than at the bottom of it, and the
 * platform takes a few milliseconds to spin the motor up. Landing the vibration
 * a touch early and letting the squash catch it reads as one event; the other
 * way round reads as two.
 */
export const STAMP_CONTACT = 0.86;

/**
 * Did the fold just pass the point of contact?
 *
 * True on exactly one frame per capture. The fold is reset to 0 before each new
 * frame animates, which moves the value the wrong way through the threshold and
 * so does not re-trigger on the way back down — that is the whole reason this
 * is a crossing test and not a `fold >= STAMP_CONTACT` check.
 *
 * `previous` is null on the very first reading, when there is no crossing to
 * speak of yet.
 */
export function crossedStamp(fold: number, previous: number | null): boolean {
  'worklet';
  if (previous === null) return false;
  return previous < STAMP_CONTACT && fold >= STAMP_CONTACT;
}
