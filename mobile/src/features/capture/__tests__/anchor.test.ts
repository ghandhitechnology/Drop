import { describe, expect, it } from 'vitest';

import { characterSideForAnchor } from '../anchor';

describe('characterSideForAnchor', () => {
  it('lands a normal capture just inside its framing square', () => {
    expect(
      characterSideForAnchor({ x: 20, y: 40, width: 160, height: 160 }),
    ).toBeCloseTo(147.2);
  });

  it('keeps small barcode anchors large enough to hold the character', () => {
    expect(characterSideForAnchor({ x: 0, y: 0, width: 56, height: 80 })).toBe(108);
  });

  it('caps large framing squares so the character remains compact', () => {
    expect(characterSideForAnchor({ x: 0, y: 0, width: 400, height: 400 })).toBe(176);
  });
});
