/**
 * How well the match landed, in two words and one small drawn mark.
 *
 * The mark is an arc: a whole ring for a solid match, and less of the ring as
 * the match loosens. Four levels, four visibly different shapes, so the chip
 * separates by shape rather than by colour alone. The words carry the meaning
 * — the arc is decoration, and its canvas is hidden from the screen reader.
 */

import { Canvas, Skia, rect } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../design/theme';
import { space } from '../../design/tokens';
import { HandFrame } from '../../drawing/HandFrame';
import { HandPath } from '../../drawing/HandPath';
import { seedFromString } from '../../drawing/seededRandom';
import { confidenceChip } from '../../lib/copy';
import { Text } from '../../ui/Text';
import type { Confidence } from '../capture/types';

/** Degrees of the ring each level draws. */
const SWEEP: Record<Confidence, number> = {
  high: 360,
  medium: 268,
  low: 176,
  very_low: 92,
};

const GLYPH = 14;
const GLYPH_INSET = 2;
/** Half the chip's height — enough to round it fully. */
const CHIP_RADIUS = 17;

export type ConfidenceChipProps = {
  confidence: Confidence | null;
};

export function ConfidenceChip({ confidence }: ConfidenceChipProps) {
  const { colors } = useTheme();
  const level: Confidence = confidence ?? 'very_low';
  const word = confidenceChip(confidence);

  const arc = useMemo(() => {
    const side = GLYPH - GLYPH_INSET * 2;
    // Every level opens at the top and sweeps clockwise, so they differ only
    // in how far round they get.
    return Skia.PathBuilder.Make()
      .addArc(rect(GLYPH_INSET, GLYPH_INSET, side, side), -90, SWEEP[level])
      .detach();
  }, [level]);

  return (
    <HandFrame
      seed={seedFromString(`result/chip/${level}`)}
      color={colors.inkFaint}
      radius={CHIP_RADIUS}
      strokeScale={0.8}
      style={styles.chip}
      contentStyle={styles.content}
    >
      <View
        style={styles.row}
        accessible
        accessibilityRole="text"
        accessibilityLabel={word}
      >
        <Canvas
          style={styles.glyph}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <HandPath
            path={arc}
            color={colors.accent}
            variant="pencil"
            seed={seedFromString(`result/glyph/${level}`)}
            strokeScale={0.75}
          />
        </Canvas>
        <Text variant="chip" tone="ink">
          {word}
        </Text>
      </View>
    </HandFrame>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start' },
  content: { paddingHorizontal: space.md, paddingVertical: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  glyph: { width: GLYPH, height: GLYPH },
});
