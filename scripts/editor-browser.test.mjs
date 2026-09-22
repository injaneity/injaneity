import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, expect } from '@playwright/test';

// Isolated browser and static server. Auth itself is covered by the workerd tests;
// this fixture must never be added to the application's server or auth handler.
let server, browser, origin;
const prefix = 'writing-desk:v1:';
const activeKey = 'writing-desk:active';
const fixture = '---\ncreated: 2026-09-15\ncustom: keep me\n---\n\n# A quiet page\n\nWrite **bold**, *italic*, and [a link](/writing/).\n\n- first\n- second\n\n```js\nconst value = 1;\n```\n\nThe last paragraph.';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.md': 'text/plain' };
before(async () => {
  const root = path.resolve('dist');
  server = createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const filename = path.resolve(root, '.' + pathname);
      if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
      const body = await readFile(filename);
      res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(chrome) ? chrome : undefined);
  browser = await chromium.launch({ executablePath, headless: true });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function setup(t, { source = fixture, mobile = false, query = '' } = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  t.after(() => context.close());
  await context.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: true, configured: true, login: 'injaneity', expiresAt: Date.now() + 3600000 } }));
  await context.addInitScript(({ source, prefix, activeKey }) => {
    if (!localStorage.getItem(prefix + 'fixture')) localStorage.setItem(prefix + 'fixture', JSON.stringify({ id: 'fixture', source, updated: '2026-09-23T00:00:00Z' }));
    if (!sessionStorage.getItem(activeKey)) sessionStorage.setItem(activeKey, 'fixture');
  }, { source, prefix, activeKey });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /plugin crashed|RangeError|TypeError/.test(message.text())) errors.push(message.text()); });
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(origin + '/editor/' + query);
  await expect(page.getByRole('textbox', { name: 'markdown', exact: true })).toBeVisible();
  return { page, context, input: page.getByRole('textbox', { name: 'markdown', exact: true }) };
}
async function stored(page) {
  return page.evaluate(({ prefix, activeKey }) => JSON.parse(localStorage.getItem(prefix + sessionStorage.getItem(activeKey))).source, { prefix, activeKey });
}
async function end(page, input) {
  await input.click();
  // Chrome on macOS uses Meta; use the platform-neutral CodeMirror document-end key.
  await page.keyboard.press('ControlOrMeta+End');
}

test('one live surface formats prose and preserves source, frontmatter, undo and reload', async t => {
  const { page, input } = await setup(t);
  await expect(page.locator('.live-h1')).toHaveText('A quiet page');
  await expect(page.locator('.live-strong')).toHaveText('bold');
  await expect(page.locator('.live-emphasis')).toHaveText('italic');
  await expect(page.locator('.live-link')).toHaveText('a link');
  await expect(page.locator('.live-bullet')).toHaveCount(2);
  await expect(page.locator('#contents')).not.toBeVisible();
  await expect(page.locator('#editor-error')).not.toBeVisible();
  assert.equal(await page.locator('.editor-shell button:visible').count(), 1);
  assert.equal(await stored(page), fixture);
  await page.locator('.live-h1').click();
  await expect(page.locator('.live-h1')).toHaveText('# A quiet page');
  await end(page, input);
  await expect(page.locator('.live-h1')).toHaveText('A quiet page');
  await page.keyboard.insertText(' Added.');
  await expect.poll(() => stored(page)).toBe(fixture + ' Added.');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => stored(page)).toBe(fixture);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => stored(page)).toBe(fixture + ' Added.');
  await page.reload();
  await expect(input).toContainText('Added.');
  assert.equal(await stored(page), fixture + ' Added.');
  await page.screenshot({ path: path.join(tmpdir(), 'portfolio-live-editor-desktop.png') });
});

test('new draft, list continuation, draft switching and separate undo histories', async t => {
  const { page, input } = await setup(t);
  await page.getByRole('button', { name: 'Editor actions' }).click();
  await page.getByRole('button', { name: 'new', exact: true }).click();
  await page.keyboard.insertText('# Fresh\n\n- first');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('second');
  await expect.poll(() => stored(page)).toBe('# Fresh\n\n- first\n- second');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('button', { name: 'A quiet page', exact: true }).click();
  await input.click();
  await page.keyboard.press('ControlOrMeta+z');
  assert.equal(await stored(page), fixture);
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('button', { name: 'Fresh', exact: true }).click();
  await expect(input).toContainText('second');
});

test('storage failure is visible, does not discard text, and download remains available', async t => {
  const { page, input } = await setup(t);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await end(page, input);
  await page.keyboard.insertText(' Keep this.');
  await expect(page.getByRole('alert')).toContainText('could not save');
  await page.getByRole('button', { name: 'Editor actions' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'download markdown' }).click();
  const download = await pending;
  assert.equal(await readFile(await download.path(), 'utf8'), fixture + ' Keep this.');
});

test('raw HTML stays inert, long documents scroll and mobile has one column', async t => {
  const source = '# A quiet page\n\n<script>window.editorPwned=true</script>\n\n<img src=x onerror="window.editorPwned=true">\n\n' + Array.from({ length: 50 }, (_, i) => `Paragraph ${i}. A little room to think, write, and change your mind.`).join('\n\n');
  const { page, input } = await setup(t, { source, mobile: true });
  assert.equal(await page.evaluate(() => window.editorPwned), undefined);
  assert.equal(await input.locator('script, img[onerror], img[src="x"]').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const bounds = await input.boundingBox();
  assert.ok(bounds.x >= 20 && bounds.x + bounds.width <= 370, 'mobile prose needs side margins');
  await page.locator('.cm-scroller').evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(input).toContainText('Paragraph 49.');
  assert.ok(await page.locator('.cm-scroller').evaluate(node => node.scrollTop > 500));
  await page.screenshot({ path: path.join(tmpdir(), 'portfolio-live-editor-mobile.png') });
});

test('loading a published page cannot overwrite typing while its index is pending', async t => {
  const { page, context, input } = await setup(t, { source: '' });
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  await context.route('**/editor/posts.json', async route => { await wait; await route.continue(); });
  await page.goto(origin + '/editor/?edit=00-landing');
  await expect(input).toBeVisible();
  await input.click();
  await page.keyboard.insertText('Do not replace this.');
  release();
  await expect(page.getByRole('alert')).toContainText('you started writing');
  await expect.poll(() => stored(page)).toBe('Do not replace this.');
});

test('drafts retain CRLF line endings and frontmatter, and conflicting saves fork safely', async t => {
  const source = fixture.replaceAll('\n', '\r\n');
  const { page, input } = await setup(t, { source });
  assert.equal(await stored(page), source);
  await page.evaluate(({ prefix, source }) => {
    localStorage.setItem(prefix + 'fixture', JSON.stringify({ id: 'fixture', source: source + ' Other tab.', updated: new Date().toISOString() }));
  }, { prefix, source });
  await end(page, input);
  await page.keyboard.insertText(' This tab.');
  await expect(page.getByRole('alert')).toContainText('separate copy');
  await expect.poll(() => stored(page)).toBe(source + ' This tab.');
  const original = await page.evaluate(prefix => JSON.parse(localStorage.getItem(prefix + 'fixture')).source, prefix);
  assert.equal(original, source + ' Other tab.');
});
