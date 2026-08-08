/**
 * The rays.
 *
 * Nine strokes leave Drop as the card opens, reach the frame, and erase
 * themselves from the tail — the leading end draws on early, the trailing end
 * sets off later and chases it down. By the time the card is fully open they
 * have wiped themselves off the glass, so nothing has to be cleaned up
 * afterwards and a scrub backwards replays them exactly in reverse.
 *
 * They are pure decoration and live inside a canvas the screen reader never
 * reaches.
 */

import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { Extrapolation, interpolate } from 'react-native-reanimated';

import { HandPath } from '../../drawing/HandPath';
import type { Ray } from './silhouette';

export type ExpansionRaysProps = {
  rays: Ray[];
  expansion: SharedValue<number>;
  color: string;
  seed: number;
};

/** Where the whole fan starts fading, so it is gone before the card settles. */
const FADE_WINDOW: [number, number] = [0.72, 1];

export function ExpansionRays({ rays, expansion, color, seed }: ExpansionRaysProps) {
  return (
    <>
      {rays.map((ray, index) => (
        <RayStroke
          // Rays are generated once per capture and never reordered.
          key={index}
          ray={ray}
          expansion={expansion}
          color={color}
          seed={seed + index * 31}
        />
      ))}
    </>
  );
}

function RayStroke({
  ray,
  expansion,
  color,
  seed,
}: {
  ray: Ray;
  expansion: SharedValue<number>;
  color: string;
  seed: number;
}) {
  const end = useDerivedValue(() =>
    interpolate(expansion.value, ray.endWindow, [0, 1], Extrapolation.CLAMP),
  );

  const start = useDerivedValue(() =>
    interpolate(expansion.value, ray.startWindow, [0, 1], Extrapolation.CLAMP),
  );

  const opacity = useDerivedValue(() =>
    interpolate(expansion.value, FADE_WINDOW, [0.92, 0], Extrapolation.CLAMP),
  );

  return (
    <HandPath
      path={ray.path}
      color={color}
      variant="crayon"
      seed={seed}
      strokeScale={0.85}
      start={start}
      end={end}
      opacity={opacity}
    />
  );
}
