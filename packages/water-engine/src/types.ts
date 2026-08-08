/** Shared contracts for the grounded-analysis engine.
 *
 * The engine is a pure function over (input, tables). It never does I/O and
 * never invents a number: every litre traces to a factor row in the
 * versioned tables.
 */

export type MetricType =
  | 'total_water_footprint'
  | 'freshwater_withdrawal'
  | 'freshwater_consumption'
  | 'scarcity_weighted_water_use';

export type Confidence = 'high' | 'medium' | 'low' | 'very_low';

export type MatchLevel =
  | 'exact_item'
  | 'sub_typology'
  | 'typology'
  | 'category_match'
  | 'recipe_sum'
  | 'transport_mode'
  | 'proxy_sector'
  | 'proxy_owid'
  | 'broad_group';

export type QuantityUnit = 'kg' | 'g' | 'l' | 'ml' | 'km' | 'usd' | 'item';

export type QuantitySource =
  | 'package_label'
  | 'user_entered'
  | 'vision_estimate'
  | 'catalog_default';

export interface EstimateInput {
  catalog_id: string;
  quantity: { value: number; unit: QuantityUnit; source: QuantitySource };
  /** ISO-3166-1 alpha-2; unlocks country-specific secondary metrics. */
  origin_country?: string;
}

export interface FactorRef {
  factor_id: string;
  dataset: string;
  dataset_release: string;
  geography: string;
  system_boundary: string | null;
  functional_unit: string;
  metric_type: MetricType;
  rights?: string | null;
}

export interface SecondaryMetric {
  metric_type: MetricType;
  label: string;
  value_l: number;
  geography: string;
  proxy_metric: boolean;
  factor: FactorRef;
}

export interface Estimate {
  catalog_id: string;
  display_name: string;
  category: 'food' | 'drink' | 'transport' | 'product';
  headline: {
    value_l: number;
    range_l: [number, number] | null;
    metric_type: MetricType;
    proxy_metric: boolean;
  } | null;
  quantity: {
    value: number;
    /** The unit the value is expressed in. Computed estimates normalize to
     * kg / l / km / usd; an unsupported entry echoes the caller's own unit,
     * because nothing was converted. */
    unit: QuantityUnit;
    source: QuantitySource;
  };
  factor: FactorRef | null;
  match_level: MatchLevel | null;
  confidence: Confidence | null;
  fallback_reason: string | null;
  assumptions: string[];
  secondary: SecondaryMetric[];
  unsupported: { reason: string } | null;
  factors_version: string;
}

/* ---- table row shapes (subset of the pipeline JSON we rely on) ---- */

export interface SelStats {
  n: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  q1: number | null;
  q3: number | null;
  lower_fence?: number | null;
  upper_fence?: number | null;
}

export interface SelItem {
  factor_id: string;
  dataset: string;
  dataset_release: string;
  display_name: string;
  group: string;
  typology: string;
  typology_key: string;
  metric_type: MetricType;
  value_l_per_kg: number;
  typology_value_l_per_kg: number | null;
  functional_unit: 'kg' | 'l';
  uncertainty: 'L' | 'H';
  suggested_value: string;
  stats: SelStats;
  flags: { size: string; outlier: string; normality: string };
  geography: string;
  system_boundary: string;
  rights: string;
}

export interface SelTypology {
  factor_id: string;
  dataset: string;
  dataset_release: string;
  typology: string;
  typology_key: string;
  group: string;
  metric_type: MetricType;
  stats: SelStats;
  geography: string;
  system_boundary: string;
  rights: string;
}

export interface HestiaFactor {
  factor_id: string;
  dataset: string;
  dataset_release: string;
  product_name: string;
  geography: string;
  metric_type: MetricType;
  value_l_per_kg: number | null;
  functional_unit: string;
  system_boundary: string;
  rights: string;
}

export interface OwidFactor {
  factor_id: string;
  dataset: string;
  dataset_release: string;
  entity: string;
  metric_type: MetricType;
  proxy_metric: boolean;
  value_l_per_kg: number;
  functional_unit: string;
  geography: string;
  system_boundary: string;
  rights: string;
}

/** A Drop transport factor is a composite: a USLCI activity coefficient
 * (fuel per passenger-km or tonne-km) times a literature water intensity.
 * Both halves name themselves here so the FactorRef can be built from them. */
export interface TransportProvenance {
  activity?: {
    source?: string;
    factor_id?: string;
    dataset_release?: string;
    process_name?: string;
    process_uuid?: string;
    reference_unit?: string;
    fuel_flow?: string;
    fuel_amount_l?: number;
    valid_from?: string | null;
    valid_until?: string | null;
  };
  water_intensity?: {
    source?: string;
    citation?: string;
    basis?: string;
    fuel?: string;
    geography?: string;
    metric_type?: MetricType;
    value_l_per_l_fuel?: number;
    year?: number;
  };
}

export interface TransportFactor {
  factor_id?: string;
  mode: string;
  display?: string;
  unsupported?: boolean;
  reason?: string;
  functional_unit?: string;
  geography?: string;
  system_boundary?: string | null;
  rights?: string | null;
  /** Passenger modes. Freight modes carry `value_l_per_tkm` instead. */
  value_l_per_pkm?: number;
  value_l_per_tkm?: number;
  range_l?: { low: number; high: number };
  metric_type?: MetricType;
  confidence?: Confidence;
  assumptions?: string[];
  provenance?: TransportProvenance;
}

export interface UseeioSector {
  factor_id: string;
  dataset: string;
  dataset_release: string;
  sector_code: string;
  name: string;
  metric_type: MetricType;
  proxy_metric: boolean;
  value_l_per_usd_purchaser: number | null;
  price_year: number;
  geography: string;
  system_boundary: string;
  rights: string;
}

export interface CatalogEntry {
  catalog_id: string;
  display_name: string;
  synonyms: string[];
  category: 'food' | 'drink' | 'transport' | 'product';
  state: 'solid' | 'liquid';
  default_quantity: { value: number; unit: string; basis: string };
  factor_links: {
    primary: { factor_id: string | null; match_level: string } | null;
    typology: { factor_id: string } | null;
    secondary: { factor_id: string; metric_type: string }[];
    proxy: { factor_id: string; metric_type: string } | null;
    spend: { factor_id: string; match_level: string } | null;
  };
  recipe:
    | { item_catalog_id: string; factor_id: string; fraction: number }[]
    | null;
  catalog_source?: {
    dataset: string;
    dataset_release: string;
    record_id: string;
    food_code: string;
    category: string;
    portion_id: number;
    portion_description: string;
    mapping_basis: string;
    mapping_config: string;
    review_status: 'approved';
    rights: string;
  };
  unsupported?: { reason: string };
  search_tokens: string;
}

export interface Tables {
  version: string;
  catalog: Map<string, CatalogEntry>;
  selItems: Map<string, SelItem>;
  selTypologies: Map<string, SelTypology>;
  hestia: Map<string, HestiaFactor>;
  owid: Map<string, OwidFactor>;
  transport: Map<string, TransportFactor>;
  useeio: Map<string, UseeioSector>;
}
