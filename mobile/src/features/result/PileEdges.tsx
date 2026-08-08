/**
 * The buried sheets, as paper.
 *
 * Each card behind the front one is drawn here as a filled card outline with
 * the frame's own top edge inked along it — the same silhouette vocabulary the
 * morph uses, so the pile reads as more of the sheet Drop became rather than
 * as furniture behind it. This component paints INSIDE the stage's morph
 * canvas, before `MorphShape`, which is what lets the front card's paper
 * occlude the buried bodies and leave only their top strips showing.
 *
 * Every sheet reads its place off one animated depth: offset up, inset in,
 * lean by its seeded tilt. The front sheet's lift is subtracted from every
 * depth, so a thumb pulling one card out visibly raises the rest of the pile
 * to meet it.
 */

import { Group, Path } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import {
  Extrapolation,
  interpolate,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { HandPath } from '../../drawing/HandPath';
import { cardOutline, cardTop, type Box } from './silhouette';
import {
  FAN_OUT_POINT,
  MAX_PEEKS,
  pileInset,
  pileOffset,
  pileTilt,
} from './useStackOrder';

/** The pile has fully dealt itself by here; sheets hold full ink after it. */
const FAN_SETTLED = 0.85;

export type PileEdgesProps = {
  /** The front card's rectangle — every sheet is this shape, displaced. */
  box: Box;
  radius: number;
  /** Front to back, by item index. The front sheet is not drawn here. */
  order: readonly number[];
  depthOf: (index: number) => SharedValue<number>;
  lift: SharedValue<number>;
  expansion: SharedValue<number>;
  tiltOf: (index: number) => number;
  peekStep: number;
  paper: string;
  ink: string;
  seed: number;
};

export function PileEdges({
  box,
  radius,
  order,
  depthOf,
  lift,
  expansion,
  tiltOf,
  peekStep,
  paper,
  ink,
  seed,
}: PileEdgesProps) {
  // One geometry for every sheet; displacement is a transform, not a rebuild.
  const paths = useMemo(
    () => ({ fill: cardOutline(box, radius), edge: cardTop(box, radius) }),
    [box, radius],
  );

  // Deepest first, so each nearer sheet paints over the one behind it. One
  // extra past the drawn cap keeps the fourth sheet continuous as it fades in
  // during a lift rather than appearing from nothing.
  const buried = order.slice(1, MAX_PEEKS + 2).reverse();

  return (
    <Group>
      {buried.map((index) => (
        <BuriedSheet
          key={index}
          box={box}
          paths={paths}
          depth={depthOf(index)}
          lift={lift}
          expansion={expansion}
          tilt={tiltOf(index)}
          peekStep={peekStep}
          paper={paper}
          ink={ink}
          seed={seed + 7 * (index + 1)}
        />
      ))}
    </Group>
  );
}

function BuriedSheet({
  box,
  paths,
  depth,
  lift,
  expansion,
  tilt,
  peekStep,
  paper,
  ink,
  seed,
}: {
  box: Box;
  paths: { fill: ReturnType<typeof cardOutline>; edge: ReturnType<typeof cardTop> };
  depth: SharedValue<number>;
  lift: SharedValue<number>;
  expansion: SharedValue<number>;
  tilt: number;
  peekStep: number;
  paper: string;
  ink: string;
  seed: number;
}) {
  // Lean and inset both pivot on the sheet's top-centre — the edge that shows.
  const origin = useMemo(
    () => ({ x: box.x + box.width / 2, y: box.y }),
    [box.x, box.y, box.width],
  );

  const transform = useDerivedValue(() => {
    const d = Math.max(0, depth.value - lift.value);
    return [
      { translateY: pileOffset(d, peekStep) },
      { rotate: (pileTilt(d, tilt) * Math.PI) / 180 },
      { scaleX: (box.width - 2 * pileInset(d)) / Math.max(1, box.width) },
    ];
  });

  // Hidden until the pile fans out of the print — before that every sheet sits
  // exactly behind a frame that is still morphing — and gone again a step past
  // the drawn cap, so the fourth sheet fades rather than pops.
  const opacity = useDerivedValue(() => {
    const d = Math.max(0, depth.value - lift.value);
    const leaving = 1 - Math.min(1, Math.max(0, d - MAX_PEEKS));
    const fanned = interpolate(
      expansion.value,
      [FAN_OUT_POINT, FAN_SETTLED],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return leaving * fanned;
  });

  return (
    <Group transform={transform} origin={origin} opacity={opacity}>
      <Path path={paths.fill} color={paper} style="fill" />
      <HandPath path={paths.edge} color={ink} variant="pencil" seed={seed} strokeScale={1} />
    </Group>
  );
}
