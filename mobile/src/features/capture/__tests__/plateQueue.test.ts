/**
 * The two lists a sorted plate keeps, and the difference between them.
 *
 * A card swiped right leaves the pile and joins the queue. It is still going to
 * be written — so it stays in `kept` — but it is no longer under the thumb, so
 * it leaves `onPile`. A card swiped left leaves both. Getting this wrong in
 * either direction is a card silently lost or a card silently saved, so the
 * selectors are pinned down here rather than trusted to the stage.
 *
 * Nothing in the queue has reached the database. That is the point of it: the
 * plate is one row, written once, at the end of the run.
 */
import { describe, expect, it } from 'vitest';

import {
  keptIndicesOf,
  keptItemsOf,
  pileIndicesOf,
  queuedCountOf,
  type CaptureState,
  type Estimate,
  type PlateItem,
} from '../types';

const item = (id: string): PlateItem => ({
  estimate: { catalog_id: id, display_name: id } as unknown as Estimate,
  box: null,
});

function plating(
  dismissed: number[],
  queued: number[],
  count = 4,
): CaptureState {
  return {
    name: 'plating',
    photoUri: 'file://frame.jpg',
    anchor: { x: 0, y: 0, width: 10, height: 10 },
    items: Array.from({ length: count }, (_, index) => item(`item_${index}`)),
    dismissed,
    queued,
  };
}

describe('a plate being sorted', () => {
  it('starts with every card on the pile and every card kept', () => {
    const state = plating([], []);
    expect(pileIndicesOf(state)).toEqual([0, 1, 2, 3]);
    expect(keptIndicesOf(state)).toEqual([0, 1, 2, 3]);
    expect(queuedCountOf(state)).toBe(0);
  });

  it('takes a swiped-right card off the pile and keeps it anyway', () => {
    const state = plating([], [1]);
    expect(pileIndicesOf(state)).toEqual([0, 2, 3]);
    expect(keptIndicesOf(state)).toEqual([0, 1, 2, 3]);
    expect(queuedCountOf(state)).toBe(1);
  });

  it('takes a swiped-left card off both', () => {
    const state = plating([1], []);
    expect(pileIndicesOf(state)).toEqual([0, 2, 3]);
    expect(keptIndicesOf(state)).toEqual([0, 2, 3]);
  });

  it('reads both directions at once without confusing them', () => {
    // 0 and 2 are going in; 1 was thrown back; 3 is still under the thumb.
    const state = plating([1], [0, 2]);
    expect(pileIndicesOf(state)).toEqual([3]);
    expect(keptIndicesOf(state)).toEqual([0, 2, 3]);
    expect(keptItemsOf(state).map((entry) => entry.estimate.catalog_id)).toEqual([
      'item_0',
      'item_2',
      'item_3',
    ]);
  });

  it('empties the pile once every card has been sorted, one way or the other', () => {
    const state = plating([1, 3], [0, 2]);
    expect(pileIndicesOf(state)).toEqual([]);
    expect(keptIndicesOf(state)).toEqual([0, 2]);
  });

  it('reports the order the plate read them in, not the order they were swiped', () => {
    const state = plating([], [3, 0]);
    expect(keptIndicesOf(state)).toEqual([0, 1, 2, 3]);
  });
});

describe('a plate that has been written', () => {
  const confirmed = (kept: number[], queued: number[]): CaptureState => ({
    name: 'plateConfirmed',
    photoUri: 'file://frame.jpg',
    anchor: { x: 0, y: 0, width: 10, height: 10 },
    items: [item('a'), item('b'), item('c')],
    kept,
    queued,
    entryId: 'e_1',
    saved: { catalog_id: 'plate', display_name: 'Plate · 2 items' } as unknown as Estimate,
  });

  it('leaves the pile empty when the last card was swiped across', () => {
    // Everything went to the tray, so there is no paper left to celebrate on.
    expect(pileIndicesOf(confirmed([0, 1, 2], [0, 1, 2]))).toEqual([]);
  });

  it('keeps the unsorted remainder on the pile when Save finished the run', () => {
    // Two were swiped across, the third was still sitting there when the
    // button was pressed. All three were written; one is still paper.
    expect(pileIndicesOf(confirmed([0, 1, 2], [0, 1]))).toEqual([2]);
  });

  it('never puts a thrown-back card on the pile', () => {
    expect(pileIndicesOf(confirmed([0, 2], [0]))).toEqual([2]);
  });
});

describe('states that are not a plate', () => {
  const single: CaptureState = {
    name: 'presenting',
    photoUri: 'file://frame.jpg',
    anchor: { x: 0, y: 0, width: 10, height: 10 },
    estimate: { catalog_id: 'apple', display_name: 'Apple' } as unknown as Estimate,
  };

  it('have no pile, no queue and nothing kept', () => {
    expect(pileIndicesOf(single)).toEqual([]);
    expect(keptIndicesOf(single)).toEqual([]);
    expect(queuedCountOf(single)).toBe(0);
    expect(keptItemsOf({ name: 'idle' })).toEqual([]);
  });
});
