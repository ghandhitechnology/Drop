import { describe, expect, it } from 'vitest';
import { parseLabelQuantity } from '../src/routes/barcode';

describe('parseLabelQuantity', () => {
  it('passes grams through unchanged', () => {
    expect(parseLabelQuantity(150, 'g')).toEqual({ value: 150, unit: 'g' });
  });

  it('passes millilitres through unchanged', () => {
    expect(parseLabelQuantity(330, 'ml')).toEqual({ value: 330, unit: 'ml' });
  });

  it('converts centilitres to millilitres (x10, not /100)', () => {
    expect(parseLabelQuantity(33, 'cl')).toEqual({ value: 330, unit: 'ml' });
  });

  it('passes litres through unchanged', () => {
    expect(parseLabelQuantity(1.5, 'l')).toEqual({ value: 1.5, unit: 'l' });
  });

  it('is case-insensitive on the unit', () => {
    expect(parseLabelQuantity(33, 'CL')).toEqual({ value: 330, unit: 'ml' });
  });
});
