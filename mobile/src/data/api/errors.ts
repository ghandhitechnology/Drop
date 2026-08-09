/**
 * How a request fails, in five words.
 *
 * Every one of them has the same destination in the capture machine — the
 * frame stays held and finding it by name is offered — so this exists for the
 * log and for the tests rather than for the copy. Nothing on screen ever names
 * a `kind`.
 *
 * Kept in its own file with no imports so the reading layer can be tested
 * without a native module in sight.
 */

import type { UsageSnapshot } from './usage';

export type ApiFailureKind =
  /** The request never reached the service — radio off, or nothing listening. */
  | 'offline'
  /** The service was reached and took longer than the budget. */
  | 'timeout'
  /** The service answered with a status outside 2xx. */
  | 'server'
  /** The service answered with something this client cannot read. */
  | 'malformed'
  /** The installation has used today's successful camera analyses. */
  | 'rate_limited'
  /** The caller withdrew the request — a retake, or a superseded run. */
  | 'cancelled';

export class ApiError extends Error {
  readonly kind: ApiFailureKind;
  readonly status: number | null;
  readonly usage: UsageSnapshot | null;

  constructor(
    kind: ApiFailureKind,
    message: string,
    status: number | null = null,
    usage: UsageSnapshot | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.usage = usage;
  }
}
