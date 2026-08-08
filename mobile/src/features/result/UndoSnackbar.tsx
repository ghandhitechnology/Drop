/**
 * The way back.
 *
 * A confirmation is the only door into history, so the door has to swing both
 * ways for a moment afterwards. This sits at the top of the frame rather than
 * the bottom, because the bottom belongs to the shutter — by the time this
 * appears the camera is live again and a thumb is already reaching for it.
 */

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DropCharacter } from '../../avatar/DropCharacter';
import { useTheme } from '../../design/theme';
import { radius, space } from '../../design/tokens';
import { useMotion } from '../../design/useMotion';
import { HandFrame } from '../../drawing/HandFrame';
import { seedFromString } from '../../drawing/seededRandom';
import { copy } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';

export type UndoSnackbarProps = {
  /** The item that just landed in history. */
  label: string;
  onUndo: () => void;
};

const ENTER_MS = 200;
const REDUCED_MS = 120;
const SEED = seedFromString('result/undo-snackbar');

export function UndoSnackbar({ label, onUndo }: UndoSnackbarProps) {
  const { colors } = useTheme();
  const motion = useMotion();
  const insets = useSafeAreaInsets();

  const reveal = useSharedValue(0);

  useEffect(() => {
    reveal.value = withTiming(1, {
      duration: motion.reduceMotion ? REDUCED_MS : ENTER_MS,
    });
  }, [reveal, motion.reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * -12 }],
  }));

  return (
    <Animated.View
      style={[styles.root, { top: insets.top + space.md }, style]}
      pointerEvents="box-none"
    >
      <HandFrame
        seed={SEED}
        color={colors.inkFaint}
        radius={radius.lg}
        style={[styles.bar, { backgroundColor: colors.paper }]}
        contentStyle={styles.row}
      >
        {/*
          Drop is standing in the bar it just filled — the same character that
          presented the number, still on screen while the way back is open.
        */}
        <DropCharacter
          state="celebrating"
          size={34}
          seed={label}
          announce={false}
        />
        <Text variant="label" tone="ink" style={styles.label} numberOfLines={2}>
          {copy.result.confirmed(label)}
        </Text>
        <Touch
          onPress={onUndo}
          style={[styles.undo, { borderColor: colors.accent }]}
          accessibilityLabel={copy.result.undo}
          accessibilityHint={copy.result.undoHint}
        >
          <Text variant="label" tone="accent">
            {copy.result.undo}
          </Text>
        </Touch>
      </HandFrame>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: space.lg, right: space.lg },
  bar: { borderRadius: radius.lg, minHeight: 60 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.md,
    paddingRight: space.md,
    paddingVertical: space.sm,
    minHeight: 60,
  },
  label: { flex: 1 },
  undo: {
    minHeight: 44,
    minWidth: 72,
    borderWidth: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
});
