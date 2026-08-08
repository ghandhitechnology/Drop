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
 * A sheet leaves sideways, and the direction is the decision: left throws it
 * back into the print it was found in, right sends it to the tray by the
 * History door to wait for the save. Its travel is the exit values the stack
 * hook holds; this component only reads them.
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
  SWIPE_SAG,
  SWIPE_TRAVEL,
  type StackOrder,
} from './useStackOrder';

const CARD_PADDING = 20;
const SAVE_FRAME_SEED = seedFromString('result/save-the-plate');

/** How much of the thrown lean a sheet shows while it is still under the thumb. */
const TILT_UNDER_THUMB = 0.35;

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
  /** How many kept cards carry a figure — pile and tray both. The count the Save wears. */
  savableCount: number;
  /** How many cards are waiting in the tray, unwritten. */
  queuedCount: number;
  /** Centre of the front card's rectangle, in stage coordinates. */
  cardCenter: { x: number; y: number };
  /** Where a swiped-away sheet flies home, in stage coordinates. */
  printCenter: { x: number; y: number };
  /** Where a swiped-across sheet lands to wait, in stage coordinates. */
  trayCenter: { x: number; y: number };
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
  queuedCount,
  cardCenter,
  printCenter,
  trayCenter,
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
    swipeX,
    exit,
    exitDirection,
    swipeGesture,
    tiltOf,
    peekStep,
    onPeekLayout,
    bringToFront,
    dismissFront,
    queueFront,
  } = stack;

  const frontItem = front >= 0 ? items[front] : null;
  const frontDepth = depthOf(Math.max(0, front));
  const frontTilt = front >= 0 ? tiltOf(front) : 0;

  /**
   * The front sheet's ink: dragged by the thumb, faded while its sheet is still
   * arriving from the pile, and carried to whichever destination the swipe
   * chose. The pile's shared entry and exit — expansion, dissolve — belong to
   * the container the stage wraps this in.
   *
   * The two destinations are one expression rather than a branch, so a sheet
   * caught mid-flight is a real position either way.
   */
  const frontStyle = useAnimatedStyle(() => {
    const away = exit.value;
    // Under the thumb the lean follows the drag; once the sheet has been let
    // go it follows the exit, which is the direction the drag committed to.
    const heading = away > 0 ? exitDirection.value : Math.sign(swipeX.value) || 1;
    const toward = heading > 0 ? trayCenter : printCenter;
    // Held, the sheet sags a little as it is dragged aside — paper, not a tile.
    const sag = SWIPE_SAG * Math.min(1, Math.abs(swipeX.value) / SWIPE_TRAVEL);
    const held = swipeX.value;
    return {
      opacity: contentOpacity(Math.max(0, frontDepth.value)) * exitOpacity(away),
      transform: [
        { translateX: held + (toward.x - cardCenter.x - held) * away },
        { translateY: sag + (toward.y - cardCenter.y - sag) * away },
        { scale: exitScale(away) },
        {
          rotate: `${exitTilt(
            Math.max(away, lift.value * TILT_UNDER_THUMB),
            frontTilt,
            heading,
          )}deg`,
        },
      ],
    };
  });

  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      const action = event.nativeEvent.actionName;
      if (action === 'dismiss') dismissFront();
      if (action === 'activate') queueFront();
    },
    [dismissFront, queueFront],
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

      <GestureDetector gesture={swipeGesture}>
        <Animated.View
          style={[styles.cardZone, { maxHeight }, frontStyle]}
          onLayout={(event) => onCardHeight(event.nativeEvent.layout.height)}
          // Both swipes, by name. Without these the two directions exist only
          // as a gesture, and the pile becomes unsortable with a screen reader.
          accessibilityActions={[
            { name: 'activate', label: copy.result.queue },
            { name: 'dismiss', label: copy.result.dismiss },
          ]}
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
            savableCount={savableCount}
            queuedCount={queuedCount}
            // Every card still on the pile means no card has been sorted yet,
            // whichever way it would have gone.
            untouched={keptCount === items.length && !confirmed}
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
 * setting a sheet aside is legible in the button itself. The count spans the
 * tray as well as the pile, because that is what the button writes. A pile
 * holding only arriving-later cards has nothing to add up, and offers only the
 * way out.
 *
 * The way out says what it costs. Nothing swiped across has been written yet,
 * so closing with a full tray throws that work away — the button admits it
 * rather than leaving the tray to imply otherwise.
 */
function StackFooter({
  savableCount,
  queuedCount,
  untouched,
  confirmed,
  onSave,
  onClose,
}: {
  savableCount: number;
  queuedCount: number;
  untouched: boolean;
  confirmed: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const closeLabel =
    queuedCount > 0 ? copy.result.closeWithQueue(queuedCount) : copy.result.close;

  return (
    <>
      {/*
        Said once, and only until the first card has been sorted. Two
        directions on a card is not a thing a thumb guesses, and a line that
        disappears the moment it has been understood costs nothing after that.
      */}
      {untouched && (
        <Text variant="chip" tone="inkSoft" style={styles.hint}>
          {copy.result.sortHint}
        </Text>
      )}

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

      <Touch onPress={onClose} style={styles.tail} accessibilityLabel={closeLabel}>
        <Text variant="label" tone="inkSoft">
          {closeLabel}
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
  hint: { textAlign: 'center' },
  spent: { opacity: 0.45 },
  intact: { opacity: 1 },
  tail: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
