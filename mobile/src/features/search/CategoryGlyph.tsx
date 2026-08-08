/**
 * Four drawn marks, one per kind of thing.
 *
 * A catalogue list is 463 rows of very similar-looking text, and scanning it
 * with the eye is the whole job of this screen. The marks give each row a
 * shape before its word is read — an apple, a glass, a wheel, a parcel — so a
 * thumb heading for "bus" stops at the wheels rather than reading four labels.
 *
 * They carry no information the row does not already say in words, so the
 * canvas is hidden from the screen reader and the category is spoken as text
 * in the line beneath the name.
 */

import { Canvas, Skia, type SkPath } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { HandPath } from '../../drawing/HandPath';
import { seedFromString } from '../../drawing/seededRandom';
import type { ItemCategory } from '../../data/api';

/** Every mark is authored on a 24×24 grid and scaled from there. */
const GRID = 24;

export const GLYPH_SIZE = 30;

function buildGlyph(category: ItemCategory, size: number): SkPath {
  const u = size / GRID;
  const builder = Skia.PathBuilder.Make();

  switch (category) {
    case 'food': {
      // An apple: two lobes meeting at a dimple, with a stem leaving the top.
      builder.moveTo(12 * u, 8.4 * u);
      builder.cubicTo(9.2 * u, 4.6 * u, 3.6 * u, 6.6 * u, 4.6 * u, 12.6 * u);
      builder.cubicTo(5.5 * u, 17.9 * u, 9.6 * u, 21.2 * u, 12 * u, 21.2 * u);
      builder.cubicTo(14.4 * u, 21.2 * u, 18.5 * u, 17.9 * u, 19.4 * u, 12.6 * u);
      builder.cubicTo(20.4 * u, 6.6 * u, 14.8 * u, 4.6 * u, 12 * u, 8.4 * u);
      builder.moveTo(12 * u, 8.4 * u);
      builder.quadTo(12.9 * u, 5.4 * u, 13.4 * u, 3.2 * u);
      break;
    }
    case 'drink': {
      // A tapered glass with a level line where the liquid sits.
      builder.moveTo(6.2 * u, 3.6 * u);
      builder.lineTo(17.8 * u, 3.6 * u);
      builder.lineTo(15.3 * u, 20.6 * u);
      builder.lineTo(8.7 * u, 20.6 * u);
      builder.close();
      builder.moveTo(7.3 * u, 11 * u);
      builder.quadTo(12 * u, 12.1 * u, 16.7 * u, 11 * u);
      break;
    }
    case 'transport': {
      // A wheel on a road: the thing every mode has in common.
      builder.addCircle(12 * u, 10.6 * u, 6.6 * u);
      builder.addCircle(12 * u, 10.6 * u, 1.9 * u);
      builder.moveTo(2.8 * u, 20.8 * u);
      builder.lineTo(9.4 * u, 20.8 * u);
      builder.moveTo(13.4 * u, 20.8 * u);
      builder.lineTo(21.2 * u, 20.8 * u);
      break;
    }
    case 'product': {
      // A parcel: a box with its tape running over the lid.
      builder.moveTo(4 * u, 8.4 * u);
      builder.lineTo(12 * u, 4.2 * u);
      builder.lineTo(20 * u, 8.4 * u);
      builder.lineTo(20 * u, 17.6 * u);
      builder.lineTo(12 * u, 21.4 * u);
      builder.lineTo(4 * u, 17.6 * u);
      builder.close();
      builder.moveTo(4 * u, 8.4 * u);
      builder.lineTo(12 * u, 12.6 * u);
      builder.lineTo(20 * u, 8.4 * u);
      builder.moveTo(12 * u, 12.6 * u);
      builder.lineTo(12 * u, 21.4 * u);
      break;
    }
  }

  return builder.detach();
}

export type CategoryGlyphProps = {
  category: ItemCategory;
  color: string;
  size?: number;
};

export function CategoryGlyph({ category, color, size = GLYPH_SIZE }: CategoryGlyphProps) {
  const path = useMemo(() => buildGlyph(category, size), [category, size]);

  return (
    <Canvas
      style={[styles.canvas, { width: size, height: size }]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <HandPath
        path={path}
        color={color}
        variant="pencil"
        seed={seedFromString(`search/glyph/${category}`)}
        strokeScale={0.85}
      />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: { flexShrink: 0 },
});
