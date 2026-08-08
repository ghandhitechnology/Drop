/* eslint-disable no-console */
import { Canvas, Skia } from '@shopify/react-native-skia';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { seedFromString } from '../../drawing/seededRandom';
import { HandPath } from '../../drawing/HandPath';
import { anchorFor } from './anchor';
import { normalizeBarcode, SCANNED_TYPES } from './barcode';
import { FrozenFrame } from './FrozenFrame';
import { overlayInk } from './overlay';
import { isResultVisible, photoUriOf, type Rect } from './types';
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
};

/**
 * The viewfinder.
 *
 * The camera mounts once and stays mounted for the whole run — through
 * capture, through the result, through confirmation. Freezing is a held photo
 * drawn on top, never an unmount, so returning to a live frame costs nothing
 * and the preview never has to warm up twice.
 */
export function CameraStage({ cameraRef, stage, onStageSize }: CameraStageProps) {
  const lingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          dimmed={isResultVisible(state)}
        />
      )}

      {framing && stage.width > 0 && (
        <Reticle rect={reticle} keyed={hint?.gtin14 ?? 'center'} />
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
function Reticle({ rect, keyed }: { rect: Rect; keyed: string }) {
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

  return (
    <Canvas
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <HandPath
        path={path}
        color={overlayInk.mark}
        variant="pencil"
        seed={seedFromString(`capture/reticle/${keyed}`)}
        strokeScale={1.3}
        opacity={0.85}
      />
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
    try {
      const photo = await camera.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) capture(photo.uri, anchor);
    } catch (error) {
      console.log('[capture] shutter', error);
    } finally {
      busy.current = false;
    }
  }, [cameraRef, stage, capture]);
}

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: 'hidden', backgroundColor: '#000000' },
});
