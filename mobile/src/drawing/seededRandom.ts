/**
 * Deterministic randomness for hand-drawn marks.
 *
 * Every wobble in Drop is seeded from a stable id so a given item's sketch looks
 * identical every time it is drawn — across re-renders, scrolls, and app
 * launches. Marks should feel hand-made, not restless.
 */

/**
 * The generator, split into its two halves.
 *
 * A closure is the pleasant way to hold a random stream and it is what every
 * drawn mark uses. A running simulation cannot: its whole state has to be a
 * plain object it can be stepped through, snapshotted and asserted against, and
 * a closure cannot ride in one. So the step and the mix are exposed separately
 * and `mulberry32` is assembled from them — one implementation, two shapes.
 *
 * Both carry the worklet directive: the same marks are drawn on the UI thread
 * by anything that animates per frame.
 */

/** Advance a mulberry32 state by one. */
export function mulberryNext(state: number): number {
  'worklet';
  return (state + 0x6d2b79f5) >>> 0;
}

/** The value a mulberry32 state stands for, in [0, 1). */
export function mulberryValue(state: number): number {
  'worklet';
  let t = state >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** mulberry32 — small, fast, good enough distribution for visual jitter. */
export function mulberry32(seed: number): () => number {
  'worklet';
  let a = seed >>> 0;
  return function next() {
    'worklet';
    a = mulberryNext(a);
    return mulberryValue(a);
  };
}

/** FNV-1a. Turns a stable string id into a stable numeric seed. */
export function seedFromString(id: string): number {
  'worklet';
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A seeded generator producing values in [min, max). */
export function seededRange(seed: number, min: number, max: number) {
  const next = mulberry32(seed);
  return () => min + next() * (max - min);
}
