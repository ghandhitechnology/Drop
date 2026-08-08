/**
 * The week against its mark, drawn rather than filled.
 *
 * The track is a traced capsule whose far end *is* the mark, so the question
 * "how much of the week is left" is answered by looking at how much paper is
 * left. The week itself is coloured in the way a hand colours in — a body with
 * a wobbling top and bottom edge, gone over twice — instead of a flat rectangle
 * with a machine-perfect edge.
 *
 * Three marks, and their meanings:
 *
 *   the fill    — what has been confirmed this week
 *   the notch   — the whole of today's share of the mark, in the accent colour;
 *                 the only coloured mark on the row, so it is found without
 *                 being loud
 *   the run-on  — past the mark the line carries off the end of the track and
 *                 is stopped by hand, which is what "over" looks like when
 *                 drawn rather than announced in red
 *
 * Nothing here changes colour with status. A person who logs an honest heavy
 * week has done what the product asks of them, and a red bar teaches them to
 * stop logging. Weight and position carry it.
 *
 * The bar does not animate. It grew in on a horizontal scale for a while, and
 * scaling a texture full of hand-drawn strokes stretches the strokes with it —
 * the crayon grain smears out and snaps back as the transform lands, which read
 * as a stutter rather than as drawing. The figure above it settles instead, and
 * the bar is simply correct on arrival.
 *
 * The canvas is decoration and is hidden from the screen reader; the figures
 * above and below it carry the meaning, and `GoalBlock` labels the group.
 */

import { Canvas, Skia, type SkPath } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useTheme } from '../../design/theme';
import { HandPath } from '../../drawing/HandPath';
import { mulberry32, seedFromString } from '../../drawing/seededRandom';
import type { GoalProgress } from './goal';

/** The whole drawn row. Taller than the track: the notch reaches past it. */
export const GOAL_ROW_HEIGHT = 34;
/** The track. */
const TRACK_HEIGHT = 18;
/** Paper kept to the right of the track for a week that has run past the mark. */
const RUNWAY = 40;
/** How far the notch stands out of the track, top and bottom. */
const NOTCH_REACH = 5;

const SEED = seedFromString('goal/track');

export type GoalBarProps = {
  progress: GoalProgress;
};

export function GoalBar({ progress }: GoalBarProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  const over = progress.status === 'over';
  /**
   * The track gives up its runway once the week has passed the mark, so the
   * run-on has paper to run onto. Two states are never on screen at once, so
   * the change of width is invisible in use.
   */
  const track = Math.max(0, (over ? width - RUNWAY : width) - 1);
  const top = (GOAL_ROW_HEIGHT - TRACK_HEIGHT) / 2;

  const shapes = useMemo(
    () => (track > TRACK_HEIGHT ? buildShapes(track, TRACK_HEIGHT, top, progress) : null),
    [track, top, progress],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (Math.abs(current - next) < 0.5 ? current : next));
  };

  return (
    <View
      style={styles.root}
      onLayout={onLayout}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {/*
        One canvas. The three used to be separate so the middle one could sit
        under its own animated view; with nothing moving, the marks are just
        laid down in order — track, week, annotation — on a single surface.
      */}
      {shapes && (
        <Canvas style={StyleSheet.absoluteFill}>
          <HandPath
            path={shapes.track}
            color={colors.inkFaint}
            variant="pencil"
            seed={SEED}
            strokeScale={0.7}
          />

          {shapes.body && (
            <HandPath
              path={shapes.body}
              color={colors.ink}
              variant="crayon"
              seed={SEED + 3}
              strokeScale={1.1}
              opacity={0.9}
            />
          )}
          {shapes.grain.map((path, index) => (
            <HandPath
              key={index}
              path={path}
              color={colors.ink}
              variant="crayon"
              seed={SEED + 11 + index}
              strokeScale={TRACK_HEIGHT * 0.13}
              opacity={0.5}
            />
          ))}

          {shapes.notch && (
            <HandPath
              path={shapes.notch}
              color={colors.accent}
              variant="crayon"
              seed={SEED + 31}
              strokeScale={0.95}
            />
          )}
          {shapes.runOn.map((path, index) => (
            <HandPath
              key={index}
              path={path}
              color={colors.ink}
              variant="crayon"
              seed={SEED + 41 + index}
              strokeScale={1.15}
              opacity={0.9}
            />
          ))}
        </Canvas>
      )}
    </View>
  );
}

/* --------------------------------------------------------------- shapes -- */

type Shapes = {
  track: SkPath;
  /** The coloured-in week, or nothing while the week is still empty. */
  body: SkPath | null;
  /** Passes over the body, for a crayon's tooth. */
  grain: SkPath[];
  notch: SkPath | null;
  runOn: SkPath[];
};

function buildShapes(
  width: number,
  height: number,
  top: number,
  progress: GoalProgress,
): Shapes {
  const random = mulberry32(SEED);
  const radius = height / 2;
  const bottom = top + height;
  const middle = top + radius;
  const inner = progress.fill * (width - 2);

  const track = Skia.PathBuilder.Make()
    .moveTo(radius, top)
    .lineTo(width - radius, top)
    .arcToOval(
      { x: width - height, y: top, width: height, height },
      -90,
      180,
      false,
    )
    .lineTo(radius, bottom)
    .arcToOval({ x: 0, y: top, width: height, height }, 90, 180, false)
    .close()
    .detach();

  return {
    track,
    // Below a round end's worth of width there is no body to trace, only the
    // end cap itself, so a week that has barely started shows the track alone.
    body: inner > radius + 2 ? bodyPath(inner, top, height, radius, random) : null,
    grain: inner > radius + 10 ? grainPaths(inner, top, height, random) : [],
    notch: notchPath(width, top, bottom, progress),
    runOn: runOnPaths(width, middle, progress),
  };
}

/**
 * The coloured-in week: a closed shape whose long edges wander a little, and
 * whose leading edge is where the week has got to.
 */
function bodyPath(
  inner: number,
  top: number,
  height: number,
  radius: number,
  random: () => number,
): SkPath {
  const steps = Math.max(3, Math.round(inner / 22));
  const drift = () => (random() - 0.5) * 1.6;
  const builder = Skia.PathBuilder.Make();

  // The left end is round, because the track's left end is.
  builder.moveTo(radius, top + 1);
  for (let step = 1; step <= steps; step += 1) {
    builder.lineTo(radius + ((inner - radius) * step) / steps, top + 1 + drift());
  }
  builder.lineTo(inner, top + height - 1 + drift());
  for (let step = steps - 1; step >= 0; step -= 1) {
    builder.lineTo(radius + ((inner - radius) * step) / steps, top + height - 1 + drift());
  }
  builder.arcToOval({ x: 0, y: top, width: height, height }, 90, 180, false);
  builder.close();
  return builder.detach();
}

/** Two passes across the body, wide and faint, the way a crayon lays down wax. */
function grainPaths(
  inner: number,
  top: number,
  height: number,
  random: () => number,
): SkPath[] {
  return [0.34, 0.66].map((share) => {
    const y = top + height * share;
    const builder = Skia.PathBuilder.Make().moveTo(2, y + (random() - 0.5));
    const steps = Math.max(2, Math.round(inner / 26));
    for (let step = 1; step <= steps; step += 1) {
      builder.lineTo(2 + ((inner - 4) * step) / steps, y + (random() - 0.5) * 1.4);
    }
    return builder.detach();
  });
}

/**
 * Today's share of the mark, as a notch through the track.
 *
 * It is dropped once the week has passed the mark: at that point the run-on
 * says everything the notch would, and two marks fighting over the same right
 * edge reads as a fault in the drawing.
 */
function notchPath(
  width: number,
  top: number,
  bottom: number,
  progress: GoalProgress,
): SkPath | null {
  if (progress.status === 'over') return null;
  if (progress.pace <= 0.04 || progress.pace >= 0.995) return null;
  const x = progress.pace * (width - 2) + 1;
  return Skia.PathBuilder.Make()
    .moveTo(x, top - NOTCH_REACH)
    .lineTo(x + 0.6, bottom + NOTCH_REACH)
    .detach();
}

/** Past the mark: the line carries off the track and is stopped by hand. */
function runOnPaths(width: number, middle: number, progress: GoalProgress): SkPath[] {
  if (progress.status !== 'over') return [];
  const spill = Math.min((progress.ratio - 1) * width + 14, RUNWAY - 8);
  const end = width + spill;
  return [
    Skia.PathBuilder.Make()
      .moveTo(width - 2, middle)
      .quadTo((width + end) / 2, middle + 1.8, end, middle)
      .detach(),
    Skia.PathBuilder.Make()
      .moveTo(end, middle - 7)
      .lineTo(end - 0.8, middle + 7)
      .detach(),
  ];
}

const styles = StyleSheet.create({
  root: { height: GOAL_ROW_HEIGHT, alignSelf: 'stretch' },
});
