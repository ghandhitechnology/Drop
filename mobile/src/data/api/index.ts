/**
 * The Drop service, as three functions.
 *
 * `recognize` says what is in a photo. `barcode` says what a retail code is.
 * `research` fetches published reading about an item. None of them returns a
 * litre figure, and none of them is on the path of one: every number Drop
 * shows is computed on the device by `@drop/water-engine` against the factor
 * tables in the bundle. The service is a naming service.
 *
 * Each wrapper hands its answer to `./normalize`, which believes a field only
 * once it has checked it — so a field the service renames surfaces as a
 * `malformed` failure at the edge rather than as `undefined` three screens in.
 */

import { ApiError } from './errors';
import { getJson, postJson, type RequestOptions } from './client';
import { readBarcode, readRecognize, readResearch } from './normalize';
import type { BarcodeResponse, RecognizeResponse, ResearchResponse } from './types';

export { ApiError, type ApiFailureKind } from './errors';
export {
  API_PORT,
  DEFAULT_TIMEOUT_MS,
  apiBaseUrl,
  getJson,
  postJson,
  type RequestOptions,
} from './client';
export { MAX_PHOTO_BYTES, encodePhoto, type EncodedPhoto } from './photo';
export * from './normalize';
export * from './types';

/**
 * Below this, recognition is offering a shortlist rather than an answer, and
 * the result card shows the alternatives so the choice stays with the person.
 */
export const MULTI_CANDIDATE_SCORE = 0.75;

/** Research asks a model to read; the service allows it 30 seconds. */
export const RESEARCH_TIMEOUT_MS = 28_000;

/* -------------------------------------------------------------- recognize */

export type RecognizeOptions = RequestOptions & {
  mime?: string;
  /** Anything already known about the frame — a code read off a packet. */
  hint?: string;
  /** Fast capture lowers reasoning effort without changing the response budget. */
  mode?: 'normal' | 'fast';
};

/**
 * What is in this photo.
 *
 * Candidates come back best-first and already filtered to real catalogue ids
 * by the service. The quantity is what the model could see: the net weight off
 * a label when there is one, an estimate from the frame otherwise.
 */
export async function recognize(
  photoBase64: string,
  options: RecognizeOptions = {},
): Promise<RecognizeResponse> {
  const { mime, hint, mode, ...request } = options;
  const body = await postJson<unknown>(
    '/v1/recognize',
    {
      image_base64: photoBase64,
      mime: mime ?? 'image/jpeg',
      ...(hint ? { hint } : {}),
      ...(mode ? { mode } : {}),
    },
    request,
  );
  return readRecognize(body);
}

/* ---------------------------------------------------------------- barcode */

/**
 * What this retail code is.
 *
 * `coverage_miss` is the field that matters: true means the code resolved to
 * no catalogue entry, and the pipeline moves on to reading the photo. A hit
 * carries a catalogue id and, when the packet publishes one, the net quantity
 * printed on it — which is a far better number than any estimate from a frame.
 */
export async function barcode(
  ean: string,
  options: RequestOptions = {},
): Promise<BarcodeResponse> {
  const digits = ean.replace(/\D/g, '');
  if (digits.length < 8) {
    throw new ApiError('malformed', `${ean} is too short to be a retail code`);
  }
  const body = await getJson<unknown>(`/v1/barcode/${digits}`, options);
  return readBarcode(body, digits);
}

/* --------------------------------------------------------------- research */

/**
 * Published reading about an item.
 *
 * This is background, held apart from the number: `may_be_used_as_factor` is a
 * literal `false` both on the wire and in the type, so evidence stays evidence.
 */
export async function research(
  catalogId: string,
  options: RequestOptions & { question?: string } = {},
): Promise<ResearchResponse> {
  const { question, ...request } = options;
  const body = await postJson<unknown>(
    '/v1/research',
    { catalog_id: catalogId, ...(question ? { question } : {}) },
    { timeoutMs: RESEARCH_TIMEOUT_MS, ...request },
  );
  return readResearch(body, catalogId);
}
