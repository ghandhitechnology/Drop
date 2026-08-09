import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '../../design/theme';
import { MIN_TOUCH_SIZE, radius, space } from '../../design/tokens';
import { useMotion } from '../../design/useMotion';
import { HandFrame } from '../../drawing/HandFrame';
import { copy } from '../../lib/copy';
import { tapSelection } from '../../lib/haptics';
import { SketchLink } from '../../ui/SketchLink';
import { Text } from '../../ui/Text';
import { useUsage } from '../usage';

const TICKS = 20;

export function UsageCard() {
  const { colors } = useTheme();
  const motion = useMotion();
  const status = useUsage((state) => state.status);
  const snapshot = useUsage((state) => state.snapshot);
  const refreshing = useUsage((state) => state.refreshing);
  const refresh = useUsage((state) => state.refresh);
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useSharedValue(0);

  const visibleSnapshot = status === 'stale' ? null : snapshot;
  const used = visibleSnapshot?.used ?? 0;
  const limit = visibleSnapshot?.limit ?? TICKS;
  const remaining = visibleSnapshot?.remaining ?? limit;
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;

  useEffect(() => {
    progress.value = withTiming(ratio, {
      duration: motion.reduceMotion ? 0 : 240,
    });
  }, [motion.reduceMotion, progress, ratio]);

  const fillStyle = useAnimatedStyle(() => ({
    width: trackWidth * progress.value,
  }));
  const markerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, trackWidth * progress.value - 7) }, { rotate: '45deg' }],
    opacity: progress.value > 0 ? 1 : 0,
  }));

  const press = () => {
    tapSelection();
    refresh().catch(() => {});
  };

  const supporting = !visibleSnapshot
    ? copy.usage.checking
    : remaining === 0
      ? copy.usage.full
      : copy.usage.left(remaining);

  return (
    <HandFrame
      seed={719_204}
      variant="crayon"
      color={colors.accent}
      radius={radius.lg}
      style={[styles.frame, { backgroundColor: colors.accentSoft }]}
      contentStyle={styles.content}
    >
      <Pressable onPress={press} accessible={false} style={styles.pressable}>
        <View style={styles.topline}>
          <View style={styles.words}>
            <Text variant="title" tone="ink" style={styles.count}>
              {visibleSnapshot ? copy.usage.count(used, limit) : copy.usage.checkingCount}
            </Text>
            <Text variant="label" tone="inkSoft">
              {supporting}
            </Text>
          </View>
          <View style={[styles.drop, { backgroundColor: colors.accent }]} />
        </View>

        <View
          style={[styles.track, { backgroundColor: colors.bg, borderColor: colors.inkFaint }]}
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={copy.usage.title}
          accessibilityValue={{
            min: 0,
            max: limit,
            now: used,
            text: copy.usage.progress(used, limit),
          }}
        >
          <Animated.View style={[styles.fill, { backgroundColor: colors.accent }, fillStyle]} />
          {Array.from({ length: TICKS - 1 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.tick,
                {
                  left: `${((index + 1) / TICKS) * 100}%`,
                  backgroundColor: colors.inkFaint,
                  transform: [{ rotate: index % 2 === 0 ? '-4deg' : '3deg' }],
                },
              ]}
            />
          ))}
          <Animated.View style={[styles.marker, { backgroundColor: colors.accent }, markerStyle]} />
        </View>
      </Pressable>

      <View style={styles.footer}>
        <Pressable onPress={press} accessible={false} style={styles.resetTap}>
          <Text variant="chip" tone="inkSoft">
            {status === 'error' && snapshot ? copy.usage.cached : copy.usage.reset}
          </Text>
        </Pressable>
        <SketchLink
          onPress={press}
          seed="settings/usage/refresh"
          variant="label"
          accessibilityLabel={copy.usage.refresh}
          accessibilityHint={copy.usage.refreshHint}
          accessibilityState={{ busy: refreshing }}
          style={styles.refresh}
        >
          {refreshing ? copy.usage.checking : copy.usage.refresh}
        </SketchLink>
      </View>
    </HandFrame>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, overflow: 'hidden' },
  content: { padding: space.lg, gap: space.md },
  pressable: { gap: space.md },
  topline: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  words: { flex: 1, gap: 2 },
  count: { fontVariant: ['tabular-nums'] },
  drop: {
    width: 18,
    height: 18,
    borderRadius: 12,
    transform: [{ rotate: '45deg' }],
    marginTop: space.sm,
    borderTopLeftRadius: 3,
  },
  track: {
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.88 },
  tick: { position: 'absolute', top: 3, bottom: 3, width: 1 },
  marker: {
    position: 'absolute',
    left: 0,
    width: 14,
    height: 14,
    borderRadius: 8,
    borderTopLeftRadius: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    minHeight: MIN_TOUCH_SIZE,
  },
  refresh: { minHeight: MIN_TOUCH_SIZE, justifyContent: 'center' },
  resetTap: { flex: 1, minHeight: MIN_TOUCH_SIZE, justifyContent: 'center' },
});
