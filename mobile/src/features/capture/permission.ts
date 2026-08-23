import { copy } from '../../lib/copy';
import type { CaptureStateName } from './types';

export type PermissionPromptMode = 'ask' | 'settings';

export type PermissionPromptModel = {
  primary: {
    label: string;
    destination: 'request' | 'settings';
  };
  manual: {
    label: string;
    hint: string;
    destination: 'catalogue';
  };
};

/**
 * Every camera permission state exposes the local catalogue as a peer action.
 * The descriptor is shared by the UI and tests so the accessible fallback
 * cannot disappear behind permission branching again.
 */
export function permissionPromptModel(mode: PermissionPromptMode): PermissionPromptModel {
  const words = mode === 'ask' ? copy.permission.ask : copy.permission.settings;
  return {
    primary: {
      label: words.action,
      destination: mode === 'ask' ? 'request' : 'settings',
    },
    manual: {
      label: copy.capture.findByName,
      hint: copy.capture.findByNameHint,
      destination: 'catalogue',
    },
  };
}

export type CapturePermissionSurface = 'camera' | 'prompt' | 'manual-run';

/**
 * Permission gates the camera, not the shared workflow after a catalogue pick.
 * A manual run has no photo to reveal and must remain visible through review
 * and confirmation even while camera access is denied.
 */
export function capturePermissionSurface(
  granted: boolean,
  state: CaptureStateName,
): CapturePermissionSurface {
  if (granted) return 'camera';
  return state === 'idle' || state === 'framing' ? 'prompt' : 'manual-run';
}
