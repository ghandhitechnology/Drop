import { Canvas, Circle, Skia } from '@shopify/react-native-skia';
import { useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useMotion } from '../../design/useMotion';
import { seedFromString } from '../../drawing/seededRandom';
import { HandPath } from '../../drawing/HandPath';
import { Touch } from '../../ui/Touch';
import { copy } from '../../lib/copy';
import { tapSelection, tapShutter } from '../../lib/haptics';
import { overlayInk } from './overlay';

/** Drawn size. Comfortably past the 48dp floor, and reachable with one thumb. */
export const SHUTTER_SIZE = 76;

const RING_RADIUS = SHUTTER_SIZE / 2 - 5;
const DISC_RADIUS = SHUTTER_SIZE / 2 - 14;
const CENTER = SHUTTER_SIZE / 2;

export type ShutterProps = {
  onPress: () => void;
  onToggleFast: () => void;
  fast: boolean;
  /** Quiet while the pipeline is working, so one photo does not become three. */
  disabled?: boolean;
};

/**
 * The one control that matters.
 *
 * A hand-drawn ring around a solid disc: the ring carries Drop's pencil line,
 * the disc carries the contrast. Pressing gives a medium impact tick before the
 * shutter fires, so the frame feels taken the instant the thumb lands.
 */
export function Shutter({
  onPress,
  onToggleFast,
  fast,
  disabled = false,
}: ShutterProps) {
  const motion = useMotion();
  const press = useSharedValue(0);
  const didLongPress = useRef(false);

  const ring = useMemo(
    () => Skia.PathBuilder.Make().addCircle(CENTER, CENTER, RING_RADIUS).detach(),
    [],
  );

  const fastRing = useMemo(
    () => Skia.PathBuilder.Make().addCircle(CENTER, CENTER, RING_RADIUS - 5).detach(),
    [],
  );

  const discStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.12 }],
  }));

  const handlePressIn = useCallback(() => {
    didLongPress.current = false;
    press.value = withSpring(1, motion.springOf('card'));
  }, [press, motion]);

  const handlePressOut = useCallback(() => {
    press.value = withSpring(0, motion.springOf('card'));
  }, [press, motion]);

  const toggleFast = useCallback(() => {
    didLongPress.current = true;
    tapSelection();
    onToggleFast();
  }, [onToggleFast]);

  const handlePress = useCallback(() => {
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    tapShutter();
    onPress();
  }, [onPress]);

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'toggleFast') toggleFast();
    },
    [toggleFast],
  );

  return (
    <Touch
      onPress={handlePress}
      onLongPress={toggleFast}
      delayLongPress={500}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      pressedOpacity={0.85}
      // The shutter draws its own, deeper press into the disc and fires its own,
      // heavier tick — so the house press-in is stood down for this one control.
      pressedScale={1}
      haptic="none"
      accessibilityLabel={copy.capture.shutter}
      accessibilityHint={copy.capture.shutterHint}
      accessibilityActions={[{ name: 'toggleFast', label: copy.capture.toggleFast }]}
      onAccessibilityAction={handleAccessibilityAction}
      accessibilityState={{ disabled, selected: fast }}
      style={[styles.touch, disabled ? styles.quiet : styles.full]}
    >
      <View style={styles.halo} />
      <Animated.View style={[StyleSheet.absoluteFill, discStyle]}>
        <Canvas
          style={styles.canvas}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          <Circle cx={CENTER} cy={CENTER} r={DISC_RADIUS} color={overlayInk.shutterFill} />
          <HandPath
            path={ring}
            color={overlayInk.mark}
            variant="crayon"
            seed={seedFromString('capture/shutter')}
            strokeScale={1.15}
          />
          {/* Fast mode is a second ring pulled just inside the first — the way
              a hand rings something it means twice. Nothing moves position, so
              the shutter stays exactly where the thumb learned it was. */}
          {fast && (
            <HandPath
              path={fastRing}
              color={overlayInk.mark}
              variant="crayon"
              seed={seedFromString('capture/shutter-fast')}
              strokeScale={0.9}
            />
          )}
        </Canvas>
      </Animated.View>
    </Touch>
  );
}

const styles = StyleSheet.create({
  touch: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quiet: { opacity: 0.45 },
  full: { opacity: 1 },
  halo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: SHUTTER_SIZE / 2,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  canvas: { width: SHUTTER_SIZE, height: SHUTTER_SIZE },
});
