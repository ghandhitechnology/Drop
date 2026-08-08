import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { duration, spring, type DurationName, type SpringName } from './motion';
import { usePreferences } from './preferences';

/**
 * Tracks the OS reduce-motion setting, live.
 */
function useSystemReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setEnabled(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setEnabled,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}

export type Motion = {
  /** True when animation should be minimised. */
  reduceMotion: boolean;
  /**
   * Duration for a named intent, collapsed to 0 under reduced motion so the
   * state change still happens — it just happens immediately.
   */
  ms: (name: DurationName) => number;
  /**
   * Spring config for a named intent. Under reduced motion the spring is made
   * critically damped and stiff, which lands on the target with no overshoot.
   */
  springOf: (name: SpringName) => { damping: number; stiffness: number; mass: number };
};

/**
 * Motion policy for the app. Honours the OS reduce-motion setting and the
 * in-app override, and always preserves the end state of a transition.
 */
export function useMotion(): Motion {
  const system = useSystemReduceMotion();
  const preference = usePreferences((s) => s.motion);

  const reduceMotion =
    preference === 'system' ? system : preference === 'reduced';

  return {
    reduceMotion,
    ms: (name) => (reduceMotion ? 0 : duration[name]),
    springOf: (name) =>
      reduceMotion
        ? { damping: 100, stiffness: 400, mass: 1 }
        : spring[name],
  };
}

/** Read and change the motion preference. */
export function useMotionPreference() {
  const preference = usePreferences((s) => s.motion);
  const setMotion = usePreferences((s) => s.setMotion);
  return { preference, setMotion };
}
