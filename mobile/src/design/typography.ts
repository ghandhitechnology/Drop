import type { TextStyle } from 'react-native';

/**
 * Font families are the postscript-ish names registered by expo-font in
 * app/_layout.tsx. Keep these two lists in sync.
 */
export const fontFamily = {
  handBold: 'ShantellSans_700Bold',
  handSemi: 'ShantellSans_600SemiBold',
  handMedium: 'ShantellSans_500Medium',
  uiBold: 'Nunito_700Bold',
  uiSemi: 'Nunito_600SemiBold',
  uiRegular: 'Nunito_400Regular',
  /** Reserved for playful annotations; loaded but not yet used by a variant. */
  noteRegular: 'Gaegu_400Regular',
  noteBold: 'Gaegu_700Bold',
} as const;

export type TextVariant =
  | 'hero'
  | 'heroUnit'
  | 'title'
  | 'chip'
  | 'body'
  | 'label'
  | 'note';

type VariantStyle = Pick<
  TextStyle,
  'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing'
>;

export const typography: Record<TextVariant, VariantStyle> = {
  /** The one large footprint number. Never competes with anything else. */
  hero: {
    fontFamily: fontFamily.handBold,
    fontSize: 64,
    lineHeight: 72,
    letterSpacing: -1,
  },
  /** The unit that trails the hero number ("L", "litres"). */
  heroUnit: {
    fontFamily: fontFamily.handMedium,
    fontSize: 28,
    lineHeight: 34,
  },
  title: {
    fontFamily: fontFamily.handSemi,
    fontSize: 24,
    lineHeight: 30,
  },
  // No letterSpacing: on Android it is applied after the final glyph but not
  // included in the measured width, which clips the last character.
  chip: {
    fontFamily: fontFamily.uiBold,
    fontSize: 13,
    lineHeight: 18,
  },
  body: {
    fontFamily: fontFamily.uiRegular,
    fontSize: 16,
    lineHeight: 24,
  },
  label: {
    fontFamily: fontFamily.uiSemi,
    fontSize: 14,
    lineHeight: 20,
  },
  /**
   * A pencil annotation in the margin — the standing camera hint, and anything
   * else that is Drop talking rather than the interface labelling itself.
   * Gaegu runs small for its point size, so it is set larger than `body`.
   */
  note: {
    fontFamily: fontFamily.noteBold,
    fontSize: 21,
    lineHeight: 26,
  },
};

/**
 * Per-variant cap on dynamic-type growth. The hero number is already very large,
 * so it is capped; everything else scales freely with the OS text size.
 */
export const maxFontSizeMultiplier: Partial<Record<TextVariant, number>> = {
  hero: 1.5,
};

/* ------------------------------------------------------------ legibility */

type LegibleStyle = VariantStyle & Pick<TextStyle, 'fontWeight'>;

/**
 * The alternative face, for "Clearer text".
 *
 * Atkinson Hyperlegible is the face this mode wants, and shipping a fourth
 * family for it would cost more bundle than it returns. The platform's own UI
 * font is the next best thing and the only one guaranteed to be installed:
 * it is hinted for the screen the person is holding, it already follows their
 * accessibility settings, and at a heavier weight its counters stay open where
 * a handwriting face closes them up.
 *
 * Leaving `fontFamily` unset is what selects it — React Native falls through to
 * the system face. Sizes are held so nothing reflows; only the face, the
 * weight, the tracking, and a little extra leading change.
 */
export const legibleTypography: Record<TextVariant, LegibleStyle> = {
  hero: {
    fontSize: typography.hero.fontSize,
    lineHeight: typography.hero.lineHeight,
    letterSpacing: -0.5,
    fontWeight: '800',
  },
  heroUnit: {
    fontSize: typography.heroUnit.fontSize,
    lineHeight: typography.heroUnit.lineHeight,
    fontWeight: '600',
  },
  title: {
    fontSize: typography.title.fontSize,
    lineHeight: 32,
    fontWeight: '700',
  },
  chip: {
    fontSize: typography.chip.fontSize,
    lineHeight: typography.chip.lineHeight,
    fontWeight: '700',
  },
  body: {
    fontSize: typography.body.fontSize,
    lineHeight: 26,
    letterSpacing: 0.2,
    fontWeight: '600',
  },
  label: {
    fontSize: typography.label.fontSize,
    lineHeight: 22,
    letterSpacing: 0.2,
    fontWeight: '700',
  },
  // The annotation drops to a readable UI size once the hand face is off: the
  // extra points existed to compensate for Gaegu's small eye, and the system
  // face needs none of them.
  note: {
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: 0.2,
    fontWeight: '700',
  },
};

/** The style for a variant, under the reading preference in force. */
export function variantStyle(
  variant: TextVariant,
  legible: boolean,
): VariantStyle | LegibleStyle {
  return legible ? legibleTypography[variant] : typography[variant];
}
