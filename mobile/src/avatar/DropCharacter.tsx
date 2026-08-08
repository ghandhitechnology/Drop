import {
  Canvas,
  ColorMatrix,
  FilterMode,
  Group,
  Image,
  MipmapMode,
  MitchellCubicSampling,
  type SkImage,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  PixelRatio,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useColors } from '../design/theme';
import { useMotion } from '../design/useMotion';
import { mulberry32, seedFromString } from '../drawing/seededRandom';
import { Touch } from '../ui/Touch';
import { useCharacterImages } from './characterImages';
import { avatarCopy } from './copy';
import { BURST_MS, CelebrationSparks, ThinkingRipple } from './effects';
import {
  CELEBRATION_PEAK_MS,
  poseFor,
  type CharacterState,
  type PoseId,
} from './poses';
import { sharpenFor, tintMatrix } from './tint';

export type DropCharacterProps = {
  /** What Drop is doing. Drives the pose and the marks around it. */
  state?: CharacterState;
  /** Box the avatar occupies, in dp. 24 for history rows, 64 default, 200 hero. */
  size?: number;
  /**
   * Stable seed. Idle tilts, the presenting variant, and spark angles all come
   * from this, so a given item's Drop always behaves the same way.
   */
  seed?: number | string;
  /** Makes the avatar a button. Without it the avatar reads as an image. */
  onPress?: () => void;
  /** Announce state changes to the screen reader. */
  announce?: boolean;
  /** Overrides the spoken label. */
  label?: string;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
};

/** Fraction of the box left free around the character for the orbiting marks. */
const EFFECT_PAD = 0.14;
/** Reference box the stroke weights were tuned against. */
const REFERENCE_SIZE = 64;
/** Breathing depth, as a fraction of height. */
const BREATH = 0.03;
/** The kick a pose change gives the body before it springs back. */
const POSE_SQUASH = 1.07;
/**
 * Below this size the idle loops are switched off.
 *
 * At 24dp a 3% breath moves an edge by half a pixel and a 2° tilt by less than
 * one — nobody sees it, and a Skia canvas that animates never stops redrawing.
 * A list of row avatars should cost nothing once it has drawn.
 */
const LIFE_MIN_SIZE = 40;
const DEG = Math.PI / 180;

/**
 * Drop, drawn.
 *
 * One Skia canvas holds the whole avatar — the tinted pose, the crossfade
 * between poses, the squash-and-stretch, and the marks that orbit it. Keeping
 * it to a single canvas means a screenful of these costs one surface each
 * rather than one per layer.
 *
 * The canvas is decoration. Every word about it lives in a sibling view that
 * the screen reader actually reaches.
 */
export function DropCharacter({
  state = 'idle',
  size = 64,
  seed = 'drop',
  onPress,
  announce = true,
  label,
  style,
  testID,
}: DropCharacterProps) {
  const colors = useColors();
  const motion = useMotion();
  const images = useCharacterImages();
  const reduceMotion = motion.reduceMotion;

  const seedNumber = useMemo(
    () => (typeof seed === 'number' ? seed >>> 0 : seedFromString(seed)),
    [seed],
  );

  /* ------------------------------------------------------- pose selection */

  // The celebration peaks, then settles into a wave.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (state !== 'celebrating') {
      setSettled(false);
      return;
    }
    setSettled(false);
    const timer = setTimeout(() => setSettled(true), CELEBRATION_PEAK_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const pose = poseFor(state, seedNumber, settled);

  // The outgoing pose is kept so the two can cross-fade. Adjusting during
  // render rather than in an effect means the pair is never a frame stale.
  const [pair, setPair] = useState<{ from: PoseId; to: PoseId }>({
    from: pose,
    to: pose,
  });
  if (pair.to !== pose) {
    setPair({ from: pair.to, to: pose });
  }
  const crossfading = pair.from !== pair.to;

  /* ------------------------------------------------------------- geometry */

  const geometry = useMemo(() => {
    const pad = size * EFFECT_PAD;
    const box = { x: pad, y: pad, width: size - pad * 2, height: size - pad * 2 };
    return {
      box,
      centre: { x: size / 2, y: size / 2 },
      // Everything pivots on the feet, so a squash presses Drop into the
      // ground instead of sliding it around.
      feet: { x: size / 2, y: box.y + box.height },
      // Marks thicken with the avatar, but on the square root — at 200dp a
      // linear scale gives a 7dp ripple against a 3dp character outline.
      strokeScale: Math.max(0.55, Math.sqrt(size / REFERENCE_SIZE)),
    };
  }, [size]);

  /* -------------------------------------------------------------- motion */

  const fade = useSharedValue(1);
  const squash = useSharedValue(1);
  const breath = useSharedValue(0);
  const tilt = useSharedValue(0);
  const burst = useSharedValue(1);

  const crossfadeMs = motion.ms('quick') || 1;

  // Crossfade plus the squash kick, on every pose change. Once the fade lands,
  // the outgoing pose is dropped so steady states draw a single image.
  useEffect(() => {
    if (!crossfading) {
      fade.value = 1;
      return;
    }

    fade.value = 0;
    fade.value = withTiming(1, {
      duration: crossfadeMs,
      easing: Easing.inOut(Easing.quad),
    });

    if (!reduceMotion) {
      squash.value = withSequence(
        withTiming(POSE_SQUASH, {
          duration: 70,
          easing: Easing.out(Easing.quad),
        }),
        withSpring(1, motion.springOf('drop')),
      );
    }

    const collapse = setTimeout(() => {
      setPair((current) =>
        current.from === current.to
          ? current
          : { from: current.to, to: current.to },
      );
    }, crossfadeMs + 20);
    return () => clearTimeout(collapse);
    // `motion` is rebuilt every render; the pose pair is what should retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair, crossfading, crossfadeMs, reduceMotion]);

  // Breathing. Resting breathes slower, the way a sleeping animal does.
  const alive = !reduceMotion && size >= LIFE_MIN_SIZE;
  const breathMs = state === 'resting' ? 2600 : 1700;
  useEffect(() => {
    cancelAnimation(breath);
    if (!alive) {
      breath.value = 0;
      return;
    }
    // A seeded head start keeps a row of Drops from breathing in unison.
    const phase = mulberry32((seedNumber ^ 0x5bf0) >>> 0)();
    breath.value = 0;
    breath.value = withDelay(
      Math.round(phase * breathMs),
      withRepeat(
        withTiming(1, { duration: breathMs, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(breath);
  }, [alive, breathMs, seedNumber, breath]);

  // An occasional tilt of the head, on a seeded rhythm.
  useEffect(() => {
    if (!alive) {
      tilt.value = 0;
      return;
    }
    const random = mulberry32((seedNumber ^ 0x2f19) >>> 0);
    const spring = motion.springOf('drop');
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          const direction = random() < 0.5 ? -1 : 1;
          const amount = (1.2 + random() * 0.8) * DEG * direction;
          tilt.value = withSequence(
            withSpring(amount, spring),
            withSpring(0, spring),
          );
          schedule();
        },
        4000 + random() * 3000,
      );
    };
    schedule();
    return () => {
      clearTimeout(timer);
      cancelAnimation(tilt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alive, seedNumber]);

  // The celebration burst fires once, on entering the state.
  const sparking = state === 'celebrating' && !reduceMotion;
  useEffect(() => {
    if (!sparking) return;
    burst.value = 0;
    burst.value = withTiming(1, {
      duration: BURST_MS,
      easing: Easing.out(Easing.quad),
    });
  }, [sparking, burst]);

  const body = useDerivedValue(() => {
    'worklet';
    const b = breath.value;
    return [
      { rotate: tilt.value },
      { scaleX: (1 - BREATH * 0.5 * b) / squash.value },
      { scaleY: (1 + BREATH * b) * squash.value },
    ];
  });

  const fadeOut = useDerivedValue(() => {
    'worklet';
    return 1 - fade.value;
  });

  /* ------------------------------------------------------- accessibility */

  const spoken = label ?? avatarCopy.state[state];
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (announce) AccessibilityInfo.announceForAccessibility(spoken);
  }, [spoken, announce]);

  /* ---------------------------------------------------------------- draw */

  return (
    <View style={[{ width: size, height: size }, style]} testID={testID}>
      <Canvas
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Group transform={body} origin={geometry.feet}>
          {crossfading && (
            <Pose
              image={images[pair.from]}
              box={geometry.box}
              color={colors.ink}
              opacity={fadeOut}
            />
          )}
          <Pose
            image={images[pair.to]}
            box={geometry.box}
            color={colors.ink}
            opacity={crossfading ? fade : undefined}
          />
        </Group>

        {state === 'thinking' && (
          <ThinkingRipple
            cx={geometry.centre.x}
            cy={geometry.centre.y}
            radius={size * 0.4}
            color={colors.accent}
            strokeScale={geometry.strokeScale}
            seed={seedNumber & 0xffff}
            reduceMotion={reduceMotion}
          />
        )}

        {sparking && (
          <CelebrationSparks
            cx={geometry.centre.x}
            cy={geometry.centre.y}
            radius={size * 0.36}
            color={colors.accent}
            strokeScale={geometry.strokeScale}
            seed={seedNumber & 0xffff}
            burst={burst}
          />
        )}
      </Canvas>

      {onPress ? (
        <Touch
          onPress={onPress}
          style={styles.fill}
          accessibilityRole="button"
          accessibilityLabel={spoken}
          accessibilityHint={avatarCopy.openHint}
        />
      ) : (
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          accessible
          accessibilityRole="image"
          accessibilityLabel={spoken}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});

/* ------------------------------------------------------------------ parts */

type Box = { x: number; y: number; width: number; height: number };

type PoseProps = {
  image: SkImage | null;
  box: Box;
  color: string;
  opacity?: SharedValue<number>;
};

const DENSITY = PixelRatio.get();

/**
 * One pose, tinted and placed.
 *
 * The destination rect is computed rather than left to `fit`, so the character
 * is centred horizontally and stands on the bottom of the box. Poses differ in
 * aspect — sleeping is wide and short, cheering is tall — and aligning them by
 * the ground keeps the feet still through a crossfade.
 */
function Pose({ image, box, color, opacity }: PoseProps) {
  const placement = useMemo(() => {
    if (!image) return null;
    const sourceW = image.width();
    const sourceH = image.height();
    const scale = Math.min(box.width / sourceW, box.height / sourceH);
    const width = sourceW * scale;
    const height = sourceH * scale;
    // Sharpening and sampling are decided in device pixels, which is the only
    // place the question "is this an upscale?" has a real answer.
    const drawnPx = height * DENSITY;
    return {
      x: box.x + (box.width - width) / 2,
      y: box.y + box.height - height,
      width,
      height,
      sharpen: sharpenFor(drawnPx, sourceH),
      upscaling: drawnPx > sourceH,
    };
  }, [image, box.x, box.y, box.width, box.height]);

  const matrix = useMemo(
    () => tintMatrix(color, placement?.sharpen ?? 1),
    [color, placement?.sharpen],
  );

  // Mitchell for the hero-sized upscale — Catmull-Rom's negative lobes ring on
  // 2px-wide ink lines and turn the source grid into visible stair-steps. A
  // mipmap chain handles the small end, where the art is being reduced.
  const sampling = useMemo(
    () =>
      placement?.upscaling
        ? MitchellCubicSampling
        : { filter: FilterMode.Linear, mipmap: MipmapMode.Linear },
    [placement?.upscaling],
  );

  if (!image || !placement) return null;

  return (
    <Group opacity={opacity}>
      <Image
        image={image}
        x={placement.x}
        y={placement.y}
        width={placement.width}
        height={placement.height}
        fit="fill"
        sampling={sampling}
      >
        <ColorMatrix matrix={matrix} />
      </Image>
    </Group>
  );
}
