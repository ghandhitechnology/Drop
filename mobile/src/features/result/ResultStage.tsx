/**
 * The signature moment, in five beats.
 *
 *   1. The frame freezes. The reticle carries the square it was holding down to
 *      the spot the shutter had, where it settles as a small print, and Drop
 *      draws itself in underneath — standing exactly where the thumb just was.
 *   2. Drop thinks, and says so under the print. The item's name replaces the
 *      working line the instant recognition lands.
 *   3. Drop pops, says what it found in one line, and a chevron offers the pull.
 *   4. The pull. Nine rays leave Drop for the card's edge and erase themselves
 *      behind; Drop's silhouette morphs into the card's frame; Drop shrinks and
 *      docks at the corner of the thing it became, while the print rises into
 *      the room the open card leaves above itself.
 *   5. Confirm. A tick draws on, the haptic lands, Drop celebrates, and the
 *      saved card travels into History with the print alongside it. Closing
 *      without saving takes the same material back into the shutter instead.
 *
 * One shared value drives beat four end to end, so a thumb can hold the whole
 * transformation anywhere between shut and open. Everything Skia draws here is
 * decoration: every number and word on this screen is a real Text somewhere in
 * the tree beside it.
 */

import { Canvas } from '@shopify/react-native-skia';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
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
import { insertConfirmed, insertPlate, softDelete } from '../../data/entries';
import { copy, formatQuantity } from '../../lib/copy';
import { tapConfirmed, tapRemoving, tapSelection } from '../../lib/haptics';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';
import { estimatesOf, keptItemsOf, plateItemsOf, type Estimate, type Rect } from '../capture/types';
import { characterSideForAnchor } from '../capture/anchor';
import { captureLayout, PULL_ROW, TEASER_HEIGHT } from '../capture/layout';
import { Snapshot, snapshotTilt } from '../capture/Snapshot';
import { useCaptureMachine } from '../capture/useCaptureMachine';
import { ExpansionRays } from './ExpansionRays';
import { FindMarks } from './FindMarks';
import { localEstimate, servingOf, toEngineEstimate } from './localPipeline';
import { ConfirmMark, PullChevron } from './Marks';
import { MorphShape } from './MorphShape';
import { setResultNoticeVisible } from './notice';
import { PileEdges } from './PileEdges';
import { ResultCard } from './ResultCard';
import { ResultStack } from './ResultStack';
import { buildRays, type Box } from './silhouette';
import { UndoSnackbar } from './UndoSnackbar';
import { beat, useExpansion } from './useExpansion';
import { MAX_PEEKS, savableEstimates, useStackOrder } from './useStackOrder';

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
/**
 * The cut-out sits just inside the avatar box. The pose art already leaves a
 * margin for the orbiting marks, so this comfortably contains the character
 * without drawing a shape noticeably bigger than Drop itself.
 */
const SILHOUETTE_INSET = 0.02;
/** Approximate centre of the measured History chip at the top-right door. */
const HISTORY_CHIP_HALF_WIDTH = 54;
/** Keep the result legible for most of its trip, then tuck it away at the end. */
const EXIT_SCALE = 0.08;
/** Share of the window above the open card the print is allowed to fill. */
const PRINT_OPEN_FILL = 0.84;
/** Bounds on how far the print may grow or shrink to suit that window. */
const PRINT_OPEN_MIN = 0.62;
const PRINT_OPEN_MAX = 1.4;

const BEAT_STATES = new Set([
  'captured',
  'recognizing',
  'analyzing',
  'presenting',
  'expanded',
  'adjusting',
  'confirmed',
  'plating',
  'plateConfirmed',
]);

const OPEN_STATES = new Set(['expanded', 'adjusting', 'confirmed']);

/** States where the frozen frame can be dismissed by tapping its backdrop. */
const BACKDROP_DISMISS_STATES = new Set([
  'captured',
  'recognizing',
  'analyzing',
  'presenting',
  'plating',
]);

/**
 * What Drop says while it works.
 *
 * The wait has a voice as well as a face: the same line the shutter row used to
 * carry, now spoken from the spot the shutter itself has left. Recognition
 * replaces it with the item's own name the moment one lands.
 */
function workingLine(name: string): string | null {
  switch (name) {
    case 'captured':
    case 'recognizing':
      return copy.capture.recognizing;
    case 'analyzing':
      return copy.capture.analyzing;
    default:
      return null;
  }
}

function characterFor(name: string, figured: boolean): CharacterState {
  switch (name) {
    case 'captured':
    case 'recognizing':
      return 'thinking';
    case 'analyzing':
      return 'analyzing';
    case 'confirmed':
    case 'plateConfirmed':
      return 'celebrating';
    default:
      return figured ? 'presenting' : 'unresolved';
  }
}

/* ------------------------------------------------------------ the stage */

export function ResultStage({ stage }: ResultStageProps) {
  const { colors } = useTheme();
  const motion = useMotion();
  const { width: windowWidth } = useWindowDimensions();
  const captureFoldMs = motion.ms('draw');
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const state = useCaptureMachine((s) => s.state);
  const expand = useCaptureMachine((s) => s.expand);
  const collapse = useCaptureMachine((s) => s.collapse);
  const adjust = useCaptureMachine((s) => s.adjust);
  const reviseEstimate = useCaptureMachine((s) => s.reviseEstimate);
  const confirmEntry = useCaptureMachine((s) => s.confirm);
  const dismissCard = useCaptureMachine((s) => s.dismissCard);
  const confirmPlate = useCaptureMachine((s) => s.confirmPlate);
  const retake = useCaptureMachine((s) => s.retake);

  /*
   * A plate is the same stage wearing more cards. `estimate` stays exactly the
   * single path's derivation; the plate reads through the list selectors, and
   * `multi` is what every plate-only branch below gates on.
   */
  const multi = state.name === 'plating' || state.name === 'plateConfirmed';
  const plateItems = useMemo(() => plateItemsOf(state) ?? [], [state]);
  const estimates = useMemo(() => estimatesOf(state), [state]);
  const estimate = 'estimate' in state ? state.estimate : estimates[0] ?? null;
  const anyFigure = estimates.some((entry) => entry.headline !== null);
  const kept = useMemo(() => {
    if (state.name === 'plating') {
      return state.items
        .map((_, index) => index)
        .filter((index) => !state.dismissed.includes(index));
    }
    if (state.name === 'plateConfirmed') return [...state.kept];
    return [];
  }, [state]);
  const seeds = useMemo(
    () => plateItems.map((entry) => entry.estimate.catalog_id),
    [plateItems],
  );
  const plateBoxes = useMemo(
    () => plateItems.map((entry) => entry.box),
    [plateItems],
  );

  const item = state.name === 'analyzing' ? state.item : null;
  const anchor: Rect | null = 'anchor' in state ? state.anchor : null;
  const photoUri = 'photoUri' in state ? state.photoUri : null;
  const live = BEAT_STATES.has(state.name);

  const [detailOpen, setDetailOpen] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);
  const [receding, setReceding] = useState(false);
  const [snack, setSnack] = useState<{ id: string; label: string } | null>(null);
  /** A pile has no `expanded` machine state; whether it is open lives here. */
  const [plateOpen, setPlateOpen] = useState(false);

  /* --------------------------------------------------------- geometry */

  /** How big the thing that was pointed at asks the character to be. */
  const anchorHero = useMemo(
    () => characterSideForAnchor(anchor ?? { x: 0, y: 0, width: 0, height: 0 }),
    [anchor],
  );

  /**
   * Everything the held frame stands on: how big the character ends up, where
   * it lands, where its line goes, and the square the print settles into. The
   * viewfinder folds its reticle into that same square, which is the whole
   * trick of beat one.
   */
  const layout = useMemo(
    () =>
      captureLayout(
        { width: stage.width, height: stage.height },
        insets.bottom,
        anchorHero,
      ),
    [stage.width, stage.height, insets.bottom, anchorHero],
  );

  const heroSize = layout.hero;

  const slotCenter = useMemo(
    () => ({
      x: layout.slot.x + layout.slot.width / 2,
      y: layout.slot.y + layout.slot.height / 2,
    }),
    [layout.slot],
  );

  /** The square the shutter framed — where the print starts its trip down. */
  const framed = useMemo(
    () =>
      anchor
        ? {
            x: anchor.x + anchor.width / 2,
            y: anchor.y + anchor.height / 2,
            side: Math.max(anchor.width, anchor.height),
          }
        : { x: stage.width / 2, y: stage.height / 2, side: layout.slot.width },
    [anchor, stage.width, stage.height, layout.slot.width],
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
      x: layout.bubble.x - heroSize / 2 + inset,
      y: layout.bubble.y - heroSize / 2 + inset,
      width: heroSize - inset * 2,
      height: heroSize - inset * 2,
    };
  }, [layout.bubble.x, layout.bubble.y, heroSize]);

  const dockCenter = useMemo(
    () => ({ x: cardBox.x + 26, y: cardBox.y }),
    [cardBox.x, cardBox.y],
  );

  /** The lean the print settles at. Stable per photo, so it never re-shuffles. */
  const printTilt = useMemo(() => snapshotTilt(photoUri ?? 'drop'), [photoUri]);

  const seed = useMemo(
    () => seedFromString(`result/${estimate?.catalog_id ?? photoUri ?? 'drop'}`),
    [estimate?.catalog_id, photoUri],
  );

  const rays = useMemo(
    () => buildRays(layout.bubble, cardBox, seed),
    [layout.bubble, cardBox, seed],
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
  const captureFold = useSharedValue(0);
  const pop = useSharedValue(1);
  const dissolve = useSharedValue(0);
  const exitTargetX = useSharedValue(0);
  const exitTargetY = useSharedValue(0);
  const tick = useSharedValue(0);

  /**
   * An item whose figure arrives later has nothing to hide, so it opens itself.
   * The morph still runs — that is the card being made — but the rays stay
   * home, because they are a celebration of a number and there is none here.
   * A plate opens itself only when every card on it is such an item.
   */
  const unsupported = multi
    ? estimates.length > 0 && !anyFigure
    : Boolean(estimate && !estimate.headline);
  const fanfare = anyFigure && !motion.reduceMotion;
  const open = multi
    ? plateOpen || state.name === 'plateConfirmed' || unsupported
    : OPEN_STATES.has(state.name) || unsupported;

  const backdropDismissible =
    BACKDROP_DISMISS_STATES.has(state.name) && !(multi && open);

  const handleOpen = useCallback(
    () => (multi ? setPlateOpen(true) : expand()),
    [multi, expand],
  );
  const handleClose = useCallback(
    () => (multi ? setPlateOpen(false) : collapse()),
    [multi, collapse],
  );

  const { expansion, gesture } = useExpansion({
    open,
    enabled:
      !receding &&
      (state.name === 'presenting' ||
        state.name === 'expanded' ||
        state.name === 'adjusting' ||
        state.name === 'plating'),
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
      captureFold.value = 0;
      dissolve.value = 0;
      tick.value = 0;
      setReceding(false);
      setDetailOpen(false);
      setPlateOpen(false);
      return;
    }

    captureFold.value = 0;
    captureFold.value = withTiming(1, { duration: captureFoldMs });

    // Drop arrives into the last half of the fold, so the reticle visibly
    // becomes its paper ground instead of disappearing before the character
    // has a chance to inherit the space.
    arrival.value = 0;
    arrival.value = withDelay(
      motion.reduceMotion ? 0 : Math.round(captureFoldMs * 0.42),
      withTiming(1, { duration: motion.reduceMotion ? 0 : beat.arrival }),
    );
  }, [
    live,
    motion.reduceMotion,
    captureFoldMs,
    arrival,
    captureFold,
    dissolve,
    tick,
  ]);

  /* ------------------------------------ beat 2: the name lands, felt */

  useEffect(() => {
    if (state.name !== 'analyzing') return;
    tapSelection();
  }, [state.name]);

  /* --------------------------------------------- beat 3: Drop presents */

  useEffect(() => {
    if (state.name !== 'presenting' && state.name !== 'plating') return;
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

  // The tick, the hold, then the saved card travelling into History.
  useEffect(() => {
    if (state.name !== 'confirmed' && state.name !== 'plateConfirmed') return;

    const label =
      state.name === 'confirmed'
        ? state.estimate.display_name
        : state.saved.display_name;
    const id = state.entryId;

    tick.value = withTiming(1, { duration: motion.reduceMotion ? 0 : beat.tick });

    const hold = setTimeout(
      () => {
        exitTargetX.value = windowWidth - space.lg - HISTORY_CHIP_HALF_WIDTH;
        exitTargetY.value = insets.top + space.md + 24;
        setReceding(true);
        dissolve.value = withTiming(1, {
          duration: motion.reduceMotion ? 120 : beat.recede,
        });
      },
      motion.reduceMotion ? 0 : beat.hold,
    );

    const home = setTimeout(
      () => {
        // Hide the camera doors before returning to the live frame, so they
        // cannot flash above the notice for a single render.
        setResultNoticeVisible(true);
        setSnack({ id, label });
        setReceding(false);
        setDetailOpen(false);
        retake();
      },
      (motion.reduceMotion ? 0 : beat.hold) + (motion.reduceMotion ? 120 : beat.recede) + 40,
    );

    return () => {
      clearTimeout(hold);
      clearTimeout(home);
    };
  }, [
    state,
    motion.reduceMotion,
    tick,
    dissolve,
    exitTargetX,
    exitTargetY,
    windowWidth,
    insets.top,
    retake,
  ]);

  /* ------------------------------------------------------- the way back */

  useEffect(() => {
    if (!snack) return;
    setResultNoticeVisible(true);
    const timer = setTimeout(() => {
      setSnack(null);
      setResultNoticeVisible(false);
    }, beat.undo);
    return () => clearTimeout(timer);
  }, [snack]);

  useEffect(
    () => () => {
      setResultNoticeVisible(false);
    },
    [],
  );

  const handleUndo = useCallback(async () => {
    if (!snack) return;
    setSnack(null);
    setResultNoticeVisible(false);
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

  /** An unsaved result folds into the shutter instead of implying it reached History. */
  const handleDismiss = useCallback(() => {
    if (receding) return;
    exitTargetX.value = layout.bubble.x;
    exitTargetY.value = layout.bubble.y;
    setReceding(true);
    dissolve.value = withTiming(1, {
      duration: motion.reduceMotion ? 120 : beat.recede,
    });

    setTimeout(
      () => {
        setDetailOpen(false);
        retake();
        AccessibilityInfo.announceForAccessibility(copy.result.announce.collapsed);
      },
      (motion.reduceMotion ? 120 : beat.recede) + 40,
    );
  }, [
    receding,
    exitTargetX,
    exitTargetY,
    layout.bubble.x,
    layout.bubble.y,
    dissolve,
    motion.reduceMotion,
    retake,
  ]);

  /* ------------------------------------------------------------ the pile */

  /** The print takes back a dismissed sheet with the same pulse Drop uses. */
  const printPulse = useSharedValue(1);

  const handleExitStart = useCallback(() => {
    if (motion.reduceMotion) return;
    printPulse.value = withSequence(
      withTiming(1.05, { duration: 110 }),
      withSpring(1, spring.drop),
    );
  }, [motion.reduceMotion, printPulse]);

  /**
   * A sheet has landed back in the print. The last one leaving is the person
   * clearing the plate, which is a close, not a save — it takes the same door
   * an unsaved single card takes.
   */
  const handleDismissed = useCallback(
    (index: number, last: boolean) => {
      if (last) {
        handleDismiss();
        return;
      }
      const label = plateItems[index]?.estimate.display_name ?? '';
      dismissCard(index);
      AccessibilityInfo.announceForAccessibility(
        copy.result.announce.dismissed(label, Math.max(0, kept.length - 1)),
      );
    },
    [handleDismiss, dismissCard, plateItems, kept.length],
  );

  const stack = useStackOrder({
    kept,
    seeds,
    expansion,
    enabled: state.name === 'plating' && open && !receding,
    onExitStart: handleExitStart,
    onDismissed: handleDismissed,
    reduceMotion: motion.reduceMotion,
  });

  const handleConfirmMany = useCallback(async () => {
    if (busy.current || state.name !== 'plating') return;
    const savable = savableEstimates(
      keptItemsOf(state).map((entry) => entry.estimate),
    );
    if (savable.length === 0) return;
    busy.current = true;
    try {
      const entry = await insertPlate(savable.map(toEngineEstimate), {
        inputMethod: 'camera',
        photoUri,
      });
      tapConfirmed();
      confirmPlate(entry.id, entry.estimate as unknown as Estimate);
      AccessibilityInfo.announceForAccessibility(
        savable.length === 1
          ? copy.result.announce.confirmed(entry.item_label)
          : copy.result.announce.confirmedMany(savable.length, entry.item_label),
      );
    } finally {
      busy.current = false;
    }
  }, [state, photoUri, confirmPlate]);

  /** The strip zone above the card. Constant per run, so the print sits still. */
  const pileZone = multi
    ? Math.min(Math.max(plateItems.length - 1, 0), MAX_PEEKS) * stack.peekStep
    : 0;

  /**
   * Where the print goes once the card is open: the middle of the window the
   * card leaves above itself, sized to fill it without crowding either edge. A
   * tall card simply gets a smaller print rather than one behind it — and a
   * pile's peeking strips are part of the card's claim on the room.
   */
  const printOpen = useMemo(() => {
    const top = insets.top + space.xxl;
    const bottom = cardBox.y - pileZone - space.lg;
    const side = Math.min(
      Math.max(0, bottom - top) * PRINT_OPEN_FILL,
      stage.width * 0.56,
    );
    return {
      y: (top + bottom) / 2,
      scale: Math.max(
        PRINT_OPEN_MIN,
        Math.min(PRINT_OPEN_MAX, side / Math.max(1, layout.slot.width)),
      ),
    };
  }, [insets.top, cardBox.y, pileZone, stage.width, layout.slot.width]);

  /** Where a dismissed sheet flies home: the print, at its open resting spot. */
  const printCenter = useMemo(
    () => ({ x: slotCenter.x, y: printOpen.y }),
    [slotCenter.x, printOpen.y],
  );

  const cardCenter = useMemo(
    () => ({ x: cardBox.x + cardBox.width / 2, y: cardBox.y + cardBox.height / 2 }),
    [cardBox],
  );

  /* --------------------------------------------------------- the looks */

  const avatarStyle = useAnimatedStyle(() => {
    const t = expansion.value;
    const exit = dissolve.value;
    const restingX = layout.bubble.x + (dockCenter.x - layout.bubble.x) * t;
    const restingY = layout.bubble.y + (dockCenter.y - layout.bubble.y) * t;
    const cx = restingX + (exitTargetX.value - restingX) * exit;
    const cy = restingY + (exitTargetY.value - restingY) * exit;
    const docked = DOCK_SIZE / heroSize;
    const scale =
      (1 - t + t * docked) *
      (0.7 + 0.3 * arrival.value) *
      pop.value *
      (1 - exit * (1 - EXIT_SCALE));
    return {
      opacity:
        arrival.value *
        interpolate(exit, [0, 0.76, 1], [1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: cx - heroSize / 2 },
        { translateY: cy - heroSize / 2 },
        { scale },
      ],
    };
  });

  // The dock straddles the card edge. Without a paper ground, the transparent
  // pose puts its black upper outline directly on the darkened camera and the
  // ears/head appear to vanish. Bring in a small paper tab only at the end of
  // the morph so the full sprite stays legible without changing the hero beat.
  const dockGroundStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(expansion.value, [0.68, 0.88], [0, 1], Extrapolation.CLAMP) *
      interpolate(dissolve.value, [0, 0.76, 1], [1, 1, 0], Extrapolation.CLAMP),
  }));

  /**
   * The print, in one expression.
   *
   * Three journeys share the same square, in the order they happen: the fold
   * carries it from the reticle it was framed with down to its slot, the
   * expansion lifts it into the window the open card leaves, and the exit takes
   * it wherever the card is going. Composing them rather than swapping between
   * them means a thumb holding the expansion half-open holds the print there too.
   */
  const printStyle = useAnimatedStyle(() => {
    const fold = captureFold.value;
    const t = expansion.value;
    const exit = dissolve.value;
    const side = layout.slot.width;

    const restY = slotCenter.y + (printOpen.y - slotCenter.y) * t;
    const foldedX = framed.x + (slotCenter.x - framed.x) * fold;
    const foldedY = framed.y + (restY - framed.y) * fold;

    const held = framed.side / Math.max(1, side);
    const scale =
      (held + (1 - held) * fold) *
      (1 + (printOpen.scale - 1) * t) *
      (1 - exit * (1 - EXIT_SCALE)) *
      printPulse.value;

    return {
      opacity:
        interpolate(fold, [0, 0.34], [0, 1], Extrapolation.CLAMP) *
        interpolate(exit, [0, 0.76, 1], [1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: foldedX + (exitTargetX.value - foldedX) * exit - side / 2 },
        { translateY: foldedY + (exitTargetY.value - foldedY) * exit - side / 2 },
        { scale },
        {
          rotate: `${
            printTilt * interpolate(fold, [0.25, 1], [0, 1], Extrapolation.CLAMP)
          }deg`,
        },
      ],
    };
  });

  const teaserStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(expansion.value, [0, 0.24], [1, 0], Extrapolation.CLAMP) *
      arrival.value *
      interpolate(dissolve.value, [0, 0.76, 1], [1, 1, 0], Extrapolation.CLAMP),
  }));

  const contentStyle = useAnimatedStyle(() => {
    const exit = dissolve.value;
    const cardCenterX = cardBox.x + cardBox.width / 2;
    const cardCenterY = cardBox.y + cardBox.height / 2;
    return {
      opacity:
        interpolate(expansion.value, [0.55, 0.85], [0, 1], Extrapolation.CLAMP) *
        interpolate(exit, [0, 0.76, 1], [1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: (exitTargetX.value - cardCenterX) * exit },
        {
          translateY:
            interpolate(expansion.value, [0.55, 1], [14, 0], Extrapolation.CLAMP) +
            (exitTargetY.value - cardCenterY) * exit,
        },
        { scale: 1 - exit * (1 - EXIT_SCALE) },
      ],
    };
  });

  const shapeStyle = useAnimatedStyle(() => {
    const exit = dissolve.value;
    const scale = 1 - exit * (1 - EXIT_SCALE);
    const stageCenterX = stage.width / 2;
    const stageCenterY = stage.height / 2;
    const cardCenterX = cardBox.x + cardBox.width / 2;
    const cardCenterY = cardBox.y + cardBox.height / 2;
    const desiredX = cardCenterX + (exitTargetX.value - cardCenterX) * exit;
    const desiredY = cardCenterY + (exitTargetY.value - cardCenterY) * exit;
    return {
      opacity:
        interpolate(captureFold.value, [0.38, 0.82], [0, 1], Extrapolation.CLAMP) *
        interpolate(exit, [0, 0.76, 1], [1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: desiredX - stageCenterX - (cardCenterX - stageCenterX) * scale },
        { translateY: desiredY - stageCenterY - (cardCenterY - stageCenterY) * scale },
        { scale },
      ],
    };
  });

  /* ---------------------------------------------------------- the tree */

  const character = characterFor(state.name, anyFigure);
  const teaser = multi
    ? copy.result.inFrame(stack.keptCount || plateItems.length)
    : estimate
      ? copy.result.teaser(
          estimate.display_name,
          formatQuantity(estimate.quantity.value, estimate.quantity.unit),
        )
      : item?.display_name ?? workingLine(state.name);

  return (
    <View style={styles.root} pointerEvents="box-none">
      {live && (
        <>
          {backdropDismissible && (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={retake}
              accessible={false}
              testID="result-backdrop-dismiss"
            />
          )}

          {/*
            Under the card and over the backdrop: the print is the moment the
            result came from, so the result is allowed to pass in front of it,
            and a tap anywhere on it still reaches the backdrop underneath.
          */}
          {photoUri && (
            <Animated.View
              style={[
                styles.print,
                { width: layout.slot.width, height: layout.slot.height },
                printStyle,
              ]}
              pointerEvents="none"
            >
              <Snapshot
                uri={photoUri}
                size={layout.slot.width}
                seed={photoUri}
                tilt={0}
                label={copy.capture.snapshot}
              />
              {multi && (
                <FindMarks
                  boxes={plateBoxes}
                  side={layout.slot.width}
                  landed={captureFold}
                  reduceMotion={motion.reduceMotion}
                />
              )}
            </Animated.View>
          )}

          <Animated.View style={[StyleSheet.absoluteFill, shapeStyle]} pointerEvents="none">
            <Canvas
              style={StyleSheet.absoluteFill}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              {/*
                The buried sheets go down first, so the front card's paper —
                the morph, next — covers their bodies and leaves only the top
                strips peeking above it.
              */}
              {multi && (
                <PileEdges
                  box={cardBox}
                  radius={CARD_RADIUS}
                  order={stack.order}
                  depthOf={stack.depthOf}
                  lift={stack.lift}
                  expansion={expansion}
                  tiltOf={stack.tiltOf}
                  peekStep={stack.peekStep}
                  paper={colors.paper}
                  ink={colors.ink}
                  seed={seed}
                />
              )}

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

              {anyFigure && (
                <PullChevron
                  cx={layout.bubble.x}
                  cy={layout.chevronY}
                  width={28}
                  color={colors.accent}
                  seed={seed + 3}
                  expansion={expansion}
                  reduceMotion={motion.reduceMotion}
                />
              )}
            </Canvas>
          </Animated.View>

          {multi ? (
            plateItems.length > 0 && (
              <Animated.View
                style={[
                  styles.card,
                  {
                    left: CARD_MARGIN,
                    right: CARD_MARGIN,
                    bottom: insets.bottom + CARD_MARGIN,
                  },
                  contentStyle,
                ]}
                pointerEvents={open && !receding ? 'box-none' : 'none'}
              >
                <ResultStack
                  items={plateItems}
                  stack={stack}
                  expansion={expansion}
                  open={open}
                  confirmed={state.name === 'plateConfirmed'}
                  savableCount={
                    savableEstimates(
                      kept
                        .map((index) => plateItems[index]?.estimate)
                        .filter((entry): entry is Estimate => entry !== undefined),
                    ).length
                  }
                  cardCenter={cardCenter}
                  printCenter={printCenter}
                  zoneHeight={pileZone}
                  maxHeight={stage.height * CARD_MAX_SHARE}
                  onCardHeight={(height) =>
                    setCardHeight((current) => (current === height ? current : height))
                  }
                  onSave={handleConfirmMany}
                  onClose={handleDismiss}
                />
              </Animated.View>
            )
          ) : (
            estimate && (
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
                pointerEvents={open && !receding ? 'auto' : 'none'}
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
                    onClose={handleDismiss}
                    onRetake={handleRetake}
                    onSearch={openSearch}
                  />
                </ScrollView>
              </Animated.View>
            )
          )}

          {(state.name === 'confirmed' || state.name === 'plateConfirmed') && (
            <Animated.View style={[StyleSheet.absoluteFill, shapeStyle]} pointerEvents="none">
              <Canvas
                style={StyleSheet.absoluteFill}
                accessible={false}
                importantForAccessibility="no-hide-descendants"
              >
                <ConfirmMark box={tickBox} color={colors.positive} seed={seed} progress={tick} />
              </Canvas>
            </Animated.View>
          )}

          <GestureDetector gesture={gesture}>
            <Animated.View
              style={[
                styles.avatar,
                { width: heroSize, height: heroSize },
                avatarStyle,
              ]}
            >
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  styles.dockGround,
                  { backgroundColor: colors.paper },
                  dockGroundStyle,
                ]}
                pointerEvents="none"
              />
              <DropCharacter state={character} size={heroSize} seed={seed} announce />
              {backdropDismissible && state.name !== 'presenting' && (
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={(event) => event.stopPropagation()}
                  accessible={false}
                  testID="result-character-touch-guard"
                />
              )}
            </Animated.View>
          </GestureDetector>

          {teaser && (
            <Animated.View
              style={[
                styles.teaser,
                { top: layout.teaserTop },
                teaserStyle,
              ]}
              pointerEvents={open ? 'none' : 'box-none'}
            >
              {/*
                The row is reserved whether or not there is anything to pull, so
                the line under it never shifts when the estimate lands. The
                chevron is drawn in the canvas above; this is the same
                affordance with words on it, so the pull is reachable by a
                screen reader and by a thumb that would rather tap.
              */}
              <View style={styles.pullRow} pointerEvents="box-none">
                {anyFigure && (
                  <Touch
                    onPress={handleOpen}
                    style={styles.pull}
                    accessibilityLabel={copy.result.pull}
                    accessibilityHint={copy.result.pullHint}
                    accessibilityState={{ expanded: false }}
                  />
                )}
              </View>

              <View style={[styles.teaserPill, { backgroundColor: colors.bg }]}>
                <Text variant="label" tone="ink" numberOfLines={1}>
                  {teaser}
                </Text>
              </View>
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
  dockGround: { borderRadius: 999 },
  print: { position: 'absolute', left: 0, top: 0 },
  teaser: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pullRow: {
    height: PULL_ROW,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The minimum is what the layout measured the stack against; the padding is
  // what lets a larger type setting grow the pill instead of clipping it.
  teaserPill: {
    minHeight: TEASER_HEIGHT,
    justifyContent: 'center',
    maxWidth: '86%',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radii.pill,
  },
  pull: { minHeight: PULL_ROW, minWidth: 120 },
});
