import { useCallback, useState } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { MIN_TOUCH_SIZE } from '../design/tokens';
import { useMotion } from '../design/useMotion';
import { haptics, type HapticName } from '../lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type TouchProps = Omit<PressableProps, 'style'> & {
  style?: ViewStyle | ViewStyle[];
  /** Opacity applied while pressed. */
  pressedOpacity?: number;
  /** Scale applied while pressed. */
  pressedScale?: number;
  /**
   * Which vibration the press makes. `'press'` is the house default; a control
   * that fires its own, louder note on the way out passes `'none'` so the two
   * do not stack into a double buzz.
   */
  haptic?: HapticName | 'none';
};

/**
 * Pressable with a guaranteed 48dp touch target and press-in feedback.
 *
 * Small visual controls (an icon, a thin chip) keep their drawn size but grow
 * their *touchable* area outward via hitSlop, measured from real layout. This
 * keeps the sketch-like visual language from producing targets a thumb misses.
 *
 * Feedback happens on the way *down*, not on release: the control settles under
 * the finger the moment it lands, and the tick arrives with it. Both come from
 * here rather than from each call site, so nothing in the product can ship a
 * control that only answers once it has already been let go of.
 *
 * The settle is a spring, which under reduced motion is made critically damped
 * and lands on the pressed size immediately — the state change survives, only
 * the travel is removed.
 */
export function Touch({
  style,
  pressedOpacity = 0.82,
  pressedScale = 0.97,
  haptic = 'press',
  disabled,
  onPressIn,
  onPressOut,
  onLayout,
  accessibilityRole = 'button',
  ...rest
}: TouchProps) {
  const motion = useMotion();
  const [slop, setSlop] = useState({ top: 0, bottom: 0, left: 0, right: 0 });
  const press = useSharedValue(0);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      const horizontal = Math.max(0, (MIN_TOUCH_SIZE - width) / 2);
      const vertical = Math.max(0, (MIN_TOUCH_SIZE - height) / 2);
      setSlop((current) =>
        current.left === horizontal && current.top === vertical
          ? current
          : {
              top: vertical,
              bottom: vertical,
              left: horizontal,
              right: horizontal,
            },
      );
      onLayout?.(event);
    },
    [onLayout],
  );

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      press.value = withSpring(1, motion.springOf('card'));
      if (haptic !== 'none') haptics[haptic]();
      onPressIn?.(event);
    },
    [press, motion, haptic, onPressIn],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      press.value = withSpring(0, motion.springOf('card'));
      onPressOut?.(event);
    },
    [press, motion, onPressOut],
  );

  const feedback = useAnimatedStyle(() => ({
    opacity: 1 - press.value * (1 - pressedOpacity),
    transform: [{ scale: 1 - press.value * (1 - pressedScale) }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      hitSlop={slop}
      disabled={disabled}
      onLayout={handleLayout}
      onPressIn={disabled ? undefined : handlePressIn}
      onPressOut={disabled ? undefined : handlePressOut}
      style={[style, disabled ? undefined : feedback]}
      {...rest}
    />
  );
}
