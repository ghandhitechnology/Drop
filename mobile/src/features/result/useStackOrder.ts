/**
 * The pile, as one number per sheet.
 *
 * Every card on a plate carries a `depth`: 0 is the sheet under the thumb, 1
 * the one peeking a strip above it, 2 the one above that. Offset, inset, lean
 * and the cross-fade between a full card and its peek row are all read off that
 * single number in worklets, so a pile caught mid-spring is a real arrangement
 * of paper rather than a frame between two animations — the same bargain
 * `useExpansion` makes with `expansion`.
 *
 * Depth is continuous, which is what lets a thumb hold it. Dragging the front
 * sheet sideways subtracts the drag's progress from every other depth, so the
 * whole pile rises to meet the finger; letting go under the trigger puts it
 * back down.
 *
 * Past the trigger the sheet leaves, and which way it went is the whole
 * decision: left throws it back into the print it was found in, right sends it
 * to the tray to wait for the save. One gesture, two destinations, and the
 * intent rides out with the sheet so the stage knows which happened.
 *
 * Order lives here rather than in the capture machine. Which sheet is on top is
 * a fact about the paper, not about the plate — the machine only ever hears
 * that a card left, and where it went.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { duration, spring } from '../../design/motion';
import { seedFromString, seededRange } from '../../drawing/seededRandom';
import { tapSelection } from '../../lib/haptics';
import type { Estimate } from '../capture/types';

/* ------------------------------------------------------------ constants */

/** How tall a buried sheet's peek row is, before measurement. */
export const PEEK_STEP = 30;

/** A measured peek row is trusted only inside these bounds. */
export const PEEK_STEP_MIN = 30;
export const PEEK_STEP_MAX = 48;

/** Sheets drawn above the front card. Deeper ones are counted, not drawn. */
export const MAX_PEEKS = 3;

/** How far each buried sheet is pulled in from the sides, per depth. */
export const STACK_INSET_X = 8;

/** Thumb travel, in dp, that carries the front sheet to its exit. */
export const SWIPE_TRAVEL = 120;

/** Past this the release commits rather than springs back. */
export const SWIPE_TRIGGER = 72;

/** A flick this fast commits regardless of how far it got. */
export const FLICK_VELOCITY = 700;

/** How far a sheet sags as it is dragged across, in dp at full travel. */
export const SWIPE_SAG = 10;

/** How much of the thrown lean a sheet shows while it is still under the thumb. */
export const TILT_UNDER_THUMB = 0.35;

/** How far a sheet is allowed to lean at rest, in degrees. */
export const TILT_RANGE = 1.6;

/** Where the expansion has to reach before the pile fans out of the print. */
export const FAN_OUT_POINT = 0.62;

/** Below this the pile folds back into one sheet and will fan again. */
const FOLD_POINT = 0.1;

/** Each sheet waits this much longer than the one in front of it. */
export const FAN_OUT_STAGGER = 55;

/** What the dismissed sheet shrinks to as it lands back in the print. */
export const EXIT_SCALE = 0.16;

/** It holds full ink most of the way, then goes in the last stretch. */
const EXIT_FADE_POINT = 0.62;

/** The lean the exit exaggerates into, capped so it reads as paper. */
const EXIT_TILT_MAX = 5;

/** A card's own ink has gone by the time its peek row arrives. */
const CONTENT_FADE = 0.35;

/**
 * Sheets the pool of depth values covers.
 *
 * A shared value has to come from a hook and hooks cannot be counted at render
 * time, so the pool is the plate's own ceiling and a short plate leaves the
 * tail of it at rest. Six is `MAX_PLATE_ITEMS`, kept here as a literal so the
 * gesture hook stays clear of the pipeline's imports.
 */
const SHEET_SLOTS = 6;

/** Reduced motion still rearranges the pile — it just arrives without the trip. */
const REDUCED_MS = 120;

/* ------------------------------------------------------------- geometry */

function clamp(value: number, low: number, high: number): number {
  'worklet';
  return Math.min(high, Math.max(low, value));
}

/** How high above the front card a sheet at this depth sits, in dp. */
export function pileOffset(depth: number, step: number = PEEK_STEP): number {
  'worklet';
  return -clamp(depth, 0, MAX_PEEKS) * step;
}

/** How far in from each side a sheet at this depth is pulled, in dp. */
export function pileInset(depth: number): number {
  'worklet';
  return clamp(depth, 0, MAX_PEEKS) * STACK_INSET_X;
}

/** A sheet's lean, in degrees. The one under the thumb always lies flat. */
export function pileTilt(depth: number, seedTilt: number): number {
  'worklet';
  return seedTilt * clamp(depth, 0, 1);
}

/** The card's own ink: full at the front, gone as soon as it is buried. */
export function contentOpacity(depth: number): number {
  'worklet';
  return 1 - clamp(depth / CONTENT_FADE, 0, 1);
}

/** The peek row's ink: arrives as the card's leaves, fades out past the third. */
export function peekOpacity(depth: number): number {
  'worklet';
  const arriving = clamp((depth - CONTENT_FADE) / (1 - CONTENT_FADE), 0, 1);
  const leaving = 1 - clamp(depth - MAX_PEEKS, 0, 1);
  return arriving * leaving;
}

/** The sheet shrinking toward wherever it is headed. */
export function exitScale(progress: number): number {
  'worklet';
  return 1 + clamp(progress, 0, 1) * (EXIT_SCALE - 1);
}

/** Full ink for most of the trip, then away in the last stretch. */
export function exitOpacity(progress: number): number {
  'worklet';
  return 1 - clamp((progress - EXIT_FADE_POINT) / (1 - EXIT_FADE_POINT), 0, 1);
}

/**
 * The lean, exaggerated on the way out so the sheet reads as thrown.
 *
 * `direction` is the sign of the swipe, so a sheet always leans into the way it
 * is travelling rather than against it.
 */
export function exitTilt(
  progress: number,
  seedTilt: number,
  direction: number = 1,
): number {
  'worklet';
  const lean = clamp(Math.abs(seedTilt) * 3, 0, EXIT_TILT_MAX);
  return clamp(progress, 0, 1) * lean * (direction < 0 ? -1 : 1);
}

/**
 * Where the front sheet is, as one displacement.
 *
 * A sheet is paper and ink, and they are drawn by two different engines: the
 * words are React views, the card under them is Skia inside the stage's canvas.
 * Nothing but this function keeps them together — so it is the one place the
 * motion is described, and both sides read it rather than each doing the sum.
 *
 * `rotate` comes back in degrees, which is what a React transform wants; the
 * Skia side converts. Everything is relative to the front card's resting
 * rectangle, so all-zero input is the sheet sitting exactly where it lives.
 */
export type SheetOffset = { x: number; y: number; scale: number; rotate: number };

export function frontSheetOffset(
  /** Travel under the thumb, in dp. Negative is left. */
  swipeX: number,
  /** 0 → 1 once the sheet has been let go and is on its way out. */
  away: number,
  /** Which way the exit committed: -1 left, 1 right. */
  direction: number,
  /** 0 → 1 as the thumb carries the sheet toward its trigger. */
  lift: number,
  cardCenter: { x: number; y: number },
  /** Where a swipe left lands. */
  printCenter: { x: number; y: number },
  /** Where a swipe right lands. */
  trayCenter: { x: number; y: number },
  /** The sheet's seeded resting lean, in degrees. */
  tilt: number,
): SheetOffset {
  'worklet';
  // Under the thumb the lean follows the drag; once the sheet has been let go
  // it follows the exit, which is the direction the drag committed to.
  const heading = away > 0 ? direction : Math.sign(swipeX) || 1;
  const toward = heading > 0 ? trayCenter : printCenter;
  // Held, the sheet sags a little as it is dragged aside — paper, not a tile.
  const sag = SWIPE_SAG * Math.min(1, Math.abs(swipeX) / SWIPE_TRAVEL);
  return {
    x: swipeX + (toward.x - cardCenter.x - swipeX) * away,
    y: sag + (toward.y - cardCenter.y - sag) * away,
    scale: exitScale(away),
    rotate: exitTilt(Math.max(away, lift * TILT_UNDER_THUMB), tilt, heading),
  };
}

/**
 * A sheet's lean, seeded so it looks identical every time the plate is drawn.
 *
 * The index rides in the seed because one plate can hold the same catalogue
 * entry twice and two sheets leaning the same way look like a printing error.
 */
export function seedTiltFor(catalogId: string, index: number): number {
  return seededRange(seedFromString(`${catalogId}:${index}`), -TILT_RANGE, TILT_RANGE)();
}

/**
 * How far a leaning sheet's corner swings sideways.
 *
 * The lean has to stay inside the inset it was given, or a buried sheet pokes
 * out past the one in front of it and the pile looks torn rather than stacked.
 */
export function tiltDisplacement(
  tiltDeg: number,
  width: number,
  height: number,
): number {
  const radians = (Math.abs(tiltDeg) * Math.PI) / 180;
  return (height / 2) * Math.sin(radians) + (width / 2) * (1 - Math.cos(radians));
}

/** A measured peek row, held inside the bounds the design allows. */
export function clampPeekStep(height: number): number {
  if (!Number.isFinite(height) || height <= 0) return PEEK_STEP;
  return clamp(height, PEEK_STEP_MIN, PEEK_STEP_MAX);
}

/**
 * The cards a save actually writes.
 *
 * An item whose figure arrives in a later release rides along in the snapshot
 * but carries no litres, so it never counts toward the label on the button.
 */
export function savableEstimates(estimates: readonly Estimate[]): Estimate[] {
  return estimates.filter((estimate) => estimate.headline !== null);
}

/* -------------------------------------------------------------- ordering */

/**
 * Which way a sheet left the pile.
 *
 * `dismiss` is the swipe left — the card goes back into the photo and is
 * forgotten. `queue` is the swipe right — the card goes to the tray and waits
 * for the one write at the end of the run. The pile treats them identically;
 * only the destination and what the stage does about it differ.
 */
export type SwipeIntent = 'dismiss' | 'queue';

export type StackAction =
  | { type: 'dismiss'; index: number }
  | { type: 'queue'; index: number }
  | { type: 'bringToFront'; index: number };

/**
 * Order math, on its own.
 *
 * `order` is front to back, by index into the plate's items. Either swipe takes
 * a sheet out; bringing one forward moves only that sheet and leaves every
 * other one where it was, which is what a hand does to a pile of paper — and
 * means the fewest cards move for the tap.
 *
 * An order can come back empty. That is the last sheet leaving, which the stage
 * routes to its end-of-run path rather than to the machine.
 */
export function nextOrder(
  order: readonly number[],
  action: StackAction,
): number[] {
  if (!order.includes(action.index)) return order.slice();

  if (action.type === 'bringToFront') {
    return [action.index, ...order.filter((index) => index !== action.index)];
  }

  return order.filter((index) => index !== action.index);
}

/**
 * The order after the machine has spoken.
 *
 * Sheets still on the plate keep the arrangement the hand gave them; anything
 * new arrives at the back in the order it read off the photo. Returns the array
 * it was handed when nothing moved, so a re-render costs no state change.
 */
export function reconcileOrder(
  order: number[],
  kept: readonly number[],
): number[] {
  const surviving = order.filter((index) => kept.includes(index));
  const arriving = kept.filter((index) => !order.includes(index));
  const next = [...surviving, ...arriving];
  const same =
    next.length === order.length && next.every((index, at) => index === order[at]);
  return same ? order : next;
}

/** Depth per sheet slot: its place in the order, or -1 once it is gone. */
function slotDepths(order: readonly number[]): number[] {
  const depths = new Array<number>(SHEET_SLOTS).fill(-1);
  order.forEach((index, depth) => {
    if (index >= 0 && index < SHEET_SLOTS) depths[index] = depth;
  });
  return depths;
}

/* ------------------------------------------------------------- the hook */

export type StackOrderOptions = {
  /** Indices of the cards still on the pile, in the order they read off the photo. */
  kept: readonly number[];
  /** Catalogue id per item index — the seed a sheet leans from. */
  seeds: readonly string[];
  /** The stage's expansion. The pile fans out of the print as it crosses FAN_OUT_POINT. */
  expansion: SharedValue<number>;
  /** False while the stage is saving or receding; the swipe stops taking fingers. */
  enabled: boolean;
  /** The exit has committed. Whatever is catching the sheet pulses here, before it arrives. */
  onExitStart?: (index: number, intent: SwipeIntent) => void;
  /** The sheet has landed. `last` when it was the only one left on the pile. */
  onResolved: (index: number, intent: SwipeIntent, last: boolean) => void;
  reduceMotion: boolean;
};

export type StackOrder = {
  /** Front to back, by index into the plate's items. */
  order: number[];
  /** The sheet on top, or -1 when the pile is empty. */
  front: number;
  /** How many sheets are still on the pile. */
  keptCount: number;
  /** The sheet on its way off the pile, or -1 when none is. */
  exiting: number;
  /** Depth of one sheet, by item index. 0 is the front. */
  depthOf: (index: number) => SharedValue<number>;
  /** 0 → 1 as a thumb carries the front sheet toward its exit, either way. */
  lift: SharedValue<number>;
  /** The front sheet's travel under the thumb, in dp. Negative is left. */
  swipeX: SharedValue<number>;
  /** 0 → 1 as the departing sheet flies to wherever it is going. */
  exit: SharedValue<number>;
  /** -1 while a sheet is leaving to the left, 1 to the right. */
  exitDirection: SharedValue<number>;
  /** The swipe pan. Belongs to the front sheet only. */
  swipeGesture: PanGesture;
  /** A sheet's lean at rest, in degrees. Zero under reduced motion. */
  tiltOf: (index: number) => number;
  /** The peek row in force, measured or assumed. */
  peekStep: number;
  /** Report a measured depth-1 peek row. */
  onPeekLayout: (height: number) => void;
  /** Put a buried sheet on top. */
  bringToFront: (index: number) => void;
  /** Send the front sheet back into the print, with no finger involved. */
  dismissFront: () => void;
  /** Send the front sheet to the tray, with no finger involved. */
  queueFront: () => void;
};

export function useStackOrder({
  kept,
  seeds,
  expansion,
  enabled,
  onExitStart,
  onResolved,
  reduceMotion,
}: StackOrderOptions): StackOrder {
  const [order, setOrder] = useState<number[]>(() => kept.slice());
  const [exitingIndex, setExitingIndex] = useState(-1);
  const [peekStep, setPeekStep] = useState(PEEK_STEP);

  /*
   * One depth per sheet, allocated up front. Six calls rather than a loop
   * because a shared value has to come from a hook, and hooks cannot be
   * counted at render time — see SHEET_SLOTS.
   */
  const depth0 = useSharedValue(0);
  const depth1 = useSharedValue(0);
  const depth2 = useSharedValue(0);
  const depth3 = useSharedValue(0);
  const depth4 = useSharedValue(0);
  const depth5 = useSharedValue(0);
  const depths = useMemo(
    () => [depth0, depth1, depth2, depth3, depth4, depth5],
    [depth0, depth1, depth2, depth3, depth4, depth5],
  );

  const lift = useSharedValue(0);
  const swipeX = useSharedValue(0);
  const exit = useSharedValue(0);
  const exitDirection = useSharedValue(1);

  /** Where each sheet is headed, readable from the fan-out's worklet. */
  const targets = useSharedValue<number[]>(slotDepths(order));
  /** 1 once the pile has come out of the print. */
  const fanned = useSharedValue(0);

  const front = order.length > 0 ? order[0] : -1;
  // A sheet stays "exiting" until the plate agrees it has gone, so the card
  // never blinks back on in the beat between the animation ending and the
  // machine's dismissal arriving.
  const exiting = exitingIndex >= 0 && order.includes(exitingIndex) ? exitingIndex : -1;

  // The machine is the source of truth about what is still on the plate; the
  // arrangement is ours. Reconcile during render so children never receive a
  // stale order for one frame after the machine changes the kept cards.
  const reconciledOrder = reconcileOrder(order, kept);
  if (reconciledOrder !== order) setOrder(reconciledOrder);

  // Once the resolved card has left local state, take its animation values
  // home. This effect synchronizes React state to Reanimated's external store.
  useEffect(() => {
    if (exitingIndex >= 0) return;
    exit.value = 0;
    lift.value = 0;
    swipeX.value = 0;
  }, [exitingIndex, exit, lift, swipeX]);

  // Every rearrangement — a dismissal closing the pile, a tap pulling a sheet
  // out of it — is the same move: each depth springs to its new place, all at
  // once. The stagger belongs to the fan-out alone.
  useEffect(() => {
    const next = slotDepths(order);
    targets.value = next;
    if (fanned.value === 0) return;
    next.forEach((to, slot) => {
      if (to < 0) return;
      depths[slot].value = reduceMotion
        ? withTiming(to, { duration: REDUCED_MS })
        : withSpring(to, spring.card);
    });
  }, [order, depths, targets, fanned, reduceMotion]);

  /*
   * The fan-out.
   *
   * The pile starts as one sheet inside the print and only opens once the
   * expansion has made room for it — any earlier and the cards spread across a
   * card frame that is still growing. Each sheet waits on the one in front of
   * it, so the pile deals itself out rather than appearing.
   */
  useAnimatedReaction(
    () => expansion.value,
    (value) => {
      if (value < FOLD_POINT && fanned.value === 1) {
        // eslint-disable-next-line react-hooks/immutability -- This callback is a Reanimated worklet mutating animation state.
        fanned.value = 0;
        for (let slot = 0; slot < depths.length; slot += 1) {
          // eslint-disable-next-line react-hooks/immutability -- This callback is a Reanimated worklet mutating animation state.
          depths[slot].value = withTiming(0, { duration: REDUCED_MS });
        }
        return;
      }
      if (fanned.value === 1 || value < FAN_OUT_POINT) return;

      fanned.value = 1;
      const to = targets.value;
      for (let slot = 0; slot < to.length; slot += 1) {
        const target = to[slot];
        if (target < 0) continue;
        depths[slot].value = reduceMotion
          ? withTiming(target, { duration: REDUCED_MS })
          : withDelay(target * FAN_OUT_STAGGER, withSpring(target, spring.card));
      }
    },
    [depths, reduceMotion],
  );

  const finishExit = useCallback(
    (index: number, intent: SwipeIntent, last: boolean) => {
      onResolved(index, intent, last);
      setExitingIndex(-1);
    },
    [onResolved],
  );

  const startExit = useCallback(
    (index: number, intent: SwipeIntent) => {
      if (index < 0 || exitingIndex >= 0) return;
      const last = order.length <= 1;

      setExitingIndex(index);
      tapSelection();
      onExitStart?.(index, intent);

      // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValues are mutable animation state.
      exitDirection.value = intent === 'queue' ? 1 : -1;
      // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValues are mutable animation state.
      exit.value = 0;
      exit.value = withTiming(
        1,
        { duration: reduceMotion ? REDUCED_MS : duration.settle },
        (finished) => {
          if (finished) runOnJS(finishExit)(index, intent, last);
        },
      );
    },
    [exitingIndex, order, exit, exitDirection, reduceMotion, onExitStart, finishExit],
  );

  const settleBack = useCallback(() => {
    'worklet';
    // eslint-disable-next-line react-hooks/immutability -- This callback is a Reanimated worklet mutating animation state.
    lift.value = reduceMotion
      ? withTiming(0, { duration: REDUCED_MS })
      : withSpring(0, spring.card);
    // eslint-disable-next-line react-hooks/immutability -- This callback is a Reanimated worklet mutating animation state.
    swipeX.value = reduceMotion
      ? withTiming(0, { duration: REDUCED_MS })
      : withSpring(0, spring.card);
  }, [lift, swipeX, reduceMotion]);

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled && front >= 0 && exiting < 0)
        // Horizontal intent only. Vertical belongs to the card's own scroll and
        // to the expansion pan the avatar owns, so hit-testing keeps the axes
        // apart without either gesture having to yield.
        .activeOffsetX([-12, 12])
        .failOffsetY([-24, 24])
        .onUpdate((event) => {
          // eslint-disable-next-line react-hooks/immutability -- This callback is a Reanimated worklet mutating animation state.
          swipeX.value = event.translationX;
          // eslint-disable-next-line react-hooks/immutability -- This callback is a Reanimated worklet mutating animation state.
          lift.value = Math.min(1, Math.abs(event.translationX) / SWIPE_TRAVEL);
        })
        .onEnd((event) => {
          const dx = event.translationX;
          const vx = event.velocityX;
          const flicked = Math.abs(vx) > FLICK_VELOCITY;
          // A flick and a drag can disagree about direction near the turn; the
          // flick wins, because it is the more deliberate of the two.
          const direction = flicked ? Math.sign(vx) : Math.sign(dx);
          const committed = direction !== 0 && (flicked || Math.abs(dx) >= SWIPE_TRIGGER);

          if (committed) {
            // The travel stays where the thumb left it: the exit picks the
            // sheet up from there rather than snapping it back first.
            runOnJS(startExit)(front, direction > 0 ? 'queue' : 'dismiss');
            return;
          }
          settleBack();
        })
        .onFinalize((_event, success) => {
          if (!success) settleBack();
        }),
    [enabled, front, exiting, lift, swipeX, settleBack, startExit],
  );

  const tilts = useMemo(
    () => seeds.map((seed, index) => (reduceMotion ? 0 : seedTiltFor(seed, index))),
    [seeds, reduceMotion],
  );

  const depthOf = useCallback(
    (index: number) => depths[Math.min(Math.max(index, 0), SHEET_SLOTS - 1)],
    [depths],
  );

  const tiltOf = useCallback((index: number) => tilts[index] ?? 0, [tilts]);

  const onPeekLayout = useCallback((height: number) => {
    setPeekStep((current) => {
      const next = clampPeekStep(height);
      return next === current ? current : next;
    });
  }, []);

  const bringToFront = useCallback((index: number) => {
    setOrder((current) => nextOrder(current, { type: 'bringToFront', index }));
  }, []);

  const dismissFront = useCallback(() => {
    startExit(front, 'dismiss');
  }, [startExit, front]);

  const queueFront = useCallback(() => {
    startExit(front, 'queue');
  }, [startExit, front]);

  return {
    order,
    front,
    keptCount: order.length,
    exiting,
    depthOf,
    lift,
    swipeX,
    exit,
    exitDirection,
    swipeGesture,
    tiltOf,
    peekStep,
    onPeekLayout,
    bringToFront,
    dismissFront,
    queueFront,
  };
}
