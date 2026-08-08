import {
  Canvas,
  Picture,
  Skia,
  createPicture,
  rect,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';

import { usePreferences } from '../design/preferences';
import { useTheme } from '../design/theme';

/** Grain strength per scheme. Enough to feel like paper, never enough to read. */
export const GRAIN_ALPHA = { light: 0.03, dark: 0.05 } as const;

/**
 * Desaturate the turbulence RGB to a single luminance value and force a
 * constant alpha. Rows are R, G, B, A — each [r, g, b, a, offset].
 */
function grainColorMatrix(alpha: number): number[] {
  const L = [0.2126, 0.7152, 0.0722, 0, 0];
  return [...L, ...L, ...L, 0, 0, 0, 0, alpha];
}

export type GrainProps = {
  /** Overrides the per-scheme default alpha. */
  alpha?: number;
  /** Noise scale. Lower is coarser. */
  frequency?: number;
  seed?: number;
};

/**
 * A full-screen paper grain, rasterised once into a Skia Picture and replayed.
 *
 * Recording the noise into a Picture means the turbulence shader is evaluated
 * against a stable set of draw commands rather than being rebuilt per frame,
 * and the layer is purely decorative — it sits behind everything, ignores
 * touches, and carries no meaning of its own.
 *
 * Because it carries no meaning, "Reduce texture" simply takes it away: the
 * surface goes flat and every word on top of it stays exactly where it was.
 */
export function Grain({ alpha, frequency = 0.9, seed = 4 }: GrainProps) {
  const { scheme } = useTheme();
  const { width, height } = useWindowDimensions();
  const texture = usePreferences((s) => s.texture);
  const strength = alpha ?? GRAIN_ALPHA[scheme];

  const picture = useMemo(() => {
    const bounds = rect(0, 0, width, height);
    return createPicture((canvas) => {
      const paint = Skia.Paint();
      paint.setShader(
        Skia.Shader.MakeTurbulence(
          frequency,
          frequency,
          3,
          seed,
          width,
          height,
        ),
      );
      paint.setColorFilter(
        Skia.ColorFilter.MakeMatrix(grainColorMatrix(strength)),
      );
      canvas.drawRect(bounds, paint);
    }, bounds);
  }, [width, height, strength, frequency, seed]);

  if (!texture) return null;

  return (
    <Canvas
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Picture picture={picture} />
    </Canvas>
  );
}
