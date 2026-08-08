/**
 * Normalises the pose slices the avatar actually uses.
 *
 * The sheet was sliced on a grid, so two things need fixing before the poses
 * can be crossfaded against each other:
 *
 *  1. A few slices caught a fragment of the neighbouring cell at the very left
 *     or right edge. Those fragments are erased.
 *  2. Every slice is cropped tight to its own art, so each pose has a different
 *     canvas. Fitting a tight canvas into a box makes a sleeping hippo render
 *     as tall as a standing one, and moves the ground line between poses.
 *
 * Both are fixed by re-laying every used pose onto one shared canvas, centred
 * horizontally on its own ink and standing on a common ground line. After this
 * the drawing code needs no per-pose knowledge at all: fit the canvas, bottom
 * align, done.
 *
 * Run from the repo's mobile directory:
 *   node assets/character/tools/normalize.mjs
 *
 * It reads the pristine slices from ../../../../assets/character and writes the
 * normalised set next to this folder, so it is safe to re-run.
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..');
const SRC_DIR = join(HERE, '..', '..', '..', '..', 'assets', 'character');

/** The poses DropCharacter draws. Everything else is left untouched. */
const USED = [
  'pose_01',
  'pose_08',
  'pose_14',
  'pose_23',
  'pose_24',
  'pose_25',
  'pose_26',
  'pose_31',
  'pose_32',
];

/** Transparent margin kept around the shared canvas, in source pixels. */
const MARGIN = 4;
/** A fragment this small, touching a side edge and cut off from the art, is bleed. */
const FRAGMENT_AREA = 320;
/** Clear horizontal gap between the fragment and the real art, in pixels. */
const FRAGMENT_GAP = 4;

/* ------------------------------------------------------------------ codec */

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decode(file) {
  const buf = readFileSync(file);
  const chunks = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    chunks.push({
      type: buf.toString('ascii', off + 4, off + 8),
      data: buf.subarray(off + 8, off + 8 + len),
    });
    off += 12 + len;
  }

  const ihdr = chunks.find((c) => c.type === 'IHDR').data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  if (ihdr[8] !== 8 || ihdr[9] !== 6 || ihdr[12] !== 0) {
    throw new Error(`${file}: expected 8-bit RGBA, non-interlaced`);
  }

  const raw = inflateSync(
    Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)),
  );
  const stride = width * 4;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    for (let x = 0; x < stride; x += 1) {
      const byte = raw[pos + x];
      const a = x >= 4 ? out[y * stride + x - 4] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? out[(y - 1) * stride + x - 4] : 0;
      const value =
        filter === 0 ? byte
        : filter === 1 ? byte + a
        : filter === 2 ? byte + b
        : filter === 3 ? byte + ((a + b) >> 1)
        : byte + paeth(a, b, c);
      out[y * stride + x] = value & 0xff;
    }
    pos += stride;
  }
  return { width, height, data: out };
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encode({ width, height, data }, file) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

/* ------------------------------------------------------------------ clean */

function components({ width, height, data }) {
  const labels = new Int32Array(width * height).fill(-1);
  const alphaAt = (x, y) => data[(y * width + x) * 4 + 3];
  const found = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(x, y) < 8 || labels[y * width + x] >= 0) continue;
      const id = found.length;
      const stack = [[x, y]];
      labels[y * width + x] = id;
      const box = { id, area: 0, minX: x, maxX: x, minY: y, maxY: y };
      while (stack.length) {
        const [cx, cy] = stack.pop();
        box.area += 1;
        box.minX = Math.min(box.minX, cx);
        box.maxX = Math.max(box.maxX, cx);
        box.minY = Math.min(box.minY, cy);
        box.maxY = Math.max(box.maxY, cy);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (labels[ny * width + nx] >= 0 || alphaAt(nx, ny) < 8) continue;
            labels[ny * width + nx] = id;
            stack.push([nx, ny]);
          }
        }
      }
      found.push(box);
    }
  }
  return { labels, found };
}

/**
 * Erases fragments of the neighbouring grid cell.
 *
 * A fragment qualifies only when all three hold: it is small, it touches the
 * left or right edge of the slice, and there is clear space between it and the
 * pose's own art. Sparkles, motion arcs and sleep marks are detached too, but
 * they sit inside the art's horizontal span, so they are kept.
 */
function removeBleed(image, name) {
  const { labels, found } = components(image);
  const main = found.reduce((a, b) => (a.area >= b.area ? a : b));
  const removed = [];

  for (const comp of found) {
    if (comp.id === main.id) continue;
    if (comp.area > FRAGMENT_AREA) continue;
    const touchesEdge = comp.minX === 0 || comp.maxX === image.width - 1;
    if (!touchesEdge) continue;
    const gap =
      comp.maxX < main.minX
        ? main.minX - comp.maxX
        : comp.minX > main.maxX
          ? comp.minX - main.maxX
          : 0;
    if (gap < FRAGMENT_GAP) continue;
    removed.push(comp);
  }

  if (removed.length === 0) return 0;
  const drop = new Set(removed.map((c) => c.id));
  for (let i = 0; i < labels.length; i += 1) {
    if (drop.has(labels[i])) {
      image.data.fill(0, i * 4, i * 4 + 4);
    }
  }
  console.log(
    `  ${name}: erased ${removed.length} edge fragment(s) — ` +
      removed.map((c) => `x[${c.minX},${c.maxX}] ${c.area}px`).join(', '),
  );
  return removed.length;
}

function contentBox({ width, height, data }) {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/* ------------------------------------------------------------------- main */

const loaded = USED.map((name) => {
  const image = decode(join(SRC_DIR, `${name}.png`));
  removeBleed(image, name);
  return { name, image, box: contentBox(image) };
});

const canvasW =
  Math.max(...loaded.map((p) => p.box.width)) + MARGIN * 2;
const canvasH =
  Math.max(...loaded.map((p) => p.box.height)) + MARGIN * 2;

console.log(`\nshared canvas ${canvasW}×${canvasH}`);

for (const { name, image, box } of loaded) {
  const out = {
    width: canvasW,
    height: canvasH,
    data: Buffer.alloc(canvasW * canvasH * 4),
  };
  // Centred on its own ink, standing on a common ground line.
  const dx = Math.round((canvasW - box.width) / 2) - box.minX;
  const dy = canvasH - MARGIN - 1 - box.maxY;

  for (let y = box.minY; y <= box.maxY; y += 1) {
    const srcStart = (y * image.width + box.minX) * 4;
    const srcEnd = srcStart + box.width * 4;
    const destStart = ((y + dy) * canvasW + box.minX + dx) * 4;
    image.data.copy(out.data, destStart, srcStart, srcEnd);
  }

  encode(out, join(OUT_DIR, `${name}.png`));
  console.log(
    `  ${name}: content ${box.width}×${box.height} → placed at ` +
      `x ${box.minX + dx}, y ${box.minY + dy}`,
  );
}
