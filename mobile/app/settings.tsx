import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { SettingsScreen } from '../src/features/settings/SettingsScreen';

/**
 * Settings, as a modal over wherever it was opened from.
 *
 * Modal rather than a pushed screen because nothing here belongs to a place in
 * the product's hierarchy — it is a detour from the camera that ends by putting
 * the person back on the camera. Dismissing by swipe, by the system Back
 * gesture, or by Done all end the same way.
 */
export default function Settings() {
  const router = useRouter();

  const done = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  return <SettingsScreen onDone={done} />;
}
