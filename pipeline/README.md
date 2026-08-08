# Drop data pipeline

One-time extractors that turn the raw datasets in `water_logic/datasets/`
into the versioned factor tables in `packages/factors/data/<version>/`.
The mobile app and backend only ever read those tables — never the raw files.

## Rebuild

```sh
pipeline/.venv/bin/python pipeline/src/drop_pipeline/extract_sueatable.py
pipeline/.venv/bin/python pipeline/src/drop_pipeline/extract_fndds.py
pipeline/.venv/bin/python pipeline/src/drop_pipeline/extract_hestia_owid.py
pipeline/.venv/bin/python pipeline/src/drop_pipeline/extract_uslci.py
pipeline/.venv/bin/python pipeline/src/drop_pipeline/extract_useeio.py
pipeline/.venv/bin/python pipeline/src/drop_pipeline/build_catalog.py
pipeline/.venv/bin/pytest pipeline/tests -q
```

Every extractor hard-asserts row counts and spot values and fails on any
unjoined name. Fix joins in `pipeline/config/*.yaml`, never by loosening
normalization. The venv is Python 3.11 (Homebrew 3.14 has a broken pyexpat).

## Dataset roles and verdicts

| Source | Role | Metric |
|---|---|---|
| SU-EATABLE LIFE | primary food factors (320 items, 72 typologies, 937 sources) | total water footprint, L/kg or L/L |
| USDA FNDDS 2021–2023 | catalog names/categories and measured portions (5,432 source foods; 537 selected) | no water metric; reviewed category joins only |
| HESTIA | country-specific secondary line for raw crops (140 rows, 66 crops) | freshwater withdrawal + scarcity-weighted |
| OWID / Poore-Nemecek | labelled global proxy, fallback step 6 only | freshwater withdrawal |
| USLCI FY2025 Q2 | transport **activity coefficients only** (fuel L per p·km) | — |
| curated literature | water intensity of fuels (Wu et al. 2009; King & Webber 2008; Grubert & Sanders 2018) | freshwater consumption |
| USEEIO v2.0 | last-resort spend proxy for everyday products (~40 curated sectors) | freshwater withdrawal per USD |

## The USLCI water verdict (do not undo this)

USLCI's own water data must never ship as a footprint:

- All 13 electricity processes carry **zero** water inputs (the grid inventory
  lives in an external library not present in the JSON-LD package). EV/grid
  water is therefore **unsupported** in v1 — the app says so instead of guessing.
- The gasoline chain carries a single 1.68 L refinery placeholder; a recursive
  solve of `Transport, passenger car, gasoline powered` lands 2–3 orders of
  magnitude below literature, and modelling-choice sensitivity spans ~900×
  (see `uslci_audit.json`).
- Agricultural processes are mis-normalized (Cotton: 1,307,000 kg water/kg).

Shipping transport factors = USLCI fuel-use coefficient × literature-cited
fuel water intensity, confidence `low`, with ranges, fuel-cycle boundary
stated. USEEIO v2.5.1 has no water indicator; `extract_useeio.py` refuses it.

## FNDDS catalog rules

FNDDS is a catalog source, not a footprint source. The build uses a narrow
allowlist in `config/fndds_category_map.yaml`, maps only to SU-EATABLE
typologies, and labels every added record `category_match`. Ambiguous NFS/NS
records are rejected. The reviewed selection in `config/fndds_selection.yaml`
locks 537 food codes chosen with balanced round-robin sampling, so large source
groups do not crowd out smaller ones and source changes cannot silently swap
catalog entries. Names, source IDs, rights, and measured portions
remain attached as `catalog_source`; the numerical factor provenance remains
SU-EATABLE.

The versioned bulk archive is processed offline. Neither the app nor backend
depends on live FoodData Central calls.

## Confidence mapping (implemented in @drop/water-engine)

`uncertainty = L` in SU-EATABLE does not imply a well-sampled value — 226 of
320 items rest on n=1. The engine maps: n≥4 clean flags → high (IQR range);
n≥4 flagged or n 2–3 → medium (min–max); n=1 → low with the typology's range;
`uncertainty = H` → the dataset's own typology redirect. Proxy metrics always
carry `proxy_metric: true` and their metric type; the engine throws if a
withdrawal value enters a total-footprint sum.
