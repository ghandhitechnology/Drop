/**
 * The signature moment, in five beats.
 *
 *   1. The frame freezes. The reticle carries the square it was holding most of
 *      the way to the spot the shutter had and waits there for the photo; the
 *      print rises out of that same square, takes the last of the trip with the
 *      corners dissolving off it, and lands as a small stamped print — with Drop
 *      drawing itself in underneath, exactly where the thumb just was.
 *   2. Drop thinks, and says so under the print. The item's name replaces the
 *      working line the instant recognition lands.
 *   3. Drop pops, says what it found in one line, and a chevron offers the pull.
 *   4. The pull. Nine rays leave Drop for the card's edge and erase themselves
 *      behind; Drop's silhouette morphs into the card's frame; Drop shrinks and
 *      docks at the corner of the thing it became, while the print rises into
 *      the room the open card leaves above itself.
 *   5. Confirm. The cards and the character fall away, the print takes the
 *      centre of the stage, and the litres write themselves onto its chin —
 *      pencil stroke by pencil stroke, a tick of haptic under each glyph —
 *      before the finished print travels into History. Closing without saving
 *      takes the same material back into the shutter instead.
 *
 * One shared value drives beat four end to end, so a thumb can hold the whole
 * transformation anywhere between shut and open. Everything Skia draws here is
 * decoration: every number and word on this screen is a real Text somewhere in
 * the tree beside it.
 */

import { Canvas, Group } from '@shopify/react-native-skia';
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
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
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
import { carveTiming } from '../../drawing/handwriting';
import { seedFromString } from '../../drawing/seededRandom';
import { insertConfirmed, insertPlate, newEntryId } from '../../data/entries';
import { discardCapturedPhoto, persistCapturedPhoto } from '../../data/photos';
import { copy, formatLitres, formatQuantity, printDate } from '../../lib/copy';
import { tapConfirmed, tapPull, tapRemoving, tapSelection, tapStamp } from '../../lib/haptics';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';
import {
  estimatesOf,
  keptIndicesOf,
  pileIndicesOf,
  plateItemsOf,
  queuedCountOf,
  type Estimate,
  type Rect,
} from '../capture/types';
import { characterSideForAnchor } from '../capture/anchor';
import { captureLayout, PULL_ROW, TEASER_HEIGHT, TEASER_MAX_WIDTH_SHARE } from '../capture/layout';
import { RETICLE_HANDOFF, RETICLE_RELEASE } from '../capture/overlay';
import { Snapshot, snapshotTilt } from '../capture/Snapshot';
import { useCaptureMachine } from '../capture/useCaptureMachine';
import { RainLayer } from '../rain/RainLayer';
import { rainPhaseFor } from '../rain/sim';
import { ExpansionRays } from './ExpansionRays';
import { FindMarks } from './FindMarks';
import { localEstimate, servingOf, toEngineEstimate } from './localPipeline';
import { ConfirmMark, PullChevron } from './Marks';
import { pulseHistory } from '../history/pulse';
import { MorphShape } from './MorphShape';
import { PileEdges } from './PileEdges';
import { QueueTray } from './QueueTray';
import { ResultCard } from './ResultCard';
import { ResultStack } from './ResultStack';
import { buildRays, type Box } from './silhouette';
import { UnresolvedCard } from './UnresolvedCard';
import { UsageLimitCard } from './UsageLimitCard';
import { SwipeVerdict } from './SwipeVerdict';
import { crossedStamp, STAMP_BOTTOM, STAMP_PRESS } from './stamp';
import { beat, useExpansion } from './useExpansion';
import {
  exitOpacity,
  FLICK_VELOCITY,
  frontSheetOffset,
  MAX_PEEKS,
  savableEstimates,
  SWIPE_SAG,
  SWIPE_TRAVEL,
  SWIPE_TRIGGER,
  useStackOrder,
  type SwipeIntent,
} from './useStackOrder';

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
/**
 * The tray hangs this far under the History door — close enough to read as
 * part of it, clear enough not to sit on the chip.
 */
const TRAY_DROP = 36;
/** Keep the result legible for most of its trip, then tuck it away at the end. */
const EXIT_SCALE = 0.08;
/** Share of the window above the open card the print is allowed to fill. */
const PRINT_OPEN_FILL = 0.84;
/** Width cap for the taller Polaroid frame's square source canvas. */
const PRINT_OPEN_WIDTH_SHARE = 0.82;
/** Bounds on how far the print may grow or shrink to suit that window. */
const PRINT_OPEN_MIN = 0.62;
const PRINT_OPEN_MAX = 1.4;
/** The print's claim on the stage while its litres are being written. */
const CEREMONY_WIDTH_SHARE = 0.92;
const CEREMONY_HEIGHT_SHARE = 0.56;
/** Where the centred print stands — a touch above true centre reads centred. */
const CEREMONY_Y_SHARE = 0.46;
/** How much of its lean the print gives up for the writing. */
const CEREMONY_STRAIGHTEN = 0.75;

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

/**
 * The write did not land.
 *
 * The one rule here is that the machine does not move: a save that failed
 * leaves the card exactly where it was, still confirmable, rather than sending
 * it off to a History it never reached. Everything else is telling the person —
 * the warning note, then the sentence — because a card sitting unchanged after
 * a press is otherwise indistinguishable from a dead button.
 */
function saveDidNotLand(error: unknown): void {
  tapRemoving();
  AccessibilityInfo.announceForAccessibility(copy.result.announce.saveFailed);
  console.log('[result] save failed', error);
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
  const queueCard = useCaptureMachine((s) => s.queueCard);
  const confirmPlate = useCaptureMachine((s) => s.confirmPlate);
  const retake = useCaptureMachine((s) => s.retake);
  /** Which of the three waits this run is in for — the rain paces against it. */
  const pace = useCaptureMachine((s) => s.pace);

  /*
   * A plate is the same stage wearing more cards. `estimate` stays exactly the
   * single path's derivation; the plate reads through the list selectors, and
   * `multi` is what every plate-only branch below gates on.
   */
  const multi = state.name === 'plating' || state.name === 'plateConfirmed';
  const plateItems = useMemo(() => plateItemsOf(state) ?? [], [state]);
  const estimates = useMemo(() => estimatesOf(state), [state]);
  const estimate = 'estimate' in state ? state.estimate : (estimates[0] ?? null);
  const anyFigure = estimates.some((entry) => entry.headline !== null);
  /**
   * Two lists, and the difference between them is the whole feature.
   *
   * `kept` is what a save would write — everything not swiped away, tray
   * included. `onPile` is what is still under the thumb. A card swiped right
   * leaves the second and stays in the first.
   */
  const kept = useMemo(
    () => (state.name === 'plateConfirmed' ? [...state.kept] : keptIndicesOf(state)),
    [state],
  );
  const onPile = useMemo(() => pileIndicesOf(state), [state]);
  const queuedCount = queuedCountOf(state);
  const seeds = useMemo(() => plateItems.map((entry) => entry.estimate.catalog_id), [plateItems]);
  const plateBoxes = useMemo(() => plateItems.map((entry) => entry.box), [plateItems]);

  const item = state.name === 'analyzing' ? state.item : null;
  const anchor: Rect | null = 'anchor' in state ? state.anchor : null;
  const photoUri = 'photoUri' in state ? state.photoUri : null;
  const live = BEAT_STATES.has(state.name);
  const limited = state.name === 'limited';
  const unresolved = state.name === 'unresolved' || limited;
  const stageVisible = live || unresolved;

  const [detailOpen, setDetailOpen] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);
  const [receding, setReceding] = useState(false);
  /**
   * The status pill's real footprint, once it has been laid out.
   *
   * The rain has to keep its pool and its falling drops out from under this
   * chip, and the chip is only as wide as the sentence in it. Reserving the
   * widest it is allowed to be would put a ceiling on the water — and an
   * umbrella over the rain — across most of the stage, either side of a pill
   * that is not there. So it is measured, and the reservation is only ever the
   * fallback for the frame before the measure lands.
   */
  const [pillBox, setPillBox] = useState<Rect | null>(null);
  /** A pile has no `expanded` machine state; whether it is open lives here. */
  const [plateOpen, setPlateOpen] = useState(false);
  const [previousStateName, setPreviousStateName] = useState(state.name);

  // These flags belong to one capture run. Reset them as the machine changes
  // runs so children never render once with stale interaction state.
  if (previousStateName !== state.name) {
    setPreviousStateName(state.name);
    if (!live && !unresolved) {
      setReceding(false);
      setDetailOpen(false);
      setPlateOpen(false);
    } else if (state.name === 'presenting' || state.name === 'plating') {
      setDetailOpen(false);
    }
  }

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
    () => captureLayout({ width: stage.width, height: stage.height }, insets.bottom, anchorHero),
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

  /** The square the shutter framed — the trip down is measured from here. */
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

  const dockCenter = useMemo(() => ({ x: cardBox.x + 26, y: cardBox.y }), [cardBox.x, cardBox.y]);

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
  /** 0 → 1 takes the cards away and carries the print to the stage's centre. */
  const centering = useSharedValue(0);
  /** 0 → 1 writes the litres onto the centred print's chin. */
  const carve = useSharedValue(0);

  /**
   * What the confirmation writes onto the print, and when.
   *
   * The figure is the record's own headline — the saved plate's merged total,
   * or the single card's litres — so the print leaves for History wearing
   * exactly the number that was written into it. Until the carve runs, the
   * figure sits on the print at zero progress: present, invisible, and already
   * laid out, so the write starts on its first stroke rather than on a layout
   * pass.
   */
  const savedHeadline =
    state.name === 'plateConfirmed' ? state.saved.headline : (estimate?.headline ?? null);
  const carvedText = savedHeadline
    ? `${formatLitres(savedHeadline.value_l)} ${copy.result.unitShort}`
    : null;
  const writing = useMemo(() => (carvedText ? carveTiming(carvedText) : null), [carvedText]);
  const recedingForConfirmation =
    (state.name === 'confirmed' || state.name === 'plateConfirmed') &&
    Boolean(photoUri && writing);
  const interactionReceding = receding || recedingForConfirmation;

  /** The date the shot was taken, worn from the moment the print lands. */
  const captureDate = printDate(new Date());

  /** Where the print stands, and how large, while the litres are written. */
  const ceremony = useMemo(
    () => ({
      x: stage.width / 2,
      y: stage.height * CEREMONY_Y_SHARE,
      scale:
        Math.min(stage.width * CEREMONY_WIDTH_SHARE, stage.height * CEREMONY_HEIGHT_SHARE) /
        Math.max(1, layout.slot.width),
    }),
    [stage.width, stage.height, layout.slot.width],
  );

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
    : OPEN_STATES.has(state.name) || unsupported || unresolved;

  const backdropDismissible = BACKDROP_DISMISS_STATES.has(state.name) && !(multi && open);

  /*
   * Opening and closing carry the note, rather than any of the controls that
   * ask for it.
   *
   * There are five ways to ask: the chevron, a tap anywhere on Drop, the
   * backdrop, dragging the sheet, and a flick. Hanging the feedback off each
   * one would mean five places to keep in step and a tap on the character —
   * which is a gesture, not a button — silently missing out. Putting it on the
   * action instead means the card feels the same however it was asked for, and
   * controls that route here pass `haptic="none"` so the house press tick does
   * not stack on top.
   *
   * The close is quieter than the open on purpose. The reveal is the beat the
   * whole capture was for; putting it away is not, and matching them would
   * make the result feel like it cost the same to dismiss as to see.
   */
  const handleOpen = useCallback(() => {
    tapPull();
    if (multi) setPlateOpen(true);
    else expand();
  }, [multi, expand]);
  const handleClose = useCallback(() => {
    tapSelection();
    if (multi) setPlateOpen(false);
    else collapse();
  }, [multi, collapse]);

  const { expansion, gesture } = useExpansion({
    open,
    enabled:
      !interactionReceding &&
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
      // A failed reading keeps the landed print exactly where analysis left it.
      // It is still the same captured object; only its recovery card changes.
      if (unresolved) return;

      // A fresh frame starts from nothing — including the recede flag, which a
      // run cut short between the tick and the card's trip home would otherwise
      // leave set, holding every later result shut.
      arrival.value = 0;
      captureFold.value = 0;
      dissolve.value = 0;
      tick.value = 0;
      centering.value = 0;
      carve.value = 0;
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
    unresolved,
    motion.reduceMotion,
    captureFoldMs,
    arrival,
    captureFold,
    dissolve,
    tick,
    centering,
    carve,
  ]);

  /*
   * The thump, taken off the fold rather than off a timer.
   *
   * Reading the animation itself is what keeps the vibration on the frame the
   * print actually compresses on: a `setTimeout` started beside the fold drifts
   * against it under load, and the one thing this haptic cannot do is arrive
   * separately from the thing it belongs to.
   *
   * The crossing test fires once per capture. Resetting the fold to 0 for the
   * next frame moves the value the wrong way through the threshold, so it does
   * not re-trigger on the way back down.
   *
   * It fires under reduced motion too. That setting is about what the eye is
   * put through, not about withholding the event — the print still lands, it
   * just lands immediately, and the fold jumps the threshold in one frame.
   */
  useAnimatedReaction(
    () => captureFold.value,
    (fold, previous) => {
      if (crossedStamp(fold, previous)) runOnJS(tapStamp)();
    },
  );

  /* ------------------------------------ beat 2: the name lands, felt */

  useEffect(() => {
    if (state.name !== 'analyzing') return;
    tapSelection();
  }, [state.name]);

  /* --------------------------------------------- beat 3: Drop presents */

  useEffect(() => {
    if (state.name !== 'presenting' && state.name !== 'plating') return;
    if (motion.reduceMotion) return;
    pop.value = withSequence(withTiming(1.14, { duration: 110 }), withSpring(1, spring.drop));
  }, [state.name, motion.reduceMotion, pop]);

  /* --------------------------------------------- beat 5: the way in */

  const busy = useRef(false);

  const handleConfirm = useCallback(async () => {
    if (busy.current || !estimate || !estimate.headline) return;
    busy.current = true;
    const entryId = newEntryId();
    const storedPhotoUri = photoUri
      ? await persistCapturedPhoto(photoUri, entryId).catch(() => null)
      : null;
    try {
      const entry = await insertConfirmed(toEngineEstimate(estimate), {
        id: entryId,
        inputMethod: photoUri ? 'camera' : 'search',
        photoUri: storedPhotoUri,
      });
      tapConfirmed();
      confirmEntry(entry.id);
      AccessibilityInfo.announceForAccessibility(
        copy.result.announce.confirmed(estimate.display_name),
      );
    } catch (error) {
      if (storedPhotoUri) discardCapturedPhoto(storedPhotoUri);
      saveDidNotLand(error);
    } finally {
      busy.current = false;
    }
  }, [estimate, photoUri, confirmEntry]);

  /**
   * The confirmation, in two shapes.
   *
   * A confirm with a print gets the full ceremony: the cards and the character
   * fall away, the print takes the centre of the stage, the litres write
   * themselves onto its chin, and only then does the finished print travel to
   * History. A confirm without one — a search entry has no photo — keeps the
   * original beat: the tick draws on the card, the card holds, and the whole
   * result recedes together.
   */
  useEffect(() => {
    if (state.name !== 'confirmed' && state.name !== 'plateConfirmed') return;

    const reduced = motion.reduceMotion;
    const recedeMs = reduced ? 120 : beat.recede;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const exit = () => {
      exitTargetX.value = windowWidth - space.lg - HISTORY_CHIP_HALF_WIDTH;
      exitTargetY.value = insets.top + space.md + 24;
      setReceding(true);
      dissolve.value = withTiming(1, { duration: recedeMs });
    };

    const home = () => {
      // The card has landed on the History door; let the door say so.
      pulseHistory();
      setReceding(false);
      setDetailOpen(false);
      retake();
    };

    if (photoUri && writing) {
      // Nothing under the ceremony takes a finger while it plays.
      // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValues are mutable animation state.
      centering.value = reduced ? withTiming(1, { duration: 120 }) : withSpring(1, spring.card);

      // Linear across the whole line: each glyph's slice carries its own
      // attack, so an ease here would only starve the first and last strokes.
      const carveDelay = reduced ? 0 : beat.center;
      const carveMs = reduced ? 120 : writing.durationMs;
      // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValues are mutable animation state.
      carve.value = withDelay(
        carveDelay,
        withTiming(1, { duration: carveMs, easing: Easing.linear }),
      );

      const exitAt = carveDelay + carveMs + (reduced ? 120 : beat.carveHold);
      timers.push(setTimeout(exit, exitAt));
      timers.push(setTimeout(home, exitAt + recedeMs + 40));
    } else {
      // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValues are mutable animation state.
      tick.value = withTiming(1, { duration: reduced ? 0 : beat.tick });

      const holdMs = reduced ? 0 : beat.hold;
      timers.push(setTimeout(exit, holdMs));
      timers.push(setTimeout(home, holdMs + recedeMs + 40));
    }

    return () => timers.forEach(clearTimeout);
  }, [
    state,
    motion.reduceMotion,
    photoUri,
    writing,
    tick,
    centering,
    carve,
    dissolve,
    exitTargetX,
    exitTargetY,
    windowWidth,
    insets.top,
    retake,
  ]);

  /**
   * The pen felt, stroke by stroke.
   *
   * The ratchet reads the carve itself, the same way the stamp reads the fold:
   * a tick lands exactly as each glyph's first stroke touches the paper, and
   * the write signs off with the stamp's own thump. Reading the animation
   * keeps the touches on the strokes under load, where timers would drift off
   * them.
   */
  useAnimatedReaction(
    () => carve.value,
    (at, previous) => {
      if (previous === null || at <= previous) return;
      if (writing) {
        for (const start of writing.starts) {
          if (previous <= start && start < at) {
            runOnJS(tapSelection)();
            break;
          }
        }
      }
      if (previous < 1 && at >= 1) runOnJS(tapStamp)();
    },
    [writing],
  );

  /* -------------------------------------------------------- the amount */

  const serving = useMemo(
    () => (estimate ? servingOf(estimate.catalog_id) : null),
    [estimate],
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
  const openUsage = useCallback(() => router.push('/settings'), [router]);

  const handleRetake = useCallback(() => {
    setDetailOpen(false);
    retake();
  }, [retake, setDetailOpen]);

  /**
   * An unsaved result folds into the shutter instead of implying it reached
   * History. A full tray goes with it — nothing swiped across was ever written,
   * so closing is the one place the queue is thrown away, and it says so.
   */
  const handleDismiss = useCallback(() => {
    if (interactionReceding) return;
    const discarding = queuedCount;
    // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValues are mutable animation state.
    exitTargetX.value = layout.bubble.x;
    // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValues are mutable animation state.
    exitTargetY.value = layout.bubble.y;
    setReceding(true);
    // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValues are mutable animation state.
    dissolve.value = withTiming(1, {
      duration: motion.reduceMotion ? 120 : beat.recede,
    });

    setTimeout(
      () => {
        setDetailOpen(false);
        retake();
        AccessibilityInfo.announceForAccessibility(
          discarding > 0
            ? copy.result.announce.discarded(discarding)
            : copy.result.announce.collapsed,
        );
      },
      (motion.reduceMotion ? 120 : beat.recede) + 40,
    );
  }, [
    interactionReceding,
    queuedCount,
    exitTargetX,
    exitTargetY,
    layout.bubble.x,
    layout.bubble.y,
    dissolve,
    motion.reduceMotion,
    retake,
    setDetailOpen,
  ]);

  /* ------------------------------------------------------------ the pile */

  /** Whatever catches a departing sheet greets it with the pulse Drop uses. */
  const printPulse = useSharedValue(1);
  const trayPulse = useSharedValue(1);

  /** The tray leaves with the cards: on the exit, or as the ceremony centres. */
  const trayAway = useDerivedValue(() =>
    Math.max(dissolve.value, interpolate(centering.value, [0, 0.4], [0, 1], Extrapolation.CLAMP)),
  );

  const handleExitStart = useCallback(
    (_index: number, intent: SwipeIntent) => {
      if (motion.reduceMotion) return;
      const catcher = intent === 'queue' ? trayPulse : printPulse;
      // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValues are mutable animation state.
      catcher.value = withSequence(withTiming(1.05, { duration: 110 }), withSpring(1, spring.drop));
    },
    [motion.reduceMotion, printPulse, trayPulse],
  );

  /**
   * The one write of a plate run.
   *
   * `indices` is decided by the caller because the last card of a run leaves
   * the pile in the same tick as the save, and the machine has not heard about
   * it yet. Everything queued has been waiting for exactly this call — the
   * cards go in as one merged row, which is what they would have been if the
   * person had pressed Save without swiping at all.
   */
  const finishPlate = useCallback(
    async (indices: readonly number[]) => {
      if (busy.current || state.name !== 'plating') return;
      const chosen = indices
        .map((index) => state.items[index]?.estimate)
        .filter((entry): entry is Estimate => entry !== undefined);
      const savable = savableEstimates(chosen);
      if (savable.length === 0) return;
      busy.current = true;
      const entryId = newEntryId();
      const storedPhotoUri = photoUri
        ? await persistCapturedPhoto(photoUri, entryId).catch(() => null)
        : null;
      try {
        const entry = await insertPlate(savable.map(toEngineEstimate), {
          id: entryId,
          inputMethod: photoUri ? 'camera' : 'search',
          photoUri: storedPhotoUri,
        });
        tapConfirmed();
        confirmPlate(entry.id, entry.estimate as unknown as Estimate, indices);
        AccessibilityInfo.announceForAccessibility(
          savable.length === 1
            ? copy.result.announce.confirmed(entry.item_label)
            : copy.result.announce.confirmedMany(savable.length, entry.item_label),
        );
      } catch (error) {
        if (storedPhotoUri) discardCapturedPhoto(storedPhotoUri);
        saveDidNotLand(error);
      } finally {
        busy.current = false;
      }
    },
    [state, photoUri, confirmPlate],
  );

  const handleConfirmMany = useCallback(() => {
    void finishPlate(kept);
  }, [finishPlate, kept]);

  /**
   * A sheet has landed, and which way it went decides everything.
   *
   * Left puts it back in the photo and forgets it. Right sends it to the tray,
   * where it waits — unwritten — for the end of the run.
   *
   * The last sheet leaving is the end of the run either way, and that is the
   * one place the two directions converge: whatever is in the tray gets
   * written, even if the gesture that emptied the pile was a swipe away. The
   * alternative is a single left-swipe silently destroying a tray full of
   * deliberate right-swipes. Only the way out throws the tray away.
   */
  const handleResolved = useCallback(
    (index: number, intent: SwipeIntent, last: boolean) => {
      if (last) {
        const saving = intent === 'queue' ? kept : kept.filter((entry) => entry !== index);
        const savable = savableEstimates(
          saving
            .map((entry) => plateItems[entry]?.estimate)
            .filter((entry): entry is Estimate => entry !== undefined),
        );
        if (savable.length > 0) void finishPlate(saving);
        else handleDismiss();
        return;
      }

      const label = plateItems[index]?.estimate.display_name ?? '';
      const left = Math.max(0, onPile.length - 1);

      if (intent === 'queue') {
        queueCard(index);
        AccessibilityInfo.announceForAccessibility(
          copy.result.announce.queued(label, queuedCount + 1, left),
        );
        return;
      }

      dismissCard(index);
      AccessibilityInfo.announceForAccessibility(copy.result.announce.dismissed(label, left));
    },
    [
      kept,
      onPile.length,
      queuedCount,
      plateItems,
      finishPlate,
      handleDismiss,
      queueCard,
      dismissCard,
    ],
  );

  const stack = useStackOrder({
    kept: onPile,
    seeds,
    expansion,
    enabled: state.name === 'plating' && open && !interactionReceding,
    onExitStart: handleExitStart,
    onResolved: handleResolved,
    reduceMotion: motion.reduceMotion,
  });

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
      stage.width * PRINT_OPEN_WIDTH_SHARE,
    );
    return {
      y: (top + bottom) / 2,
      scale: Math.max(
        PRINT_OPEN_MIN,
        Math.min(PRINT_OPEN_MAX, side / Math.max(1, layout.slot.width)),
      ),
    };
  }, [insets.top, cardBox.y, pileZone, stage.width, layout.slot.width]);

  /** Where a swiped-away sheet flies home: the print, at its open resting spot. */
  const printCenter = useMemo(
    () => ({ x: slotCenter.x, y: printOpen.y }),
    [slotCenter.x, printOpen.y],
  );

  /**
   * Where a swiped-across sheet lands: the tray, hanging under the History
   * door. It sits on the route the saved card takes later, so a card queued
   * now and the plate saved at the end travel the same line.
   */
  const trayCenter = useMemo(
    () => ({
      x: stage.width - space.lg - HISTORY_CHIP_HALF_WIDTH,
      y: insets.top + space.md + 24 + TRAY_DROP,
    }),
    [stage.width, insets.top],
  );

  const cardCenter = useMemo(
    () => ({
      x: cardBox.x + cardBox.width / 2,
      y: cardBox.y + cardBox.height / 2,
    }),
    [cardBox],
  );

  /**
   * Whether the right swipe has anything to add.
   *
   * A card whose figure arrives in a later release rides along on the plate but
   * writes nothing, so it gets no plus — the mark only ever promises a save that
   * the release can actually make.
   */
  const canAddFront = multi
    ? Boolean(plateItems[stack.front]?.estimate.headline)
    : Boolean(estimate?.headline);

  /* -------------------------------------------------------- the one card */

  /**
   * A single result sorts the same way a pile does.
   *
   * There is no tray here — one card is its own plate, so the right swipe is
   * simply the confirm and the left is the close. Both hand straight to the
   * buttons underneath, which keeps one door into history rather than two, and
   * means the celebration and the fold-away play exactly as they always have.
   */
  const singleSwipeX = useSharedValue(0);
  const canConfirmSingle = Boolean(estimate?.headline);

  /* eslint-disable react-hooks/immutability, react-hooks/refs -- Gesture callbacks are Reanimated worklets; they run after render and mutate SharedValues. */
  const singleSwipe = useMemo(() => {
    const release = () => {
      'worklet';
      singleSwipeX.value = motion.reduceMotion
        ? withTiming(0, { duration: 120 })
        : withSpring(0, spring.card);
    };

    return Gesture.Pan()
      .enabled(!multi && open && !interactionReceding && Boolean(estimate))
      .activeOffsetX([-12, 12])
      .failOffsetY([-24, 24])
      .onUpdate((event) => {
        singleSwipeX.value = event.translationX;
      })
      .onEnd((event) => {
        const flicked = Math.abs(event.velocityX) > FLICK_VELOCITY;
        const direction = flicked ? Math.sign(event.velocityX) : Math.sign(event.translationX);
        const committed =
          direction !== 0 && (flicked || Math.abs(event.translationX) >= SWIPE_TRIGGER);

        // The card always comes back to centre. What happens next is a whole
        // beat of its own — the tick, or the fold into the shutter — and both
        // want to start from where the card actually lives.
        release();
        if (!committed) return;
        if (direction > 0) {
          if (canConfirmSingle) runOnJS(handleConfirm)();
          return;
        }
        runOnJS(handleDismiss)();
      })
      .onFinalize((_event, success) => {
        if (!success) release();
      });
  }, [
    multi,
    open,
    interactionReceding,
    estimate,
    canConfirmSingle,
    handleConfirm,
    handleDismiss,
    motion.reduceMotion,
    singleSwipeX,
  ]);
  /* eslint-enable react-hooks/immutability, react-hooks/refs */

  const singleSwipeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: singleSwipeX.value },
      {
        translateY: SWIPE_SAG * Math.min(1, Math.abs(singleSwipeX.value) / SWIPE_TRAVEL),
      },
    ],
  }));

  /* ------------------------------------------------ the paper it sits on */

  /**
   * The card's paper, carried by the same swipe as its words.
   *
   * The words are React views; the paper under them is Skia, drawn in the
   * stage's own canvas. Nothing makes the two move together except being handed
   * the same offset, so both sides call `frontSheetOffset` and this is the Skia
   * half of it — pivoting on the card's own centre, which is what a React
   * transform does implicitly, so the two stay exactly on top of each other.
   *
   * Only the front sheet travels. The buried paper is `PileEdges`, outside this
   * group, and it stays put and rises as the pile closes up.
   */
  const frontTilt = stack.tiltOf(stack.front);

  /*
   * Pulled out one by one on purpose. A worklet closes over whole identifiers,
   * so reaching through `stack` inside one would drag the entire object across
   * to the UI thread — gesture handlers included, and a PanGesture cannot be
   * serialised. Only the shared values may make the trip.
   */
  const { swipeX: sheetX, exit: sheetExit, exitDirection: sheetHeading, lift: sheetLift } = stack;

  const paperCarry = useDerivedValue(() => {
    const at = multi
      ? frontSheetOffset(
          sheetX.value,
          sheetExit.value,
          sheetHeading.value,
          sheetLift.value,
          cardCenter,
          printCenter,
          trayCenter,
          frontTilt,
        )
      : frontSheetOffset(singleSwipeX.value, 0, 1, 0, cardCenter, printCenter, trayCenter, 0);
    return [
      { translateX: at.x },
      { translateY: at.y },
      { scale: at.scale },
      { rotate: (at.rotate * Math.PI) / 180 },
    ];
  }, [
    multi,
    cardCenter,
    printCenter,
    trayCenter,
    frontTilt,
    sheetX,
    sheetExit,
    sheetHeading,
    sheetLift,
    singleSwipeX,
  ]);

  /** The paper thins out on its way off the pile exactly as its words do. */
  const paperOpacity = useDerivedValue(
    () => (multi ? exitOpacity(sheetExit.value) : 1),
    [multi, sheetExit],
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
        interpolate(exit, [0, 0.76, 1], [1, 1, 0], Extrapolation.CLAMP) *
        interpolate(centering.value, [0, 0.4], [1, 0], Extrapolation.CLAMP) *
        (unresolved ? interpolate(t, [0, 0.52], [1, 0], Extrapolation.CLAMP) : 1),
      transform: [{ translateX: cx - heroSize / 2 }, { translateY: cy - heroSize / 2 }, { scale }],
    };
  });

  // The dock straddles the card edge. Without a paper ground, the transparent
  // pose puts its black upper outline directly on the darkened camera and the
  // ears/head appear to vanish. Bring in a small paper tab only at the end of
  // the morph so the full sprite stays legible without changing the hero beat.
  const dockGroundStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(expansion.value, [0.68, 0.88], [0, 1], Extrapolation.CLAMP) *
      interpolate(dissolve.value, [0, 0.76, 1], [1, 1, 0], Extrapolation.CLAMP) *
      interpolate(centering.value, [0, 0.4], [1, 0], Extrapolation.CLAMP),
  }));

  /**
   * The print, in one expression.
   *
   * Three journeys share the same square, in the order they happen: the fold
   * carries it from the reticle it was framed with down to its slot, the
   * expansion lifts it into the window the open card leaves, and the exit takes
   * it wherever the card is going. Composing them rather than swapping between
   * them means a thumb holding the expansion half-open holds the print there too.
   *
   * The fold does not start at the framed square. It starts where the reticle
   * closed to while the photo was being written, so the print is the same square
   * continuing rather than a new one setting off from the top. Both sides
   * interpolate linearly off the same constant over the same duration, which is
   * what keeps them exactly on top of each other for the shared leg.
   */
  const printStyle = useAnimatedStyle(() => {
    const fold = captureFold.value;
    const t = unresolved ? 0 : expansion.value;
    const centred = centering.value;
    const exit = dissolve.value;
    const side = layout.slot.width;

    const restY = slotCenter.y + (printOpen.y - slotCenter.y) * t;
    const heldX = framed.x + (slotCenter.x - framed.x) * RETICLE_HANDOFF;
    const heldY = framed.y + (restY - framed.y) * RETICLE_HANDOFF;
    const heldSide = framed.side + (side - framed.side) * RETICLE_HANDOFF;

    const foldedX = heldX + (slotCenter.x - heldX) * fold;
    const foldedY = heldY + (restY - heldY) * fold;

    // The ceremony picks the print up wherever the expansion left it and
    // carries it to the stage's centre; the exit then leaves from wherever the
    // ceremony stands, so the three journeys chain instead of arguing.
    const stagedX = foldedX + (ceremony.x - foldedX) * centred;
    const stagedY = foldedY + (ceremony.y - foldedY) * centred;

    const held = heldSide / Math.max(1, side);
    const stampScale = interpolate(
      fold,
      [0, 0.74, 0.84, 0.92, 1],
      [1, 1, 1.045, 0.975, 1],
      Extrapolation.CLAMP,
    );
    const stampPress = interpolate(
      fold,
      [0, 0.8, STAMP_BOTTOM, 1],
      [0, 0, STAMP_PRESS, 0],
      Extrapolation.CLAMP,
    );
    const openScale = (held + (1 - held) * fold) * stampScale * (1 + (printOpen.scale - 1) * t);
    const scale =
      (openScale + (ceremony.scale - openScale) * centred) *
      (1 - exit * (1 - EXIT_SCALE)) *
      printPulse.value;

    return {
      // Inked in under the corners while they are still on it — the print is
      // solid a beat before they have finished dissolving, so the two overlap
      // instead of handing off across a blank frame.
      opacity:
        interpolate(fold, [0, RETICLE_RELEASE * 0.72], [0, 1], Extrapolation.CLAMP) *
        interpolate(exit, [0, 0.76, 1], [1, 1, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateX: stagedX + (exitTargetX.value - stagedX) * exit - side / 2,
        },
        {
          translateY:
            stagedY +
            (exitTargetY.value - stagedY) * exit -
            side / 2 +
            stampPress * (1 - t) * (1 - exit),
        },
        { scale },
        {
          // The lean waits for the corners to be gone — and mostly straightens
          // for the writing, the way a hand squares a print to caption it.
          rotate: `${
            printTilt *
            interpolate(fold, [RETICLE_RELEASE, 0.86], [0, 1], Extrapolation.CLAMP) *
            (1 - CEREMONY_STRAIGHTEN * centred)
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
        interpolate(exit, [0, 0.76, 1], [1, 1, 0], Extrapolation.CLAMP) *
        interpolate(centering.value, [0, 0.45], [1, 0], Extrapolation.CLAMP),
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
        interpolate(exit, [0, 0.76, 1], [1, 1, 0], Extrapolation.CLAMP) *
        interpolate(centering.value, [0, 0.45], [1, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateX: desiredX - stageCenterX - (cardCenterX - stageCenterX) * scale,
        },
        {
          translateY: desiredY - stageCenterY - (cardCenterY - stageCenterY) * scale,
        },
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
      : (item?.display_name ?? workingLine(state.name));

  return (
    <View style={styles.root} pointerEvents="box-none">
      {live && backdropDismissible && (
        <Pressable
          style={StyleSheet.absoluteFill}
          // While the result is still presenting itself, every tap is a
          // request to see it — the number is the whole point of the beat.
          // Only an open card treats the backdrop as the way out. A pile
          // still waiting on its pull is the same moment wearing more cards.
          onPress={state.name === 'presenting' || state.name === 'plating' ? handleOpen : retake}
          accessible={false}
          testID="result-backdrop-dismiss"
        />
      )}

      {/*
        The weather goes down before anything else, because it is behind
        everything else: the print, the character, the card and the line all sit
        over it. It is mounted for exactly as long as a frame is held — a live
        viewfinder never sees it — and unmounts itself the moment it has
        finished draining, so a result on screen is a layer costing nothing.
      */}
      {stageVisible && (
        <RainLayer
          stage={stage}
          layout={layout}
          pill={pillBox}
          fold={captureFold}
          phase={rainPhaseFor(state.name)}
          pace={pace}
          reduceMotion={motion.reduceMotion}
        />
      )}

      {/*
        The print is one held object from the stamp through the result. A failed
        reading leaves it mounted here while the recovery card arrives above it.
      */}
      {stageVisible && photoUri && (
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
            date={captureDate}
            carved={carvedText ?? undefined}
            carveProgress={carve}
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

      {stageVisible && (
        <>
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

              {/*
                The front sheet's paper. It rides the swipe with the words
                printed on it — a card is one object, and the moment the ink
                slides off its own frame the illusion is over.
              */}
              <Group transform={paperCarry} origin={cardCenter} opacity={paperOpacity}>
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
              </Group>

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

          {unresolved ? (
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
              {limited ? (
                <UsageLimitCard onSearch={openSearch} onSettings={openUsage} />
              ) : (
                <UnresolvedCard onSearch={openSearch} onRetake={handleRetake} />
              )}
            </Animated.View>
          ) : multi ? (
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
                pointerEvents={open && !interactionReceding ? 'box-none' : 'none'}
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
                  queuedCount={queuedCount}
                  cardCenter={cardCenter}
                  printCenter={printCenter}
                  trayCenter={trayCenter}
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
                pointerEvents={open && !interactionReceding ? 'auto' : 'none'}
                onLayout={(event) => {
                  const { height } = event.nativeEvent.layout;
                  setCardHeight((current) => (current === height ? current : height));
                }}
              >
                <GestureDetector gesture={singleSwipe}>
                  <Animated.View style={singleSwipeStyle}>
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
                </GestureDetector>
              </Animated.View>
            )
          )}

          {/*
            The verdict, struck across the card the thumb is holding. It is the
            last thing painted over the sheet and rides the same carry as the
            paper, so a card caught mid-throw wears its own decision out of
            frame. Nothing here takes a finger.
          */}
          {!unresolved && open && !interactionReceding && (
            <Animated.View style={[StyleSheet.absoluteFill, shapeStyle]} pointerEvents="none">
              <Canvas
                style={StyleSheet.absoluteFill}
                accessible={false}
                importantForAccessibility="no-hide-descendants"
              >
                <Group transform={paperCarry} origin={cardCenter} opacity={paperOpacity}>
                  <SwipeVerdict
                    box={cardBox}
                    swipeX={multi ? stack.swipeX : singleSwipeX}
                    addColor={colors.accent}
                    dropColor={colors.negative}
                    seed={seed}
                    canAdd={canAddFront}
                  />
                </Group>
              </Canvas>
            </Animated.View>
          )}

          {/*
            The tray sits above the card and below the celebration: cards land
            in it while the pile is still being sorted, and it goes with
            everything else when the result leaves.
          */}
          {multi && (
            <QueueTray
              count={queuedCount}
              top={trayCenter.y}
              pulse={trayPulse}
              dissolve={trayAway}
            />
          )}

          {/* The photo-less confirm keeps its tick; a print carries the carve instead. */}
          {(state.name === 'confirmed' || state.name === 'plateConfirmed') && !photoUri && (
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
              style={[styles.avatar, { width: heroSize, height: heroSize }, avatarStyle]}
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
              {/*
                Drop is the way in as well as the mascot: the tap gesture on the
                detector above already opens the card from anywhere on the
                character, and shuts it again once it is up. Nothing is layered
                over the canvas to catch that — a `Pressable` here would race
                the gesture for the same touch. What the tap was missing was a
                note, and that belongs to the open and the close themselves.
              */}
              <DropCharacter state={character} size={heroSize} seed={seed} announce={!unresolved} />
              {backdropDismissible && state.name !== 'presenting' && state.name !== 'plating' && (
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
              style={[styles.teaser, { top: layout.teaserTop }, teaserStyle]}
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
                    haptic="none"
                    style={styles.pull}
                    accessibilityLabel={copy.result.pull}
                    accessibilityHint={copy.result.pullHint}
                    accessibilityState={{ expanded: false }}
                  />
                )}
              </View>

              <View
                style={[styles.teaserPill, { backgroundColor: colors.bg }]}
                // The row this sits in is pinned to `layout.teaserTop` and
                // spans the stage, so the measured box only needs that one
                // offset to be in the stage's own coordinates — which is the
                // space the rain layer draws in.
                onLayout={(event) => {
                  const { x, y, width, height } = event.nativeEvent.layout;
                  setPillBox((current) =>
                    current &&
                    current.x === x &&
                    current.y === layout.teaserTop + y &&
                    current.width === width &&
                    current.height === height
                      ? current
                      : { x, y: layout.teaserTop + y, width, height },
                  );
                }}
              >
                <Text variant="label" tone="ink" numberOfLines={1}>
                  {teaser}
                </Text>
              </View>
            </Animated.View>
          )}
        </>
      )}
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
  // what lets a larger type setting grow the pill instead of clipping it. The
  // maximum is what the rain falls back on for the frame before it has this
  // pill's real box to keep its pool out from under.
  teaserPill: {
    minHeight: TEASER_HEIGHT,
    justifyContent: 'center',
    maxWidth: `${TEASER_MAX_WIDTH_SHARE * 100}%` as `${number}%`,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radii.pill,
  },
  pull: { minHeight: PULL_ROW, minWidth: 120 },
});
