# Federal LCA Commons evaluation for Drop

Evaluated: 2026-08-07

## Verdict

Federal LCA Commons is useful as a **supplementary, offline modeling source**, but it is **not reliable enough to serve as Drop's primary consumer water-footprint database or as a live production API**.

Use it to seed and validate selected U.S. process and transport factors. Do not convert a photo directly into an LCA Commons search result and present that result as a product's water footprint.

## Files downloaded

| File | Release represented | Size | SHA-256 | Purpose |
|---|---:|---:|---|---|
| `data/lca_commons/uslci_v1.2026-06.0_olca2_6_1.zolca` | USLCI 1.2026-06.0 | 20.4 MiB | `a8219f729c9ef79c41f416153181c94f63f7b9cbc20c9f46d7ee1ec909b9fd76` | Current openLCA database package |
| `data/lca_commons/uslci_fy25_q2_01_json_ld.zip` | USLCI FY2025 Q2 | 21.9 MiB | `55437502fc33d193236d50fd87a361880beea82a27139d1803be38ae0f0934b0` | Machine-readable JSON-LD used for this inspection |

Both archives passed ZIP integrity checks. The current JSON-LD export initiated from the Commons UI did not complete within two minutes, so the most recent JSON-LD package available from the project's official support repository was used for field-level inspection.

Sources: [Quick Start Guide](https://www.lcacommons.gov/quick-start-guide), [API Guide](https://www.lcacommons.gov/lca-commons-api-guide), [USLCI repository](https://www.lcacommons.gov/lca-collaboration/National_Renewable_Energy_Laboratory/USLCI_Database_Public/datasets), [official USLCI support content](https://github.com/FLCAC-admin/uslci-content/tree/dev/downloads).

## What the inspected JSON-LD contains

- 962 processes, 4,081 flows, 494 sources, 317 locations, and 67 actors.
- 262 processes mention a water exchange; 174 contain at least one elementary water-resource input.
- 913 of 962 processes reference at least one source.
- 618 of 962 processes have a structured location reference.
- 535 of 962 processes declare a data-quality system.
- None of the 1,861 elementary water-resource input exchanges has a populated exchange-level data-quality score.
- 352 processes state a validity start before 2010; 12 use a `9998` sentinel-like year. A recent database release date therefore does not imply recent underlying measurements.

## Coverage against Drop's planned use cases

Exact or broad process-name matching in the inspected USLCI package found:

| Consumer concept | Coverage |
|---|---|
| Beef/cattle | none |
| Milk/dairy | none |
| Coffee | none |
| Rice | 1 process |
| Cotton | 1 process |
| Gasoline-related | 83 processes |
| Transport/vehicle/truck/car | 415 processes |
| Electronics/computer/phone/semiconductor | 1 bridge process; no smartphone product model |

USLCI is strongest here for fuels, transport, industrial materials, and manufacturing. It is too sparse for a broad food-and-consumer-product tracker.

The Commons page itself recommends importing USEEIO v2 and Forestry/Forest Products and connecting bridge providers to make product systems more complete. This means a repository record is often not a ready-to-display cradle-to-grave footprint.

## Accuracy and semantics risks

The raw figures require LCA expertise and validation:

- `Rice, at field` reports 668,000 kg of water input per 1 kg reference output, with underlying validity dates 1996–2000.
- `Cotton, whole plant, at field` reports 1,307,000 kg of water input per 1 kg reference output, with underlying validity dates 1996–1999.
- Both water exchanges have no exchange-level data-quality score.
- `Transport, passenger car, gasoline powered` is expressed per passenger-kilometre and contains no direct water input. Its upstream water footprint must be calculated through linked fuel/electricity providers, not read from the process alone.

These examples should not be shown to users as literal product water footprints without checking normalization, system boundary, provider linking, geography, and whether the desired metric is withdrawal, consumption, scarcity-weighted impact, or discharge.

## Operational reliability

- The documented production limit is 1,000 requests per hour with an assigned data.gov key.
- The guide says `DEMO_KEY` allows 30 requests/hour and 50/day. During this evaluation, the gateway returned HTTP 429 after 10 requests, with `x-ratelimit-limit: 10` and a roughly 9.8-hour retry delay.
- Full repository export is asynchronous/two-step, and the website JSON-LD export did not complete within the test window.
- Search results are technical LCA entities, not normalized consumer products or UPCs.

Conclusion: use versioned bulk imports and your own indexed database. Do not make the app depend on live Commons calls during user interactions.

## Licensing

Licensing is not uniform enough to assume one blanket grant for every process. In the inspected USLCI package, 31 processes are marked copyright-protected, and some contain dataset-specific notices or third-party terms. The support repository's MIT license covers its repository content/software but should not be treated as automatically overriding embedded dataset restrictions.

Store and expose provenance, citation, and rights metadata per factor. Review restricted records before commercial redistribution.

## Recommended use in Drop

1. Import LCA Commons releases offline and pin every factor to repository, release, process UUID, geography, reference unit, validity period, and system boundary.
2. Build a curated water-factor table rather than querying raw JSON-LD from the mobile app.
3. Use photo/LLM recognition only to map an item to a controlled product/category ID. Never let the model invent or directly calculate the footprint.
4. Calculate linked product systems in openLCA or an equivalent engine, separating direct water consumption, withdrawal, discharge, and scarcity-weighted impact.
5. Add broader consumer coverage from a reviewed food/product source and use USEEIO only as a coarse sector-level fallback.
6. Show ranges and confidence grades to users; do not present a single precise number when geography, recipe, mass, or supply chain is unknown.
7. Add regression tests for a small set of benchmark items before promoting any new release.

## Go/no-go

- **Go:** prototype transport and selected U.S. industrial-process factors; provenance and model-validation work.
- **Conditional:** a curated subset of agricultural processes after manual unit and normalization validation.
- **No-go:** direct live production dependency, UPC-level product lookup, global coverage, or a broad consumer food catalog using LCA Commons alone.
