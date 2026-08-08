/**
 * What is driving the week, with Drop looking at it.
 *
 * Appears once the week has passed its mark, and says two things: which item
 * carried the most water, and — where the catalogue holds a comparable lighter
 * one — what swapping it would have freed. Both are read out of the same tables
 * as every other figure in the product.
 *
 * Drop is turned toward the note rather than at the reader. The character is
 * carrying "here is the heavy thing", which is a finding; a character facing
 * out over a missed mark would be carrying "you did badly", which is a verdict,
 * and a verdict here teaches people to stop logging.
 *
 * The whole block is one screen-reader node. Split across three, a screen
 * reader hears an item, a figure, and an unrelated second figure.
 */

import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../design/theme';
import { radius, space } from '../../design/tokens';
import { DropCharacter } from '../../avatar';
import { copy } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { litresShort } from '../history/format';
import type { WeekDriver } from './suggest';

export type DriverNoteProps = {
  driver: WeekDriver;
};

export function DriverNote({ driver }: DriverNoteProps) {
  const { colors } = useTheme();
  const { leader, swap } = driver;

  const leaderLine = copy.goal.leader(
    leader.label,
    leader.times,
    litresShort(leader.litres),
  );
  const swapLine = swap ? copy.goal.swap(swap.label, litresShort(swap.freed)) : null;

  return (
    <View
      style={[styles.root, { backgroundColor: colors.paper }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={[leaderLine, swapLine].filter(Boolean).join('. ')}
    >
      <DropCharacter
        state="thinking"
        size={52}
        seed={`goal/driver/${leader.itemId}`}
      />
      <View style={styles.lines}>
        <Text variant="note" tone="ink">
          {leaderLine}
        </Text>
        {swapLine && (
          <Text variant="label" tone="accent">
            {swapLine}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
  },
  lines: { flex: 1, gap: space.xs },
});
