import * as Crypto from 'expo-crypto';

import { deleteJson, getJson, postJson, type RequestOptions } from '../../data/api/client';
import {
  readUsageReservation,
  readUsageSnapshot,
  type UsageReservation,
  type UsageSnapshot,
} from '../../data/api/usage';
import { deviceTimeZone } from '../../lib/time';
import { installationId } from './identity';

export function createAnalysisId(): string {
  return Crypto.randomUUID();
}

export async function usageHeaders(analysisId?: string): Promise<Record<string, string>> {
  return {
    'X-Drop-Device-Id': await installationId(),
    'X-Drop-Time-Zone': deviceTimeZone(),
    ...(analysisId ? { 'X-Drop-Analysis-Id': analysisId } : {}),
  };
}

export async function fetchUsage(options: RequestOptions = {}): Promise<UsageSnapshot> {
  const raw = await getJson<unknown>('/v1/usage', {
    ...options,
    headers: { ...options.headers, ...(await usageHeaders()) },
  });
  const usage = readUsageSnapshot(raw);
  if (!usage) throw new Error('usage response was malformed');
  return usage;
}

export async function reserveAnalysis(
  analysisId: string,
  options: RequestOptions = {},
): Promise<UsageReservation> {
  const raw = await postJson<unknown>(
    '/v1/usage/reservations',
    { analysis_id: analysisId },
    { ...options, headers: { ...options.headers, ...(await usageHeaders(analysisId)) } },
  );
  const reservation = readUsageReservation(raw);
  if (!reservation) throw new Error('usage reservation was malformed');
  return reservation;
}

export async function releaseAnalysis(analysisId: string): Promise<void> {
  await deleteJson(`/v1/usage/reservations/${analysisId}`, {
    timeoutMs: 5_000,
    headers: await usageHeaders(analysisId),
  });
}
