/**
 * The drawn button.
 *
 * One primitive behind every boxed control in Drop, so the whole product is
 * traced by the same hand — but seeded per control, so no two are traced the
 * same way. The seed decides the corner radii, how far the pen drifts, whether
 * it carries past the seam or stops short, whether one edge was gone over
 * twice, and how hard the line was pressed. A row of these varies the way a row
 * of boxes on a page varies; a screen of them never repeats.
 *
 * The wash inside a filled button is its own traced shape rather than a rounded
 * `View`, drawn a little smaller than the outline. Colour that stops just short
 * of the line is what reading as "coloured in" depends on — a rectangle behind
 * a wobbly outline reads as a sticker with a sketch drawn over it.
 */

import { Blur, Canvas, Group, Path } from '@shopify/react-native-skia';
import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';

import { useColors } from '../design/theme';
import { radius as radii } from '../design/tokens';
import { HandPath, type HandVariant } from '../drawing/HandPath';
import { mulberry32, seedFromString } from '../drawing/seededRandom';
import { sketchRect } from '../drawing/sketchShape';
import { Touch, type TouchProps } from './Touch';

export type SketchTone = 'accent' | 'ink' | 'quiet';

export type SketchButtonProps = Omit<TouchProps, 'children' | 'style'> & {
  children: ReactNode;
  /** Stable name. Seeds every wobble, so this control always draws the same. */
  seed: string;
  tone?: SketchTone;
  /** Colour the inside. Primary actions do; the rest carry an outline alone. */
  filled?: boolean;
  /** Corner radius before the hand varies it. */
  radius?: number;
  /** Overrides `tone` — for marks on the viewfinder, which is not paper. */
  outlineColor?: string;
  washColor?: string;
  /** Weight of the whole trace. Small chips take less than a full-width action. */
  scale?: number;
  style?: ViewStyle | ViewStyle[];
  contentStyle?: ViewStyle | ViewStyle[];
};

/** Room for the widest stroke pass plus whatever the pen carries past the seam. */
const INSET = 6;

/**
 * How this particular control was drawn.
 *
 * Derived once from the seed and stable for the life of the control. The ranges
 * are deliberately narrow: the aim is a set of marks that look like they came
 * from one hand on one afternoon, not a set that looks randomised.
 */
function characterOf(seed: number, filled: boolean) {
  const next = mulberry32((seed ^ 0x5f3a7c1d) >>> 0);
  // Rolled before the fill is consulted, so a control that becomes selected is
  // coloured in rather than redrawn. A toggle whose box changes shape under the
  // thumb reads as a different button arriving, not as the same one answering.
  const waxy = next() < 0.4;
  return {
    // A filled control is always waxy — the outline has to hold a colour in.
    variant: (filled || waxy ? 'crayon' : 'pencil') as HandVariant,
    weight: 0.74 + next() * 0.34,
    slack: 0.75 + next() * 1.15,
    tilt: (next() - 0.5) * 1.2,
    retrace: next() < 0.36,
    radiusScale: 0.8 + next() * 0.42,
  };
}

export type SketchSurfaceProps = Pick<
  SketchButtonProps,
  'children' | 'seed' | 'tone' | 'filled' | 'radius' | 'outlineColor' | 'washColor' | 'scale' | 'style' | 'contentStyle'
>;

/**
 * The drawn shape on its own, with nothing to press.
 *
 * Behind `SketchButton`, and used directly by the handful of controls that show
 * the same shape as a readout — a chip on the viewfinder that states the mode
 * rather than changing it.
 */
export function SketchSurface({
  children,
  seed,
  tone = 'accent',
  filled = false,
  radius = radii.lg,
  outlineColor,
  washColor,
  scale = 1,
  style,
  contentStyle,
}: SketchSurfaceProps) {
  const colors = useColors();
  const [size, setSize] = useState({ width: 0, height: 0 });

  const seedValue = useMemo(() => seedFromString(seed), [seed]);
  const character = useMemo(() => characterOf(seedValue, filled), [seedValue, filled]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  const shape = useMemo(() => {
    const width = size.width - INSET * 2;
    const height = size.height - INSET * 2;
    if (width <= 0 || height <= 0) return null;

    const drawn = sketchRect({
      width,
      height,
      radius: radius * character.radiusScale,
      seed: seedValue,
      slack: character.slack,
      tilt: character.tilt,
      retrace: character.retrace,
    });
    if (!drawn) return null;

    // The colouring is its own pass of the same shape, on its own seed, so its
    // edge disagrees with the outline exactly as much as a hand's would.
    const wash = filled
      ? sketchRect({
          width,
          height,
          radius: radius * character.radiusScale,
          seed: (seedValue + 0x9e37) >>> 0,
          slack: character.slack * 0.7,
          tilt: character.tilt * 0.6,
          inset: 2.5,
        })
      : null;

    return { ...drawn, wash: wash?.outline ?? null };
  }, [size.width, size.height, radius, seedValue, character, filled]);

  const line = outlineColor ?? (tone === 'accent' ? colors.accent : tone === 'ink' ? colors.ink : colors.inkFaint);
  const fill = washColor ?? (tone === 'accent' ? colors.accentSoft : colors.paper);

  return (
    <View style={StyleSheet.flatten([styles.surface, style])} onLayout={handleLayout}>
      {shape && (
        <Canvas
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Group transform={[{ translateX: INSET }, { translateY: INSET }]}>
            {shape.wash && (
              <Path path={shape.wash} color={fill} style="fill">
                <Blur blur={0.7} />
              </Path>
            )}
            <HandPath
              path={shape.outline}
              color={line}
              variant={character.variant}
              seed={seedValue}
              strokeScale={character.weight * scale}
            />
            {shape.retrace && (
              <HandPath
                path={shape.retrace}
                color={line}
                variant="pencil"
                seed={(seedValue + 31) >>> 0}
                strokeScale={character.weight * scale * 0.8}
                opacity={0.5}
              />
            )}
          </Group>
        </Canvas>
      )}
      <View style={StyleSheet.flatten([styles.content, contentStyle])}>{children}</View>
    </View>
  );
}

export function SketchButton({
  children,
  seed,
  tone,
  filled,
  radius,
  outlineColor,
  washColor,
  scale,
  style,
  contentStyle,
  ...touchProps
}: SketchButtonProps) {
  return (
    <Touch {...touchProps} style={style} pressedScale={0.985}>
      <SketchSurface
        seed={seed}
        tone={tone}
        filled={filled}
        radius={radius}
        outlineColor={outlineColor}
        washColor={washColor}
        scale={scale}
        contentStyle={contentStyle}
      >
        {children}
      </SketchSurface>
    </Touch>
  );
}

const styles = StyleSheet.create({
  // Layout belongs to the pressable; the drawn shape fills whatever it is given.
  surface: { alignSelf: 'stretch', flexGrow: 1, justifyContent: 'center' },
  content: { alignItems: 'center', justifyContent: 'center' },
});
