/**
 * The rain, as marks on paper.
 *
 * Everything the layer draws is an outline. Not one shape is filled, because a
 * filled drop is a drop and a drawn drop is a drawing of one — and the rest of
 * this app is a drawing. So a falling drop is a small closed loop with a
 * different wobble in it every time, a landed drop keeps that loop as a thread
 * in the pile, and the pool is a hundred such threads overlapping. Read at a
 * glance it is scribbled yarn heaping up in the margins; read closely it is
 * still the drops, which is the point.
 *
 * Each mark is re-seeded on its own slow tick — see `boilSeed` — so the whole
 * field shimmers the way a hand re-inking a page does. Nothing here holds
 * state; every function appends to a path it is handed and returns nothing, so
 * one path per layer per frame is all the allocation there is.
 *
 * Every mark also takes a `reveal`: how much of itself is still on the page.
 * That is the drain, and it is done here rather than with Skia's trim because
 * trim works on a whole path and a layer is one path holding a hundred loops —
 * see `eraseReveal`. Drawing short is what lets each loop retreat along its own
 * route while its neighbours are still whole.
 *
 * All of it runs on the UI thread inside Skia's derived values.
 */

import { Skia, type SkPath } from '@shopify/react-native-skia';

import { mulberry32 } from '../../drawing/seededRandom';
import {
  boilSeed,
  COLUMNS,
  depthAt,
  DROP_BOIL_MS,
  POOL_BOIL_MS,
  splashProgress,
  TERMINAL_VY,
  type Drop,
  type Rain,
  type Splash,
  type Strand,
} from './sim';

/** Corners of a drawn loop. Fewer reads as a lozenge; more reads as a circle. */
const LOOP_POINTS = 7;

/** How far each segment bows out between two corners, as a share of the radius. */
const LOOP_BOW = 0.2;

/** Below this depth the pool is dry and its edge should not be drawn at all. */
const DRY_DEPTH = 1.5;

/**
 * A quadratic from the current point, stopped a fraction of the way along.
 *
 * De Casteljau rather than a straight line to the point: a curve cut short and
 * a curve approximated are the same length and different drawings, and the
 * whole drain is watching this line's shape as it goes.
 */
function partialQuad(
  path: SkPath,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number,
): void {
  'worklet';
  if (t >= 1) {
    path.quadTo(cx, cy, x1, y1);
    return;
  }
  const ax = x0 + (cx - x0) * t;
  const ay = y0 + (cy - y0) * t;
  const bx = cx + (x1 - cx) * t;
  const by = cy + (y1 - cy) * t;
  path.quadTo(ax, ay, ax + (bx - ax) * t, ay + (by - ay) * t);
}

/**
 * A closed loop as a hand draws one.
 *
 * Corners land off an ellipse at wandering angles and wandering radii, and the
 * segments between them bow outward — the same recipe `sketchRect` uses for a
 * box, at the size of a raindrop, where four different corner radii would be
 * invisible and a bowed segment is the only tell that survives.
 *
 * `reveal` cuts the loop short from the end the pen finished on, so a loop
 * coming apart unwinds instead of shrinking or fading.
 */
function loop(
  path: SkPath,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  slack: number,
  reveal: number,
): void {
  'worklet';
  if (reveal <= 0) return;
  const rand = mulberry32(seed);
  const xs: number[] = [];
  const ys: number[] = [];

  for (let i = 0; i < LOOP_POINTS; i += 1) {
    const angle = (i / LOOP_POINTS) * Math.PI * 2 + (rand() - 0.5) * 0.34;
    const reach = 0.78 + rand() * 0.44;
    xs.push(cx + Math.cos(angle) * rx * reach + (rand() - 0.5) * slack);
    ys.push(cy + Math.sin(angle) * ry * reach + (rand() - 0.5) * slack);
  }

  const bow = ((rx + ry) / 2) * LOOP_BOW;
  const drawn = LOOP_POINTS * (reveal < 1 ? reveal : 1);
  path.moveTo(xs[0], ys[0]);
  for (let i = 0; i < LOOP_POINTS; i += 1) {
    const left = drawn - i;
    if (left <= 0) return;
    const j = (i + 1) % LOOP_POINTS;
    const mx = (xs[i] + xs[j]) / 2;
    const my = (ys[i] + ys[j]) / 2;
    const ox = mx - cx;
    const oy = my - cy;
    const run = Math.hypot(ox, oy) || 1;
    partialQuad(
      path,
      xs[i],
      ys[i],
      mx + (ox / run) * bow,
      my + (oy / run) * bow,
      xs[j],
      ys[j],
      left,
    );
    if (left < 1) return;
  }
}

/**
 * One drop, mid-fall.
 *
 * It stretches with speed and pinches sideways as it does — the squash a real
 * drop never has and every drawn one does, because that is how a hand says
 * "falling" without drawing motion lines.
 */
export function dropMark(
  path: SkPath,
  drop: Drop,
  elapsedMs: number,
  reveal: number,
): void {
  'worklet';
  const seed = boilSeed(drop.seed, elapsedMs, DROP_BOIL_MS, drop.boilOffset);
  const speed = Math.min(1, drop.vy / TERMINAL_VY);
  loop(
    path,
    drop.x,
    drop.y,
    drop.size * (1 - speed * 0.28),
    drop.size * (1 + speed * 0.95),
    seed,
    0.5,
    reveal,
  );
}

/** One thread in the pile, at the depth it landed at. */
export function strandMark(
  path: SkPath,
  strand: Strand,
  groundY: number,
  elapsedMs: number,
  reveal: number,
): void {
  'worklet';
  const seed = boilSeed(strand.seed, elapsedMs, POOL_BOIL_MS, strand.boilOffset);
  loop(
    path,
    strand.x,
    groundY - strand.depth,
    strand.width,
    strand.height,
    seed,
    1.1,
    reveal,
  );
}

/**
 * The kick a landing throws up.
 *
 * Two open arms, not a crown: at four dp a crown is a blot, and two strokes
 * leaving the same point is all the eye needs to read impact.
 */
export function splashMark(
  path: SkPath,
  splash: Splash,
  elapsedMs: number,
  reveal: number,
): void {
  'worklet';
  if (reveal <= 0) return;
  const t = splashProgress(splash.ageMs);
  // Staggered off its own seed, like every other mark, so the field never
  // re-inks itself all at once.
  const rand = mulberry32(
    boilSeed(splash.seed, elapsedMs, DROP_BOIL_MS, splash.seed % DROP_BOIL_MS),
  );
  const reach = splash.spread * (1 + t * 1.8);
  // The arms fall back as the splash ages, so it collapses instead of fading
  // while still standing up.
  const rise = reach * (1 - t * 0.55);

  for (let arm = 0; arm < 2; arm += 1) {
    const side = arm === 0 ? -1 : 1;
    const lean = 0.55 + rand() * 0.7;
    const rootX = splash.x + side * splash.spread * 0.3;
    path.moveTo(rootX, splash.y);
    partialQuad(
      path,
      rootX,
      splash.y,
      splash.x + side * reach * lean * 0.4,
      splash.y - rise * 0.95,
      splash.x + side * reach * lean,
      splash.y - rise * 0.15,
      reveal,
    );
  }
}

/**
 * One unbroken stretch of the water's edge, cut short by `reveal`.
 *
 * Each run keeps its own share of the erase rather than the pen working through
 * them left to right: the edge is one line as far as the eye is concerned, and
 * it should leave the page as one line.
 */
function surfaceRun(
  path: SkPath,
  xs: number[],
  ys: number[],
  sag: number[],
  reveal: number,
): void {
  'worklet';
  const segments = xs.length - 1;
  if (segments < 1) return;
  const drawn = segments * (reveal < 1 ? reveal : 1);
  path.moveTo(xs[0], ys[0]);
  for (let i = 0; i < segments; i += 1) {
    const left = drawn - i;
    if (left <= 0) return;
    // The control sits between the two samples and off the line, so the
    // surface reads as a drawn stroke rather than as a chart.
    partialQuad(
      path,
      xs[i],
      ys[i],
      (xs[i] + xs[i + 1]) / 2,
      (ys[i] + ys[i + 1]) / 2 + sag[i + 1],
      xs[i + 1],
      ys[i + 1],
      left,
    );
    if (left < 1) return;
  }
}

/**
 * The water's edge.
 *
 * Drawn in runs rather than as one line: wherever the field is dry — under
 * Drop, and up the banks either side of it — the pen lifts. A surface that ran
 * straight through the dry columns would draw a lid across the character, which
 * is exactly the thing the height field went to the trouble of avoiding.
 */
export function surfaceMark(rain: Rain, elapsedMs: number, reveal: number): SkPath {
  'worklet';
  const path = Skia.Path.Make();
  if (reveal <= 0) return path;

  const { config } = rain;
  const step = config.width / COLUMNS;
  const rand = mulberry32(boilSeed(config.seed, elapsedMs, POOL_BOIL_MS, 0));

  const xs: number[] = [];
  const ys: number[] = [];
  /** How far the control point of the segment ending at each sample sits off the line. */
  const sag: number[] = [];

  for (let i = 0; i <= COLUMNS; i += 1) {
    const x = i * step;
    const depth = depthAt(rain, Math.min(x, config.width - 0.5));

    if (depth < DRY_DEPTH) {
      surfaceRun(path, xs, ys, sag, reveal);
      xs.length = 0;
      ys.length = 0;
      sag.length = 0;
      continue;
    }

    xs.push(x);
    ys.push(config.groundY - depth + (rand() - 0.5) * 1.6);
    sag.push((rand() - 0.5) * 2.2);
  }
  surfaceRun(path, xs, ys, sag, reveal);

  return path;
}
