/**
 * The pile, assembled.
 *
 * Two zones stand in one column: the strip zone, where the buried sheets peek,
 * and the card zone, where the front sheet is read. The sheets' paper is not
 * drawn here — `PileEdges` paints it under the morph's frame — so what this
 * component owns is everything a finger or a screen reader touches: the peek
 * strips, the front card's ink, the lift gesture, and the pile's one Save.
 *
 * Promotion is a cross-fade of ink. The paper never swaps: when a strip is
 * tapped, `PileEdges` walks that sheet's paper down into the card rectangle
 * while the new front's words fade in exactly where the old ones stood.
 *
 * The dismissed sheet flies back into the print it was found in. Its travel is
 * the exit values the stack hook holds; this component only reads them.
 */

import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '../../design/theme';
import { radius, space } from '../../design/tokens';
import { HandFrame } from '../../drawing/HandFrame';
import { seedFromString } from '../../drawing/seededRandom';
import { copy } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';
import type { PlateItem } from '../capture/types';
import { ResultCard } from './ResultCard';
import { StackPeek } from './StackPeek';
import {
  contentOpacity,
  exitOpacity,
  exitScale,
  exitTilt,
  MAX_PEEKS,
  type StackOrder,
} from './useStackOrder';

const CARD_PADDING = 20;
const SAVE_FRAME_SEED = seedFromString('result/save-the-plate');

export type ResultStackProps = {
  /** Every card of the plate, in photo order. Kept and gone alike. */
  items: PlateItem[];
  /** The arrangement, owned by the stage so the pile's paper can share it. */
  stack: StackOrder;
  /** The stage's expansion; the strips arrive as the pile fans out of it. */
  expansion: SharedValue<number>;
  open: boolean;
  /** True once the plate has been saved and the stage is celebrating. */
  confirmed: boolean;
  /** How many kept cards carry a figure — the count the Save wears. */
  savableCount: number;
  /** Centre of the front card's rectangle, in stage coordinates. */
  cardCenter: { x: number; y: number };
  /** Where a dismissed sheet flies home, in stage coordinates. */
  printCenter: { x: number; y: number };
  /** Height of the strip zone above the card. */
  zoneHeight: number;
  maxHeight: number;
  onCardHeight: (height: number) => void;
  onSave: () => void;
  onClose: () => void;
};

export function ResultStack({
  items,
  stack,
  expansion,
  open,
  confirmed,
  savableCount,
  cardCenter,
  printCenter,
  zoneHeight,
  maxHeight,
  onCardHeight,
  onSave,
  onClose,
}: ResultStackProps) {
  const {
    order,
    front,
    keptCount,
    depthOf,
    lift,
    liftY,
    exit,
    liftGesture,
    tiltOf,
    peekStep,
    onPeekLayout,
    bringToFront,
    dismissFront,
  } = stack;

  const frontItem = front >= 0 ? items[front] : null;
  const frontDepth = depthOf(Math.max(0, front));
  const frontTilt = front >= 0 ? tiltOf(front) : 0;

  /**
   * The front sheet's ink: lifted by the thumb, faded while its sheet is still
   * arriving from the pile, and carried into the print when it is thrown.
   * The pile's shared entry and exit — expansion, dissolve — belong to the
   * container the stage wraps this in.
   */
  const frontStyle = useAnimatedStyle(() => {
    const away = exit.value;
    return {
      opacity: contentOpacity(Math.max(0, frontDepth.value)) * exitOpacity(away),
      transform: [
        { translateX: (printCenter.x - cardCenter.x) * away },
        { translateY: liftY.value + (printCenter.y - cardCenter.y) * away },
        { scale: exitScale(away) },
        { rotate: `${exitTilt(away, frontTilt)}deg` },
      ],
    };
  });

  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      if (event.nativeEvent.actionName === 'dismiss') dismissFront();
    },
    [dismissFront],
  );

  if (!frontItem) return null;

  return (
    <View accessibilityViewIsModal={open} pointerEvents="box-none">
      {/*
        Only the drawn strips are mounted. A sheet past the cap has paper in
        the pile but no strip — an invisible button parked on top of the
        deepest visible one would take its taps.
      */}
      <View style={{ height: zoneHeight }} pointerEvents="box-none">
        {order.slice(1, MAX_PEEKS + 1).map((index, at) => {
          const item = items[index];
          if (!item) return null;
          return (
            <StackPeek
              key={`${index}:${item.estimate.catalog_id}`}
              estimate={item.estimate}
              depth={depthOf(index)}
              lift={lift}
              expansion={expansion}
              peekStep={peekStep}
              zoneHeight={zoneHeight}
              onBring={() => bringToFront(index)}
              onMeasure={at === 0 ? onPeekLayout : undefined}
            />
          );
        })}
      </View>

      <GestureDetector gesture={liftGesture}>
        <Animated.View
          style={[styles.cardZone, { maxHeight }, frontStyle]}
          onLayout={(event) => onCardHeight(event.nativeEvent.layout.height)}
          accessibilityActions={[{ name: 'dismiss', label: copy.result.dismiss }]}
          onAccessibilityAction={handleAccessibilityAction}
        >
          <ResultCard
            key={front}
            variant="stacked"
            estimate={frontItem.estimate}
            open={open}
            isFront
          />
          <StackFooter
            keptCount={keptCount}
            savableCount={savableCount}
            confirmed={confirmed}
            onSave={onSave}
            onClose={onClose}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/* ------------------------------------------------------------- the save */

/**
 * One Save for the whole pile, standing where the single card's confirm
 * stands — same drawn frame, same wash — with the count as its words, so
 * setting a sheet aside is legible in the button itself. A pile holding only
 * arriving-later cards has nothing to add up, and offers only the way out.
 */
function StackFooter({
  keptCount,
  savableCount,
  confirmed,
  onSave,
  onClose,
}: {
  keptCount: number;
  savableCount: number;
  confirmed: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();

  return (
    <>
      {savableCount > 0 && (
        <Touch
          onPress={onSave}
          disabled={confirmed}
          style={[styles.save, confirmed ? styles.spent : styles.intact]}
          accessibilityLabel={
            savableCount === 1 ? copy.result.confirm : copy.result.confirmMany(savableCount)
          }
          accessibilityHint={copy.result.confirmHint}
          accessibilityState={{ disabled: confirmed }}
        >
          <HandFrame
            seed={SAVE_FRAME_SEED}
            variant="crayon"
            color={colors.accent}
            radius={radius.lg}
            strokeScale={0.9}
            style={styles.saveFrame}
            contentStyle={styles.saveContent}
          >
            <View
              pointerEvents="none"
              style={[styles.saveWash, { backgroundColor: colors.accentSoft }]}
            />
            <Text variant="note" tone="accent">
              {savableCount === 1
                ? copy.result.confirm
                : copy.result.confirmMany(savableCount)}
            </Text>
          </HandFrame>
        </Touch>
      )}

      <Touch onPress={onClose} style={styles.tail} accessibilityLabel={copy.result.close}>
        <Text variant="label" tone="inkSoft">
          {copy.result.close}
        </Text>
      </Touch>
    </>
  );
}

const styles = StyleSheet.create({
  cardZone: { padding: CARD_PADDING, gap: space.md },
  save: { minHeight: 56, alignSelf: 'stretch' },
  saveFrame: { minHeight: 56 },
  saveContent: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveWash: {
    position: 'absolute',
    top: 7,
    left: 7,
    right: 7,
    bottom: 7,
    borderRadius: radius.md,
  },
  spent: { opacity: 0.45 },
  intact: { opacity: 1 },
  tail: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
