"""Extract USLCI transport activity coefficients → transport_factors.json.

USLCI (Federal LCA Commons, FY2025 Q2 JSON-LD) is used here for exactly one
thing: the technosphere coefficient that says how much fuel a passenger-km or
tonne-km of a given mode consumes. Those coefficients are clean and citable.

USLCI's own water inventory is NOT used and MUST NOT be used. See
uslci_audit.json (written by this module) for the evidence: the 13 electricity
processes carry zero water exchanges, refinery water is a single allocated
1.68 l input, and a full recursive solve of the passenger-car chain returns
~0.003 L/p*km, two to three orders of magnitude below every published estimate.

The water number therefore comes from config/fuel_water_intensity.yaml
(peer-reviewed literature) and is multiplied by the USLCI activity coefficient.
"""

from __future__ import annotations

import json
import sys
import zipfile
from collections import Counter
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from drop_pipeline.emit import DATASETS, write_json
from drop_pipeline.normalize import slug

ZIP = DATASETS / "lca_commons" / "uslci_fy25_q2_01_json_ld.zip"
CONFIG = Path(__file__).resolve().parents[2] / "config"

DATASET_META = {
    "dataset": "uslci",
    "dataset_release": (
        "USLCI FY2025 Q2 (uslci_fy25_q2_01_json_ld.zip), Federal LCA Commons, "
        "National Renewable Energy Laboratory"
    ),
    "dataset_url": "https://www.lcacommons.gov/lca-collaboration/"
                   "National_Renewable_Energy_Laboratory/USLCI_Database_Public/datasets",
}

OCCUPANCY_NOTE = (
    "reference is passenger-km; occupancy already embedded — "
    "do NOT divide by occupancy again"
)

# openLCA reference units per flow property. Values convert a unit into the
# reference unit of its flow property (physical constants, not data choices).
UNIT_TO_REF = {
    # Mass -> kg
    "kg": 1.0, "g": 1e-3, "mg": 1e-6, "t": 1000.0, "lb av": 0.45359237,
    # Volume -> m3
    "m3": 1.0, "l": 1e-3, "cu ft": 0.028316846592, "gal (US liq)": 0.003785411784,
    # Energy -> MJ (1 Btu_IT = 1055.05585262 J)
    "MJ": 1.0, "btu": 0.00105505585262, "kWh": 3.6,
    # Goods transport -> t*km
    "t*km": 1.0, "t*mi": 1.609344, "kg*km": 1e-3,
    # Person transport -> p*km
    "p*km": 1.0,
    # Area / area*time / volume*time / length / count / radioactivity / money
    "m2": 1.0, "m2*a": 1.0, "m3*a": 1.0,
    "m": 1.0, "ft": 0.3048,
    "Item(s)": 1.0, "kBq": 1.0, "Bq": 1e-3, "USD": 1.0, "h": 1.0,
}

# Elementary water resource inputs → litres. Used only by the rejected walk.
WATER_TO_L = {"kg": 1.0, "g": 1e-3, "l": 1.0, "m3": 1000.0,
              "gal (US liq)": 3.785411784, "cu ft": 28.316846592}

# --- curated activity set ------------------------------------------------
# (slug, exact USLCI process name, exact fuel flow name)
ACTIVITY_SPECS = [
    ("passenger_car_gasoline", "Transport, passenger car, gasoline powered", "Gasoline, at refinery"),
    ("passenger_car_diesel", "Transport, passenger car, diesel powered", "Diesel, at refinery"),
    ("passenger_truck_gasoline", "Transport, passenger truck, gasoline powered", "Gasoline, at refinery"),
    ("passenger_truck_diesel", "Transport, passenger truck, diesel powered", "Diesel, at refinery"),
    ("motorcycle_gasoline", "Transport, motorcycle, gasoline powered", "Gasoline, at refinery"),
    ("transit_bus_diesel", "Transport, transit bus, diesel powered", "Diesel, at refinery"),
    ("intercity_bus_diesel", "Transport, intercity bus, diesel powered", "Diesel, at refinery"),
    ("school_bus_diesel", "Transport, school bus, diesel powered", "Diesel, at refinery"),
    ("train_diesel", "Transport, train, diesel powered", "Diesel, at refinery"),
    ("aircraft_freight", "Transport, aircraft, freight", "Kerosene, at refinery"),
    ("combination_truck_diesel", "Transport, combination truck, diesel powered", "Diesel, dispensed at pump"),
    ("single_unit_truck_diesel", "Transport, single unit truck, diesel powered", "Diesel, dispensed at pump"),
    ("light_commercial_truck_diesel", "Transport, light commercial truck, diesel powered", "Diesel, dispensed at pump"),
    ("light_commercial_truck_gasoline", "Transport, light commercial truck, gasoline powered", "Gasoline, dispensed at pump"),
    ("ocean_freighter_diesel", "Transport, ocean freighter, diesel powered", "Diesel, at refinery"),
    ("barge_diesel", "Transport, barge, diesel powered", "Diesel, at refinery"),
]

DATA_NOTES = {
    "passenger_car_diesel": (
        "USLCI reports the identical fuel volume per p*km for the diesel and "
        "gasoline passenger car (0.0630015993522655 l). Treat the diesel car "
        "coefficient as a gasoline-derived placeholder, not an independent "
        "measurement."
    ),
    "motorcycle_gasoline": (
        "USLCI reports more fuel per p*km for the motorcycle than for the "
        "passenger car; the difference is an occupancy assumption (~1 rider vs "
        "~1.5 car occupants), not engine efficiency."
    ),
}

# --- mode → factor mapping ------------------------------------------------
# (mode, activity slug, fuel key in fuel_water_intensity.yaml, value field name)
MODE_SPECS = [
    ("petrol_car", "passenger_car_gasoline", "gasoline", "value_l_per_pkm"),
    ("diesel_car", "passenger_car_diesel", "diesel", "value_l_per_pkm"),
    ("petrol_light_truck", "passenger_truck_gasoline", "gasoline", "value_l_per_pkm"),
    ("bus", "transit_bus_diesel", "diesel", "value_l_per_pkm"),
    ("bus_intercity", "intercity_bus_diesel", "diesel", "value_l_per_pkm"),
    ("truck_tkm", "combination_truck_diesel", "diesel", "value_l_per_tkm"),
    ("rail_freight_tkm", "train_diesel", "diesel", "value_l_per_tkm"),
    ("air_freight_tkm", "aircraft_freight", "jet_fuel", "value_l_per_tkm"),
]

UNSUPPORTED_MODES = [
    ("ev_car", "USLCI electricity processes carry no water data; grid water "
               "intensity unavailable in v1"),
    ("rail", "USLCI has no passenger-km rail process; only freight rail "
             "(Transport, train, diesel powered, t*km) exists. Use "
             "rail_freight_tkm or a non-USLCI passenger-rail source."),
    ("air_short", "USLCI has no passenger-km aircraft process; only "
                  "Transport, aircraft, freight (t*km) exists."),
    ("air_long", "USLCI has no passenger-km aircraft process; only "
                 "Transport, aircraft, freight (t*km) exists."),
]


# --- JSON-LD loading ------------------------------------------------------

def load_db(path: Path):
    """Read the JSON-LD zip once into in-memory process/flow indexes."""
    with zipfile.ZipFile(path) as z:
        procs, flows = [], {}
        for name in z.namelist():
            if not name.endswith(".json"):
                continue
            if name.startswith("processes/"):
                procs.append(json.loads(z.read(name)))
            elif name.startswith("flows/"):
                f = json.loads(z.read(name))
                flows[f["@id"]] = f
        meta = json.loads(z.read("openlca.json"))
    return procs, flows, meta


def ref_exchange(proc):
    for e in proc["exchanges"]:
        if e.get("isQuantitativeReference"):
            return e
    return None


def prop_factor(flow, prop_id):
    """Conversion factor of flow property `prop_id` on `flow` (ref-prop basis)."""
    for fp in flow.get("flowProperties", []):
        if fp["flowProperty"]["@id"] == prop_id:
            return fp.get("conversionFactor", 1.0)
    return None


def amount_in_ref_property(exchange, flow):
    """Exchange amount expressed in the flow's reference flow-property units.

    openLCA stores, per flow, a conversionFactor for each flow property giving
    that property's reference-unit amount per one reference-property unit. So
    dividing by it lands back on the reference property. This is USLCI's own
    conversion table — no external energy-density assumption is introduced.
    """
    unit = exchange["unit"]["name"]
    scale = UNIT_TO_REF.get(unit)
    if scale is None:
        return None
    amount = exchange["amount"] * scale
    prop_id = exchange.get("flowProperty", {}).get("@id")
    cf = prop_factor(flow, prop_id) if prop_id else None
    if cf in (None, 0):
        return None
    return amount / cf


def litres_of(exchange, flow):
    """Exchange amount converted to litres using the flow's own properties."""
    ref = amount_in_ref_property(exchange, flow)
    if ref is None:
        return None
    for fp in flow.get("flowProperties", []):
        if fp["flowProperty"]["name"] == "Volume":
            return ref * fp.get("conversionFactor", 1.0) * 1000.0  # m3 → l
    return None


# --- transport_activity ---------------------------------------------------

def build_activities(procs, flows):
    by_name = {}
    for p in procs:
        by_name.setdefault(p["name"], []).append(p)

    rows, missing = [], []
    for key, pname, fuel_name in ACTIVITY_SPECS:
        cands = by_name.get(pname, [])
        if not cands:
            missing.append({"activity": key, "process_name": pname,
                            "reason": "process name not found in USLCI package"})
            continue
        if len(cands) > 1:
            raise SystemExit(f"ambiguous process name {pname!r}: {len(cands)} matches")
        p = cands[0]
        ref = ref_exchange(p)
        fuel = next(
            (e for e in p["exchanges"]
             if e.get("isInput") and e["flow"]["name"] == fuel_name), None)
        if ref is None or fuel is None:
            missing.append({"activity": key, "process_name": pname,
                            "reason": f"no {'reference' if ref is None else fuel_name} exchange"})
            continue

        fuel_flow = flows[fuel["flow"]["@id"]]
        fuel_l = litres_of(fuel, fuel_flow)
        if fuel_l is None:
            missing.append({"activity": key, "process_name": pname,
                            "reason": f"cannot convert {fuel['unit']['name']} to litres"})
            continue

        doc = p.get("processDocumentation", {})
        ref_unit = ref["unit"]["name"]
        row = {
            "factor_id": f"uslci:act:{slug(key)}",
            **DATASET_META,
            "process_uuid": p["@id"],
            "process_name": p["name"],
            "process_category": p.get("category"),
            "process_type": p.get("processType"),
            "reference_flow": {
                "name": ref["flow"]["name"],
                "amount": ref["amount"],
                "unit": ref_unit,
            },
            "fuel_flow": fuel_name,
            "fuel_amount": fuel["amount"],
            "fuel_unit": fuel["unit"]["name"],
            "fuel_amount_l": fuel_l,
            "geography": (p.get("location") or {}).get("name")
                         or doc.get("geographyDescription"),
            "valid_from": doc.get("validFrom"),
            "valid_until": doc.get("validUntil"),
            "time_description": doc.get("timeDescription"),
            "is_copyright_protected": doc.get("isCopyrightProtected"),
            "rights": doc.get("restrictionsDescription"),
            "rights_note": (
                "USLCI record; retain process UUID, release and restriction "
                "text with any redistribution of this factor."
            ),
        }
        if fuel["unit"]["name"] != "l":
            row["unit_conversion"] = (
                f"fuel exchange is {fuel['amount']} {fuel['unit']['name']}; "
                f"converted to {fuel_l} l using the USLCI flow's own "
                f"Energy/Volume/Mass flow-property factors for "
                f"'{fuel_name}' (no external energy density assumed)"
            )
        if ref_unit == "p*km":
            row["occupancy_note"] = OCCUPANCY_NOTE
        if key in DATA_NOTES:
            row["data_note"] = DATA_NOTES[key]
        rows.append(row)

    return rows, missing


# --- transport_factors ----------------------------------------------------

def build_factors(activities, fuels_cfg, missing_activities):
    by_key = {a["factor_id"].split(":")[-1]: a for a in activities}
    fuels = fuels_cfg["fuels"]
    sources = fuels_cfg["sources"]
    rows, skipped = [], []

    for mode, act_key, fuel_key, value_field in MODE_SPECS:
        act = by_key.get(act_key)
        if act is None:
            skipped.append({"mode": mode, "activity": act_key,
                            "reason": "no USLCI activity process available"})
            continue
        fuel = fuels[fuel_key]
        amt = act["fuel_amount_l"]
        ref_unit = act["reference_flow"]["unit"]
        functional_unit = {"p*km": "l_water_per_pkm",
                           "t*km": "l_water_per_tkm",
                           "km": "l_water_per_km"}[ref_unit]

        assumptions = [
            "Fuel-cycle water only (crude production, crude transport, "
            "refining, distribution to pump).",
            "Vehicle manufacture, maintenance, and road/rail/airport "
            "infrastructure are excluded.",
            "Activity coefficient is a USLCI FY2025 Q2 technosphere exchange; "
            "USLCI water exchanges are deliberately not used (see "
            "uslci_audit.json).",
            "Freshwater consumption, not withdrawal.",
            f"Fuel water intensity is a U.S. literature constant "
            f"({fuel['value']} l water/l fuel, range "
            f"{fuel['range_low']}-{fuel['range_high']}); the range is wide "
            f"because crude recovery method dominates.",
        ]
        if ref_unit == "p*km":
            assumptions.append(OCCUPANCY_NOTE)
        if "unit_conversion" in act:
            assumptions.append(act["unit_conversion"])
        if act_key in DATA_NOTES:
            assumptions.append(DATA_NOTES[act_key])

        rows.append({
            "factor_id": f"drop:transport:{mode}",
            "mode": mode,
            "unsupported": False,
            "metric_type": "freshwater_consumption",
            "functional_unit": functional_unit,
            value_field: amt * fuel["value"],
            "range_l": {"low": amt * fuel["range_low"],
                        "high": amt * fuel["range_high"]},
            "confidence": "low",
            "geography": "US",
            "system_boundary": fuels_cfg["system_boundary"],
            "assumptions": assumptions,
            "provenance": {
                "activity": {
                    "source": "uslci",
                    "factor_id": act["factor_id"],
                    "process_uuid": act["process_uuid"],
                    "process_name": act["process_name"],
                    "dataset_release": act["dataset_release"],
                    "fuel_flow": act["fuel_flow"],
                    "fuel_amount_l": amt,
                    "reference_unit": ref_unit,
                    "valid_from": act["valid_from"],
                    "valid_until": act["valid_until"],
                },
                "water_intensity": {
                    "source": "literature",
                    "fuel": fuel_key,
                    "value_l_per_l_fuel": fuel["value"],
                    "range_l_per_l_fuel": {"low": fuel["range_low"],
                                           "high": fuel["range_high"]},
                    "metric_type": fuel["metric_type"],
                    "geography": fuel["geography"],
                    "year": fuel["year"],
                    "basis": fuel["basis"],
                    "citation": sources[fuel["primary_source"]]["citation"],
                    "supporting_citations": [
                        sources[s]["citation"]
                        for s in fuel.get("supporting_sources", [])
                    ],
                },
            },
        })

    for mode, reason in UNSUPPORTED_MODES:
        rows.append({
            "factor_id": f"drop:transport:{mode}",
            "mode": mode,
            "unsupported": True,
            "reason": reason,
        })

    for m in missing_activities:
        skipped.append({"mode": None, "activity": m["activity"],
                        "reason": m["reason"]})
    return rows, skipped


# --- the rejected recursive water walk ------------------------------------

def is_freshwater_resource(flow):
    cat = flow.get("category") or ""
    return (flow["name"].startswith("Water")
            and cat.startswith("Elementary flows/resource/water")
            and "saline" not in cat.lower()
            and "saline" not in flow["name"].lower())


def naive_water_walk(procs, flows, root_uuid, follow_coproducts=True, max_depth=12):
    """Simplified recursive solve of elementary freshwater inputs.

    This exists ONLY to document why USLCI water is rejected. It applies
    PHYSICAL_ALLOCATION factors for multi-output processes and follows product
    inputs to a producing process. Two knobs are exposed because the answer is
    extremely sensitive to both of them, which is itself the finding:
    `follow_coproducts` decides whether co-products such as "Gasoline, at
    refinery" (the refinery's reference flow is diesel) are resolved at all,
    and `max_depth` decides how much of the biofuel-blending chain — and with
    it USLCI's mis-normalized irrigation water — is pulled in.
    """
    by_id = {p["@id"]: p for p in procs}
    # Provider index: prefer the process that declares the flow as its
    # quantitative reference; otherwise fall back to any process that emits it
    # as a co-product (the refinery slate — gasoline and kerosene are
    # co-products of "Petroleum refining, at refinery", whose reference is
    # diesel — would otherwise be cut off entirely).
    provider, coproduct = {}, {}
    for p in procs:
        ref = ref_exchange(p)
        if ref and ref["flow"]["flowType"] == "PRODUCT_FLOW":
            provider.setdefault(ref["flow"]["@id"], p)
        for e in p["exchanges"]:
            if (not e.get("isInput")
                    and e["flow"]["flowType"] == "PRODUCT_FLOW"
                    and not e.get("isQuantitativeReference")):
                coproduct.setdefault(e["flow"]["@id"], p)
    if follow_coproducts:
        for fid, p in coproduct.items():
            provider.setdefault(fid, p)

    trunc = Counter()
    trunc_examples = {}
    contrib = Counter()

    def note(kind, detail):
        trunc[kind] += 1
        trunc_examples.setdefault(kind, detail)

    def alloc(proc, flow_id):
        outs = [e for e in proc["exchanges"]
                if not e.get("isInput") and e["flow"]["flowType"] == "PRODUCT_FLOW"]
        if len(outs) <= 1:
            return 1.0
        for a in proc.get("allocationFactors", []):
            if (a.get("allocationType") == "PHYSICAL_ALLOCATION"
                    and a["product"]["@id"] == flow_id and "exchange" not in a):
                return a["value"]
        note("no_allocation_factor", proc["name"])
        return 1.0

    def walk(proc, scale, depth, stack):
        total = 0.0
        for e in proc["exchanges"]:
            if not e.get("isInput"):
                continue
            f = e["flow"]
            if f["flowType"] == "ELEMENTARY_FLOW":
                if not is_freshwater_resource(f):
                    continue
                conv = WATER_TO_L.get(e["unit"]["name"])
                if conv is None:
                    note("water_unit_unknown", f"{f['name']} {e['unit']['name']}")
                    continue
                litres = scale * e["amount"] * conv
                total += litres
                contrib[proc["name"]] += litres
                continue
            if f["flowType"] != "PRODUCT_FLOW":
                continue
            prov = provider.get(f["@id"])
            if prov is None:
                note("missing_provider", f["name"])
                continue
            if prov["@id"] in stack:
                note("cycle", f"{proc['name']} -> {prov['name']}")
                continue
            if depth >= max_depth:
                note("max_depth", f["name"])
                continue
            want = amount_in_ref_property(e, flows[f["@id"]])
            out = next((x for x in prov["exchanges"]
                        if not x.get("isInput") and x["flow"]["@id"] == f["@id"]), None)
            have = amount_in_ref_property(out, flows[f["@id"]]) if out else None
            if want is None or have in (None, 0):
                note("unit_mismatch", f["name"])
                continue
            sub = scale * (want / have) * alloc(prov, f["@id"])
            total += walk(prov, sub, depth + 1, stack | {prov["@id"]})
        return total

    root = by_id[root_uuid]
    litres = walk(root, 1.0, 0, {root_uuid})
    top = [{"process_name": n, "l_per_pkm": v} for n, v in contrib.most_common(5)]
    return {
        "follow_coproducts": follow_coproducts,
        "max_depth": max_depth,
        "result_l_freshwater_per_pkm": litres,
        "top_contributors": top,
        "truncations": dict(trunc),
        "truncation_examples": trunc_examples,
    }


# --- audit ----------------------------------------------------------------

def build_audit(procs, flows, meta, activities, missing_activities, factors):
    water_units = Counter()
    n_water_proc = 0
    n_fresh_proc = 0
    for p in procs:
        hits = [e for e in p["exchanges"]
                if e.get("isInput")
                and e["flow"]["flowType"] == "ELEMENTARY_FLOW"
                and e["flow"]["name"].startswith("Water")
                and (e["flow"].get("category") or "").startswith(
                    "Elementary flows/resource/water")]
        if hits:
            n_water_proc += 1
        fresh = [e for e in hits if is_freshwater_resource(e["flow"])]
        if fresh:
            n_fresh_proc += 1
        for e in fresh:
            water_units[e["unit"]["name"]] += 1

    elec = sorted(
        ({"process_name": p["name"], "process_uuid": p["@id"],
          "exchange_count": len(p["exchanges"]),
          "water_input_exchanges": sum(
              1 for e in p["exchanges"]
              if e.get("isInput") and e["flow"]["flowType"] == "ELEMENTARY_FLOW"
              and "water" in (e["flow"].get("category") or "").lower())}
         for p in procs if p["name"].lower().startswith("electricity")),
        key=lambda r: r["process_name"])

    car = next(a for a in activities
               if a["process_name"] == "Transport, passenger car, gasoline powered")
    variants = [
        naive_water_walk(procs, flows, car["process_uuid"],
                         follow_coproducts=co, max_depth=d)
        for co in (False, True) for d in (6, 12)
    ]
    results = [v["result_l_freshwater_per_pkm"] for v in variants]
    lo, hi = min(results), max(results)

    refinery = next(p for p in procs if p["name"] == "Petroleum refining, at refinery")
    ref_water = next(e for e in refinery["exchanges"]
                     if e.get("isInput") and e["flow"]["name"] == "Water"
                     and e["flow"]["flowType"] == "ELEMENTARY_FLOW")
    gas_out = next(e for e in refinery["exchanges"]
                   if not e.get("isInput") and e["flow"]["name"] == "Gasoline, at refinery")
    gas_alloc = next(a["value"] for a in refinery.get("allocationFactors", [])
                     if a.get("allocationType") == "PHYSICAL_ALLOCATION"
                     and a["product"]["name"] == "Gasoline, at refinery"
                     and "exchange" not in a)

    return {
        "source": {
            "file": ZIP.name,
            "release": DATASET_META["dataset_release"],
            "schema_version": meta.get("schemaVersion"),
            "declared_external_libraries": [
                lib.get("id") for lib in meta.get("libraries", [])],
        },
        "counts": {
            "processes": len(procs),
            "flows": len(flows),
            "processes_with_water_resource_inputs": n_water_proc,
            "processes_with_freshwater_resource_inputs": n_fresh_proc,
            "freshwater_input_units_seen": dict(sorted(water_units.items())),
            "counting_rule": (
                "An input exchange counts as a water resource when its flow "
                "name starts with 'Water' and its category is under "
                "'Elementary flows/resource/water'. Freshwater additionally "
                "excludes anything marked saline. Broader scans that also "
                "count 'Water' under resource/air or 'Raw material, "
                "unspecified' report a higher process count."
            ),
        },
        "electricity_processes": {
            "count": len(elec),
            "all_zero_water_inputs": all(e["water_input_exchanges"] == 0 for e in elec),
            "processes": elec,
            "explanation": (
                "openlca.json declares the external openLCA library "
                + ", ".join(lib.get("id", "?") for lib in meta.get("libraries", []))
                + ", which is "
                "not shipped inside this JSON-LD package. The grid mix and its "
                "water inventory live in that library, so every electricity "
                "process in the package resolves to zero water. This is why "
                "ev_car cannot be supported from USLCI alone."
            ),
        },
        "activity_coefficients_used": [
            {"process_name": a["process_name"], "process_uuid": a["process_uuid"],
             "reference_unit": a["reference_flow"]["unit"],
             "fuel_flow": a["fuel_flow"],
             "fuel_amount": a["fuel_amount"], "fuel_unit": a["fuel_unit"],
             "fuel_amount_l": a["fuel_amount_l"]}
            for a in activities
        ],
        "activities_not_found": missing_activities,
        "refinery_water_evidence": {
            "process_name": refinery["name"],
            "process_uuid": refinery["@id"],
            "default_allocation_method": refinery.get("defaultAllocationMethod"),
            "water_elementary_input": {"amount": ref_water["amount"],
                                       "unit": ref_water["unit"]["name"],
                                       "flow_category": ref_water["flow"].get("category")},
            "gasoline_output": {"amount": gas_out["amount"],
                                "unit": gas_out["unit"]["name"]},
            "gasoline_physical_allocation_factor": gas_alloc,
            "note": (
                "A whole refinery is represented by one 1.68 l 'Water' resource "
                "input, allocated across the full product slate. That is a "
                "process-water placeholder, not a fuel-cycle water footprint: "
                "it carries no crude-production water and no exchange-level "
                "data-quality score."
            ),
        },
        "naive_recursive_walk": {
            "root_process": car["process_name"],
            "root_uuid": car["process_uuid"],
            "reference_unit": car["reference_flow"]["unit"],
            "method": (
                "Recursive expansion of technosphere inputs to a producing "
                "process, with PHYSICAL_ALLOCATION factors applied to "
                "multi-output processes, summing elementary freshwater "
                "resource inputs (saline excluded). Run under four modelling "
                "choices: whether co-product outputs are resolved at all, and "
                "a depth cap of 6 vs 12."
            ),
            "variants": variants,
            "result_l_freshwater_per_pkm_low": lo,
            "result_l_freshwater_per_pkm_high": hi,
            "spread_factor": (hi / lo) if lo else None,
            "prior_inspection_reference": (
                "An earlier hand-run solve of this same process reported "
                "~0.00266 L/p*km. That sits in the same band as the "
                "reference-provider-only variants here (~0.0016-0.026 "
                "L/p*km), i.e. it is one particular point in a spread that "
                "the modelling choices, not the data, determine."
            ),
            "rejected": True,
            "rejection_reasons": [
                "The answer is not stable. Across four defensible modelling "
                "choices the same process yields "
                f"{lo:.5f} to {hi:.4f} L/p*km, a spread of about "
                f"{(hi / lo):.0f}x. A factor Drop ships cannot depend that "
                "strongly on a depth cap.",
                "The restrictive variants land two orders of magnitude below "
                "every published estimate of gasoline-car fuel-cycle water "
                "(literature: roughly 0.3-1.1 L freshwater per vehicle-km).",
                "Crude production water — the dominant term in the real fuel "
                "cycle — is absent: 'Crude oil, production mixture, at "
                "extraction' declares no freshwater resource input, so the "
                "whole upstream oilfield burden is simply missing.",
                "The permissive variants are dominated not by fuel at all but "
                "by USLCI's mis-normalized agricultural processes ('Soybean "
                "grains, at field', 'Forest residue, processed and loaded'), "
                "which leak irrigation water into the chain through biofuel "
                "blending and swamp the refinery term.",
                "Electricity inputs anywhere in the chain contribute zero "
                "water because the grid library is external to this package.",
                "Product inputs with no provider in the package are silently "
                "cut off, so every variant is a truncated lower bound of a "
                "model that is already computing the wrong metric.",
                "USLCI water exchanges mix withdrawal, process water and "
                "irrigation semantics with no exchange-level data-quality "
                "score, so even a complete solve would not yield consumptive "
                "freshwater.",
            ],
            "consequence": (
                "No USLCI-only water number is emitted as a Drop factor. "
                "transport_factors[] multiplies the USLCI activity coefficient "
                "by a literature water intensity from "
                "config/fuel_water_intensity.yaml."
            ),
        },
        "agricultural_normalization_warning": {
            "note": (
                "USLCI agricultural processes are mis-normalized for consumer "
                "use (e.g. 'Cotton, whole plant, at field' reports 1,307,000 kg "
                "water per 1 kg reference output). No USLCI agricultural water "
                "value is used anywhere in Drop."
            ),
        },
        "emitted": {
            "transport_activity_rows": len(activities),
            "transport_factor_rows": sum(1 for f in factors if not f.get("unsupported")),
            "unsupported_mode_rows": sum(1 for f in factors if f.get("unsupported")),
        },
    }


def main():
    if not ZIP.exists():
        raise SystemExit(f"missing USLCI package: {ZIP}")
    fuels_cfg = yaml.safe_load((CONFIG / "fuel_water_intensity.yaml").read_text())
    procs, flows, meta = load_db(ZIP)

    activities, missing = build_activities(procs, flows)
    factors, skipped = build_factors(activities, fuels_cfg, missing)

    for m in missing:
        print(f"  activity not found: {m['activity']}: {m['reason']}")
    for s in skipped:
        print(f"  mode skipped: {s['mode'] or s['activity']}: {s['reason']}")

    p1 = write_json("transport_factors.json", {
        "transport_activity": activities,
        "transport_factors": factors,
        "skipped": skipped,
    })
    audit = build_audit(procs, flows, meta, activities, missing, factors)
    p2 = write_json("uslci_audit.json", audit)

    print(f"wrote {p1.name}: {len(activities)} activity rows, "
          f"{len(factors)} factor rows "
          f"({sum(1 for f in factors if f.get('unsupported'))} unsupported)")
    walk = audit["naive_recursive_walk"]
    print(f"wrote {p2.name}: {audit['counts']['processes']} processes, "
          f"{audit['counts']['flows']} flows, naive walk = "
          f"{walk['result_l_freshwater_per_pkm_low']:.5f}-"
          f"{walk['result_l_freshwater_per_pkm_high']:.4f} L/p*km "
          f"({walk['spread_factor']:.0f}x spread, rejected)")

    # Gates
    assert audit["counts"]["processes"] == 962, audit["counts"]["processes"]
    assert audit["counts"]["flows"] == 4081, audit["counts"]["flows"]
    assert audit["electricity_processes"]["count"] == 13
    assert audit["electricity_processes"]["all_zero_water_inputs"]
    car = next(a for a in activities if a["factor_id"].endswith("passenger_car_gasoline"))
    assert abs(car["fuel_amount_l"] - 0.0630015993522655) < 1e-12, car["fuel_amount_l"]
    assert any(f["mode"] == "ev_car" and f["unsupported"] for f in factors)
    print("gates passed")


if __name__ == "__main__":
    main()
