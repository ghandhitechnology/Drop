/**
 * The result, in words and numbers.
 *
 * The card carries no frame of its own — the signature expansion draws it, by
 * morphing Drop's silhouette into exactly this rectangle. What lives here is
 * the reading: one figure, what it is, how well it matched, how much of it,
 * and on request everything behind it.
 *
 * Reading order is deliberate and matches the visual order: number, item,
 * confidence, the notes that change what the number means, the amount, then
 * the detail and the source. The hero takes screen-reader focus the moment the
 * card opens, so the answer is the first thing spoken.
 */

import { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View, findNodeHandle } from 'react-native';

import { useTheme } from '../../design/theme';
import { space } from '../../design/tokens';
import {
  copy,
  formatQuantity,
  formatRange,
  hasSpread,
  heroFigure,
  litresSentence,
  unsupportedLine,
} from '../../lib/copy';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';
import type { Estimate } from '../capture/types';
import { CandidateChips } from '../search/CandidateChips';
import { ConfidenceChip } from './ConfidenceChip';
import { DetailSection, HeadlineNotes } from './DetailSection';
import { QuantityStepper } from './QuantityStepper';

export type ResultCardProps = {
  estimate: Estimate;
  /** True once the expansion has committed and the card is readable. */
  open: boolean;
  adjusting: boolean;
  confirmed: boolean;
  detailOpen: boolean;
  /** One serving of this item, as the catalogue defines it. */
  base: number;
  basis: string | null;
  onToggleDetail: () => void;
  onAdjust: () => void;
  onQuantity: (value: number) => void;
  onConfirm: () => void;
  onClose: () => void;
  onRetake: () => void;
  onSearch: () => void;
};

export function ResultCard(props: ResultCardProps) {
  const { estimate, open } = props;
  const hero = heroFigure(estimate);

  return (
    <View
      style={styles.card}
      accessibilityViewIsModal={open}
      importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
    >
      {hero ? <Figured {...props} /> : <ArrivingLater {...props} />}
    </View>
  );
}

/* --------------------------------------------------------- with a figure */

function Figured({
  estimate,
  open,
  adjusting,
  confirmed,
  detailOpen,
  base,
  basis,
  onToggleDetail,
  onAdjust,
  onQuantity,
  onConfirm,
  onClose,
  onRetake,
}: ResultCardProps) {
  const { colors } = useTheme();
  const hero = heroFigure(estimate);
  const headline = estimate.headline;
  const heroRef = useRef<View>(null);

  // The number is the answer, so it is what a screen reader lands on.
  useEffect(() => {
    if (!open) return;
    const handle = findNodeHandle(heroRef.current);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [open]);

  if (!hero || !headline) return null;

  // The range earns its own chip only when the hero is the point value.
  const rangeChip =
    !hero.range && hasSpread(headline.range_l) ? formatRange(headline.range_l) : null;
  const heroSize = heroScale(hero.value);

  return (
    <>
      <View
        ref={heroRef}
        style={styles.heroRow}
        accessible
        accessibilityRole="text"
        accessibilityLabel={litresSentence(estimate)}
      >
        <Text
          variant="hero"
          tone="ink"
          style={[styles.heroValue, heroSize]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {hero.value}
        </Text>
        <Text variant="heroUnit" tone="inkSoft" style={styles.heroUnit}>
          {hero.unit}
        </Text>
      </View>

      <Text variant="title" tone="ink">
        {estimate.display_name}
      </Text>

      {/*
        Recognition's shortlist, when it had one. Draws nothing at all when the
        match was clear, which is most captures.
      */}
      <CandidateChips />

      <View style={styles.chipRow}>
        <ConfidenceChip confidence={estimate.confidence} />
        {rangeChip && (
          <View style={[styles.rangeChip, { backgroundColor: colors.accentSoft }]}>
            <Text variant="chip" tone="accent">
              {rangeChip}
            </Text>
          </View>
        )}
      </View>

      <HeadlineNotes estimate={estimate} />

      {adjusting ? (
        <QuantityStepper
          base={base}
          unit={estimate.quantity.unit}
          basis={basis}
          value={estimate.quantity.value}
          onChange={onQuantity}
        />
      ) : (
        <Touch
          onPress={onAdjust}
          style={[styles.amountRow, { borderColor: colors.inkFaint }]}
          accessibilityLabel={copy.result.adjust}
          accessibilityValue={{
            text: formatQuantity(estimate.quantity.value, estimate.quantity.unit),
          }}
        >
          <Text variant="label" tone="inkSoft">
            {copy.result.amountTitle}
          </Text>
          <Text variant="label" tone="ink" style={styles.amountValue}>
            {formatQuantity(estimate.quantity.value, estimate.quantity.unit)}
          </Text>
        </Touch>
      )}

      <Touch
        onPress={onToggleDetail}
        style={styles.detailToggle}
        accessibilityLabel={detailOpen ? copy.result.collapse : copy.result.expand}
        accessibilityState={{ expanded: detailOpen }}
      >
        <Text variant="label" tone="accent">
          {detailOpen ? copy.result.collapse : copy.result.expand}
        </Text>
      </Touch>

      {detailOpen && <DetailSection estimate={estimate} />}

      <Touch
        onPress={onConfirm}
        disabled={confirmed}
        style={[
          styles.confirm,
          { backgroundColor: colors.accentSoft, borderColor: colors.accent },
          confirmed ? styles.spent : styles.intact,
        ]}
        accessibilityLabel={copy.result.confirm}
        accessibilityHint={copy.result.confirmHint}
        accessibilityState={{ disabled: confirmed }}
      >
        <Text variant="label" tone="accent">
          {copy.result.confirm}
        </Text>
      </Touch>

      <View style={styles.tailRow}>
        <Touch onPress={onClose} style={styles.tail} accessibilityLabel={copy.result.close}>
          <Text variant="label" tone="inkSoft">
            {copy.result.close}
          </Text>
        </Touch>
        <Touch onPress={onRetake} style={styles.tail} accessibilityLabel={copy.capture.retake}>
          <Text variant="label" tone="inkSoft">
            {copy.capture.retake}
          </Text>
        </Touch>
      </View>
    </>
  );
}

/**
 * The hero is one line, always.
 *
 * A range is twice as many glyphs as a point value, so the type size steps
 * down to keep it on one line at the card's width rather than letting the unit
 * fall off the edge. `adjustsFontSizeToFit` stays on underneath as the
 * backstop for very large system text sizes.
 */
function heroScale(value: string) {
  if (value.length <= 5) return null;
  if (value.length <= 7) return styles.hero58;
  if (value.length <= 9) return styles.hero50;
  return styles.hero42;
}

/* ------------------------------------------------------ arriving later */

/**
 * Items whose water figure is still on its way.
 *
 * Drop says what is coming and offers the next move. There is no number and
 * no confirm — nothing without a figure has anything to add to a history.
 */
function ArrivingLater({ estimate, open, onRetake, onSearch }: ResultCardProps) {
  const { colors } = useTheme();
  const lineRef = useRef<View>(null);

  useEffect(() => {
    if (!open) return;
    const handle = findNodeHandle(lineRef.current);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [open]);

  return (
    <>
      <Text variant="title" tone="ink">
        {estimate.display_name}
      </Text>

      <View ref={lineRef} accessible accessibilityRole="text">
        <Text variant="body" tone="inkSoft">
          {unsupportedLine(estimate)}
        </Text>
      </View>

      <Touch
        onPress={onSearch}
        style={[
          styles.confirm,
          { backgroundColor: colors.accentSoft, borderColor: colors.accent },
        ]}
        accessibilityLabel={copy.unsupported.action}
      >
        <Text variant="label" tone="accent">
          {copy.unsupported.action}
        </Text>
      </Touch>

      <Touch onPress={onRetake} style={styles.tail} accessibilityLabel={copy.unsupported.keep}>
        <Text variant="label" tone="inkSoft">
          {copy.unsupported.keep}
        </Text>
      </Touch>
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  heroValue: { flexShrink: 1, fontVariant: ['tabular-nums'] },
  hero58: { fontSize: 58, lineHeight: 66 },
  hero50: { fontSize: 50, lineHeight: 58 },
  hero42: { fontSize: 42, lineHeight: 50 },
  heroUnit: { paddingBottom: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  rangeChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 999,
    minHeight: 34,
    justifyContent: 'center',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: space.lg,
  },
  amountValue: { fontVariant: ['tabular-nums'] },
  detailToggle: { minHeight: 48, justifyContent: 'center' },
  confirm: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spent: { opacity: 0.45 },
  intact: { opacity: 1 },
  tailRow: { flexDirection: 'row', gap: space.md },
  tail: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
