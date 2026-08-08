/**
 * The drawn text button.
 *
 * Back, done, close, later, retake — the moves that are always available and
 * never the point. Boxing them would give every screen a second thing competing
 * with its actual action, so they take a pencil line under the word instead.
 *
 * The line is seeded like everything else: it bows, it runs past the last
 * letter or stops short of it, and about a quarter of the time it was drawn
 * twice. Which is why "Back" on the record page and "Back" on the history page
 * are not the same mark, even though they are the same word.
 */

import { Canvas, Group } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';

import { useColors } from '../design/theme';
import type { ColorTokens } from '../design/tokens';
import { HandPath } from '../drawing/HandPath';
import { mulberry32, seedFromString } from '../drawing/seededRandom';
import { sketchUnderline } from '../drawing/sketchShape';
import { Text } from './Text';
import { Touch, type TouchProps } from './Touch';
import { MIN_TOUCH_SIZE } from '../design/tokens';
import type { TextVariant } from '../design/typography';

export type SketchLinkProps = Omit<TouchProps, 'children' | 'style'> & {
  children: string;
  /** Stable name. Seeds the mark, so this link always draws the same. */
  seed: string;
  tone?: keyof ColorTokens;
  variant?: TextVariant;
  /** Overrides `tone` for the mark — the viewfinder is not paper. */
  markColor?: string;
  style?: ViewStyle | ViewStyle[];
};

/** The band the mark is drawn in, under the word. */
const RULE_HEIGHT = 9;
/** Room either side for a stroke that starts before the word or runs past it. */
const RULE_BLEED = 6;

export function SketchLink({
  children,
  seed,
  tone = 'accent',
  variant = 'label',
  markColor,
  style,
  onLayout,
  ...touchProps
}: SketchLinkProps) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const seedValue = useMemo(() => seedFromString(seed), [seed]);

  // A little slack in where the mark sits, so a column of links does not have
  // its underlines ruled to the same baseline.
  const drop = useMemo(() => 1 + mulberry32((seedValue ^ 0x2f1b) >>> 0)() * 2.4, [seedValue]);

  const marks = useMemo(
    () => sketchUnderline({ width, seed: seedValue, y: drop }),
    [width, seedValue, drop],
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (current === next ? current : next));
    onLayout?.(event);
  };

  return (
    <Touch {...touchProps} style={StyleSheet.flatten([styles.touch, style])}>
      <View onLayout={handleLayout}>
        <Text variant={variant} tone={tone}>
          {children}
        </Text>
        {marks.length > 0 && (
          <Canvas
            style={[styles.rule, { width: width + RULE_BLEED * 2 }]}
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            {/* The canvas hangs left of the word; the marks stay under it. */}
            <Group transform={[{ translateX: RULE_BLEED }]}>
              {marks.map((path, index) => (
                <HandPath
                  key={index}
                  path={path}
                  color={markColor ?? colors[tone]}
                  variant="pencil"
                  seed={(seedValue + index * 23) >>> 0}
                  strokeScale={0.62}
                  opacity={index === 0 ? 0.9 : 0.45}
                />
              ))}
            </Group>
          </Canvas>
        )}
      </View>
    </Touch>
  );
}

const styles = StyleSheet.create({
  touch: {
    minHeight: MIN_TOUCH_SIZE,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  // Sits under the word rather than in the flow, so adding the mark does not
  // change where the label lands.
  rule: { position: 'absolute', left: -RULE_BLEED, top: '100%', height: RULE_HEIGHT },
});
