import {
  Blur,
  Canvas,
  Image as SkiaImage,
  useImage,
} from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useMotion } from '../../design/useMotion';
import { RESULT_BLUR, RESULT_DIM } from './overlay';

export type FrozenFrameProps = {
  uri: string;
  width: number;
  height: number;
  /** True from `presenting` onward: the frame steps back so the number leads. */
  dimmed: boolean;
};

/**
 * The held frame.
 *
 * Two layers, on purpose. A plain RN image lands the instant the photo is
 * written, so the preview appears to freeze rather than flicker. A Skia copy
 * fades in on top carrying the blur, which is what lets the result read as a
 * card floating over the moment it came from.
 *
 * Both are decoration — the meaning is in the text above them.
 */
export function FrozenFrame({ uri, width, height, dimmed }: FrozenFrameProps) {
  const motion = useMotion();
  const image = useImage(uri);

  const reveal = useSharedValue(0);

  useEffect(() => {
    reveal.value = withTiming(dimmed ? 1 : 0, { duration: motion.ms('settle') });
  }, [dimmed, reveal, motion]);

  const blurStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: reveal.value * RESULT_DIM }));

  return (
    <>
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      />

      {image && width > 0 && height > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, blurStyle]} pointerEvents="none">
          <Canvas
            style={StyleSheet.absoluteFill}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <SkiaImage image={image} x={0} y={0} width={width} height={height} fit="cover">
              <Blur blur={RESULT_BLUR} mode="clamp" />
            </SkiaImage>
          </Canvas>
        </Animated.View>
      )}

      <Animated.View
        style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}
        pointerEvents="none"
      />
    </>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: '#000000' },
});
