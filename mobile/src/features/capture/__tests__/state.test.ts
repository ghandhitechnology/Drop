import { describe, expect, it } from 'vitest';

import {
  anchorOf,
  isFrameObscured,
  photoUriOf,
  type CaptureState,
  type Rect,
} from '../types';

const anchor: Rect = { x: 24, y: 80, width: 180, height: 180 };

describe('held frame state', () => {
  it('keeps the original photo and anchor when recognition is unresolved', () => {
    const state: CaptureState = {
      name: 'unresolved',
      photoUri: 'file://capture.jpg',
      anchor,
    };

    expect(photoUriOf(state)).toBe('file://capture.jpg');
    expect(anchorOf(state)).toEqual(anchor);
  });

  it('keeps the full frame obscured through analysis and recovery', () => {
    const analyzing: CaptureState = {
      name: 'analyzing',
      photoUri: 'file://capture.jpg',
      anchor,
      item: {
        catalog_id: 'food.apple',
        display_name: 'Apple',
      },
    };
    const unresolved: CaptureState = {
      name: 'unresolved',
      photoUri: 'file://capture.jpg',
      anchor,
    };

    expect(isFrameObscured(analyzing)).toBe(true);
    expect(isFrameObscured(unresolved)).toBe(true);
    expect(isFrameObscured({ name: 'framing' })).toBe(false);
  });
});
