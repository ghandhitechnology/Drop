import { StyleSheet, type ViewStyle } from 'react-native';

import { radius } from '../../design/tokens';
import { useTheme } from '../../design/theme';
import { Text } from '../../ui/Text';
import { SketchButton } from '../../ui/SketchButton';
import type { TouchProps } from '../../ui/Touch';

export type CrayonActionProps = Omit<TouchProps, 'children' | 'style' | 'onLayout'> & {
  children: string;
  seed: string;
  tone?: 'primary' | 'secondary';
  style?: ViewStyle | ViewStyle[];
};

/**
 * A full-width action, drawn.
 *
 * The primary is coloured in; the secondary carries the outline alone, traced
 * lighter, so the two read as a decision and its alternative rather than as two
 * buttons of equal weight. Both take their shape from `SketchButton`, which is
 * what keeps the search sheet's actions in the same hand as the result card's.
 */
export function CrayonAction({
  children,
  seed,
  tone = 'primary',
  style,
  ...touchProps
}: CrayonActionProps) {
  const { colors } = useTheme();
  const primary = tone === 'primary';

  return (
    <SketchButton
      {...touchProps}
      seed={`search/action/${seed}`}
      filled={primary}
      radius={radius.lg}
      outlineColor={primary ? colors.accent : colors.inkSoft}
      scale={primary ? 1 : 0.82}
      style={StyleSheet.flatten([styles.action, style])}
      contentStyle={styles.content}
    >
      <Text variant="note" tone={primary ? 'accent' : 'ink'}>
        {children}
      </Text>
    </SketchButton>
  );
}

const styles = StyleSheet.create({
  action: { minHeight: 58, alignSelf: 'stretch' },
  content: { minHeight: 58 },
});
