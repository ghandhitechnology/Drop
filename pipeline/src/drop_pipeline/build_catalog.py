"""Build the controlled catalog — the contract between the LLM, the app,
and the water engine. Emits catalog.json + catalog.prompt.txt and rebuilds
manifest.json.

Every catalog entry names its factor links explicitly; the classification
model only ever returns catalog_ids from this file.
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from drop_pipeline.emit import DATA_DIR, rebuild_manifest, write_json
from drop_pipeline.normalize import slug

CONFIG = Path(__file__).resolve().parents[2] / "config"

# Freight factors are per tonne-kilometre. The engine takes a distance, not a
# mass+distance pair, so a t·km factor cannot be turned into a personal number
# — these ship as unsupported rather than as a transport entry that would
# silently read a distance as if it were tonne-kilometres.
FREIGHT_TKM_MODES = {"truck_tkm", "rail_freight_tkm", "air_freight_tkm"}
FREIGHT_REASON = ("freight is tracked per tonne-kilometre; personal tracking "
                  "arrives later")

# Labels for modes the USLCI extractor emits without display text. Everything
# here is either unsupported or freight, so the classifier needs the words to
# pick them on purpose instead of falling back to a petrol car.
TRANSPORT_LABELS = {
    "ev_car": ("Electric Car", ["ev", "electric car", "tesla", "battery car",
                                "전기차"]),
    "rail": ("Train (Passenger)", ["train", "rail", "subway", "metro",
                                   "기차"]),
    "air_short": ("Flight (Short Haul)", ["flight", "plane", "short haul"]),
    "air_long": ("Flight (Long Haul)", ["flight", "plane", "long haul"]),
    "truck_tkm": ("Truck Freight (per t·km)", ["truck freight", "lorry"]),
    "rail_freight_tkm": ("Rail Freight (per t·km)", ["freight train"]),
    "air_freight_tkm": ("Air Freight (per t·km)", ["air cargo"]),
}

# Fallback serving for a liquid typology generic with no member default.
LIQUID_GENERIC_DEFAULT = (0.25, "l", "typical glass")


def load_json(name):
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


def load_yaml(name):
    return yaml.safe_load((CONFIG / name).read_text(encoding="utf-8"))


def main():
    sel = load_json("food_sueatable.json")
    hestia = load_json("food_hestia_country.json")["hestia_factors"]
    owid = load_json("food_owid_proxy.json")["owid_factors"]
    useeio = load_json("sector_useeio.json")["useeio_sectors"]
    transport = load_json("transport_factors.json")

    overrides = load_yaml("catalog_overrides.yaml")
    hestia_map = load_yaml("hestia_to_catalog.yaml")["mappings"]
    owid_map = load_yaml("owid_to_catalog.yaml")["mappings"]
    off_map = load_yaml("off_category_map.yaml")["mappings"]

    items = sel["food_items"]
    typologies = sel["food_typologies"]
    item_by_fid = {i["factor_id"]: i for i in items}
    typ_by_key = {t["typology_key"]: t for t in typologies}

    # invert attach maps
    hestia_by_item = {}
    hestia_products = {}
    for h in hestia:
        hestia_products.setdefault(h["product_id"], []).append(h["factor_id"])
    for pid, target in hestia_map.items():
        if pid not in hestia_products:
            raise SystemExit(f"hestia_to_catalog: unknown product {pid}")
        if target not in item_by_fid:
            raise SystemExit(f"hestia_to_catalog: unknown target {target}")
        hestia_by_item.setdefault(target, []).extend(hestia_products[pid])

    owid_by_target = {}
    owid_by_entity = {o["entity"]: o["factor_id"] for o in owid}
    typ_fids = {t["factor_id"] for t in typologies}
    for entity, target in owid_map.items():
        if entity not in owid_by_entity:
            raise SystemExit(f"owid_to_catalog: unknown entity {entity}")
        if target not in item_by_fid and target not in typ_fids:
            raise SystemExit(f"owid_to_catalog: unknown target {target}")
        owid_by_target[target] = owid_by_entity[entity]

    off_by_target = {}
    for tag, target in off_map.items():
        off_by_target.setdefault(target, []).append(tag)

    typ_defaults = overrides.get("typology_defaults", {})
    item_over = overrides.get("item_overrides", {})
    synonyms = overrides.get("synonyms", {})
    recipes = overrides.get("recipes", {})
    display_over = overrides.get("display_overrides", {})

    entries = []
    seen = set()

    def add(entry):
        cid = entry["catalog_id"]
        if cid in seen:
            raise SystemExit(f"duplicate catalog_id {cid}")
        seen.add(cid)
        syn = entry.get("synonyms") or []
        entry["search_tokens"] = " ".join(
            dict.fromkeys((entry["display_name"] + " " + " ".join(syn))
                          .lower().split()))
        entries.append(entry)

    # ---- SU-EATABLE items -------------------------------------------------
    # A typology generic must describe its members: a BEER generic sold as
    # "0.1 kg" is simply wrong. Collect member units/servings as we go.
    typ_member_units = defaultdict(Counter)
    typ_member_qty = defaultdict(Counter)

    def modal(counter, default):
        """Most common key; ties broken by the key itself, so it is stable."""
        if not counter:
            return default
        return min(counter.items(), key=lambda kv: (-kv[1], kv[0]))[0]

    for it in items:
        fid = it["factor_id"]
        cid = fid.split("sel:item:")[1]
        typ_key = it["typology_key"]
        typ = typ_by_key.get(typ_key)
        typ_fid = typ["factor_id"] if typ else None
        qty = item_over.get(fid) or typ_defaults.get(it["typology"]) or None
        if qty is None:
            raise SystemExit(
                f"no default quantity for {fid} (typology {it['typology']!r})")
        typ_member_units[typ_key][it["functional_unit"]] += 1
        typ_member_qty[typ_key][(qty["quantity"], qty["unit"],
                                 qty.get("basis", "typical serving"))] += 1
        add({
            "catalog_id": cid,
            "display_name": display_over.get(fid, it["display_name"]),
            "synonyms": synonyms.get(fid, []),
            "category": "drink" if it["functional_unit"] == "l" else "food",
            "subcategory": f"{it['group'].lower()}/{slug(it['typology'])}",
            "state": "liquid" if it["functional_unit"] == "l" else "solid",
            "default_quantity": {
                "value": qty["quantity"], "unit": qty["unit"],
                "basis": qty.get("basis", "typical serving"),
            },
            "factor_links": {
                "primary": {"factor_id": fid, "match_level": "exact_item"},
                "typology": {"factor_id": typ_fid} if typ_fid else None,
                "secondary": [{"factor_id": h,
                               "metric_type": "freshwater_withdrawal"}
                              for h in hestia_by_item.get(fid, [])],
                "proxy": ({"factor_id": owid_by_target[fid],
                           "metric_type": "freshwater_withdrawal"}
                          if fid in owid_by_target else None),
                "spend": None,
            },
            "recipe": None,
            "off_category_tags": off_by_target.get(fid, []),
        })

    # ---- typology generics ------------------------------------------------
    for t in typologies:
        key = t["typology_key"]
        base = key.split("|")[1].title()
        cid = "generic_" + slug(key.replace("|", " "))
        # unit follows the members, not a hard-coded "kg"
        unit = modal(typ_member_units[key], "kg")
        if unit == "l":
            liquid_qty = Counter({q: n for q, n in typ_member_qty[key].items()
                                  if q[1] == "l"})
            value, q_unit, basis = modal(liquid_qty, LIQUID_GENERIC_DEFAULT)
        else:
            value, q_unit, basis = 0.1, "kg", "typical serving"
        add({
            "catalog_id": cid,
            "display_name": f"{base} (general)",
            "synonyms": [],
            "category": "drink" if unit == "l" else "food",
            "subcategory": f"{t['group'].lower()}/{slug(t['typology'])}",
            "state": "liquid" if unit == "l" else "solid",
            "default_quantity": {"value": value, "unit": q_unit,
                                 "basis": basis},
            "factor_links": {
                "primary": {"factor_id": t["factor_id"],
                            "match_level": "typology"},
                "typology": {"factor_id": t["factor_id"]},
                "secondary": [],
                "proxy": ({"factor_id": owid_by_target[t["factor_id"]],
                           "metric_type": "freshwater_withdrawal"}
                          if t["factor_id"] in owid_by_target else None),
                "spend": None,
            },
            "recipe": None,
            "off_category_tags": off_by_target.get(t["factor_id"], []),
        })

    # ---- recipes ----------------------------------------------------------
    for rid, r in recipes.items():
        comps = r["components"]
        total = sum(c["fraction"] for c in comps)
        if abs(total - 1.0) > 1e-3:
            raise SystemExit(f"recipe {rid}: fractions sum to {total}")
        for c in comps:
            if c["item"] not in item_by_fid:
                raise SystemExit(f"recipe {rid}: unknown item {c['item']}")
        add({
            "catalog_id": rid,
            "display_name": r["display"],
            "synonyms": r.get("synonyms", []),
            "category": "food",
            "subcategory": "prepared/dish",
            "state": "liquid" if r["unit"] == "l" else "solid",
            "default_quantity": {"value": r["quantity"], "unit": r["unit"],
                                 "basis": "typical dish"},
            "factor_links": {
                "primary": {"factor_id": None, "match_level": "recipe_sum"},
                "typology": None, "secondary": [], "proxy": None,
                "spend": None,
            },
            "recipe": [{"item_catalog_id":
                        c["item"].split("sel:item:")[1],
                        "factor_id": c["item"],
                        "fraction": c["fraction"]} for c in comps],
            "off_category_tags": off_by_target.get(f"recipe:{rid}", []),
        })

    # ---- transport --------------------------------------------------------
    for tf in transport["transport_factors"]:
        mode = tf["mode"]
        cid = f"transport_{mode}"
        label, label_syn = TRANSPORT_LABELS.get(
            mode, (mode.replace("_", " ").title(), []))
        display = tf.get("display") or label
        syns = tf.get("synonyms") or label_syn
        if tf.get("unsupported") or mode in FREIGHT_TKM_MODES:
            reason = tf["reason"] if tf.get("unsupported") else FREIGHT_REASON
            add({
                "catalog_id": cid,
                "display_name": display,
                "synonyms": syns,
                "category": "transport",
                "subcategory": "transport/unsupported",
                "state": "solid",
                "default_quantity": {"value": 10, "unit": "km",
                                     "basis": "typical trip"},
                "factor_links": {"primary": None, "typology": None,
                                 "secondary": [], "proxy": None,
                                 "spend": None},
                "recipe": None,
                "unsupported": {"reason": reason},
                "off_category_tags": [],
            })
            continue
        add({
            "catalog_id": cid,
            "display_name": display,
            "synonyms": syns,
            "category": "transport",
            "subcategory": "transport/" + mode,
            "state": "solid",
            "default_quantity": {"value": 10, "unit": "km",
                                 "basis": "typical trip"},
            "factor_links": {
                "primary": {"factor_id": tf["factor_id"],
                            "match_level": "transport_mode"},
                "typology": None, "secondary": [], "proxy": None,
                "spend": None,
            },
            "recipe": None,
            "off_category_tags": [],
        })

    # ---- everyday products (USEEIO spend proxy) ---------------------------
    for s in useeio:
        c = s.get("consumer")
        if not c:
            continue
        cid = f"product_{s['sector_code'].lower()}"
        add({
            "catalog_id": cid,
            "display_name": c["display"],
            "synonyms": c.get("synonyms", []),
            "category": "product",
            "subcategory": "product/" + s["sector_code"],
            "state": "solid",
            "default_quantity": {"value": c["typical_price_usd"],
                                 "unit": "usd",
                                 "basis": "typical purchase price"},
            "factor_links": {
                "primary": None, "typology": None, "secondary": [],
                "proxy": None,
                "spend": {"factor_id": s["factor_id"],
                          "match_level": "proxy_sector",
                          "metric_type": "freshwater_withdrawal"},
            },
            "recipe": None,
            "off_category_tags": [],
        })

    # ---- validate OFF map targets all resolved ---------------------------
    resolved_targets = set()
    for e in entries:
        for links in [e["factor_links"]]:
            p = links.get("primary")
            if p and p.get("factor_id"):
                resolved_targets.add(p["factor_id"])
    for tag, target in off_map.items():
        if target.startswith("recipe:"):
            if target.split("recipe:")[1] not in seen:
                raise SystemExit(f"off_category_map: unknown recipe {target}")
        elif target not in item_by_fid and target not in typ_fids:
            raise SystemExit(f"off_category_map: unknown target {target}")

    catalog = {
        "catalog_version": None,  # filled by manifest step below
        "entries": sorted(entries, key=lambda e: e["catalog_id"]),
    }
    from drop_pipeline.emit import FACTORS_VERSION
    catalog["catalog_version"] = FACTORS_VERSION
    write_json("catalog.json", catalog)

    # ---- prompt rendering (byte-stable) ----------------------------------
    # Unsupported entries stay in the prompt with a trailing |unsupported
    # marker: the classifier has to be able to say "this is an electric car"
    # and have the engine answer "no honest factor" — hiding the row only
    # pushes it to pick a petrol car instead.
    lines = []
    for e in catalog["entries"]:
        q = e["default_quantity"]
        syn = ",".join(e["synonyms"][:6])
        line = (f"{e['catalog_id']}|{e['display_name']}|{syn}|"
                f"{e['category']}|{q['value']}{q['unit']}")
        if e.get("unsupported"):
            line += "|unsupported"
        lines.append(line)
    prompt = "\n".join(lines) + "\n"
    (DATA_DIR / "catalog.prompt.txt").write_text(prompt, encoding="utf-8")

    est_tokens = len(prompt) // 3
    assert est_tokens < 25_000, f"prompt too large: ~{est_tokens} tokens"

    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rebuild_manifest(generated_at)

    print(f"catalog: {len(entries)} entries "
          f"({sum(1 for e in entries if e['category']=='food')} food, "
          f"{sum(1 for e in entries if e['category']=='drink')} drink, "
          f"{sum(1 for e in entries if e['category']=='transport')} transport, "
          f"{sum(1 for e in entries if e['category']=='product')} product); "
          f"prompt ~{est_tokens} tokens — gates passed")


if __name__ == "__main__":
    main()
