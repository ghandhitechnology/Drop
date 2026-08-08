/**
 * The transport.
 *
 * Every request Drop makes goes through one function, so there is exactly one
 * place that decides how long to wait, how to give up, and what a failure is
 * called. Callers never see a raw fetch rejection: they see an `ApiError` with
 * a `kind`, and every `kind` has a single honest destination in the capture
 * machine — the frozen frame, held, with finding it by name offered.
 *
 * There is no retry here on purpose. A person is standing still holding a
 * phone at something; a second attempt spends their patience rather than the
 * network's. The pipeline decides once, quickly, and offers the way forward.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { ApiError } from './errors';

export { ApiError, type ApiFailureKind } from './errors';

/** Long enough for a vision model, short enough to stay inside one moment. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** The port the Drop service listens on in development. */
export const API_PORT = 8787;

/**
 * The Android emulator's alias for the machine it runs on. A device on a real
 * network reaches the service through `extra.apiBaseUrl` instead.
 */
const EMULATOR_LOOPBACK = '10.0.2.2';

/* ---------------------------------------------------------------- the host */

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * Where the service lives.
 *
 * `expo.extra.apiBaseUrl` wins when it is set, which is how a physical device
 * on a LAN or a deployed build points somewhere else. Otherwise: the Android
 * emulator reaches its host through 10.0.2.2, and everything else through
 * loopback.
 */
export function apiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  if (typeof extra?.apiBaseUrl === 'string' && extra.apiBaseUrl.length > 0) {
    return trimTrailingSlash(extra.apiBaseUrl);
  }
  const host = Platform.OS === 'android' ? EMULATOR_LOOPBACK : 'localhost';
  return `http://${host}:${API_PORT}`;
}

/* ------------------------------------------------------------- the request */

export type RequestOptions = {
  /** Overrides `DEFAULT_TIMEOUT_MS` for calls with a different appetite. */
  timeoutMs?: number;
  /** The caller's own withdrawal signal, raced against the timeout. */
  signal?: AbortSignal;
};

type Method = 'GET' | 'POST';

/**
 * One request, one budget, one typed failure.
 *
 * The timeout and the caller's signal are folded into a single controller, and
 * the two are told apart afterwards so a person who pressed retake never sees
 * the copy meant for a slow network.
 */
async function request<T>(
  method: Method,
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const withdraw = () => controller.abort();
  const outer = options.signal;
  if (outer?.aborted) {
    clearTimeout(timer);
    throw new ApiError('cancelled', `${path} was withdrawn before it started`);
  }
  outer?.addEventListener('abort', withdraw);

  const url = `${apiBaseUrl()}${path}`;

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      throw new ApiError('server', `${path} answered ${response.status}`, response.status);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError('malformed', `${path} answered with unreadable JSON`);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (outer?.aborted) throw new ApiError('cancelled', `${path} was withdrawn`);
    if (timedOut) throw new ApiError('timeout', `${path} passed ${timeoutMs}ms`);
    throw new ApiError('offline', `${path} was out of reach`);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', withdraw);
  }
}

export function getJson<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>('GET', path, undefined, options);
}

export function postJson<T>(
  path: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  return request<T>('POST', path, body, options);
}
