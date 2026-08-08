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
 */

import { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { MIN_TOUCH_SIZE, radius, space } from '../../design/tokens';
import { HandFrame } from '../../drawing/HandFrame';
import { seedFromString } from '../../drawing/seededRandom';
import { Touch, type TouchProps } from '../../ui/Touch';
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
} & Omit<TouchProps, 'style' | 'children'>;

/** The drawn shell, shared by the pressable and static forms. */
function Shell({ seed, children }: { seed: string; children: React.ReactNode }) {
  const seedValue = useMemo(() => seedFromString(seed), [seed]);

  return (
    <HandFrame
      seed={seedValue}
      color={overlayInk.outline}
      variant="pencil"
      radius={CHIP_HEIGHT / 2}
      strokeScale={0.72}
      style={styles.frame}
      contentStyle={styles.content}
    >
      <View style={styles.wash} pointerEvents="none" />
      {children}
    </HandFrame>
  );
}

/** A pressable chip on the viewfinder. */
export function HandChip({ children, seed, style, ...rest }: HandChipProps) {
  return (
    <Touch style={style} {...rest}>
      <Shell seed={seed}>{children}</Shell>
    </Touch>
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
      <Shell seed={seed}>{children}</Shell>
    </View>
  );
}

/** Inset matching HandFrame's own, so the wash stops under the drawn line. */
const INSET = 4;

const styles = StyleSheet.create({
  frame: { minHeight: CHIP_HEIGHT, justifyContent: 'center' },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    minHeight: CHIP_HEIGHT,
  },
  wash: {
    position: 'absolute',
    top: INSET,
    left: INSET,
    right: INSET,
    bottom: INSET,
    borderRadius: radius.pill,
    backgroundColor: overlayInk.tint,
  },
});
