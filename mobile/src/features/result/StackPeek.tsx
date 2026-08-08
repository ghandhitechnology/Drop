/**
 * The strip a buried sheet shows above the pile.
 *
 * Name on the left, litres on the right — the same grammar as a history row,
 * which is no accident: the pile is previewing the one merged entry it is
 * about to become. A sheet whose figure arrives in a later release says so in
 * the litres' place instead of showing a dash or a zero.
 *
 * Every strip is a real button. A tap brings that sheet to the front, and a
 * screen reader gets the same move by name, which is what keeps the buried
 * cards reachable while their bodies sit outside the reading order.
 */

import { StyleSheet } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { space } from '../../design/tokens';
import { copy, formatLitres } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';
import type { Estimate } from '../capture/types';
import { FAN_OUT_POINT, peekOpacity, pileInset, pileOffset } from './useStackOrder';

/** The card's own padding, so a strip's words line up with the card's. */
const PEEK_PADDING = 20;

/** The pile has fully dealt itself by here; strips hold full ink after it. */
const FAN_SETTLED = 0.85;

export type StackPeekProps = {
  estimate: Estimate;
  /** The sheet's place in the pile, animated. */
  depth: SharedValue<number>;
  /** The front sheet's drag. The pile rises to meet the thumb through it. */
  lift: SharedValue<number>;
  /** The stage's expansion. Strips arrive only once the pile has fanned. */
  expansion: SharedValue<number>;
  /** The peek row in force, measured or assumed. */
  peekStep: number;
  /** The zone's own height; a strip positions itself off its bottom edge. */
  zoneHeight: number;
  onBring: () => void;
  /** Wired on the depth-1 strip only — the measurement the pile is spaced by. */
  onMeasure?: (height: number) => void;
};

export function StackPeek({
  estimate,
  depth,
  lift,
  expansion,
  peekStep,
  zoneHeight,
  onBring,
  onMeasure,
}: StackPeekProps) {
  const style = useAnimatedStyle(() => {
    const d = Math.max(0, depth.value - lift.value);
    const inset = pileInset(d);
    const fanned = interpolate(
      expansion.value,
      [FAN_OUT_POINT, FAN_SETTLED],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: peekOpacity(d) * fanned,
      left: inset,
      right: inset,
      transform: [{ translateY: zoneHeight + pileOffset(d, peekStep) }],
    };
  });

  const litres = estimate.headline
    ? `${formatLitres(estimate.headline.value_l)} ${copy.result.unitShort}`
    : copy.plate.arrivingLater;

  return (
    <Animated.View
      style={[styles.strip, { minHeight: peekStep }, style]}
      onLayout={
        onMeasure
          ? (event) => onMeasure(event.nativeEvent.layout.height)
          : undefined
      }
    >
      <Touch
        onPress={onBring}
        style={styles.row}
        accessibilityLabel={copy.result.bring(estimate.display_name)}
      >
        <Text variant="chip" tone="ink" numberOfLines={1} style={styles.name}>
          {estimate.display_name}
        </Text>
        <Text variant="chip" tone="inkSoft" style={styles.litres}>
          {litres}
        </Text>
      </Touch>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  strip: { position: 'absolute', top: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: PEEK_PADDING,
    paddingVertical: 6,
  },
  name: { flexShrink: 1 },
  litres: { fontVariant: ['tabular-nums'] },
});
