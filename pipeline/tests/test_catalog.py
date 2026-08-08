"""Guardrails for the SU-EATABLE source join and the built catalog.

These lock in honesty properties that are easy to lose in a rebuild:
provenance is never silently empty, a liquid is never priced by the kilo,
and an item we cannot compute stays visible as unsupported.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from drop_pipeline.emit import DATA_DIR  # noqa: E402

SEL = DATA_DIR / "food_sueatable.json"
FNDDS = DATA_DIR / "food_fndds.json"
CATALOG = DATA_DIR / "catalog.json"
PROMPT = DATA_DIR / "catalog.prompt.txt"

VALID_JOINS = {"item_name", "group_stats", "group_typology_value", None}
# The workbook's DATA SOURCES sheet has no row set for these two: each is a
# "flour & meal" composite whose value averages two differently named sets.
KNOWN_UNSOURCED = {"MAIZE FLOUR & MEAL", "RICE FLOUR & MEAL"}

FREIGHT_ENTRIES = {"transport_truck_tkm", "transport_rail_freight_tkm",
                   "transport_air_freight_tkm"}
UNSUPPORTED_ENTRIES = FREIGHT_ENTRIES | {
    "transport_ev_car", "transport_rail", "transport_air_short",
    "transport_air_long"}


def _load(path):
    if not path.exists():
        pytest.skip(f"{path.name} not built")
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def sel():
    return _load(SEL)


@pytest.fixture(scope="module")
def fndds():
    return _load(FNDDS)


@pytest.fixture(scope="module")
def catalog():
    return _load(CATALOG)


# ---- source join --------------------------------------------------------

def test_every_item_declares_how_its_sources_were_joined(sel):
    for it in sel["food_items"]:
        assert it["source_join"] in VALID_JOINS, it["factor_id"]
        assert it["source_count"] == len(it["source_refs"]), it["factor_id"]
        assert bool(it["source_refs"]) == (it["source_join"] is not None)


def test_only_known_items_lack_sources(sel):
    missing = {it["record"]["item_name_raw"] for it in sel["food_items"]
               if not it["source_refs"]}
    assert missing == KNOWN_UNSOURCED


def test_source_refs_point_at_real_rows_in_the_same_group(sel):
    from drop_pipeline.normalize import norm_key
    aliases = {"AGRICULTURAL PROCESSED PRODUCTS": "AGRICULTURAL PROCESSED",
               "FISH": "FISHING"}

    def gkey(name):
        k = norm_key(name)
        return aliases.get(k, k)

    by_id = {s["source_id"]: s for s in sel["food_sources"]}
    for it in sel["food_items"]:
        group = it["typology_key"].split("|", 1)[0]
        for ref in it["source_refs"]:
            assert ref in by_id, ref
            if it["source_join"] != "item_name":
                # a fallback join may only cite rows from the item's own group
                assert gkey(by_id[ref]["group"]) == group, (it["factor_id"], ref)


# ---- FNDDS source -------------------------------------------------------

def test_fndds_release_is_pinned_and_complete(fndds):
    assert fndds["dataset"] == "usda_fndds"
    assert fndds["record_count"] == 5_432
    assert fndds["source_sha256"] == (
        "dfb06ae7ddc397ccd570b91c14b75438ab2ba39f64f22d321f61d4a52a77f3eb")
    assert len(fndds["foods"]) == 5_432
    assert len({food["food_code"] for food in fndds["foods"]}) == 5_432
    assert all(food["default_portion"]["gram_weight"] > 0
               for food in fndds["foods"])


# ---- catalog ------------------------------------------------------------

def test_catalog_reaches_balanced_thousand_entry_target(catalog):
    entries = catalog["entries"]
    fndds_entries = [e for e in entries
                     if e["catalog_id"].startswith("fndds_")]
    assert len(entries) == 1_000
    assert len(fndds_entries) == 537

    legacy_path = DATA_DIR.parent / "2026.08.1" / "catalog.json"
    legacy_ids = {entry["catalog_id"] for entry in _load(legacy_path)["entries"]}
    assert legacy_ids <= {entry["catalog_id"] for entry in entries}

    from collections import Counter
    category_counts = Counter(
        e["catalog_source"]["category"] for e in fndds_entries)
    assert max(category_counts.values()) <= 15


def test_fndds_entries_are_honest_category_matches(catalog):
    ambiguous = re.compile(
        r"\bNFS\b|\bNS(?:\s+as\s+to)?\b|not (?:further )?specified",
        re.IGNORECASE,
    )
    for entry in catalog["entries"]:
        if not entry["catalog_id"].startswith("fndds_"):
            continue
        source = entry["catalog_source"]
        assert source["dataset"] == "usda_fndds"
        assert source["rights"].startswith("CC0")
        assert source["record_id"].startswith("fdc:")
        assert isinstance(source["portion_id"], int)
        assert source["mapping_basis"] == "reviewed_wweia_category"
        assert source["review_status"] == "approved"
        assert entry["factor_links"]["primary"]["match_level"] == "category_match"
        assert entry["factor_links"]["primary"]["factor_id"].startswith("sel:typ:")
        assert entry["default_quantity"]["basis"].startswith("FNDDS: ")
        assert not ambiguous.search(entry["display_name"])


def test_liquid_entries_are_measured_in_litres(catalog):
    for e in catalog["entries"]:
        if e["state"] == "liquid":
            assert e["default_quantity"]["unit"] == "l", e["catalog_id"]
            assert e["category"] in ("drink", "food"), e["catalog_id"]
        elif e["category"] == "drink":
            raise AssertionError(f"{e['catalog_id']} is a drink but not liquid")


def test_liquid_typology_generics_are_liquid(catalog):
    expected = {
        "generic_agricultural_processed_beer": 0.5,
        "generic_agricultural_processed_juice": 0.25,
        "generic_agricultural_processed_wine": 0.125,
        "generic_animal_husbandry_milk": 0.25,
        "generic_agricultural_processed_vegetal_milk": 0.25,
        "generic_agricultural_processed_coffee_liquid": 0.125,
    }
    by_id = {e["catalog_id"]: e for e in catalog["entries"]}
    for cid, litres in expected.items():
        e = by_id[cid]
        assert e["state"] == "liquid" and e["category"] == "drink", cid
        assert e["default_quantity"] == {
            "value": litres, "unit": "l", "basis": e["default_quantity"]["basis"]
        }, cid


def test_dried_fruit_items_are_not_named_as_the_fresh_fruit(catalog):
    by_id = {e["catalog_id"]: e for e in catalog["entries"]}
    assert by_id["apples"]["display_name"] == "Apples (dried)"
    assert by_id["coconuts"]["display_name"] == "Coconut (dried)"
    assert "apple" not in by_id["apples"]["search_tokens"].split()


def test_freight_is_unsupported_not_a_per_km_number(catalog):
    by_id = {e["catalog_id"]: e for e in catalog["entries"]}
    for cid in FREIGHT_ENTRIES:
        e = by_id[cid]
        assert e["unsupported"]["reason"].startswith("freight is tracked"), cid
        assert e["factor_links"]["primary"] is None, cid


def test_mobile_seed_matches_generated_runtime_tables():
    seed_dir = DATA_DIR.parents[3] / "mobile" / "src" / "data" / "seed"
    runtime_tables = {
        "catalog.json", "food_hestia_country.json", "food_owid_proxy.json",
        "food_sueatable.json", "manifest.json", "sector_useeio.json",
        "transport_factors.json",
    }
    for name in runtime_tables:
        assert (seed_dir / name).read_bytes() == (DATA_DIR / name).read_bytes(), name


def test_unsupported_entries_reach_the_classifier_prompt():
    if not PROMPT.exists():
        pytest.skip("prompt not built")
    lines = PROMPT.read_text(encoding="utf-8").splitlines()
    marked = {ln.split("|")[0] for ln in lines if ln.endswith("|unsupported")}
    assert marked == UNSUPPORTED_ENTRIES
    for ln in lines:
        parts = ln.split("|")
        assert len(parts) in (5, 6), ln
        if len(parts) == 6:
            assert parts[5] == "unsupported", ln
