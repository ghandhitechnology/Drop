/**
 * What a photo off the camera roll has to become before it can be sent.
 *
 * The shutter decides its own size — `takePictureAsync({ quality: 0.7 })` — so
 * a captured frame arrives already fit for the wire. A picked one does not: it
 * can be forty megapixels of HEIC that has never been resampled in its life,
 * and `encodePhoto` refuses anything over `MAX_PHOTO_BYTES` outright.
 *
 * The arithmetic that decides the resample lives here, apart from the picker
 * that performs it, so the rule can be checked without a device.
 */

/**
 * Longest edge Drop sends.
 *
 * Recognition is naming a thing, not reading its texture, and the models behind
 * `/v1/recognize` downsample well past this before they look anyway. Sending
 * more costs upload seconds inside a moment that has thirty of them.
 */
export const MAX_LONGEST_SIDE = 1600;

/** JPEG quality for the re-encode. The same 0.7 the shutter asks the camera for. */
export const DOWNSCALE_QUALITY = 0.7;

export type Size = { width: number; height: number };

/**
 * The size a picked image should be resampled to, or `null` when its pixels can
 * be left alone.
 *
 * `null` is not "do nothing" — the re-encode still runs, because format and
 * compression matter as much as dimensions here. It only means there is no
 * resize to schedule.
 *
 * Dimensions can arrive as zero: the picker documents that the system does not
 * always report them. An unknown size is not grounds for guessing a resize, so
 * those take the re-encode alone.
 */
export function downscalePlan(
  width: number,
  height: number,
  longest: number = MAX_LONGEST_SIDE,
): Size | null {
  if (!(width > 0) || !(height > 0)) return null;

  const longestSide = Math.max(width, height);
  if (longestSide <= longest) return null;

  const scale = longest / longestSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
