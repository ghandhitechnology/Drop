/**
 * Drop design tokens.
 *
 * A set of complete theme families, each with a light and dark palette. Every
 * colour has a definition in every theme and scheme, so components can keep
 * drawing entirely from semantic tokens.
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

export type ColorScheme = 'light' | 'dark';
export type ColorTheme =
  | 'default'
  | 'saltyOcean1'
  | 'absolutely';

export const themePalettes: Record<
  ColorTheme,
  Record<ColorScheme, ColorTokens>
> = {
  default: {
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
  },
  saltyOcean1: {
    light: {
      bg: '#ADD8EA',
      paper: '#CBE7F2',
      ink: '#52372D',
      inkSoft: 'rgba(82,55,45,0.84)',
      inkFaint: 'rgba(82,55,45,0.22)',
      accent: '#744D3C',
      accentSoft: '#96C9DD',
      positive: '#285F56',
      negative: '#963E32',
    },
    dark: {
      bg: '#12334E',
      paper: '#1A425D',
      ink: '#E8C9AC',
      inkSoft: 'rgba(232,201,172,0.76)',
      inkFaint: 'rgba(232,201,172,0.22)',
      accent: '#F2BC84',
      accentSoft: '#30546D',
      positive: '#8CC9AD',
      negative: '#FF9B89',
    },
  },
  absolutely: {
    light: {
      bg: '#FAF9F5',
      paper: '#FFFFFF',
      ink: '#141413',
      inkSoft: '#3D3D3A',
      inkFaint: 'rgba(31,30,29,0.18)',
      accent: '#9C452C',
      accentSoft: '#E8E6DC',
      positive: '#437426',
      negative: '#A73D39',
    },
    dark: {
      bg: '#30302E',
      paper: '#262624',
      ink: '#FAF9F5',
      inkSoft: '#C2C0B6',
      inkFaint: 'rgba(222,220,209,0.20)',
      accent: '#E58C6B',
      accentSoft: '#48332B',
      positive: '#9AC693',
      negative: '#EE8884',
    },
  },
};

/** The authored family remains available to labs that compare both schemes. */
export const palette = themePalettes.default;

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
