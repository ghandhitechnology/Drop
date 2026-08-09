# USDA FNDDS evaluation for Drop

## Verdict

Use **USDA FoodData Central's FNDDS 2021–2023 bulk release** as Drop's
consumer-food catalog source. Do not use it as a water-footprint source.

FNDDS is a better fit for catalog expansion than an LCA database such as
Agribalyse because its records already describe foods as people consume them
and include measured portions. Drop keeps environmental calculations in its
existing, metric-aware SU-EATABLE/HESTIA/OWID layer.

## Inspected release

| Field | Value |
|---|---|
| Source | USDA FoodData Central |
| Dataset | Food and Nutrient Database for Dietary Studies (FNDDS) 2021–2023 |
| Published | 2024-10-31 |
| Bulk format | JSON ZIP |
| Source records | 5,432 Survey Foods |
| Records with a positive portion | 5,432 |
| Records with `inputFoods` composition data | 5,431 |
| Rights | CC0 1.0 / U.S. public domain |
| SHA-256 | `dfb06ae7ddc397ccd570b91c14b75438ab2ba39f64f22d321f61d4a52a77f3eb` |

Official documentation:

- <https://fdc.nal.usda.gov/download-datasets/>
- <https://fdc.nal.usda.gov/data-documentation.html>
- <https://fdc.nal.usda.gov/api-guide/>

## Why it fits

- Consumer-facing names and WWEIA categories map cleanly to Drop's controlled
  catalog.
- Measured gram weights provide defensible default portions.
- Stable food codes and FDC IDs support reproducible provenance.
- The small versioned archive can be processed offline; production does not
  depend on API availability or keys.
- CC0 avoids the per-record redistribution ambiguity found in some LCA
  databases.

## Boundaries

- FNDDS publishes nutrition and food-composition data, not water footprints.
- `inputFoods` is not automatically a complete elemental recipe; many records
  point to another composite prepared food.
- A USDA name match does not make a SU-EATABLE water factor an exact match.
- Portion weight is a catalog default, not proof of what a camera saw or a user
  consumed.

## Implemented policy

Release `2026.08.2` adds 537 FNDDS-backed entries to the existing 463, for an
exact total of 1,000.

- `pipeline/config/fndds_category_map.yaml` is a reviewed category allowlist.
- `pipeline/config/fndds_selection.yaml` locks the selected 537 food codes.
- Ambiguous NFS/NS/not-specified records are rejected.
- Every new water link targets a SU-EATABLE typology and is labeled
  `category_match` with low confidence.
- FNDDS source ID, food code, category, portion ID/description, release,
  mapping basis, review status, and rights remain attached to the catalog row.
- Mixed dishes and automatic ingredient-to-factor matching remain out until
  ingredient identity, form, and recipe yields can be reviewed without fuzzy
  or lossy joins.
