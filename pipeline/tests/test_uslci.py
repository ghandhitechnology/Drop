"""Guardrails for the USLCI transport extraction.

The central rule this file enforces: a USLCI-only water number must never
reach packages/factors. USLCI supplies the activity coefficient; the water
intensity must come from cited literature.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from drop_pipeline.emit import DATA_DIR  # noqa: E402

FACTORS = DATA_DIR / "transport_factors.json"
AUDIT = DATA_DIR / "uslci_audit.json"

GASOLINE_COEFFICIENT_L_PER_PKM = 0.0630015993522655


def _load(path):
    if not path.exists():
        from drop_pipeline import extract_uslci
        extract_uslci.main()
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def payload():
    return _load(FACTORS)


@pytest.fixture(scope="module")
def audit():
    return _load(AUDIT)


@pytest.fixture(scope="module")
def supported(payload):
    rows = [f for f in payload["transport_factors"] if not f.get("unsupported")]
    assert rows, "no supported transport factors were emitted"
    return rows


@pytest.fixture(scope="module")
def activities(payload):
    return {a["factor_id"]: a for a in payload["transport_activity"]}


# --- (a) every supported factor is a properly labelled low-confidence factor

def test_supported_factors_are_labelled(supported):
    for f in supported:
        mode = f["mode"]
        assert f["metric_type"] == "freshwater_consumption", mode
        assert f["confidence"] == "low", mode
        assert isinstance(f["assumptions"], list) and f["assumptions"], mode
        assert all(isinstance(a, str) and a.strip() for a in f["assumptions"]), mode
        assert f["factor_id"] == f"drop:transport:{mode}", mode
        value_keys = [k for k in f if k.startswith("value_l_per_")]
        assert len(value_keys) == 1, f"{mode}: {value_keys}"
        assert f[value_keys[0]] > 0, mode
        assert f["range_l"]["low"] <= f[value_keys[0]] <= f["range_l"]["high"], mode


def test_supported_factors_cite_literature_water_intensity(supported):
    for f in supported:
        wi = f["provenance"]["water_intensity"]
        assert wi["source"] == "literature", f["mode"]
        assert wi["metric_type"] == "freshwater_consumption", f["mode"]
        assert wi["value_l_per_l_fuel"] > 0, f["mode"]
        citation = wi["citation"]
        assert isinstance(citation, str) and len(citation) > 40, f["mode"]
        # A real citation names authors, a year and a venue.
        assert any(ch.isdigit() for ch in citation), f["mode"]
        assert "uslci" not in citation.lower(), f["mode"]


# --- (b) no water value may derive solely from USLCI ----------------------

def test_no_factor_derives_water_from_uslci_alone(supported):
    for f in supported:
        prov = f["provenance"]
        assert set(prov) == {"activity", "water_intensity"}, f["mode"]
        assert prov["activity"]["source"] == "uslci", f["mode"]
        assert prov["water_intensity"]["source"] != "uslci", f["mode"]
        # the emitted value must be exactly activity coefficient x literature
        value_key = next(k for k in f if k.startswith("value_l_per_"))
        expected = (prov["activity"]["fuel_amount_l"]
                    * prov["water_intensity"]["value_l_per_l_fuel"])
        assert f[value_key] == pytest.approx(expected, rel=1e-4), f["mode"]


def test_audit_records_that_uslci_water_is_rejected(audit):
    walk = audit["naive_recursive_walk"]
    assert walk["rejected"] is True
    assert len(walk["rejection_reasons"]) >= 3
    assert walk["result_l_freshwater_per_pkm_low"] > 0
    assert walk["result_l_freshwater_per_pkm_high"] > walk["result_l_freshwater_per_pkm_low"]
    assert audit["electricity_processes"]["count"] == 13
    assert audit["electricity_processes"]["all_zero_water_inputs"] is True
    assert all(e["water_input_exchanges"] == 0
               for e in audit["electricity_processes"]["processes"])
    assert audit["counts"]["processes"] == 962
    assert audit["counts"]["flows"] == 4081


# --- (c) petrol car sanity band ------------------------------------------

def test_petrol_car_value_is_in_literature_band(supported):
    car = next(f for f in supported if f["mode"] == "petrol_car")
    assert car["functional_unit"] == "l_water_per_pkm"
    # ~0.4-1.1 L/vehicle-km in the literature at an occupancy of ~1.5
    assert 0.05 <= car["value_l_per_pkm"] <= 0.5, car["value_l_per_pkm"]


# --- (d) ev_car is explicitly unsupported ---------------------------------

def test_ev_car_is_unsupported(payload):
    ev = next(f for f in payload["transport_factors"] if f["mode"] == "ev_car")
    assert ev["unsupported"] is True
    assert "electricity" in ev["reason"].lower()
    assert not any(k.startswith("value_") for k in ev)


def test_unsupported_modes_carry_no_number(payload):
    for f in payload["transport_factors"]:
        if f.get("unsupported"):
            assert f["reason"].strip(), f["mode"]
            assert "range_l" not in f, f["mode"]
            assert "provenance" not in f, f["mode"]


# --- (e) the USLCI activity coefficient itself ----------------------------

def test_gasoline_car_activity_coefficient(activities):
    act = activities["uslci:act:passenger_car_gasoline"]
    assert act["process_uuid"] == "553fff99-b003-39a4-b53e-a9b3da050c71"
    assert act["reference_flow"]["unit"] == "p*km"
    assert act["fuel_flow"] == "Gasoline, at refinery"
    assert act["fuel_amount_l"] == pytest.approx(
        GASOLINE_COEFFICIENT_L_PER_PKM, abs=1e-6)


def test_passenger_km_activities_carry_the_occupancy_note(payload):
    for a in payload["transport_activity"]:
        if a["reference_flow"]["unit"] == "p*km":
            assert "occupancy" in a["occupancy_note"].lower(), a["factor_id"]
            assert "do NOT divide" in a["occupancy_note"], a["factor_id"]
        else:
            assert "occupancy_note" not in a, a["factor_id"]


def test_activities_carry_provenance_and_rights(payload):
    for a in payload["transport_activity"]:
        assert a["process_uuid"] and a["process_name"]
        assert a["dataset"] == "uslci"
        assert a["fuel_amount_l"] > 0, a["factor_id"]
        assert a["valid_from"] and a["valid_until"], a["factor_id"]
        assert a["rights"], a["factor_id"]
        assert a["geography"], a["factor_id"]


def test_btu_denominated_activities_document_their_conversion(payload):
    for a in payload["transport_activity"]:
        if a["fuel_unit"] != "l":
            assert "unit_conversion" in a, a["factor_id"]
            assert "flow-property" in a["unit_conversion"], a["factor_id"]
