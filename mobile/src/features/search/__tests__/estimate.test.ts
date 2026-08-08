/**
 * The engine call, with an amount that came from somewhere else.
 *
 * These run against the **real bundled factor tables**, not fixtures, because
 * the thing worth testing is exactly the collision between what a vision model
 * says it saw and what a catalogue entry will accept. A model that reads
 * "330 ml" off a tin of beans is producing a unit the tables measure by mass;
 * the engine refuses it, and this is the layer that has to notice and fall
 * back to a published serving rather than let the refusal reach the screen.
 */
import { describe, expect, it } from 'vitest';

import { getTables } from '../../../data/tables';
import { catalogEntry, estimateFor, servingFor } from '../estimate';

const tables = getTables();

describe('servingFor', () => {
  it('reads the catalogue serving, basis and all', () => {
    const serving = servingFor('banana');
    expect(serving).not.toBeNull();
    expect(serving!.value).toBeGreaterThan(0);
    expect(typeof serving!.basis).toBe('string');
  });

  it('has nothing to say about an id the catalogue does not hold', () => {
    expect(servingFor('unicorn_steak')).toBeNull();
    expect(catalogEntry('unicorn_steak')).toBeNull();
  });
});

describe('estimateFor', () => {
  it('runs the amount it was given', () => {
    const outcome = estimateFor({
      catalogId: 'banana',
      quantity: { value: 500, unit: 'g', basis: 'vision_estimate' },
      source: 'vision_estimate',
    });
    expect(outcome).not.toBeNull();
    expect(outcome!.usedServing).toBe(false);
    expect(outcome!.estimate.quantity.value).toBeCloseTo(0.5, 6);
    expect(outcome!.estimate.quantity.unit).toBe('kg');
    expect(outcome!.estimate.quantity.source).toBe('vision_estimate');
  });

  it('scales the headline with the amount', () => {
    const one = estimateFor({
      catalogId: 'banana',
      quantity: { value: 100, unit: 'g' },
      source: 'vision_estimate',
    })!;
    const four = estimateFor({
      catalogId: 'banana',
      quantity: { value: 400, unit: 'g' },
      source: 'vision_estimate',
    })!;
    expect(four.estimate.headline!.value_l).toBeCloseTo(one.estimate.headline!.value_l * 4, 6);
  });

  it('falls back to the published serving when the unit will never fit', () => {
    // A distance for a fruit. The engine throws; the card still gets a number.
    const outcome = estimateFor({
      catalogId: 'banana',
      quantity: { value: 12, unit: 'km', basis: 'vision_estimate' },
      source: 'vision_estimate',
    });
    expect(outcome).not.toBeNull();
    expect(outcome!.usedServing).toBe(true);
    const serving = servingFor('banana')!;
    expect(outcome!.estimate.quantity.value).toBeCloseTo(serving.value, 6);
    expect(outcome!.estimate.quantity.source).toBe('catalog_default');
  });

  it('uses the serving when no amount was read at all, and keeps the source honest', () => {
    const outcome = estimateFor({
      catalogId: 'banana',
      quantity: null,
      source: 'catalog_default',
    })!;
    expect(outcome.usedServing).toBe(true);
    expect(outcome.estimate.quantity.source).toBe('catalog_default');
  });

  it('keeps a search pick as user_entered when the amount stands', () => {
    const serving = servingFor('coffee_standard')!;
    const outcome = estimateFor({
      catalogId: 'coffee_standard',
      quantity: { value: serving.value * 2, unit: serving.unit as 'l' },
      source: 'user_entered',
    })!;
    expect(outcome.usedServing).toBe(false);
    expect(outcome.estimate.quantity.source).toBe('user_entered');
  });

  it('discards an amount that is zero, negative, or not a number', () => {
    for (const value of [0, -3, Number.NaN]) {
      const outcome = estimateFor({
        catalogId: 'banana',
        quantity: { value, unit: 'g' },
        source: 'vision_estimate',
      })!;
      expect(outcome.usedServing).toBe(true);
    }
  });

  it('answers nothing for an id the catalogue does not hold', () => {
    expect(
      estimateFor({ catalogId: 'unicorn_steak', quantity: null, source: 'catalog_default' }),
    ).toBeNull();
  });

  it('carries an item whose figure arrives later through with no headline', () => {
    const outcome = estimateFor({
      catalogId: 'transport_ev_car',
      quantity: { value: 10, unit: 'km' },
      source: 'user_entered',
    })!;
    expect(outcome.estimate.headline).toBeNull();
    expect(outcome.estimate.unsupported).not.toBeNull();
  });

  /**
   * The real coverage question: recognition can name *any* of the thousand
   * entries, so every one of them has to produce something the card can draw —
   * either a figure or an honest "arriving later" — from nothing but its own
   * serving.
   */
  it('produces an answer for every entry in the catalogue', () => {
    const empty: string[] = [];
    for (const id of tables.catalog.keys()) {
      const outcome = estimateFor({ catalogId: id, quantity: null, source: 'catalog_default' });
      if (!outcome) empty.push(id);
    }
    expect(empty).toEqual([]);
  });

  /**
   * And the same again with a mass reading in front of it — the shape a photo
   * of a solid thing produces. Anything that cannot take grams has to land on
   * its serving rather than fail.
   */
  it('survives a gram reading against every entry in the catalogue', () => {
    const empty: string[] = [];
    for (const id of tables.catalog.keys()) {
      const outcome = estimateFor({
        catalogId: id,
        quantity: { value: 250, unit: 'g', basis: 'vision_estimate' },
        source: 'vision_estimate',
      });
      if (!outcome) empty.push(id);
    }
    expect(empty).toEqual([]);
  });
});
