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
 *
 * A card in a plate stack shows the reading and stops there. Everything it
 * could otherwise offer belongs to the pile instead: one Save for all the
 * sheets, one modal boundary around them, one way out. So the stacked variant
 * keeps number, item, confidence and notes, and hands the rest upward.
 */

import { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View, findNodeHandle } from 'react-native';

import { useTheme } from '../../design/theme';
import { radius, space } from '../../design/tokens';
import {
  copy,
  formatQuantity,
  formatRange,
  hasSpread,
  heroFigure,
  litresSentence,
  unsupportedLine,
} from '../../lib/copy';
import { SketchButton } from '../../ui/SketchButton';
import { SketchLink } from '../../ui/SketchLink';
import { Text } from '../../ui/Text';
import type { Estimate } from '../capture/types';
import { CandidateChips } from '../search/CandidateChips';
import { ConfidenceChip } from './ConfidenceChip';
import { DetailSection, HeadlineNotes } from './DetailSection';
import { QuantityStepper } from './QuantityStepper';

/** What the reading needs, whichever variant draws it. */
type ResultCardCommon = {
  estimate: Estimate;
  /** True once the expansion has committed and the card is readable. */
  open: boolean;
  /**
   * True when this card is the one being read. A lone card always is; a sheet
   * in a stack becomes it by arriving on top, which is when its hero takes
   * screen-reader focus — not when it was quietly mounted underneath.
   */
  isFront?: boolean;
};

/** One photo, one item, everything you can do about it. */
export type ResultCardFullProps = ResultCardCommon & {
  variant?: 'full';
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

/** One sheet of a plate: the reading alone, with the pile holding the rest. */
export type ResultCardStackedProps = ResultCardCommon & {
  variant: 'stacked';
};

export type ResultCardProps = ResultCardFullProps | ResultCardStackedProps;

export function ResultCard(props: ResultCardProps) {
  const { estimate, open, isFront = true } = props;
  const stacked = props.variant === 'stacked';
  const hero = heroFigure(estimate);

  // A sheet never claims the modal boundary — the pile is the thing standing in
  // front of the app, and a card that took it would shut the screen reader out
  // of every sheet behind it. Buried sheets step out of the reading order too:
  // the pile speaks for them through their peek strips.
  return (
    <View
      style={styles.card}
      accessibilityViewIsModal={stacked ? undefined : open}
      importantForAccessibility={
        open && (isFront || !stacked) ? 'yes' : 'no-hide-descendants'
      }
    >
      {hero ? <Figured {...props} /> : <ArrivingLater {...props} />}
    </View>
  );
}

/* --------------------------------------------------------- with a figure */

function Figured(props: ResultCardProps) {
  const { estimate, open, isFront = true } = props;
  const { colors } = useTheme();
  const hero = heroFigure(estimate);
  const headline = estimate.headline;
  const heroRef = useRef<View>(null);

  // The number is the answer, so it is what a screen reader lands on — again
  // each time a new sheet is brought to the front of a stack.
  useEffect(() => {
    if (!open || !isFront) return;
    const handle = findNodeHandle(heroRef.current);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [open, isFront]);

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
        match was clear, which is most captures — and nothing in a stack, where
        the shortlist belongs to the photo rather than to any one sheet.
      */}
      {props.variant === 'stacked' ? null : <CandidateChips />}

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

      {props.variant === 'stacked' ? null : <Controls {...props} />}
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

/* ---------------------------------------------------------- what you can do */

/**
 * Everything the card offers beyond the reading: change the amount, look
 * behind the number, keep it, or leave.
 *
 * A sheet in a stack draws none of it. The pile keeps one Save for all its
 * items and one way out, so an individual sheet is only ever something to
 * read and to swipe away.
 */
function Controls({
  estimate,
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
}: ResultCardFullProps) {
  return (
    <>
      {adjusting ? (
        <QuantityStepper
          base={base}
          unit={estimate.quantity.unit}
          basis={basis}
          value={estimate.quantity.value}
          onChange={onQuantity}
        />
      ) : (
        <SketchButton
          onPress={onAdjust}
          seed="result/amount-row"
          tone="quiet"
          radius={radius.md}
          scale={0.66}
          style={styles.amountRow}
          contentStyle={styles.amountContent}
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
        </SketchButton>
      )}

      <SketchLink
        onPress={onToggleDetail}
        seed={detailOpen ? 'result/collapse' : 'result/expand'}
        style={styles.detailToggle}
        accessibilityLabel={detailOpen ? copy.result.collapse : copy.result.expand}
        accessibilityState={{ expanded: detailOpen }}
      >
        {detailOpen ? copy.result.collapse : copy.result.expand}
      </SketchLink>

      {detailOpen && <DetailSection estimate={estimate} />}

      <SketchButton
        onPress={onConfirm}
        disabled={confirmed}
        seed="result/add-to-history"
        filled
        radius={radius.lg}
        scale={0.94}
        style={[styles.confirm, confirmed ? styles.spent : styles.intact]}
        contentStyle={styles.confirmContent}
        accessibilityLabel={copy.result.confirm}
        accessibilityHint={copy.result.confirmHint}
        accessibilityState={{ disabled: confirmed }}
      >
        <Text variant="note" tone="accent">
          {copy.result.confirm}
        </Text>
      </SketchButton>

      <SketchLink
        onPress={onClose}
        seed="result/close"
        tone="inkSoft"
        style={styles.tail}
        accessibilityLabel={copy.result.close}
      >
        {copy.result.close}
      </SketchLink>
    </>
  );
}

/* ------------------------------------------------------ arriving later */

/**
 * Items whose water figure is still on its way.
 *
 * Drop says what is coming and offers the next move. There is no number and
 * no confirm — nothing without a figure has anything to add to a history.
 *
 * On a plate, the next move belongs to the plate: the sheet says its name and
 * what is coming, and the other items are still there to be read.
 */
function ArrivingLater(props: ResultCardProps) {
  const { estimate, open, isFront = true } = props;
  const lineRef = useRef<View>(null);

  useEffect(() => {
    if (!open || !isFront) return;
    const handle = findNodeHandle(lineRef.current);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [open, isFront]);

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

      {props.variant === 'stacked' ? null : (
        <>
          <SketchButton
            onPress={props.onSearch}
            seed="result/unsupported/search"
            filled
            radius={radius.lg}
            style={styles.confirm}
            contentStyle={styles.confirmContent}
            accessibilityLabel={copy.unsupported.action}
          >
            <Text variant="label" tone="accent">
              {copy.unsupported.action}
            </Text>
          </SketchButton>

          <SketchLink
            onPress={props.onRetake}
            seed="result/unsupported/keep"
            tone="inkSoft"
            style={styles.tail}
            accessibilityLabel={copy.unsupported.keep}
          >
            {copy.unsupported.keep}
          </SketchLink>
        </>
      )}
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
  amountRow: { minHeight: 54 },
  amountContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    minHeight: 54,
    paddingHorizontal: space.lg,
  },
  amountValue: { fontVariant: ['tabular-nums'] },
  detailToggle: { minHeight: 48 },
  confirm: { minHeight: 58, alignSelf: 'stretch' },
  confirmContent: { minHeight: 58 },
  spent: { opacity: 0.45 },
  intact: { opacity: 1 },
  tail: { minHeight: 48, alignItems: 'center' },
});
