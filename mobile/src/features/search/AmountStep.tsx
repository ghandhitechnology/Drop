/**
 * The second half of a search: how much of it.
 *
 * The catalogue's own serving is already filled in, so the fast path is one
 * tap on "Show me the water" and nothing else. The stepper is here for the
 * times a serving is obviously wrong — two coffees, a forty-kilometre bus
 * ride — and it moves in servings rather than grams, the same way it does on
 * the result card.
 *
 * Deliberately there is no number on this screen. The litres belong to Drop,
 * on the camera, a second from now; printing them here would spend the reveal
 * in a sheet that is about to close.
 */

import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { useTheme } from '../../design/theme';
import { radius, space } from '../../design/tokens';
import type { CatalogItem } from '../../data/types';
import { copy } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';
import type { Estimate } from '../capture/types';
import { QuantityStepper } from '../result/QuantityStepper';
import { CategoryGlyph } from './CategoryGlyph';

export type AmountStepProps = {
  item: CatalogItem;
  basis: string | null;
  onBack: () => void;
  onGo: (quantity: number, userEntered: boolean) => void;
};

export function AmountStep({ item, basis, onBack, onGo }: AmountStepProps) {
  const { colors } = useTheme();
  const unit = item.defaultUnit as Estimate['quantity']['unit'];

  const [value, setValue] = useState(item.defaultQuantity);

  useEffect(() => {
    setValue(item.defaultQuantity);
    AccessibilityInfo.announceForAccessibility(copy.search.announce.amount(item.label));
  }, [item.id, item.defaultQuantity, item.label]);

  const handleGo = useCallback(
    () => onGo(value, value !== item.defaultQuantity),
    [onGo, value, item.defaultQuantity],
  );

  return (
    <View style={styles.root}>
      <Touch onPress={onBack} style={styles.back} accessibilityLabel={copy.search.amountBack}>
        <Text variant="label" tone="accent">
          {copy.search.amountBack}
        </Text>
      </Touch>

      <View style={styles.block}>
        <View style={styles.heading}>
          <CategoryGlyph category={item.category} color={colors.accent} />
          <Text variant="title" tone="ink" numberOfLines={2} style={styles.name}>
            {item.label}
          </Text>
        </View>

        <QuantityStepper
          base={item.defaultQuantity}
          unit={unit}
          basis={basis}
          value={value}
          onChange={setValue}
        />

        <Touch
          onPress={handleGo}
          style={[styles.go, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
          accessibilityLabel={copy.search.go}
          accessibilityHint={copy.search.goHint}
        >
          <Text variant="label" tone="accent">
            {copy.search.go}
          </Text>
        </Touch>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingBottom: space.lg },
  back: { minHeight: 48, justifyContent: 'center' },
  /** The question itself, held in the middle of whatever height the sheet has. */
  block: { flex: 1, justifyContent: 'center', gap: space.xl },
  heading: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { flex: 1 },
  go: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
