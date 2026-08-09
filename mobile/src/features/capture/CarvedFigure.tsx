/**
 * The litres, written onto the print's chin.
 *
 * The frame asset leaves a Polaroid's blank strip under the photo, and this is
 * what it was blank for: once a capture is confirmed, its water figure writes
 * itself there glyph by glyph, in the same pencil as every mark around it.
 * One shared progress drives the whole line — each glyph draws inside its own
 * slice of it, so the figure arrives as handwriting rather than as a fade.
 *
 * Without a progress value the figure stands fully written, which is how a
 * saved print wears it in History.
 */

import { Canvas } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { HandPath } from '../../drawing/HandPath';
import { layoutFigure, type FigureGlyph } from '../../drawing/handwriting';
import { seedFromString } from '../../drawing/seededRandom';

/**
 * Graphite, not a theme ink: the mat it writes on is baked white into the
 * frame asset, in either colour scheme.
 */
export const CARVE_INK = '#26282b';

/** The chin — the mat between the photo window and the frame's bottom edge. */
const CHIN = { top: 0.756, bottom: 0.935, left: 0.148, right: 0.86 } as const;

/** Share of the print's side the written line stands tall. */
const FIGURE_HEIGHT = 0.108;

export type CarvedFigureProps = {
  /** What to write — "4,200 L". */
  text: string;
  /** The print's side, the same `size` its Snapshot was given. */
  size: number;
  /** Stable id, so the handwriting never re-forms between renders. */
  seed: string;
  /** 0 → 1 writes the figure on. Absent, it is already written. */
  progress?: SharedValue<number>;
};

export function CarvedFigure({ text, size, seed, progress }: CarvedFigureProps) {
  const figure = useMemo(
    () =>
      layoutFigure(text, {
        centerX: size * ((CHIN.left + CHIN.right) / 2),
        centerY: size * ((CHIN.top + CHIN.bottom) / 2),
        height: size * FIGURE_HEIGHT,
        maxWidth: size * (CHIN.right - CHIN.left) * 0.94,
      }),
    [text, size],
  );

  return (
    <Canvas
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {figure.glyphs.map((glyph, index) => (
        <Glyph
          key={`${index}:${text}`}
          glyph={glyph}
          seed={seedFromString(`carve/${seed}/${index}`)}
          strokeScale={figure.strokeScale}
          progress={progress}
        />
      ))}
    </Canvas>
  );
}

type GlyphProps = {
  glyph: FigureGlyph;
  seed: number;
  strokeScale: number;
  progress?: SharedValue<number>;
};

function Glyph({ glyph, seed, strokeScale, progress }: GlyphProps) {
  // Each glyph reads its own slice out of the shared write. Before its turn it
  // stays at zero — invisible — and after it, fully struck.
  const end = useDerivedValue(() => {
    const at = progress?.value ?? 1;
    return Math.min(1, Math.max(0, (at - glyph.start) / (glyph.end - glyph.start)));
  }, [progress, glyph.start, glyph.end]);

  return (
    <HandPath
      path={glyph.path}
      color={CARVE_INK}
      variant="crayon"
      seed={seed}
      strokeScale={strokeScale}
      end={end}
    />
  );
}
