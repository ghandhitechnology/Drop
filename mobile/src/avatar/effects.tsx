import { Group, Skia, type SkPath } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { HandPath } from '../drawing/HandPath';
import { mulberry32 } from '../drawing/seededRandom';

/**
 * The marks that orbit Drop.
 *
 * Both effects are drawn with HandPath, so the ripple and the sparks come off
 * the same pencil as every frame and underline in the app.
 */

const TAU = Math.PI * 2;

/** One full orbit of the thinking ripple. */
const ORBIT_MS = 3200;
/** One pass across the three rim dashes. */
const TICK_MS = 1080;
/** The celebration burst, start to fully erased. */
export const BURST_MS = 500;

/* ------------------------------------------------------------- thinking */

export type ThinkingRippleProps = {
  cx: number;
  cy: number;
  /** Orbit radius in dp. */
  radius: number;
  color: string;
  /** Scales stroke weight with the avatar. */
  strokeScale: number;
  seed: number;
  reduceMotion: boolean;
};

/**
 * A single arc chasing its way around Drop, with three rim dashes ticking
 * underneath it. Still motion holds the arc at rest and the dashes lit, so the
 * state still reads without anything moving.
 */
export function ThinkingRipple({
  cx,
  cy,
  radius,
  color,
  strokeScale,
  seed,
  reduceMotion,
}: ThinkingRippleProps) {
  const orbit = useSharedValue(reduceMotion ? -0.28 : 0);
  const tick = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(orbit);
      cancelAnimation(tick);
      // Parked at a readable angle rather than at the seam.
      orbit.value = -0.28;
      tick.value = 0;
      return;
    }
    orbit.value = 0;
    orbit.value = withRepeat(
      withTiming(1, { duration: ORBIT_MS, easing: Easing.linear }),
      -1,
      false,
    );
    tick.value = 0;
    tick.value = withRepeat(
      withTiming(1, { duration: TICK_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(orbit);
      cancelAnimation(tick);
    };
  }, [reduceMotion, orbit, tick]);

  const circle = useMemo(
    () => Skia.PathBuilder.Make().addCircle(cx, cy, radius).detach(),
    [cx, cy, radius],
  );

  const spin = useDerivedValue(() => [{ rotate: orbit.value * TAU }]);

  // The arc lengthens and shortens as it travels — the chase.
  const arcEnd = useDerivedValue(() => {
    'worklet';
    return 0.16 + Math.sin(orbit.value * TAU * 2) * 0.05;
  });

  return (
    <>
      <Group transform={spin} origin={{ x: cx, y: cy }}>
        <HandPath
          path={circle}
          color={color}
          variant="pencil"
          seed={seed}
          strokeScale={strokeScale}
          start={0}
          end={arcEnd}
        />
      </Group>

      {RIM_ANGLES.map((angle, index) => (
        <RimDash
          key={angle}
          cx={cx}
          cy={cy}
          radius={radius}
          angle={angle}
          index={index}
          color={color}
          strokeScale={strokeScale}
          seed={seed + index * 17}
          tick={tick}
          reduceMotion={reduceMotion}
        />
      ))}
    </>
  );
}

/** Upper-right rim, where the eye already is after reading a pose. */
const RIM_ANGLES = [-1.32, -0.96, -0.6];

type RimDashProps = {
  cx: number;
  cy: number;
  radius: number;
  angle: number;
  index: number;
  color: string;
  strokeScale: number;
  seed: number;
  tick: { value: number };
  reduceMotion: boolean;
};

function RimDash({
  cx,
  cy,
  radius,
  angle,
  index,
  color,
  strokeScale,
  seed,
  tick,
  reduceMotion,
}: RimDashProps) {
  const path = useMemo(() => {
    // Proportional to the orbit rather than to the stroke, so the dashes stay
    // inside the canvas at every avatar size.
    const inner = radius * 1.1;
    const outer = radius * 1.21;
    return Skia.PathBuilder.Make()
      .moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
      .lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
      .detach();
  }, [cx, cy, radius, angle]);

  const opacity = useDerivedValue(() => {
    'worklet';
    if (reduceMotion) return 0.55;
    const phase = (tick.value - index / RIM_ANGLES.length + 1) % 1;
    // Quick pop, slow decay — a tick rather than a pulse.
    return phase < 0.15
      ? 0.25 + (phase / 0.15) * 0.75
      : 1 - ((phase - 0.15) / 0.85) * 0.75;
  });

  return (
    <HandPath
      path={path}
      color={color}
      variant="pencil"
      seed={seed}
      strokeScale={strokeScale * 0.85}
      opacity={opacity}
    />
  );
}

/* ---------------------------------------------------------- celebrating */

export type CelebrationSparksProps = {
  cx: number;
  cy: number;
  /** Distance from centre where the sparks begin. */
  radius: number;
  color: string;
  strokeScale: number;
  seed: number;
  /** 0 → 1 across BURST_MS, driven by the avatar. */
  burst: { value: number };
};

const SPARK_COUNT = 5;
const STAGGER = 0.07;

/** Five crayon strokes flung outward, each erasing itself behind the tip. */
export function CelebrationSparks({
  cx,
  cy,
  radius,
  color,
  strokeScale,
  seed,
  burst,
}: CelebrationSparksProps) {
  const sparks = useMemo(
    () => buildSparks(cx, cy, radius, seed),
    [cx, cy, radius, seed],
  );

  return (
    <>
      {sparks.map((path, index) => (
        <Spark
          key={index}
          path={path}
          index={index}
          color={color}
          strokeScale={strokeScale}
          seed={seed + index * 31}
          burst={burst}
        />
      ))}
    </>
  );
}

function buildSparks(
  cx: number,
  cy: number,
  radius: number,
  seed: number,
): SkPath[] {
  const random = mulberry32(seed >>> 0);
  const paths: SkPath[] = [];

  for (let i = 0; i < SPARK_COUNT; i += 1) {
    // Fanned across the top half, with seeded slack so no two bursts match.
    const spread = Math.PI * 1.15;
    const angle = -Math.PI * 1.08 + (i / (SPARK_COUNT - 1)) * spread + (random() - 0.5) * 0.22;
    const inner = radius * (0.92 + random() * 0.14);
    const outer = inner + radius * (0.3 + random() * 0.22);
    const bend = (random() - 0.5) * radius * 0.34;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const midR = (inner + outer) / 2;

    paths.push(
      Skia.PathBuilder.Make()
        .moveTo(cx + cos * inner, cy + sin * inner)
        .quadTo(
          cx + cos * midR - sin * bend,
          cy + sin * midR + cos * bend,
          cx + cos * outer,
          cy + sin * outer,
        )
        .detach(),
    );
  }

  return paths;
}

type SparkProps = {
  path: SkPath;
  index: number;
  color: string;
  strokeScale: number;
  seed: number;
  burst: { value: number };
};

/**
 * The tip runs ahead of the tail. `end` reaches 1 first, then `start` catches
 * up, which draws the stroke on and rubs it out in one pass.
 */
function Spark({ path, index, color, strokeScale, seed, burst }: SparkProps) {
  const span = 1 - STAGGER * (SPARK_COUNT - 1);
  const offset = STAGGER * index;

  const end = useDerivedValue(() => {
    'worklet';
    const p = Math.min(1, Math.max(0, (burst.value - offset) / span));
    return Math.min(1, p * 1.8);
  });

  const start = useDerivedValue(() => {
    'worklet';
    const p = Math.min(1, Math.max(0, (burst.value - offset) / span));
    return Math.max(0, (p - 0.44) / 0.56);
  });

  return (
    <HandPath
      path={path}
      color={color}
      variant="crayon"
      seed={seed}
      strokeScale={strokeScale * 0.9}
      start={start}
      end={end}
    />
  );
}
