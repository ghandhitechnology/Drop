/**
 * The photo, kept.
 *
 * A capture stops being a step in a pipeline the moment it can be seen: the
 * square that was framed becomes a print on a paper mat, traced round by
 * hand and pinned at whatever angle it landed at. The same print stands above
 * the result and inside the record it turns into, so a saved entry still looks
 * like the moment it came from.
 *
 * The crop is a centre crop. The reticle is centred on the frame, so `cover` on
 * a square window lands on the region that was actually framed — no second copy
 * of the photo has to be written to get it.
 */

import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { fontFamily } from '../../design/typography';
import { seedFromString, seededRange } from '../../drawing/seededRandom';
import { CarvedFigure, CARVE_INK } from './CarvedFigure';

/**
 * The supplied pencil frame, cut out so the camera remains visible through its
 * window and the paper keeps its shape in either colour scheme.
 */
const FRAME = require('../../../assets/images/capture/captured-photo-frame.png');

/**
 * The hand-drawn opening measured from the frame's square source canvas.
 * A little overlap hides compression seams underneath the pencil stroke.
 */
const WINDOW = {
  left: 0.192,
  top: 0.127,
  width: 0.622,
  height: 0.613,
} as const;

/** Each shot lands like a hand-stamped print, with its own emphatic angle. */
const TILT = 20;

/**
 * The date's spot on the mat: right-aligned to the window's edge, inside the
 * thin strip between the frame's top border and the photo.
 */
const DATE = { top: 0.066, right: 1 - (WINDOW.left + WINDOW.width), size: 0.046 } as const;

export type SnapshotProps = {
  uri: string;
  /** Outer source-canvas side, frame and transparent breathing room included. */
  size: number;
  /** Stable id. The trace and the lean are drawn from it and never change. */
  seed: string;
  /** Spoken description. Left out, the print is decoration. */
  label?: string;
  /** Degrees of lean. Defaults to the seeded one; pass 0 to drive it yourself. */
  tilt?: number;
  /** Written into the mat's top-right corner — "Aug 9, 2026". */
  date?: string;
  /** The litres, written onto the chin — "4,200 L". */
  carved?: string;
  /** 0 → 1 writes the litres on. Absent, they are already written. */
  carveProgress?: SharedValue<number>;
  style?: ViewStyle | ViewStyle[];
};

/** The lean a given print rests at, so a caller can animate into it. */
export function snapshotTilt(seed: string): number {
  return seededRange(seedFromString(`snapshot/tilt/${seed}`), -TILT, TILT)();
}

export function Snapshot({
  uri,
  size,
  seed,
  label,
  tilt,
  date,
  carved,
  carveProgress,
  style,
}: SnapshotProps) {
  const lean = tilt ?? snapshotTilt(seed);

  return (
    <View
      style={[
        styles.print,
        {
          width: size,
          height: size,
          transform: [{ rotate: `${lean}deg` }],
        },
        style,
      ]}
      accessible={Boolean(label)}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      <View
        style={[
          styles.window,
          {
            left: size * WINDOW.left,
            top: size * WINDOW.top,
            width: size * WINDOW.width,
            height: size * WINDOW.height,
          },
        ]}
      >
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessible={false}
        />
      </View>

      <Image
        source={FRAME}
        style={[styles.frame, { width: size, height: size }]}
        resizeMode="contain"
        accessible={false}
      />

      {/*
        Written on, not laid over: the date and the litres live on the mat the
        frame asset bakes in white, so both keep a fixed graphite regardless of
        theme. The spoken description above already carries the record's words.
      */}
      {date && (
        <Text
          style={[
            styles.date,
            {
              top: size * DATE.top,
              right: size * DATE.right,
              fontSize: Math.round(size * DATE.size),
              lineHeight: Math.round(size * DATE.size * 1.2),
            },
          ]}
          numberOfLines={1}
          allowFontScaling={false}
          accessible={false}
          importantForAccessibility="no"
        >
          {date}
        </Text>
      )}

      {carved && (
        <CarvedFigure text={carved} size={size} seed={seed} progress={carveProgress} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  print: { position: 'relative' },
  // Explicit dimensions keep iOS from resolving the 1254px source at its
  // intrinsic size when this absolute image sits inside a transformed print.
  frame: { position: 'absolute', left: 0, top: 0 },
  window: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  date: {
    position: 'absolute',
    fontFamily: fontFamily.noteBold,
    color: CARVE_INK,
    opacity: 0.8,
  },
});
