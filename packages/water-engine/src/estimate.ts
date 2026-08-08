import type {
  CatalogEntry, Confidence, Estimate, EstimateInput, FactorRef, HestiaFactor,
  MatchLevel, MetricType, QuantitySource, SecondaryMetric,
  SelItem, SelTypology, Tables, TransportFactor,
} from './types';

const CONF_RANK: Record<Confidence, number> = {
  high: 3, medium: 2, low: 1, very_low: 0,
};

export function minConfidence(a: Confidence, b: Confidence): Confidence {
  return CONF_RANK[a] <= CONF_RANK[b] ? a : b;
}

/** Guard: a factor of the wrong metric type must never enter arithmetic
 * meant for another metric. This is the honesty backstop. */
export function assertMetricType(expected: MetricType, factor: FactorRef): void {
  if (factor.metric_type !== expected) {
    throw new Error(
      `metric type mismatch: needed ${expected}, got ${factor.metric_type} ` +
      `from ${factor.factor_id}`,
    );
  }
}

/** Largest quantity the engine will accept, in the caller's own unit. Beyond
 * this the input is a typo or an overflow probe, not a meal. */
const MAX_QUANTITY = 1e9;

function assertQuantityValue(value: number): number {
  if (!Number.isFinite(value) || !(value > 0) || value > MAX_QUANTITY) {
    throw new Error(
      `quantity must be a finite number greater than 0 and at most ${MAX_QUANTITY}`,
    );
  }
  return value;
}

/** Every litre the engine emits passes through here: a NaN or Infinity means
 * a factor or a quantity was broken, and a broken number must never ship. */
function litres(value: number, what: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`non-finite ${what}`);
  }
  return value;
}

function litreRange(
  range: [number, number] | null, what: string,
): [number, number] | null {
  if (!range) return null;
  return [litres(range[0], `${what} lower bound`), litres(range[1], `${what} upper bound`)];
}

/** SU-EATABLE typology names carry bookkeeping marks ('BEEF BONE FREE MEAT*',
 * 'VEGETAL MILK* (Soy milk)'). Readers should see the food, not the marks. */
function typologyName(raw: string): string {
  return raw
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\*+$/, '')
    .trim()
    .toLowerCase();
}

function selItemRef(it: SelItem): FactorRef {
  return {
    factor_id: it.factor_id,
    dataset: it.dataset,
    dataset_release: it.dataset_release,
    geography: it.geography,
    system_boundary: it.system_boundary,
    functional_unit: it.functional_unit,
    metric_type: it.metric_type,
    rights: it.rights,
  };
}

function selTypRef(t: SelTypology, functionalUnit: 'kg' | 'l'): FactorRef {
  return {
    factor_id: t.factor_id,
    dataset: t.dataset,
    dataset_release: t.dataset_release,
    geography: t.geography,
    system_boundary: t.system_boundary,
    functional_unit: functionalUnit,
    metric_type: t.metric_type,
    rights: t.rights,
  };
}

interface Resolved {
  perUnit: number;
  rangePerUnit: [number, number] | null;
  factor: FactorRef;
  matchLevel: MatchLevel;
  confidence: Confidence;
  fallbackReason: string | null;
  assumptions: string[];
}

/** `Suggested WF value` labels that tell us to read the group, not the item. */
const TYPOLOGY_SUGGESTIONS: ReadonlySet<string> = new Set([
  'better_typology',
  'item_matching_typology',
  'item_or_typology',
  'better_sub_typology',
]);

/** Shared shape for every typology-level answer: the group median, the group
 * spread, and the single-source demotion when the group has one study. */
function resolveTypology(
  typ: SelTypology,
  median: number,
  functionalUnit: 'kg' | 'l',
  fallbackReason: string,
  assumption: string,
): Resolved {
  const single = typ.stats.n === 1;
  return {
    perUnit: median,
    rangePerUnit: single ? null : rangeFromStats(typ.stats, median),
    factor: selTypRef(typ, functionalUnit),
    matchLevel: 'typology',
    confidence: single ? 'low' : 'medium',
    fallbackReason: single ? 'single_source' : fallbackReason,
    assumptions: single
      ? [assumption, 'The group holds one published value, so no range is shown.']
      : [assumption],
  };
}

/** SU-EATABLE item resolution: the water_logic fallback order, literally. */
function resolveSelItem(it: SelItem, tables: Tables): Resolved {
  const typ = tables.selTypologies.get(typFactorId(it.typology_key)) ?? null;
  const datasetRedirect = TYPOLOGY_SUGGESTIONS.has(it.suggested_value);

  if (datasetRedirect || it.uncertainty === 'H') {
    // The dataset itself points at the group value — either through the
    // `Suggested WF value` column or through a high-uncertainty item flag.
    const median = typ?.stats.median ?? it.typology_value_l_per_kg;
    if (median == null || !typ) {
      throw new Error(`no typology fallback for ${it.factor_id}`);
    }
    const name = typologyName(typ.typology);
    return resolveTypology(
      typ,
      median,
      it.functional_unit,
      datasetRedirect ? 'dataset_recommends_typology' : 'high_item_uncertainty_typology',
      datasetRedirect
        ? `Value uses the ${name} group median, which is the figure the dataset recommends for this food.`
        : `Value uses the ${name} group median (the dataset marks the single-item figure as high-uncertainty).`,
    );
  }

  const s = it.stats;
  // Spread flags matter at every sample size, not only once n reaches 4.
  const flagged = it.flags.outlier === 'R' || it.flags.normality === 'R';
  if (s.n >= 4) {
    return {
      perUnit: it.value_l_per_kg,
      rangePerUnit: s.q1 != null && s.q3 != null ? [s.q1, s.q3] : null,
      factor: selItemRef(it),
      matchLevel: 'exact_item',
      confidence: flagged ? 'medium' : 'high',
      fallbackReason: flagged ? 'stat_flags' : null,
      assumptions: flagged
        ? [`Based on ${s.n} published studies; the dataset flags their spread.`]
        : [],
    };
  }
  if (s.n >= 2) {
    return {
      perUnit: it.value_l_per_kg,
      rangePerUnit: s.min != null && s.max != null ? [s.min, s.max] : null,
      factor: selItemRef(it),
      matchLevel: 'exact_item',
      confidence: 'medium',
      fallbackReason: flagged ? 'stat_flags' : null,
      assumptions: flagged
        ? [`Based on ${s.n} published studies; the dataset flags their spread.`]
        : [`Based on ${s.n} published studies.`],
    };
  }
  // Single published value: honest about it — low confidence, range borrowed
  // from the item's typology spread.
  return {
    perUnit: it.value_l_per_kg,
    rangePerUnit: rangeFromStats(typ?.stats ?? null, it.value_l_per_kg),
    factor: selItemRef(it),
    matchLevel: 'exact_item',
    confidence: 'low',
    fallbackReason: 'single_source',
    assumptions: ['Based on one published value; the range reflects similar foods.'],
  };
}

/** A borrowed spread has to contain the number it is shown next to, so the
 * band covers the statistics *and* the centre. A band with no width is not a
 * range — it is a false precision claim, so it is dropped. */
function rangeFromStats(
  stats: SelTypology['stats'] | null,
  center: number,
): [number, number] | null {
  if (!stats) return null;
  let lo = stats.q1 ?? stats.min ?? null;
  let hi = stats.q3 ?? stats.max ?? null;
  if (lo == null || hi == null) return null;
  const lf = stats.lower_fence ?? null;
  const uf = stats.upper_fence ?? null;
  if (lf != null) lo = Math.max(lo, lf);
  if (uf != null) hi = Math.min(hi, uf);
  lo = Math.max(0, Math.min(lo, center));
  hi = Math.max(hi, center);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo)) return null;
  return [lo, hi];
}

function typFactorId(typologyKey: string): string {
  const [group, typ] = typologyKey.split('|');
  const slug = (s: string) =>
    s!.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `sel:typ:${slug(group!)}__${slug(typ!)}`;
}

const KNOWN_QUANTITY_SOURCES: ReadonlySet<string> = new Set<QuantitySource>([
  'package_label', 'user_entered', 'vision_estimate', 'catalog_default',
]);

/** An estimated quantity caps the whole estimate at low confidence — see the
 * confidence table in water_logic/README.md. An unrecognised source is
 * treated as an estimate: unknown provenance never buys confidence. */
function capByQuantitySource(
  conf: Confidence, source: QuantitySource,
): { conf: Confidence; note: string | null } {
  const known = KNOWN_QUANTITY_SOURCES.has(source);
  const effective: QuantitySource = known ? source : 'vision_estimate';
  if (effective === 'catalog_default' || effective === 'vision_estimate') {
    return {
      conf: minConfidence(conf, 'low'),
      note: !known
        ? 'Quantity source is unrecognised, so it is treated as an estimate.'
        : effective === 'catalog_default'
          ? 'Quantity uses a typical serving size.'
          : 'Quantity estimated from the photo.',
    };
  }
  return { conf, note: null };
}

interface NormalizedQuantity {
  value: number;
  unit: 'kg' | 'l' | 'km' | 'usd';
  assumptions: string[];
  /** True when litres were read as kilograms or the reverse. */
  substituted: boolean;
}

function normalizeQuantity(
  input: EstimateInput, entry: CatalogEntry,
): NormalizedQuantity {
  const q = input.quantity;
  assertQuantityValue(q.value);
  const assumptions: string[] = [];
  const target: 'kg' | 'l' | 'km' | 'usd' =
    entry.category === 'transport' ? 'km'
      : entry.category === 'product' ? 'usd'
        : entry.state === 'liquid' ? 'l' : 'kg';

  let value: number;
  switch (q.unit) {
    case 'g': value = q.value / 1000; break;
    case 'ml': value = q.value / 1000; break;
    case 'item': {
      value = q.value * entry.default_quantity.value;
      assumptions.push(
        `Each item counted as ${entry.default_quantity.value} ${entry.default_quantity.unit} (${entry.default_quantity.basis}).`,
      );
      break;
    }
    default: value = q.value;
  }

  const given = q.unit === 'g' ? 'kg' : q.unit === 'ml' ? 'l' : q.unit === 'item' ? entry.default_quantity.unit : q.unit;
  let substituted = false;
  if (given !== target) {
    if ((given === 'kg' && target === 'l') || (given === 'l' && target === 'kg')) {
      substituted = true;
      assumptions.push(
        given === 'l'
          ? 'Quantity given in litres but the factor is per kilogram; 1 litre was counted as 1 kilogram (the density of water).'
          : 'Quantity given in kilograms but the factor is per litre; 1 kilogram was counted as 1 litre (the density of water).',
      );
    } else {
      throw new Error(
        `quantity unit ${q.unit} does not fit ${entry.catalog_id} (${target})`,
      );
    }
  }
  assertQuantityValue(value);
  return { value, unit: target, assumptions, substituted };
}

function hestiaRef(h: HestiaFactor): FactorRef {
  return {
    factor_id: h.factor_id,
    dataset: h.dataset,
    dataset_release: h.dataset_release,
    geography: h.geography,
    system_boundary: h.system_boundary,
    functional_unit: h.functional_unit,
    metric_type: h.metric_type,
    rights: h.rights,
  };
}

function secondaryMetrics(
  entry: CatalogEntry, tables: Tables, kgOrL: number, origin?: string,
): { metrics: SecondaryMetric[]; assumptions: string[] } {
  const metrics: SecondaryMetric[] = [];
  const assumptions: string[] = [];

  const rows: HestiaFactor[] = [];
  for (const link of entry.factor_links.secondary) {
    const h = tables.hestia.get(link.factor_id);
    if (h && h.value_l_per_kg != null) rows.push(h);
  }
  const global = rows.filter((h) => h.geography === 'GLO');
  let chosen = origin ? rows.filter((h) => h.geography === origin) : global;
  if (origin && chosen.length === 0 && global.length > 0) {
    chosen = global;
    assumptions.push(
      `No country-specific freshwater-withdrawal data for ${origin}; the global figure is shown instead.`,
    );
  }

  const proxyLink = entry.factor_links.proxy;
  const owid = proxyLink ? tables.owid.get(proxyLink.factor_id) ?? null : null;

  // HESTIA and OWID both publish per kilogram; a litre of a drink is read as a
  // kilogram before the multiplication.
  if (entry.state === 'liquid' && (chosen.length > 0 || owid)) {
    assumptions.push(
      'Secondary factors are published per kilogram; mass and volume treated 1:1 (the density of water).',
    );
  }

  for (const h of chosen) {
    const factor = hestiaRef(h);
    assertMetricType(h.metric_type, factor);
    metrics.push({
      metric_type: h.metric_type,
      label: `Freshwater withdrawal · ${h.geography === 'GLO' ? 'global' : h.geography}`,
      value_l: litres(h.value_l_per_kg! * kgOrL, `secondary value for ${h.factor_id}`),
      geography: h.geography,
      proxy_metric: false,
      factor,
    });
  }

  if (owid) {
    const factor: FactorRef = {
      factor_id: owid.factor_id,
      dataset: owid.dataset,
      dataset_release: owid.dataset_release,
      geography: owid.geography,
      system_boundary: owid.system_boundary,
      functional_unit: owid.functional_unit,
      metric_type: owid.metric_type,
      rights: owid.rights,
    };
    assertMetricType(owid.metric_type, factor);
    metrics.push({
      metric_type: owid.metric_type,
      label: 'Freshwater withdrawal · global cross-check',
      value_l: litres(owid.value_l_per_kg * kgOrL, `proxy value for ${owid.factor_id}`),
      geography: owid.geography,
      proxy_metric: true,
      factor,
    });
  }

  return { metrics, assumptions };
}

/** Transport factors are Drop composites: a USLCI activity coefficient times a
 * literature water intensity. Both halves must name themselves. */
function transportRef(tf: TransportFactor): FactorRef {
  const activity = tf.provenance?.activity;
  const water = tf.provenance?.water_intensity;
  if (!tf.metric_type) {
    throw new Error(`transport factor ${tf.mode} has no metric_type`);
  }
  if (!tf.functional_unit) {
    throw new Error(`transport factor ${tf.mode} has no functional_unit`);
  }
  if (!tf.geography) {
    throw new Error(`transport factor ${tf.mode} has no geography`);
  }
  if (!activity?.dataset_release || !water?.citation) {
    throw new Error(`transport factor ${tf.mode} has no provenance`);
  }
  return {
    factor_id: tf.factor_id!,
    dataset: 'drop_transport',
    dataset_release:
      `activity: ${activity.dataset_release}; water intensity: ${water.citation}`,
    geography: tf.geography,
    system_boundary: tf.system_boundary ?? null,
    functional_unit: tf.functional_unit,
    metric_type: tf.metric_type,
    rights: tf.rights ?? null,
  };
}

export function estimate(input: EstimateInput, tables: Tables): Estimate {
  const entry = tables.catalog.get(input.catalog_id);
  if (!entry) throw new Error(`unknown catalog_id ${input.catalog_id}`);

  const base: Omit<Estimate,
    'headline' | 'factor' | 'match_level' | 'confidence' | 'fallback_reason'
    | 'assumptions' | 'secondary' | 'unsupported' | 'quantity'> = {
    catalog_id: entry.catalog_id,
    display_name: entry.display_name,
    category: entry.category,
    factors_version: tables.version,
  };

  if (entry.unsupported) {
    // Nothing is computed, so nothing is converted: echo what the caller sent.
    return {
      ...base,
      quantity: {
        value: assertQuantityValue(input.quantity.value),
        unit: input.quantity.unit,
        source: input.quantity.source,
      },
      headline: null, factor: null, match_level: null, confidence: null,
      fallback_reason: null, assumptions: [],
      secondary: [],
      unsupported: { reason: entry.unsupported.reason },
    };
  }

  const q = normalizeQuantity(input, entry);
  const assumptions = [...q.assumptions];

  // ---- transport --------------------------------------------------------
  if (entry.category === 'transport') {
    const link = entry.factor_links.primary;
    const tf = link?.factor_id ? tables.transport.get(link.factor_id) : null;
    if (!tf || !tf.factor_id || tf.value_l_per_pkm == null) {
      throw new Error(`transport factor missing for ${entry.catalog_id}`);
    }
    const factor = transportRef(tf);
    assertMetricType('freshwater_consumption', factor);
    if (!tf.confidence) {
      throw new Error(`transport factor ${tf.mode} has no confidence`);
    }
    const cap = capByQuantitySource(tf.confidence, input.quantity.source);
    if (cap.note) assumptions.push(cap.note);
    for (const a of tf.assumptions ?? []) assumptions.push(a);
    return {
      ...base,
      quantity: { value: q.value, unit: q.unit, source: input.quantity.source },
      headline: {
        value_l: litres(tf.value_l_per_pkm * q.value, 'transport headline'),
        range_l: litreRange(
          tf.range_l ? [tf.range_l.low * q.value, tf.range_l.high * q.value] : null,
          'transport headline range',
        ),
        metric_type: factor.metric_type,
        proxy_metric: false,
      },
      factor,
      match_level: 'transport_mode',
      confidence: cap.conf,
      fallback_reason: null,
      assumptions,
      secondary: [],
      unsupported: null,
    };
  }

  // ---- everyday product (spend proxy) -----------------------------------
  if (entry.category === 'product') {
    const link = entry.factor_links.spend;
    const sector = link ? tables.useeio.get(link.factor_id) : null;
    if (!sector || sector.value_l_per_usd_purchaser == null) {
      throw new Error(`spend factor missing for ${entry.catalog_id}`);
    }
    const factor: FactorRef = {
      factor_id: sector.factor_id,
      dataset: sector.dataset,
      dataset_release: sector.dataset_release,
      geography: sector.geography,
      system_boundary: sector.system_boundary,
      functional_unit: `USD (${sector.price_year} purchaser price)`,
      metric_type: sector.metric_type,
      rights: sector.rights,
    };
    assertMetricType('freshwater_withdrawal', factor);
    const value = litres(
      sector.value_l_per_usd_purchaser * q.value, 'spend proxy headline',
    );
    assumptions.push(
      'Metric: US freshwater withdrawal, estimated from the purchase price.',
      `Price basis: ${sector.price_year} US purchaser dollars.`,
      'A sector average carries no published spread, so no range is shown.',
    );
    return {
      ...base,
      quantity: { value: q.value, unit: q.unit, source: input.quantity.source },
      headline: {
        value_l: value,
        // The dataset publishes a sector mean and nothing else; any band here
        // would be invented.
        range_l: null,
        metric_type: 'freshwater_withdrawal',
        proxy_metric: true,
      },
      factor,
      match_level: 'proxy_sector',
      confidence: 'very_low',
      fallback_reason: 'spend_proxy',
      assumptions,
      secondary: [],
      unsupported: null,
    };
  }

  // ---- recipe -----------------------------------------------------------
  if (entry.recipe) {
    let total = 0;
    let rangeLo = 0;
    let rangeHi = 0;
    let haveRange = true;
    let conf: Confidence = 'high';
    for (const comp of entry.recipe) {
      const it = tables.selItems.get(comp.factor_id);
      if (!it) throw new Error(`recipe component missing: ${comp.factor_id}`);
      const r = resolveSelItem(it, tables);
      assertMetricType('total_water_footprint', r.factor);
      const mass = q.value * comp.fraction;
      total += r.perUnit * mass;
      if (r.rangePerUnit) {
        rangeLo += r.rangePerUnit[0] * mass;
        rangeHi += r.rangePerUnit[1] * mass;
      } else {
        rangeLo += r.perUnit * mass;
        rangeHi += r.perUnit * mass;
        haveRange = false;
      }
      conf = minConfidence(conf, r.confidence);
    }
    conf = minConfidence(conf, 'medium');
    let fallbackReason: string | null = null;
    if (q.substituted) {
      conf = minConfidence(conf, 'low');
      fallbackReason = 'unit_substitution';
    }
    const cap = capByQuantitySource(conf, input.quantity.source);
    if (cap.note) assumptions.push(cap.note);
    assumptions.push('Computed from the dish recipe, ingredient by ingredient.');
    return {
      ...base,
      quantity: { value: q.value, unit: q.unit, source: input.quantity.source },
      headline: {
        value_l: litres(total, 'recipe headline'),
        range_l: litreRange(
          haveRange || rangeLo !== rangeHi ? [rangeLo, rangeHi] : null,
          'recipe headline range',
        ),
        metric_type: 'total_water_footprint',
        proxy_metric: false,
      },
      factor: null,
      match_level: 'recipe_sum',
      confidence: cap.conf,
      fallback_reason: fallbackReason,
      assumptions,
      secondary: [],
      unsupported: null,
    };
  }

  // ---- food & drink -----------------------------------------------------
  const link = entry.factor_links.primary;
  if (!link?.factor_id) {
    throw new Error(`no primary factor for ${entry.catalog_id}`);
  }

  const functionalUnit: 'kg' | 'l' = entry.state === 'liquid' ? 'l' : 'kg';
  let resolved: Resolved;
  if (link.factor_id.startsWith('sel:item:')) {
    const it = tables.selItems.get(link.factor_id);
    if (!it) throw new Error(`missing item factor ${link.factor_id}`);
    resolved = resolveSelItem(it, tables);
  } else {
    const t = tables.selTypologies.get(link.factor_id);
    if (!t || t.stats.median == null) {
      throw new Error(`missing typology factor ${link.factor_id}`);
    }
    resolved = resolveTypology(
      t,
      t.stats.median,
      functionalUnit,
      'category_match',
      `Matched by food category (${typologyName(t.typology)}).`,
    );
  }
  assertMetricType('total_water_footprint', resolved.factor);

  let conf = resolved.confidence;
  let fallbackReason = resolved.fallbackReason;
  if (q.substituted) {
    conf = minConfidence(conf, 'low');
    fallbackReason = 'unit_substitution';
  }
  const cap = capByQuantitySource(conf, input.quantity.source);
  if (cap.note) assumptions.push(cap.note);
  for (const a of resolved.assumptions) assumptions.push(a);

  const secondary = secondaryMetrics(
    entry, tables, q.value, input.origin_country,
  );
  for (const a of secondary.assumptions) assumptions.push(a);

  return {
    ...base,
    quantity: { value: q.value, unit: q.unit, source: input.quantity.source },
    headline: {
      value_l: litres(resolved.perUnit * q.value, 'headline'),
      range_l: litreRange(
        resolved.rangePerUnit
          ? [resolved.rangePerUnit[0] * q.value, resolved.rangePerUnit[1] * q.value]
          : null,
        'headline range',
      ),
      metric_type: 'total_water_footprint',
      proxy_metric: false,
    },
    factor: resolved.factor,
    match_level: resolved.matchLevel,
    confidence: cap.conf,
    fallback_reason: fallbackReason,
    assumptions,
    secondary: secondary.metrics,
    unsupported: null,
  };
}
