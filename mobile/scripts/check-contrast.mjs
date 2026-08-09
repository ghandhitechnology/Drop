/**
 * Verifies that Drop's readable ink tokens clear WCAG AA against their ground.
 *
 * The hand-drawn line is allowed to be expressive, but pass 1 of every mark —
 * the pass a person actually reads — is drawn in `ink`, so `ink` on `bg` and
 * `ink` on `paper` must hold 4.5:1 in both schemes.
 *
 * Run: node scripts/check-contrast.mjs
 */

const palettes = {
  default: {
    light: {
      bg: '#FFFFFF',
      paper: '#FAF9F6',
      ink: '#16150F',
      inkSoft: 'rgba(22,21,15,0.62)',
      accent: '#1E6FD9',
      accentSoft: '#DCE9FA',
      positive: '#2E7D5B',
    },
    dark: {
      bg: '#000000',
      paper: '#0C0C0E',
      ink: '#F4F1E8',
      inkSoft: 'rgba(244,241,232,0.66)',
      accent: '#7FB4FF',
      accentSoft: '#122236',
      positive: '#6FD3A4',
    },
  },
  saltyOcean1: {
    light: {
      bg: '#ADD8EA',
      paper: '#CBE7F2',
      ink: '#52372D',
      inkSoft: 'rgba(82,55,45,0.84)',
      accent: '#744D3C',
      accentSoft: '#96C9DD',
      positive: '#285F56',
    },
    dark: {
      bg: '#12334E',
      paper: '#1A425D',
      ink: '#E8C9AC',
      inkSoft: 'rgba(232,201,172,0.76)',
      accent: '#F2BC84',
      accentSoft: '#30546D',
      positive: '#8CC9AD',
    },
  },
  absolutely: {
    light: {
      bg: '#FAF9F5',
      paper: '#FFFFFF',
      ink: '#141413',
      inkSoft: '#3D3D3A',
      accent: '#9C452C',
      accentSoft: '#E8E6DC',
      positive: '#437426',
    },
    dark: {
      bg: '#30302E',
      paper: '#262624',
      ink: '#FAF9F5',
      inkSoft: '#C2C0B6',
      accent: '#E58C6B',
      accentSoft: '#48332B',
      positive: '#9AC693',
    },
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

for (const [theme, palette] of Object.entries(palettes)) {
  for (const scheme of ['light', 'dark']) {
    console.log(`\n${theme} · ${scheme}`);
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
}

console.log(
  failures === 0
    ? '\nAll contrast checks pass.'
    : `\n${failures} contrast check(s) below target.`,
);
process.exit(failures === 0 ? 0 : 1);
