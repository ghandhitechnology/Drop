#!/usr/bin/env python3
"""Create an app-friendly water footprint table from a HESTIA bulk export."""

import csv
import json
import zipfile
from pathlib import Path


HERE = Path(__file__).resolve().parent
ARCHIVE = HERE / "hestia_v1.0_aggregated_food_2025-05-01.zip"
OUTPUT = HERE / "hestia_food_water_footprints.csv"


def indicator_value(items, term_id, model_id=None):
    for item in items or []:
        if item.get("term", {}).get("@id") != term_id:
            continue
        if model_id is not None and item.get("methodModel", {}).get("@id") != model_id:
            continue
        return item.get("value")
    return None


rows = []
with zipfile.ZipFile(ARCHIVE) as archive:
    names = sorted(
        name
        for name in archive.namelist()
        if name.startswith("recalculated/ImpactAssessment/") and name.endswith(".jsonld")
    )
    for name in names:
        data = json.loads(archive.read(name))
        product = data.get("product", {})
        term = product.get("term", {})
        rows.append(
            {
                "hestia_id": data.get("@id"),
                "product_id": term.get("@id"),
                "product_name": term.get("name"),
                "country": data.get("country", {}).get("name"),
                "start_year": data.get("startDate"),
                "end_year": data.get("endDate"),
                "functional_unit_quantity": data.get("functionalUnitQuantity"),
                "functional_unit": term.get("units"),
                "freshwater_withdrawal_l_per_kg": indicator_value(
                    data.get("emissionsResourceUse"), "freshwaterWithdrawalsDuringCycle"
                ),
                "scarcity_weighted_water_aware_l_eq_per_kg": indicator_value(
                    data.get("impacts"), "scarcityWeightedWaterUse", "aware"
                ),
                "scarcity_weighted_water_ef31_l_eq_per_kg": indicator_value(
                    data.get("impacts"), "scarcityWeightedWaterUse", "environmentalFootprintV3-1"
                ),
                "aggregated_quality_score": data.get("aggregatedQualityScore"),
                "aggregated_quality_score_max": data.get("aggregatedQualityScoreMax"),
                "aggregated_data_validated": data.get("aggregatedDataValidated"),
                "irrigated": data.get("irrigated"),
                "organic": data.get("organic"),
                "source_id": data.get("source", {}).get("@id"),
                "data_release": "v1.0 (2025-05-01)",
            }
        )

fieldnames = list(rows[0])
with OUTPUT.open("w", newline="", encoding="utf-8") as output:
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"Wrote {len(rows)} rows to {OUTPUT}")
