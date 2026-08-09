/**
 * The way from the camera to the record.
 *
 * It sits top-right, on its own scrim, because the bottom of the frame belongs
 * to the shutter and the bottom-left to the search control. It steps aside the
 * moment a result appears — that screen is a single decision, and a second door
 * during it is noise.
 *
 * The mark is three drawn strokes of falling length: a stack of days.
 */

import { Canvas, Skia } from '@shopify/react-native-skia';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spring } from '../../design/motion';
import { radius, space } from '../../design/tokens';
import { useMotion } from '../../design/useMotion';
import { HandPath } from '../../drawing/HandPath';
import { seedFromString } from '../../drawing/seededRandom';
import { copy } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { isResultVisible } from '../capture/types';
import { HandChip } from '../capture/HandChip';
import { useOverlayInk } from '../capture/overlay';
import { useCaptureMachine } from '../capture/useCaptureMachine';
import { useHistoryPulse } from './pulse';

const GLYPH = 16;
const SEED = seedFromString('history/tab');

/** How long the "+1" stays on the door after a save lands. */
const BADGE_HOLD_MS = 2200;

export function HistoryTab() {
  const overlayInk = useOverlayInk();
  const router = useRouter();
  const motion = useMotion();
  const state = useCaptureMachine((s) => s.state);
  const hidden = isResultVisible(state) || state.name === 'unresolved';
  const visibility = useSharedValue(hidden ? 0 : 1);

  useEffect(() => {
    visibility.value = withTiming(hidden ? 0 : 1, {
      duration: motion.reduceMotion ? 0 : 180,
    });
  }, [hidden, motion.reduceMotion, visibility]);

  // A native sheet freezes the camera beneath it. Snap the shared value back
  // to the current visibility endpoint when that camera regains focus.
  useFocusEffect(
    useCallback(() => {
      visibility.value = withTiming(hidden ? 0 : 1, {
        duration: motion.reduceMotion ? 0 : 180,
      });
    }, [hidden, motion.reduceMotion, visibility]),
  );

  const visibilityStyle = useAnimatedStyle(() => ({
    opacity: visibility.value,
    transform: [{ translateY: (1 - visibility.value) * -4 }],
  }));

  // A saved card lands on this door: the chip answers with a squeeze and a
  // "+1" that stays just long enough to say where the entry went.
  const pulseCount = useHistoryPulse((s) => s.count);
  const seenPulse = useRef(pulseCount);
  const pulseScale = useSharedValue(1);
  const badge = useSharedValue(0);

  useEffect(() => {
    if (pulseCount === seenPulse.current) return;
    seenPulse.current = pulseCount;

    if (!motion.reduceMotion) {
      pulseScale.value = withSequence(
        withTiming(1.12, { duration: 120 }),
        withSpring(1, spring.drop),
      );
    }
    badge.value = withSequence(
      withTiming(1, { duration: motion.reduceMotion ? 0 : 140 }),
      withDelay(BADGE_HOLD_MS, withTiming(0, { duration: motion.reduceMotion ? 0 : 220 })),
    );
    AccessibilityInfo.announceForAccessibility(copy.history.landed);
  }, [pulseCount, motion.reduceMotion, pulseScale, badge]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badge.value,
    transform: [{ scale: 0.8 + badge.value * 0.2 }],
  }));

  const stack = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    const lengths = [14, 10, 6];
    lengths.forEach((length, index) => {
      const y = 3 + index * 5;
      builder.moveTo(1, y).lineTo(1 + length, y);
    });
    return builder.detach();
  }, []);

  return (
    <Animated.View
      style={[styles.root, visibilityStyle]}
      pointerEvents={hidden ? 'none' : 'box-none'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <SafeAreaView pointerEvents="box-none" edges={['top']}>
        <View style={styles.align} pointerEvents="box-none">
          <Animated.View style={pulseStyle}>
          <HandChip
            seed="history/tab"
            onPress={() => router.push('/history')}
            accessibilityLabel={copy.history.open}
            accessibilityHint={copy.history.openHint}
          >
            <Canvas
              style={styles.glyph}
              pointerEvents="none"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <HandPath
                path={stack}
                color={overlayInk.mark}
                variant="pencil"
                seed={SEED}
                strokeScale={0.7}
              />
            </Canvas>
            <Text variant="label" tone={overlayInk.mark}>
              {copy.history.open}
            </Text>
          </HandChip>
          <Animated.View
            style={[
              styles.badge,
              {
                backgroundColor: overlayInk.scrim,
                borderColor: overlayInk.outline,
              },
              badgeStyle,
            ]}
            pointerEvents="none"
          >
            <Text variant="chip" tone={overlayInk.mark}>
              {copy.history.plusOne}
            </Text>
          </Animated.View>
          </Animated.View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0 },
  align: { alignItems: 'flex-end', paddingHorizontal: space.lg, paddingTop: space.md },
  glyph: { width: GLYPH, height: GLYPH },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
});
