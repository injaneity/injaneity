import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { contrast, deriveTheme, piColors, themeCss, themePath } from './theme.mjs';

test('src/theme.css matches the palette derived from the terminal theme', async () => {
  assert.equal(await readFile(themePath, 'utf8'), themeCss(), 'run `npm run theme` to regenerate src/theme.css');
});

test('the vendored generator reproduces what pi 1.3.0 shows on a novmbr background', () => {
  // Captured from @earendil-works/pi-coding-agent 1.3.0's generateSystemThemeColors({ background }).
  const expected = {
    toolSuccessBg: '#21372a', toolPendingBg: '#2f3234', muted: '#99a1a6', dim: '#7a8489', accent: '#a494d6',
    mdHeading: '#ca961d', mdLink: '#63aacd', syntaxKeyword: '#63aacd', syntaxString: '#dd8851', syntaxNumber: '#61b488',
    syntaxFunction: '#ca961d', syntaxType: '#a494d6', syntaxVariable: '#55b0b7', error: '#eb777a',
  };
  const pi = piColors();
  for (const [token, value] of Object.entries(expected)) assert.equal(pi[token], value, token);
});

test('every colour the CSS uses is one of pi\'s tokens', async () => {
  const tokens = deriveTheme();
  for (const file of ['src/index.css', 'src/editor/editor.css']) {
    const css = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.deepEqual(css.match(/#[\da-f]{3,8}\b|rgba?\(/gi) ?? [], [], `${file}: hard-coded colour`);
    for (const [, name] of css.matchAll(/var\(--([\w-]+)\)/g)) assert.ok(name === 'code-font' || name in tokens, `${file}: --${name} is not a pi token`);
  }
});

test('body text stays readable on the page and the selection', () => {
  const t = deriveTheme();
  for (const token of ['foreground', 'muted', 'md-heading', 'md-link', 'md-code', 'syntax-keyword', 'syntax-string', 'syntax-number', 'syntax-function', 'syntax-type', 'syntax-variable', 'syntax-comment']) {
    for (const surface of ['background', 'selected-bg']) assert.ok(contrast(t[token], t[surface]) >= 4.5, `${token} on ${surface}`);
  }
});
