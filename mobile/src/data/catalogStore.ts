/**
 * The catalog, held in memory for the life of the process.
 *
 * A thousand items is a few hundred kilobytes, and keeping them resident is
 * what lets search answer inside a keystroke with no query round trip.
 * Hydration is idempotent and safe to fire from several screens at once —
 * concurrent callers share the one in-flight promise.
 */
import { create } from 'zustand';

import { activeCatalogItems, loadCatalogItems, seedCatalogItems } from './catalog';
import { searchCatalog, type SearchHit } from './search';
import { FACTORS_VERSION, subscribeFactorsVersion } from './tables';
import type { CatalogItem } from './types';

export type CatalogStatus = 'idle' | 'hydrating' | 'ready' | 'failed';

type CatalogState = {
  status: CatalogStatus;
  items: CatalogItem[];
  version: string;
  /** Wall-clock cost of the last hydration, in ms. */
  hydrationMs: number;
  error: string | null;
  hydrate: (options?: { force?: boolean }) => Promise<void>;
  search: (query: string, limit?: number) => SearchHit[];
};

let inFlight: Promise<void> | null = null;

export const useCatalogStore = create<CatalogState>((set, get) => ({
  status: 'idle',
  items: [],
  version: FACTORS_VERSION,
  hydrationMs: 0,
  error: null,

  hydrate: async (options) => {
    const force = options?.force ?? false;
    if (!force && get().status === 'ready') return;
    if (inFlight) return inFlight;

    const run = (async () => {
      set({ status: 'hydrating', error: null });
      const startedAt = Date.now();
      const targetVersion = FACTORS_VERSION;
      try {
        await seedCatalogItems(force);
        const items = await loadCatalogItems();
        // Activation can finish while SQLite hydration is yielding. Never put
        // that old release back over the synchronous active-release swap.
        if (FACTORS_VERSION !== targetVersion) {
          set({
            status: 'ready',
            items: activeCatalogItems(),
            version: FACTORS_VERSION,
            hydrationMs: Date.now() - startedAt,
            error: null,
          });
          return;
        }
        set({
          status: 'ready',
          items,
          version: FACTORS_VERSION,
          hydrationMs: Date.now() - startedAt,
          error: null,
        });
      } catch (error) {
        set({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        inFlight = null;
      }
    })();

    inFlight = run;
    return run;
  },

  search: (query, limit) => searchCatalog(get().items, query, limit),
}));

/** Keep search/default quantities in the exact same synchronous release swap. */
subscribeFactorsVersion(() => {
  useCatalogStore.setState({
    status: 'ready',
    items: activeCatalogItems(),
    version: FACTORS_VERSION,
    hydrationMs: 0,
    error: null,
  });
});

/** Non-hook access, for callers outside React. */
export function catalogItems(): CatalogItem[] {
  return useCatalogStore.getState().items;
}

export function hydrateCatalog(options?: { force?: boolean }): Promise<void> {
  return useCatalogStore.getState().hydrate(options);
}
