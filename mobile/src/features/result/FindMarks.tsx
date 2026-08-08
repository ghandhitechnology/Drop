/**
 * What the lens found, marked on the print.
 *
 * A plate arrives as several things at once, and the only place that fact is
 * still visible is the photo itself. So the print gets the reticle's own
 * corners back — one small pair per item, at the box the engine reported —
 * drawn on in the order they were found. It is the viewfinder's vocabulary
 * spoken quietly at print size: the same arms, the same white pencil, one
 * eighth of the space.
 *
 * The marks say nothing a screen reader needs; the cards behind them carry
 * every word. The canvas is hidden from accessibility and takes no touches,
 * and it lives inside the print's own Animated.View, so it travels, tilts and
 * fades with the print instead of chasing it.
 */

import { Canvas, Skia, type SkPath } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { duration } from '../../design/motion';
import { HandPath } from '../../drawing/HandPath';
import { seedFromString } from '../../drawing/seededRandom';
import { overlayInk } from '../capture/overlay';
import { MAX_PLATE_ITEMS } from '../capture/pipeline';
import type { NormalizedBox } from '../capture/types';

/** The paper border Snapshot leaves around the photo. Marks live inside it. */
export const PRINT_MAT = 8;

/** Length of each arm, as a fraction of the box's shorter side — the reticle's. */
const CORNER_FRACTION = 0.26;

/** Short enough that a mark is a stroke rather than a bracket at print size. */
const MIN_ARM = 5;

/** One box after another, in the order the engine listed them. */
const STAGGER_MS = 90;

/** Weight of the line at print scale. The reticle's 1.3 blots at this size. */
const STROKE_SCALE = 0.85;

/** Held under the reticle's own 0.85: these sit on top of a photograph. */
const MARK_OPACITY = 0.78;

/** How far a driving progress value has to travel before the marks start. */
const LANDED_AT = 0.9;

export type FindMarksProps = {
  /**
   * One entry per item, in plate order. A null box is an item the engine
   * placed no rectangle on; it is skipped rather than guessed at.
   */
  boxes: readonly (NormalizedBox | null)[];
  /** The print's square side in dp, mat included — Snapshot's `size`. */
  side: number;
  /**
   * The cue to draw. A boolean flips the marks on when the print has landed;
   * a shared value lets an existing journey drive them, and the marks begin
   * once it passes LANDED_AT.
   */
  landed: boolean | SharedValue<number>;
  reduceMotion: boolean;
  /** Defaults to the print's mat, so the marks meet the photo's edge. */
  mat?: number;
};

/**
 * The marks, as a set.
 *
 * Everything is measured once: the print is a fixed square by the time it is
 * marked, so the paths are plain geometry and only the trim window animates.
 * One canvas carries all six — six canvases would each cost a surface to hold
 * a pair of pencil strokes.
 *
 * The print is a centre crop of the frame, so a mark sits where the crop put
 * the thing it names.
 */
export function FindMarks({
  boxes,
  side,
  landed,
  reduceMotion,
  mat = PRINT_MAT,
}: FindMarksProps) {
  const marks = useMemo(() => {
    const window = Math.max(0, side - mat * 2);
    if (window <= 0) return [];

    return boxes
      .slice(0, MAX_PLATE_ITEMS)
      .map((box, index) => (box ? { box, index } : null))
      .filter((entry): entry is { box: NormalizedBox; index: number } => entry !== null)
      .map(({ box, index }) => ({
        index,
        path: cornerPair(box, window, mat),
        seed: seedFromString(`result/find/${index}`),
      }))
      .filter((mark): mark is { index: number; path: SkPath; seed: number } =>
        mark.path !== null,
      );
  }, [boxes, side, mat]);

  /**
   * One clock for the whole set.
   *
   * Each mark reads its own window out of it, which keeps the stagger to a
   * single timing rather than a delay per mark — and means reduced motion is
   * the same timeline run in no time at all, arms already down.
   */
  const run = useSharedValue(0);
  const stagger = reduceMotion ? 0 : STAGGER_MS;
  const span = duration.quick + stagger * Math.max(0, marks.length - 1);

  // A plain flag is fed through the same gate a shared value goes through, so
  // both callers meet in one reaction below.
  const flag = useSharedValue(0);
  const gate = typeof landed === 'boolean' ? flag : landed;

  useEffect(() => {
    if (typeof landed === 'boolean') flag.value = landed ? 1 : 0;
  }, [landed, flag]);

  useAnimatedReaction(
    () => gate.value >= LANDED_AT,
    (on, was) => {
      if (on === was) return;
      run.value = on
        ? withTiming(1, {
            duration: reduceMotion ? 0 : span,
            easing: Easing.linear,
          })
        : 0;
    },
    [gate, run, span, reduceMotion],
  );

  if (marks.length === 0) return null;

  return (
    <Canvas
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {marks.map((mark, order) => (
        <FindMark
          key={mark.index}
          path={mark.path}
          seed={mark.seed}
          run={run}
          from={(stagger * order) / span}
          to={(stagger * order + duration.quick) / span}
        />
      ))}
    </Canvas>
  );
}

/**
 * One pair of arms, drawing itself on.
 *
 * The trim runs across both corners in turn, which is the order a hand would
 * take them in — top-left, then bottom-right — and the line fades up over the
 * first sliver of the stroke so it never appears as a dot.
 */
function FindMark({
  path,
  seed,
  run,
  from,
  to,
}: {
  path: SkPath;
  seed: number;
  run: SharedValue<number>;
  from: number;
  to: number;
}) {
  const end = useDerivedValue(() => {
    const p = interpolate(run.value, [from, to], [0, 1], Extrapolation.CLAMP);
    // Ease-out, so each arm arrives rather than stops.
    return p * (2 - p);
  });

  const opacity = useDerivedValue(() =>
    interpolate(run.value, [from, from + (to - from) * 0.15], [0, MARK_OPACITY], Extrapolation.CLAMP),
  );

  return (
    <HandPath
      path={path}
      color={overlayInk.mark}
      variant="pencil"
      seed={seed}
      strokeScale={STROKE_SCALE}
      end={end}
      opacity={opacity}
    />
  );
}

/**
 * Two corners of the reticle, at the box the engine reported.
 *
 * A full four-corner reticle at a tenth of the size reads as a rectangle drawn
 * over the food; opposite corners keep the framing gesture and leave the photo
 * visible. Arms never exceed half the shorter side, so the pair cannot close
 * into a box on a small find.
 */
function cornerPair(box: NormalizedBox, window: number, mat: number): SkPath | null {
  const w = box.w * window;
  const h = box.h * window;
  if (!(w > 0) || !(h > 0)) return null;

  const l = mat + box.x * window;
  const t = mat + box.y * window;
  const r = l + w;
  const b = t + h;
  const arm = Math.min(Math.max(Math.min(w, h) * CORNER_FRACTION, MIN_ARM), Math.min(w, h) / 2);

  const builder = Skia.PathBuilder.Make();
  builder.moveTo(l, t + arm).lineTo(l, t).lineTo(l + arm, t);
  builder.moveTo(r, b - arm).lineTo(r, b).lineTo(r - arm, b);
  return builder.detach();
}
