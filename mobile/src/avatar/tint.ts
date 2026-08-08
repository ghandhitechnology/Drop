/**
 * Recolouring the line art.
 *
 * The poses ship as black lines on transparent alpha, so the ink colour is a
 * draw-time decision: replace RGB with the theme's ink and keep the alpha
 * channel exactly as authored. That is one colour matrix — cheaper than a
 * separate blend node, and it leaves room in the same matrix for the second
 * job below.
 *
 * The source art is ~140×190px, which a 200dp hero upscales past 4×. Bilinear
 * or cubic upscaling spreads every edge over several pixels and the lines go
 * soft. Pushing contrast through the alpha channel about its midpoint pulls
 * those edges back to a crisp boundary: alpha stays 0 where it was 0 and 1
 * where it was 1, and only the interpolated ramp in between gets steeper.
 */

/**
 * Alpha contrast about 0.5, at full upscale. 1 leaves the art untouched.
 *
 * Tuned on the emulator at 200dp: past about 1.4 the source pixel grid starts
 * to show as stair-steps along the diagonals, which reads worse than softness.
 */
export const SHARPEN = 1.28;

function channels(color: string): [number, number, number] {
  const hex = color.replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

/**
 * A 4×5 colour matrix that tints the art and steepens its alpha edges.
 *
 * Rows are R, G, B, A; each row is [r, g, b, a, offset] with the offset in
 * 0–1 units. RGB rows are all-zero plus a constant, so every pixel takes the
 * ink colour. The alpha row is `a' = k·a + (1 − k)/2`, which is contrast about
 * the 0.5 midpoint; Skia clamps the result back into range.
 *
 * @param color  Hex ink colour for the current scheme.
 * @param sharpen Alpha contrast. Raise it for large renders, 1 to disable.
 */
export function tintMatrix(color: string, sharpen: number = SHARPEN): number[] {
  const [r, g, b] = channels(color);
  const k = Math.max(1, sharpen);
  const offset = (1 - k) / 2;
  // prettier-ignore
  return [
    0, 0, 0, 0, r,
    0, 0, 0, 0, g,
    0, 0, 0, 0, b,
    0, 0, 0, k, offset,
  ];
}

/**
 * Sharpening scaled to how far the art is being stretched.
 *
 * A 24dp row avatar is a downscale and needs none — the mipmap chain already
 * gives clean edges, and forcing contrast there only makes thin lines chunky.
 * A 200dp hero is a heavy upscale and wants the full amount.
 */
export function sharpenFor(drawnHeight: number, sourceHeight: number): number {
  if (sourceHeight <= 0) return 1;
  const scale = drawnHeight / sourceHeight;
  if (scale <= 1) return 1;
  // 1× → 1.0, 3× and beyond → SHARPEN.
  const t = Math.min(1, (scale - 1) / 2);
  return 1 + (SHARPEN - 1) * t;
}
