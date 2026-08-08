import { Hono } from 'hono';
import { tables, FACTORS_VERSION } from '../data';
import { chatJSONRetry } from '../services/openrouter';
import { searchCatalog, validateCatalogId } from '../services/catalogMatch';

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_FIELDS = [
  'product_name', 'brands', 'quantity', 'product_quantity',
  'product_quantity_unit', 'categories_tags', 'categories_hierarchy',
  'ingredients_tags', 'countries_tags', 'last_modified_t',
].join(',');

interface OffProduct {
  product_name?: string;
  brands?: string;
  quantity?: string;
  product_quantity?: number | string;
  product_quantity_unit?: string;
  categories_tags?: string[];
  categories_hierarchy?: string[];
  ingredients_tags?: string[];
  countries_tags?: string[];
  last_modified_t?: number;
}

/** off tag -> catalog entry, built once from the catalog itself. */
const tagIndex = new Map<string, string>();
for (const e of tables.catalog.values()) {
  for (const tag of (e as { off_category_tags?: string[] }).off_category_tags ?? []) {
    tagIndex.set(tag, e.catalog_id);
  }
}

const cache = new Map<string, { at: number; ttl: number; body: object }>();
const CACHE_MAX = 500;
const TTL = 24 * 3600 * 1000;
/** A transient OFF outage (network/timeout/5xx) must not become a day-long
 * negative cache entry — retry it again soon instead. */
const UNAVAILABLE_TTL = 60 * 1000;

/** OFF label quantities arrive in whatever unit the product carries
 * (g, ml, l, or cl). Normalize to the units the engine accepts. Exported
 * for direct unit testing — cl in particular is easy to get wrong (it's
 * 1/100 of a litre, i.e. 10 ml, not 1/100 of a ml). */
export function parseLabelQuantity(
  productQuantity: number, rawUnit: string,
): { value: number; unit: 'g' | 'ml' | 'l' } {
  const unit = rawUnit.toLowerCase();
  if (unit === 'l') return { value: productQuantity, unit: 'l' };
  if (unit === 'cl') return { value: productQuantity * 10, unit: 'ml' };
  if (unit === 'ml') return { value: productQuantity, unit: 'ml' };
  return { value: productQuantity, unit: 'g' };
}

/** How many catalog rows the mapping prompt is allowed to carry. The catalog
 * is ~1000 entries; naming all of them costs more tokens than the whole rest
 * of the request and buries the handful that could actually match. */
const SHORTLIST_LIMIT = 25;

/** OFF tags arrive locale-prefixed and hyphenated ("en:fruit-juices"); the
 * catalog's search tokens are plain words, so strip both before searching. */
function shortlistQuery(off: OffProduct): string {
  const tags = (off.categories_tags ?? []).map(
    (t) => t.replace(/^[a-z]{2}:/, '').replace(/-/g, ' '),
  );
  return [off.product_name ?? '', ...tags].join(' ');
}

export const barcode = new Hono();

barcode.get('/:ean', async (c) => {
  const ean = c.req.param('ean').replace(/\D/g, '');
  if (ean.length < 8) return c.json({ error: 'invalid barcode' }, 400);
  const hit = cache.get(ean);
  if (hit && Date.now() - hit.at < hit.ttl) return c.json(hit.body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  let off: OffProduct | null = null;
  let offStatus: 'found' | 'missing' | 'unavailable' = 'unavailable';
  try {
    const res = await fetch(`${OFF_URL}/${ean}.json?fields=${OFF_FIELDS}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Drop/0.1 (water footprint tracker; hataewook12@gmail.com)' },
    });
    if (res.ok) {
      const data = await res.json() as { status: number; product?: OffProduct };
      if (data.status === 1 && data.product) {
        off = data.product;
        offStatus = 'found';
      } else {
        offStatus = 'missing';
      }
    }
  } catch {
    offStatus = 'unavailable';
  } finally {
    clearTimeout(timer);
  }

  let mapping: {
    catalog_id: string | null;
    match_level: string;
    confidence: string;
    evidence: string[];
  } = { catalog_id: null, match_level: 'none', confidence: 'none', evidence: [] };

  if (off) {
    // 1) exact category-tag intersection
    for (const tag of off.categories_tags ?? []) {
      const cid = tagIndex.get(tag);
      if (cid) {
        mapping = {
          catalog_id: cid,
          match_level: 'off_category_exact',
          confidence: 'medium',
          evidence: [`categories_tags contains ${tag}`],
        };
        break;
      }
    }
    // 2) walk hierarchy upward (most specific last in OFF hierarchy)
    if (!mapping.catalog_id) {
      const hier = [...(off.categories_hierarchy ?? [])].reverse();
      for (const tag of hier) {
        const cid = tagIndex.get(tag);
        if (cid) {
          mapping = {
            catalog_id: cid,
            match_level: 'off_category_parent',
            confidence: 'medium',
            evidence: [`categories_hierarchy parent ${tag}`],
          };
          break;
        }
      }
    }
    // 3) LLM-assisted over a searched shortlist, capped medium. Nothing to
    // shortlist means nothing for the model to choose between, so skip the
    // call and let this fall through to coverage_miss.
    const shortlist = mapping.catalog_id || !off.product_name
      ? []
      : searchCatalog(shortlistQuery(off), tables, SHORTLIST_LIMIT);
    if (shortlist.length > 0) {
      try {
        const out = await chatJSONRetry({
          schemaName: 'barcode_map',
          timeoutMs: 10_000,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['catalog_id', 'confident'],
            properties: {
              catalog_id: { type: 'string' },
              confident: { type: 'boolean' },
            },
          },
          messages: [
            {
              role: 'system',
              content:
                'Map a packaged product to the closest catalog id. Respond ' +
                'with a catalog_id from the provided list only.',
            },
            {
              role: 'user',
              content:
                `Product: ${off.product_name} (${off.brands ?? 'no brand'})\n` +
                `OFF tags: ${(off.categories_tags ?? []).join(', ')}\n\n` +
                'Candidates (catalog_id|display_name):\n' +
                shortlist.map((e) => `${e.catalog_id}|${e.display_name}`)
                  .join('\n'),
            },
          ],
        }) as { catalog_id: string; confident: boolean };
        const v = validateCatalogId(out.catalog_id, tables);
        // A repaired id means the model's exact catalog_id wasn't real —
        // we're guessing at what it meant, not confirming a match, so
        // this can't carry medium confidence even when confident=true.
        if (v && out.confident && !v.repaired) {
          mapping = {
            catalog_id: v.catalog_id,
            match_level: 'llm_assisted',
            confidence: 'medium',
            evidence: ['LLM mapping from product name and OFF tags'],
          };
        }
      } catch {
        // fall through to coverage_miss
      }
    }
  }

  // Quantity from the label
  let quantity: object | null = null;
  const pq = off?.product_quantity != null ? Number(off.product_quantity) : null;
  if (pq && pq > 0) {
    const parsed = parseLabelQuantity(pq, off?.product_quantity_unit ?? 'g');
    quantity = {
      value: parsed.value,
      unit: parsed.unit,
      basis: 'package_label',
      confidence: 'high',
    };
  }

  const body = {
    ean,
    catalog_version: FACTORS_VERSION,
    off: off ? {
      status: offStatus,
      product_name: off.product_name ?? null,
      brands: off.brands ?? null,
      quantity: off.quantity ?? null,
      last_modified_t: off.last_modified_t ?? null,
    } : { status: offStatus },
    mapping,
    quantity,
    coverage_miss: !mapping.catalog_id,
  };
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(ean, { at: Date.now(), ttl: offStatus === 'unavailable' ? UNAVAILABLE_TTL : TTL, body });
  return c.json(body);
});
