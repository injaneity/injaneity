import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { contrast, deriveTheme, piColors, themeCss, themePath } from './theme.mjs';

test('src/theme.css matches the palette derived from the terminal theme', async () => {
  assert.equal(await readFile(themePath, 'utf8'), themeCss(), 'run `npm run theme` to regenerate src/theme.css');
});

test('the vendored generator reproduces what pi 1.3.0 shows for novmbr', () => {
  // Captured from @earendil-works/pi-coding-agent 1.3.0's generateSystemThemeColors.
  const expected = {
    text: '#c7b8ac', muted: '#ad9c94', dim: '#8e7e76', accent: '#bf967d', selectedBg: '#1e3636', mdLink: '#70acab',
    syntaxKeyword: '#70acab', syntaxString: '#9aa95c', syntaxNumber: '#be967e', syntaxFunction: '#be9a53',
    syntaxType: '#bf967d', syntaxVariable: '#7eaaa3', syntaxComment: '#ad9c94', error: '#c6936d',
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
  for (const token of ['text', 'muted', 'md-heading', 'md-link', 'md-code', 'syntax-keyword', 'syntax-string', 'syntax-number', 'syntax-function', 'syntax-type', 'syntax-variable', 'syntax-comment']) {
    for (const surface of ['background', 'selected-bg']) assert.ok(contrast(t[token], t[surface]) >= 4.5, `${token} on ${surface}`);
  }
});
