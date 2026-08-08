import { Canvas, Skia, rect, rrect } from '@shopify/react-native-skia';
import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { useColors } from '../design/theme';
import { HandPath, type HandVariant } from './HandPath';
import { mulberry32 } from './seededRandom';

export type HandFrameProps = {
  children?: ReactNode;
  /** Stable seed so a given card's frame is always the same hand-drawn shape. */
  seed?: number;
  variant?: HandVariant;
  /** Token colour string. Defaults to the theme's faint ink. */
  color?: string;
  radius?: number;
  strokeScale?: number;
  /** Path-trim end, for drawing the frame on. */
  end?: number | SharedValue<number>;
  style?: ViewStyle | ViewStyle[];
  contentStyle?: ViewStyle | ViewStyle[];
};

/** Inset so the widest stroke pass stays inside the canvas bounds. */
const INSET = 4;

/**
 * A sketched rounded-rectangle frame drawn around its children.
 *
 * The rectangle itself is clean geometry — the hand-drawn quality comes from
 * HandPath's jitter passes, plus a small seeded variation in the corner radius
 * so no two frames are traced identically.
 */
export function HandFrame({
  children,
  seed = 3,
  variant = 'pencil',
  color,
  radius = 18,
  strokeScale = 1,
  end = 1,
  style,
  contentStyle,
}: HandFrameProps) {
  const colors = useColors();
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current.width === width && current.height === height
        ? current
        : { width, height },
    );
  };

  const path = useMemo(() => {
    if (size.width <= INSET * 2 || size.height <= INSET * 2) return null;
    // A touch of seeded slack in the radius keeps frames from looking stamped.
    const wobble = mulberry32(seed)();
    const r = radius * (0.88 + wobble * 0.24);
    return Skia.Path.RRect(
      rrect(
        rect(INSET, INSET, size.width - INSET * 2, size.height - INSET * 2),
        r,
        r,
      ),
    );
  }, [size.width, size.height, radius, seed]);

  return (
    <View style={style} onLayout={onLayout}>
      {path && (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <HandPath
            path={path}
            color={color ?? colors.inkFaint}
            variant={variant}
            seed={seed}
            strokeScale={strokeScale}
            end={end}
          />
        </Canvas>
      )}
      <View style={contentStyle}>{children}</View>
    </View>
  );
}
