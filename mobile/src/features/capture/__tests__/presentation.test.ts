import { describe, expect, it } from 'vitest';

import {
  isTabletCaptureViewport,
  tabletCapturePhase,
} from '../presentation';
import type { CaptureStateName } from '../types';

describe('capture viewport', () => {
  it('uses the tablet continuation in either tablet orientation', () => {
    expect(isTabletCaptureViewport({ width: 768, height: 1024 })).toBe(true);
    expect(isTabletCaptureViewport({ width: 1024, height: 768 })).toBe(true);
  });

  it('keeps a rotated phone in the compact capture layout', () => {
    expect(isTabletCaptureViewport({ width: 932, height: 430 })).toBe(false);
  });
});

describe('tablet capture phase', () => {
  it('covers every capture state with a visible continuation', () => {
    const states: CaptureStateName[] = [
      'idle',
      'framing',
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

    expect(states.map(tabletCapturePhase)).toEqual([
      'ready',
      'ready',
      'reading',
      'reading',
      'reading',
      'review',
      'review',
      'review',
      'saved',
      'review',
      'saved',
      'recover',
      'recover',
    ]);
  });
});
