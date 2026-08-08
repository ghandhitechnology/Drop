/**
 * Today's figure, at the top of the record.
 *
 * The number never counts up. When a removal changes it, the new figure settles
 * in place over 140ms — long enough to notice that something moved, short
 * enough that the answer is already there when the eye arrives.
 *
 * The underline is drawn rather than ruled: one crayon stroke with a little sag
 * in the middle, trimmed on when the screen first appears.
 */

import { Canvas, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../../design/theme';
import { space } from '../../design/tokens';
import { useMotion } from '../../design/useMotion';
import { HandPath } from '../../drawing/HandPath';
import { seedFromString } from '../../drawing/seededRandom';
import { copy, formatLitres } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { litresSpoken } from './format';

const UNDERLINE_HEIGHT = 14;
/** How far the middle of the stroke droops below its ends. */
const SAG = 5;
const SEED = seedFromString('history/underline');

export type TodayHeaderProps = {
  litres: number;
};

export function TodayHeader({ litres }: TodayHeaderProps) {
  const { colors } = useTheme();
  const motion = useMotion();
  const [width, setWidth] = useState(0);

  const value = formatLitres(litres);

  /* The figure settles rather than animating. One fade, 140ms, no counting. */
  const settle = useSharedValue(1);
  useEffect(() => {
    settle.value = 0;
    settle.value = withTiming(1, { duration: motion.ms('quick') });
  }, [settle, value, motion]);

  const settleStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + settle.value * 0.55,
    transform: [{ translateY: (1 - settle.value) * 3 }],
  }));

  /* The underline draws itself on, once. */
  const drawn = useSharedValue(0);
  useEffect(() => {
    drawn.value = withTiming(1, { duration: motion.ms('draw') || 1 });
  }, [drawn, motion]);

  const path = useMemo(() => {
    if (width <= 0) return null;
    const y = UNDERLINE_HEIGHT / 2 - 2;
    return Skia.PathBuilder.Make()
      .moveTo(2, y)
      .quadTo(width / 2, y + SAG, width - 2, y + 1)
      .detach();
  }, [width]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (current === next ? current : next));
  };

  return (
    <View style={styles.root}>
      <Text variant="axis" tone="inkSoft">
        {copy.history.today}
      </Text>

      <Animated.View
        style={[styles.figure, settleStyle]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={copy.history.todayLine(litresSpoken(litres))}
      >
        <Text variant="hero" tone="ink" style={styles.number}>
          {value}
        </Text>
        <Text variant="heroUnit" tone="inkSoft" style={styles.unit}>
          {copy.result.unit}
        </Text>
      </Animated.View>

      <View style={styles.underline} onLayout={onLayout}>
        {path && (
          <Canvas
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <HandPath
              path={path}
              color={colors.accent}
              variant="crayon"
              seed={SEED}
              strokeScale={1.3}
              end={drawn}
            />
          </Canvas>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  number: { fontVariant: ['tabular-nums'] },
  unit: { paddingBottom: space.xs },
  underline: { height: UNDERLINE_HEIGHT, alignSelf: 'stretch' },
});
