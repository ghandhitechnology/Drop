/**
 * A control drawn on the viewfinder.
 *
 * Everything else on this screen is pencil — the framing corners, the shutter
 * ring, Drop itself. A chip on the same glass is drawn the same way: one traced
 * outline around a warm translucent wash, so the frame behind it stays visible
 * through the control instead of being blocked out by it.
 *
 * The wash is deliberately thin. Contrast for the label comes from the ink
 * halo underneath the glyphs rather than from an opaque plate, which is what
 * lets the chip sit on a bright shop shelf and a dim kitchen alike without
 * turning into a black rectangle in either.
 *
 * The outline is the same traced box every other button in the product uses, so
 * a chip over live video and a chip on paper are the same drawing in different
 * ink — right down to the corner it carries past.
 */

import { StyleSheet, View, type ViewStyle } from 'react-native';

import { MIN_TOUCH_SIZE, space } from '../../design/tokens';
import { SketchButton, SketchSurface } from '../../ui/SketchButton';
import type { TouchProps } from '../../ui/Touch';
import { overlayInk } from './overlay';

/** Height of a chip on the viewfinder. Past the 48dp floor on its own. */
export const CHIP_HEIGHT = MIN_TOUCH_SIZE;

export type HandChipProps = {
  children: React.ReactNode;
  /**
   * Names the chip. Also seeds its outline, so a given chip is always traced
   * the same way and two chips in one row are never traced identically.
   */
  seed: string;
  style?: ViewStyle | ViewStyle[];
  /**
   * Padding inside the shell. The default is cut for a chip that carries a
   * word; one carrying only a mark overrides it so the shell comes in square
   * rather than sitting as a lozenge around a small drawing.
   */
  contentStyle?: ViewStyle | ViewStyle[];
} & Omit<TouchProps, 'style' | 'children'>;

/** Shared between the pressable and static forms. */
const shell = {
  radius: CHIP_HEIGHT / 2,
  outlineColor: overlayInk.outline,
  washColor: overlayInk.tint,
  scale: 0.74,
  filled: true,
} as const;

/** A pressable chip on the viewfinder. */
export function HandChip({ children, seed, style, contentStyle, ...rest }: HandChipProps) {
  return (
    <SketchButton
      {...rest}
      {...shell}
      seed={`capture/chip/${seed}`}
      style={StyleSheet.flatten([styles.chip, style])}
      contentStyle={StyleSheet.flatten([styles.content, contentStyle])}
    >
      {children}
    </SketchButton>
  );
}

/** The same shell with nothing to press — a readout rather than a control. */
export function HandChipStatic({
  children,
  seed,
  style,
}: Pick<HandChipProps, 'children' | 'seed' | 'style'>) {
  return (
    <View style={style} pointerEvents="none">
      <SketchSurface
        {...shell}
        seed={`capture/chip/${seed}`}
        style={styles.chip}
        contentStyle={styles.content}
      >
        {children}
      </SketchSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: CHIP_HEIGHT, justifyContent: 'center' },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    minHeight: CHIP_HEIGHT,
  },
});
