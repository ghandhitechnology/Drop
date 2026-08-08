/** The backend must produce byte-identical estimates to the on-device
 * engine — both import @drop/water-engine and the same factor tables. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { estimate } from '@drop/water-engine';
import type { EstimateInput } from '@drop/water-engine';
import { tables } from '../src/data';
import { sanitizeModelOutput } from '../src/services/sanitize';

const FIXTURES: EstimateInput[] = [
  { catalog_id: 'beef_bone_free_meat', quantity: { value: 1, unit: 'kg', source: 'user_entered' } },
  { catalog_id: 'apple', quantity: { value: 150, unit: 'g', source: 'user_entered' } },
  { catalog_id: 'cow_milk', quantity: { value: 1, unit: 'l', source: 'user_entered' } },
  { catalog_id: 'coffee_standard', quantity: { value: 125, unit: 'ml', source: 'user_entered' } },
  { catalog_id: 'cheeseburger', quantity: { value: 0.25, unit: 'kg', source: 'user_entered' } },
  { catalog_id: 'transport_petrol_car', quantity: { value: 10, unit: 'km', source: 'user_entered' } },
  { catalog_id: 'product_315000', quantity: { value: 20, unit: 'usd', source: 'user_entered' } },
];

describe('engine parity (golden file)', () => {
  const goldenPath = join(
    dirname(fileURLToPath(import.meta.url)), 'golden-estimates.json',
  );

  it('estimates are stable against the golden file', () => {
    const actual = FIXTURES.map((f) => estimate(f, tables));
    let golden: unknown;
    try {
      golden = JSON.parse(readFileSync(goldenPath, 'utf-8'));
    } catch {
      // First run: write the golden file, then always compare.
      const { writeFileSync } = require('node:fs') as typeof import('node:fs');
      writeFileSync(goldenPath, JSON.stringify(actual, null, 1));
      golden = actual;
    }
    expect(actual).toEqual(golden);
  });
});

describe('sanitizer', () => {
  it('rejects a jailbroken response that smuggles in a footprint', () => {
    const r = sanitizeModelOutput({
      candidates: [{ catalog_id: 'apple', score: 1, reason: 'x' }],
      water_footprint_litres: 812,
    });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain('water_footprint_litres');
  });

  it('accepts a clean response', () => {
    const r = sanitizeModelOutput({
      candidates: [{ catalog_id: 'apple', score: 1, reason: 'red fruit' }],
      quantity: { value: 150, unit: 'g', basis: 'vision_estimate' },
      detected_text: [],
      unmatched: false,
    });
    expect(r.ok).toBe(true);
  });
});

describe('research isolation', () => {
  it('the engine package never imports research types', () => {
    const engineSrc = join(
      dirname(fileURLToPath(import.meta.url)),
      '..', '..', 'packages', 'water-engine', 'src',
    );
    for (const f of readdirSync(engineSrc)) {
      const text = readFileSync(join(engineSrc, f), 'utf-8');
      expect(text).not.toMatch(/research/i);
      expect(text).not.toMatch(/may_be_used_as_factor/);
    }
  });
});
