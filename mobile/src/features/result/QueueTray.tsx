/**
 * The tray, under the History door.
 *
 * Cards swiped to the right land here and wait. Nothing in the tray has been
 * written — a plate is one row, so the whole pile is held until the run ends
 * and then goes in with a single insert. The tray is what makes that holding
 * visible: it counts, it sits on the route the saved card will take, and it
 * says "to add" rather than anything that would imply the work is done.
 *
 * It has no buttons. Sorting happens on the pile; this only reports.
 */

import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '../../design/theme';
import { radius, space } from '../../design/tokens';
import { HandFrame } from '../../drawing/HandFrame';
import { seedFromString } from '../../drawing/seededRandom';
import { copy } from '../../lib/copy';
import { Text } from '../../ui/Text';

const TRAY_SEED = seedFromString('result/the-tray');

/** Its own height, so the stage can hang it off a centre line. */
export const TRAY_HEIGHT = 30;

export type QueueTrayProps = {
  /** How many cards are waiting. Nothing is drawn at zero. */
  count: number;
  /** Centre line to hang from, in stage coordinates. */
  top: number;
  /** Bumped as each card lands, the same greeting the print gives. */
  pulse: SharedValue<number>;
  /** The stage's exit. The tray leaves with everything else. */
  dissolve: SharedValue<number>;
};

export function QueueTray({ count, top, pulse, dissolve }: QueueTrayProps) {
  const { colors } = useTheme();

  const style = useAnimatedStyle(() => ({
    opacity: 1 - dissolve.value,
    transform: [{ scale: pulse.value }],
  }));

  if (count <= 0) return null;

  return (
    <Animated.View
      style={[styles.root, { top: top - TRAY_HEIGHT / 2 }, style]}
      pointerEvents="none"
      // One live region rather than a button: the count changes under the
      // person's own thumb, so it should be heard, not visited.
      accessibilityLiveRegion="polite"
      accessibilityRole="text"
      accessibilityLabel={copy.result.tray(count)}
    >
      <HandFrame
        seed={TRAY_SEED}
        variant="crayon"
        color={colors.accent}
        radius={radius.pill}
        strokeScale={0.8}
        style={styles.frame}
        contentStyle={styles.content}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.wash, { backgroundColor: colors.accentSoft }]}
        />
        <Text variant="chip" tone="accent">
          {copy.result.tray(count)}
        </Text>
      </HandFrame>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', right: space.lg },
  frame: { minHeight: TRAY_HEIGHT },
  content: {
    minHeight: TRAY_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  wash: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderRadius: radius.pill,
  },
});
