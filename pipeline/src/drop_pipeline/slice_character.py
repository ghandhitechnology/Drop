"""Slice Basic_character_assets.png (4x8 grid of numbered hippo poses) into
individual, transparent, pure-black-line-art PNGs plus a manifest.

Usage:
    pipeline/.venv/bin/python -m drop_pipeline.slice_character
"""

from __future__ import annotations

import json

from PIL import Image, ImageChops, ImageDraw

REPO_ROOT = __import__("pathlib").Path(__file__).resolve().parents[3]
SOURCE = REPO_ROOT / "Basic_character_assets.png"
OUT_DIR = REPO_ROOT / "assets" / "character"

ROWS = 4
COLS = 8
NUM_POSES = ROWS * COLS

# Small buffer (px) removed above the detected number label, to absorb any
# anti-aliased edge pixels of the digit glyphs.
LABEL_CUT_BUFFER = 2

# The pose-number glyphs are rendered at a fixed font size, so the label's
# ink segment is always ~19-20px tall regardless of pose (measured across
# all 32 cells). This range (with margin) distinguishes the label from
# decorative marks (e.g. a neighboring row's sparkles/motion-lines) that
# bleed a few px across the grid boundary into a cell's bottom margin.
LABEL_HEIGHT_RANGE = (17, 22)
# The label always sits in the bottom half of the cell.
LABEL_MIN_Y_FRACTION = 0.5

# Alpha thresholds on min(R, G, B) of the near-white background.
WHITE_ALPHA0 = 235  # >= this -> fully transparent
WHITE_ALPHA1 = 200  # <= this -> fully opaque (anti-aliased edge starts here)

TRIM_PADDING = 6

POSE_TAGS = {
    1: "idle_front",
    2: "back",
    3: "side_right",
    4: "side_left",
    5: "hands_hip",
    6: "shy",
    7: "wave",
    8: "point_right",
    9: "walk",
    10: "walk_worried",
    11: "run",
    12: "run_fast",
    13: "jump",
    14: "cheer_arms_up",
    15: "excited_sparkle",
    16: "sing_dance",
    17: "hunched_back",
    18: "sneak_shh",
    19: "stretch_arms_up",
    20: "sit_front",
    21: "sit_sad",
    22: "lying_belly",
    23: "sleeping",
    24: "celebrate_wave",
    25: "thinking_chin",
    26: "surprised_gasp",
    27: "laughing",
    28: "crying",
    29: "angry",
    30: "embarrassed_squeeze",
    31: "dizzy",
    32: "cheer_sparkle",
}


def cell_bounds(row: int, col: int, width: int, height: int) -> tuple[int, int, int, int]:
    cell_w = width / COLS
    cell_h = height / ROWS
    left = round(col * cell_w)
    right = round((col + 1) * cell_w)
    top = round(row * cell_h)
    bottom = round((row + 1) * cell_h)
    return left, top, right, bottom


def save_debug_grid(img: Image.Image) -> None:
    debug = img.convert("RGB").copy()
    draw = ImageDraw.Draw(debug)
    width, height = img.size
    for col in range(COLS + 1):
        x = round(col * width / COLS)
        draw.line([(x, 0), (x, height)], fill=(255, 0, 0), width=2)
    for row in range(ROWS + 1):
        y = round(row * height / ROWS)
        draw.line([(0, y), (width, y)], fill=(255, 0, 0), width=2)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    debug.save(OUT_DIR / "debug_grid.png")


def _row_has_ink(px, w: int, y: int) -> bool:
    return any(px[x, y] < WHITE_ALPHA0 for x in range(w))


def _ink_segments(px, w: int, h: int) -> list[tuple[int, int]]:
    """Return (start, end_inclusive) row ranges of vertically-contiguous ink."""
    segments = []
    cur = None
    start = 0
    for y in range(h):
        ink = _row_has_ink(px, w, y)
        if cur is None:
            cur, start = ink, y
        elif ink != cur:
            if cur:
                segments.append((start, y - 1))
            cur, start = ink, y
    if cur:
        segments.append((start, h - 1))
    return segments


def strip_label(cell: Image.Image) -> Image.Image:
    """Remove the pose-number label from the bottom of the cell.

    The label is a fixed-size digit glyph (~19-20px tall) sitting in the
    bottom half of the cell, found among the cell's vertically-contiguous
    ink segments by matching that height. A naive "take the last ink
    segment" approach breaks on ~5 of the 32 cells: neighboring poses in the
    row below (e.g. dizzy stars, motion marks) bleed a few px across the
    grid boundary, creating a spurious segment *below* the real label.
    """
    gray = cell.convert("L")
    w, h = gray.size
    px = gray.load()

    segments = _ink_segments(px, w, h)
    min_lo, max_hi = LABEL_HEIGHT_RANGE
    candidates = [
        (start, end)
        for start, end in segments
        if start >= h * LABEL_MIN_Y_FRACTION and min_lo <= (end - start + 1) <= max_hi
    ]
    if not candidates:
        return cell  # no confident label match; leave cell untouched

    label_top = min(start for start, _ in candidates)
    cut = max(0, label_top - LABEL_CUT_BUFFER)
    return cell.crop((0, 0, w, cut))


def _alpha_lut() -> list[int]:
    """Map a min(R,G,B) value (0-255) to an alpha value (0-255):
    0 where >= WHITE_ALPHA0 (background), 255 where <= WHITE_ALPHA1 (solid
    ink), linear ramp between (anti-aliased edges)."""
    lut = []
    span = WHITE_ALPHA0 - WHITE_ALPHA1
    for p in range(256):
        a = (WHITE_ALPHA0 - p) / span
        a = min(1.0, max(0.0, a))
        lut.append(round(a * 255))
    return lut


_ALPHA_LUT = _alpha_lut()


def to_transparent_black(cell: Image.Image) -> Image.Image:
    """Convert near-white background to transparent alpha, and recolor all
    remaining (line-art) pixels to pure black, preserving the computed alpha
    as anti-aliased edge softness."""
    r, g, b = cell.convert("RGB").split()
    min_channel = ImageChops.darker(ImageChops.darker(r, g), b)
    alpha = min_channel.point(_ALPHA_LUT)

    black_rgb = Image.new("RGB", cell.size, (0, 0, 0))
    r0, g0, b0 = black_rgb.split()
    return Image.merge("RGBA", (r0, g0, b0, alpha))


def auto_trim(img: Image.Image, padding: int = TRIM_PADDING) -> Image.Image:
    alpha = img.split()[3]
    bbox = alpha.getbbox()
    if bbox is None:
        return img

    w, h = img.size
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - padding)
    y0 = max(0, y0 - padding)
    x1 = min(w, x1 + padding)
    y1 = min(h, y1 + padding)
    return img.crop((x0, y0, x1, y1))


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.open(SOURCE)
    width, height = img.size
    print(f"source: {SOURCE.name} {width}x{height}")

    save_debug_grid(img)
    print(f"wrote debug grid -> {OUT_DIR / 'debug_grid.png'}")

    cell_w = width / COLS
    cell_h = height / ROWS
    print(f"detected cell size: {cell_w:.2f} x {cell_h:.2f} ({COLS}x{ROWS} grid)")

    manifest = []
    pose = 0
    for row in range(ROWS):
        for col in range(COLS):
            pose += 1
            left, top, right, bottom = cell_bounds(row, col, width, height)
            cell = img.crop((left, top, right, bottom))
            cell = strip_label(cell)
            cell = to_transparent_black(cell)
            cell = auto_trim(cell)

            filename = f"pose_{pose:02d}.png"
            out_path = OUT_DIR / filename
            cell.save(out_path)

            manifest.append(
                {
                    "file": filename,
                    "width": cell.width,
                    "height": cell.height,
                    "tag": POSE_TAGS[pose],
                }
            )
            print(f"  pose {pose:02d} ({POSE_TAGS[pose]}): {cell.width}x{cell.height} -> {filename}")

    manifest_path = OUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote manifest -> {manifest_path} ({len(manifest)} poses)")


if __name__ == "__main__":
    main()
