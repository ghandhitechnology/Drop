#!/usr/bin/env python
"""Draw an EAN-13 poster for the Android emulator's virtual scene.

The virtual scene the emulator ships is a living room with no retail packaging
anywhere in it, so the camera can never see a code and the barcode leg of the
capture path can only ever be checked by calling the service directly. That is
a gap in the check, not in the product: the part that goes untested is the one
piece only a real frame exercises — the scanner reading a symbology, the hint
settling on the viewfinder, and the shutter carrying that hint into the run.

The emulator can hang an arbitrary image on the scene's wall and lay another on
its table, which is enough to put a scannable code in front of the lens. This
writes that image: a plain EAN-13, encoded from first principles so the digits
on screen are provably the digits the scanner reads back.

  python3 mobile/scripts/barcode-poster.py 8000500310427 /tmp/wall.png

  ~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_36.1 \
    -no-window -no-audio \
    -virtualscene-poster wall=/tmp/wall.png \
    -virtualscene-poster table=/tmp/wall.png

The scene starts facing a television, so the posters begin out of shot. The
emulator's own macro walks the camera round to them:

  adb emu automation play \
    ~/Library/Android/sdk/emulator/resources/macros/Walk_to_image_room

8000500310427 is a good default: Open Food Facts resolves it, the backend maps
it onto a catalogue entry, and the packet publishes a net weight, so the run
lands on a real number rather than a coverage miss.

No third-party imaging library — the PNG is written straight out, because a
verification asset that needs its own install is one more thing to go stale.
"""

from __future__ import annotations

import struct
import sys
import zlib

# Odd parity, the left half's default alphabet.
L = [
    '0001101', '0011001', '0010011', '0111101', '0100011',
    '0110001', '0101111', '0111011', '0110111', '0001011',
]
# The right half, which is always L inverted.
R = [''.join('1' if bit == '0' else '0' for bit in code) for code in L]
# Even parity — the right-hand code read backwards.
G = [code[::-1] for code in R]

# The first digit is never drawn as bars. It is carried by which of the six
# left-hand digits are written in even parity instead of odd.
PARITY = [
    'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
    'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
]

QUIET = 9  # modules of white either side, the GS1 minimum for EAN-13


def check_digit(body: str) -> int:
    """GS1 mod-10 over the twelve digits before the check."""
    total = 0
    weight = 3
    for char in reversed(body):
        total += int(char) * weight
        weight = 1 if weight == 3 else 3
    return (10 - total % 10) % 10


def modules(code: str) -> str:
    """The 95-module bar pattern for a 13-digit code."""
    if len(code) != 13 or not code.isdigit():
        raise SystemExit(f'{code!r} is not 13 digits')
    if int(code[12]) != check_digit(code[:12]):
        raise SystemExit(f'{code} fails its check digit (expected {check_digit(code[:12])})')

    digits = [int(char) for char in code]
    parity = PARITY[digits[0]]

    bars = '101'  # start guard
    for index in range(1, 7):
        bars += (L if parity[index - 1] == 'L' else G)[digits[index]]
    bars += '01010'  # centre guard
    for index in range(7, 13):
        bars += R[digits[index]]
    bars += '101'  # end guard
    return bars


def write_png(path: str, size: int, rows: list[bytearray]) -> None:
    """An 8-bit greyscale PNG, one IDAT, no filtering."""
    raw = b''.join(b'\x00' + bytes(row) for row in rows)

    def chunk(kind: bytes, payload: bytes) -> bytes:
        body = kind + payload
        return struct.pack('>I', len(payload)) + body + struct.pack('>I', zlib.crc32(body))

    with open(path, 'wb') as out:
        out.write(b'\x89PNG\r\n\x1a\n')
        out.write(chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 0, 0, 0, 0)))
        out.write(chunk(b'IDAT', zlib.compress(raw, 9)))
        out.write(chunk(b'IEND', b''))


def render(code: str, path: str, size: int = 1024) -> None:
    """Centre the code on a square white field.

    The scene's wall poster is two metres of 1024px, so a module lands around
    nine pixels — wide enough to survive the camera's own resampling from
    across the room, with the quiet zone the scanner needs to find an edge.
    """
    bars = modules(code)
    module_px = size // (len(bars) + 2 * QUIET)
    left = (size - len(bars) * module_px) // 2
    top, bottom = int(size * 0.22), int(size * 0.78)

    rows: list[bytearray] = []
    for y in range(size):
        row = bytearray([255]) * size
        if top <= y < bottom:
            for index, bit in enumerate(bars):
                if bit == '1':
                    row[left + index * module_px : left + (index + 1) * module_px] = (
                        bytearray([0]) * module_px
                    )
        rows.append(row)

    write_png(path, size, rows)
    print(f'{code} -> {path} ({size}x{size}, {module_px}px per module)')


if __name__ == '__main__':
    ean = sys.argv[1] if len(sys.argv) > 1 else '8000500310427'
    out_path = sys.argv[2] if len(sys.argv) > 2 else 'barcode-poster.png'
    render(ean, out_path)
