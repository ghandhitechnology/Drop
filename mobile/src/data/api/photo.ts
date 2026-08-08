/**
 * A held photo, turned into something that fits in a request body.
 *
 * Drop ships without an image-manipulation module, so the size of what goes on
 * the wire is decided at the shutter — `takePictureAsync({ quality })` — rather
 * than by resampling afterwards. What is left to do here is read the file and
 * encode it, and to say clearly when the frame is too large to send so the
 * pipeline can hold it and offer the catalogue instead of stalling on an
 * upload that will not finish inside the moment.
 */

import { File } from 'expo-file-system';

import { ApiError } from './errors';

/**
 * The largest frame Drop puts on the wire, in bytes before encoding.
 *
 * A 0.7-quality JPEG from a phone camera lands well under this. Base64 adds
 * about a third, so this caps the request body near 5.5 MB — comfortable for a
 * service on the same machine and still bounded on a real network.
 */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export type EncodedPhoto = {
  base64: string;
  mime: string;
  /** Bytes on disk, before encoding. Logged so the budget stays observable. */
  bytes: number;
};

function mimeFor(uri: string): string {
  return /\.png($|\?)/i.test(uri) ? 'image/png' : 'image/jpeg';
}

/**
 * Read the frozen frame off disk as base64.
 *
 * Failures are reported in the transport's own vocabulary — a frame that
 * cannot be read is, from the pipeline's point of view, the same event as a
 * service that cannot be reached: the photo stays on screen and the way
 * forward is the catalogue.
 */
export async function encodePhoto(uri: string): Promise<EncodedPhoto> {
  let file: File;
  try {
    file = new File(uri);
  } catch {
    throw new ApiError('malformed', 'the held frame has no readable path');
  }

  const bytes = file.size ?? 0;
  if (bytes > MAX_PHOTO_BYTES) {
    throw new ApiError('malformed', `the held frame is ${bytes} bytes`);
  }

  try {
    const base64 = await file.base64();
    return { base64, mime: mimeFor(uri), bytes: bytes || base64.length };
  } catch {
    throw new ApiError('malformed', 'the held frame could not be read');
  }
}
