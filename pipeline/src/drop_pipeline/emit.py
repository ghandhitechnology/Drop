"""Stable JSON emission + manifest helpers shared by all extractors."""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

FACTORS_VERSION = "2026.08.1"
REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "packages" / "factors" / "data" / FACTORS_VERSION
DATASETS = REPO_ROOT / "water_logic" / "datasets"


def round_floats(obj, ndigits=6):
    if isinstance(obj, float):
        return round(obj, ndigits)
    if isinstance(obj, dict):
        return {k: round_floats(v, ndigits) for k, v in obj.items()}
    if isinstance(obj, list):
        return [round_floats(v, ndigits) for v in obj]
    return obj


def write_json(name: str, payload) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / name
    text = json.dumps(round_floats(payload), indent=1, sort_keys=True, ensure_ascii=False)
    path.write_text(text + "\n", encoding="utf-8")
    return path


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_commit() -> str | None:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT,
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except Exception:
        return None


def rebuild_manifest(generated_at: str) -> Path:
    files = []
    for p in sorted(DATA_DIR.glob("*")):
        if p.name == "manifest.json" or p.name.startswith("."):
            continue
        entry = {"path": p.name, "sha256": sha256(p), "bytes": p.stat().st_size}
        if p.suffix == ".json":
            data = json.loads(p.read_text(encoding="utf-8"))
            rows = None
            if isinstance(data, dict):
                rows = sum(len(v) for v in data.values() if isinstance(v, list)) or None
            elif isinstance(data, list):
                rows = len(data)
            if rows is not None:
                entry["rows"] = rows
        files.append(entry)
    manifest = {
        "version": FACTORS_VERSION,
        "generated_at": generated_at,
        "git_commit": git_commit(),
        "files": files,
    }
    path = DATA_DIR / "manifest.json"
    path.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    return path
