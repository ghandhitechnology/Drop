/**
 * The photo, kept.
 *
 * A capture stops being a step in a pipeline the moment it can be seen: the
 * square that was framed becomes a small print on a paper mat, traced round by
 * hand and pinned at whatever angle it landed at. The same print stands above
 * the result and inside the record it turns into, so a saved entry still looks
 * like the moment it came from.
 *
 * The crop is a centre crop. The reticle is centred on the frame, so `cover` on
 * a square window lands on the region that was actually framed — no second copy
 * of the photo has to be written to get it.
 */

import { Canvas, Skia, rect, rrect } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../design/theme';
import { radius } from '../../design/tokens';
import { HandPath } from '../../drawing/HandPath';
import { seedFromString, seededRange } from '../../drawing/seededRandom';

/** The paper border around the print. */
const MAT = 8;

/** How far a print may lean, in degrees. Enough to read as placed by hand. */
const TILT = 2.6;

/** How far the traced line straddles the window's edge. */
const TRACE = 2.5;

export type SnapshotProps = {
  uri: string;
  /** Outer side, mat included. */
  size: number;
  /** Stable id. The trace and the lean are drawn from it and never change. */
  seed: string;
  /** Spoken description. Left out, the print is decoration. */
  label?: string;
  /** Degrees of lean. Defaults to the seeded one; pass 0 to drive it yourself. */
  tilt?: number;
  style?: ViewStyle | ViewStyle[];
};

/** The lean a given print rests at, so a caller can animate into it. */
export function snapshotTilt(seed: string): number {
  return seededRange(seedFromString(`snapshot/tilt/${seed}`), -TILT, TILT)();
}

export function Snapshot({ uri, size, seed, label, tilt, style }: SnapshotProps) {
  const { colors } = useTheme();
  const seedValue = useMemo(() => seedFromString(`snapshot/${seed}`), [seed]);
  const inner = Math.max(0, size - MAT * 2);
  const lean = tilt ?? snapshotTilt(seed);

  // Traced on the mat rather than on the photo. Ink on paper holds against any
  // frame the lens happened to catch, where a line laid on the image itself
  // would disappear into every dark corner of it.
  const trace = useMemo(() => {
    if (inner <= TRACE * 2) return null;
    const r = radius.sm + 2;
    return Skia.Path.RRect(
      rrect(
        rect(MAT - TRACE, MAT - TRACE, inner + TRACE * 2, inner + TRACE * 2),
        r,
        r,
      ),
    );
  }, [inner]);

  return (
    <View
      style={[
        styles.mat,
        {
          width: size,
          height: size,
          padding: MAT,
          backgroundColor: colors.paper,
          transform: [{ rotate: `${lean}deg` }],
        },
        style,
      ]}
      accessible={Boolean(label)}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      <View style={[styles.window, { width: inner, height: inner }]}>
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessible={false}
        />
      </View>

      {trace && (
        <Canvas
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <HandPath
            path={trace}
            color={colors.ink}
            variant="crayon"
            seed={seedValue}
            strokeScale={0.9}
          />
        </Canvas>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mat: {
    borderRadius: radius.md,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  window: { borderRadius: radius.sm, overflow: 'hidden' },
});
