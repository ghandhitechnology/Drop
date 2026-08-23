import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  type BarcodeResponse,
  type RecognizeCandidate,
  type RecognizeItem,
  type RecognizeResponse,
} from '../../../data/api';
import { FACTORS_VERSION } from '../../../data/tables';
import { estimateFor } from '../../search/estimate';
import {
  createRealPipeline,
  MAX_PLATE_ITEMS,
  type PipelineHandlers,
  type PipelineInput,
  type RealPipelineDependencies,
} from '../pipeline';
import { HARD_CEILING_MS } from '../pace';
import type { Estimate, PlateItem, RecognizedItem } from '../types';

vi.mock('expo-crypto', () => ({
  randomUUID: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
}));
vi.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
vi.mock('expo-file-system', () => ({ File: class {} }));
vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: vi.fn(),
  isAvailableAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));
vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  NativeModules: { SourceCode: { getConstants: () => ({ scriptURL: '' }) } },
  Platform: { OS: 'ios' },
}));

const ANALYSIS_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PHOTO: PipelineInput = { photoUri: 'file://meal.jpg', mode: 'fast' };
const BARCODE = {
  symbology: 'ean13' as const,
  value: '4006381333931',
  gtin14: '04006381333931',
  bounds: null,
};
const USAGE = {
  limit: 20,
  used: 0,
  remaining: 19,
  local_day: '2026-08-10',
  resets_at: '2026-08-10T15:00:00.000Z',
};

function candidate(catalogId: string, displayName: string, score = 0.96): RecognizeCandidate {
  return {
    catalog_id: catalogId,
    display_name: displayName,
    category: 'food',
    score,
    reason: 'fixture',
    repaired: false,
  };
}

function item(index: number, label: string, candidates: RecognizeCandidate[]): RecognizeItem {
  return {
    index,
    label,
    category: 'food',
    candidates,
    quantity: { value: 100 + index, unit: 'g', basis: 'vision_estimate' },
    detected_text: [],
    box: { x: 0.05, y: 0.05, w: 0.4, h: 0.4 },
    unmatched: candidates.length === 0,
  };
}

function recognition(
  candidates: RecognizeCandidate[] = [candidate('apple', 'Apple')],
  quantity: RecognizeResponse['quantity'] = {
    value: 180,
    unit: 'g',
    basis: 'vision_estimate',
  },
  items: RecognizeItem[] = [item(0, candidates[0]?.display_name ?? '', candidates)],
): RecognizeResponse {
  return {
    request_id: 'recognition-1',
    model: 'fixture-namer',
    catalog_version: FACTORS_VERSION,
    items,
    candidates: items[0]?.candidates ?? candidates,
    quantity,
    detected_text: [],
    unmatched: candidates.length === 0,
  };
}

function barcode(
  catalogId: string | null,
  quantity: BarcodeResponse['quantity'] = null,
): BarcodeResponse {
  return {
    ean: BARCODE.value,
    catalog_version: FACTORS_VERSION,
    off: { status: catalogId ? 'found' : 'missing' },
    mapping: {
      catalog_id: catalogId,
      match_level: catalogId ? 'exact' : 'none',
      confidence: catalogId ? 'high' : 'none',
      evidence: [],
    },
    quantity,
    coverage_miss: catalogId === null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

type Harness = ReturnType<typeof harness>;

function harness(overrides: Partial<RealPipelineDependencies> = {}) {
  const calls = {
    lookupBarcode: vi.fn().mockResolvedValue(barcode(null)),
    encodePhoto: vi.fn().mockResolvedValue({ base64: 'cGhvdG8=', mime: 'image/jpeg', bytes: 5 }),
    recognizePhoto: vi.fn().mockResolvedValue(recognition()),
    createAnalysisId: vi.fn().mockReturnValue(ANALYSIS_ID),
    reserveAnalysis: vi.fn().mockResolvedValue({
      usage: USAGE,
      expires_at: '2026-08-10T03:02:00.000Z',
    }),
    releaseAnalysis: vi.fn().mockResolvedValue(undefined),
    clearCandidates: vi.fn(),
    offerCandidates: vi.fn(),
    takeSearchPicks: vi.fn().mockReturnValue([]),
  };
  const dependencies = {
    ...calls,
    ...overrides,
  } as Partial<RealPipelineDependencies>;

  const seen = {
    recognizing: 0,
    analyzing: [] as RecognizedItem[],
    presenting: [] as Estimate[],
    presentingMany: [] as PlateItem[][],
    unresolved: 0,
    limited: [] as (typeof USAGE)[],
    terminals: [] as string[],
  };
  const handlers: PipelineHandlers = {
    onRecognizing: () => {
      seen.recognizing += 1;
    },
    onAnalyzing: (recognized) => {
      seen.analyzing.push(recognized);
    },
    onPresenting: (estimate) => {
      seen.presenting.push(estimate);
      seen.terminals.push('presenting');
    },
    onPresentingMany: (plate) => {
      seen.presentingMany.push(plate);
      seen.terminals.push('presentingMany');
    },
    onUnresolved: () => {
      seen.unresolved += 1;
      seen.terminals.push('unresolved');
    },
    onLimited: (usage) => {
      seen.limited.push(usage);
      seen.terminals.push('limited');
    },
  };

  return {
    calls,
    seen,
    start: (input: PipelineInput = PHOTO) => createRealPipeline(dependencies)(input, handlers),
  };
}

async function start(h: Harness, input: PipelineInput = PHOTO) {
  const run = h.start(input);
  await vi.advanceTimersByTimeAsync(0);
  return run;
}

describe('real capture pipeline orchestration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('emits one terminal callback when a late success loses to the hard ceiling', async () => {
    const vision = deferred<RecognizeResponse>();
    const h = harness({
      recognizePhoto: vi.fn().mockReturnValue(vision.promise),
    });
    await start(h);

    await vi.advanceTimersByTimeAsync(HARD_CEILING_MS);
    expect(h.seen.terminals).toEqual(['unresolved']);

    vision.resolve(recognition());
    await vi.advanceTimersByTimeAsync(0);
    expect(h.seen.terminals).toEqual(['unresolved']);
    expect(h.calls.releaseAnalysis).toHaveBeenCalledOnce();
  });

  it('cancels in-flight work, releases its reservation, and never emits afterward', async () => {
    const vision = deferred<RecognizeResponse>();
    const recognizePhoto = vi.fn().mockReturnValue(vision.promise);
    const h = harness({ recognizePhoto });
    const run = await start(h);

    const signal = recognizePhoto.mock.calls[0]?.[1]?.signal;
    run.cancel();
    expect(signal?.aborted).toBe(true);
    expect(h.calls.releaseAnalysis).toHaveBeenCalledWith(ANALYSIS_ID);

    vision.resolve(recognition());
    await vi.advanceTimersByTimeAsync(HARD_CEILING_MS);
    expect(h.seen.terminals).toEqual([]);
  });

  it('releases a successful reservation when later work fails, even if release fails', async () => {
    const releaseAnalysis = vi.fn().mockRejectedValue(new Error('cleanup offline'));
    const h = harness({
      encodePhoto: vi.fn().mockRejectedValue(new Error('photo unreadable')),
      releaseAnalysis,
    });
    await start(h);

    expect(h.seen.terminals).toEqual(['unresolved']);
    expect(releaseAnalysis).toHaveBeenCalledOnce();
    expect(releaseAnalysis).toHaveBeenCalledWith(ANALYSIS_ID);
  });

  it('lets a barcode hit beat vision that finished first in fast mode', async () => {
    const code = deferred<BarcodeResponse>();
    const recognizePhoto = vi.fn().mockResolvedValue(recognition([candidate('apple', 'Apple')]));
    const h = harness({
      lookupBarcode: vi.fn().mockReturnValue(code.promise),
      recognizePhoto,
    });
    await start(h, { ...PHOTO, barcode: BARCODE });

    expect(recognizePhoto).toHaveBeenCalledOnce();
    expect(h.seen.terminals).toEqual([]);

    code.resolve(
      barcode('banana', {
        value: 120,
        unit: 'g',
        basis: 'package_label',
        evidence: '120 g',
      }),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(h.seen.analyzing[0]).toMatchObject({
      catalog_id: 'banana',
      gtin14: BARCODE.gtin14,
    });
    expect(h.seen.presenting[0]?.catalog_id).toBe('banana');
    expect(h.seen.presenting[0]?.quantity.source).toBe('package_label');
    expect(h.seen.terminals).toEqual(['presenting']);
  });

  it('uses vision already in flight when the barcode is a coverage miss', async () => {
    const code = deferred<BarcodeResponse>();
    const h = harness({
      lookupBarcode: vi.fn().mockReturnValue(code.promise),
      recognizePhoto: vi.fn().mockResolvedValue(recognition([candidate('apple', 'Apple')])),
    });
    await start(h, { ...PHOTO, barcode: BARCODE });

    code.resolve(barcode(null, { value: 330, unit: 'g', basis: 'package_label' }));
    await vi.advanceTimersByTimeAsync(0);

    expect(h.seen.analyzing[0]).toMatchObject({
      catalog_id: 'apple',
      gtin14: BARCODE.gtin14,
    });
    expect(h.seen.presenting[0]).toMatchObject({
      catalog_id: 'apple',
      quantity: { source: 'package_label' },
    });
    expect(h.seen.terminals).toEqual(['presenting']);
  });

  it('does not read the photo after an authoritative barcode hit in normal mode', async () => {
    const h = harness({
      lookupBarcode: vi.fn().mockResolvedValue(barcode('banana')),
    });
    await start(h, { ...PHOTO, mode: 'normal', barcode: BARCODE });
    await vi.runAllTimersAsync();

    expect(h.calls.encodePhoto).not.toHaveBeenCalled();
    expect(h.calls.recognizePhoto).not.toHaveBeenCalled();
    expect(h.seen.terminals).toEqual(['presenting']);
  });

  it('caps a recognized plate and preserves unsupported items as honest cards', async () => {
    const items = Array.from({ length: MAX_PLATE_ITEMS + 2 }, (_, index) =>
      index % 2 === 0
        ? item(index, 'Banana', [candidate('banana', 'Banana')])
        : item(index, `Mystery ${index}`, []),
    );
    const h = harness({
      recognizePhoto: vi.fn().mockResolvedValue(recognition([], null, items)),
    });
    await start(h);

    const plate = h.seen.presentingMany[0]!;
    expect(plate).toHaveLength(MAX_PLATE_ITEMS);
    expect(h.seen.analyzing[0]?.count).toBe(MAX_PLATE_ITEMS);
    expect(plate[0]?.estimate.headline).not.toBeNull();
    expect(plate[1]?.estimate).toMatchObject({
      catalog_id: '',
      display_name: 'Mystery 1',
      headline: null,
      unsupported: { reason: 'not_in_catalog' },
      factors_version: FACTORS_VERSION,
    });
    expect(
      plate.some((entry) => entry.estimate.display_name === `Mystery ${MAX_PLATE_ITEMS + 1}`),
    ).toBe(false);
    expect(h.seen.terminals).toEqual(['presentingMany']);
  });

  it('binds one reservation to the consuming request and keeps success consumed', async () => {
    const h = harness();
    await start(h);

    expect(h.calls.reserveAnalysis).toHaveBeenCalledWith(
      ANALYSIS_ID,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(h.calls.recognizePhoto).toHaveBeenCalledWith(
      'cGhvdG8=',
      expect.objectContaining({ analysisId: ANALYSIS_ID }),
    );
    expect(h.calls.releaseAnalysis).not.toHaveBeenCalled();
    expect(h.seen.terminals).toEqual(['presenting']);
  });

  it('surfaces a usage limit as the sole terminal result before reading the photo', async () => {
    const limited = { ...USAGE, used: 20, remaining: 0 };
    const h = harness({
      reserveAnalysis: vi
        .fn()
        .mockRejectedValue(new ApiError('rate_limited', 'daily limit', 429, limited)),
    });
    await start(h);

    expect(h.seen.terminals).toEqual(['limited']);
    expect(h.seen.limited).toEqual([limited]);
    expect(h.calls.encodePhoto).not.toHaveBeenCalled();
    expect(h.calls.releaseAnalysis).not.toHaveBeenCalled();
  });

  it('shows the byte-identical estimate produced by the bundled deterministic engine', async () => {
    const quantity = {
      value: 500,
      unit: 'g' as const,
      basis: 'vision_estimate' as const,
    };
    const h = harness({
      recognizePhoto: vi
        .fn()
        .mockResolvedValue(recognition([candidate('banana', 'Banana')], quantity)),
    });
    await start(h);

    const local = estimateFor({
      catalogId: 'banana',
      quantity,
      source: 'vision_estimate',
    })!;
    expect(h.seen.presenting[0]).toEqual(local.estimate);
    expect(h.seen.presenting[0]?.factors_version).toBe(FACTORS_VERSION);
    expect(h.seen.presenting[0]?.factor?.dataset).toBe('su_eatable_life');
  });
});
