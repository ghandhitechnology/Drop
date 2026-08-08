import { useEffect } from 'react';
import { View } from 'react-native';

import { startFactorSync } from '../src/data/sync';
import { CaptureHome } from '../src/features/capture/CaptureHome';
import { installRealPipeline } from '../src/features/capture/pipeline';
import { HistoryTab } from '../src/features/history/HistoryTab';
import { FirstRunGate } from '../src/features/onboarding/FirstRunGate';
import { startPreferencePersistence } from '../src/features/settings/persist';
import { SettingsTab } from '../src/features/settings/SettingsTab';

/**
 * Home is the camera. Everything else in Drop is reached from it.
 *
 * The recognition seam is bound here, once, before the first frame renders.
 * `installRealPipeline` points the capture machine at the wired run: the
 * service names what is in the photo, and every number is computed on the
 * device by the engine against the factor tables in the bundle. A catalogue
 * pick takes the same path with the naming step already answered, which is why
 * a search result and a photo produce byte-identical output.
 *
 * Two things are layered over the camera: the way into the record on the right,
 * and the way into settings on the left. Both sit here rather than inside
 * `CaptureHome` so the viewfinder keeps owning nothing but the capture, and
 * both hide themselves whenever a result is on screen.
 *
 * `FirstRunGate` wraps the lot. On a first launch it redirects to the welcome
 * before the camera mounts, so the permission screen never appears in front of
 * the sentence that exists to explain it.
 */
installRealPipeline();

export default function Home() {
  // Boot work, none of it on the critical path. Preferences hydrate a frame or
  // two behind the first render; the factors check waits three seconds and then
  // asks at most once a day.
  useEffect(() => {
    startPreferencePersistence().catch(() => {});
    return startFactorSync();
  }, []);

  return (
    <FirstRunGate>
      <View style={{ flex: 1 }}>
        <CaptureHome />
        <SettingsTab />
        <HistoryTab />
      </View>
    </FirstRunGate>
  );
}
