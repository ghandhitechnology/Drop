/**
 * How long a run signed up for, decided at the shutter.
 *
 * Three quite different waits hide behind one press. A retail code is a
 * database read with a short outbound call behind it. Fast mode drops the
 * presentation beat and answers as soon as the local engine has something.
 * An ordinary photo goes all the way out to recognition and back.
 *
 * The numbers live in their own leaf module rather than inside the pipeline
 * because the pipeline is not the only thing that needs them: while the frame
 * is held, the screen paces itself against the same clock, and a gauge that
 * fills against a different number than the one the run will actually time out
 * on is a gauge that lies. Keeping them here also means anything that only
 * wants to know *how long* can have it without pulling the catalogue, the
 * database and the network client in behind it.
 */

import type { CaptureMode } from './types';

/** Nothing takes longer than this, whatever the network is doing. */
export const HARD_CEILING_MS = 30_000;

/** A barcode lookup is a database read with a 4s outbound call behind it. */
export const BARCODE_TIMEOUT_MS = 8_000;

/**
 * What fast mode is worth.
 *
 * Fast mode shares the hard ceiling — it can still be waiting on the same slow
 * radio — but it skips the presentation beat and answers off the local engine,
 * so in practice it lands in about half the time. That is the number a wait
 * should be paced against: the expected trip, not the worst one.
 */
export const FAST_CEILING_MS = HARD_CEILING_MS / 2;

/** Which of the three waits a held frame is in for. */
export type CapturePace = 'normal' | 'fast' | 'barcode';

/**
 * A code in frame beats fast mode.
 *
 * Both are shortcuts, but they are not the same shortcut, and a barcode run is
 * the shorter of the two by a wide margin — pacing it against fast mode's
 * fifteen seconds would leave the wait looking barely started when the answer
 * arrives.
 */
export function paceFor(hasBarcode: boolean, mode: CaptureMode): CapturePace {
  if (hasBarcode) return 'barcode';
  return mode === 'fast' ? 'fast' : 'normal';
}

/** How long a run of each kind expects to take. */
export function paceCeilingMs(pace: CapturePace): number {
  'worklet';
  switch (pace) {
    case 'barcode':
      return BARCODE_TIMEOUT_MS;
    case 'fast':
      return FAST_CEILING_MS;
    default:
      return HARD_CEILING_MS;
  }
}
