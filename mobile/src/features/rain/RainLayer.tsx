/**
 * The wait, drawn.
 *
 * From the instant the print stamps until the answer lands, rain falls behind
 * the frozen frame and pools in the margins. The pool is the only honest thing
 * on screen about how long this is going to take: half the stage is the whole
 * of whatever budget this run signed up for, so the same height always means
 * the same fraction of the way through, whether the run is a barcode's eight
 * seconds or a photograph's thirty.
 *
 * Three rules hold the layer to its place.
 *
 * It never appears over a live viewfinder. Rain on the camera would be weather;
 * rain on a held frame is a clock.
 *
 * It never covers Drop or the line Drop is speaking. Those are the two things
 * the screen exists for, and the height field is given a ceiling under each of
 * them so the water goes round instead — see `dryIslands`.
 *
 * It stops the moment there is a result. Not fades — un-draws, along the same
 * paths it was drawn on, while the card walks in over the top.
 *
 * Everything moves on one clock. The sim runs in a single frame callback on the
 * UI thread, mutating one object in place; the paths are rebuilt from that
 * object inside Skia's own derived values. Nothing here calls `setState` per
 * frame, and once the drain is over the component returns null and costs
 * nothing at all.
 */

import { Canvas, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Easing,
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '../../design/theme';
import { seedFromString } from '../../drawing/seededRandom';
import {
  PULL_ROW,
  TEASER_HEIGHT,
  TEASER_MAX_WIDTH_SHARE,
  type CaptureLayout,
} from '../capture/layout';
import { paceCeilingMs, type CapturePace } from '../capture/pace';
import { crossedStamp, STAMP_CONTACT } from '../result/stamp';
import { dropMark, splashMark, strandMark, surfaceMark } from './marks';
import {
  bandOpacity,
  createRain,
  DRAIN_MS,
  dryIslands,
  eraseJitter,
  eraseReveal,
  repourRain,
  sameGeometry,
  stepRain,
  strandBand,
  STRAND_BANDS,
  type Island,
  type Rain,
  type RainConfig,
  type RainPhase,
} from './sim';

/** Weight of a drawn drop. Bold enough to read as pen, not pencil. */
const STROKE_WIDTH = 2.2;
/** The pool's edge, which is one line under a hundred, so it carries less. */
const SURFACE_STROKE = 1.8;
const SURFACE_OPACITY = 0.42;
const DROP_OPACITY = 0.78;
const SPLASH_OPACITY = 0.5;

/**
 * A frame longer than this was a stall, not a slow frame.
 *
 * Handing the sim the whole gap would teleport every drop through the pool and
 * bank a second of rain in one step. The clock the gauge reads is the same
 * clock, so the lost time is genuinely lost — a run that stalls reads very
 * slightly behind, which is the right way round.
 */
const MAX_FRAME_MS = 100;

/** The layers erase in turn. Drops go first, the tangle next, the edge last. */
const DROPS_ORDER = 0;
const SURFACE_ORDER = STRAND_BANDS + 1;

/** Band indices, deepest first — the order they are painted in. */
const BANDS = Array.from({ length: STRAND_BANDS }, (_, index) => index);

export type PillBox = { x: number; y: number; width: number; height: number };

export type RainLayerProps = {
  /** The capture stage, in its own coordinates — the same space as the anchor. */
  stage: { width: number; height: number };
  /** Where the character stands, the pill's row, and the print's slot. */
  layout: CaptureLayout;
  /**
   * The status pill as it actually measured, in stage coordinates.
   *
   * Null until the first layout pass, and only then. The pill is as wide as its
   * words and the difference matters: reserving the widest it could ever be
   * would hand the water a ceiling across most of the stage for a chip that
   * covers a third of it, and put a shelf of pool — and an umbrella over the
   * rain — out in open air either side of the sentence.
   */
  pill: PillBox | null;
  /** The print's fold. The rain starts when the stamp bites, not before. */
  fold: SharedValue<number>;
  phase: RainPhase;
  pace: CapturePace;
  reduceMotion: boolean;
};

export function RainLayer({
  stage,
  layout,
  pill,
  fold,
  phase,
  pace,
  reduceMotion,
}: RainLayerProps) {
  const { colors } = useTheme();

  /**
   * The sim, created on the UI thread and mutated there for the rest of the
   * run. Reading a shared value that holds an object gives back the object
   * itself on the thread that owns it, so stepping it in place is free —
   * nothing is cloned, and no per-frame assignment crosses the bridge. The
   * clock beside it is what the paths actually watch.
   */
  const rain = useSharedValue<Rain | null>(null);
  const clock = useSharedValue(0);
  const started = useSharedValue(0);
  const drain = useSharedValue(0);

  /** Set once, when the pool has finished leaving. From here the layer is free. */
  const [erased, setErased] = useState(false);

  /**
   * The pill's footprint, measured where it can be and reserved where it
   * cannot. The fallback only stands for the frame or two before the first
   * layout lands, and it is the widest the pill is allowed to get, so the water
   * is never briefly wrong in the direction that would wet the sentence.
   */
  const pillBox = useMemo<PillBox>(
    () =>
      pill ?? {
        x: (stage.width * (1 - TEASER_MAX_WIDTH_SHARE)) / 2,
        y: layout.teaserTop + PULL_ROW,
        width: stage.width * TEASER_MAX_WIDTH_SHARE,
        height: TEASER_HEIGHT,
      },
    [pill, stage.width, layout.teaserTop],
  );

  const islands = useMemo<Island[]>(
    () =>
      dryIslands({
        character: {
          x: layout.bubble.x,
          y: layout.bubble.y,
          side: layout.hero,
        },
        pill: pillBox,
        print: layout.slot,
      }),
    [layout.bubble.x, layout.bubble.y, layout.hero, pillBox, layout.slot],
  );

  const config = useMemo<RainConfig>(
    () => ({
      width: stage.width,
      height: stage.height,
      groundY: stage.height,
      ceilingMs: paceCeilingMs(pace),
      islands,
      seed: seedFromString(`rain/${stage.width}x${stage.height}/${pace}`),
    }),
    [stage.width, stage.height, islands, pace],
  );

  /*
   * The stamp is the starting gun.
   *
   * Rain that began at the shutter would be falling while the print is still in
   * the air, which makes the weather older than the thing it is waiting on. The
   * same crossing test the thump uses fires here, so the first drop and the
   * compression land together. A layer that mounts with the fold already past
   * the mark — a reduced-motion fold jumps it inside one frame — starts on its
   * first reading instead.
   */
  useAnimatedReaction(
    () => fold.value,
    (value, previous) => {
      if (started.value === 1) return;
      if (previous === null ? value >= STAMP_CONTACT : crossedStamp(value, previous)) {
        started.value = 1;
      }
    },
  );

  const frame = useFrameCallback((info) => {
    if (started.value !== 1) return;
    let sim = rain.value;
    if (sim === null) {
      sim = createRain(config);
      rain.value = sim;
    } else if (!sameGeometry(sim.config, config)) {
      // The stage changed shape under a running pool — most often the pill
      // growing or shrinking to a new sentence. The run carries on rather than
      // starting over; see `repourRain`.
      sim = repourRain(sim, config);
      rain.value = sim;
    }
    stepRain(sim, Math.min(info.timeSincePreviousFrame ?? 0, MAX_FRAME_MS));
    clock.value = sim.elapsedMs;
  }, false);

  /*
   * The sim runs only while it is raining, and only while there is something
   * to see. Freezing it for the drain is what makes the erase read as
   * un-drawing: a line being rubbed out has to hold still, or the eye reads a
   * moving thing fading rather than a mark being taken back. It also means the
   * drain costs nothing but the trim, and the drained layer costs nothing.
   */
  useEffect(() => {
    frame.setActive(phase === 'falling' && !reduceMotion && !erased);
  }, [erased, frame, phase, reduceMotion]);

  useEffect(() => {
    if (phase !== 'drain') return;
    drain.value = 0;
    drain.value = withTiming(1, {
      duration: DRAIN_MS,
      easing: Easing.inOut(Easing.quad),
    });
    const done = setTimeout(() => setErased(true), DRAIN_MS + 80);
    return () => clearTimeout(done);
  }, [drain, phase]);

  /*
   * Every path is rebuilt short during the drain rather than trimmed by Skia,
   * so each mark comes apart along its own route while its neighbours are still
   * whole — see `eraseReveal`. That means these read the drain as well as the
   * clock: the sim is frozen by then, and the drain is the only thing moving.
   */
  const dropsPath = useDerivedValue(() => {
    const elapsed = clock.value;
    const erase = drain.value;
    const path = Skia.Path.Make();
    const sim = rain.value;
    if (sim === null) return path;
    for (let i = 0; i < sim.drops.length; i += 1) {
      const drop = sim.drops[i];
      dropMark(path, drop, elapsed, eraseReveal(erase, DROPS_ORDER, eraseJitter(drop.seed)));
    }
    return path;
  });

  const splashesPath = useDerivedValue(() => {
    const elapsed = clock.value;
    const erase = drain.value;
    const path = Skia.Path.Make();
    const sim = rain.value;
    if (sim === null) return path;
    for (let i = 0; i < sim.splashes.length; i += 1) {
      const splash = sim.splashes[i];
      splashMark(
        path,
        splash,
        elapsed,
        eraseReveal(erase, DROPS_ORDER, eraseJitter(splash.seed)),
      );
    }
    return path;
  });

  const surfacePath = useDerivedValue(() => {
    const elapsed = clock.value;
    const erase = drain.value;
    const sim = rain.value;
    if (sim === null) return Skia.Path.Make();
    return surfaceMark(sim, elapsed, eraseReveal(erase, SURFACE_ORDER, 0));
  });

  /*
   * Reduced motion turns the whole thing off rather than slowing it down. A
   * full-stage field of moving marks is precisely what the setting is asking
   * not to be shown, and the wait loses nothing a person cannot read: Drop is
   * still saying what it is doing, in words, right through it.
   */
  if (reduceMotion || phase === 'off' || erased) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas
        style={StyleSheet.absoluteFill}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Path
          path={surfacePath}
          style="stroke"
          strokeWidth={SURFACE_STROKE}
          strokeCap="round"
          strokeJoin="round"
          color={colors.accent}
          opacity={SURFACE_OPACITY}
        />

        {/*
          Freshest band first in erase order, deepest last: the pile comes apart
          from the top down, the way it went on.
        */}
        {BANDS.map((band) => (
          <StrandBand
            key={band}
            rain={rain}
            clock={clock}
            drain={drain}
            band={band}
            color={colors.accent}
          />
        ))}

        <Path
          path={splashesPath}
          style="stroke"
          strokeWidth={STROKE_WIDTH}
          strokeCap="round"
          strokeJoin="round"
          color={colors.accent}
          opacity={SPLASH_OPACITY}
        />

        <Path
          path={dropsPath}
          style="stroke"
          strokeWidth={STROKE_WIDTH}
          strokeCap="round"
          strokeJoin="round"
          color={colors.accent}
          opacity={DROP_OPACITY}
        />
      </Canvas>
    </View>
  );
}

/**
 * One step of the tangle's opacity, as a single path.
 *
 * Collecting the pile by band is what keeps a hundred overlapping threads down
 * to four strokes a frame. The bands also carry the drain's coarse stagger —
 * the pile comes apart from its freshest layer down — while the fine stagger,
 * and the un-drawing itself, happens per thread inside the path.
 */
function StrandBand({
  rain,
  clock,
  drain,
  band,
  color,
}: {
  rain: SharedValue<Rain | null>;
  clock: SharedValue<number>;
  drain: SharedValue<number>;
  band: number;
  color: string;
}) {
  // Order 1 is the freshest band, order STRAND_BANDS the oldest.
  const order = STRAND_BANDS - band;

  const path = useDerivedValue<SkPath>(() => {
    const elapsed = clock.value;
    const erase = drain.value;
    const built = Skia.Path.Make();
    const sim = rain.value;
    if (sim === null) return built;
    for (let i = 0; i < sim.strands.length; i += 1) {
      const strand = sim.strands[i];
      if (strandBand(strand.ageMs) !== band) continue;
      strandMark(
        built,
        strand,
        sim.config.groundY,
        elapsed,
        eraseReveal(erase, order, eraseJitter(strand.seed)),
      );
    }
    return built;
  });

  return (
    <Path
      path={path}
      style="stroke"
      strokeWidth={STROKE_WIDTH}
      strokeCap="round"
      strokeJoin="round"
      color={color}
      opacity={bandOpacity(band)}
    />
  );
}
