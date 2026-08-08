import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { usePreferences } from '../design/preferences';
import { useColors } from '../design/theme';
import type { ColorTokens } from '../design/tokens';
import {
  maxFontSizeMultiplier,
  variantStyle,
  type TextVariant,
} from '../design/typography';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  /** Token name, or any explicit colour string. Defaults to `ink`. */
  tone?: keyof ColorTokens | (string & {});
};

/**
 * The only text primitive in Drop.
 *
 * Dynamic type is always respected (`allowFontScaling`), with a per-variant cap
 * so the hero number cannot grow past its layout. Callers may still override
 * either prop for a specific case.
 *
 * The face comes from the reading preference rather than from the call site, so
 * "Clearer text" reaches every word in the product at once — including the ones
 * inside components nobody remembered to update.
 */
export function Text({
  variant = 'body',
  tone = 'ink',
  style,
  ...rest
}: TextProps) {
  const colors = useColors();
  const legible = usePreferences((s) => s.legibleText);
  const color = tone in colors ? colors[tone as keyof ColorTokens] : tone;

  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={maxFontSizeMultiplier[variant]}
      {...rest}
      style={[variantStyle(variant, legible), { color }, style]}
    />
  );
}
