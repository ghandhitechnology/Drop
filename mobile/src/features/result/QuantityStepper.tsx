/**
 * The amount editor.
 *
 * Steps are servings, not grams: whatever the catalogue calls one of a thing
 * is the unit the thumb moves in, so "one banana" becomes two bananas rather
 * than 0.24 kg. The measured amount is still spelled out underneath, because
 * that is the number the engine actually used.
 *
 * Every press re-runs the estimate against the bundled factor tables, so the
 * hero number above updates as the amount changes — with no round trip and no
 * spinner.
 */

import { useCallback } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { useTheme } from '../../design/theme';
import { space } from '../../design/tokens';
import { copy, formatMultiple, formatQuantity } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';
import type { Estimate } from '../capture/types';

/** Servings move in halves. */
export const STEP = 0.5;
export const MIN_MULTIPLE = 0.5;
export const MAX_MULTIPLE = 10;

export type QuantityStepperProps = {
  /** One serving, as the catalogue defines it. */
  base: number;
  unit: Estimate['quantity']['unit'];
  /** What one serving is called: "one banana", "typical trip". */
  basis: string | null;
  /** Current amount, in the same unit. */
  value: number;
  onChange: (value: number) => void;
};

export function QuantityStepper({
  base,
  unit,
  basis,
  value,
  onChange,
}: QuantityStepperProps) {
  const { colors } = useTheme();

  const multiple = base > 0 ? value / base : 1;
  const amount = formatQuantity(value, unit);

  const move = useCallback(
    (direction: 1 | -1) => {
      const stepped = Math.round(multiple / STEP) * STEP + direction * STEP;
      const next = Math.min(MAX_MULTIPLE, Math.max(MIN_MULTIPLE, stepped));
      if (next === multiple) return;
      const amountNext = Number((base * next).toFixed(6));
      AccessibilityInfo.announceForAccessibility(formatQuantity(amountNext, unit));
      onChange(amountNext);
    },
    [base, multiple, onChange, unit],
  );

  const atFloor = multiple <= MIN_MULTIPLE + 1e-6;
  const atCeiling = multiple >= MAX_MULTIPLE - 1e-6;

  return (
    <View style={styles.root}>
      <Text variant="label" tone="inkSoft">
        {copy.result.amountTitle}
      </Text>

      <View style={styles.row}>
        <Touch
          onPress={() => move(-1)}
          disabled={atFloor}
          style={[
            styles.step,
            { borderColor: colors.inkFaint, backgroundColor: colors.bg },
            atFloor ? styles.spent : styles.intact,
          ]}
          accessibilityLabel={copy.result.less}
          accessibilityState={{ disabled: atFloor }}
        >
          <Text variant="title" tone="ink">
            –
          </Text>
        </Touch>

        <View style={styles.readout} accessible accessibilityRole="text" accessibilityLabel={amount}>
          <Text variant="title" tone="ink" style={styles.amount}>
            {amount}
          </Text>
          <Text variant="label" tone="inkSoft">
            {basis
              ? copy.result.amountBasis(formatMultiple(multiple), basis)
              : formatMultiple(multiple)}
          </Text>
        </View>

        <Touch
          onPress={() => move(1)}
          disabled={atCeiling}
          style={[
            styles.step,
            { borderColor: colors.inkFaint, backgroundColor: colors.bg },
            atCeiling ? styles.spent : styles.intact,
          ]}
          accessibilityLabel={copy.result.more}
          accessibilityState={{ disabled: atCeiling }}
        >
          <Text variant="title" tone="ink">
            +
          </Text>
        </Touch>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  step: {
    width: 52,
    height: 52,
    borderWidth: 1,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spent: { opacity: 0.4 },
  intact: { opacity: 1 },
  readout: { flex: 1, alignItems: 'center' },
  amount: { fontVariant: ['tabular-nums'] },
});
