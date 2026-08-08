/**
 * Deterministic randomness for hand-drawn marks.
 *
 * Every wobble in Drop is seeded from a stable id so a given item's sketch looks
 * identical every time it is drawn — across re-renders, scrolls, and app
 * launches. Marks should feel hand-made, not restless.
 */

/** mulberry32 — small, fast, good enough distribution for visual jitter. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a. Turns a stable string id into a stable numeric seed. */
export function seedFromString(id: string): number {
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
