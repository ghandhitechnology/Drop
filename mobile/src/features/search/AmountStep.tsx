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

import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '../../design/theme';
import { space } from '../../design/tokens';
import { useMotion } from '../../design/useMotion';
import type { CatalogItem } from '../../data/types';
import { copy } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';
import type { Estimate } from '../capture/types';
import { QuantityStepper } from '../result/QuantityStepper';
import { CategoryGlyph } from './CategoryGlyph';
import { CrayonAction } from './CrayonAction';

export type AmountStepProps = {
  item: CatalogItem;
  basis: string | null;
  onBack: () => void;
  onGo: (quantity: number, userEntered: boolean) => void;
  /**
   * Keep this one and go back to the list for the next. Absent when the
   * basket is full — the button simply is not offered.
   */
  onAddAnother?: (quantity: number, userEntered: boolean) => void;
};

export function AmountStep({ item, basis, onBack, onGo, onAddAnother }: AmountStepProps) {
  const { colors } = useTheme();
  const motion = useMotion();
  const detailsRef = useRef<ScrollView>(null);
  const unit = item.defaultUnit as Estimate['quantity']['unit'];

  const [value, setValue] = useState(item.defaultQuantity);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(copy.search.announce.amount(item.label));
  }, [item.label]);

  const handleGo = useCallback(
    () => onGo(value, value !== item.defaultQuantity),
    [onGo, value, item.defaultQuantity],
  );

  const handleAddAnother = useCallback(
    () => onAddAnother?.(value, value !== item.defaultQuantity),
    [onAddAnother, value, item.defaultQuantity],
  );

  return (
    <View style={styles.root}>
      <ScrollView
        ref={detailsRef}
        style={styles.details}
        contentContainerStyle={styles.detailsContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() =>
          detailsRef.current?.scrollToEnd({ animated: !motion.reduceMotion })
        }
      >
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
        </View>
      </ScrollView>

      <View style={styles.actions}>
        {onAddAnother && (
          <CrayonAction
            seed="search/add-another"
            tone="secondary"
            onPress={handleAddAnother}
            accessibilityLabel={copy.search.addAnother}
            accessibilityHint={copy.search.addAnotherHint}
          >
            {copy.search.addAnother}
          </CrayonAction>
        )}

        <CrayonAction
          seed="search/show-water"
          onPress={handleGo}
          accessibilityLabel={copy.search.go}
          accessibilityHint={copy.search.goHint}
        >
          {copy.search.go}
        </CrayonAction>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, paddingBottom: space.sm },
  details: { flex: 1, minHeight: 0 },
  // Extra tail room lets an overflowing stack settle between rows instead of
  // leaving the previous control half-clipped at the top edge.
  detailsContent: { paddingBottom: space.xl },
  back: { minHeight: 48, justifyContent: 'center' },
  /** A compact continuation of the stable sheet header, not a new centred page. */
  block: { paddingTop: space.xs, gap: space.lg },
  heading: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { flex: 1 },
  actions: { flexShrink: 0, gap: space.sm, paddingTop: space.sm },
});
