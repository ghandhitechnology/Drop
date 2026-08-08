/**
 * A switch, drawn.
 *
 * Every control in Drop is a pencil mark, and a stock platform switch dropped
 * into this screen would be the one object in the product that came from
 * somewhere else. So the skin is drawn — and the semantics are not. The row
 * around it is a real `switch` to the accessibility layer, with a real checked
 * state, so a screen reader announces it exactly as it announces every other
 * switch on the phone. A drawing over platform behaviour is the only trade
 * worth making here.
 *
 * One shared value carries the change: the knob travels while the accent fades
 * up under it. Colours are never swapped mid-slide — a fill that flips at the
 * press while the knob is still moving reads as two separate events.
 *
 * Position also carries the state on its own, which matters: at the two ends of
 * the track the switch is legible with no colour perception at all.
 */
import {
  Canvas,
  Circle,
  Group,
  RoundedRect,
  Skia,
  rect,
  rrect,
} from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useColors } from '../../design/theme';
import { useMotion } from '../../design/useMotion';
import { HandPath } from '../../drawing/HandPath';
import { seedFromString } from '../../drawing/seededRandom';

const TRACK_W = 54;
const TRACK_H = 30;
/** Room for the widest stroke pass to stay inside the canvas. */
const PAD = 4;
const KNOB_R = 9.5;

export type HandSwitchProps = {
  value: boolean;
  /** Seeds the wobble, so a given setting's switch is always the same drawing. */
  name: string;
};

export function HandSwitch({ value, name }: HandSwitchProps) {
  const colors = useColors();
  const motion = useMotion();
  const seed = useMemo(() => seedFromString(`settings/switch/${name}`), [name]);

  const on = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    on.value = motion.reduceMotion
      ? withTiming(value ? 1 : 0, { duration: 0 })
      : withSpring(value ? 1 : 0, motion.springOf('card'));
  }, [value, motion.reduceMotion, on]);

  const geometry = useMemo(() => {
    const inner = rect(PAD, PAD, TRACK_W - PAD * 2, TRACK_H - PAD * 2);
    const r = (TRACK_H - PAD * 2) / 2;
    const rounded = rrect(inner, r, r);
    const cy = TRACK_H / 2;
    const left = PAD + r;
    const right = TRACK_W - PAD - r;
    return {
      rounded,
      track: Skia.Path.RRect(rounded),
      cx: left,
      cy,
      travel: right - left,
    };
  }, []);

  const knobTransform = useDerivedValue(() => {
    'worklet';
    return [{ translateX: on.value * geometry.travel }];
  });

  // Everything that means "on" shares one opacity, so the wash, the accent
  // outline, and the filled knob arrive as a single change.
  const lit = useDerivedValue(() => {
    'worklet';
    return on.value;
  });

  return (
    <View style={styles.box} pointerEvents="none">
      <Canvas
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Group opacity={lit}>
          <RoundedRect rect={geometry.rounded} color={colors.accentSoft} />
        </Group>

        <HandPath
          path={geometry.track}
          color={colors.inkFaint}
          variant="pencil"
          seed={seed}
          strokeScale={0.85}
        />
        <Group opacity={lit}>
          <HandPath
            path={geometry.track}
            color={colors.accent}
            variant="pencil"
            seed={seed}
            strokeScale={0.85}
          />
        </Group>

        <Group transform={knobTransform}>
          <Circle cx={geometry.cx} cy={geometry.cy} r={KNOB_R} color={colors.bg} />
          <Group opacity={lit}>
            <Circle cx={geometry.cx} cy={geometry.cy} r={KNOB_R} color={colors.accent} />
          </Group>
          {/*
            The one clean line in the product, and deliberately so. `HandPath`'s
            jitter is a fixed deviation in path space; around a circle of radius
            9.5 that is a tenth of the radius, and the effect's segments turn the
            knob into a visible octagon. A knob is also the one part of a switch
            that is machined rather than drawn — it reads correctly as a round
            button sitting in a sketched slot.
          */}
          <Circle
            cx={geometry.cx}
            cy={geometry.cy}
            r={KNOB_R}
            color={colors.ink}
            style="stroke"
            strokeWidth={2}
          />
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: TRACK_W, height: TRACK_H },
});
