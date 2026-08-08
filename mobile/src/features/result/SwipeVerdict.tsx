/**
 * What the swipe is about to do, drawn on the sheet while the thumb is still
 * holding it.
 *
 * Two directions on one card is not a thing a thumb guesses, and a line of hint
 * text underneath is read once and then never again. So the card answers back:
 * carried right, a blue plus draws itself on — the card is being added; carried
 * left, a red cross — the card is going back into the photo.
 *
 * The mark draws at the pace of the finger and finishes its last stroke exactly
 * at the trigger, so "the mark is complete" and "letting go commits" are the
 * same fact. Past that it firms — full ink, a small press outward — which is the
 * only thing between the two halves of the gesture that the eye has to read.
 *
 * Both marks are drawn with the same pencil as everything else in Drop, and both
 * live in a canvas hidden from the screen reader; the two directions are spoken
 * as accessibility actions on the card itself.
 */

import { Group, Skia, type SkPath, type Transforms3d } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import {
  Extrapolation,
  interpolate,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { HandPath } from '../../drawing/HandPath';
import type { Box } from './silhouette';
import { SWIPE_TRAVEL, SWIPE_TRIGGER } from './useStackOrder';

/** Share of the card's short side the mark spans. */
const MARK_SHARE = 0.42;
const MARK_MIN = 88;
const MARK_MAX = 148;

/** How far the mark is pressed outward once the swipe has passed its trigger. */
const FIRM_SCALE = 0.07;

/** Where it starts from, before a stroke of it has been drawn. */
const REST_SCALE = 0.86;

/** The ink it settles at under the thumb, and the ink it firms to. */
const HELD_INK = 0.8;
const FIRM_INK = 1;

/** A stamp is never quite square to the page. */
const ADD_LEAN = 5;
const DROP_LEAN = -7;

function clamp(value: number, low: number, high: number): number {
  'worklet';
  return Math.min(high, Math.max(low, value));
}

/** A plus: the arm across, then the arm down. Two strokes, drawn in that order. */
function plusPath(cx: number, cy: number, size: number): SkPath {
  const half = size / 2;
  return Skia.PathBuilder.Make()
    .moveTo(cx - half, cy)
    .lineTo(cx + half, cy)
    .moveTo(cx, cy - half)
    .lineTo(cx, cy + half)
    .detach();
}

/** A cross, struck the way a hand strikes one: down-right first, then back. */
function crossPath(cx: number, cy: number, size: number): SkPath {
  const half = size / 2;
  return Skia.PathBuilder.Make()
    .moveTo(cx - half, cy - half)
    .lineTo(cx + half, cy + half)
    .moveTo(cx + half, cy - half)
    .lineTo(cx - half, cy + half)
    .detach();
}

export type SwipeVerdictProps = {
  /** The front card's rectangle. The marks are struck across its middle. */
  box: Box;
  /** The sheet's travel under the thumb, in dp. Negative is left. */
  swipeX: SharedValue<number>;
  /** Ink for the right swipe — the card being added. */
  addColor: string;
  /** Ink for the left swipe — the card going back into the photo. */
  dropColor: string;
  seed: number;
  /**
   * False when the right swipe has nothing to add — a card whose figure is not
   * in this release. The plus stays away rather than promising a save.
   */
  canAdd?: boolean;
};

export function SwipeVerdict({
  box,
  swipeX,
  addColor,
  dropColor,
  seed,
  canAdd = true,
}: SwipeVerdictProps) {
  const center = useMemo(
    () => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 }),
    [box],
  );
  const size = useMemo(
    () => clamp(Math.min(box.width, box.height) * MARK_SHARE, MARK_MIN, MARK_MAX),
    [box],
  );

  const add = useMemo(() => plusPath(center.x, center.y, size), [center, size]);
  const drop = useMemo(() => crossPath(center.x, center.y, size * 0.86), [center, size]);

  return (
    <>
      {canAdd && (
        <Mark
          path={add}
          color={addColor}
          seed={seed + 21}
          origin={center}
          lean={ADD_LEAN}
          heading={1}
          swipeX={swipeX}
        />
      )}
      <Mark
        path={drop}
        color={dropColor}
        seed={seed + 34}
        origin={center}
        lean={DROP_LEAN}
        heading={-1}
        swipeX={swipeX}
      />
    </>
  );
}

/* ---------------------------------------------------------------- one mark */

/**
 * One direction's mark.
 *
 * Everything it does is read off a single signed number — how far the thumb has
 * carried the sheet *its* way. A drag the other way is simply negative travel,
 * which draws nothing, so the two marks never have to know about each other.
 */
function Mark({
  path,
  color,
  seed,
  origin,
  lean,
  heading,
  swipeX,
}: {
  path: SkPath;
  color: string;
  seed: number;
  origin: { x: number; y: number };
  lean: number;
  /** Which swipe this mark belongs to: -1 left, 1 right. */
  heading: number;
  swipeX: SharedValue<number>;
}) {
  /** The thumb's travel this way, in dp. Below zero the mark is not wanted. */
  const travel = useDerivedValue(() => swipeX.value * heading, [swipeX, heading]);

  /** 0 → 1 as the strokes are laid down, complete at the trigger. */
  const drawn = useDerivedValue(() => clamp(travel.value / SWIPE_TRIGGER, 0, 1));

  /** 0 → 1 for the stretch past the trigger, where the decision is already made. */
  const firm = useDerivedValue(() =>
    clamp((travel.value - SWIPE_TRIGGER) / (SWIPE_TRAVEL - SWIPE_TRIGGER), 0, 1),
  );

  // Ink arrives with the first stroke rather than fading up from nothing, so a
  // small drag reads as a light mark and not as a mark that has not loaded yet.
  const opacity = useDerivedValue(() =>
    interpolate(drawn.value, [0, 0.06, 1], [0, 0.22, HELD_INK], Extrapolation.CLAMP) +
    firm.value * (FIRM_INK - HELD_INK),
  );

  const transform = useDerivedValue(() => {
    const scale =
      interpolate(drawn.value, [0, 1], [REST_SCALE, 1], Extrapolation.CLAMP) +
      firm.value * FIRM_SCALE;
    return [
      { rotate: ((lean * drawn.value) * Math.PI) / 180 },
      { scale },
    ];
  }, [lean]);

  return (
    // Skia resolves the shared values on the group each frame; the marks sit
    // above the card's words, which is what a stamp does.
    <Group transform={transform as unknown as Transforms3d} origin={origin}>
      <HandPath
        path={path}
        color={color}
        variant="crayon"
        seed={seed}
        strokeScale={2.8}
        end={drawn}
        opacity={opacity}
      />
    </Group>
  );
}
