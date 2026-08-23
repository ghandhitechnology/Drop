import { createHash } from 'node:crypto';

export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' } as const;

export async function digestStringAsync(
  algorithm: string,
  value: string,
): Promise<string> {
  if (algorithm !== CryptoDigestAlgorithm.SHA256) throw new Error('unsupported digest');
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
