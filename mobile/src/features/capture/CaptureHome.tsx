import type { CameraView } from 'expo-camera';
import { useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../design/theme';
import { radius, space } from '../../design/tokens';
import { copy } from '../../lib/copy';
import { ResultStage } from '../result/ResultStage';
import { SketchButton } from '../../ui/SketchButton';
import { SketchLink } from '../../ui/SketchLink';
import { Text } from '../../ui/Text';
import { CameraStage, useTakePhoto, type StageSize } from './CameraStage';
import { FramingNote } from './FramingNote';
import { CHIP_HEIGHT, HandChip, HandChipStatic } from './HandChip';
import { overlayInk } from './overlay';
import { PermissionPrompt } from './PermissionPrompt';
import { Shutter } from './Shutter';
import { type CaptureState } from './types';
import { useCaptureMachine } from './useCaptureMachine';

/** At and above this width the camera shares the screen instead of owning it. */
export const TABLET_BREAKPOINT = 768;

/** Share of the width the camera keeps on a tablet. */
const CAMERA_SHARE = 0.62;

/**
 * Height of the row the two doors own, measured from the safe area down.
 *
 * `SettingsTab` and `HistoryTab` each hang a drawn chip under `space.md` of
 * padding, at the two ends of the same row. The barcode hint takes the row
 * beneath rather than sharing that one, so a code in frame is read instead of
 * read over. Kept here because this is the only place the three overlap.
 */
const DOOR_ROW = space.md + CHIP_HEIGHT;

/** True while the camera is live and waiting to be pointed at something. */
function isFraming(state: CaptureState): boolean {
  return state.name === 'idle' || state.name === 'framing';
}

/**
 * Camera home.
 *
 * One screen, one camera, one shutter. Everything else — the barcode hint, the
 * status line, the result — arrives over the same frame rather than replacing
 * it, so a capture never feels like leaving the viewfinder.
 */
export function CaptureHome() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const router = useRouter();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [stage, setStage] = useState<StageSize>({ width: 0, height: 0 });
  const [shutterActive, setShutterActive] = useState(false);

  const state = useCaptureMachine((s) => s.state);
  const mode = useCaptureMachine((s) => s.mode);
  const toggleFastMode = useCaptureMachine((s) => s.toggleFastMode);
  const retake = useCaptureMachine((s) => s.retake);

  const beginShutter = useCallback(() => setShutterActive(true), []);
  const resetShutter = useCallback(() => setShutterActive(false), []);
  const takePhoto = useTakePhoto(cameraRef, stage, beginShutter, resetShutter);

  // A retake starts a fresh framing run, including a fresh reticle.
  useEffect(() => {
    if (state.name === 'framing') setShutterActive(false);
  }, [state.name]);

  const handleStageSize = useCallback((size: StageSize) => {
    setStage((current) =>
      current.width === size.width && current.height === size.height ? current : size,
    );
  }, []);

  const openSearch = useCallback(() => router.push('/search'), [router]);

  if (!permission) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.bg }]}>
        <Text variant="body" tone="inkSoft">
          {copy.permission.checking}
        </Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <PermissionPrompt
        mode={permission.canAskAgain ? 'ask' : 'settings'}
        onRequest={requestPermission}
      />
    );
  }

  const isTablet = width >= TABLET_BREAKPOINT;
  // The controls belong to a live frame only. The moment one is held they hand
  // the spot over: the character stands where the shutter was and says from
  // there what it is doing with the photo.
  const showControls = isFraming(state);
  const barcodeHint = state.name === 'framing' ? state.barcodeHint : undefined;

  const cameraColumn = (
    <View style={[styles.column, isTablet && { flex: CAMERA_SHARE }]}>
      <CameraStage
        cameraRef={cameraRef}
        stage={stage}
        onStageSize={handleStageSize}
        shutterActive={shutterActive}
      />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none" edges={['top', 'bottom']}>
        {barcodeHint && (
          <View style={styles.hintRow} pointerEvents="none">
            <HandChipStatic seed="capture/barcode">
              <Text variant="chip" tone={overlayInk.mark}>
                {copy.capture.barcodeReady}
              </Text>
              <Text variant="chip" tone={overlayInk.markSoft}>
                {copy.capture.barcodeValue(barcodeHint.value)}
              </Text>
            </HandChipStatic>
          </View>
        )}

        <View style={styles.spacer} pointerEvents="none" />

        {showControls && (
          <View style={styles.controls} pointerEvents="box-none">
            <FramingNote>
              {mode === 'fast' ? copy.capture.framingFast : copy.capture.framing}
            </FramingNote>

            <View style={styles.controlRow} pointerEvents="box-none">
              <HandChip
                seed="capture/find-by-name"
                onPress={openSearch}
                style={styles.secondary}
                accessibilityLabel={copy.capture.findByName}
                accessibilityHint={copy.capture.findByNameHint}
              >
                <Text variant="label" tone={overlayInk.mark}>
                  {copy.capture.findByName}
                </Text>
              </HandChip>

              <Shutter
                onPress={takePhoto}
                onToggleFast={toggleFastMode}
                fast={mode === 'fast'}
                disabled={shutterActive}
              />
            </View>
          </View>
        )}

        {state.name === 'unresolved' && (
          <View style={styles.sheet} pointerEvents="box-none">
            <View style={[styles.card, { backgroundColor: colors.paper, borderColor: colors.inkFaint }]}>
              <Text variant="title" tone="ink">
                {copy.unresolved.title}
              </Text>
              <Text variant="body" tone="inkSoft">
                {copy.unresolved.body}
              </Text>
              <SketchButton
                onPress={openSearch}
                seed="capture/unresolved/search"
                filled
                radius={radius.pill}
                style={styles.action}
                contentStyle={styles.actionContent}
                accessibilityLabel={copy.unresolved.action}
              >
                <Text variant="label" tone="accent">
                  {copy.unresolved.action}
                </Text>
              </SketchButton>
              <SketchLink
                onPress={retake}
                seed="capture/unresolved/retake"
                tone="inkSoft"
                style={styles.retake}
                accessibilityLabel={copy.capture.retake}
              >
                {copy.capture.retake}
              </SketchLink>
            </View>
          </View>
        )}

      </SafeAreaView>

      {/*
        The signature expansion owns everything from the frozen frame onward.
        It sits above the overlay and in the same coordinate space as the
        camera, because the result grows out of the anchor the shutter measured.
      */}
      <ResultStage stage={stage} />
    </View>
  );

  if (!isTablet) {
    return <View style={[styles.root, { backgroundColor: colors.bg }]}>{cameraColumn}</View>;
  }

  return (
    <View style={[styles.root, styles.split, { backgroundColor: colors.bg }]}>
      {cameraColumn}
      {/* Reserved for the running record. The Signature and History phases fill it. */}
      <View
        style={[styles.panel, { backgroundColor: colors.bg, borderColor: colors.inkFaint }]}
        accessible={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  split: { flexDirection: 'row' },
  center: { alignItems: 'center', justifyContent: 'center' },
  column: { flex: 1 },
  panel: { flex: 1 - CAMERA_SHARE, borderLeftWidth: 1 },

  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  spacer: { flex: 1 },

  hintRow: { alignItems: 'center', paddingTop: DOOR_ROW + space.md },

  controls: { alignItems: 'center', gap: space.lg, paddingBottom: space.xl },
  // The shutter is centred on the frame; the secondary control is pinned to the
  // bottom-left so it never shifts the shutter off centre as its label changes.
  controlRow: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: space.xl,
  },
  secondary: { position: 'absolute', left: space.xl, bottom: 0 },

  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '86%' },
  sheetContent: { padding: space.lg, justifyContent: 'flex-end', flexGrow: 1 },
  card: {
    margin: space.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.md,
  },
  action: { minHeight: 56 },
  actionContent: { minHeight: 56 },
  retake: { minHeight: 48, alignItems: 'center' },
});
