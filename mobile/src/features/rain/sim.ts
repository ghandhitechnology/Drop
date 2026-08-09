/**
 * The rain, as arithmetic.
 *
 * A held frame is a wait with no number on it, and a wait with no number is
 * the one thing the whole capture beat cannot afford — Drop says it is reading
 * the photo, and then says nothing more for anywhere between eight and thirty
 * seconds. So the waiting itself is drawn: rain falls behind the print from the
 * moment it stamps, and what it collects at the bottom is a gauge. Half the
 * screen is the run's whole budget. A barcode fills it in eight seconds and an
 * ordinary photo takes thirty, so the same pool read at the same height means
 * the same thing every time: this is how far through you are.
 *
 * Two decisions shape everything below.
 *
 * The pool's *level* is not the sum of the drops. It is read straight off the
 * clock, because a gauge whose reading depends on how many particles happened
 * to survive a frame drop is not a gauge. The drops are the explanation of the
 * level, not its cause.
 *
 * The pool's *shape* is that level poured into a height field whose columns
 * have caps. The character and the status pill sit in the pool's way, and the
 * honest way to keep them dry is not to draw the water and then hide it: it is
 * to give those columns a ceiling and let the field dip under them. The margins
 * carry on to the level the clock asked for, the blocked columns stop under
 * what is in their way, and two relaxation passes put a bank between the two —
 * so it reads as water going round something rather than as water with a
 * rectangle cut out of it.
 *
 * Everything here is pure and worklet-safe: the whole sim runs on the UI thread
 * inside a frame callback, and none of it may reach for React, Skia or the
 * store. Drawing lives in `marks.ts`; what to draw lives here.
 */

import { mulberryNext, mulberryValue } from '../../drawing/seededRandom';
import type { CaptureStateName } from '../capture/types';

/* ------------------------------------------------------------- the shape */

/**
 * Something the pool must not wet, and the rain must not draw on.
 *
 * `round` is not decoration. Both the water's ceiling and the rain's umbrella
 * are read off this outline, and reading a circle as its bounding box puts both
 * of them out in the open air beside it — a drop vanishing a hundred dp from
 * anything, and a shelf of water hanging off the corner of an invisible square.
 * The character is a circle and says so; the pill is a chip and says so.
 */
export type Island = {
  x: number;
  y: number;
  width: number;
  height: number;
  round: boolean;
};

export type RainConfig = {
  width: number;
  height: number;
  /** The floor the pool piles up from — the bottom of the stage. */
  groundY: number;
  /** The wait this run signed up for. The gauge reads full here. */
  ceilingMs: number;
  islands: readonly Island[];
  seed: number;
};

/** One falling drop, mid-air. */
export type Drop = {
  seed: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Half the outline's width, in dp. */
  size: number;
  /** Phase of this drop's own sideways drift, so no two sway together. */
  sway: number;
  /** Where in the boil cycle this one re-seeds, in ms. Staggered on purpose. */
  boilOffset: number;
};

/**
 * A drop that has landed, kept as the thread it drew on the way down.
 *
 * The pool is not a body of water with a skin on it — it is the drops
 * themselves, still visible, piled into a tangle. So a strand remembers the
 * depth the pool had under it at the instant it landed, and stays at that
 * depth for good. Later drops raise the level over it, which is what buries it.
 */
export type Strand = {
  seed: number;
  x: number;
  /** Depth below the floor-line this strand rests at, fixed at landing. */
  depth: number;
  width: number;
  height: number;
  ageMs: number;
  boilOffset: number;
};

/** The mark a landing leaves, for the fifth of a second it lasts. */
export type Splash = {
  seed: number;
  x: number;
  y: number;
  ageMs: number;
  /** How far the arms throw, in dp. */
  spread: number;
};

export type Rain = {
  config: RainConfig;
  elapsedMs: number;
  /** Pool depth at each column, in dp. */
  columns: number[];
  /** The stretches of depth each column may not stand in — see `columnBands`. */
  bands: DepthBand[][];
  drops: Drop[];
  strands: Strand[];
  splashes: Splash[];
  /** Fractional drops owed to the spawner, carried between steps. */
  spawnDebt: number;
  /** Time owed to the fixed-step integrator, carried between frames. */
  stepDebtMs: number;
  /** The run's own random stream, as state rather than as a closure. */
  rngState: number;
};

/* --------------------------------------------------------- the constants */

/** Share of the stage the pool claims when the gauge reads full. */
export const POOL_SHARE = 0.5;

/** Samples across the width. Enough for a bank to have a slope on it. */
export const COLUMNS = 48;

/** Water keeps this much clear of anything it must not wet, in dp. */
export const ISLAND_MARGIN = 6;

/** dp/s². Heavier than earth so the fall reads short on a phone-sized stage. */
const GRAVITY = 1500;
/** dp/s. Past this the drop has stopped accelerating. */
export const TERMINAL_VY = 950;
/** dp/s². Sideways push from the air, as a slow sine per drop. */
const SWAY_ACCEL = 34;
/** Cycles per second of that sideways push. */
const SWAY_HZ = 0.75;
/** Sideways drag, per second. Keeps the wobble from becoming a drift. */
const SWAY_DRAG = 1.9;

/** Live falling drops. Cost is bounded by this, not by how long the run runs. */
export const DROP_CAP = 46;
/** Live strands. Past this one is recycled on every landing — see `addStrand`. */
export const STRAND_CAP = 96;

/** The freshest share of the tangle, which recycling leaves alone. */
export const STRAND_SKIN = 0.25;

/** Drops per second, per dp/s the pool is rising. */
const SPAWN_PER_RISE = 0.72;
const MIN_SPAWN_HZ = 6;
const MAX_SPAWN_HZ = 26;

/** How fast a fresh strand's line fades toward the floor opacity. */
export const STRAND_FADE_MS = 9_000;
/** A strand's line the moment it lands. */
export const STRAND_FRESH = 0.6;
/**
 * And where it settles.
 *
 * Never zero: an old strand is still part of the tangle. Never high: a hundred
 * overlapping loops at full strength is a block of solid ink, which is the one
 * thing a pool of pencil line must not become.
 */
export const STRAND_FLOOR = 0.13;

/** How long a splash lasts. */
export const SPLASH_MS = 300;

/** A falling drop re-seeds its wobble ten times a second. */
export const DROP_BOIL_MS = 100;
/** A settled strand boils slower — it is at rest, not falling. */
export const POOL_BOIL_MS = 220;

/** Slosh across the surface: amplitude in dp, and how it travels. */
const SLOSH_AMP = 3.4;
const SLOSH_HZ = 0.21;
const SLOSH_WAVES = 1.7;

/** The integrator's step. Fixed, so the same run replays the same way. */
const FIXED_STEP_MS = 1000 / 60;
/**
 * How much catching up one frame may do.
 *
 * A stall must not be repaid all at once: forty steps in a frame costs more
 * than the frame that was already late, and the sim spirals. Time past this is
 * dropped, and the pool — whose level is read off the wall clock rather than
 * off the integrator — is unaffected by the loss.
 */
const MAX_SUBSTEPS = 4;

/** A column with less room than this cannot usefully hold rain. */
const MIN_USEFUL_CAP = 4;

/* ------------------------------------------------------------ the phases */

/** What the rain is doing, read off the state the machine is in. */
export type RainPhase = 'off' | 'falling' | 'drain';

const FALLING_STATES: ReadonlySet<CaptureStateName> = new Set([
  'captured',
  'recognizing',
  'analyzing',
]);

/**
 * Every way a run can end takes the pool away.
 *
 * There is no state where a result is on screen and it is still raining. The
 * three endings differ in what arrives — a card, a pile, or the offer to find
 * it by name — and in none of them is the wait still going on, so all three
 * drain. Everything past `presenting` is already dry by the time it is reached.
 */
const DRAIN_STATES: ReadonlySet<CaptureStateName> = new Set([
  'presenting',
  'expanded',
  'adjusting',
  'confirmed',
  'plating',
  'plateConfirmed',
  'unresolved',
]);

export function rainPhaseFor(name: CaptureStateName): RainPhase {
  if (FALLING_STATES.has(name)) return 'falling';
  if (DRAIN_STATES.has(name)) return 'drain';
  return 'off';
}

/* --------------------------------------------------------- the dry spots */

export type IslandInput = {
  /** The character's circle: its centre, and the side of the box it fills. */
  character: { x: number; y: number; side: number };
  /** The status pill, as measured. */
  pill: { x: number; y: number; width: number; height: number };
  /** The held print's slot, when a frame is on the stage. */
  print?: { x: number; y: number; width: number; height: number };
};

/**
 * The things the pool may not cover.
 *
 * Drop is a face and the pill is the only sentence on the screen; water over
 * either of them is water over the reason the screen exists. Drop keeps its
 * circle here rather than being squared off — see `Island` — because everything
 * downstream reads the outline, not the box. The print joins them as a solid
 * thing in the weather: rain lands on its top edge and the pool, should it get
 * that high, laps its underside instead of running through the photograph.
 */
export function dryIslands(input: IslandInput): Island[] {
  'worklet';
  const { character, pill, print } = input;
  const islands: Island[] = [
    {
      x: character.x - character.side / 2,
      y: character.y - character.side / 2,
      width: character.side,
      height: character.side,
      round: true,
    },
    { x: pill.x, y: pill.y, width: pill.width, height: pill.height, round: false },
  ];
  if (print) {
    islands.push({
      x: print.x,
      y: print.y,
      width: print.width,
      height: print.height,
      round: false,
    });
  }
  return islands;
}

/**
 * How far the island's outline reaches from its own centre line at an x, with
 * the margin already folded in — or -1 where the x misses it entirely.
 *
 * Folding the margin in here is what keeps it all the way round a curve instead
 * of only under a box, and having one function answer for both the top and the
 * underside is what keeps the water and the umbrella on the same outline.
 */
function islandReachAt(island: Island, x: number): number {
  'worklet';
  const cx = island.x + island.width / 2;
  const ry = island.height / 2 + ISLAND_MARGIN;
  const rx = island.width / 2 + ISLAND_MARGIN;
  const dx = (x - cx) / rx;
  if (dx < -1 || dx > 1) return -1;
  return island.round ? ry * Math.sqrt(1 - dx * dx) : ry;
}

/** The lowest the island hangs over an x. -Infinity where it does not. */
export function islandUndersideAt(island: Island, x: number): number {
  'worklet';
  const reach = islandReachAt(island, x);
  return reach < 0 ? -Infinity : island.y + island.height / 2 + reach;
}

/** The highest the island stands over an x. Infinity where it does not. */
export function islandTopAt(island: Island, x: number): number {
  'worklet';
  const reach = islandReachAt(island, x);
  return reach < 0 ? Infinity : island.y + island.height / 2 - reach;
}

/* ----------------------------------------------------------- the pacing */

function clamp(value: number, low: number, high: number): number {
  'worklet';
  return value < low ? low : value > high ? high : value;
}

/**
 * How full the gauge reads, 0–1.
 *
 * Clamped at the top rather than allowed to run on: a run that outlives its own
 * ceiling is a run in trouble, and a pool that kept climbing would be over the
 * card before the card arrived. It stops at half the screen and waits.
 */
export function poolProgress(elapsedMs: number, ceilingMs: number): number {
  'worklet';
  if (ceilingMs <= 0) return 1;
  return clamp(elapsedMs / ceilingMs, 0, 1);
}

/**
 * How high the water stands at a moment, in dp above the floor.
 *
 * The level, not the volume: what the gauge promises is a height on the screen,
 * and reading it as a volume would mean the same elapsed second showed a
 * different height depending on how much of the width the character and the
 * pill happened to be blocking that run.
 */
export function poolLevel(elapsedMs: number, config: RainConfig): number {
  'worklet';
  return poolProgress(elapsedMs, config.ceilingMs) * config.height * POOL_SHARE;
}

/** How hard it rains: proportional to how fast the pool has to climb. */
export function spawnHz(config: RainConfig): number {
  'worklet';
  if (config.ceilingMs <= 0) return MAX_SPAWN_HZ;
  const risePerSecond = (config.height * POOL_SHARE) / (config.ceilingMs / 1000);
  return clamp(risePerSecond * SPAWN_PER_RISE, MIN_SPAWN_HZ, MAX_SPAWN_HZ);
}

/* ------------------------------------------------------- the height field */

/** A stretch of depth a column may not stand in: an island's own body. */
export type DepthBand = { lo: number; hi: number };

/**
 * The forbidden depths at each column.
 *
 * An island is not a ceiling, it is a thing in the water. Below its underside
 * a column fills normally; the band is the island itself; and above its top
 * the column may fill again, which is what lets the pool close over Drop's
 * head and leave a circle-shaped hole around it rather than an open well all
 * the way up. Bands that touch — the pill sits right over the circle — are
 * merged, so the pair reads as one wall to climb past.
 */
export function columnBands(config: RainConfig): DepthBand[][] {
  'worklet';
  const bands: DepthBand[][] = [];
  const step = config.width / COLUMNS;
  for (let i = 0; i < COLUMNS; i += 1) {
    const x = (i + 0.5) * step;
    const column: DepthBand[] = [];
    for (let j = 0; j < config.islands.length; j += 1) {
      const underside = islandUndersideAt(config.islands[j], x);
      if (underside === -Infinity) continue;
      const lo = config.groundY - underside;
      const hi = config.groundY - islandTopAt(config.islands[j], x);
      column.push({ lo: lo > 0 ? lo : 0, hi });
    }
    column.sort((a, b) => a.lo - b.lo);
    const merged: DepthBand[] = [];
    for (let j = 0; j < column.length; j += 1) {
      const band = column[j];
      const last = merged.length > 0 ? merged[merged.length - 1] : null;
      if (last && band.lo <= last.hi) {
        if (band.hi > last.hi) last.hi = band.hi;
      } else {
        merged.push(band);
      }
    }
    bands.push(merged);
  }
  return bands;
}

/**
 * Where a target depth actually settles: never inside an island.
 *
 * A level caught mid-island holds at the underside — the water lapping the
 * sides — and a level past the top stands where it is, with the island now
 * below the surface. Snapping only ever moves down, so one ascending pass
 * over the sorted bands is the whole answer.
 */
export function settleDepth(depth: number, bands: readonly DepthBand[]): number {
  'worklet';
  let settled = depth;
  for (let i = 0; i < bands.length; i += 1) {
    if (settled > bands[i].lo && settled < bands[i].hi) settled = bands[i].lo;
  }
  return settled;
}

/**
 * Take the field to a level, then let the banks slump.
 *
 * The snap alone leaves a cliff wherever a band bites — the column beside Drop
 * standing at half the screen and the one over its head lapping the underside.
 * Two relaxation passes give that edge a slope. The bands are re-applied
 * inside the pass, so slumping can move a column only through depths the
 * islands leave open, never into one.
 */
export function fillColumns(rain: Rain, level: number): void {
  'worklet';
  const { bands, columns } = rain;
  for (let i = 0; i < COLUMNS; i += 1) {
    columns[i] = settleDepth(level, bands[i]);
  }

  for (let pass = 0; pass < 2; pass += 1) {
    let previous = columns[0];
    for (let i = 0; i < COLUMNS; i += 1) {
      const next = i + 1 < COLUMNS ? columns[i + 1] : columns[i];
      const smoothed = previous * 0.25 + columns[i] * 0.5 + next * 0.25;
      previous = columns[i];
      columns[i] = settleDepth(smoothed, bands[i]);
    }
  }
}

/** Which column an x falls in. */
export function columnAt(config: RainConfig, x: number): number {
  'worklet';
  const step = config.width / COLUMNS;
  return clamp(Math.floor(x / step), 0, COLUMNS - 1);
}

/**
 * The surface's up-and-down, in dp of extra depth.
 *
 * One travelling wave, not a wave equation. The pool is a gauge with a hand
 * drawn on it; what it needs is to look alive, and a second sine costs as much
 * as the first and reads as noise.
 */
export function sloshOffset(x: number, elapsedMs: number, width: number): number {
  'worklet';
  if (width <= 0) return 0;
  const phase = (x / width) * SLOSH_WAVES * Math.PI * 2;
  return Math.sin(phase + (elapsedMs / 1000) * SLOSH_HZ * Math.PI * 2) * SLOSH_AMP;
}

/** The pool's depth at an arbitrary x — columns, interpolated, plus slosh. */
export function depthAt(rain: Rain, x: number): number {
  'worklet';
  const { config, columns, bands } = rain;
  const step = config.width / COLUMNS;
  const at = clamp(x / step - 0.5, 0, COLUMNS - 1);
  const i = Math.floor(at);
  const j = i + 1 < COLUMNS ? i + 1 : i;
  const t = at - i;
  const base = columns[i] + (columns[j] - columns[i]) * t;
  const slosh = sloshOffset(x, rain.elapsedMs, config.width);
  // Settled against both neighbours, so neither the blend nor the slosh can
  // put the surface inside an outline the columns themselves stay out of.
  const depth = base + slosh > 0 ? base + slosh : 0;
  return settleDepth(settleDepth(depth, bands[i]), bands[j]);
}

/** Where the water's edge is at an x, in stage coordinates. */
export function surfaceYAt(rain: Rain, x: number): number {
  'worklet';
  return rain.config.groundY - depthAt(rain, x);
}

/**
 * Where the rain is caught, over an x, if it is caught at all.
 *
 * Islands are umbrellas as well as rocks: a drop is stopped by the thing it
 * would otherwise be drawn across, which is the only way ink can be kept off
 * the sentence and off Drop's face.
 *
 * It has to be the outline and not the box. Stopping every drop across a
 * bounding box means most of them end their fall in open air a long way from
 * anything — a straight line of drops winking out mid-screen, which is exactly
 * the artefact the height field was shaped to avoid. Caught on the outline, the
 * drop lands *on* Drop's head or *on* the chip, which is what it looks like.
 */
export function shelterYAt(config: RainConfig, x: number): number {
  'worklet';
  let lowest = Infinity;
  for (let j = 0; j < config.islands.length; j += 1) {
    const top = islandTopAt(config.islands[j], x);
    if (top < lowest) lowest = top;
  }
  return lowest;
}

/* -------------------------------------------------------- the lifecycle */

/** One draw from the run's own stream. Advances the state in place. */
function nextRandom(rain: Rain): number {
  'worklet';
  rain.rngState = mulberryNext(rain.rngState);
  return mulberryValue(rain.rngState);
}

/**
 * Is a running sim still describing the stage it is drawn on?
 *
 * A stage that changed shape mid-run — a rotation, a keyboard — moved both dry
 * islands, and a pool poured against the old ones would be standing on the
 * character. Compared field by field rather than by identity, because the
 * config crosses onto the UI thread as a fresh copy on every render and an
 * identity check would rebuild the pool for nothing several times a second.
 */
export function sameGeometry(a: RainConfig, b: RainConfig): boolean {
  'worklet';
  if (a.width !== b.width || a.height !== b.height || a.groundY !== b.groundY) return false;
  if (a.ceilingMs !== b.ceilingMs) return false;
  if (a.islands.length !== b.islands.length) return false;
  for (let i = 0; i < a.islands.length; i += 1) {
    const one = a.islands[i];
    const other = b.islands[i];
    if (one.x !== other.x || one.y !== other.y) return false;
    if (one.width !== other.width || one.height !== other.height) return false;
    if (one.round !== other.round) return false;
  }
  return true;
}

export function createRain(config: RainConfig): Rain {
  'worklet';
  const bands = columnBands(config);
  const columns: number[] = [];
  for (let i = 0; i < COLUMNS; i += 1) columns.push(0);
  return {
    config,
    elapsedMs: 0,
    columns,
    bands,
    drops: [],
    strands: [],
    splashes: [],
    spawnDebt: 0,
    stepDebtMs: 0,
    rngState: config.seed >>> 0,
  };
}

/**
 * The same run, poured onto a stage that has changed shape under it.
 *
 * This is not rare and it is not only rotation: the status pill is as wide as
 * its words, so the sentence changing — "Reading the photo" giving way to the
 * item's name — moves one of the two islands mid-run. Starting again there
 * would blink the whole tangle out and re-grow it in front of the person, which
 * is a bigger event than the thing that caused it.
 *
 * So the clock, the pile and the weather come across, and the only threads left
 * behind are the ones the new outline would now be sitting on top of.
 */
export function repourRain(previous: Rain, config: RainConfig): Rain {
  'worklet';
  const rain = createRain(config);
  rain.elapsedMs = previous.elapsedMs;
  rain.rngState = previous.rngState;
  rain.spawnDebt = previous.spawnDebt;
  fillColumns(rain, poolLevel(rain.elapsedMs, config));

  rain.drops = previous.drops;
  rain.splashes = previous.splashes;
  for (let i = 0; i < previous.strands.length; i += 1) {
    const strand = previous.strands[i];
    const y = config.groundY - strand.depth;
    let covered = false;
    for (let j = 0; j < config.islands.length; j += 1) {
      // Inside the outline, not merely above the underside — a thread riding
      // the water over Drop's head is exactly where it should be.
      const island = config.islands[j];
      if (
        y < islandUndersideAt(island, strand.x) - 1e-9 &&
        y > islandTopAt(island, strand.x) + 1e-9
      ) {
        covered = true;
      }
    }
    if (!covered) rain.strands.push(strand);
  }
  return rain;
}

/**
 * Where a drop is allowed to start.
 *
 * Anywhere the fall has somewhere to end. Most of the width is open water; the
 * spans under the two islands are not, but a drop there is not wasted either —
 * it is drawn the whole way down and caught on the outline it hits, which is
 * rain landing on Drop and on the chip. The one thing worth refusing is a
 * column with no room at all under it, where a drop would be born already
 * touching whatever is in its way.
 */
function spawnX(rain: Rain): number {
  'worklet';
  const step = rain.config.width / COLUMNS;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const i = Math.floor(nextRandom(rain) * COLUMNS);
    const column = clamp(i, 0, COLUMNS - 1);
    const bands = rain.bands[column];
    const room = bands.length > 0 ? bands[0].lo : rain.config.groundY;
    if (room >= MIN_USEFUL_CAP) {
      return (column + nextRandom(rain)) * step;
    }
  }
  return nextRandom(rain) * rain.config.width;
}

function addDrop(rain: Rain): void {
  'worklet';
  if (rain.drops.length >= DROP_CAP) return;
  const seed = Math.floor(nextRandom(rain) * 0xffffffff) >>> 0;
  rain.drops.push({
    seed,
    x: spawnX(rain),
    // Above the top edge, so nothing is ever seen appearing out of nowhere.
    y: -12 - nextRandom(rain) * 40,
    vx: 0,
    vy: 60 + nextRandom(rain) * 120,
    size: 4.4 + nextRandom(rain) * 3.8,
    sway: nextRandom(rain) * Math.PI * 2,
    boilOffset: nextRandom(rain) * DROP_BOIL_MS,
  });
}

/**
 * The drop becomes part of the pile.
 *
 * Which thread gives way when the tangle is full decides what the pool looks
 * like, and the obvious answer is the wrong one. Dropping the oldest every time
 * is a sliding window: past the first ten seconds the surviving threads are all
 * from the last ten, all sitting near the level the water had recently, and the
 * whole body underneath them is empty paper inside one outline. A gauge that
 * claims a depth has to have something drawn in it.
 *
 * So the pile is thinned rather than truncated: a thread is taken at random
 * from the settled part, which spreads the losses over every depth the pool has
 * ever had and leaves the deep tangle sparse instead of absent. The freshest
 * threads are exempt — they are the brightest and sit right on the surface,
 * where one of them blinking out would be seen.
 */
function addStrand(rain: Rain, drop: Drop): void {
  'worklet';
  if (rain.strands.length >= STRAND_CAP) {
    const settled = Math.max(1, Math.floor(rain.strands.length * (1 - STRAND_SKIN)));
    rain.strands.splice(Math.floor(nextRandom(rain) * settled), 1);
  }
  rain.strands.push({
    seed: drop.seed,
    x: drop.x,
    depth: depthAt(rain, drop.x),
    width: drop.size * (2.4 + nextRandom(rain) * 1.8),
    height: drop.size * (0.8 + nextRandom(rain) * 0.7),
    ageMs: 0,
    boilOffset: nextRandom(rain) * POOL_BOIL_MS,
  });
}

function addSplash(rain: Rain, drop: Drop, y: number): void {
  'worklet';
  rain.splashes.push({
    seed: drop.seed ^ 0x9e3779b9,
    x: drop.x,
    y,
    ageMs: 0,
    spread: drop.size * (1.6 + nextRandom(rain) * 1.4),
  });
}

/** A strand's line, from the moment it lands to wherever it ends up. */
export function strandOpacity(ageMs: number): number {
  'worklet';
  const t = clamp(ageMs / STRAND_FADE_MS, 0, 1);
  return STRAND_FRESH + (STRAND_FLOOR - STRAND_FRESH) * t;
}

/**
 * The tangle is drawn in four steps of opacity rather than a hundred.
 *
 * Each strand wants its own alpha, and a hundred separately-faded paths is a
 * hundred draw calls a frame. Rounding the fade into four bands collects the
 * whole pile into four paths, and at these opacities — a tenth of a step apart
 * — the banding is not visible under the overlap. It also makes the drain
 * cheap: four strokes to un-draw instead of a hundred.
 */
export const STRAND_BANDS = 4;

/** Which of those four steps a strand of a given age belongs in. */
export function strandBand(ageMs: number): number {
  'worklet';
  const t = (strandOpacity(ageMs) - STRAND_FLOOR) / (STRAND_FRESH - STRAND_FLOOR);
  return clamp(Math.floor(t * STRAND_BANDS), 0, STRAND_BANDS - 1);
}

/** What a band is drawn at — the middle of the range it stands for. */
export function bandOpacity(band: number): number {
  'worklet';
  const t = (band + 0.5) / STRAND_BANDS;
  return STRAND_FLOOR + (STRAND_FRESH - STRAND_FLOOR) * t;
}

/** How far through its life a splash is, 0–1. */
export function splashProgress(ageMs: number): number {
  'worklet';
  return clamp(ageMs / SPLASH_MS, 0, 1);
}

/* ------------------------------------------------------------- the step */

function integrate(rain: Rain, dtMs: number): void {
  'worklet';
  const dt = dtMs / 1000;
  const { config } = rain;

  // Spawning is owed in fractions and paid in whole drops, so the rate holds
  // however the frames actually arrive.
  rain.spawnDebt += spawnHz(config) * dt;
  while (rain.spawnDebt >= 1) {
    rain.spawnDebt -= 1;
    addDrop(rain);
  }

  const seconds = rain.elapsedMs / 1000;
  for (let i = rain.drops.length - 1; i >= 0; i -= 1) {
    const drop = rain.drops[i];

    drop.vy = Math.min(TERMINAL_VY, drop.vy + GRAVITY * dt);
    drop.vx += Math.sin(seconds * SWAY_HZ * Math.PI * 2 + drop.sway) * SWAY_ACCEL * dt;
    drop.vx -= drop.vx * SWAY_DRAG * dt;
    drop.x += drop.vx * dt;
    drop.y += drop.vy * dt;

    if (drop.x < -20 || drop.x > config.width + 20) {
      rain.drops.splice(i, 1);
      continue;
    }

    // The fall ends on whichever stands higher over this x: open water, or an
    // island still out of it. Caught by an island it is absorbed with no mark —
    // nothing is drawn over the things the whole layer exists to stay off —
    // but an island under the surface is under water, and rain falling there
    // is rain falling on the pool that closed over it.
    const shelter = shelterYAt(config, drop.x);
    const surface = surfaceYAt(rain, drop.x);
    if (surface <= shelter) {
      if (drop.y >= surface) {
        rain.drops.splice(i, 1);
        addSplash(rain, drop, surface);
        addStrand(rain, drop);
      }
    } else if (drop.y >= shelter) {
      rain.drops.splice(i, 1);
    }
  }

  for (let i = rain.splashes.length - 1; i >= 0; i -= 1) {
    rain.splashes[i].ageMs += dtMs;
    if (rain.splashes[i].ageMs >= SPLASH_MS) rain.splashes.splice(i, 1);
  }

  for (let i = 0; i < rain.strands.length; i += 1) rain.strands[i].ageMs += dtMs;
}

/**
 * Advance the run by however long the last frame took.
 *
 * The clock moves by the real elapsed time — the gauge is a promise about
 * seconds and must not drift — while the physics is stepped at a fixed rate, so
 * a dropped frame changes how much catching up happens rather than how a drop
 * falls.
 */
export function stepRain(rain: Rain, dtMs: number): void {
  'worklet';
  if (dtMs <= 0) return;
  rain.elapsedMs += dtMs;
  fillColumns(rain, poolLevel(rain.elapsedMs, rain.config));

  rain.stepDebtMs += dtMs;
  let steps = 0;
  while (rain.stepDebtMs >= FIXED_STEP_MS && steps < MAX_SUBSTEPS) {
    rain.stepDebtMs -= FIXED_STEP_MS;
    integrate(rain, FIXED_STEP_MS);
    steps += 1;
  }
  if (rain.stepDebtMs > FIXED_STEP_MS) rain.stepDebtMs = 0;
}

/* ------------------------------------------------------------ the drain */

/**
 * How long the pool takes to leave, once the answer is in.
 *
 * Long enough to be seen as un-drawing rather than as a cut, short enough that
 * it is over while the card is still arriving. The two overlap on purpose: the
 * result should walk in over a page being rubbed out, not after it.
 */
export const DRAIN_MS = 1500;

/**
 * The layers erase in turn: the falling drops first, then the tangle from its
 * freshest thread down to its oldest, then the water's edge last of all.
 */
export const ERASE_ORDERS = 6;

/** How far apart two consecutive layers set off, as a share of the drain. */
const ERASE_STAGGER = 0.1;

/**
 * How much of the drain one mark spends coming apart, over and above its
 * layer's own window. Marks inside a layer are spread across this, so a layer
 * un-draws as a hundred separate rubbings-out rather than as one wipe.
 */
const ERASE_SPREAD = 0.7;

/**
 * How far through its own erase a layer is, 0–1.
 *
 * The layers set off in turn — falling drops first, the tangle from its
 * freshest thread down to its oldest, the water's edge last — and each takes
 * the same share of the drain to go. They finish in that same order, staggered
 * the way they started; what matters is the last of them, which lands exactly
 * on the end of the drain, so nothing is left on the glass when the card
 * settles.
 */
export function eraseStart(drain: number, order: number): number {
  'worklet';
  const span = 1 - ERASE_STAGGER * (ERASE_ORDERS - 1);
  return clamp((drain - order * ERASE_STAGGER) / span, 0, 1);
}

/**
 * How much of one mark is still on the page: 1 whole, 0 gone.
 *
 * This is what makes the drain an un-drawing rather than a wipe. Skia's own
 * trim works on a whole path, and every layer here is one path holding a
 * hundred loops, so trimming it would take the loops away one after another in
 * the order they happened to be added — a hundred things blinking out, not a
 * hundred lines retreating. Instead each mark is handed its own share of the
 * layer's window, off its own seed, and the path is rebuilt short: the pen goes
 * backwards along the exact route it came, all over the pool at once.
 */
export function eraseReveal(drain: number, order: number, jitter: number): number {
  'worklet';
  const left = 1 - eraseStart(drain, order);
  return clamp(left * (1 + ERASE_SPREAD) - jitter * ERASE_SPREAD, 0, 1);
}

/** A mark's place in its layer's stagger, 0–1, stable for the life of the mark. */
export function eraseJitter(seed: number): number {
  'worklet';
  return (seed % 1024) / 1024;
}

/**
 * The boil.
 *
 * Every wobble is re-drawn from a seed that changes on a slow tick, which is
 * what gives a still drawing the shimmer of a hand re-inking it. The offset is
 * per mark: a shared tick would re-seed the whole screen on one frame, which
 * both flickers and puts every path rebuild of the second into the same 16ms.
 */
export function boilSeed(seed: number, elapsedMs: number, periodMs: number, offset: number): number {
  'worklet';
  return (seed ^ (Math.floor((elapsedMs + offset) / periodMs) * 0x9e3779b1)) >>> 0;
}
