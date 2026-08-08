"""Extract HESTIA country factors and the OWID proxy table.

HESTIA rows are SECONDARY metrics (freshwater withdrawal + scarcity-weighted)
attached to raw crops when origin is known — never the headline figure.
OWID rows are a labelled freshwater-withdrawal PROXY, reachable only at
fallback step 6 of the water_logic decision tree.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from drop_pipeline.emit import DATASETS, write_json

COUNTRY_ISO = {
    "Iran": "IR", "India": "IN", "Côte d'Ivoire": "CI", "China": "CN",
    "Italy": "IT", "United States": "US", "Brazil": "BR", "France": "FR",
    "Germany": "DE", "Spain": "ES", "Peru": "PE", "Ecuador": "EC",
    "World": "GLO", "Australia": "AU", "Canada": "CA", "Myanmar": "MM",
    "Nepal": "NP", "United Kingdom": "GB", "Indonesia": "ID",
    "Malaysia": "MY", "Turkey (Country)": "TR", "Thailand": "TH",
    "Ghana": "GH", "Colombia": "CO", "Hungary": "HU", "Mexico": "MX",
    "Romania": "RO", "Tanzania": "TZ", "Ukraine": "UA", "Cambodia": "KH",
    "Pakistan": "PK", "Viet Nam": "VN", "Argentina": "AR", "Sweden": "SE",
    "Portugal": "PT", "Albania": "AL", "Russia": "RU",
}


def opt_float(s):
    return float(s) if s not in ("", None) else None


def extract_hestia():
    path = DATASETS / "hestia" / "hestia_food_water_footprints.csv"
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    out = []
    for r in rows:
        country = r["country"]
        if country not in COUNTRY_ISO:
            raise SystemExit(f"unknown HESTIA country: {country!r}")
        assert r["functional_unit"] == "kg", r
        base = {
            "dataset": "hestia",
            "dataset_release": r["data_release"],
            "record": r["hestia_id"],
            "product_id": r["product_id"],
            "product_name": r["product_name"],
            "geography": COUNTRY_ISO[country],
            "country": country,
            "functional_unit": "kg",
            "start_year": int(r["start_year"]),
            "end_year": int(r["end_year"]),
            "irrigated": r["irrigated"] == "True",
            "organic": r["organic"] == "True",
            "quality_score": int(r["aggregated_quality_score"]),
            "quality_score_max": int(r["aggregated_quality_score_max"]),
            "validated": r["aggregated_data_validated"] == "True",
            "source_id": r["source_id"],
            "system_boundary": "cradle-to-farm-gate (HESTIA aggregated)",
            "rights": "HESTIA open data (hestia.earth)",
        }
        row = {
            **base,
            "factor_id": f"hestia:fw:{r['hestia_id']}",
            "metric_type": "freshwater_withdrawal",
            "value_l_per_kg": opt_float(r["freshwater_withdrawal_l_per_kg"]),
            "scarcity_weighted": {
                "aware_l_eq_per_kg":
                    opt_float(r["scarcity_weighted_water_aware_l_eq_per_kg"]),
                "ef31_l_eq_per_kg":
                    opt_float(r["scarcity_weighted_water_ef31_l_eq_per_kg"]),
            },
        }
        if (row["value_l_per_kg"] is None
                and row["scarcity_weighted"]["aware_l_eq_per_kg"] is None
                and row["scarcity_weighted"]["ef31_l_eq_per_kg"] is None):
            continue  # no metric at all — nothing to attach
        out.append(row)
    write_json("food_hestia_country.json", {"hestia_factors": out})
    assert len(out) == 140, len(out)
    assert all(f["metric_type"] != "total_water_footprint" for f in out)
    print(f"hestia: {len(out)} rows, "
          f"{len({f['product_id'] for f in out})} products — gates passed")


def extract_owid():
    path = (DATASETS / "owid_poore_nemecek" /
            "freshwater_withdrawals_per_kg.csv")
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    out = [{
        "factor_id": f"owid:{r['Entity'].lower().replace(' ', '_').replace('&', 'and')}",
        "dataset": "owid_poore_nemecek",
        "dataset_release": "Poore & Nemecek (2018), Science, via Our World in Data",
        "entity": r["Entity"],
        "metric_type": "freshwater_withdrawal",
        "proxy_metric": True,
        "value_l_per_kg": float(r["Freshwater withdrawals per kilogram"]),
        "functional_unit": "kg",
        "geography": "GLO",
        "year": int(r["Year"]),
        "system_boundary": "cradle-to-retail (global mean)",
        "rights": "CC BY (Our World in Data)",
    } for r in rows]
    write_json("food_owid_proxy.json", {"owid_factors": out})
    assert len(out) == 38, len(out)
    assert all(f["proxy_metric"] for f in out)
    print(f"owid: {len(out)} rows — gates passed")


if __name__ == "__main__":
    extract_hestia()
    extract_owid()
