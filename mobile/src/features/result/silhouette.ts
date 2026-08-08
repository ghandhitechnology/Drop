/**
 * The geometry the signature expansion morphs through.
 *
 * Skia interpolates two paths only when their command structure matches
 * exactly — same verbs, same count, same order. So every shape here is
 * authored to one structure: **moveTo + six cubicTo**, drawn as an open
 * stroke. Two of them tile a closed outline: the upper half runs left-middle
 * over the top to right-middle, the lower half runs right-middle under the
 * bottom back to left-middle. Nothing crosses the waist, so the pair reads as
 * one continuous line rather than two stacked lids.
 *
 * That is what lets Drop's silhouette become the result card's frame in a
 * single interpolation, with no cross-fade and no popping.
 */

import { Skia, type SkPath } from '@shopify/react-native-skia';

import { mulberry32 } from '../../drawing/seededRandom';

export type Box = { x: number; y: number; width: number; height: number };

/** A cubic segment: two controls and an endpoint, in unit coordinates. */
type Cubic = readonly [number, number, number, number, number, number];

/** Kappa — the circle-to-cubic constant, for the card's corner arcs. */
const K = 0.5522847498;

/* ----------------------------------------------------------- silhouette */

/**
 * Drop, reduced to twelve cubics.
 *
 * The upper half carries the head dome and the two ear bumps; the lower half
 * carries the haunches and the flat-footed stance. It is a hippo the way a
 * pebble is a mountain — enough shape to recognise mid-morph, little enough
 * to survive becoming a rectangle.
 *
 * Unit box: x and y both run 0 → 1, y downward.
 */
const DROP_TOP_START = [0.02, 0.52] as const;
const DROP_TOP: readonly Cubic[] = [
  [0.0, 0.44, 0.01, 0.35, 0.06, 0.3], // left cheek rising
  [0.1, 0.24, 0.13, 0.19, 0.2, 0.16], // left shoulder
  [0.25, 0.13, 0.28, 0.07, 0.34, 0.06], // left ear
  [0.42, 0.02, 0.53, 0.01, 0.62, 0.05], // the dome of the head
  [0.74, 0.06, 0.82, 0.11, 0.86, 0.2], // right ear
  [0.93, 0.3, 0.98, 0.4, 0.98, 0.52], // right cheek falling
];

const DROP_BOTTOM_START = [0.98, 0.52] as const;
const DROP_BOTTOM: readonly Cubic[] = [
  [0.98, 0.62, 0.97, 0.69, 0.94, 0.74], // right flank
  [0.9, 0.81, 0.87, 0.87, 0.8, 0.9], // right haunch
  [0.73, 0.93, 0.69, 0.97, 0.62, 0.97], // right foot
  [0.5, 0.99, 0.42, 0.99, 0.34, 0.96], // the belly between the feet
  [0.24, 0.94, 0.17, 0.9, 0.12, 0.82], // left foot
  [0.06, 0.72, 0.02, 0.62, 0.02, 0.52], // left flank
];

function scaleCubic(cubic: Cubic, box: Box): Cubic {
  const px = (u: number) => box.x + u * box.width;
  const py = (v: number) => box.y + v * box.height;
  return [
    px(cubic[0]),
    py(cubic[1]),
    px(cubic[2]),
    py(cubic[3]),
    px(cubic[4]),
    py(cubic[5]),
  ];
}

function scalePoint(point: readonly [number, number], box: Box): [number, number] {
  return [box.x + point[0] * box.width, box.y + point[1] * box.height];
}

/** Drop's outline, upper half, scaled into `box`. */
export function dropTop(box: Box): SkPath {
  return pathFrom(
    scalePoint(DROP_TOP_START, box),
    DROP_TOP.map((cubic) => scaleCubic(cubic, box)),
  );
}

/** Drop's outline, lower half, scaled into `box`. */
export function dropBottom(box: Box): SkPath {
  return pathFrom(
    scalePoint(DROP_BOTTOM_START, box),
    DROP_BOTTOM.map((cubic) => scaleCubic(cubic, box)),
  );
}

/**
 * Drop's whole outline as one closed contour — the shape the paper fill takes
 * before it becomes a card. Twelve cubics, in the same order the two halves
 * are drawn, so the fill and the stroke morph in lockstep.
 */
export function dropOutline(box: Box): SkPath {
  return pathFrom(
    scalePoint(DROP_TOP_START, box),
    [
      ...DROP_TOP.map((cubic) => scaleCubic(cubic, box)),
      ...DROP_BOTTOM.map((cubic) => scaleCubic(cubic, box)),
    ],
    true,
  );
}

/* ---------------------------------------------------------- card frame */

/**
 * A rounded rectangle written in the same hand as the silhouette.
 *
 * Straight runs are cubics with collinear controls, corners are quarter-arc
 * cubics — six of each per half, matching the silhouette segment for segment
 * so the morph feels like one shape relaxing into another.
 */
function straight(
  from: readonly [number, number],
  to: readonly [number, number],
): Cubic {
  const [x0, y0] = from;
  const [x1, y1] = to;
  return [
    x0 + (x1 - x0) / 3,
    y0 + (y1 - y0) / 3,
    x0 + ((x1 - x0) * 2) / 3,
    y0 + ((y1 - y0) * 2) / 3,
    x1,
    y1,
  ];
}

function pathFrom(
  start: readonly [number, number],
  cubics: readonly Cubic[],
  closed = false,
): SkPath {
  const builder = Skia.PathBuilder.Make();
  builder.moveTo(start[0], start[1]);
  for (const [c1x, c1y, c2x, c2y, ex, ey] of cubics) {
    builder.cubicTo(c1x, c1y, c2x, c2y, ex, ey);
  }
  if (closed) builder.close();
  return builder.detach();
}

function corners(box: Box, radius: number) {
  const r = Math.min(radius, box.width / 2, box.height / 2);
  return {
    r,
    left: box.x,
    right: box.x + box.width,
    top: box.y,
    bottom: box.y + box.height,
    midY: box.y + box.height / 2,
    midX: box.x + box.width / 2,
  };
}

function cardTopCubics(box: Box, radius: number): { start: [number, number]; cubics: Cubic[] } {
  const { r, left, right, top, midY, midX } = corners(box, radius);
  const start: [number, number] = [left, midY];
  return {
    start,
    cubics: [
      straight(start, [left, top + r]),
      [left, top + r * (1 - K), left + r * (1 - K), top, left + r, top],
      straight([left + r, top], [midX, top]),
      straight([midX, top], [right - r, top]),
      [right - r * (1 - K), top, right, top + r * (1 - K), right, top + r],
      straight([right, top + r], [right, midY]),
    ],
  };
}

function cardBottomCubics(box: Box, radius: number): { start: [number, number]; cubics: Cubic[] } {
  const { r, left, right, bottom, midY, midX } = corners(box, radius);
  const start: [number, number] = [right, midY];
  return {
    start,
    cubics: [
      straight(start, [right, bottom - r]),
      [right, bottom - r * (1 - K), right - r * (1 - K), bottom, right - r, bottom],
      straight([right - r, bottom], [midX, bottom]),
      straight([midX, bottom], [left + r, bottom]),
      [left + r * (1 - K), bottom, left, bottom - r * (1 - K), left, bottom - r],
      straight([left, bottom - r], [left, midY]),
    ],
  };
}

/** The card frame, upper half: left waist, over the top, to the right waist. */
export function cardTop(box: Box, radius: number): SkPath {
  const { start, cubics } = cardTopCubics(box, radius);
  return pathFrom(start, cubics);
}

/** The card frame, lower half: right waist, under the bottom, to the left waist. */
export function cardBottom(box: Box, radius: number): SkPath {
  const { start, cubics } = cardBottomCubics(box, radius);
  return pathFrom(start, cubics);
}

/** The card as one closed contour — what Drop's silhouette becomes. */
export function cardOutline(box: Box, radius: number): SkPath {
  const top = cardTopCubics(box, radius);
  const bottom = cardBottomCubics(box, radius);
  return pathFrom(top.start, [...top.cubics, ...bottom.cubics], true);
}

/* ---------------------------------------------------------------- rays */

/** How many rays leave Drop when the card opens. */
export const RAY_COUNT = 9;

export type Ray = {
  path: SkPath;
  /** Expansion window over which the leading end draws itself on. */
  endWindow: [number, number];
  /** Expansion window over which the trailing end chases it and erases. */
  startWindow: [number, number];
};

/**
 * Nine strokes leaving Drop for the edge of the card.
 *
 * Each is generated once from the entry's own seed, so a given capture always
 * throws the same nine rays: three jointed segments with a seeded sideways
 * wander, a seeded angle spread, and a seeded reach that stops short of the
 * card edge by a hair. The stagger in the windows is what makes them read as
 * thrown by hand rather than fired from a turret.
 */
export function buildRays(
  origin: { x: number; y: number },
  target: Box,
  seed: number,
): Ray[] {
  const next = mulberry32(seed);
  const rays: Ray[] = [];

  // The fan opens toward the card, wherever the card sits relative to Drop —
  // downward for a character standing over it, upward for one standing at its
  // edge. Either way the rays travel into the thing being made.
  const spread = Math.PI * 1.34;
  const base =
    Math.atan2(
      target.y + target.height / 2 - origin.y,
      target.x + target.width / 2 - origin.x,
    ) -
    spread / 2;

  for (let i = 0; i < RAY_COUNT; i += 1) {
    const wobbleAngle = (next() - 0.5) * 0.16;
    const angle = base + (spread * i) / (RAY_COUNT - 1) + wobbleAngle;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    const reach = rayReach(origin, target, dx, dy) * (0.72 + next() * 0.2);
    const nx = -dy;
    const ny = dx;

    const builder = Skia.PathBuilder.Make();
    builder.moveTo(origin.x, origin.y);
    for (let step = 1; step <= 3; step += 1) {
      const t = step / 3;
      const wander = step === 3 ? 0 : (next() - 0.5) * reach * 0.12;
      builder.lineTo(
        origin.x + dx * reach * t + nx * wander,
        origin.y + dy * reach * t + ny * wander,
      );
    }

    rays.push({
      path: builder.detach(),
      endWindow: [0.1 + i * 0.035, 0.55 + i * 0.035],
      startWindow: [0.45 + i * 0.035, 0.88 + i * 0.035],
    });
  }

  return rays;
}

/**
 * How far a ray travels before it meets the card's box. Solved per axis and
 * taken at the nearer crossing, so every ray lands on the frame rather than
 * on an imaginary circle around it.
 */
function rayReach(
  origin: { x: number; y: number },
  target: Box,
  dx: number,
  dy: number,
): number {
  const distances: number[] = [];

  if (Math.abs(dx) > 1e-4) {
    const edge = dx > 0 ? target.x + target.width : target.x;
    const t = (edge - origin.x) / dx;
    if (t > 0) distances.push(t);
  }
  if (Math.abs(dy) > 1e-4) {
    const edge = dy > 0 ? target.y + target.height : target.y;
    const t = (edge - origin.y) / dy;
    if (t > 0) distances.push(t);
  }

  const reach = distances.length ? Math.min(...distances) : 0;
  const diagonal = Math.hypot(target.width, target.height);
  return Math.max(24, Math.min(reach, diagonal));
}

/* ------------------------------------------------------------ the tick */

/**
 * The confirmation mark: two strokes of one line, drawn on in a single pass.
 * Sized to `box` so it scales with whatever it is stamped across.
 */
export function checkPath(box: Box): SkPath {
  const { x, y, width: w, height: h } = box;
  return Skia.PathBuilder.Make()
    .moveTo(x + w * 0.14, y + h * 0.52)
    .lineTo(x + w * 0.4, y + h * 0.8)
    .lineTo(x + w * 0.88, y + h * 0.18)
    .detach();
}
