/**
 * Hand-drawn *gesture*, as opposed to hand-drawn texture.
 *
 * `HandPath` supplies the texture of a pencil line: the grain, the ghost pass,
 * the tremble. That is enough for a frame around a card, where the shape is
 * furniture and the line is the only thing anyone reads. It is not enough for a
 * button, because a button is small and repeated, and under the jitter there is
 * still a machine-perfect rounded rectangle — four identical corners, four
 * dead-straight edges, a seam that closes exactly. Put six of those on a screen
 * and the eye finds the repeat immediately.
 *
 * So this draws the box the way a hand draws one:
 *
 *   - four corners of four different radii,
 *   - edges that bow, and bow more the longer the run,
 *   - a pen that either carries past where it started or stops just short,
 *   - and, sometimes, one edge gone over a second time.
 *
 * Everything is seeded, so a given control is always drawn the same way — the
 * marks should feel hand-made, not restless. Two controls beside each other
 * take different seeds and are therefore never traced identically.
 */

import { Skia, type SkPath } from '@shopify/react-native-skia';

import { mulberry32 } from './seededRandom';

type Point = { x: number; y: number };

export type SketchRectOptions = {
  width: number;
  height: number;
  /** Corner radius before the hand gets to it. Each corner varies from here. */
  radius: number;
  seed: number;
  /** How far the pen is allowed to drift off true, in dp. */
  slack?: number;
  /** Whole-shape rotation in degrees. Small — this is a wobble, not a tilt. */
  tilt?: number;
  /** Trace one edge a second time, the way a hand firms up a line it disliked. */
  retrace?: boolean;
  /** Pull the whole trace inside its box — used for a fill that stops short. */
  inset?: number;
};

export type SketchRect = {
  /** The traced outline. */
  outline: SkPath;
  /** The firming stroke over a single edge, when one was asked for. */
  retrace: SkPath | null;
};

/** Below this there is no room for a corner, let alone a wobble. */
const MIN_SIDE = 8;

/**
 * A rounded rectangle as drawn rather than as specified.
 *
 * Returns `null` when the box is too small to trace, so callers can render
 * nothing rather than a scribble.
 */
export function sketchRect(options: SketchRectOptions): SketchRect | null {
  const {
    width,
    height,
    radius,
    seed,
    slack = 1.1,
    tilt = 0,
    retrace = false,
    inset = 0,
  } = options;

  const left = inset;
  const top = inset;
  const right = width - inset;
  const bottom = height - inset;
  if (right - left < MIN_SIDE || bottom - top < MIN_SIDE) return null;

  const rand = mulberry32(seed >>> 0);
  const drift = (amount: number) => (rand() - 0.5) * 2 * amount;

  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const angle = (tilt * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const place = (p: Point): Point => {
    if (!angle) return p;
    const dx = p.x - cx;
    const dy = p.y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  };

  // Four corners, four radii. This is the single biggest tell.
  const cap = Math.min(right - left, bottom - top) / 2;
  const r = Array.from({ length: 4 }, () =>
    Math.min(cap, Math.max(1, radius * (0.74 + rand() * 0.5))),
  );

  const nudge = (x: number, y: number): Point => ({
    x: x + drift(slack),
    y: y + drift(slack),
  });

  // The eight points where the straight runs meet the corners.
  const a = nudge(left + r[0], top);
  const b = nudge(right - r[1], top);
  const c = nudge(right, top + r[1]);
  const d = nudge(right, bottom - r[2]);
  const e = nudge(right - r[2], bottom);
  const f = nudge(left + r[3], bottom);
  const g = nudge(left, bottom - r[3]);
  const h = nudge(left, top + r[0]);

  /** A straight run, bowed. A long edge sags more than a short one. */
  const bow = (p: Point, q: Point): Point => {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const run = Math.hypot(dx, dy) || 1;
    const push = drift(slack * 0.85) * Math.min(1.7, 0.45 + run / 70);
    return {
      x: (p.x + q.x) / 2 + (-dy / run) * push,
      y: (p.y + q.y) / 2 + (dx / run) * push,
    };
  };

  /** The true corner, nudged. Pulls the arc off dead-centre. */
  const pivot = (x: number, y: number) => nudge(x, y);

  // Where the pen lands at the end of the loop. Not exactly where it started.
  const seam = nudge(left + r[0], top);

  /*
   * Whichever way the pen was already travelling as it came out of the last
   * corner. Taking it from the direction of travel rather than from the top
   * edge is what lets a circle overshoot: on a stepper the corners meet and
   * there *is* no top edge, so "carry on along the top" would send the stroke
   * off in whatever direction the jitter happened to point.
   */
  const lastCorner = pivot(left, top);
  const outDx = seam.x - lastCorner.x;
  const outDy = seam.y - lastCorner.y;
  const outRun = Math.hypot(outDx, outDy) || 1;
  const along = (from: Point, distance: number): Point => ({
    x: from.x + (outDx / outRun) * distance,
    y: from.y + (outDy / outRun) * distance,
  });

  // Half the time the pen carries past the start; the rest of the time it stops
  // a few dp short and leaves the corner open.
  const carries = rand() < 0.55;
  const finish = carries ? seam : along(seam, -(2 + rand() * 4));

  const path = Skia.Path.Make();
  const start = place(a);
  path.moveTo(start.x, start.y);

  const curve = (via: Point, to: Point) => {
    const v = place(via);
    const t = place(to);
    path.quadTo(v.x, v.y, t.x, t.y);
  };

  curve(bow(a, b), b);
  curve(pivot(right, top), c);
  curve(bow(c, d), d);
  curve(pivot(right, bottom), e);
  curve(bow(e, f), f);
  curve(pivot(left, bottom), g);
  curve(bow(g, h), h);
  curve(lastCorner, finish);

  if (carries) {
    // Kept inside the margin `SketchButton` reserves, so the tail of the stroke
    // never clips against the edge of its canvas.
    const run = 3 + rand() * 3.5;
    const tip = along(finish, run);
    curve(along(finish, run * 0.5), { x: tip.x, y: tip.y + drift(slack * 0.7) });
  }

  let firming: SkPath | null = null;
  if (retrace) {
    const edges: [Point, Point][] = [
      [a, b],
      [c, d],
      [e, f],
      [g, h],
    ];
    const edge = edges[Math.min(edges.length - 1, Math.floor(rand() * edges.length))];
    const off = drift(1.5);
    const from = lerp(edge[0], edge[1], 0.06 + rand() * 0.14);
    const to = lerp(edge[0], edge[1], 0.78 + rand() * 0.16);
    const p0 = place({ x: from.x + off, y: from.y + off });
    const p1 = place({ x: to.x + off, y: to.y + off });
    const via = place(bow({ x: from.x + off, y: from.y + off }, { x: to.x + off, y: to.y + off }));
    firming = Skia.Path.Make();
    firming.moveTo(p0.x, p0.y);
    firming.quadTo(via.x, via.y, p1.x, p1.y);
  }

  return { outline: path, retrace: firming };
}

export type SketchUnderlineOptions = {
  width: number;
  seed: number;
  /** Vertical middle of the band the stroke is drawn in. */
  y?: number;
  /** How far the pen drifts off true, in dp. */
  slack?: number;
};

/**
 * The mark under a text button.
 *
 * Not every control deserves a box. A word that means "go back" reads better
 * with a line under it than inside a drawn frame, and a screen of drawn frames
 * is a screen where nothing is emphasised. The line varies the same way the box
 * does: it bows, it under- or overshoots the word, and about a quarter of the
 * time it was drawn twice.
 */
export function sketchUnderline({
  width,
  seed,
  y = 3,
  slack = 1,
}: SketchUnderlineOptions): SkPath[] {
  if (width < 16) return [];

  const rand = mulberry32(seed >>> 0);
  const drift = (amount: number) => (rand() - 0.5) * 2 * amount;

  const stroke = (lead: number, trail: number, sag: number) => {
    const x0 = lead;
    const x1 = width + trail;
    const path = Skia.Path.Make();
    path.moveTo(x0, y + drift(slack * 0.6));
    path.quadTo((x0 + x1) / 2, y + sag, x1, y + drift(slack * 0.6));
    return path;
  };

  // A hand starts a little inside the first letter more often than outside it,
  // and runs past the last one on the way out.
  const paths = [stroke(drift(2) - 0.5, 1 + rand() * 3.5, drift(slack * 1.9))];

  if (rand() < 0.28) {
    // Gone over twice — the second pass is shorter and sits slightly under.
    paths.push(stroke(1.5 + rand() * 3, -(1 + rand() * 4), 1.1 + drift(slack)));
  }

  return paths;
}

function lerp(p: Point, q: Point, t: number): Point {
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
}
