"""Extract SU-EATABLE LIFE water-footprint tables → food_sueatable.json.

Primary food factor source (total volumetric water footprint, L per kg or
L per litre of commodity, cradle to distribution). Joins the users sheet with
the item/typology/sub-typology statistics sheets and the 937-row source list.

The build FAILS on any unjoined item/typology name: fix names in
config/sueatable_aliases.yaml, never by loosening normalization.
"""

from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

import openpyxl
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from drop_pipeline.emit import DATASETS, write_json
from drop_pipeline.normalize import (
    collapse, norm_key, norm_suggested, parse_form_markers, slug,
)

XLSX = DATASETS / "su_eatable_life" / "SuEatableLife_Food_Footprint_database.xlsx"
CONFIG = Path(__file__).resolve().parents[2] / "config"

DATASET_META = {
    "dataset": "su_eatable_life",
    "dataset_release": (
        "SuEatableLife_Food_Footprint_database.xlsx "
        "(Petersson et al. 2021, Sci Data, doi:10.1038/s41597-021-00909-8)"
    ),
    "rights": "CC BY 4.0",
    "geography": "GLO",
    "system_boundary": "cradle-to-distribution-centre",
}


def fnum(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = collapse(str(v))
    if s in ("", "-", "n.a", "n.a.", "na", "NA"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def fstr(v):
    return collapse(str(v)) if v is not None else ""


def rows_of(ws, min_row, stop_col=1):
    """Yield rows until the stop column is empty (read_only pads max_row)."""
    for row in ws.iter_rows(min_row=min_row, values_only=True):
        if row is None or fstr(row[stop_col - 1]) == "":
            # users/stat sheets have no gaps; first empty key row = end
            break
        yield row


def load_aliases():
    path = CONFIG / "sueatable_aliases.yaml"
    if not path.exists():
        return {}
    data = yaml.safe_load(path.read_text()) or {}
    return {norm_key(k): norm_key(v) for k, v in (data.get("aliases") or {}).items()}


def load_liquids():
    data = yaml.safe_load((CONFIG / "liquid_items.yaml").read_text())
    return (
        {norm_key(t) for t in data.get("liquid_typologies", [])},
        {norm_key(i) for i in data.get("liquid_items", [])},
        {norm_key(i) for i in data.get("solid_item_overrides", [])},
    )


def main():
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    aliases = load_aliases()
    liquid_typs, liquid_items, solid_overrides = load_liquids()

    def akey(name):
        k = norm_key(name)
        return aliases.get(k, k)

    GROUP_ALIASES = {
        "AGRICULTURAL PROCESSED PRODUCTS": "AGRICULTURAL PROCESSED",
        "FISH": "FISHING",
    }

    def gkey(name):
        k = norm_key(name)
        return GROUP_ALIASES.get(k, k)

    # --- statistics sheets ------------------------------------------------
    items_stat = {}
    for r in rows_of(wb["SEL WF ITEMS STAT"], 3, stop_col=4):
        (group, typ, sub, item, n, mean, median, sd, mn, mx, mad, q1, q3, cv,
         skew, kurt, shapiro, flag1, flag2, flag3, suggested) = r[:21]
        items_stat[akey(item)] = {
            "group": fstr(group), "typology": fstr(typ), "sub_typology": fstr(sub),
            "stats": {
                "n": int(fnum(n) or 0), "mean": fnum(mean), "median": fnum(median),
                "sd": fnum(sd), "min": fnum(mn), "max": fnum(mx), "mad": fnum(mad),
                "q1": fnum(q1), "q3": fnum(q3), "cv": fnum(cv),
                "shapiro_p": fnum(shapiro),
            },
            "flags": {"size": fstr(flag1), "outlier": fstr(flag2),
                      "normality": fstr(flag3)},
            "suggested": fstr(suggested),
        }

    typ_stat = {}
    for r in rows_of(wb["SEL WF Typologies STAT"], 3, stop_col=2):
        (group, typ, n, mean, median, sd, mn, mx, mad, q1, q3, cv, iqr,
         lfence, ufence) = r[:15]
        tk = f"{gkey(group)}|{akey(typ)}"
        if tk in typ_stat:
            raise SystemExit(f"duplicate typology key {tk}")
        typ_stat[tk] = {
            "typology_raw": fstr(typ),
            "group": fstr(group),
            "stats": {
                "n": int(fnum(n) or 0), "mean": fnum(mean), "median": fnum(median),
                "sd": fnum(sd), "min": fnum(mn), "max": fnum(mx), "mad": fnum(mad),
                "q1": fnum(q1), "q3": fnum(q3), "cv": fnum(cv), "iqr": fnum(iqr),
                "lower_fence": fnum(lfence), "upper_fence": fnum(ufence),
            },
        }

    sub_stat = {}
    for r in rows_of(wb["SEL WF sub-Typologies STAT"], 3, stop_col=3):
        (group, typ, sub, n, mean, median, sd, mn, mx, mad, q1, q3, cv, iqr,
         lfence, ufence, anova, ttest) = r[:18]
        sub_stat[akey(sub)] = {
            "group": fstr(group), "typology": fstr(typ),
            "stats": {
                "n": int(fnum(n) or 0), "mean": fnum(mean), "median": fnum(median),
                "sd": fnum(sd), "min": fnum(mn), "max": fnum(mx), "mad": fnum(mad),
                "q1": fnum(q1), "q3": fnum(q3), "cv": fnum(cv), "iqr": fnum(iqr),
                "lower_fence": fnum(lfence), "upper_fence": fnum(ufence),
            },
            "tests": {"anova_pairwise": fstr(anova), "vs_typology": fstr(ttest)},
        }

    typ_desc = {}
    for r in rows_of(wb["List description WF typologies"], 4, stop_col=2):
        typ_desc[f"{gkey(fstr(r[0]))}|{akey(r[1])}"] = fstr(r[2])

    # --- sources ----------------------------------------------------------
    sources, sources_by_item = [], defaultdict(list)
    # fallback indexes: the DATA SOURCES sheet names items with its own
    # spelling, so ~1 item in 6 gets no rows from the name join alone.
    src_sets = defaultdict(list)                 # (group, source item) -> rows
    src_by_group_typ_value = defaultdict(list)   # (group, typology, value) -> ids
    for i, r in enumerate(rows_of(wb["SEL WF DATA SOURCES"], 2, stop_col=3)):
        (group, typ, item, value, stype, ref, year, country, region, notes,
         reported) = r[:11]
        src_id = f"sel:src:{i:04d}"
        row = {
            "source_id": src_id,
            "group": fstr(group), "typology": fstr(typ), "item": fstr(item),
            "value_l_per_kg": fnum(value),
            "type_of_source": fstr(stype), "full_reference": fstr(ref),
            "publication_year": int(fnum(year)) if fnum(year) else None,
            "country": fstr(country), "region": fstr(region),
            "notes": fstr(notes) or None,
        }
        sources.append(row)
        sources_by_item[akey(item)].append(src_id)
        src_sets[(gkey(fstr(group)), akey(item))].append(row)
        if row["value_l_per_kg"] is not None:
            src_by_group_typ_value[
                (gkey(fstr(group)), akey(typ), round(row["value_l_per_kg"], 6))
            ].append(src_id)

    # --- users sheet (the canonical item list) ----------------------------
    food_items, unjoined = [], []
    seen_ids = set()
    for row_idx, r in enumerate(rows_of(wb["SEL WF for users"], 2, stop_col=2), start=2):
        (group, item_raw, value, unc, suggested, typ_raw, typ_val, sub_raw,
         sub_val) = r[:9]
        item_raw, typ_raw, sub_raw = fstr(item_raw), fstr(typ_raw), fstr(sub_raw)
        markers = parse_form_markers(item_raw)
        ikey = akey(item_raw)
        stat = items_stat.get(ikey)
        if stat is None:
            unjoined.append(("item", item_raw, ikey))
            continue
        tkey = f"{gkey(fstr(group))}|{akey(typ_raw)}"
        if tkey not in typ_stat:
            unjoined.append(("typology", typ_raw, tkey))
        skey = akey(sub_raw) if sub_raw not in ("", "-") else None
        if skey and skey not in sub_stat:
            unjoined.append(("sub_typology", sub_raw, skey))

        is_liquid = (
            (norm_key(typ_raw) in liquid_typs or ikey in liquid_items)
            and ikey not in solid_overrides
        )
        id_suffix = "".join(
            f"_{m}" for m in ("frozen", "greenhouse", "heated_greenhouse", "imported")
            if markers[m]
        )
        factor_id = f"sel:item:{slug(markers['clean_name'])}{id_suffix}"
        if factor_id in seen_ids:
            raise SystemExit(f"duplicate factor_id {factor_id} from {item_raw!r}")
        seen_ids.add(factor_id)

        food_items.append({
            "factor_id": factor_id,
            **DATASET_META,
            "record": {"sheet": "SEL WF for users", "row": row_idx,
                       "item_name_raw": item_raw},
            "display_name": markers["clean_name"].title(),
            "group": fstr(group),
            "typology": typ_raw,
            "typology_key": tkey,
            "sub_typology": sub_raw if skey else None,
            "sub_typology_key": skey,
            "metric_type": "total_water_footprint",
            "value_l_per_kg": fnum(value),
            "typology_value_l_per_kg": fnum(typ_val),
            "sub_typology_value_l_per_kg": fnum(sub_val),
            "functional_unit": "l" if is_liquid else "kg",
            "uncertainty": fstr(unc),
            "suggested_value": norm_suggested(fstr(suggested)),
            "form_markers": {k: v for k, v in markers.items() if k != "clean_name"},
            "stats": stat["stats"],
            "flags": stat["flags"],
            "source_count": len(sources_by_item.get(ikey, [])),
            "source_refs": sources_by_item.get(ikey, []),
            "source_join": "item_name" if sources_by_item.get(ikey) else None,
        })

    # --- fallback source join --------------------------------------------
    # The DATA SOURCES sheet spells item names its own way ('SILVER BARB' vs
    # 'SILVERBARB'), so the name join above leaves items with zero provenance.
    # Two deterministic passes recover them; every attachment records how it
    # was made in `source_join` so a weaker join is never read as a name match.
    #   1. aggregate  — exactly one source set in the same group whose row
    #                   count equals the item's stats n and whose mean equals
    #                   the item's stats mean (the set the statistics came
    #                   from, whatever it is called).
    #   2. group+typology+value — source rows in the same group AND typology
    #                   reporting exactly the item's published value.
    # The typology guard on pass 2 is what keeps coincidental equal values in
    # unrelated typologies (a biscuit EPD that happens to read 1167 L/kg) from
    # being cited as an item's provenance.
    def _mean(rows):
        vals = [r["value_l_per_kg"] for r in rows if r["value_l_per_kg"] is not None]
        return sum(vals) / len(vals) if len(vals) == len(rows) and rows else None

    unsourced = []
    for it in food_items:
        if it["source_refs"]:
            continue
        gk, tk = it["typology_key"].split("|", 1)
        n, mean = it["stats"]["n"], it["stats"]["mean"]
        hit = None
        if n and mean is not None:
            cands = [
                rows for (g, _item), rows in src_sets.items()
                if g == gk and len(rows) == n
                and _mean(rows) is not None
                # the workbook's own stats round a little; 0.01 % is tight
                # enough that a same-size set in the same group is unique
                and abs(_mean(rows) - mean) <= max(0.01, abs(mean) * 1e-4)
            ]
            if len(cands) == 1:
                hit = ("group_stats", [r["source_id"] for r in cands[0]])
        if hit is None and it["value_l_per_kg"] is not None:
            refs = src_by_group_typ_value.get(
                (gk, tk, round(it["value_l_per_kg"], 6)), [])
            if refs:
                hit = ("group_typology_value", list(refs))
        if hit is None:
            unsourced.append(it["record"]["item_name_raw"])
            continue
        it["source_join"], it["source_refs"] = hit[0], hit[1]
        it["source_count"] = len(hit[1])

    if unsourced:
        # Not fatal: a few workbook items genuinely have no row on the DATA
        # SOURCES sheet. Naming them keeps that visible instead of silent.
        print(f"WARNING: {len(unsourced)} items have no DATA SOURCES rows "
              f"after the fallback joins: {', '.join(sorted(unsourced))}")

    if unjoined:
        print("UNJOINED NAMES — add to config/sueatable_aliases.yaml:")
        for kind, raw, key in sorted(set(unjoined)):
            print(f"  {kind:13s} {raw!r}  (key {key!r})")
        raise SystemExit(f"{len(set(unjoined))} unjoined names")

    food_typologies = [
        {"factor_id": f"sel:typ:{slug(k.split('|')[0])}__{slug(k.split('|')[1])}",
         **DATASET_META,
         "typology": v["typology_raw"], "typology_key": k, "group": v["group"],
         "metric_type": "total_water_footprint",
         "description": typ_desc.get(k),
         "stats": v["stats"]}
        for k, v in sorted(typ_stat.items())
    ]
    food_subtypologies = [
        {"factor_id": f"sel:sub:{slug(k)}", **DATASET_META,
         "sub_typology": k, "sub_typology_key": k,
         "typology": v["typology"], "group": v["group"],
         "metric_type": "total_water_footprint",
         "stats": v["stats"], "tests": v["tests"]}
        for k, v in sorted(sub_stat.items())
    ]

    payload = {
        "food_items": food_items,
        "food_typologies": food_typologies,
        "food_subtypologies": food_subtypologies,
        "food_sources": sources,
    }
    path = write_json("food_sueatable.json", payload)
    joins = defaultdict(int)
    for it in food_items:
        joins[it["source_join"] or "none"] += 1
    print(f"wrote {path.name}: {len(food_items)} items, "
          f"{len(food_typologies)} typologies, {len(food_subtypologies)} "
          f"sub-typologies, {len(sources)} sources")
    print("  source joins: " + ", ".join(
        f"{k}={joins[k]}" for k in sorted(joins)))

    # Gates
    assert len(food_items) == 320, len(food_items)
    assert len(food_typologies) == 72, len(food_typologies)
    assert len(food_subtypologies) == 9, len(food_subtypologies)
    by_name = {i["record"]["item_name_raw"]: i for i in food_items}
    spot = {
        "BEEF BONE FREE MEAT*": 15139, "APPLE": 622, "CHEESE": 5253,
        "COW MILK": 1260.5, "EGGS": 2562, "CHOCOLATE": 17196,
    }
    for name, expect in spot.items():
        got = by_name[name]["value_l_per_kg"]
        assert abs(got - expect) < 1.0, f"{name}: {got} != {expect}"
    print("gates passed")


if __name__ == "__main__":
    main()
