import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, expect } from '@playwright/test';

let server, browser, origin;
const prefix = 'writing-desk:v1:';
const activeKey = 'writing-desk:active';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.md': 'text/plain' };
before(async () => {
  const root = path.resolve('dist');
  server = createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const filename = path.resolve(root, '.' + pathname);
      if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
      res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' });
      res.end(await readFile(filename));
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(chrome) ? chrome : undefined), headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function setup(t, { source, mobile = false, owner = true, pathname = '/' } = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  t.after(() => context.close());
  let authenticated = owner;
  await context.route('**/api/auth/session', route => route.fulfill({ json: { authenticated, configured: true, login: 'injaneity', expiresAt: Date.now() + 3600000 } }));
  if (source !== undefined) await context.addInitScript(({ source, prefix, activeKey }) => {
    if (!localStorage.getItem(prefix + 'fixture')) localStorage.setItem(prefix + 'fixture', JSON.stringify({ id: 'fixture', source, updated: '2026-09-28T00:00:00Z', page: '00-landing' }));
    if (!sessionStorage.getItem(activeKey)) sessionStorage.setItem(activeKey, 'fixture');
  }, { source, prefix, activeKey });
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /plugin crashed|RangeError|TypeError/.test(message.text())) errors.push(message.text()); });
  page.on('request', request => requests.push(request.url()));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(origin + pathname);
  if (owner) await expect(page.getByRole('link', { name: 'edit', exact: true })).toBeVisible();
  return { page, context, requests, expire: () => { authenticated = false; }, input: page.getByRole('textbox', { name: 'markdown', exact: true }) };
}
async function edit(page) {
  await page.getByRole('link', { name: 'edit', exact: true }).click();
  await expect(page.locator('.reader-content.is-editing')).toBeVisible();
}
async function stored(page) {
  return page.evaluate(({ prefix, activeKey }) => JSON.parse(localStorage.getItem(prefix + sessionStorage.getItem(activeKey))).source, { prefix, activeKey });
}
async function metrics(page) {
  return page.locator('.reader-content > h1, .reader-content > p, .reader-header, .reader-footer').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
    return { text: node.textContent, x: rect.x, y: rect.y, width: rect.width, height: rect.height, font: css.font, filter: css.filter, lineHeight: css.lineHeight };
  }));
}

test('edit stays on the reader with identical layout, then saves and resumes local changes', async t => {
  const { page, input } = await setup(t);
  await page.evaluate(() => document.fonts.ready);
  const before = await metrics(page);
  const published = await readFile('src/content/00-landing.md', 'utf8');
  await page.screenshot({ path: path.join(tmpdir(), 'portfolio-reader-before.png') });
  await edit(page);
  assert.equal(new URL(page.url()).pathname, '/');
  await expect(page.locator('.owner-controls')).toHaveText(' · stop editing · create');
  assert.deepEqual(await metrics(page), before);
  assert.equal(await page.locator('.cm-editor').count(), 0);
  await page.screenshot({ path: path.join(tmpdir(), 'portfolio-reader-edit.png') });
  await page.locator('.reader-content > p').last().click();
  await expect(input).toBeVisible();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' Local addition.');
  await expect.poll(() => stored(page)).toBe(published.trimEnd() + ' Local addition.\n');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => stored(page)).toBe(published);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await page.keyboard.press('Escape');
  await expect(page.locator('.reader-content > p').last()).toContainText('Local addition.');
  await page.getByRole('link', { name: 'stop editing', exact: true }).click();
  await expect(page.locator('.reader-content')).not.toHaveClass(/is-editing/);
  await expect(page.locator('.reader-content > p').last()).toContainText('Local addition.');
  await page.reload();
  await expect(page.locator('.reader-content')).not.toContainText('Local addition.');
  await edit(page);
  await expect(page.locator('.reader-content')).toContainText('Local addition.');
});

test('rendered media, tables and CRLF source survive paragraph editing and session expiry', async t => {
  const source = '---\r\ncreated: 2026-09-15\r\ncustom: keep me\r\n---\r\n\r\n# A quiet page\r\n\r\nA **bold** paragraph.\r\n\r\n![Logo](/logo.svg)\r\n\r\n| a | b |\r\n| - | - |\r\n| 1 | 2 |\r\n\r\n<video controls src="/demo.mp4"></video>\r\n\r\n<script>window.editorPwned=true</script>';
  const { page, input, expire } = await setup(t, { source });
  await edit(page);
  await expect(page.locator('.reader-content figure img')).toBeVisible();
  await expect(page.locator('.reader-content table')).toBeVisible();
  await expect(page.locator('.reader-content video')).toBeVisible();
  await expect(page.locator('.reader-content video')).toHaveAttribute('src', '/demo.mp4');
  assert.equal(await stored(page), source);
  assert.equal(await page.evaluate(() => window.editorPwned), undefined);
  await page.locator('.reader-content > p').first().click();
  await expect(input).toBeVisible();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' Changed.');
  await expect.poll(() => stored(page)).toBe(source.replace('paragraph.', 'paragraph. Changed.'));
  expire();
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await expect(page.locator('.inline-manuscript, .owner-controls, #editor-tools')).toHaveCount(0);
  await expect(page.locator('.reader-content h1')).toContainText("Hi! I'm Zane Chee.");
});

test('mobile uses the reader layout, while signed-out visitors never load editor code', async t => {
  const { page } = await setup(t, { mobile: true, pathname: '/computer-use/' });
  await page.evaluate(() => document.fonts.ready);
  const before = await metrics(page);
  await edit(page);
  assert.deepEqual(await metrics(page), before);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(tmpdir(), 'portfolio-inline-mobile.png') });
  const visitor = await setup(t, { owner: false, pathname: '/?edit=1' });
  await expect(visitor.page.locator('.reader-content')).toBeVisible();
  assert.equal(await visitor.page.locator('.owner-controls').count(), 0);
  assert.equal(visitor.requests.some(url => /\/assets\/(inline-|editor-)|\/editor\/posts/.test(url)), false);
});

test('create uses the same article; failed storage remains recoverable as markdown', async t => {
  const { page, input } = await setup(t);
  await page.getByRole('link', { name: 'create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add paragraph' })).toBeVisible();
  await page.getByRole('button', { name: 'Add paragraph' }).click();
  await expect(input).toBeVisible();
  await page.keyboard.insertText('# New page\n\n- first');
  await page.keyboard.press('Enter'); await page.keyboard.insertText('second');
  await expect.poll(() => stored(page)).toBe('# New page\n\n- first\n- second');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await page.keyboard.insertText(' unsaved');
  await expect(page.locator('#editor-error')).toContainText('could not save');
  await page.keyboard.press('ControlOrMeta+k');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'download markdown' }).click();
  const download = await pending;
  assert.equal(await readFile(await download.path(), 'utf8'), '# New page\n\n- first\n- second unsaved');
});
