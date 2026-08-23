import { describe, expect, it } from 'vitest';

import { capturePermissionSurface, permissionPromptModel } from '../permission';
import type { CaptureStateName } from '../types';

describe('camera permission alternatives', () => {
  it.each(['ask', 'settings'] as const)(
    'keeps the labelled manual catalogue path available in %s mode',
    (mode) => {
      const prompt = permissionPromptModel(mode);

      expect(prompt.manual).toEqual({
        label: 'Find by name',
        hint: 'Search the catalogue instead of using the camera',
        destination: 'catalogue',
      });
      expect(prompt.primary.label).not.toBe(prompt.manual.label);
    },
  );

  it('sends the primary action to the correct permission surface', () => {
    expect(permissionPromptModel('ask').primary.destination).toBe('request');
    expect(permissionPromptModel('settings').primary.destination).toBe('settings');
  });
});

describe('camera permission gate', () => {
  it('shows the camera whenever access is granted', () => {
    expect(capturePermissionSurface(true, 'framing')).toBe('camera');
    expect(capturePermissionSurface(true, 'presenting')).toBe('camera');
  });

  it('shows the prompt before a denied-permission manual run starts', () => {
    expect(capturePermissionSurface(false, 'idle')).toBe('prompt');
    expect(capturePermissionSurface(false, 'framing')).toBe('prompt');
  });

  it('keeps every post-capture state visible without mounting the camera', () => {
    const manualStates: CaptureStateName[] = [
      'captured',
      'recognizing',
      'analyzing',
      'presenting',
      'expanded',
      'adjusting',
      'confirmed',
      'plating',
      'plateConfirmed',
      'unresolved',
      'limited',
    ];

    expect(manualStates.map((state) => capturePermissionSurface(false, state))).toEqual(
      manualStates.map(() => 'manual-run'),
    );
  });
});
