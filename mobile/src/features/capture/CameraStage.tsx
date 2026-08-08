import { Canvas, Group, Skia } from '@shopify/react-native-skia';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
  Extrapolation,
  interpolate,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMotion } from '../../design/useMotion';
import { seedFromString } from '../../drawing/seededRandom';
import { HandPath } from '../../drawing/HandPath';
import { anchorFor, characterSideForAnchor } from './anchor';
import { normalizeBarcode, SCANNED_TYPES } from './barcode';
import { FrozenFrame } from './FrozenFrame';
import { captureLayout } from './layout';
import { overlayInk, RETICLE_HANDOFF, RETICLE_RELEASE } from './overlay';
import { isBusy, isResultVisible, photoUriOf, type Rect } from './types';
import { useCaptureMachine } from './useCaptureMachine';

/** A code has to go missing for this long before the hint lets go. */
const BARCODE_LINGER_MS = 1600;

/** Length of each corner mark, as a fraction of the reticle's shorter side. */
const CORNER_FRACTION = 0.26;

/** Frozen so the camera session is configured exactly once. */
const BARCODE_SETTINGS = { barcodeTypes: [...SCANNED_TYPES] };

export type StageSize = { width: number; height: number };

export type CameraStageProps = {
  cameraRef: RefObject<CameraView | null>;
  stage: StageSize;
  onStageSize: (size: StageSize) => void;
  /** True from shutter-down until the capture is cancelled or completed. */
  shutterActive: boolean;
};

/**
 * The viewfinder.
 *
 * The camera mounts once and stays mounted for the whole run — through
 * capture, through the result, through confirmation. Freezing is a held photo
 * drawn on top, never an unmount, so returning to a live frame costs nothing
 * and the preview never has to warm up twice.
 */
export function CameraStage({
  cameraRef,
  stage,
  onStageSize,
  shutterActive,
}: CameraStageProps) {
  const motion = useMotion();
  const insets = useSafeAreaInsets();
  // Two legs, because the shutter and the photo are two different moments.
  // The close is what the press buys; the landing runs on the print's clock —
  // the same `draw` the result stage folds its print in over — so the corners
  // and the print cover the last of the distance as one thing.
  const closeMs = motion.ms('settle');
  const landMs = motion.ms('draw');
  const unfoldMs = motion.ms('quick');
  const lingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fold = useSharedValue(0);

  const state = useCaptureMachine((s) => s.state);
  const ready = useCaptureMachine((s) => s.ready);
  const noteBarcode = useCaptureMachine((s) => s.noteBarcode);
  const clearBarcode = useCaptureMachine((s) => s.clearBarcode);

  const framing = state.name === 'framing';
  const hint = framing ? state.barcodeHint : undefined;
  const photoUri = photoUriOf(state);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      onStageSize({ width, height });
    },
    [onStageSize],
  );

  const handleBarcode = useCallback(
    (result: BarcodeScanningResult) => {
      // The handler stays attached in every state so the camera session is
      // never reconfigured mid-run; irrelevant states are filtered here.
      if (useCaptureMachine.getState().state.name !== 'framing') return;

      const normalized = normalizeBarcode(result);
      if (!normalized) return;

      noteBarcode(normalized);

      if (lingerTimer.current) clearTimeout(lingerTimer.current);
      lingerTimer.current = setTimeout(clearBarcode, BARCODE_LINGER_MS);
    },
    [noteBarcode, clearBarcode],
  );

  useEffect(
    () => () => {
      if (lingerTimer.current) clearTimeout(lingerTimer.current);
    },
    [],
  );

  const reticle = useMemo(() => anchorFor(stage, hint), [stage, hint]);
  const heldReticle = useRef(reticle);
  const reticleKey = hint?.gtin14 ?? 'center';
  const heldReticleKey = useRef(reticleKey);
  if (framing && !shutterActive) {
    heldReticle.current = reticle;
    heldReticleKey.current = reticleKey;
  }

  useEffect(() => {
    if (photoUri) {
      fold.value = withTiming(1, { duration: landMs });
    } else if (shutterActive) {
      fold.value = withTiming(RETICLE_HANDOFF, { duration: closeMs });
    } else {
      fold.value = withTiming(0, { duration: unfoldMs });
    }
  }, [shutterActive, photoUri, fold, closeMs, landMs, unfoldMs]);

  const foldingRect = shutterActive ? heldReticle.current : reticle;
  const foldingKey = shutterActive ? heldReticleKey.current : reticleKey;
  const showReticle = stage.width > 0 && (framing || Boolean(photoUri));

  // The corners travel to the same square the result stage puts the print in,
  // so what shrinks and what appears are one shape rather than two.
  const slot = useMemo(
    () =>
      captureLayout(
        { width: stage.width, height: stage.height },
        insets.bottom,
        characterSideForAnchor(foldingRect),
      ).slot,
    [stage.width, stage.height, insets.bottom, foldingRect],
  );

  return (
    <View style={styles.stage} onLayout={handleLayout} collapsable={false}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        onCameraReady={ready}
        onBarcodeScanned={handleBarcode}
        barcodeScannerSettings={BARCODE_SETTINGS}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      />

      {photoUri && (
        <FrozenFrame
          uri={photoUri}
          width={stage.width}
          height={stage.height}
          processing={isBusy(state)}
          dimmed={isResultVisible(state)}
        />
      )}

      {showReticle && (
        <Reticle rect={foldingRect} keyed={foldingKey} fold={fold} target={slot} />
      )}
    </View>
  );
}

/* ---------------------------------------------------------------- reticle */

/**
 * Four hand-drawn corner marks around whatever the anchor currently is.
 *
 * On the shutter they do not simply vanish: they carry the square they were
 * holding towards where the print lands, shrinking and travelling together, and
 * then wait there while the photo is written. The print comes up out of exactly
 * that square, and the corners dissolve off it as it inks in — they let go only
 * once the print is under them. They carry no meaning of their own
 * — the framing sentence beneath the frame is what a screen reader hears — so
 * the canvas is hidden from accessibility.
 */
function Reticle({
  rect,
  keyed,
  fold,
  target,
}: {
  rect: Rect;
  keyed: string;
  fold: SharedValue<number>;
  target: Rect;
}) {
  const path = useMemo(() => {
    const arm = Math.min(rect.width, rect.height) * CORNER_FRACTION;
    const l = rect.x;
    const t = rect.y;
    const r = rect.x + rect.width;
    const b = rect.y + rect.height;

    const builder = Skia.PathBuilder.Make();
    builder.moveTo(l, t + arm).lineTo(l, t).lineTo(l + arm, t);
    builder.moveTo(r - arm, t).lineTo(r, t).lineTo(r, t + arm);
    builder.moveTo(r, b - arm).lineTo(r, b).lineTo(r - arm, b);
    builder.moveTo(l + arm, b).lineTo(l, b).lineTo(l, b - arm);
    return builder.detach();
  }, [rect.x, rect.y, rect.width, rect.height]);

  const centre = useMemo(
    () => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }),
    [rect.x, rect.y, rect.width, rect.height],
  );

  // Scale and travel at once, about the reticle's own centre — so the square
  // is carried down to the slot rather than dissolving where it stood.
  const collapse = useDerivedValue(() => {
    const t = fold.value;
    return [
      { translateX: (target.x + target.width / 2 - centre.x) * t },
      { translateY: (target.y + target.height / 2 - centre.y) * t },
      { scaleX: 1 + (target.width / Math.max(1, rect.width) - 1) * t },
      { scaleY: 1 + (target.height / Math.max(1, rect.height) - 1) * t },
    ];
  });

  // Full ink for the whole close, and through the hold — the corners are still
  // holding a real square while the camera writes the file. They only give it up
  // once the print is coming up underneath them, over the first part of the
  // landing, so what is seen is a handover rather than a gap.
  const opacity = useDerivedValue(() =>
    interpolate(
      fold.value,
      [0, RETICLE_HANDOFF, RETICLE_HANDOFF + (1 - RETICLE_HANDOFF) * RETICLE_RELEASE],
      [0.85, 0.82, 0],
      Extrapolation.CLAMP,
    ),
  );

  return (
    <Canvas
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Group transform={collapse} origin={centre} opacity={opacity}>
        <HandPath
          path={path}
          color={overlayInk.mark}
          variant="pencil"
          seed={seedFromString(`capture/reticle/${keyed}`)}
          strokeScale={1.3}
        />
      </Group>
    </Canvas>
  );
}

/* ------------------------------------------------------------ shutter API */

/**
 * Firing the shutter.
 *
 * The anchor is measured at press time from the live barcode hint, which is
 * what keeps the result growing out of the thing that was actually in frame.
 * A ref guard means a double tap still produces exactly one photo.
 */
export function useTakePhoto(
  cameraRef: RefObject<CameraView | null>,
  stage: StageSize,
  onShutterStart?: () => void,
  onShutterFailure?: () => void,
) {
  const capture = useCaptureMachine((s) => s.capture);
  const busy = useRef(false);

  return useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || busy.current) return;

    const current = useCaptureMachine.getState().state;
    if (current.name !== 'framing' && current.name !== 'idle') return;

    const hint = current.name === 'framing' ? current.barcodeHint : undefined;
    const anchor = anchorFor(stage, hint);

    busy.current = true;
    onShutterStart?.();
    try {
      const photo = await camera.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) {
        capture(photo.uri, anchor);
      } else {
        onShutterFailure?.();
      }
    } catch (error) {
      console.log('[capture] shutter', error);
      onShutterFailure?.();
    } finally {
      busy.current = false;
    }
  }, [cameraRef, stage, capture, onShutterStart, onShutterFailure]);
}

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: 'hidden', backgroundColor: '#000000' },
});
