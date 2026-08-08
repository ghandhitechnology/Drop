/* eslint-disable no-console */
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

import { useMotion } from '../../design/useMotion';
import { seedFromString } from '../../drawing/seededRandom';
import { HandPath } from '../../drawing/HandPath';
import { anchorFor, characterSideForAnchor } from './anchor';
import { normalizeBarcode, SCANNED_TYPES } from './barcode';
import { FrozenFrame } from './FrozenFrame';
import { overlayInk } from './overlay';
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
  const foldMs = motion.ms('draw');
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
    fold.value = withTiming(shutterActive ? 1 : 0, {
      duration: shutterActive ? foldMs : unfoldMs,
    });
  }, [shutterActive, fold, foldMs, unfoldMs]);

  const foldingRect = shutterActive ? heldReticle.current : reticle;
  const foldingKey = shutterActive ? heldReticleKey.current : reticleKey;
  const showReticle = stage.width > 0 && (framing || Boolean(photoUri));

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
        <Reticle
          rect={foldingRect}
          keyed={foldingKey}
          fold={fold}
          targetSide={characterSideForAnchor(foldingRect)}
        />
      )}
    </View>
  );
}

/* ---------------------------------------------------------------- reticle */

/**
 * Four hand-drawn corner marks around whatever the anchor currently is. They
 * carry no meaning of their own — the framing sentence beneath the frame is
 * what a screen reader hears — so the canvas is hidden from accessibility.
 */
function Reticle({
  rect,
  keyed,
  fold,
  targetSide,
}: {
  rect: Rect;
  keyed: string;
  fold: SharedValue<number>;
  targetSide: number;
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

  const collapse = useDerivedValue(() => [
    {
      scaleX: interpolate(
        fold.value,
        [0, 1],
        [1, targetSide / Math.max(1, rect.width)],
        Extrapolation.CLAMP,
      ),
    },
    {
      scaleY: interpolate(
        fold.value,
        [0, 1],
        [1, targetSide / Math.max(1, rect.height)],
        Extrapolation.CLAMP,
      ),
    },
  ]);

  const opacity = useDerivedValue(() =>
    interpolate(fold.value, [0, 0.7, 1], [0.85, 0.72, 0], Extrapolation.CLAMP),
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
