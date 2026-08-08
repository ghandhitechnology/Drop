/**
 * Drop design tokens.
 *
 * Two complete palettes, built around a white background (light) and a black
 * background (dark) per the brand commitments. Every colour has a definition in
 * both schemes — nothing is scheme-conditional at the point of use.
 */

export type ColorTokens = {
  /** Page ground. Pure white / pure black. */
  bg: string;
  /** Slightly warmed sheet used for cards and raised surfaces. */
  paper: string;
  /** Primary text and pencil marks. */
  ink: string;
  /** Secondary text, captions, supporting marks. */
  inkSoft: string;
  /** Hairlines, sketch frames, disabled marks. */
  inkFaint: string;
  /** Interactive accent. */
  accent: string;
  /** Accent wash for chips and selected states. */
  accentSoft: string;
  /** Favourable / low-footprint signal. */
  positive: string;
  /** Discarding signal — the swipe that puts a card back in the photo. */
  negative: string;
};

export const palette: Record<'light' | 'dark', ColorTokens> = {
  light: {
    bg: '#FFFFFF',
    paper: '#FAF9F6',
    ink: '#16150F',
    inkSoft: 'rgba(22,21,15,0.62)',
    inkFaint: 'rgba(22,21,15,0.18)',
    accent: '#1E6FD9',
    accentSoft: '#DCE9FA',
    positive: '#2E7D5B',
    negative: '#C0392B',
  },
  dark: {
    bg: '#000000',
    paper: '#0C0C0E',
    ink: '#F4F1E8',
    inkSoft: 'rgba(244,241,232,0.66)',
    inkFaint: 'rgba(244,241,232,0.20)',
    accent: '#7FB4FF',
    accentSoft: '#122236',
    positive: '#6FD3A4',
    negative: '#FF8B72',
  },
};

/** Ordered token names — used by the kitchen sink to enumerate swatches. */
export const colorTokenNames = [
  'bg',
  'paper',
  'ink',
  'inkSoft',
  'inkFaint',
  'accent',
  'accentSoft',
  'positive',
  'negative',
] as const satisfies readonly (keyof ColorTokens)[];

/** 4pt base spacing scale. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;

/** Minimum interactive target, in dp. Matches Android + WCAG 2.2 guidance. */
export const MIN_TOUCH_SIZE = 48;

export type Space = keyof typeof space;
export type Radius = keyof typeof radius;
