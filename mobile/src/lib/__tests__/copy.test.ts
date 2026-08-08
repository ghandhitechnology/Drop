/**
 * The voice test.
 *
 * Drop states what is true rather than what is missing. This walks every
 * string the copy module can produce — the literals, the results of every
 * exported function, and the rewritten engine assumptions — and fails on the
 * shapes the product does not use.
 */
import { describe, expect, it } from 'vitest';

import type { Confidence, Estimate, MetricType } from '../../features/capture/types';
import {
  MAX_ASSUMPTIONS,
  NEGATION_PATTERN,
  RANGE_HERO_RATIO,
  UNSUPPORTED_LINES,
  assumptionLines,
  confidenceChip,
  copy,
  fallbackLine,
  formatLitres,
  formatMultiple,
  hasSpread,
  formatQuantity,
  hasNegationVoice,
  heroFigure,
  litresSentence,
  metricLabel,
  formatRange,
  sourceRows,
  unsupportedLine,
} from '../copy';

/* ------------------------------------------------------------- fixtures */

const CONFIDENCES: Confidence[] = ['high', 'medium', 'low', 'very_low'];
const METRICS: MetricType[] = [
  'total_water_footprint',
  'freshwater_withdrawal',
  'freshwater_consumption',
  'scarcity_weighted_water_use',
];

/** Every fallback_reason the shipped factor tables produce. */
const FALLBACK_REASONS = [
  'single_source',
  'category_match',
  'stat_flags',
  'spend_proxy',
  'dataset_recommends_typology',
  'high_item_uncertainty_typology',
  'recipe_sum',
];

/**
 * The assumption strings the engine emits against factor tables 2026.08.1,
 * captured by walking all 463 catalog entries. The six that speak in negatives
 * are the reason `assumptionLines` exists.
 */
const ENGINE_ASSUMPTIONS = [
  'Quantity uses a typical serving size.',
  'Based on one published value; the range reflects similar foods.',
  'Metric: US freshwater withdrawal, estimated from the purchase price.',
  'Price basis: 2018 US purchaser dollars.',
  'A sector average carries no published spread, so no range is shown.',
  'Computed from the dish recipe, ingredient by ingredient.',
  'Based on 2 published studies; the dataset flags their spread.',
  'The group holds one published value, so no range is shown.',
  'Value uses the cheese group median, which is the figure the dataset recommends for this food.',
  'Fuel-cycle water only (crude production, crude transport, refining, distribution to pump).',
  'Vehicle manufacture, maintenance, and road/rail/airport infrastructure are excluded.',
  'Activity coefficient is a USLCI FY2025 Q2 technosphere exchange; USLCI water exchanges are deliberately not used (see uslci_audit.json).',
  'Freshwater consumption, not withdrawal.',
  'reference is passenger-km; occupancy already embedded — do NOT divide by occupancy again',
  'Matched by food category (starchy tubers).',
  'Secondary factors are published per kilogram; mass and volume treated 1:1 (the density of water).',
];

function estimateFixture(overrides: Partial<Estimate> = {}): Estimate {
  return {
    catalog_id: 'banana',
    display_name: 'Banana',
    category: 'food',
    factors_version: '2026.08.1',
    quantity: { value: 0.12, unit: 'kg', source: 'catalog_default' },
    headline: {
      value_l: 89.76,
      range_l: [57.54, 204.24],
      metric_type: 'total_water_footprint',
      proxy_metric: false,
    },
    factor: {
      factor_id: 'sel:typ:crops__fruit',
      dataset: 'su_eatable_life',
      dataset_release: 'SuEatableLife_Food_Footprint_database.xlsx',
      geography: 'GLO',
      system_boundary: 'cradle-to-distribution-centre',
      functional_unit: 'kg',
      metric_type: 'total_water_footprint',
      rights: 'CC BY 4.0',
    },
    match_level: 'typology',
    confidence: 'medium',
    fallback_reason: 'dataset_recommends_typology',
    assumptions: ENGINE_ASSUMPTIONS,
    secondary: [],
    unsupported: null,
    ...overrides,
  };
}

/** Every string the module can put on screen, in one flat list. */
function everyString(): string[] {
  const out: string[] = [];

  const walk = (node: unknown) => {
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    if (typeof node === 'function') {
      // Every copy function takes one or two display strings.
      out.push(String((node as (...args: string[]) => string)('Banana', '89.8 litres')));
      return;
    }
    if (node && typeof node === 'object') {
      Object.values(node).forEach(walk);
    }
  };

  walk(copy);

  CONFIDENCES.forEach((c) => out.push(confidenceChip(c)));
  out.push(confidenceChip(null));
  METRICS.forEach((m) => {
    out.push(metricLabel(m));
    out.push(copy.result.metricLine(metricLabel(m)));
  });
  FALLBACK_REASONS.forEach((r) => {
    const line = fallbackLine(r);
    if (line) out.push(line);
  });
  out.push(...UNSUPPORTED_LINES);
  out.push(...assumptionLines(estimateFixture()));

  const supported = estimateFixture();
  out.push(litresSentence(supported));
  const hero = heroFigure(supported);
  if (hero) out.push(`${hero.value} ${hero.unit}`);
  sourceRows(supported).forEach((row) => out.push(row.label));

  const unsupported = estimateFixture({
    catalog_id: 'transport_ev_car',
    display_name: 'Electric Car',
    category: 'transport',
    headline: null,
    factor: null,
    quantity: { value: 10, unit: 'km', source: 'catalog_default' },
    unsupported: { reason: 'grid water intensity unavailable in v1' },
  });
  out.push(litresSentence(unsupported));
  out.push(unsupportedLine(unsupported));

  return out;
}

/* ---------------------------------------------------------------- tests */

describe('the negation pattern', () => {
  it('catches every shape the product keeps out', () => {
    const banned = [
      'this is not right',
      "we can't do that",
      'Drop is unable to read it',
      'only a rough guess',
      'however, the number is high',
      'Disclaimer: this is an estimate',
      'cannot be read',
    ];
    banned.forEach((line) => expect(hasNegationVoice(line)).toBe(true));
  });

  it('leaves ordinary copy alone', () => {
    const fine = [
      'Point Drop at anything',
      'Nothing here yet',
      'A note about the source',
      'Fill the frame with one thing',
    ];
    fine.forEach((line) => expect(hasNegationVoice(line)).toBe(false));
  });
});

describe('every exported string', () => {
  const strings = everyString();

  it('produces a non-trivial corpus', () => {
    expect(strings.length).toBeGreaterThan(60);
  });

  it('speaks positively', () => {
    const offenders = strings.filter((line) => NEGATION_PATTERN.test(line));
    expect(offenders).toEqual([]);
  });

  it('carries no empty line', () => {
    expect(strings.filter((line) => line.trim().length === 0)).toEqual([]);
  });
});

describe('assumptionLines', () => {
  const lines = assumptionLines(estimateFixture());

  it('caps the list so the card stays readable', () => {
    expect(lines.length).toBeLessThanOrEqual(MAX_ASSUMPTIONS);
  });

  it('keeps the engine order', () => {
    expect(lines[0]).toBe('Quantity uses a typical serving size.');
  });

  it('rewrites the lines that speak in negatives', () => {
    const rewritten = assumptionLines(
      estimateFixture({
        assumptions: ['A sector average carries no published spread, so no range is shown.'],
      }),
    );
    expect(rewritten).toEqual([
      'A sector average is published as one figure, so the number stands alone.',
    ]);
  });

  it('drops the audit-trail notes', () => {
    const dropped = assumptionLines(
      estimateFixture({
        assumptions: [
          'Activity coefficient is a USLCI FY2025 Q2 technosphere exchange; USLCI water exchanges are deliberately not used (see uslci_audit.json).',
          'reference is passenger-km; occupancy already embedded — do NOT divide by occupancy again',
          'Freshwater consumption, not withdrawal.',
        ],
      }),
    );
    expect(dropped).toEqual([]);
  });

  it('never repeats a line', () => {
    const repeated = assumptionLines(
      estimateFixture({
        assumptions: ['Quantity uses a typical serving size.', 'Quantity uses a typical serving size.'],
      }),
    );
    expect(repeated).toHaveLength(1);
  });
});

describe('heroFigure', () => {
  it('makes the range the hero when it is wide', () => {
    const hero = heroFigure(estimateFixture());
    expect(hero).toEqual({ value: '57.5–204', unit: 'L', range: true });
  });

  it('makes the point value the hero when the range is tight', () => {
    const hero = heroFigure(
      estimateFixture({
        headline: {
          value_l: 120,
          range_l: [110, 130],
          metric_type: 'total_water_footprint',
          proxy_metric: false,
        },
      }),
    );
    expect(hero).toEqual({ value: '120', unit: 'litres', range: false });
  });

  it('uses the point value when there is no range', () => {
    const hero = heroFigure(
      estimateFixture({
        headline: {
          value_l: 8.4,
          range_l: null,
          metric_type: 'freshwater_withdrawal',
          proxy_metric: true,
        },
      }),
    );
    expect(hero).toEqual({ value: '8.4', unit: 'litres', range: false });
  });

  it('switches exactly at the ratio', () => {
    const at = heroFigure(
      estimateFixture({
        headline: {
          value_l: 100,
          range_l: [100, 100 * RANGE_HERO_RATIO],
          metric_type: 'total_water_footprint',
          proxy_metric: false,
        },
      }),
    );
    expect(at?.range).toBe(false);

    const just = heroFigure(
      estimateFixture({
        headline: {
          value_l: 100,
          range_l: [100, 100 * RANGE_HERO_RATIO + 1],
          metric_type: 'total_water_footprint',
          proxy_metric: false,
        },
      }),
    );
    expect(just?.range).toBe(true);
  });

  it('has no hero for an item whose figure arrives later', () => {
    expect(heroFigure(estimateFixture({ headline: null }))).toBeNull();
  });
});

describe('hasSpread', () => {
  it('keeps a range that says something', () => {
    expect(hasSpread([57.54, 204.24])).toBe(true);
    expect(hasSpread([110, 130])).toBe(true);
  });

  it('drops a range whose ends print the same', () => {
    expect(hasSpread([285, 285])).toBe(false);
    expect(hasSpread([285.01, 285.04])).toBe(false);
    expect(hasSpread(null)).toBe(false);
  });

  it('keeps the sentence to the point value when the ends collapse', () => {
    const line = litresSentence(
      estimateFixture({
        headline: {
          value_l: 285,
          range_l: [285, 285],
          metric_type: 'total_water_footprint',
          proxy_metric: false,
        },
      }),
    );
    expect(line).toBe('285 litres');
  });
});

describe('numbers', () => {
  it('groups thousands', () => {
    expect(formatLitres(15400)).toBe('15,400');
    expect(formatLitres(89.76)).toBe('89.8');
    expect(formatLitres(1.5003)).toBe('1.5');
  });

  it('writes a range with one unit at the end', () => {
    expect(formatRange([57.54, 204.24])).toBe('57.5–204 L');
  });

  it('scales small quantities into readable units', () => {
    expect(formatQuantity(0.12, 'kg')).toBe('120 g');
    expect(formatQuantity(1.5, 'kg')).toBe('1.5 kg');
    expect(formatQuantity(0.125, 'l')).toBe('125 ml');
    expect(formatQuantity(1.25, 'l')).toBe('1.25 L');
    expect(formatQuantity(10, 'km')).toBe('10 km');
    expect(formatQuantity(18.5, 'usd')).toBe('$18.5');
  });

  it('writes serving multiples', () => {
    expect(formatMultiple(1)).toBe('×1');
    expect(formatMultiple(2.5)).toBe('×2.5');
  });
});

describe('sourceRows', () => {
  it('reads dataset, release, geography, boundary, tables', () => {
    const rows = sourceRows(estimateFixture()).map((row) => row.label);
    expect(rows).toEqual(['Dataset', 'Release', 'Geography', 'Boundary', 'Factor tables']);
  });

  it('still names the factor tables when there is no factor', () => {
    const rows = sourceRows(estimateFixture({ factor: null }));
    expect(rows).toEqual([{ label: 'Factor tables', value: '2026.08.1' }]);
  });
});

describe('litresSentence', () => {
  it('reads the number and its range', () => {
    expect(litresSentence(estimateFixture())).toBe(
      '89.8 litres, ranging 57.5–204 L',
    );
  });

  it('offers the next move when the figure arrives later', () => {
    const line = litresSentence(
      estimateFixture({ catalog_id: 'transport_ev_car', headline: null }),
    );
    expect(line).toBe(
      'Grid water data arrives in a future update. Track the trip distance meanwhile?',
    );
  });
});
