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
import { NativeModules, Platform } from 'react-native';

import { ApiError } from './errors';
import { publishUsage, readUsageSnapshot, usageFromHeaders } from './usage';

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

/** Read a hostname from either a full bundle URL or Expo's host:port form. */
export function hostFromUri(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    const url = new URL(value.includes('://') ? value : `http://${value}`);
    return url.hostname || null;
  } catch {
    return null;
  }
}

/**
 * The native bundle URL is the most reliable development address. A custom
 * development build can have no `expoConfig.hostUri`, while React Native still
 * knows the exact Metro URL it loaded — including the Mac's LAN hostname.
 */
function developmentHost(): string | null {
  const source = NativeModules.SourceCode as
    | {
        scriptURL?: string;
        getConstants?: () => { scriptURL?: string };
      }
    | undefined;
  const scriptURL = source?.scriptURL ?? source?.getConstants?.().scriptURL;
  return hostFromUri(scriptURL) ?? hostFromUri(Constants.expoConfig?.hostUri);
}

/**
 * Where the service lives.
 *
 * `expo.extra.apiBaseUrl` wins when it is set, which is how a deployed build
 * points somewhere real. In development the answer is already known: the
 * machine serving the JS bundle is the machine running the service, so the
 * bundle's own host is reused with the service's port — which is what lets a
 * physical phone on the LAN find the laptop without anyone typing an IP.
 * Failing both: the Android emulator reaches its host through 10.0.2.2, and
 * everything else through loopback.
 */
export function apiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  if (typeof extra?.apiBaseUrl === 'string' && extra.apiBaseUrl.length > 0) {
    return trimTrailingSlash(extra.apiBaseUrl);
  }
  const bundleHost = developmentHost();
  if (bundleHost) {
    return `http://${bundleHost}:${API_PORT}`;
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
  /** Additional protocol headers, merged with JSON content negotiation. */
  headers?: Record<string, string>;
};

type Method = 'GET' | 'POST' | 'DELETE';

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
  responseType: 'json' | 'text' = 'json',
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
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 429) {
        let usage = usageFromHeaders(response.headers);
        try {
          const payload = (await response.json()) as { usage?: unknown };
          usage = readUsageSnapshot(payload.usage) ?? usage;
        } catch {}
        if (usage) publishUsage(usage);
        throw new ApiError('rate_limited', `${path} reached today's limit`, 429, usage);
      }
      throw new ApiError('server', `${path} answered ${response.status}`, response.status);
    }

    const usage = usageFromHeaders(response.headers);
    if (usage) publishUsage(usage);

    if (response.status === 204) return undefined as T;

    if (responseType === 'text') return (await response.text()) as T;

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

/** Exact response text, used when bytes are covered by a release hash. */
export function getText(path: string, options?: RequestOptions): Promise<string> {
  return request<string>('GET', path, undefined, options, 'text');
}

export function postJson<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
  return request<T>('POST', path, body, options);
}

export function deleteJson(path: string, options?: RequestOptions): Promise<void> {
  return request<void>('DELETE', path, undefined, options);
}
