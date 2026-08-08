/**
 * The two drawings of the first run.
 *
 * Each is one Skia canvas with the character standing in the middle of it, and
 * each is driven by a single 0 → 1 shared value the flow owns. Nothing here
 * loops: the marks arrive once, land, and then the screen is still. A welcome
 * that keeps moving is a welcome nobody finishes reading.
 *
 * Both canvases are decoration end to end. Every word belongs to the flow.
 */
import { Canvas } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { DropCharacter } from '../../avatar';
import { useColors } from '../../design/theme';
import { HandPath, type HandVariant } from '../../drawing/HandPath';
import { ringDrops, viewfinderBrackets, weekMarks } from './marks';

/** The character's share of the scene's width, per screen.
 *
 * Drop stands full size in the ring of water, and smaller inside the
 * viewfinder — the frame is a camera looking at it from across a room, and a
 * character that fills its own viewfinder is not being looked at, it is
 * standing in front of a box.
 */
const AVATAR_SHARE = 0.5;
const FRAMED_SHARE = 0.4;

export type SceneProps = {
  /** Side of the square the scene is drawn into, in dp. */
  size: number;
  /** 0 before the marks are drawn, 1 once they all are. */
  progress: SharedValue<number>;
};

/* -------------------------------------------------------------- one mark */

type MarkProps = {
  path: Parameters<typeof HandPath>[0]['path'];
  color: string;
  seed: number;
  strokeScale: number;
  variant?: HandVariant;
  progress: SharedValue<number>;
  /** Where in the sequence this mark starts, and how long it takes. */
  from: number;
  span: number;
};

/**
 * One stroke of the scene, drawn on.
 *
 * The window is clamped rather than eased here: the easing lives once, on the
 * flow's timing curve, so all the marks share one hand speed. Easing each mark
 * separately makes a sequence where every stroke slows down at its own end,
 * which reads as hesitation.
 */
function Mark({
  path,
  color,
  seed,
  strokeScale,
  variant = 'pencil',
  progress,
  from,
  span,
}: MarkProps) {
  const end = useDerivedValue(() => {
    'worklet';
    const t = (progress.value - from) / span;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  });

  return (
    <HandPath
      path={path}
      color={color}
      variant={variant}
      seed={seed}
      strokeScale={strokeScale}
      end={end}
    />
  );
}

/* ----------------------------------------------- screen one: rising water */

/** Gap between two drops starting, and how long each one takes. */
const RING_STEP = 0.09;
const RING_SPAN = 0.36;

/**
 * Drop, standing in the water nobody sees.
 *
 * Seven drops rise around the character in one sweep. This is the product's
 * whole claim in a single gesture, so it is the only thing on the screen that
 * moves, and it moves exactly once.
 */
export function RisingWater({ size, progress }: SceneProps) {
  const colors = useColors();
  const drops = useMemo(() => ringDrops(size), [size]);
  const avatar = Math.round(size * AVATAR_SHARE);

  return (
    <View style={{ width: size, height: size }}>
      <Canvas
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {drops.map((drop, index) => (
          <Mark
            key={index}
            path={drop.path}
            color={colors.accent}
            seed={drop.seed}
            strokeScale={drop.strokeScale}
            progress={progress}
            from={index * RING_STEP}
            span={RING_SPAN}
          />
        ))}
      </Canvas>

      <View style={styles.centre} pointerEvents="none">
        <DropCharacter state="idle" size={avatar} seed="onboarding/promise" announce={false} label="" />
      </View>
    </View>
  );
}

/* ------------------------------------------------ screen two: the ask */

const BRACKET_STEP = 0.16;
const BRACKET_SPAN = 0.4;

/**
 * Drop inside a viewfinder, being looked at.
 *
 * The frame draws corner by corner, clockwise from the top left, which is the
 * order a hand draws a box in.
 */
export function Viewfinder({ size, progress }: SceneProps) {
  const colors = useColors();
  const brackets = useMemo(() => viewfinderBrackets(size), [size]);
  const avatar = Math.round(size * FRAMED_SHARE);

  return (
    <View style={{ width: size, height: size }}>
      <Canvas
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {brackets.map((bracket, index) => (
          <Mark
            key={index}
            path={bracket.path}
            color={colors.accent}
            seed={bracket.seed}
            strokeScale={1.15}
            progress={progress}
            from={index * BRACKET_STEP}
            span={BRACKET_SPAN}
          />
        ))}
      </Canvas>

      <View style={styles.centre} pointerEvents="none">
        {/*
          The same front-facing pose as the promise screen, deliberately. This
          sentence is Drop asking *you* for something, and a character asking
          for something looks at the person it is asking. The pointing pose was
          livelier and aimed its arm at empty frame.
        */}
        <DropCharacter state="idle" size={avatar} seed="onboarding/ask" announce={false} label="" />
      </View>
    </View>
  );
}

/* ------------------------------------------- screen three: the week mark */

const WEEK_STEP = 0.2;
const WEEK_SPAN = 0.44;
/** The character stands above the bar rather than in the middle of the scene. */
const STANDING_SHARE = 0.42;

/**
 * Drop standing over the bar its record will carry.
 *
 * The track draws first, then the week fills into it, then the notch lands on
 * top — which is the order the marks mean something in, and the order a hand
 * would make them.
 *
 * Drop is presenting here rather than idle. The other two screens are the
 * product talking about itself; this one is showing a person a thing, and the
 * character's job on it is to point at the thing.
 */
export function WeekMark({ size, progress }: SceneProps) {
  const colors = useColors();
  const strokes = useMemo(() => weekMarks(size), [size]);
  const avatar = Math.round(size * STANDING_SHARE);

  return (
    <View style={{ width: size, height: size }}>
      <Canvas
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {strokes.map((stroke, index) => (
          <Mark
            key={index}
            path={stroke.path}
            // The track is furniture and the notch is the annotation; only the
            // week itself is ink, exactly as in the record.
            color={index === 2 ? colors.accent : index === 1 ? colors.ink : colors.inkFaint}
            seed={stroke.seed}
            strokeScale={stroke.strokeScale}
            variant={index === 0 ? 'pencil' : 'crayon'}
            progress={progress}
            from={index * WEEK_STEP}
            span={WEEK_SPAN}
          />
        ))}
      </Canvas>

      <View style={styles.standing} pointerEvents="none">
        <DropCharacter
          state="presenting"
          size={avatar}
          seed="onboarding/mark"
          announce={false}
          label=""
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The bar occupies the lower fifth of the scene, so the character stands in
  // what is left above it rather than on top of the drawing it is presenting.
  standing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: '32%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
