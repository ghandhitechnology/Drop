import type { Context } from 'hono';

import { UsageLimitError, UsageProtocolError, type UsageService } from './service';
import type { AnalysisAuthorization } from './service';
import type { UsageSnapshot } from './types';
import type { AnalysisBranch } from './types';

export function applyUsageHeaders(c: Context, usage: UsageSnapshot): void {
  c.header('RateLimit-Limit', String(usage.limit));
  c.header('RateLimit-Remaining', String(usage.remaining));
  c.header('RateLimit-Reset', String(Math.ceil(new Date(usage.resets_at).getTime() / 1000)));
  c.header('X-Drop-Usage-Used', String(usage.used));
  c.header('X-Drop-Usage-Day', usage.local_day);
}

export function usageErrorResponse(c: Context, error: unknown): Response | null {
  if (error instanceof UsageLimitError) {
    applyUsageHeaders(c, error.usage);
    const seconds = Math.max(
      1,
      Math.ceil((new Date(error.usage.resets_at).getTime() - Date.now()) / 1000),
    );
    c.header('Retry-After', String(seconds));
    return c.json({ error: 'daily_analysis_limit', usage: error.usage }, 429);
  }
  if (error instanceof UsageProtocolError) {
    const code =
      error.status === 426
        ? 'usage_protocol_required'
        : error.status === 503
          ? 'usage_store_unavailable'
          : 'usage_protocol_error';
    return c.json({ error: code, message: error.message }, error.status);
  }
  return null;
}

export async function authorizeAnalysis(
  c: Context,
  usage: UsageService,
  branch: AnalysisBranch,
  fingerprint: string,
) {
  try {
    return await usage.authorize(c.req.raw.headers, branch, fingerprint);
  } catch (error) {
    const response = usageErrorResponse(c, error);
    if (response) return response;
    throw error;
  }
}

export async function consumeAnalysis(
  c: Context,
  usage: UsageService,
  auth: AnalysisAuthorization,
  branch: AnalysisBranch,
  fingerprint: string,
): Promise<Response | null> {
  try {
    const snapshot = await usage.consume(auth, branch, fingerprint);
    if (snapshot) applyUsageHeaders(c, snapshot);
    return null;
  } catch (error) {
    const response = usageErrorResponse(c, error);
    if (response) return response;
    console.error('[usage] consume failed', error);
    return c.json({ error: 'usage_store_unavailable' }, 503);
  }
}
