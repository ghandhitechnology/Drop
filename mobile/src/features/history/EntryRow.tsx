/**
 * One thing you drank, ate, or rode.
 *
 * The row is a single spoken node — Drop, the label, the amount, the litres and
 * the match all read as one sentence rather than five stops. The swipe is the
 * quick way to take something out; the same action is offered as a screen
 * reader action, because a gesture nobody can see is not an affordance.
 *
 * Removal is confirmed by the person, and the way back stays open for five
 * seconds afterwards. Nothing here writes without that.
 */

import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { DropCharacter } from '../../avatar';
import { useTheme } from '../../design/theme';
import { space } from '../../design/tokens';
import { useMotion } from '../../design/useMotion';
import { seedFromString, seededRange } from '../../drawing/seededRandom';
import { confidenceChip, copy } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';
import type { Entry } from '../../data/types';
import { litresShort, litresSpoken, quantityText } from './format';

/** Drop, in the margin. Small enough that its idle loops stay switched off. */
const AVATAR = 24;
/** How far the row travels before the take-out reveal is fully open. */
const REVEAL = 104;
/** Past this the release removes rather than springs back. */
const TRIGGER = 72;
/** How far a row is allowed to lean, in degrees. */
const TILT = 6;

export type EntryRowProps = {
  entry: Entry;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
};

export function EntryRow({ entry, onOpen, onRemove }: EntryRowProps) {
  const { colors } = useTheme();
  const motion = useMotion();
  const { width: screenWidth } = useWindowDimensions();

  const translateX = useSharedValue(0);

  const tilt = useMemo(
    () => seededRange(seedFromString(entry.id), -TILT, TILT)(),
    [entry.id],
  );

  const amount = quantityText(entry.quantity_value, entry.quantity_unit);
  const chip = confidenceChip(entry.confidence);

  const spoken = copy.history.line(
    entry.item_label,
    amount,
    litresSpoken(entry.litres),
    chip,
  );

  const exitMs = motion.ms('quick') || 1;
  const springConfig = motion.springOf('card');

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Horizontal intent only: a vertical drag belongs to the list.
        .activeOffsetX([-14, 14])
        .failOffsetY([-10, 10])
        .onUpdate((event) => {
          // eslint-disable-next-line react-hooks/immutability -- This callback is a Reanimated worklet mutating animation state.
          translateX.value = Math.max(-REVEAL, Math.min(0, event.translationX));
        })
        .onEnd(() => {
          if (translateX.value <= -TRIGGER) {
            // eslint-disable-next-line react-hooks/immutability -- This callback is a Reanimated worklet mutating animation state.
            translateX.value = withTiming(
              -screenWidth,
              { duration: exitMs },
              (finished) => {
                if (finished) runOnJS(onRemove)(entry.id);
              },
            );
          } else {
            translateX.value = withSpring(0, springConfig);
          }
        }),
    [translateX, screenWidth, exitMs, springConfig, onRemove, entry.id],
  );

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const revealStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, -translateX.value / TRIGGER),
  }));

  /*
   * The detector wraps the plain outer view, never the animated one it moves.
   * A worklet gesture makes GestureDetector wrap its child in an *animated*
   * clone, and an animated clone of an Animated.View measures to nothing here —
   * the row rendered zero-height and the whole list came out blank. Handing it
   * an ordinary View and animating a child instead is both the fix and the
   * conventional shape for a swipeable row.
   */
  return (
    <GestureDetector gesture={pan}>
      <View style={styles.root}>
        <Animated.View
          style={[styles.reveal, revealStyle]}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Text variant="label" tone="inkSoft">
            {copy.history.removeAction}
          </Text>
        </Animated.View>

        <Animated.View style={[frontStyle, { backgroundColor: colors.bg }]}>
          <Touch
            onPress={() => onOpen(entry.id)}
            accessible
            accessibilityLabel={spoken}
            accessibilityHint={copy.history.entryHint}
            accessibilityActions={[
              { name: 'delete', label: copy.history.removeHint },
            ]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'delete') onRemove(entry.id);
            }}
            style={styles.row}
          >
            <View
              style={styles.inner}
              importantForAccessibility="no-hide-descendants"
            >
              {/*
                Drop is decoration here: the row's own sentence already carries
                everything. An empty label is what actually takes the avatar out
                of the screen reader's path — hiding a descendant that sets
                `accessible` itself does nothing on this platform, so the row
                would otherwise read twice, once as itself and once as "Drop is
                resting".
              */}
              <View
                style={[styles.avatar, { transform: [{ rotate: `${tilt}deg` }] }]}
              >
                <DropCharacter
                  state="resting"
                  size={AVATAR}
                  seed={entry.id}
                  announce={false}
                  label=""
                />
              </View>

              <View style={styles.body}>
                <Text variant="body" tone="ink" numberOfLines={1}>
                  {entry.item_label}
                </Text>
                <View style={styles.meta}>
                  <Text variant="label" tone="inkSoft">
                    {amount}
                  </Text>
                  <ConfidencePill word={chip} />
                </View>
              </View>

              <Text variant="label" tone="ink" style={styles.litres}>
                {litresShort(entry.litres)}
              </Text>
            </View>
          </Touch>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/**
 * How well the match landed, in two words.
 *
 * The full drawn chip with its arc belongs on the record page, where there is
 * one of them. In a list of a hundred rows the words carry it alone — and the
 * row costs one canvas instead of three.
 */
function ConfidencePill({ word }: { word: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pill, { borderColor: colors.inkFaint }]}>
      <Text variant="chip" tone="inkSoft">
        {word}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
  reveal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: space.xl,
  },
  row: { minHeight: 64, justifyContent: 'center' },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
  avatar: { width: AVATAR, height: AVATAR },
  body: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: space.sm,
    paddingVertical: 1,
  },
  litres: { fontSize: 16, fontVariant: ['tabular-nums'] },
});
