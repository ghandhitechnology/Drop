/**
 * The way from the camera to settings.
 *
 * Top-left, mirroring the record's door on the right, on the same scrim and
 * under the same rule: both step aside the moment a result is on screen, because
 * that screen is a single decision and a second door during it is noise.
 *
 * The mark is three sliders — three lines, each crossed by a handle at a
 * different point along it. Deliberately unlike the record's stack of days:
 * the two doors sit at opposite ends of the same row and a thumb reaching for
 * one should never have to read a label to know which it found.
 */
import { Canvas, Skia } from '@shopify/react-native-skia';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { space } from '../../design/tokens';
import { useMotion } from '../../design/useMotion';
import { HandPath } from '../../drawing/HandPath';
import { seedFromString } from '../../drawing/seededRandom';
import { copy } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { HandChip } from '../capture/HandChip';
import { useOverlayInk } from '../capture/overlay';
import { isResultVisible } from '../capture/types';
import { useCaptureMachine } from '../capture/useCaptureMachine';

const GLYPH = 16;
const SEED = seedFromString('settings/tab');

export function SettingsTab() {
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

  // Native form sheets can freeze their presenting screen mid-transition.
  // Reassert the current endpoint when the camera regains focus so an opacity
  // value captured at zero can never strand the door off-screen.
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

  const sliders = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    // [track y, handle x] — the handles sit at different points so the mark
    // reads as three settings rather than three lines.
    const rows: [number, number][] = [
      [3, 5],
      [8, 10.5],
      [13, 6],
    ];
    rows.forEach(([y, x]) => {
      builder.moveTo(1, y).lineTo(15, y);
      builder.moveTo(x, y - 2.4).lineTo(x, y + 2.4);
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
          <HandChip
            seed="settings/tab"
            onPress={() => router.push('/settings')}
            accessibilityLabel={copy.settings.open}
            accessibilityHint={copy.settings.openHint}
          >
            <Canvas
              style={styles.glyph}
              pointerEvents="none"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <HandPath
                path={sliders}
                color={overlayInk.mark}
                variant="pencil"
                seed={SEED}
                strokeScale={0.7}
              />
            </Canvas>
            <Text variant="label" tone={overlayInk.mark}>
              {copy.settings.open}
            </Text>
          </HandChip>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0 },
  align: { alignItems: 'flex-start', paddingHorizontal: space.lg, paddingTop: space.md },
  glyph: { width: GLYPH, height: GLYPH },
});
