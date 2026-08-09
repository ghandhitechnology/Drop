/**
 * The capture state machine.
 *
 * One store owns the whole run, from a live viewfinder to a confirmed history
 * entry. Two rules shape it:
 *
 *  1. Nothing reaches history without an explicit `confirm()`. There is no
 *     path from `presenting` to `confirmed` that a timer can take.
 *  2. The machine never knows how recognition works. It calls `getPipeline()`
 *     and reacts to four callbacks — see pipeline.ts, the DEV seam.
 *
 * Transitions are validated against the state they expect. A late callback
 * from a run that has been cancelled or superseded is dropped by generation
 * check, so a fast retake can never be overwritten by the previous photo.
 */

import { AccessibilityInfo } from 'react-native';
import { create } from 'zustand';

import { copy, litresSentence } from '../../lib/copy';
import { sameBarcode } from './barcode';
import { getPipeline, type PipelineRun } from './pipeline';
import type {
  BarcodeHint,
  CaptureMode,
  CaptureState,
  Estimate,
  PlateItem,
  Rect,
  RecognizedItem,
} from './types';

/** Non-reactive run bookkeeping — changing these must not re-render the camera. */
let run: PipelineRun | null = null;
let generation = 0;

function announce(message: string) {
  AccessibilityInfo.announceForAccessibility(message);
}

/**
 * Whether a card can still be swiped either way.
 *
 * Both directions take a card off the pile, so both share one rule: the card
 * has to be on the pile, and it must not be the last one there. Emptying the
 * pile ends the run, and what that means — write the queue, or fold the whole
 * thing back into the shutter — is the stage's decision, not the machine's.
 */
function movable(
  state: Extract<CaptureState, { name: 'plating' }>,
  index: number,
): boolean {
  if (index < 0 || index >= state.items.length) return false;
  if (state.dismissed.includes(index) || state.queued.includes(index)) return false;
  const onPile = state.items.length - state.dismissed.length - state.queued.length;
  return onPile > 1;
}

export type CaptureActions = {
  /** Camera reported ready. Moves idle → framing. */
  ready: () => void;
  /** A normalised scan arrived while framing. Repeats of the same code are dropped. */
  noteBarcode: (hint: BarcodeHint) => void;
  /** No code has been seen for a while. */
  clearBarcode: () => void;
  /** Switch recognition behavior while the live camera is waiting. */
  toggleFastMode: () => void;
  /**
   * The shutter fired: the frame is frozen and the pipeline starts.
   * `anchor` is in capture-stage coordinates — barcode bounds when a code was
   * in frame, otherwise the centre square.
   */
  capture: (photoUri: string, anchor: Rect) => void;
  /** Open the full result. The signature expansion plays over this transition. */
  expand: () => void;
  /** Back from `expanded` or `adjusting` to the compact result. */
  collapse: () => void;
  /** Open the amount editor. */
  adjust: () => void;
  /** Replace the estimate after an amount change, staying in `adjusting`. */
  reviseEstimate: (estimate: Estimate) => void;
  /** The one door into history. */
  confirm: (entryId: string) => void;
  /** Set a plate card aside. Idempotent, and it refuses to empty the stack. */
  dismissCard: (index: number) => void;
  /**
   * Swipe a plate card toward history. Nothing is written — the card moves to
   * the queue and waits for the one `insertPlate` at the end of the run.
   * Idempotent, and it refuses to empty the stack.
   */
  queueCard: (index: number) => void;
  /** Put a set-aside card back. */
  restoreCard: (index: number) => void;
  /**
   * The one door into history for a plate. `kept` is what was actually written,
   * by index, because the last card of a run leaves the pile in the same tick
   * as the save and the machine cannot re-derive it.
   */
  confirmPlate: (entryId: string, saved: Estimate, kept: readonly number[]) => void;
  /** Drop the frozen frame and go back to a live viewfinder. */
  retake: () => void;
};

export type CaptureStore = {
  state: CaptureState;
  mode: CaptureMode;
} & CaptureActions;

export const useCaptureMachine = create<CaptureStore>((set, get) => {
  /** Guard a pipeline callback against a superseded or cancelled run. */
  const forRun = (token: number, apply: (state: CaptureState) => CaptureState | null) => {
    if (token !== generation) return;
    const next = apply(get().state);
    if (next) set({ state: next });
  };

  const stopRun = () => {
    generation += 1;
    run?.cancel();
    run = null;
  };

  return {
    state: { name: 'idle' },
    mode: 'normal',

    ready: () => {
      if (get().state.name !== 'idle') return;
      set({ state: { name: 'framing' } });
      announce(copy.capture.announce.framing);
    },

    noteBarcode: (hint) => {
      const state = get().state;
      if (state.name !== 'framing') return;
      if (sameBarcode(state.barcodeHint, hint)) {
        // Same product, fresher bounds — keep the anchor honest without re-announcing.
        set({ state: { name: 'framing', barcodeHint: hint } });
        return;
      }
      console.log('[capture] barcode', hint.symbology, hint.value, '→', hint.gtin14);
      set({ state: { name: 'framing', barcodeHint: hint } });
      announce(copy.capture.announce.barcode);
    },

    clearBarcode: () => {
      const state = get().state;
      if (state.name !== 'framing' || !state.barcodeHint) return;
      set({ state: { name: 'framing' } });
    },

    toggleFastMode: () => {
      const state = get().state;
      if (state.name !== 'framing' && state.name !== 'idle') return;
      const mode = get().mode === 'fast' ? 'normal' : 'fast';
      set({ mode });
      announce(mode === 'fast' ? copy.capture.announce.fastOn : copy.capture.announce.fastOff);
    },

    capture: (photoUri, anchor) => {
      const state = get().state;
      if (state.name !== 'framing' && state.name !== 'idle') return;
      const barcode = state.name === 'framing' ? state.barcodeHint : undefined;

      stopRun();
      const token = generation;

      set({ state: { name: 'captured', photoUri, anchor } });
      announce(copy.capture.announce.captured);

      run = getPipeline()(
        { photoUri, barcode, mode: get().mode },
        {
          onRecognizing: () =>
            forRun(token, (current) =>
              current.name === 'captured'
                ? { name: 'recognizing', photoUri: current.photoUri, anchor: current.anchor }
                : null,
            ),

          onAnalyzing: (item: RecognizedItem) =>
            forRun(token, (current) =>
              current.name === 'recognizing'
                ? {
                    name: 'analyzing',
                    photoUri: current.photoUri,
                    anchor: current.anchor,
                    item,
                  }
                : null,
            ),

          onPresenting: (estimate: Estimate) =>
            forRun(token, (current) => {
              if (current.name !== 'analyzing') return null;
              announce(
                copy.capture.announce.presenting(
                  estimate.display_name,
                  litresSentence(estimate),
                ),
              );
              return {
                name: 'presenting',
                photoUri: current.photoUri,
                anchor: current.anchor,
                estimate,
              };
            }),

          onPresentingMany: (items: PlateItem[]) =>
            forRun(token, (current) => {
              if (current.name !== 'analyzing') return null;
              announce(copy.capture.announce.plate(items.length));
              return {
                name: 'plating',
                photoUri: current.photoUri,
                anchor: current.anchor,
                items,
                dismissed: [],
                queued: [],
              };
            }),

          onUnresolved: () =>
            forRun(token, (current) => {
              if (!('photoUri' in current) || !('anchor' in current)) return null;
              announce(copy.capture.announce.unresolved);
              return {
                name: 'unresolved',
                photoUri: current.photoUri,
                anchor: current.anchor,
              };
            }),
        },
      );
    },

    expand: () => {
      const state = get().state;
      if (state.name !== 'presenting' && state.name !== 'adjusting') return;
      set({
        state: {
          name: 'expanded',
          photoUri: state.photoUri,
          anchor: state.anchor,
          estimate: state.estimate,
        },
      });
      announce(copy.capture.announce.expanded);
    },

    collapse: () => {
      const state = get().state;
      if (state.name !== 'expanded' && state.name !== 'adjusting') return;
      set({
        state: {
          name: 'presenting',
          photoUri: state.photoUri,
          anchor: state.anchor,
          estimate: state.estimate,
        },
      });
    },

    adjust: () => {
      const state = get().state;
      if (state.name !== 'presenting' && state.name !== 'expanded') return;
      set({
        state: {
          name: 'adjusting',
          photoUri: state.photoUri,
          anchor: state.anchor,
          estimate: state.estimate,
        },
      });
    },

    reviseEstimate: (estimate) => {
      const state = get().state;
      if (state.name !== 'adjusting') return;
      set({ state: { ...state, estimate } });
    },

    confirm: (entryId) => {
      const state = get().state;
      if (state.name !== 'presenting' && state.name !== 'expanded' && state.name !== 'adjusting') {
        return;
      }
      set({
        state: {
          name: 'confirmed',
          photoUri: state.photoUri,
          anchor: state.anchor,
          estimate: state.estimate,
          entryId,
        },
      });
    },

    dismissCard: (index) => {
      const state = get().state;
      if (state.name !== 'plating') return;
      if (!movable(state, index)) return;
      set({ state: { ...state, dismissed: [...state.dismissed, index] } });
    },

    queueCard: (index) => {
      const state = get().state;
      if (state.name !== 'plating') return;
      if (!movable(state, index)) return;
      set({ state: { ...state, queued: [...state.queued, index] } });
    },

    restoreCard: (index) => {
      const state = get().state;
      if (state.name !== 'plating') return;
      if (!state.dismissed.includes(index) && !state.queued.includes(index)) return;
      set({
        state: {
          ...state,
          dismissed: state.dismissed.filter((i) => i !== index),
          queued: state.queued.filter((i) => i !== index),
        },
      });
    },

    confirmPlate: (entryId, saved, kept) => {
      const state = get().state;
      if (state.name !== 'plating') return;
      set({
        state: {
          name: 'plateConfirmed',
          photoUri: state.photoUri,
          anchor: state.anchor,
          items: state.items,
          kept: [...kept],
          queued: state.queued,
          entryId,
          saved,
        },
      });
    },

    retake: () => {
      stopRun();
      set({ state: { name: 'framing' } });
      announce(copy.capture.announce.framing);
    },
  };
});

/* ------------------------------------------------------------ selectors */

export const selectState = (store: CaptureStore) => store.state;
export const selectStateName = (store: CaptureStore) => store.state.name;
export const selectBarcodeHint = (store: CaptureStore) =>
  store.state.name === 'framing' ? store.state.barcodeHint : undefined;
