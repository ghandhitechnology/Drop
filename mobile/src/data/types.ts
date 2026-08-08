/** Row shapes as SQLite hands them back, plus the app-facing views of them. */
import type {
  Confidence,
  Estimate,
  MatchLevel,
  MetricType,
  QuantitySource,
} from '@drop/water-engine';

/** How the item got in front of the person before they confirmed it. */
export type InputMethod = 'camera' | 'barcode' | 'search' | 'manual' | 'sample';

export type EntryCategory = 'food' | 'drink' | 'transport' | 'product';

export interface EntryRow {
  id: string;
  created_at: number;
  local_day: string;
  local_week: string;
  tz: string;
  item_id: string;
  item_label: string;
  category: EntryCategory;
  quantity_value: number;
  quantity_unit: string;
  quantity_source: QuantitySource;
  litres: number;
  litres_low: number | null;
  litres_high: number | null;
  metric_type: MetricType;
  match_level: MatchLevel | null;
  confidence: Confidence | null;
  input_method: InputMethod;
  factors_version: string;
  estimate_json: string;
  photo_uri: string | null;
  note: string | null;
  deleted_at: number | null;
}

/** An entry with its frozen estimate snapshot already parsed. */
export interface Entry extends EntryRow {
  estimate: Estimate;
}

export interface DailyTotalRow {
  local_day: string;
  total_litres: number;
  entry_count: number;
  by_category_json: string;
  updated_at: number;
}

export interface DailyTotal {
  localDay: string;
  totalLitres: number;
  entryCount: number;
  byCategory: Partial<Record<EntryCategory, number>>;
  updatedAt: number;
}

export interface CatalogItemRow {
  id: string;
  label: string;
  aliases: string;
  category: EntryCategory;
  default_unit: string;
  default_quantity: number;
  typology: string | null;
  search_blob: string;
  sort_rank: number;
}

export interface CatalogItem {
  id: string;
  label: string;
  aliases: string[];
  category: EntryCategory;
  defaultUnit: string;
  defaultQuantity: number;
  typology: string | null;
  /** Accent-stripped, lowercased haystack built once at seed time. */
  searchBlob: string;
  /**
   * `label` and `aliases`, normalised once at hydration. Unicode normalisation
   * is the expensive part of matching, so the search path never repeats it —
   * a keystroke compares flat strings only.
   */
  normalizedLabel: string;
  normalizedAliases: string[];
  sortRank: number;
}
