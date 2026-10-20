import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { contrast, deriveTheme, themeCss, themePath } from './theme.mjs';

test('src/theme.css matches the palette derived from the terminal theme', async () => {
  assert.equal(await readFile(themePath, 'utf8'), themeCss(), 'run `npm run theme` to regenerate src/theme.css');
});

test('every foreground token clears its contrast rule on the surfaces it sits on', () => {
  const t = deriveTheme();
  const rules = [
    [['ink'], 7, ['paper', 'panel']],
    [['ink'], 4.5, ['selection']],
    [['muted', 'accent', 'link-accent-hover', 'error'], 4.5, ['paper', 'panel']],
    [['muted-soft'], 3, ['paper', 'panel']],
    [['link-accent'], 3, ['paper']],
    [['code-keyword', 'code-string', 'code-number', 'code-function', 'code-type', 'code-symbol'], 6, ['paper']],
  ];
  for (const [tokens, ratio, surfaces] of rules) {
    for (const token of tokens) {
      for (const surface of surfaces) assert.ok(contrast(t[token], t[surface]) >= ratio, `${token} on ${surface}: ${contrast(t[token], t[surface]).toFixed(2)}`);
    }
  }
});
