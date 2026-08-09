/**
 * A small hand for writing figures onto paper.
 *
 * Fourteen glyphs — the digits, the comma and the point, a space, and the
 * litre "L" — each authored as one pencil skeleton in a 10×16 box. They carry
 * no roughness of their own: rendered through `HandPath`, they pick up the
 * same jitter and ghost passes as every other line in Drop, so a written
 * figure sits beside a drawn mark as work from the same hand.
 *
 * The figure is also a piece of choreography. Each glyph owns a slice of one
 * 0 → 1 progress — heavier glyphs take longer, the space is a breath — so a
 * single animated value writes the whole figure left to right, and the stage
 * can put a haptic on every stroke's first touch.
 */

import { Skia, type SkPath } from '@shopify/react-native-skia';

/** The glyph box: 10 units wide for a full digit, 16 tall, baseline at 16. */
const EM = 16;

/** Pen travel between glyphs, in glyph units. */
const SPACING = 2.4;

type GlyphSpec = {
  /** The clean skeleton, or null for the space's empty beat. */
  d: string | null;
  /** Units of width the glyph claims. */
  advance: number;
  /** Share of the writing time the glyph takes. */
  weight: number;
};

const GLYPHS: Record<string, GlyphSpec> = {
  '0': {
    d: 'M5 1 C2.2 1 1.4 4.4 1.4 8 C1.4 11.6 2.2 15 5 15 C7.8 15 8.6 11.6 8.6 8 C8.6 4.4 7.8 1 5 1 Z',
    advance: 10,
    weight: 1,
  },
  '1': { d: 'M2.4 4.2 Q4.4 3 5.4 1 L5.4 15', advance: 7, weight: 0.7 },
  '2': {
    d: 'M1.8 4.6 C1.8 1.6 8.4 0.8 8.4 4.4 C8.4 6.8 5.4 9.6 2 15 L8.8 15',
    advance: 10,
    weight: 1,
  },
  '3': {
    d: 'M2 3.2 Q3.4 1 5.4 1 Q8.4 1 8.4 4 Q8.4 6.8 5.2 7.4 Q8.8 7.8 8.8 11.4 Q8.8 15 5.4 15 Q3 15 1.8 13',
    advance: 10,
    weight: 1,
  },
  '4': { d: 'M6.8 15 L6.8 1 L1.4 10.6 L9.2 10.6', advance: 10, weight: 1 },
  '5': {
    d: 'M8.2 1 L2.6 1 L2.2 7 Q3.8 6.2 5.4 6.2 Q8.8 6.2 8.8 10.6 Q8.8 15 5.2 15 Q2.6 15 1.8 13.2',
    advance: 10,
    weight: 1,
  },
  '6': {
    d: 'M7.6 1.4 Q3.4 4.2 2.4 8.6 Q1.6 15 5.4 15 Q8.6 15 8.6 11.6 Q8.6 8.2 5.6 8.2 Q3 8.2 2.4 10.4',
    advance: 10,
    weight: 1,
  },
  '7': { d: 'M1.6 1 L8.8 1 Q5.6 7 4.6 15', advance: 9, weight: 0.8 },
  '8': {
    d: 'M5 7.4 Q2.2 6.6 2.2 4.2 Q2.2 1 5 1 Q7.8 1 7.8 4.2 Q7.8 6.6 5 7.4 Q1.8 8.2 1.8 11.6 Q1.8 15 5 15 Q8.2 15 8.2 11.6 Q8.2 8.2 5 7.4',
    advance: 10,
    weight: 1.1,
  },
  '9': {
    d: 'M8.4 4.6 Q8.4 1 5.2 1 Q2 1 2 4.6 Q2 8 5.2 8 Q8.4 8 8.4 4.6 Q8.6 10.4 6.2 15',
    advance: 10,
    weight: 1,
  },
  ',': { d: 'M2.2 13.6 Q3 14.4 1.6 16.4', advance: 4, weight: 0.35 },
  '.': { d: 'M2 14.6 L2.3 15', advance: 4, weight: 0.25 },
  ' ': { d: null, advance: 5, weight: 0.3 },
  L: { d: 'M2.2 1 L2.2 15 L8.2 15', advance: 10, weight: 0.8 },
};

function specOf(text: string): GlyphSpec[] {
  const spec: GlyphSpec[] = [];
  for (const char of text) {
    const glyph = GLYPHS[char];
    if (glyph) spec.push(glyph);
  }
  return spec;
}

/* ------------------------------------------------------------ the timing */

/** How long one unit of weight spends under the pen. */
const MS_PER_WEIGHT = 150;
const MS_BASE = 220;
const MS_MIN = 650;
const MS_MAX = 1500;

export type CarveTiming = {
  /** Normalised progress at which each drawn glyph's first stroke lands. */
  starts: number[];
  durationMs: number;
};

/** The write's rhythm: where each glyph begins, and how long the whole takes. */
export function carveTiming(text: string): CarveTiming {
  const spec = specOf(text);
  const total = spec.reduce((sum, glyph) => sum + glyph.weight, 0);
  if (total === 0) return { starts: [], durationMs: MS_MIN };

  const starts: number[] = [];
  let at = 0;
  for (const glyph of spec) {
    if (glyph.d) starts.push(at / total);
    at += glyph.weight;
  }

  return {
    starts,
    durationMs: Math.min(MS_MAX, Math.max(MS_MIN, MS_BASE + total * MS_PER_WEIGHT)),
  };
}

/* ------------------------------------------------------------ the layout */

export type FigureGlyph = {
  /** The skeleton, already in the destination's own pixels. */
  path: SkPath;
  /** The slice of the shared progress this glyph draws itself across. */
  start: number;
  end: number;
};

export type Figure = {
  glyphs: FigureGlyph[];
  /** `HandPath` stroke multiplier that suits the glyphs' rendered height. */
  strokeScale: number;
};

/**
 * Set `text` into a box: glyphs centred as a line, sized to `height` unless
 * `maxWidth` asks for smaller, each path carried into pixel space so the
 * pencil's jitter stays at its usual grain regardless of the figure's size.
 */
export function layoutFigure(
  text: string,
  frame: { centerX: number; centerY: number; height: number; maxWidth: number },
): Figure {
  const spec = specOf(text);
  if (spec.length === 0) return { glyphs: [], strokeScale: 1 };

  const units =
    spec.reduce((sum, glyph) => sum + glyph.advance, 0) + SPACING * (spec.length - 1);
  const scale = Math.min(frame.height / EM, frame.maxWidth / units);
  const totalWeight = spec.reduce((sum, glyph) => sum + glyph.weight, 0);

  const glyphs: FigureGlyph[] = [];
  let penX = frame.centerX - (units * scale) / 2;
  const top = frame.centerY - (EM * scale) / 2;
  let weightAt = 0;

  for (const glyph of spec) {
    if (glyph.d) {
      const path = Skia.Path.MakeFromSVGString(glyph.d);
      if (path) {
        const matrix = Skia.Matrix();
        matrix.translate(penX, top);
        matrix.scale(scale, scale);
        path.transform(matrix);
        glyphs.push({
          path,
          start: weightAt / totalWeight,
          end: (weightAt + glyph.weight) / totalWeight,
        });
      }
    }
    weightAt += glyph.weight;
    penX += (glyph.advance + SPACING) * scale;
  }

  return { glyphs, strokeScale: Math.max(0.9, scale * 0.82) };
}
