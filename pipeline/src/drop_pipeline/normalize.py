"""Name normalization and form-marker parsing for SU-EATABLE joins.

The workbook's sheets disagree on names (SEABASS vs SEA-BASS, trailing *,
double spaces, case). Join keys are normalized here; anything still
unjoined must be resolved in config/sueatable_aliases.yaml or the build fails.
"""

from __future__ import annotations

import re

_WS = re.compile(r"\s+")
_PAREN_SUFFIX = re.compile(r"\s*\(([^)]*)\)\s*$")


def collapse(s: str) -> str:
    return _WS.sub(" ", (s or "").strip())


def norm_key(s: str) -> str:
    """Aggressive key for cross-sheet joins: upper, collapsed, no trailing
    asterisks, hyphens unified, trailing parenthetical stripped."""
    s = collapse(s).upper()
    s = _PAREN_SUFFIX.sub("", s)
    s = s.rstrip("*").strip()
    s = s.replace("-", " ")
    s = s.replace(",", " ")
    s = s.replace("&", " ")
    s = _WS.sub(" ", s).strip()
    return s


FORM_MARKERS = {
    "F": "frozen",
    "g": "greenhouse",
    "G": "heated_greenhouse",
    "I": "imported",
}


def parse_form_markers(raw: str) -> dict:
    """Extract INTRO-documented markers from a raw item name.

    * = item coincides with its typology; ** = value is a median of subgroups;
    (F)/(g)/(G)/(I) = frozen / greenhouse / heated greenhouse / imported.
    """
    name = collapse(raw)
    markers = {
        "single_item_typology": False,
        "median_of_subgroups": False,
        "frozen": False,
        "greenhouse": False,
        "heated_greenhouse": False,
        "imported": False,
    }
    m = _PAREN_SUFFIX.search(name)
    if m:
        inner = m.group(1).strip()
        # Only treat single-letter codes as markers; "(excluded citrus...)" is prose.
        if inner in FORM_MARKERS:
            markers[FORM_MARKERS[inner]] = True
            name = _PAREN_SUFFIX.sub("", name)
    if name.endswith("**"):
        markers["median_of_subgroups"] = True
        name = name[:-2].strip()
    elif name.endswith("*"):
        markers["single_item_typology"] = True
        name = name[:-1].strip()
    return {"clean_name": name, **markers}


def slug(s: str) -> str:
    """ID slug: keeps parenthetical descriptors ('BEAN (fresh)' != 'BEAN')."""
    s = collapse(s).upper().rstrip("*").lower()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s


SUGGESTED_VALUE_MAP = {
    "ok item": "ok_item",
    "better typology": "better_typology",
    "item matching typology": "item_matching_typology",
    "item or typology": "item_or_typology",
    "better sub-typology": "better_sub_typology",
    "better sub typology": "better_sub_typology",
}


def norm_suggested(s: str) -> str:
    key = collapse(s).lower()
    if key not in SUGGESTED_VALUE_MAP:
        raise ValueError(f"Unknown 'Suggested WF value': {s!r}")
    return SUGGESTED_VALUE_MAP[key]
