/**
 * One thing the catalogue knows.
 *
 * Three pieces of information, in the order a thumb uses them: the mark says
 * what kind of thing it is, the name says which one, and the amount on the
 * right says what Drop will count if this row is chosen. That last one matters
 * more than it looks — it is the difference between picking "Coffee" and
 * finding out afterwards that Drop meant a 125 ml cup.
 *
 * The whole row is one target and one spoken sentence.
 */

import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../design/theme';
import { radius, space } from '../../design/tokens';
import type { CatalogItem } from '../../data/types';
import { copy, formatQuantity } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';
import type { Estimate } from '../capture/types';
import { CategoryGlyph } from './CategoryGlyph';

export type ResultRowProps = {
  item: CatalogItem;
  /** What one of this is called: "one banana", "typical trip". */
  basis: string | null;
  onPress: (item: CatalogItem) => void;
};

export const ResultRow = memo(function ResultRow({ item, basis, onPress }: ResultRowProps) {
  const { colors } = useTheme();

  const categoryWord = copy.search.category[item.category];
  const amount = formatQuantity(
    item.defaultQuantity,
    item.defaultUnit as Estimate['quantity']['unit'],
  );
  const support = basis ? copy.search.row(categoryWord, basis) : categoryWord;

  return (
    <Touch
      onPress={() => onPress(item)}
      style={[styles.row, { borderColor: colors.inkFaint }]}
      accessibilityLabel={`${item.label}. ${support}. ${amount}`}
      accessibilityHint={copy.search.rowHint}
    >
      <CategoryGlyph category={item.category} color={colors.accent} />

      <View style={styles.words}>
        <Text variant="body" tone="ink" numberOfLines={1}>
          {item.label}
        </Text>
        <Text variant="label" tone="inkSoft" numberOfLines={1}>
          {support}
        </Text>
      </View>

      <View style={[styles.amount, { backgroundColor: colors.paper }]}>
        <Text variant="chip" tone="inkSoft">
          {amount}
        </Text>
      </View>
    </Touch>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
  },
  words: { flex: 1, gap: 2 },
  amount: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
});
