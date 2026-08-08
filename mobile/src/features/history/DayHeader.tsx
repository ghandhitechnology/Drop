/**
 * The line that starts a day.
 *
 * It sticks to the top of the list while its own entries scroll under it, so
 * the day a row belongs to is always on screen. That means it needs an opaque
 * ground of its own — a sticky header over a transparent background smears.
 */

import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../design/theme';
import { space } from '../../design/tokens';
import { copy } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { dayHeading, litresShort, litresSpoken } from './format';

export type DayHeaderProps = {
  day: string;
  total: number;
  todayKey: string;
};

export function DayHeader({ day, total, todayKey }: DayHeaderProps) {
  const { colors } = useTheme();
  const heading = dayHeading(day, todayKey);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.bg, borderBottomColor: colors.inkFaint },
      ]}
      accessible
      accessibilityRole="header"
      accessibilityLabel={copy.history.line(heading, litresSpoken(total))}
    >
      <View style={styles.inner} importantForAccessibility="no-hide-descendants">
        <Text variant="label" tone="ink" style={styles.heading}>
          {heading}
        </Text>
        <Text variant="label" tone="inkSoft" style={styles.total}>
          {litresShort(total)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderBottomWidth: 1 },
  inner: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  heading: { flexShrink: 1 },
  total: { fontVariant: ['tabular-nums'] },
});
