/**
 * The signature moment, in five beats.
 *
 *   1. The frame freezes and Drop draws itself in at the anchor — the spot the
 *      photo was actually pointed at.
 *   2. Drop thinks. The item's name fades in the instant recognition lands.
 *   3. Drop pops, says what it found in one line, and a chevron offers the pull.
 *   4. The pull. Nine rays leave Drop for the card's edge and erase themselves
 *      behind; Drop's silhouette morphs into the card's frame; Drop shrinks and
 *      docks at the corner of the thing it became.
 *   5. Confirm. A tick draws on, the haptic lands, Drop celebrates, and the
 *      card travels back to the anchor and dissolves — leaving the way back
 *      offered for five seconds.
 *
 * One shared value drives beat four end to end, so a thumb can hold the whole
 * transformation anywhere between shut and open. Everything Skia draws here is
 * decoration: every number and word on this screen is a real Text somewhere in
 * the tree beside it.
 */

import { Canvas } from '@shopify/react-native-skia';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DropCharacter, type CharacterState } from '../../avatar';
import { spring } from '../../design/motion';
import { useTheme } from '../../design/theme';
import { radius as radii, space } from '../../design/tokens';
import { useMotion } from '../../design/useMotion';
import { seedFromString } from '../../drawing/seededRandom';
import { insertConfirmed, softDelete } from '../../data/entries';
import { copy, formatQuantity } from '../../lib/copy';
import { tapConfirmed, tapRemoving, tapSelection } from '../../lib/haptics';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';
import type { Estimate, Rect } from '../capture/types';
import { useCaptureMachine } from '../capture/useCaptureMachine';
import { ExpansionRays } from './ExpansionRays';
import { localEstimate, servingOf, toEngineEstimate } from './localPipeline';
import { ConfirmMark, PullChevron } from './Marks';
import { MorphShape } from './MorphShape';
import { ResultCard } from './ResultCard';
import { buildRays, type Box } from './silhouette';
import { UndoSnackbar } from './UndoSnackbar';
import { beat, useExpansion } from './useExpansion';

export type ResultStageProps = {
  /** The camera stage, in its own coordinates — the same space as the anchor. */
  stage: { width: number; height: number };
};

/* ----------------------------------------------------------- proportions */

const CARD_MARGIN = space.lg;
const CARD_PADDING = 20;
const CARD_RADIUS = radii.lg;
/** Share of the stage the card may claim before its detail starts scrolling. */
const CARD_MAX_SHARE = 0.74;
/** Drop, docked at the card's corner. */
const DOCK_SIZE = 40;
/** Drop, standing at the anchor. Bounded so a huge barcode keeps it sane. */
const HERO_MIN = 108;
const HERO_MAX = 176;
/**
 * The cut-out sits just inside the avatar box. The pose art already leaves a
 * margin for the orbiting marks, so this comfortably contains the character
 * without drawing a shape noticeably bigger than Drop itself.
 */
const SILHOUETTE_INSET = 0.02;
/** Height of the teaser pill, for stacking the chevron under it. */
const TEASER_HEIGHT = 38;

const BEAT_STATES = new Set([
  'captured',
  'recognizing',
  'analyzing',
  'presenting',
  'expanded',
  'adjusting',
  'confirmed',
]);

const OPEN_STATES = new Set(['expanded', 'adjusting', 'confirmed']);

function characterFor(name: string, estimate: Estimate | null): CharacterState {
  switch (name) {
    case 'captured':
    case 'recognizing':
      return 'thinking';
    case 'analyzing':
      return 'analyzing';
    case 'confirmed':
      return 'celebrating';
    default:
      return estimate && estimate.headline ? 'presenting' : 'unresolved';
  }
}

/* ------------------------------------------------------------ the stage */

export function ResultStage({ stage }: ResultStageProps) {
  const { colors } = useTheme();
  const motion = useMotion();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const state = useCaptureMachine((s) => s.state);
  const expand = useCaptureMachine((s) => s.expand);
  const collapse = useCaptureMachine((s) => s.collapse);
  const adjust = useCaptureMachine((s) => s.adjust);
  const reviseEstimate = useCaptureMachine((s) => s.reviseEstimate);
  const confirmEntry = useCaptureMachine((s) => s.confirm);
  const retake = useCaptureMachine((s) => s.retake);

  const estimate = 'estimate' in state ? state.estimate : null;
  const item = state.name === 'analyzing' ? state.item : null;
  const anchor: Rect | null = 'anchor' in state ? state.anchor : null;
  const photoUri = 'photoUri' in state ? state.photoUri : null;
  const live = BEAT_STATES.has(state.name);

  const [detailOpen, setDetailOpen] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);
  const [receding, setReceding] = useState(false);
  const [snack, setSnack] = useState<{ id: string; label: string } | null>(null);

  /* --------------------------------------------------------- geometry */

  const heroSize = useMemo(() => {
    if (!anchor) return HERO_MIN;
    const side = Math.min(anchor.width, anchor.height) * 0.92;
    return Math.max(HERO_MIN, Math.min(HERO_MAX, side));
  }, [anchor]);

  const anchorCenter = useMemo(
    () =>
      anchor
        ? { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 }
        : { x: stage.width / 2, y: stage.height / 2 },
    [anchor, stage.width, stage.height],
  );

  const cardBox = useMemo<Box>(() => {
    const width = Math.max(0, stage.width - CARD_MARGIN * 2);
    const height = cardHeight || Math.min(stage.height * 0.4, 320);
    return {
      x: CARD_MARGIN,
      y: stage.height - insets.bottom - CARD_MARGIN - height,
      width,
      height,
    };
  }, [stage.width, stage.height, insets.bottom, cardHeight]);

  /** Where Drop stands: the box its paper cut-out is drawn into. */
  const silhouetteBox = useMemo<Box>(() => {
    const inset = heroSize * SILHOUETTE_INSET;
    return {
      x: anchorCenter.x - heroSize / 2 + inset,
      y: anchorCenter.y - heroSize / 2 + inset,
      width: heroSize - inset * 2,
      height: heroSize - inset * 2,
    };
  }, [anchorCenter, heroSize]);

  const dockCenter = useMemo(
    () => ({ x: cardBox.x + 26, y: cardBox.y }),
    [cardBox.x, cardBox.y],
  );

  /** The teaser stacks under Drop, and the chevron under the teaser. */
  const teaserTop = anchorCenter.y + heroSize / 2 + space.sm;
  const chevronY = teaserTop + TEASER_HEIGHT + space.xl;

  const seed = useMemo(
    () => seedFromString(`result/${estimate?.catalog_id ?? photoUri ?? 'drop'}`),
    [estimate?.catalog_id, photoUri],
  );

  const rays = useMemo(
    () => buildRays(anchorCenter, cardBox, seed),
    [anchorCenter, cardBox, seed],
  );

  const tickBox = useMemo<Box>(() => {
    const side = Math.min(cardBox.width, cardBox.height) * 0.46;
    return {
      x: cardBox.x + (cardBox.width - side) / 2,
      y: cardBox.y + (cardBox.height - side) / 2,
      width: side,
      height: side,
    };
  }, [cardBox]);

  /* ------------------------------------------------------- the values */

  const arrival = useSharedValue(0);
  const pop = useSharedValue(1);
  const dissolve = useSharedValue(0);
  const tick = useSharedValue(0);

  /**
   * An item whose figure arrives later has nothing to hide, so it opens itself.
   * The morph still runs — that is the card being made — but the rays stay
   * home, because they are a celebration of a number and there is none here.
   */
  const unsupported = Boolean(estimate && !estimate.headline);
  const fanfare = Boolean(estimate?.headline) && !motion.reduceMotion;
  const open = (OPEN_STATES.has(state.name) || unsupported) && !receding;

  const handleOpen = useCallback(() => expand(), [expand]);
  const handleClose = useCallback(() => collapse(), [collapse]);

  const { expansion, gesture } = useExpansion({
    open,
    enabled: state.name === 'presenting' || state.name === 'expanded' || state.name === 'adjusting',
    onOpen: handleOpen,
    onClose: handleClose,
    reduceMotion: motion.reduceMotion,
  });

  /* ----------------------------------------------- beat 1: Drop arrives */

  useEffect(() => {
    if (!live) {
      // A fresh frame starts from nothing — including the recede flag, which a
      // run cut short between the tick and the card's trip home would otherwise
      // leave set, holding every later result shut.
      arrival.value = 0;
      dissolve.value = 0;
      tick.value = 0;
      setReceding(false);
      setDetailOpen(false);
      return;
    }
    arrival.value = withTiming(1, {
      duration: motion.reduceMotion ? 0 : beat.arrival,
    });
  }, [live, motion.reduceMotion, arrival, dissolve, tick]);

  /* ------------------------------------ beat 2: the name lands, felt */

  useEffect(() => {
    if (state.name !== 'analyzing') return;
    tapSelection();
  }, [state.name]);

  /* --------------------------------------------- beat 3: Drop presents */

  useEffect(() => {
    if (state.name !== 'presenting') return;
    setDetailOpen(false);
    if (motion.reduceMotion) return;
    pop.value = withSequence(
      withTiming(1.14, { duration: 110 }),
      withSpring(1, spring.drop),
    );
  }, [state.name, motion.reduceMotion, pop]);

  /* --------------------------------------------- beat 5: the way in */

  const busy = useRef(false);

  const handleConfirm = useCallback(async () => {
    if (busy.current || !estimate || !estimate.headline) return;
    busy.current = true;
    try {
      const entry = await insertConfirmed(toEngineEstimate(estimate), {
        inputMethod: photoUri ? 'camera' : 'search',
        photoUri,
      });
      tapConfirmed();
      confirmEntry(entry.id);
      AccessibilityInfo.announceForAccessibility(
        copy.result.announce.confirmed(estimate.display_name),
      );
    } finally {
      busy.current = false;
    }
  }, [estimate, photoUri, confirmEntry]);

  // The tick, the hold, then the card travelling home.
  useEffect(() => {
    if (state.name !== 'confirmed') return;

    const label = state.estimate.display_name;
    const id = state.entryId;

    tick.value = withTiming(1, { duration: motion.reduceMotion ? 0 : beat.tick });

    const hold = setTimeout(
      () => {
        setReceding(true);
        dissolve.value = withTiming(1, {
          duration: motion.reduceMotion ? 0 : beat.recede,
        });
      },
      motion.reduceMotion ? 0 : beat.hold,
    );

    const home = setTimeout(
      () => {
        setSnack({ id, label });
        setReceding(false);
        setDetailOpen(false);
        retake();
      },
      (motion.reduceMotion ? 0 : beat.hold) + (motion.reduceMotion ? 0 : beat.recede) + 40,
    );

    return () => {
      clearTimeout(hold);
      clearTimeout(home);
    };
  }, [state, motion.reduceMotion, tick, dissolve, retake]);

  /* ------------------------------------------------------- the way back */

  useEffect(() => {
    if (!snack) return;
    const timer = setTimeout(() => setSnack(null), beat.undo);
    return () => clearTimeout(timer);
  }, [snack]);

  const handleUndo = useCallback(async () => {
    if (!snack) return;
    setSnack(null);
    await softDelete(snack.id);
    tapRemoving();
    AccessibilityInfo.announceForAccessibility(copy.result.announce.undone);
  }, [snack]);

  /* -------------------------------------------------------- the amount */

  const serving = useMemo(
    () => (estimate ? servingOf(estimate.catalog_id) : null),
    [estimate?.catalog_id],
  );

  const handleQuantity = useCallback(
    (value: number) => {
      if (!estimate) return;
      const next = localEstimate({
        catalogId: estimate.catalog_id,
        quantity: value,
        userEntered: true,
      });
      if (next) reviseEstimate(next);
    },
    [estimate, reviseEstimate],
  );

  const openSearch = useCallback(() => router.push('/search'), [router]);

  const handleRetake = useCallback(() => {
    setDetailOpen(false);
    retake();
  }, [retake]);

  /* --------------------------------------------------------- the looks */

  const avatarStyle = useAnimatedStyle(() => {
    const t = expansion.value;
    const cx = anchorCenter.x + (dockCenter.x - anchorCenter.x) * t;
    const cy = anchorCenter.y + (dockCenter.y - anchorCenter.y) * t;
    const docked = DOCK_SIZE / heroSize;
    const scale = (1 - t + t * docked) * (0.7 + 0.3 * arrival.value) * pop.value;
    return {
      opacity: arrival.value * (1 - dissolve.value),
      transform: [
        { translateX: cx - heroSize / 2 },
        { translateY: cy - heroSize / 2 },
        { scale },
      ],
    };
  });

  const teaserStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(expansion.value, [0, 0.24], [1, 0], Extrapolation.CLAMP) *
      arrival.value *
      (1 - dissolve.value),
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(expansion.value, [0.55, 0.85], [0, 1], Extrapolation.CLAMP) *
      (1 - dissolve.value),
    transform: [
      { translateY: interpolate(expansion.value, [0.55, 1], [14, 0], Extrapolation.CLAMP) },
    ],
  }));

  const shapeStyle = useAnimatedStyle(() => ({ opacity: 1 - dissolve.value }));

  /* ---------------------------------------------------------- the tree */

  const character = characterFor(state.name, estimate);
  const teaser = estimate
    ? copy.result.teaser(
        estimate.display_name,
        formatQuantity(estimate.quantity.value, estimate.quantity.unit),
      )
    : item?.display_name ?? null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      {live && (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, shapeStyle]} pointerEvents="none">
            <Canvas
              style={StyleSheet.absoluteFill}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <MorphShape
                expansion={expansion}
                from={silhouetteBox}
                to={cardBox}
                radius={CARD_RADIUS}
                color={colors.ink}
                paper={colors.paper}
                seed={seed}
                reduceMotion={motion.reduceMotion}
              />

              {/*
                The rays sit above the paper. They leave from inside Drop, so
                painting them under the cut-out would swallow the first third
                of every stroke — and they have erased themselves before the
                card's own words arrive.
              */}
              {fanfare && (
                <ExpansionRays
                  rays={rays}
                  expansion={expansion}
                  color={colors.accent}
                  seed={seed}
                />
              )}

              {estimate?.headline && (
                <PullChevron
                  cx={anchorCenter.x}
                  cy={chevronY}
                  width={28}
                  color={colors.accent}
                  seed={seed + 3}
                  expansion={expansion}
                  reduceMotion={motion.reduceMotion}
                />
              )}
            </Canvas>
          </Animated.View>

          {estimate && (
            <Animated.View
              style={[
                styles.card,
                {
                  left: CARD_MARGIN,
                  right: CARD_MARGIN,
                  bottom: insets.bottom + CARD_MARGIN,
                  maxHeight: stage.height * CARD_MAX_SHARE,
                },
                contentStyle,
              ]}
              pointerEvents={open ? 'auto' : 'none'}
              onLayout={(event) => {
                const { height } = event.nativeEvent.layout;
                setCardHeight((current) => (current === height ? current : height));
              }}
            >
              <ScrollView
                contentContainerStyle={styles.cardContent}
                showsVerticalScrollIndicator={false}
                scrollEnabled={open}
              >
                <ResultCard
                  estimate={estimate}
                  open={open}
                  adjusting={state.name === 'adjusting'}
                  confirmed={state.name === 'confirmed'}
                  detailOpen={detailOpen}
                  base={serving?.value ?? estimate.quantity.value}
                  basis={serving?.basis ?? null}
                  onToggleDetail={() => setDetailOpen((value) => !value)}
                  onAdjust={adjust}
                  onQuantity={handleQuantity}
                  onConfirm={handleConfirm}
                  onClose={handleClose}
                  onRetake={handleRetake}
                  onSearch={openSearch}
                />
              </ScrollView>
            </Animated.View>
          )}

          {state.name === 'confirmed' && (
            <Canvas
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <ConfirmMark box={tickBox} color={colors.positive} seed={seed} progress={tick} />
            </Canvas>
          )}

          <GestureDetector gesture={gesture}>
            <Animated.View
              style={[
                styles.avatar,
                { width: heroSize, height: heroSize },
                avatarStyle,
              ]}
            >
              <DropCharacter state={character} size={heroSize} seed={seed} announce />
            </Animated.View>
          </GestureDetector>

          {teaser && (
            <Animated.View
              style={[
                styles.teaser,
                { top: teaserTop },
                teaserStyle,
              ]}
              pointerEvents={open ? 'none' : 'box-none'}
            >
              <View style={[styles.teaserPill, { backgroundColor: colors.bg }]}>
                <Text variant="label" tone="ink" numberOfLines={1}>
                  {teaser}
                </Text>
              </View>

              {/*
                The chevron is drawn in the canvas above; this is the same
                affordance with words on it, so the pull is reachable by a
                screen reader and by a thumb that would rather tap.
              */}
              {estimate?.headline && (
                <Touch
                  onPress={handleOpen}
                  style={styles.pull}
                  accessibilityLabel={copy.result.pull}
                  accessibilityHint={copy.result.pullHint}
                  accessibilityState={{ expanded: false }}
                />
              )}
            </Animated.View>
          )}
        </>
      )}

      {snack && <UndoSnackbar label={snack.label} onUndo={handleUndo} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  card: { position: 'absolute' },
  cardContent: { padding: CARD_PADDING },
  avatar: { position: 'absolute', left: 0, top: 0 },
  teaser: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: space.xs },
  teaserPill: {
    maxWidth: '86%',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radii.pill,
  },
  pull: { minHeight: 48, minWidth: 96 },
});
