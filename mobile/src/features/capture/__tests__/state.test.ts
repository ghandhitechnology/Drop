import { describe, expect, it } from 'vitest';

import {
  acceptsCapture,
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

describe('acceptsCapture', () => {
  const estimate = { display_name: 'Apple' } as never;

  it('takes a photo from a live frame, with or without a code in it', () => {
    expect(acceptsCapture({ name: 'idle' })).toBe(true);
    expect(acceptsCapture({ name: 'framing' })).toBe(true);
    expect(
      acceptsCapture({
        name: 'framing',
        barcodeHint: {
          symbology: 'ean13',
          value: '4006381333931',
          gtin14: '04006381333931',
          bounds: null,
        },
      }),
    ).toBe(true);
  });

  it('refuses once a frame is held, all the way through the run', () => {
    const held = { photoUri: 'file://capture.jpg', anchor };
    const refused: CaptureState[] = [
      { name: 'captured', ...held },
      { name: 'recognizing', ...held },
      { name: 'analyzing', ...held, item: { catalog_id: 'food.apple', display_name: 'Apple' } },
      { name: 'presenting', ...held, estimate },
      { name: 'expanded', ...held, estimate },
      { name: 'adjusting', ...held, estimate },
      { name: 'confirmed', ...held, estimate, entryId: 'e1' },
      { name: 'plating', ...held, items: [], dismissed: [], queued: [] },
      { name: 'unresolved', ...held },
    ];

    for (const state of refused) {
      expect(acceptsCapture(state), state.name).toBe(false);
    }
  });
});
