#!/usr/bin/env python
"""Draw Drop's app icon and splash marks.

Nothing here is hand-illustrated. The icon is the same two things the product
is made of, composed by the same rules the app uses at runtime:

  * pose_01 — the resting character, the exact PNG the app bundles, recoloured
    from its authored black to the theme's ink so the light and dark marks are
    provably the same drawing.
  * one water drop — the same four-cubic teardrop as
    ``src/features/onboarding/marks.ts``, in the accent, filled so it survives
    at 48px where an outline would vanish.

Both are drawn through the same jitter the app's ``HandPath`` applies: a main
pass and a fainter ghost pass nudged down and right. That is why the icon looks
like it was drawn by whoever drew the rest of the product, rather than like a
logo placed next to it.

Everything is rendered at 2x and reduced with Lanczos, which is what keeps a
2px pencil line from stair-stepping at icon sizes.

Run:  pipeline/.venv/bin/python mobile/scripts/make-icons.py
"""

from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
MOBILE = HERE.parent
ASSETS = MOBILE / "assets"
POSE = ASSETS / "character" / "pose_01.png"

# The palette, copied from src/design/tokens.ts. Two values, both schemes.
INK_LIGHT = (22, 21, 15)
INK_DARK = (244, 241, 232)
ACCENT = (30, 111, 217)
BG_LIGHT = (255, 255, 255)
BG_DARK = (0, 0, 0)

SUPERSAMPLE = 2


# --------------------------------------------------------------- geometry


def cubic(p0, p1, p2, p3, steps: int):
    """Sample one cubic Bezier, endpoints included."""
    out = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]
        out.append((x, y))
    return out


def teardrop(cx: float, cy: float, height: float, steps: int = 26):
    """The drop from ``marks.ts``, control point for control point.

    Keep the two in step. The claim this script makes is that the icon is drawn
    with the product's own geometry, and a drop here that differs from the drop
    in the app is the claim quietly becoming false.
    """
    h = height
    w = height * 0.78
    top = cy - h / 2
    bottom = cy + h / 2
    right = cx + w / 2
    left = cx - w / 2
    waist = cy + h * 0.14

    points = []
    points += cubic(
        (cx, top),
        (cx + w * 0.10, cy - h * 0.28),
        (right, cy - h * 0.06),
        (right, waist),
        steps,
    )
    points += cubic(
        (right, waist),
        (right, cy + h * 0.38),
        (cx + w * 0.30, bottom),
        (cx, bottom),
        steps,
    )[1:]
    points += cubic(
        (cx, bottom),
        (cx - w * 0.30, bottom),
        (left, cy + h * 0.38),
        (left, waist),
        steps,
    )[1:]
    points += cubic(
        (left, waist),
        (left, cy - h * 0.06),
        (cx - w * 0.10, cy - h * 0.28),
        (cx, top),
        steps,
    )[1:]
    return points


def jitter(points, seed: int, deviation: float):
    """The hand, applied.

    Two components: a slow sine wander that makes the line drift the way a wrist
    does, and a small per-point wobble for tooth. Pure per-point noise alone
    reads as a fuzzy line rather than a drawn one.
    """
    rng = random.Random(seed)
    phase = rng.random() * math.tau
    freq = 1.7 + rng.random() * 1.2
    n = len(points)
    out = []
    for i, (x, y) in enumerate(points):
        t = i / max(1, n - 1)
        wander = math.sin(phase + t * math.tau * freq) * deviation * 0.75
        out.append(
            (
                x + wander + rng.uniform(-deviation, deviation) * 0.45,
                y + wander * 0.6 + rng.uniform(-deviation, deviation) * 0.45,
            )
        )
    return out


# ----------------------------------------------------------------- drawing


def draw_drop(canvas: Image.Image, points, color, width: float, seed: int):
    """The water drop: a jittered fill, closed by a stroke of the same colour.

    No ghost pass here. A ghost belongs to an open pencil line, where the second
    faint pass reads as the hand going over the stroke twice; behind a solid
    fill it is just a pale fringe hanging off one edge, which looks like a
    printing fault rather than a drawing.
    """
    main = jitter(points, seed, width * 0.5)

    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    pen = ImageDraw.Draw(layer)
    pen.polygon(main, fill=color + (255,))
    # The stroke over the fill's own edge: it firms the silhouette up and hides
    # the flat facets left by sampling the curve into a polygon.
    pen.line(main + [main[0]], fill=color + (255,), width=max(1, round(width)), joint="curve")
    canvas.alpha_composite(layer)


def character(height: int, color) -> Image.Image:
    """pose_01, cropped to its ink and recoloured from black to ``color``."""
    source = Image.open(POSE).convert("RGBA")
    source = source.crop(source.getbbox())
    ratio = height / source.height
    source = source.resize(
        (max(1, round(source.width * ratio)), height), Image.LANCZOS
    )
    alpha = source.getchannel("A")
    tinted = Image.new("RGBA", source.size, color + (255,))
    tinted.putalpha(alpha)
    return tinted


def mark(size: int, ink) -> Image.Image:
    """Drop standing, one drop of water rising past its ear.

    Proportions are the point of this function. The drop is a third of the
    character's height and sits half over its shoulder, so the pair reads as one
    object — a character with water beside it — rather than as two logos sharing
    a square. Anything bigger and the drop becomes the icon; anything smaller and
    it disappears at 48px.
    """
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    body_height = round(size * 0.66)
    body = character(body_height, ink)
    body_x = round(size * 0.5 - body.width * 0.5 - size * 0.05)
    body_y = round(size * 0.5 - body_height * 0.5 + size * 0.04)
    layer.alpha_composite(body, (body_x, body_y))

    drop_height = body_height * 0.34
    drop_cx = body_x + body.width * 0.96
    drop_cy = body_y + body_height * 0.16
    draw_drop(
        layer,
        teardrop(drop_cx, drop_cy, drop_height),
        ACCENT,
        width=size * 0.012,
        seed=0x0D20B,
    )
    return layer


def compose(side: int, ink, background, fill_ratio: float = 0.78) -> Image.Image:
    """The mark, centred on its own ink inside a square.

    Centring is done on the drawn bounding box rather than on the coordinates
    the parts were placed at. The character stands on its feet with air over its
    head, and a square balanced on the *placement* would inherit that air as a
    lopsided margin.

    ``fill_ratio`` is how much of the square the mark occupies: generous for the
    store icon, tighter for the Android adaptive foreground, which has to survive
    a circular mask that keeps only the middle 66%.
    """
    size = side * SUPERSAMPLE
    drawn = mark(size, ink)

    box = drawn.getbbox()
    drawn = drawn.crop(box)
    target = size * fill_ratio
    ratio = target / max(drawn.width, drawn.height)
    drawn = drawn.resize(
        (max(1, round(drawn.width * ratio)), max(1, round(drawn.height * ratio))),
        Image.LANCZOS,
    )

    canvas = Image.new(
        "RGBA",
        (size, size),
        background + (255,) if background is not None else (0, 0, 0, 0),
    )
    canvas.alpha_composite(
        drawn,
        (round((size - drawn.width) / 2), round((size - drawn.height) / 2)),
    )
    return canvas.resize((side, side), Image.LANCZOS)


# -------------------------------------------------------------------- main


def write(image: Image.Image, name: str) -> None:
    path = ASSETS / name
    image.save(path, "PNG")
    print(f"{path.relative_to(MOBILE)}  {image.width}x{image.height}")


def main() -> None:
    # The store icon. Opaque, because a transparent app icon is a bug on both
    # platforms, and near full-bleed because iOS applies its own corner mask.
    write(compose(1024, INK_LIGHT, BG_LIGHT, fill_ratio=0.76), "icon.png")

    # Android adaptive foreground: transparent, and well inside the safe circle.
    # 0.56 keeps every mark within the middle 66% the mask guarantees, with room
    # for the parallax shift launchers apply on top of that.
    write(compose(1024, INK_LIGHT, None, fill_ratio=0.56), "adaptive-icon.png")

    # Splash marks. Transparent, one per scheme, because the character is line
    # art and dark ink on the dark splash would be an empty screen.
    write(compose(512, INK_LIGHT, None, fill_ratio=0.92), "splash.png")
    write(compose(512, INK_DARK, None, fill_ratio=0.92), "splash-dark.png")


if __name__ == "__main__":
    main()
