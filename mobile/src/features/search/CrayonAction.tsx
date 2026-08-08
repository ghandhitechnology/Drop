import { Canvas, Skia, type SkPath } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';

import { radius } from '../../design/tokens';
import { useTheme } from '../../design/theme';
import { HandFrame } from '../../drawing/HandFrame';
import { HandPath } from '../../drawing/HandPath';
import { mulberry32, seedFromString } from '../../drawing/seededRandom';
import { Text } from '../../ui/Text';
import { Touch, type TouchProps } from '../../ui/Touch';

export type CrayonActionProps = Omit<TouchProps, 'children' | 'style' | 'onLayout'> & {
  children: string;
  seed: string;
  tone?: 'primary' | 'secondary';
  style?: ViewStyle | ViewStyle[];
};

/**
 * A full-width action made from the same waxy marks as Drop's reveal.
 *
 * The frame provides the irregular edge; quiet, seeded strokes inside the wash
 * keep the surface from reading as a stock rounded React Native button.
 */
export function CrayonAction({
  children,
  seed,
  tone = 'primary',
  style,
  ...touchProps
}: CrayonActionProps) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const seedValue = useMemo(() => seedFromString(seed), [seed]);
  const paths = useMemo(
    () => crayonFill(size.width, size.height, seedValue),
    [size.width, size.height, seedValue],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  const primary = tone === 'primary';
  const outline = primary ? colors.accent : colors.inkSoft;
  const wash = primary ? colors.accentSoft : colors.paper;

  return (
    <Touch
      {...touchProps}
      onLayout={onLayout}
      style={StyleSheet.flatten([styles.touch, style])}
      pressedScale={0.985}
    >
      <HandFrame
        seed={seedValue}
        variant="crayon"
        color={outline}
        radius={radius.lg}
        strokeScale={primary ? 1 : 0.82}
        style={styles.frame}
        contentStyle={styles.content}
      >
        <View style={[styles.wash, { backgroundColor: wash }]} pointerEvents="none" />
        {paths.length > 0 && (
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            {paths.map((path, index) => (
              <HandPath
                key={index}
                path={path}
                color={outline}
                variant="crayon"
                seed={seedValue + index * 17}
                strokeScale={1.8}
                opacity={primary ? 0.08 : 0.045}
              />
            ))}
          </Canvas>
        )}
        <Text variant="note" tone={primary ? 'accent' : 'ink'}>
          {children}
        </Text>
      </HandFrame>
    </Touch>
  );
}

/** Sparse horizontal wax passes. The label remains clean and fully legible. */
function crayonFill(width: number, height: number, seed: number): SkPath[] {
  if (width <= 24 || height <= 24) return [];
  const next = mulberry32(seed + 41);
  const lines = 5;

  return Array.from({ length: lines }, (_, index) => {
    const y = 12 + ((height - 24) * index) / Math.max(1, lines - 1);
    const path = Skia.PathBuilder.Make();
    path.moveTo(12, y + (next() - 0.5) * 2.4);
    for (let step = 1; step <= 5; step += 1) {
      path.lineTo(
        12 + ((width - 24) * step) / 5,
        y + (next() - 0.5) * 3.2,
      );
    }
    return path.detach();
  });
}

const styles = StyleSheet.create({
  touch: { minHeight: 56, alignSelf: 'stretch' },
  frame: { minHeight: 56 },
  content: { minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  wash: {
    position: 'absolute',
    top: 7,
    left: 7,
    right: 7,
    bottom: 7,
    borderRadius: radius.md,
  },
});
