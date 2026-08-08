/**
 * The refresh schedule and the reading of a manifest.
 *
 * Both are pure, and both are the parts that decide whether a person's phone
 * talks to the network on a launch. They are tested without a clock, a network,
 * or a database on purpose: an interval that can only be exercised by waiting a
 * day is an interval nobody checks.
 */
import { describe, expect, it } from 'vitest';

import {
  SYNC_INTERVAL_MS,
  cacheKey,
  isCheckDue,
  readManifestVersion,
} from '../syncPolicy';

const HOUR = 60 * 60 * 1000;
const NOW = 1_770_000_000_000;

describe('isCheckDue', () => {
  it('is due when nothing has ever been checked', () => {
    expect(isCheckDue(null, NOW)).toBe(true);
  });

  it('holds off inside the interval', () => {
    expect(isCheckDue(String(NOW - HOUR), NOW)).toBe(false);
    expect(isCheckDue(String(NOW - 23 * HOUR), NOW)).toBe(false);
  });

  it('comes due exactly at the interval', () => {
    expect(isCheckDue(String(NOW - SYNC_INTERVAL_MS), NOW)).toBe(true);
    expect(isCheckDue(String(NOW - SYNC_INTERVAL_MS + 1), NOW)).toBe(false);
  });

  it('is due again a day later', () => {
    expect(isCheckDue(String(NOW - 25 * HOUR), NOW)).toBe(true);
  });

  /**
   * A timestamp ahead of the clock means the clock moved backwards — a manual
   * time change, or a timezone the OS applied late. Treating it as recent would
   * hold the check off until real time caught up, which could be years.
   */
  it('is due when the stored time is in the future', () => {
    expect(isCheckDue(String(NOW + SYNC_INTERVAL_MS), NOW)).toBe(true);
  });

  it('is due when the stored value is unreadable', () => {
    expect(isCheckDue('', NOW)).toBe(true);
    expect(isCheckDue('yesterday', NOW)).toBe(true);
    expect(isCheckDue('NaN', NOW)).toBe(true);
  });

  it('takes an interval of its own', () => {
    expect(isCheckDue(String(NOW - 2 * HOUR), NOW, HOUR)).toBe(true);
    expect(isCheckDue(String(NOW - 2 * HOUR), NOW, 5 * HOUR)).toBe(false);
  });
});

describe('readManifestVersion', () => {
  it('reads the version out of a manifest', () => {
    expect(readManifestVersion({ version: '2026.09.1', files: [] })).toBe('2026.09.1');
  });

  it('declines anything that is not a version string', () => {
    expect(readManifestVersion(null)).toBeNull();
    expect(readManifestVersion(undefined)).toBeNull();
    expect(readManifestVersion('2026.09.1')).toBeNull();
    expect(readManifestVersion([])).toBeNull();
    expect(readManifestVersion({})).toBeNull();
    expect(readManifestVersion({ version: '' })).toBeNull();
    expect(readManifestVersion({ version: 3 })).toBeNull();
    expect(readManifestVersion({ version: null })).toBeNull();
  });
});

describe('cacheKey', () => {
  it('namespaces a table by its release, so two releases coexist', () => {
    expect(cacheKey('2026.08.1', 'food_sueatable')).toBe(
      'factors/2026.08.1/food_sueatable',
    );
    expect(cacheKey('2026.09.1', 'food_sueatable')).not.toBe(
      cacheKey('2026.08.1', 'food_sueatable'),
    );
  });
});
