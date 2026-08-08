/**
 * Motion constants for Drop.
 *
 * Durations are grouped by intent rather than by size so a screen can pick the
 * meaning ("this is a settle", "this is the signature reveal") and stay
 * consistent with the rest of the app.
 */
export const duration = {
  /** Press feedback, chip toggles. Fast enough to feel attached to the finger. */
  quick: 140,
  /** Layout settles, fades, cards arriving. */
  settle: 260,
  /** A pencil stroke drawing itself on. */
  draw: 380,
  /** The avatar-expansion reveal — the one long moment in the product. */
  signature: 620,
} as const;

export type DurationName = keyof typeof duration;

/** The avatar's own bounce. Loose and lively. */
export const dropSpring = {
  damping: 13,
  stiffness: 150,
  mass: 0.9,
} as const;

/** Surfaces and cards. Damped enough to read as material, not as a toy. */
export const cardSpring = {
  damping: 22,
  stiffness: 210,
  mass: 1,
} as const;

export const spring = {
  drop: dropSpring,
  card: cardSpring,
} as const;

export type SpringName = keyof typeof spring;
