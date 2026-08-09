/**
 * The rain, checked as arithmetic.
 *
 * Three things about this layer are promises rather than decoration, and none
 * of them is visible in a type error:
 *
 *   1. The pool is a gauge. Half the stage has to mean "the whole budget" for
 *      all three kinds of run, or the same height means three different things
 *      on three different captures.
 *   2. Drop and its line stay dry. Not "mostly" — the height field must never
 *      put a column of water inside either box, at any level, after any amount
 *      of bank slumping.
 *   3. The pile is bounded. A thirty-second run lands hundreds of drops and the
 *      tangle has to stay at a fixed cost and a floor opacity, or the pool
 *      becomes a block of solid ink on a slow network.
 *
 * Nothing here touches Skia or Reanimated: `sim.ts` is deliberately free of
 * both so the whole model can be stepped in Node.
 */

import { describe, expect, it } from 'vitest';

import {
  BARCODE_TIMEOUT_MS,
  FAST_CEILING_MS,
  HARD_CEILING_MS,
  paceCeilingMs,
  paceFor,
} from '../../capture/pace';
import {
  COLUMNS,
  createRain,
  DROP_CAP,
  dryIslands,
  eraseJitter,
  eraseReveal,
  eraseStart,
  ERASE_ORDERS,
  fillColumns,
  islandTopAt,
  islandUndersideAt,
  ISLAND_MARGIN,
  poolLevel,
  poolProgress,
  rainPhaseFor,
  repourRain,
  sameGeometry,
  spawnHz,
  stepRain,
  STRAND_BANDS,
  strandBand,
  STRAND_CAP,
  STRAND_FADE_MS,
  STRAND_FLOOR,
  STRAND_FRESH,
  strandOpacity,
  columnCaps,
  POOL_SHARE,
  type RainConfig,
} from '../sim';

const STAGE = { width: 390, height: 844 };

/**
 * Drop's circle low on the stage, and the line it speaks above that.
 *
 * The pill is deliberately the size a measured chip actually comes out — a
 * sentence's worth of words, not the share the layout reserves for the widest
 * one. Testing against the reservation is what let a pill covering a third of
 * the stage certify a pool that only ever reached two slivers at the edges.
 */
const CHARACTER = { x: STAGE.width / 2, y: 700, side: 180 };
const PILL = { x: 85, y: 520, width: 220, height: 38 };

function configFor(ceilingMs: number, islands = dryIslands({ character: CHARACTER, pill: PILL })) {
  return {
    width: STAGE.width,
    height: STAGE.height,
    groundY: STAGE.height,
    ceilingMs,
    islands,
    seed: 1234,
  } satisfies RainConfig;
}

/** Run the sim at a steady sixty frames a second for a wall-clock duration. */
function run(config: RainConfig, ms: number) {
  const rain = createRain(config);
  const step = 1000 / 60;
  for (let elapsed = 0; elapsed < ms; elapsed += step) stepRain(rain, step);
  return rain;
}

/* ------------------------------------------------------------- pacing */

describe('pacing', () => {
  it('gives each kind of run its own clock', () => {
    expect(paceCeilingMs('normal')).toBe(HARD_CEILING_MS);
    expect(paceCeilingMs('fast')).toBe(FAST_CEILING_MS);
    expect(paceCeilingMs('barcode')).toBe(BARCODE_TIMEOUT_MS);

    // Thirty, fifteen, eight — the three waits the spec describes.
    expect(HARD_CEILING_MS).toBe(30_000);
    expect(FAST_CEILING_MS).toBe(15_000);
    expect(BARCODE_TIMEOUT_MS).toBe(8_000);
  });

  it('lets a code in frame beat fast mode', () => {
    expect(paceFor(true, 'fast')).toBe('barcode');
    expect(paceFor(true, 'normal')).toBe('barcode');
    expect(paceFor(false, 'fast')).toBe('fast');
    expect(paceFor(false, 'normal')).toBe('normal');
  });

  it('reads half the stage at every ceiling, and no further', () => {
    for (const pace of ['normal', 'fast', 'barcode'] as const) {
      const config = configFor(paceCeilingMs(pace));
      expect(poolLevel(config.ceilingMs, config)).toBeCloseTo(STAGE.height * POOL_SHARE, 6);
      // Half way through the budget is half way up the pool, whichever run it is.
      expect(poolLevel(config.ceilingMs / 2, config)).toBeCloseTo(
        (STAGE.height * POOL_SHARE) / 2,
        6,
      );
    }
  });

  it('stops rising when a run outlives its ceiling', () => {
    const config = configFor(BARCODE_TIMEOUT_MS);
    expect(poolProgress(BARCODE_TIMEOUT_MS * 4, config.ceilingMs)).toBe(1);
    expect(poolLevel(BARCODE_TIMEOUT_MS * 4, config)).toBeCloseTo(
      STAGE.height * POOL_SHARE,
      6,
    );
  });

  it('rains harder the less time there is', () => {
    const normal = spawnHz(configFor(HARD_CEILING_MS));
    const fast = spawnHz(configFor(FAST_CEILING_MS));
    const barcode = spawnHz(configFor(BARCODE_TIMEOUT_MS));
    expect(fast).toBeGreaterThan(normal);
    expect(barcode).toBeGreaterThan(fast);
  });
});

/* ------------------------------------------------------------ islands */

describe('dry islands', () => {
  const islands = dryIslands({ character: CHARACTER, pill: PILL });

  it('takes the character as the circle it is', () => {
    expect(islands[0]).toEqual({
      x: CHARACTER.x - CHARACTER.side / 2,
      y: CHARACTER.y - CHARACTER.side / 2,
      width: CHARACTER.side,
      height: CHARACTER.side,
      round: true,
    });
    expect(islands[1].round).toBe(false);

    // The outline, not the box: at the circle's centre it reaches its full
    // radius below Drop, and at the box's own left edge it has curved back to
    // the middle of it. A box would answer the same number in both places.
    const { x, y, side } = CHARACTER;
    expect(islandUndersideAt(islands[0], x)).toBeCloseTo(y + side / 2 + ISLAND_MARGIN, 6);
    expect(islandUndersideAt(islands[0], x - side / 2 - ISLAND_MARGIN)).toBeCloseTo(y, 6);
    // And clear of it, the island is not there at all.
    expect(islandUndersideAt(islands[0], x - side)).toBe(-Infinity);
    expect(islandTopAt(islands[0], x - side)).toBe(Infinity);
  });

  it('holds the print out of the weather like everything else', () => {
    const print = { x: 55, y: 190, width: 280, height: 300 };
    const withPrint = dryIslands({ character: CHARACTER, pill: PILL, print });
    expect(withPrint).toHaveLength(3);
    expect(withPrint[2]).toEqual({ ...print, round: false });
    // A drop over the photograph is caught on its top edge, margin included,
    // and the pool under it stops at the underside rather than running through.
    const centreX = print.x + print.width / 2;
    expect(islandTopAt(withPrint[2], centreX)).toBeCloseTo(print.y - ISLAND_MARGIN, 6);
    expect(islandUndersideAt(withPrint[2], centreX)).toBeCloseTo(
      print.y + print.height + ISLAND_MARGIN,
      6,
    );
  });

  it('caps the columns under each of them', () => {
    const caps = columnCaps(configFor(HARD_CEILING_MS, islands));
    const step = STAGE.width / COLUMNS;

    for (let i = 0; i < COLUMNS; i += 1) {
      const x = (i + 0.5) * step;
      for (const island of islands) {
        const underside = islandUndersideAt(island, x);
        if (underside === -Infinity) continue;
        // The water's edge stays under the island's outline, margin included.
        expect(STAGE.height - caps[i]).toBeGreaterThanOrEqual(underside - 1e-9);
      }
    }
  });

  it('leaves the character only what is under its feet', () => {
    const caps = columnCaps(configFor(HARD_CEILING_MS, islands));
    const step = STAGE.width / COLUMNS;
    const middle = Math.floor(COLUMNS / 2);
    // Drop stands near the floor, so the water may lap under it and no higher.
    expect(caps[middle]).toBeCloseTo(
      STAGE.height - islandUndersideAt(islands[0], (middle + 0.5) * step),
      6,
    );
    expect(caps[middle]).toBeLessThan(STAGE.height * POOL_SHARE);
  });

  it('never wets an island, at any level, after the banks have slumped', () => {
    const config = configFor(HARD_CEILING_MS, islands);
    const rain = createRain(config);
    const step = STAGE.width / COLUMNS;

    for (const level of [0, 60, 200, STAGE.height * POOL_SHARE, STAGE.height]) {
      fillColumns(rain, level);
      for (let i = 0; i < COLUMNS; i += 1) {
        expect(rain.columns[i]).toBeLessThanOrEqual(rain.caps[i] + 1e-9);
        const x = (i + 0.5) * step;
        const surface = STAGE.height - rain.columns[i];
        for (const island of islands) {
          // Inside the outline the water reads against — for Drop that is the
          // circle, so water hugging the sides of it is water going round.
          // Resting exactly on the underside is the cap doing its job, which is
          // the boundary rather than a breach of it.
          const inside =
            surface > islandTopAt(island, x) + 1e-9 &&
            surface < islandUndersideAt(island, x) - 1e-9;
          expect(inside).toBe(false);
        }
      }
    }
  });

  it('rises freely across the margins the islands leave alone', () => {
    const config = configFor(HARD_CEILING_MS, islands);
    const rain = createRain(config);
    const level = STAGE.height * POOL_SHARE;
    fillColumns(rain, level);

    // Not "the outermost column clears the pill" — that would hold for a pill
    // reaching within a hair of both edges, which is the artefact of a pool
    // built in two slivers. A margin worth the name is a share of the stage.
    const full = rain.columns.filter((depth) => depth >= level * 0.95).length;
    expect(full / COLUMNS).toBeGreaterThan(1 / 6);

    // Over Drop's head the pool is a puddle by comparison — a fifth of that.
    expect(rain.columns[Math.floor(COLUMNS / 2)]).toBeLessThan(level / 5);
  });

  it('notices when the stage has moved out from under a running pool', () => {
    const config = configFor(HARD_CEILING_MS, islands);
    expect(sameGeometry(config, configFor(HARD_CEILING_MS, islands))).toBe(true);
    // The same numbers arriving as a different object are still the same stage —
    // the config is copied onto the UI thread on every frame.
    expect(sameGeometry(config, { ...config, islands: [...islands] })).toBe(true);

    expect(sameGeometry(config, { ...config, width: config.width + 1 })).toBe(false);
    expect(sameGeometry(config, { ...config, ceilingMs: BARCODE_TIMEOUT_MS })).toBe(false);
    expect(
      sameGeometry(config, {
        ...config,
        islands: dryIslands({ character: { ...CHARACTER, y: 400 }, pill: PILL }),
      }),
    ).toBe(false);
  });

  it('puts a bank between the two rather than a cliff', () => {
    const config = configFor(HARD_CEILING_MS, islands);
    const rain = createRain(config);
    fillColumns(rain, STAGE.height * POOL_SHARE);

    // Somewhere between the dry middle and the full edge there is ground that
    // is neither — that slope is what makes the water read as going round.
    const partial = rain.columns.filter(
      (depth) => depth > 1 && depth < STAGE.height * POOL_SHARE - 1,
    );
    expect(partial.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------- the tangle */

describe('strands', () => {
  it('fades from fresh to a floor and never past it', () => {
    expect(strandOpacity(0)).toBeCloseTo(STRAND_FRESH, 6);
    expect(strandOpacity(STRAND_FADE_MS)).toBeCloseTo(STRAND_FLOOR, 6);
    expect(strandOpacity(STRAND_FADE_MS * 10)).toBeCloseTo(STRAND_FLOOR, 6);

    let previous = Infinity;
    for (let age = 0; age <= STRAND_FADE_MS; age += STRAND_FADE_MS / 20) {
      const value = strandOpacity(age);
      expect(value).toBeLessThanOrEqual(previous);
      expect(value).toBeGreaterThanOrEqual(STRAND_FLOOR - 1e-9);
      previous = value;
    }
  });

  it('sorts every age into one of the drawn bands', () => {
    for (let age = 0; age <= STRAND_FADE_MS * 2; age += 137) {
      const band = strandBand(age);
      expect(band).toBeGreaterThanOrEqual(0);
      expect(band).toBeLessThan(STRAND_BANDS);
    }
    // Fresh at the top of the range, settled at the bottom.
    expect(strandBand(0)).toBe(STRAND_BANDS - 1);
    expect(strandBand(STRAND_FADE_MS)).toBe(0);
  });

  it('collects a pile as the run goes on', () => {
    const rain = run(configFor(BARCODE_TIMEOUT_MS), 4000);
    expect(rain.strands.length).toBeGreaterThan(0);
    expect(rain.columns.some((depth) => depth > 0)).toBe(true);
  });

  it('bounds what a long run can cost', () => {
    const rain = run(configFor(BARCODE_TIMEOUT_MS), 40_000);
    expect(rain.strands.length).toBeLessThanOrEqual(STRAND_CAP);
    expect(rain.drops.length).toBeLessThanOrEqual(DROP_CAP);
    // The oldest went first, so what is left is the newest — nothing in the
    // tangle is older than the window the cap can hold.
    const ages = rain.strands.map((strand) => strand.ageMs);
    for (let i = 1; i < ages.length; i += 1) expect(ages[i]).toBeLessThanOrEqual(ages[i - 1]);
  });

  it('never lands a mark on a dry island', () => {
    const config = configFor(BARCODE_TIMEOUT_MS);
    const rain = run(config, 20_000);
    for (const strand of rain.strands) {
      const y = config.groundY - strand.depth;
      for (const island of config.islands) {
        const inside =
          y >= islandTopAt(island, strand.x) && y <= islandUndersideAt(island, strand.x);
        expect(inside).toBe(false);
      }
    }
  });

  it('keeps line work at every depth the pool has reached', () => {
    // A sliding window of the newest threads leaves the body of the pool as
    // blank paper inside one outline: everything that survived landed on the
    // level the water had a moment ago, so it all sits in a band at the top.
    // The pile is meant to read as tangled yarn all the way down.
    const config = configFor(HARD_CEILING_MS);
    const rain = run(config, HARD_CEILING_MS);
    const level = poolLevel(HARD_CEILING_MS, config);

    const depths = rain.strands.map((strand) => strand.depth);
    expect(depths.length).toBeGreaterThan(STRAND_CAP / 2);
    // Something is still drawn in the lower half of what the gauge claims.
    expect(Math.min(...depths)).toBeLessThan(level * 0.5);
    // And in each quarter of the pool there is line work, not just at the top.
    for (let quarter = 0; quarter < 4; quarter += 1) {
      const low = (level * quarter) / 4;
      const high = (level * (quarter + 1)) / 4;
      expect(depths.some((depth) => depth >= low && depth < high)).toBe(true);
    }
  });

  it('carries the pool across a stage that changed shape under it', () => {
    const before = run(configFor(HARD_CEILING_MS), 12_000);
    // The sentence grew: the same run, with a wider pill over it.
    const wider = configFor(
      HARD_CEILING_MS,
      dryIslands({ character: CHARACTER, pill: { ...PILL, x: 40, width: 310 } }),
    );
    const after = repourRain(before, wider);

    // The clock and the level it implies are the same run, still.
    expect(after.elapsedMs).toBe(before.elapsedMs);
    expect(after.columns[0]).toBeCloseTo(poolLevel(before.elapsedMs, wider), 6);
    // Most of the tangle survives — the pool does not blink out and re-grow.
    expect(after.strands.length).toBeGreaterThan(before.strands.length / 2);
    // And nothing that survived is under the new pill.
    for (const strand of after.strands) {
      for (const island of wider.islands) {
        const y = wider.groundY - strand.depth;
        expect(y).toBeGreaterThanOrEqual(islandUndersideAt(island, strand.x) - 1e-9);
      }
    }
  });

  it('replays a run exactly from the same seed', () => {
    const a = run(configFor(FAST_CEILING_MS), 6000);
    const b = run(configFor(FAST_CEILING_MS), 6000);
    expect(a.strands.length).toBe(b.strands.length);
    expect(a.drops.map((drop) => [drop.x, drop.y])).toEqual(
      b.drops.map((drop) => [drop.x, drop.y]),
    );
    expect(a.columns).toEqual(b.columns);
  });

  it('keeps the gauge honest through a stall', () => {
    const config = configFor(HARD_CEILING_MS);
    const rain = createRain(config);
    stepRain(rain, 5000);
    // The physics refuses to repay five seconds at once, but the clock the
    // pool is read from does not care how the time arrived.
    expect(rain.elapsedMs).toBe(5000);
    expect(rain.columns[0]).toBeCloseTo(poolLevel(5000, config), 6);
  });
});

/* -------------------------------------------------------- start & stop */

describe('phases', () => {
  it('rains only while the photo is being read', () => {
    expect(rainPhaseFor('captured')).toBe('falling');
    expect(rainPhaseFor('recognizing')).toBe('falling');
    expect(rainPhaseFor('analyzing')).toBe('falling');
  });

  it('never rains over a live viewfinder', () => {
    expect(rainPhaseFor('idle')).toBe('off');
    expect(rainPhaseFor('framing')).toBe('off');
  });

  it('drains on every way a run can end', () => {
    expect(rainPhaseFor('presenting')).toBe('drain');
    expect(rainPhaseFor('plating')).toBe('drain');
    expect(rainPhaseFor('unresolved')).toBe('drain');
    // And stays drained for everything downstream of those.
    expect(rainPhaseFor('expanded')).toBe('drain');
    expect(rainPhaseFor('adjusting')).toBe('drain');
    expect(rainPhaseFor('confirmed')).toBe('drain');
    expect(rainPhaseFor('plateConfirmed')).toBe('drain');
  });

  it('sets the layers off in turn and clears the last of them exactly on time', () => {
    // Nothing has begun to go before the drain does.
    for (let order = 0; order < ERASE_ORDERS; order += 1) {
      expect(eraseStart(0, order)).toBe(0);
    }

    // Each layer sets off strictly after the one in front of it, and each is
    // strictly further along than the one behind while the drain is running.
    for (let order = 1; order < ERASE_ORDERS; order += 1) {
      expect(eraseStart(0.5, order)).toBeLessThan(eraseStart(0.5, order - 1));
    }

    // The one that matters: the last layer reaches the end of its own erase
    // exactly as the drain ends — a hair short and there is ink on the glass
    // under the card. The clamp is not what is being asked here, so it is
    // checked just before it engages as well.
    expect(eraseStart(1, ERASE_ORDERS - 1)).toBe(1);
    expect(eraseStart(0.999, ERASE_ORDERS - 1)).toBeLessThan(1);
  });

  it('un-draws every mark along its own path, and none of them past the drain', () => {
    const jitters = [0, 0.5, 0.999];

    for (let order = 0; order < ERASE_ORDERS; order += 1) {
      for (const jitter of jitters) {
        // Whole while it is still raining, gone by the end of the drain.
        expect(eraseReveal(0, order, jitter)).toBe(1);
        expect(eraseReveal(1, order, jitter)).toBe(0);

        // And it only ever retreats.
        let previous = Infinity;
        for (let drain = 0; drain <= 1.0001; drain += 0.02) {
          const reveal = eraseReveal(drain, order, jitter);
          expect(reveal).toBeLessThanOrEqual(previous + 1e-9);
          previous = reveal;
        }
      }
    }

    // Two marks in the same layer are at different points in their own erase,
    // which is what makes the pool come apart thread by thread rather than in
    // four wipes.
    const early = eraseReveal(0.55, 2, 0);
    const late = eraseReveal(0.55, 2, 0.9);
    expect(late).toBeLessThan(early);

    // A seed's place in that stagger is stable and inside the range.
    for (const seed of [0, 1, 4242, 0xffffffff]) {
      expect(eraseJitter(seed)).toBeGreaterThanOrEqual(0);
      expect(eraseJitter(seed)).toBeLessThan(1);
      expect(eraseJitter(seed)).toBe(eraseJitter(seed));
    }
  });
});
