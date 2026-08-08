/**
 * The two small marks the beat sequence needs: the chevron that hints at the
 * pull, and the tick that lands the confirmation.
 *
 * Both are drawn with the same pencil as every other line in Drop, and both
 * live inside a canvas that is hidden from the screen reader — the words for
 * them sit in real text alongside.
 */

import { Group, Skia, type SkPath, type Transforms3d } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { HandPath } from '../../drawing/HandPath';
import { checkPath, type Box } from './silhouette';

/* -------------------------------------------------------------- chevron */

export type PullChevronProps = {
  /** Centre of the mark, in stage coordinates. */
  cx: number;
  cy: number;
  width: number;
  color: string;
  seed: number;
  expansion: SharedValue<number>;
  reduceMotion: boolean;
};

/** One full rise-and-fall of the hint. */
const BOB_MS = 1500;
/** How far the chevron lifts, in dp. */
const BOB_RISE = 5;

/**
 * A chevron pointing the way up, breathing gently.
 *
 * It is the only thing on screen that moves while Drop waits, so it reads as
 * an invitation rather than as a busy indicator. It fades out as soon as the
 * expansion starts, because by then the gesture is already understood.
 */
export function PullChevron({
  cx,
  cy,
  width,
  color,
  seed,
  expansion,
  reduceMotion,
}: PullChevronProps) {
  const bob = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(bob);
    if (reduceMotion) {
      bob.value = 0.5;
      return;
    }
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: BOB_MS / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: BOB_MS / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(bob);
  }, [bob, reduceMotion]);

  const path = useMemo(() => {
    const half = width / 2;
    const rise = width * 0.32;
    return Skia.PathBuilder.Make()
      .moveTo(cx - half, cy + rise / 2)
      .lineTo(cx, cy - rise / 2)
      .lineTo(cx + half, cy + rise / 2)
      .detach();
  }, [cx, cy, width]);

  const transform = useDerivedValue(() => [
    { translateY: -bob.value * BOB_RISE },
  ]);

  const opacity = useDerivedValue(() =>
    interpolate(expansion.value, [0, 0.18], [0.9, 0], Extrapolation.CLAMP),
  );

  return (
    // Skia resolves the shared value on the group's transform each frame.
    <Group transform={transform as unknown as Transforms3d}>
      <HandPath
        path={path}
        color={color}
        variant="pencil"
        seed={seed}
        strokeScale={1.1}
        opacity={opacity}
      />
    </Group>
  );
}

/* ----------------------------------------------------------------- tick */

export type ConfirmMarkProps = {
  box: Box;
  color: string;
  seed: number;
  /** 0 → 1 as the mark draws itself on. */
  progress: SharedValue<number>;
};

/** One stroke, drawn on. It arrives with the success haptic, never before it. */
export function ConfirmMark({ box, color, seed, progress }: ConfirmMarkProps) {
  const path = useMemo<SkPath>(() => checkPath(box), [box]);

  const opacity = useDerivedValue(() =>
    interpolate(progress.value, [0, 0.08, 0.86, 1], [0, 1, 1, 0.65], Extrapolation.CLAMP),
  );

  return (
    <HandPath
      path={path}
      color={color}
      variant="crayon"
      seed={seed}
      strokeScale={2.4}
      end={progress}
      opacity={opacity}
    />
  );
}
