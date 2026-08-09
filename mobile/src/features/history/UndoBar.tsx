/**
 * The way back, for five seconds.
 *
 * A removal is instant and the total moves with it, so the offer to undo has to
 * be equally plain. The pencil line under the bar is the window running out —
 * it un-draws itself, retreating the way a stroke is rubbed back out, rather
 * than shrinking like a progress meter. Decoration only: the five seconds are
 * kept by the store's own timer, and the line is left off entirely under
 * reduced motion.
 */

import { Canvas, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../design/theme';
import { radius, space } from '../../design/tokens';
import { useMotion } from '../../design/useMotion';
import { HandFrame } from '../../drawing/HandFrame';
import { HandPath } from '../../drawing/HandPath';
import { seedFromString } from '../../drawing/seededRandom';
import { copy } from '../../lib/copy';
import { SketchButton } from '../../ui/SketchButton';
import { Text } from '../../ui/Text';
import { UNDO_WINDOW_MS } from './store';

const ENTER_MS = 200;
const SEED = seedFromString('history/undo-bar');
/** Height the retreating stroke owns along the foot of the bar. */
const TRACK_HEIGHT = 6;

export type UndoBarProps = {
  label: string;
  onRestore: () => void;
};

export function UndoBar({ label, onRestore }: UndoBarProps) {
  const { colors } = useTheme();
  const motion = useMotion();
  const insets = useSafeAreaInsets();

  const reveal = useSharedValue(0);
  const remaining = useSharedValue(1);
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (current === next ? current : next));
  };

  const track = useMemo(() => {
    if (width <= space.lg * 2) return null;
    const path = Skia.Path.Make();
    path.moveTo(space.lg, TRACK_HEIGHT / 2);
    path.lineTo(width - space.lg, TRACK_HEIGHT / 2);
    return path;
  }, [width]);

  useEffect(() => {
    reveal.value = withTiming(1, {
      duration: motion.reduceMotion ? 1 : ENTER_MS,
    });
    remaining.value = 1;
    remaining.value = withTiming(0, { duration: UNDO_WINDOW_MS });
  }, [reveal, remaining, motion.reduceMotion, label]);

  const barStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * 14 }],
  }));

  return (
    <Animated.View
      style={[styles.root, { bottom: insets.bottom + space.lg }, barStyle]}
      pointerEvents="box-none"
      onLayout={onLayout}
    >
      <HandFrame
        seed={SEED}
        color={colors.inkFaint}
        radius={radius.lg}
        style={[styles.bar, { backgroundColor: colors.paper }]}
        contentStyle={styles.row}
      >
        <Text variant="label" tone="ink" style={styles.label} numberOfLines={2}>
          {copy.history.removed(label)}
        </Text>
        {/*
          Outline only. The bar it sits in is already a drawn box, and colouring
          this one in would make the offer to undo louder than the removal it is
          apologising for.
        */}
        <SketchButton
          onPress={onRestore}
          haptic="removing"
          seed="history/undo/restore"
          radius={radius.pill}
          scale={0.86}
          accessibilityLabel={copy.history.restore}
          accessibilityHint={copy.history.restoreHint}
          style={styles.action}
          contentStyle={styles.actionContent}
        >
          <Text variant="button" tone="accent">
            {copy.history.restore}
          </Text>
        </SketchButton>
      </HandFrame>

      {!motion.reduceMotion && track && (
        <Canvas
          style={[styles.track, { width }]}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <HandPath
            path={track}
            color={colors.accent}
            variant="pencil"
            seed={SEED}
            strokeScale={0.7}
            end={remaining}
          />
        </Canvas>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: space.lg, right: space.lg },
  bar: { borderRadius: radius.lg, minHeight: 56 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.lg,
    paddingRight: space.md,
    paddingVertical: space.sm,
    minHeight: 56,
  },
  label: { flex: 1 },
  action: { minHeight: 46, minWidth: 96 },
  actionContent: { minHeight: 46, paddingHorizontal: space.md },
  // Sits just inside the drawn frame's foot, so the stroke reads as underlining
  // the offer rather than as a bar attached to the bottom of a box.
  track: { position: 'absolute', left: 0, bottom: 3, height: TRACK_HEIGHT },
});
