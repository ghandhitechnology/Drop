/**
 * Reading the service's answers.
 *
 * The interesting cases are all the same shape: something arrives half-formed,
 * and the question is whether Drop passes it on or drops it. Dropping is
 * almost always right — a quantity with no unit sends the engine to the
 * catalogue's published serving, which is a real figure, where passing it on
 * would produce a number assembled out of two different answers.
 */
import { describe, expect, it } from 'vitest';

import { ApiError } from '../errors';
import {
  asCategory,
  asUnit,
  readBarcode,
  readCandidate,
  readQuantity,
  readRecognize,
  readResearch,
} from '../normalize';

/* ---------------------------------------------------------------- fixtures */

const RECOGNIZE_BODY = {
  request_id: 'rec_66e18f8f1240',
  model: 'openai/gpt-5.6-luna',
  catalog_version: '2026.08.1',
  candidates: [
    { catalog_id: 'apple', display_name: 'Apple', category: 'food', score: 0.42, reason: 'round, red', repaired: false },
    { catalog_id: 'banana', display_name: 'Banana', category: 'food', score: 0.81, reason: 'yellow', repaired: false },
    { catalog_id: 'tomato', display_name: 'Tomato', category: 'food', score: 0.2, reason: 'text match', repaired: true },
  ],
  quantity: { value: 120, unit: 'g', basis: 'vision_estimate', evidence: 'one fruit in hand' },
  detected_text: ['Chiquita', 7],
  unmatched: false,
};

const BARCODE_HIT = {
  ean: '3017620422003',
  catalog_version: '2026.08.1',
  off: { status: 'found', product_name: 'Nutella', brands: 'Ferrero', quantity: '400 g', last_modified_t: 1773746785 },
  mapping: {
    catalog_id: 'generic_agricultural_processed_sweets',
    match_level: 'llm_assisted',
    confidence: 'medium',
    evidence: ['LLM mapping from product name and OFF tags'],
  },
  quantity: { value: 400, unit: 'g', basis: 'package_label', confidence: 'high' },
  coverage_miss: false,
};

/* -------------------------------------------------------------- vocabulary */

describe('vocabulary', () => {
  it('accepts the four categories and rejects everything else', () => {
    expect(asCategory('food')).toBe('food');
    expect(asCategory('transport')).toBe('transport');
    expect(asCategory('beverage')).toBeNull();
    expect(asCategory(3)).toBeNull();
  });

  it('accepts the units the engine takes', () => {
    for (const unit of ['g', 'kg', 'ml', 'l', 'km', 'usd', 'item']) {
      expect(asUnit(unit)).toBe(unit);
    }
    expect(asUnit('oz')).toBeNull();
    expect(asUnit('litres')).toBeNull();
  });
});

/* ---------------------------------------------------------------- quantity */

describe('readQuantity', () => {
  it('keeps a complete amount and its basis', () => {
    expect(readQuantity({ value: 330, unit: 'ml', basis: 'package_label' })).toEqual({
      value: 330,
      unit: 'ml',
      basis: 'package_label',
      evidence: null,
    });
  });

  it('drops an amount whose unit it cannot use', () => {
    expect(readQuantity({ value: 8, unit: 'oz', basis: 'vision_estimate' })).toBeNull();
  });

  it('drops a missing, zero, negative, or non-finite amount', () => {
    expect(readQuantity({ unit: 'g', basis: 'vision_estimate' })).toBeNull();
    expect(readQuantity({ value: 0, unit: 'g', basis: 'vision_estimate' })).toBeNull();
    expect(readQuantity({ value: -5, unit: 'g', basis: 'vision_estimate' })).toBeNull();
    expect(readQuantity({ value: Number.NaN, unit: 'g', basis: 'vision_estimate' })).toBeNull();
    expect(readQuantity({ value: Number.POSITIVE_INFINITY, unit: 'g', basis: 'vision_estimate' })).toBeNull();
  });

  it('treats an unrecognised basis as a reading of the frame, never of a label', () => {
    // A label reading raises the engine's confidence cap. Anything Drop is
    // unsure about has to fall on the cautious side of that line.
    expect(readQuantity({ value: 1, unit: 'kg', basis: 'guess' })?.basis).toBe('vision_estimate');
    expect(readQuantity({ value: 1, unit: 'kg' })?.basis).toBe('vision_estimate');
  });

  it('reads nothing out of a non-object', () => {
    expect(readQuantity(null)).toBeNull();
    expect(readQuantity('330 ml')).toBeNull();
  });
});

/* --------------------------------------------------------------- candidate */

describe('readCandidate', () => {
  it('falls back to the id when the service sends no display name', () => {
    const read = readCandidate({ catalog_id: 'apple', category: 'food', score: 0.5 });
    expect(read?.display_name).toBe('apple');
  });

  it('clamps a score into 0–1', () => {
    expect(readCandidate({ catalog_id: 'a', category: 'food', score: 4 })?.score).toBe(1);
    expect(readCandidate({ catalog_id: 'a', category: 'food', score: -2 })?.score).toBe(0);
    expect(readCandidate({ catalog_id: 'a', category: 'food' })?.score).toBe(0);
  });

  it('drops a candidate with no id or no category', () => {
    expect(readCandidate({ category: 'food', score: 1 })).toBeNull();
    expect(readCandidate({ catalog_id: 'apple', score: 1 })).toBeNull();
  });
});

/* --------------------------------------------------------------- recognize */

describe('readRecognize', () => {
  it('sorts candidates best-first whatever order they arrive in', () => {
    const read = readRecognize(RECOGNIZE_BODY);
    expect(read.candidates.map((c) => c.catalog_id)).toEqual(['banana', 'apple', 'tomato']);
    expect(read.candidates[0].score).toBe(0.81);
  });

  it('keeps only the strings out of detected_text', () => {
    expect(readRecognize(RECOGNIZE_BODY).detected_text).toEqual(['Chiquita']);
  });

  it('calls itself unmatched when nothing usable came back, whatever the flag said', () => {
    const read = readRecognize({ ...RECOGNIZE_BODY, candidates: [], unmatched: false });
    expect(read.unmatched).toBe(true);
    expect(read.candidates).toEqual([]);
  });

  it('drops unreadable candidates and keeps the rest', () => {
    const read = readRecognize({
      ...RECOGNIZE_BODY,
      candidates: [{ score: 0.9 }, RECOGNIZE_BODY.candidates[1], null],
    });
    expect(read.candidates.map((c) => c.catalog_id)).toEqual(['banana']);
  });

  it('survives a body with nothing in it but an object', () => {
    const read = readRecognize({});
    expect(read.candidates).toEqual([]);
    expect(read.quantity).toBeNull();
    expect(read.unmatched).toBe(true);
  });

  it('refuses a body that is not an object at all', () => {
    expect(() => readRecognize('nope')).toThrow(ApiError);
    expect(() => readRecognize([])).toThrow(/not an object/);
  });

  it('refuses a candidates field that is not a list', () => {
    expect(() => readRecognize({ candidates: 'apple' })).toThrow(/not a list/);
  });
});

/* ----------------------------------------------------------------- barcode */

describe('readBarcode', () => {
  it('reads a hit whole, label quantity included', () => {
    const read = readBarcode(BARCODE_HIT, '3017620422003');
    expect(read.coverage_miss).toBe(false);
    expect(read.mapping.catalog_id).toBe('generic_agricultural_processed_sweets');
    expect(read.quantity).toEqual({
      value: 400,
      unit: 'g',
      basis: 'package_label',
      evidence: null,
    });
  });

  it('calls a mapping with no catalogue id a coverage miss, whatever the flag said', () => {
    const read = readBarcode(
      { ...BARCODE_HIT, mapping: { ...BARCODE_HIT.mapping, catalog_id: null }, coverage_miss: false },
      '3017620422003',
    );
    expect(read.coverage_miss).toBe(true);
  });

  it('honours a coverage miss even when an id came with it', () => {
    const read = readBarcode({ ...BARCODE_HIT, coverage_miss: true }, '3017620422003');
    expect(read.coverage_miss).toBe(true);
  });

  it('reads an unreachable lookup as unavailable rather than missing', () => {
    // The two mean different things: missing is an answer, unavailable is not.
    const read = readBarcode({ off: { status: 'sideways' }, mapping: {} }, '5000112637922');
    expect(read.off.status).toBe('unavailable');
    expect(read.ean).toBe('5000112637922');
    expect(read.coverage_miss).toBe(true);
  });

  it('keeps a label quantity even when the mapping found nothing', () => {
    // A Coca-Cola tin that maps to no entry still publishes its 330 ml, and
    // that number is worth keeping for whatever the photo resolves to.
    const read = readBarcode(
      {
        ean: '5449000000996',
        off: { status: 'found', product_name: 'coca-cola' },
        mapping: { catalog_id: null },
        quantity: { value: 330, unit: 'ml', basis: 'package_label' },
        coverage_miss: true,
      },
      '5449000000996',
    );
    expect(read.quantity?.value).toBe(330);
    expect(read.coverage_miss).toBe(true);
  });
});

/* ---------------------------------------------------------------- research */

describe('readResearch', () => {
  it('holds evidence apart from factors, whatever the wire claims', () => {
    const read = readResearch(
      {
        summary: 'Published figures cluster around 800 litres per kilogram.',
        evidence: [
          {
            claim: 'Apples average 822 L/kg',
            value: 822,
            unit: 'L/kg',
            source_title: 'The Water Footprint of Humanity',
            source_publisher: 'PNAS',
            year: 2012,
            reliability: 'peer_reviewed',
          },
        ],
        // A service that ever sent this true would still be read as false.
        may_be_used_as_factor: true,
      },
      'apple',
    );
    expect(read.may_be_used_as_factor).toBe(false);
    expect(read.status).toBe('unverified_evidence');
    expect(read.evidence).toHaveLength(1);
    expect(read.question).toBe('apple');
  });

  it('drops evidence with no claim and softens an unknown reliability', () => {
    const read = readResearch(
      { evidence: [{ source_title: 'x' }, { claim: 'a claim', reliability: 'vibes' }] },
      'apple',
    );
    expect(read.evidence).toHaveLength(1);
    expect(read.evidence[0].reliability).toBe('unclear');
  });
});
