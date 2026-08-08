/**
 * The morph.
 *
 * Drop's silhouette and the result card's frame are written to the same
 * command structure — one move and six cubics per half — so Skia can walk one
 * into the other point by point. The paper fill takes the same trip as one
 * closed contour, which is what makes the card look like it grew out of the
 * character rather than sliding up underneath it.
 *
 * Command structure is checked once with `isInterpolatable`; if a future edit
 * ever breaks the pairing the shape falls back to the card, which is the state
 * that has to be right.
 */

import { Group, Path, interpolatePaths, type SkPath } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import {
  Extrapolation,
  interpolate,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { HandPath } from '../../drawing/HandPath';
import {
  cardBottom,
  cardOutline,
  cardTop,
  dropBottom,
  dropOutline,
  dropTop,
  type Box,
} from './silhouette';

export type MorphShapeProps = {
  expansion: SharedValue<number>;
  /** Where Drop stands. The shape starts here. */
  from: Box;
  /** Where the card lands. The shape ends here. */
  to: Box;
  radius: number;
  /** Frame ink. */
  color: string;
  /** Card fill. */
  paper: string;
  seed: number;
  reduceMotion: boolean;
};

/**
 * The paper is there from the first frame.
 *
 * Drop stands on the viewfinder as a paper cut-out, which is what makes its
 * pencil ink readable against whatever the lens is pointed at — and it means
 * the card is literally the same sheet, stretched. It lifts the last few
 * percent as the shape squares off, so the card reads as opaque paper while
 * the cut-out keeps a hint of the frame behind it.
 */
const FILL_WINDOW: [number, number] = [0, 0.45];
const FILL_RANGE: [number, number] = [0.9, 1];

export function MorphShape({
  expansion,
  from,
  to,
  radius,
  color,
  paper,
  seed,
  reduceMotion,
}: MorphShapeProps) {
  const shapes = useMemo(() => {
    const ends = {
      top: cardTop(to, radius),
      bottom: cardBottom(to, radius),
      fill: cardOutline(to, radius),
    };
    const starts = {
      top: dropTop(from),
      bottom: dropBottom(from),
      fill: dropOutline(from),
    };

    const paired =
      starts.top.isInterpolatable(ends.top) &&
      starts.bottom.isInterpolatable(ends.bottom) &&
      starts.fill.isInterpolatable(ends.fill);

    return { starts: paired ? starts : ends, ends, paired };
  }, [from, to, radius]);

  // Reduced motion holds the card shape and lets opacity carry the change.
  const still = reduceMotion || !shapes.paired;

  const topPath = useDerivedValue(() =>
    still
      ? shapes.ends.top
      : interpolatePaths(expansion.value, [0, 1], [shapes.starts.top, shapes.ends.top]),
  );

  const bottomPath = useDerivedValue(() =>
    still
      ? shapes.ends.bottom
      : interpolatePaths(
          expansion.value,
          [0, 1],
          [shapes.starts.bottom, shapes.ends.bottom],
        ),
  );

  const fillPath = useDerivedValue(() =>
    still
      ? shapes.ends.fill
      : interpolatePaths(expansion.value, [0, 1], [shapes.starts.fill, shapes.ends.fill]),
  );

  const fillOpacity = useDerivedValue(() =>
    interpolate(expansion.value, FILL_WINDOW, FILL_RANGE, Extrapolation.CLAMP),
  );

  // Skia reads shared values straight off these props; the declared types
  // describe the resolved value rather than the carrier.
  const animated = (path: unknown) => path as SkPath;

  // When the shape can't travel it holds the card frame, so the expansion has
  // to arrive as opacity — otherwise the full-size card sits over the stage
  // while the result is still only presenting itself.
  const groupOpacity = useDerivedValue(() => (still ? expansion.value : 1));

  return (
    <Group opacity={groupOpacity}>
      <Path path={animated(fillPath)} color={paper} style="fill" opacity={fillOpacity} />
      <HandPath
        path={animated(topPath)}
        color={color}
        variant="pencil"
        seed={seed}
        strokeScale={1.15}
      />
      <HandPath
        path={animated(bottomPath)}
        color={color}
        variant="pencil"
        seed={seed + 5}
        strokeScale={1.15}
      />
    </Group>
  );
}
