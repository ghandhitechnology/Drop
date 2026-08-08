/**
 * Verifies that Drop's readable ink tokens clear WCAG AA against their ground.
 *
 * The hand-drawn line is allowed to be expressive, but pass 1 of every mark —
 * the pass a person actually reads — is drawn in `ink`, so `ink` on `bg` and
 * `ink` on `paper` must hold 4.5:1 in both schemes.
 *
 * Run: node scripts/check-contrast.mjs
 */

const palette = {
  light: {
    bg: '#FFFFFF',
    paper: '#FAF9F6',
    ink: '#16150F',
    inkSoft: 'rgba(22,21,15,0.62)',
    inkFaint: 'rgba(22,21,15,0.18)',
    accent: '#1E6FD9',
    accentSoft: '#DCE9FA',
    positive: '#2E7D5B',
  },
  dark: {
    bg: '#000000',
    paper: '#0C0C0E',
    ink: '#F4F1E8',
    inkSoft: 'rgba(244,241,232,0.66)',
    inkFaint: 'rgba(244,241,232,0.20)',
    accent: '#7FB4FF',
    accentSoft: '#122236',
    positive: '#6FD3A4',
  },
};

function parse(color) {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(color);
  if (rgba) {
    const [r, g, b, a = '1'] = rgba[1].split(',').map((p) => p.trim());
    return { r: +r, g: +g, b: +b, a: +a };
  }
  throw new Error(`Unsupported colour: ${color}`);
}

/** Composite a possibly translucent foreground over an opaque background. */
function flatten(fg, bg) {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fgColor, bgColor) {
  const bg = parse(bgColor);
  const fg = flatten(parse(fgColor), bg);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground, background, minimum ratio] */
const CHECKS = [
  ['ink', 'bg', 4.5],
  ['ink', 'paper', 4.5],
  ['inkSoft', 'bg', 4.5],
  ['inkSoft', 'paper', 4.5],
  ['accent', 'bg', 4.5],
  ['positive', 'bg', 4.5],
  // Large-text / non-text minimum for the accent chip wash.
  ['accent', 'accentSoft', 3],
];

let failures = 0;

for (const scheme of ['light', 'dark']) {
  console.log(`\n${scheme}`);
  for (const [fg, bg, min] of CHECKS) {
    const ratio = contrast(palette[scheme][fg], palette[scheme][bg]);
    const ok = ratio >= min;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${fg} on ${bg}`.padEnd(34) +
        `${ratio.toFixed(2)}:1 (min ${min})`,
    );
  }
}

console.log(
  failures === 0
    ? '\nAll contrast checks pass.'
    : `\n${failures} contrast check(s) below target.`,
);
process.exit(failures === 0 ? 0 : 1);
