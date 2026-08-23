/**
 * One number runs the signature moment.
 *
 * `expansion` travels 0 → 1 and everything downstream reads from it: the rays
 * drawing themselves out and erasing behind, the silhouette morphing into the
 * card frame, Drop shrinking and docking, the card's fill and its content
 * arriving. Nothing else is animated independently, so a half-open card is a
 * real, legible state rather than a frame caught between two animations.
 *
 * A finger can hold that number anywhere. Swiping up on Drop scrubs the whole
 * expansion under the thumb; letting go below the commit point runs it
 * backwards. A tap springs it open.
 */

import { useEffect } from 'react';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import {
  runOnJS,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { duration, spring } from '../../design/motion';

/** Thumb travel, in dp, that carries the expansion from shut to open. */
export const SCRUB_TRAVEL = 220;

/** Release below this and the card falls closed again. */
export const COMMIT_POINT = 0.4;

/** A flick this fast commits regardless of how far it got. */
const FLICK_VELOCITY = 700;

/** Reduced motion still changes state — it just arrives without the journey. */
const REDUCED_MS = 120;

export type ExpansionOptions = {
  /** True when the machine says the result is open. */
  open: boolean;
  /** False while the pipeline is still working, or when there is no result. */
  enabled: boolean;
  /** Called when a gesture commits to open. */
  onOpen: () => void;
  /** Called when a gesture commits to closed. */
  onClose: () => void;
  reduceMotion: boolean;
};

export type Expansion = {
  expansion: SharedValue<number>;
  /** 1 while a finger is on it. Lets the rest of the screen stop guessing. */
  scrubbing: SharedValue<number>;
  gesture: GestureType;
};

export function useExpansion({
  open,
  enabled,
  onOpen,
  onClose,
  reduceMotion,
}: ExpansionOptions): Expansion {
  const expansion = useSharedValue(0);
  const scrubbing = useSharedValue(0);
  const origin = useSharedValue(0);

  /**
   * Settle to one end. Reduced motion takes the same trip in 120ms with no
   * overshoot, which keeps the end state identical and the journey brief.
   */
  const settle = (value: SharedValue<number>, to: number, reduced: boolean) => {
    'worklet';
    value.value = reduced
      ? withTiming(to, { duration: REDUCED_MS })
      : withSpring(to, spring.card);
  };

  // The machine is the source of truth. Buttons, back-outs and the pipeline all
  // move it, and the expansion follows whenever a finger is off the glass.
  useEffect(() => {
    if (scrubbing.value === 1) return;
    const to = open ? 1 : 0;
    if (reduceMotion) {
      expansion.value = withTiming(to, { duration: REDUCED_MS });
    } else {
      expansion.value = withSpring(to, spring.card);
    }
  }, [open, reduceMotion, expansion, scrubbing]);

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetY([-8, 8])
    .onBegin(() => {
      origin.value = expansion.value;
      // eslint-disable-next-line react-hooks/immutability -- This callback is a Reanimated worklet mutating animation state.
      scrubbing.value = 1;
    })
    .onUpdate((event) => {
      const travelled = -event.translationY / SCRUB_TRAVEL;
      // eslint-disable-next-line react-hooks/immutability -- This callback is a Reanimated worklet mutating animation state.
      expansion.value = Math.min(1, Math.max(0, origin.value + travelled));
    })
    .onEnd((event) => {
      const flicked = event.velocityY < -FLICK_VELOCITY;
      const dropped = event.velocityY > FLICK_VELOCITY;
      const shouldOpen = dropped ? false : flicked || expansion.value >= COMMIT_POINT;

      settle(expansion, shouldOpen ? 1 : 0, reduceMotion);
      // eslint-disable-next-line react-hooks/immutability -- This callback is a Reanimated worklet mutating animation state.
      scrubbing.value = 0;

      if (shouldOpen !== open) {
        runOnJS(shouldOpen ? onOpen : onClose)();
      }
    })
    .onFinalize(() => {
      // eslint-disable-next-line react-hooks/immutability -- This callback is a Reanimated worklet mutating animation state.
      scrubbing.value = 0;
    });

  const tap = Gesture.Tap()
    .enabled(enabled)
    .maxDuration(400)
    .onEnd((_event, success) => {
      if (!success) return;
      const shouldOpen = expansion.value < COMMIT_POINT;
      settle(expansion, shouldOpen ? 1 : 0, reduceMotion);
      runOnJS(shouldOpen ? onOpen : onClose)();
    });

  return {
    expansion,
    scrubbing,
    gesture: Gesture.Race(pan, tap) as unknown as GestureType,
  };
}

/** Timings the beats around the expansion share. */
export const beat = {
  /** Drop scaling and fading in over the frozen frame. */
  arrival: 320,
  /** The confirmation tick drawing itself on. */
  tick: 380,
  /** How long the celebration holds before the card recedes. */
  hold: 760,
  /** The cards falling away and the print taking the centre of the stage. */
  center: 380,
  /** How long the freshly written litres hold before the print travels home. */
  carveHold: 640,
  /** The card travelling back to the anchor and dissolving. */
  recede: duration.settle,
  /** How long the way back stays offered. */
  undo: 5000,
} as const;
