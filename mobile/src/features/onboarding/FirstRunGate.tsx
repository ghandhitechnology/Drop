/**
 * The one decision made before the camera renders.
 *
 * The camera route asks for the flag and holds a plain ground until the answer
 * comes back. That wait is a single indexed SQLite read on an already-warm
 * connection — a frame or two — and holding it matters: mounting `CameraStage`
 * first would light the sensor and raise the permission screen behind the
 * welcome that exists to explain it.
 *
 * The held frame is the theme's own background, so it is indistinguishable from
 * the splash that just faded and from the screen that follows it.
 */
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';

import { useColors } from '../../design/theme';
import { useFirstRun } from './firstRun';

export function FirstRunGate({ children }: { children: ReactNode }) {
  const colors = useColors();
  const status = useFirstRun((s) => s.status);
  const load = useFirstRun((s) => s.load);

  useEffect(() => {
    load();
  }, [load]);

  if (status === 'unknown') {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  if (status === 'pending') {
    return <Redirect href="/onboarding" />;
  }

  return <>{children}</>;
}
