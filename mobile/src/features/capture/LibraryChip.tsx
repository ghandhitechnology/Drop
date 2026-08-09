/**
 * The way in for a photo that already exists.
 *
 * It sits bottom-right, opposite the search chip, because the two are the same
 * kind of offer: a way to record something the camera is not currently pointed
 * at. The shutter keeps the middle — the camera is still the front door, and
 * this is the one beside it.
 *
 * The chip carries no word. Its neighbours across the frame are already
 * labelled and a third phrase along the bottom edge would turn a viewfinder
 * into a toolbar, so the mark does the work and the label is spoken rather than
 * printed. The mark is a print with a landscape in it — the same rectangle the
 * captured photo lands in, holding a picture that was taken somewhere else.
 */

import { Canvas, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';

import { space } from '../../design/tokens';
import { HandPath } from '../../drawing/HandPath';
import { seedFromString } from '../../drawing/seededRandom';
import { copy } from '../../lib/copy';
import { CHIP_HEIGHT, HandChip } from './HandChip';
import { useOverlayInk } from './overlay';

/** Authored on the same 24×24 grid every other drawn mark uses. */
const GRID = 24;
const GLYPH = 20;

const SEED = seedFromString('capture/library');

export type LibraryChipProps = {
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
};

export function LibraryChip({ onPress, disabled, style }: LibraryChipProps) {
  const overlayInk = useOverlayInk();
  const path = useMemo(() => {
    const u = GLYPH / GRID;
    const builder = Skia.PathBuilder.Make();

    // The frame, traced in one go and carried a little past where it started —
    // the same overshoot the drawn buttons take at their corner.
    builder.moveTo(2.6 * u, 8 * u);
    builder.lineTo(2.6 * u, 5 * u);
    builder.lineTo(21.4 * u, 5 * u);
    builder.lineTo(21.4 * u, 19 * u);
    builder.lineTo(2.6 * u, 19 * u);
    builder.lineTo(2.6 * u, 6.4 * u);

    // A horizon inside it, running edge to edge, so the box reads as holding a
    // picture rather than being an empty box.
    builder.moveTo(3.4 * u, 16.2 * u);
    builder.lineTo(8.6 * u, 9.8 * u);
    builder.lineTo(12.4 * u, 13.8 * u);
    builder.lineTo(15.4 * u, 11.2 * u);
    builder.lineTo(20.6 * u, 16.4 * u);

    return builder.detach();
  }, []);

  return (
    <HandChip
      seed="capture/library"
      onPress={onPress}
      disabled={disabled}
      style={StyleSheet.flatten([styles.chip, style])}
      contentStyle={styles.content}
      accessibilityLabel={copy.capture.fromLibrary}
      accessibilityHint={copy.capture.fromLibraryHint}
    >
      <Canvas
        style={styles.glyph}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <HandPath
          path={path}
          color={overlayInk.mark}
          variant="pencil"
          seed={SEED}
          strokeScale={0.7}
        />
      </Canvas>
    </HandChip>
  );
}

const styles = StyleSheet.create({
  // Square, against the pill the labelled chip opposite makes.
  chip: { width: CHIP_HEIGHT },
  content: { paddingHorizontal: space.sm },
  glyph: { width: GLYPH, height: GLYPH },
});
