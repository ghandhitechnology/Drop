"""Extract USDA FNDDS records used to expand the controlled catalog.

FNDDS supplies consumer-facing food names, measured portions, and recipe input
records. It does not supply water-footprint factors. build_catalog.py joins its
reviewed categories to SU-EATABLE typologies and keeps that match explicit.
"""

from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from drop_pipeline.emit import DATASETS, sha256, write_json

ZIP = (DATASETS / "fndds" /
       "FoodData_Central_survey_food_json_2024-10-31.zip")
MEMBER = "surveyDownload.json"
EXPECTED_ROWS = 5_432
EXPECTED_RELEASE = "10/31/2024"
EXPECTED_SHA256 = "dfb06ae7ddc397ccd570b91c14b75438ab2ba39f64f22d321f61d4a52a77f3eb"

DATASET_META = {
    "dataset": "usda_fndds",
    "dataset_release": "FoodData Central FNDDS 2021–2023 (2024-10-31)",
    "dataset_url": "https://fdc.nal.usda.gov/download-datasets/",
    "rights": "CC0 1.0 / U.S. public domain",
    "role": "catalog identity, category, and portion data only",
}

AMBIGUOUS_PORTIONS = {
    "quantity not specified",
    "serving size not specified",
    "amount not specified",
}


def choose_portion(portions):
    positive = [p for p in portions if (p.get("gramWeight") or 0) > 0]
    if not positive:
        raise ValueError("food has no positive portion weight")

    def rank(portion):
        description = (portion.get("portionDescription") or "").strip()
        return (
            description.lower() in AMBIGUOUS_PORTIONS,
            portion.get("sequenceNumber") or 999_999,
            description,
            portion["gramWeight"],
        )

    chosen = min(positive, key=rank)
    return {
        "portion_id": chosen["id"],
        "gram_weight": chosen["gramWeight"],
        "description": (chosen.get("portionDescription") or
                        "FNDDS measured portion").strip(),
    }


def main():
    if not ZIP.exists():
        raise SystemExit(f"missing FNDDS archive: {ZIP}")
    actual_sha256 = sha256(ZIP)
    if actual_sha256 != EXPECTED_SHA256:
        raise SystemExit(
            f"FNDDS archive checksum changed: {actual_sha256} != {EXPECTED_SHA256}")

    with zipfile.ZipFile(ZIP) as archive:
        if archive.namelist() != [MEMBER]:
            raise SystemExit(f"unexpected FNDDS archive members: {archive.namelist()}")
        payload = json.loads(archive.read(MEMBER))

    raw_foods = payload.get("SurveyFoods")
    if not isinstance(raw_foods, list) or len(raw_foods) != EXPECTED_ROWS:
        raise SystemExit(
            f"expected {EXPECTED_ROWS} FNDDS foods, got "
            f"{len(raw_foods) if isinstance(raw_foods, list) else 'invalid payload'}")

    foods = []
    seen_codes = set()
    for food in raw_foods:
        if food.get("dataType") != "Survey (FNDDS)":
            raise SystemExit(f"unexpected FNDDS data type for {food.get('fdcId')}")
        if food.get("publicationDate") != EXPECTED_RELEASE:
            raise SystemExit(f"unexpected release for {food.get('fdcId')}")

        code = str(food["foodCode"])
        if code in seen_codes:
            raise SystemExit(f"duplicate FNDDS food code {code}")
        seen_codes.add(code)

        category = (food.get("wweiaFoodCategory") or {}).get(
            "wweiaFoodCategoryDescription")
        if not category:
            raise SystemExit(f"missing WWEIA category for {code}")

        foods.append({
            "fdc_id": food["fdcId"],
            "food_code": code,
            "display_name": food["description"].strip(),
            "wweia_category": category.strip(),
            "default_portion": choose_portion(food.get("foodPortions") or []),
            "input_food_count": len(food.get("inputFoods") or []),
        })

    write_json("food_fndds.json", {
        **DATASET_META,
        "source_file": ZIP.name,
        "source_sha256": actual_sha256,
        "record_count": len(foods),
        "foods": sorted(foods, key=lambda food: food["food_code"]),
    })
    print(f"fndds: {len(foods)} foods with measured portions — gates passed")


if __name__ == "__main__":
    main()
