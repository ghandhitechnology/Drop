/**
 * The credits, read out of the data itself.
 *
 * Nothing here is a hand-written list of sources. Every name, release, and
 * rights line is lifted from the factor tables in the bundle at the moment the
 * settings screen opens, so a factors release that changes a citation changes
 * this screen with it and a table that is swapped out takes its credit along.
 * A hard-coded credits list is a promise that goes stale in silence.
 *
 * Two shapes of attribution appear. Most tables publish a `rights` string, and
 * that is what the row shows. The transport table carries its provenance
 * instead — the activity record it was built from and the study behind the
 * water intensity — so those are shown in the rights line's place. Either way
 * the row says where the number came from and under what terms it travels.
 */
import { rawTables } from '../../data/tables';

export type CreditLine = { label: string; value: string };

export type DatasetCredit = {
  /** Table key, and the React key. */
  id: string;
  /** The dataset's own name, in the words its publisher uses. */
  name: string;
  /** Release, rights, and any provenance the table carries in their place. */
  lines: CreditLine[];
  /** Rows behind the credit. A dataset's size is part of what it is. */
  rows: number;
};

/* ------------------------------------------------------------- reading */

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function rowsOf(table: unknown, key: string): unknown[] {
  const list = (table as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(list) ? list : [];
}

/**
 * The first row that carries a given field.
 *
 * A table is one release, so every row agrees about its release and its rights;
 * walking until one answers protects the credit from a single row that happens
 * to be missing the field rather than implying the rows disagree.
 */
function firstString(rows: unknown[], path: string[]): string | null {
  for (const row of rows) {
    let node: unknown = row;
    for (const key of path) {
      node = (node as Record<string, unknown> | null | undefined)?.[key];
      if (node == null) break;
    }
    const found = str(node);
    if (found) return found;
  }
  return null;
}

/* ------------------------------------------------------------- credits */

/** Labels for the credit lines. Kept beside the reader that produces them. */
export type CreditLabels = {
  release: (value: string) => string;
  rights: (value: string) => string;
  source: (value: string) => string;
};

/**
 * Every dataset behind a litre, in the order a person meets them: the food
 * tables first, because most captures are food, then transport, then the
 * economic proxy that stands behind everything else.
 */
export function datasetCredits(labels: CreditLabels): DatasetCredit[] {
  const credits: DatasetCredit[] = [];

  const simple = (
    id: string,
    name: string,
    rows: unknown[],
  ): void => {
    const release = firstString(rows, ['dataset_release']);
    const rights = firstString(rows, ['rights']);
    const lines: CreditLine[] = [];
    if (release) lines.push({ label: 'release', value: labels.release(release) });
    if (rights) lines.push({ label: 'rights', value: labels.rights(rights) });
    credits.push({ id, name, lines, rows: rows.length });
  };

  simple(
    'food_sueatable',
    'SuEatableLife',
    rowsOf(rawTables.food_sueatable, 'food_items'),
  );
  simple(
    'food_hestia_country',
    'HESTIA',
    rowsOf(rawTables.food_hestia_country, 'hestia_factors'),
  );
  simple(
    'food_owid_proxy',
    'Our World in Data',
    rowsOf(rawTables.food_owid_proxy, 'owid_factors'),
  );

  // Transport is built rather than published: an activity record supplies the
  // fuel per passenger-kilometre and a study supplies the water per litre of
  // fuel. Both travel with the number, so both are credited.
  const transport = rowsOf(rawTables.transport_factors, 'transport_factors');
  const activity = firstString(transport, ['provenance', 'activity', 'dataset_release']);
  const water = firstString(transport, ['provenance', 'water_intensity', 'citation']);
  const transportLines: CreditLine[] = [];
  if (activity) transportLines.push({ label: 'release', value: labels.release(activity) });
  if (water) transportLines.push({ label: 'source', value: labels.source(water) });
  credits.push({
    id: 'transport_factors',
    name: 'Transport fuel cycle',
    lines: transportLines,
    rows: transport.length,
  });

  simple(
    'sector_useeio',
    'USEEIO',
    rowsOf(rawTables.sector_useeio, 'useeio_sectors'),
  );

  return credits;
}

/** How many things Drop knows by name, for the line above the credits. */
export function catalogSize(): number {
  const entries = (rawTables.catalog as { entries?: unknown } | undefined)?.entries;
  return Array.isArray(entries) ? entries.length : 0;
}
