import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { OnboardingFlow } from '../src/features/onboarding/OnboardingFlow';

/**
 * The first run.
 *
 * Reached only from the camera route, which redirects here while the first-run
 * flag is unset. Leaving it always `replace`s rather than pushes, so the
 * welcome is off the stack the moment it is done and the system Back gesture
 * from the camera never walks back into it.
 */
export default function Onboarding() {
  const router = useRouter();

  const done = useCallback(() => router.replace('/'), [router]);

  return <OnboardingFlow onDone={done} />;
}
