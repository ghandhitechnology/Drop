/**
 * The drawn scenes of the first run, as clean geometry.
 *
 * Both are authored here rather than inside the components so the shapes can be
 * reasoned about — and checked — without a renderer. Roughness is never baked
 * into these paths: `HandPath` puts the hand into every one of them at draw
 * time, which is why a mark drawn at 24dp and the same mark at 220dp carry the
 * same amount of wobble rather than a scaled copy of it.
 */
import { Skia, type SkPath } from '@shopify/react-native-skia';

import { mulberry32 } from '../../drawing/seededRandom';

const TAU = Math.PI * 2;

/* ------------------------------------------------------------ a teardrop */

/** A drop is this much taller than it is wide. */
const DROP_ASPECT = 0.78;

/**
 * One water drop: a point at the top, two shoulders, a round base.
 *
 * Four cubics and a close. Drawn as an outline rather than a fill so it reads
 * as a pencil mark at any size.
 *
 * The apex is what makes it water. Its two control points sit close to the
 * vertical axis and high above the widest point, which leaves the curve almost
 * vertical as it leaves the tip; pulling them outward — the obvious way to
 * write this — rounds the top over and the drop turns into a pebble. The widest
 * point sits below the middle, so the mass hangs low the way a falling drop's
 * does.
 */
export function dropPath(cx: number, cy: number, height: number): SkPath {
  const h = height;
  const w = height * DROP_ASPECT;
  const top = cy - h / 2;
  const bottom = cy + h / 2;
  const right = cx + w / 2;
  const left = cx - w / 2;
  /** Where the drop is widest, measured down from its centre. */
  const waist = cy + h * 0.14;

  return Skia.PathBuilder.Make()
    .moveTo(cx, top)
    .cubicTo(cx + w * 0.1, cy - h * 0.28, right, cy - h * 0.06, right, waist)
    .cubicTo(right, cy + h * 0.38, cx + w * 0.3, bottom, cx, bottom)
    .cubicTo(cx - w * 0.3, bottom, left, cy + h * 0.38, left, waist)
    .cubicTo(left, cy - h * 0.06, cx - w * 0.1, cy - h * 0.28, cx, top)
    .close()
    .detach();
}

/* --------------------------------------------------- screen one: the ring */

export type RingDrop = {
  path: SkPath;
  /** Stable per-drop seed, so the same drop always wobbles the same way. */
  seed: number;
  /** Thicker for the near drops, finer for the far ones. */
  strokeScale: number;
};

/** How many drops rise around Drop. Odd, so one sits square over the head. */
export const RING_COUNT = 7;

/**
 * The hidden water, made visible.
 *
 * Seven drops on an arc that opens over Drop's head — the shape of something
 * rising off an ordinary object. They are generated left to right, which is the
 * order they draw on in, so the sequence reads as one sweep of the hand rather
 * than seven separate marks.
 *
 * Sizes and radii carry a seeded wobble. A perfect arc of identical drops is a
 * loading spinner; a slightly uneven one is a sketch.
 */
export function ringDrops(scene: number, seed = 0x0d20b): RingDrop[] {
  const random = mulberry32(seed);
  const cx = scene / 2;
  const cy = scene / 2;
  const radius = scene * 0.395;

  // From lower-left, over the top, to lower-right. Degrees, screen space.
  const from = 168;
  const to = 12;

  const drops: RingDrop[] = [];
  for (let i = 0; i < RING_COUNT; i += 1) {
    const t = i / (RING_COUNT - 1);
    const degrees = from + (to - from) * t;
    const radians = (degrees / 360) * TAU;

    // The centre drops ride a little higher and larger: the arc has a crest.
    const crest = Math.sin(t * Math.PI);
    const r = radius * (0.94 + crest * 0.1 + (random() - 0.5) * 0.06);
    // Sizes have a floor for a reason found on the device. `HandPath`'s jitter
    // is a fixed amount of path-space wobble, so it is a larger *share* of a
    // small shape: below about 30dp it rounds the drop's apex off and the mark
    // reads as a pebble. The smallest drop in the ring is kept above that.
    const height = scene * (0.1 + crest * 0.055 + (random() - 0.5) * 0.014);

    drops.push({
      path: dropPath(cx + Math.cos(radians) * r, cy - Math.sin(radians) * r, height),
      seed: (seed + i * 977) >>> 0,
      strokeScale: 0.62 + crest * 0.28,
    });
  }
  return drops;
}

/* -------------------------------------------- screen two: the viewfinder */

export type Bracket = { path: SkPath; seed: number };

/**
 * Four corner marks — the frame a camera puts around whatever it is looking at.
 *
 * Each corner is its own contour so the four can draw on one after another;
 * a single path would have trimmed as one continuous stroke and the frame
 * would have appeared to be drawn by someone in a hurry.
 *
 * Order is clockwise from the top-left, which is where a hand starts a box.
 */
export function viewfinderBrackets(
  scene: number,
  inset = 0.06,
  armRatio = 0.22,
  seed = 0x5ca77,
): Bracket[] {
  const a = scene * inset;
  const b = scene - a;
  const arm = scene * armRatio;

  const corners: [number, number, number, number][] = [
    // [x, y, dx, dy] — the corner point and the direction its arms run.
    [a, a, 1, 1],
    [b, a, -1, 1],
    [b, b, -1, -1],
    [a, b, 1, -1],
  ];

  return corners.map(([x, y, dx, dy], index) => ({
    path: Skia.PathBuilder.Make()
      .moveTo(x + dx * arm, y)
      .lineTo(x, y)
      .lineTo(x, y + dy * arm)
      .detach(),
    seed: (seed + index * 613) >>> 0,
  }));
}

/* --------------------------------------------- screen three: the week mark */

export type WeekStroke = { path: SkPath; seed: number; strokeScale: number };

/** Where the track sits in the scene, and how tall it is drawn. */
const TRACK_Y = 0.78;
const TRACK_HEIGHT = 0.075;
const TRACK_INSET = 0.06;
/** How much of the track the example week has taken. */
const EXAMPLE_FILL = 0.56;
/** Where the example week ought to be by now — the notch, past the fill. */
const EXAMPLE_PACE = 0.71;

/**
 * The bar the record will show, drawn once at scene size.
 *
 * This screen is teaching one thing, and the honest way to teach it is to draw
 * the thing itself rather than a metaphor for it. So the marks here are the
 * same three the real bar is made of — the track whose far end is the mark, the
 * week coloured in, and the notch for where the week ought to stand — and a
 * person meeting the bar in their record afterwards has already seen it.
 *
 * Ordered the way a hand would lay them down: the box first, then what is in
 * it, then the annotation on top.
 */
export function weekMarks(scene: number, seed = 0x9ee4b): WeekStroke[] {
  const height = scene * TRACK_HEIGHT;
  const radius = height / 2;
  const top = scene * TRACK_Y - radius;
  const bottom = top + height;
  const left = scene * TRACK_INSET;
  const right = scene - left;
  const run = right - left;

  const track = Skia.PathBuilder.Make()
    .moveTo(left + radius, top)
    .lineTo(right - radius, top)
    .arcToOval({ x: right - height, y: top, width: height, height }, -90, 180, false)
    .lineTo(left + radius, bottom)
    .arcToOval({ x: left, y: top, width: height, height }, 90, 180, false)
    .close()
    .detach();

  /**
   * The week, coloured in as a hand does it: passes back and forth inside the
   * track rather than a flooded rectangle. Three of them is enough at this size
   * — the scene is a drawing, and the real bar carries the finer version.
   */
  const filled = left + run * EXAMPLE_FILL;
  const body = Skia.PathBuilder.Make();
  const passes = 3;
  for (let index = 0; index < passes; index += 1) {
    const y = top + height * ((index + 0.5) / passes);
    if (index % 2 === 0) body.moveTo(left + radius * 0.6, y).lineTo(filled, y);
    else body.moveTo(filled, y).lineTo(left + radius * 0.6, y);
  }

  const paceX = left + run * EXAMPLE_PACE;
  const notch = Skia.PathBuilder.Make()
    .moveTo(paceX, top - height * 0.42)
    .lineTo(paceX, bottom + height * 0.42)
    .detach();

  return [
    { path: track, seed: (seed + 0) >>> 0, strokeScale: 0.8 },
    { path: body.detach(), seed: (seed + 811) >>> 0, strokeScale: height * 0.22 },
    { path: notch, seed: (seed + 1622) >>> 0, strokeScale: 1.1 },
  ];
}

