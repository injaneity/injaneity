// Derives the site palette from a terminal theme the way pi does
// (https://earendil.com/posts/system-theme/): hue and chroma come from the
// theme's ANSI colours, lightness is solved from WCAG contrast rules against
// every surface a token can sit on, and chroma is capped by the sRGB gamut, a
// falloff toward black and white, and the source colour's own chroma.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Ghostty "novmbr"
export const terminal = {
  background: '#241d1a',
  foreground: '#c7b8ac',
  red: '#9f6434',
  green: '#9dac5f',
  yellow: '#cca75f',
  blue: '#2f7d7c',
  magenta: '#b5896e',
  cyan: '#52877f',
};

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function rgbToOklch(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, bb), Math.atan2(bb, a)];
}

function oklchToLinear([L, C, H]) {
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (lin) => lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
const oklchToHex = (lch) => rgbToHex(oklchToLinear(lch).map(fromLinear));

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function maxChroma(L, H) {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear([L, mid, H]))) lo = mid;
    else hi = mid;
  }
  return lo;
}

// Bell-shaped falloff: full chroma at mid lightness, fading toward black and white.
const falloff = (L) => 1 - Math.abs(2 * L - 1) ** 3;

function colourAt(source, L) {
  const [, C, H] = rgbToOklch(hexToRgb(source));
  return oklchToHex([L, Math.min(C, C * falloff(L) * 1.25, maxChroma(L, H)), H]);
}

// The lightest-to-darkest step that clears `ratio` against every surface,
// moving away from the background so a dark theme lifts and a light one sinks.
function solve(source, ratio, surfaces) {
  const lifting = luminance(terminal.background) < 0.18;
  let lo = lifting ? rgbToOklch(hexToRgb(terminal.background))[0] : 0;
  let hi = lifting ? 1 : rgbToOklch(hexToRgb(terminal.background))[0];
  const passes = (L) => surfaces.every((surface) => contrast(colourAt(source, L), surface) >= ratio);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (passes(mid) === lifting) hi = mid;
    else lo = mid;
  }
  return colourAt(source, lifting ? hi : lo);
}

// Each role is [source colour, minimum contrast, surfaces it must be read on].
// Surfaces are solved first, then foreground tokens against them.
export function deriveTheme() {
  const t = terminal;
  const paper = t.background;
  const panel = solve(t.foreground, 1.12, [paper]);
  const rule = solve(t.foreground, 1.45, [paper]);
  const selection = solve(t.foreground, 1.9, [paper]);
  const text = [paper, panel];
  const tokens = {
    paper,
    panel,
    rule,
    selection,
    ink: t.foreground,
    muted: solve(t.foreground, 4.5, text),
    'muted-soft': solve(t.foreground, 3, text),
    accent: solve(t.yellow, 4.5, text),
    'accent-hover': solve(t.yellow, 7, text),
    'link-accent': solve(t.blue, 3, [paper]),
    'link-accent-hover': solve(t.cyan, 4.5, text),
    error: solve(t.red, 4.5, text),
  };
  // Code sits on the page; every syntax colour gets the same weight so no
  // hue shouts over the others.
  const code = [paper];
  Object.assign(tokens, {
    'code-keyword': solve(t.red, 6, code),
    'code-string': solve(t.green, 6, code),
    'code-number': solve(t.magenta, 6, code),
    'code-function': solve(t.yellow, 6, code),
    'code-type': solve(t.cyan, 6, code),
    'code-symbol': solve(t.blue, 6, code),
  });
  return tokens;
}

export function themeCss(tokens = deriveTheme()) {
  const lines = Object.entries(tokens).map(([name, value]) => `  --${name}: ${value};`);
  return `/* Generated by scripts/theme.mjs from the Ghostty "novmbr" theme. Do not edit by hand. */
:root {
  color-scheme: ${luminance(tokens.paper) < 0.18 ? 'dark' : 'light'};
${lines.join('\n')}
  --link-wash: ${tokens['link-accent']}57;
}
`;
}

export const themePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/theme.css');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeFile(themePath, themeCss());
  console.log(`wrote ${path.relative(process.cwd(), themePath)}`);
}
