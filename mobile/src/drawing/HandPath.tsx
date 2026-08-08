import {
  Blur,
  CornerPathEffect,
  DiscretePathEffect,
  Group,
  Path,
  type SkPath,
} from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

export type HandVariant = 'pencil' | 'crayon';

/** A value that may be driven by Reanimated. Skia reads shared values directly. */
type Animatable<T> = T | SharedValue<T>;

export type HandPathProps = {
  /** The clean geometry. All roughness is applied as a path effect on top. */
  path: SkPath | string;
  color: string;
  /**
   * 'pencil' draws a firm line with one ghost pass.
   * 'crayon' adds a soft, wide, blurred underlay for a waxy edge.
   */
  variant?: HandVariant;
  /** Stable seed — derive from an item id so a mark never redraws differently. */
  seed?: number;
  /** Multiplies every stroke width, for scaling a mark up or down as a set. */
  strokeScale?: number;
  /** Path-trim window. Animate `end` 0 → 1 to draw the stroke on. */
  start?: Animatable<number>;
  end?: Animatable<number>;
  opacity?: Animatable<number>;
};

const CAP = 'round' as const;
const JOIN = 'round' as const;

/**
 * One clean path, drawn as 2–3 offset passes with a discrete (jittered) path
 * effect. This is the single source of Drop's hand-drawn line.
 *
 * Passes, back to front:
 *   3. crayon underlay — wide, blurred, barely there (crayon variant only)
 *   2. ghost pass      — thinner, faint, nudged down-right, coarser jitter
 *   1. main pass       — full opacity, the line you actually read
 *
 * `CornerPathEffect` is composed inside each jitter so the discrete segments
 * join as soft corners instead of hard chevrons.
 */
export function HandPath({
  path,
  color,
  variant = 'pencil',
  seed = 1,
  strokeScale = 1,
  start = 0,
  end = 1,
  opacity,
}: HandPathProps) {
  const shared = { path, start, end, style: 'stroke' as const, color, strokeCap: CAP, strokeJoin: JOIN };

  return (
    <Group opacity={opacity}>
      {variant === 'crayon' && (
        <Path {...shared} strokeWidth={3.4 * strokeScale} opacity={0.12}>
          <Blur blur={1.2} />
          <DiscretePathEffect length={11} deviation={2.6} seed={seed + 13}>
            <CornerPathEffect r={2} />
          </DiscretePathEffect>
        </Path>
      )}

      <Group transform={[{ translateX: 0.6 }, { translateY: 0.9 }]}>
        <Path {...shared} strokeWidth={1.6 * strokeScale} opacity={0.34}>
          <DiscretePathEffect length={5} deviation={1.8} seed={seed + 7}>
            <CornerPathEffect r={2} />
          </DiscretePathEffect>
        </Path>
      </Group>

      <Path {...shared} strokeWidth={2.2 * strokeScale} opacity={1}>
        <DiscretePathEffect length={7} deviation={1.1} seed={seed}>
          <CornerPathEffect r={2} />
        </DiscretePathEffect>
      </Path>
    </Group>
  );
}
