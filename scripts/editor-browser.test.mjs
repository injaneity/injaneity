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

async function setup(t, { source, mobile = false, owner = true, pathname = '/', canPublish = true } = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  t.after(() => context.close());
  let authenticated = owner;
  // A fake repository behind /api/content/* so publishing can be checked without GitHub.
  const files = new Map(), commits = [];
  let version = 0;
  await context.route('**/api/auth/session', route => route.fulfill({ json: { authenticated, configured: true, login: 'injaneity', expiresAt: Date.now() + 3600000, canPublish } }));
  await context.route('**/api/content/*', async route => {
    const request = route.request(), slug = new URL(request.url()).pathname.split('/').pop();
    if (!files.has(slug)) {
      const file = path.resolve('src/content', `${slug}.md`);
      if (existsSync(file)) files.set(slug, { source: await readFile(file, 'utf8'), sha: String(++version).padStart(40, '0') });
    }
    const current = files.get(slug);
    if (request.method() === 'GET') return current ? route.fulfill({ json: current }) : route.fulfill({ status: 404, json: { error: 'page not found' } });
    const body = request.postDataJSON();
    if (current ? body.sha !== current.sha : body.sha) return route.fulfill({ status: 409, json: { error: 'the page changed elsewhere' } });
    const next = { source: body.source, sha: String(++version).padStart(40, '0') };
    files.set(slug, next); commits.push({ slug, ...next });
    return route.fulfill({ json: { sha: next.sha } });
  });
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
  await page.goto(origin + pathname + (source !== undefined ? '?draft=fixture' : ''));
  if (owner) await expect(page.locator('.reader-content.is-editing')).toBeVisible();
  return { page, context, requests, commits, files, expire: () => { authenticated = false; }, input: page.getByRole('textbox', { name: 'markdown', exact: true }) };
}
async function stored(page) {
  return page.evaluate(({ prefix, activeKey }) => JSON.parse(localStorage.getItem(prefix + sessionStorage.getItem(activeKey))).source, { prefix, activeKey });
}
async function metrics(page) {
  await page.evaluate(() => document.fonts.ready);
  return page.locator('.reader-content > h1, .reader-content > p, .reader-header, .reader-footer').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
    return { text: node.textContent, x: rect.x, y: rect.y, width: rect.width, height: rect.height, font: css.font, filter: css.filter, lineHeight: css.lineHeight };
  }));
}
const withoutControls = rows => rows.map(({ text, ...row }) => ({ ...row, text: text.replace(/ · .*$/, '') }));

test('owners edit the page they read, with no mode switch, and edits publish to the repository', async t => {
  const visitor = await setup(t, { owner: false });
  const before = await metrics(visitor.page);
  const { page, input, commits } = await setup(t);
  const published = await readFile('src/content/00-landing.md', 'utf8');
  assert.equal(new URL(page.url()).pathname, '/');
  assert.equal(await page.getByRole('link', { name: /^(edit|stop editing)$/ }).count(), 0);
  await expect(page.locator('.owner-controls a')).toHaveText('create');
  assert.deepEqual(withoutControls(await metrics(page)), withoutControls(before));
  assert.equal(await page.locator('.cm-editor').count(), 0);
  await page.screenshot({ path: path.join(tmpdir(), 'portfolio-reader-owner.png') });
  await page.locator('.reader-content > p').last().click({ position: { x: 2, y: 2 } });
  await expect(input).toBeVisible();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' Live addition.');
  await expect.poll(() => stored(page)).toBe(published.trimEnd() + ' Live addition.\n');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => stored(page)).toBe(published);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await page.keyboard.press('Escape');
  await expect(page.locator('.reader-content > p').last()).toContainText('Live addition.');
  await expect.poll(() => commits.length).toBe(1);
  assert.equal(commits[0].slug, '00-landing');
  assert.equal(commits[0].source, published.trimEnd() + ' Live addition.\n');
  await expect(page.locator('.owner-status')).toContainText('published');
  // A reload starts from the repository, so the edit is already there before any rebuild.
  await page.reload();
  await expect(page.locator('.reader-content.is-editing')).toBeVisible();
  await expect(page.locator('.reader-content')).toContainText('Live addition.');
});

test('clicking a word keeps the rest of the sentence formatted and puts the caret there', async t => {
  const source = '# Spans\n\nPlain words, then **bold text**, then a [link](/writing/), then `code` at the end.';
  const { page, input } = await setup(t, { source });
  const paragraph = page.locator('.reader-content > p').first();
  const box = await paragraph.getByText('Plain words').boundingBox();
  await page.mouse.click(box.x + 3, box.y + box.height / 2);
  await expect(input).toBeVisible();
  // The caret lands in the clicked word, and no markdown syntax appears elsewhere in the sentence.
  assert.ok(await page.evaluate(() => getSelection().anchorOffset) <= 2);
  await expect(page.locator('.cm-content')).toHaveText('Plain words, then bold text, then a link, then code at the end.');
  await page.keyboard.press('ArrowRight'); // still in plain text
  await expect(page.locator('.cm-content')).not.toContainText('**');
  // Moving into the bold span reveals only that span's markers.
  const bold = await page.locator('.cm-content .live-strong').boundingBox();
  await page.mouse.click(bold.x + bold.width / 2, bold.y + bold.height / 2);
  await expect(page.locator('.cm-content')).toHaveText('Plain words, then **bold text**, then a link, then code at the end.');
  assert.equal(await stored(page), source);
});

test('links still navigate on an editable page', async t => {
  const { page } = await setup(t, { source: '# Links\n\nRead [the writing index](/writing/).' });
  await page.getByRole('link', { name: 'the writing index' }).click();
  await expect(page).toHaveURL(origin + '/writing/');
  assert.equal(await page.locator('.cm-editor').count(), 0);
});

test('rendered media, tables and CRLF source survive paragraph editing and session expiry', async t => {
  const source = '---\r\ncreated: 2026-09-15\r\ncustom: keep me\r\n---\r\n\r\n# A quiet page\r\n\r\nA **bold** paragraph.\r\n\r\n![Logo](/logo.svg)\r\n\r\n| a | b |\r\n| - | - |\r\n| 1 | 2 |\r\n\r\n<video controls src="/demo.mp4"></video>\r\n\r\n<script>window.editorPwned=true</script>';
  const { page, input, expire, commits } = await setup(t, { source });
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
  assert.equal(commits.length, 0);
});

test('mobile uses the reader layout, while signed-out visitors load no editor code before they click', async t => {
  const visitor = await setup(t, { owner: false, mobile: true, pathname: '/computer-use/' });
  const before = await metrics(visitor.page);
  assert.equal(await visitor.page.locator('.owner-controls').count(), 0);
  assert.equal(visitor.requests.some(url => /\/assets\/(inline-|editor-)|\/editor\/posts|\/api\/content/.test(url)), false);
  const { page, input } = await setup(t, { mobile: true, pathname: '/computer-use/' });
  const owner = await metrics(page);
  assert.equal(owner.length, before.length);
  await page.locator('.reader-content > p').first().click({ position: { x: 2, y: 2 } });
  await expect(input).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0);
  // Lazy images further down can settle meanwhile, so compare the header and the opening blocks.
  assert.deepEqual((await metrics(page)).slice(0, 4), owner.slice(0, 4));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(tmpdir(), 'portfolio-inline-mobile.png') });
});

test('visitors can edit any page, but nothing is stored or published and a reload restores it', async t => {
  const { page, input, requests } = await setup(t, { owner: false, pathname: '/computer-use/' });
  assert.equal(requests.some(url => /\/assets\/inline-/.test(url)), false);
  const first = page.locator('.reader-content > p').first();
  const original = await first.textContent();
  await first.click({ position: { x: 2, y: 2 } });
  await expect(input).toBeVisible();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' Visitor scribble.');
  await page.keyboard.press('Escape');
  await expect(page.locator('.reader-content > p').first()).toContainText('Visitor scribble.');
  assert.equal(await page.locator('.owner-controls').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.equal(requests.some(url => url.includes('/api/content/')), false);
  await page.reload();
  await expect(page.locator('.reader-content > p').first()).toHaveText(original);
});

test('create publishes a new page from its title; failed storage remains recoverable as markdown', async t => {
  const { page, input, commits } = await setup(t);
  await page.getByRole('link', { name: 'create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add paragraph' })).toBeVisible();
  await page.getByRole('button', { name: 'Add paragraph' }).click();
  await expect(input).toBeVisible();
  await page.keyboard.insertText('# New page\n\n- first');
  await page.keyboard.press('Enter'); await page.keyboard.insertText('second');
  await expect.poll(() => stored(page)).toBe('# New page\n\n- first\n- second');
  await page.keyboard.press('Escape');
  await expect.poll(() => commits.length).toBe(1);
  assert.equal(commits[0].slug, 'new-page');
  assert.match(commits[0].source, /^---\ncreated: \d{4}-\d{2}-\d{2}\n---\n\n# New page\n\n- first\n- second$/);
  await page.locator('.reader-content > ul').click();
  await expect(input).toBeVisible();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' unsaved');
  await expect(page.locator('#editor-error')).toContainText('could not save');
  await page.keyboard.press('ControlOrMeta+k');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'download markdown' }).click();
  const download = await pending;
  assert.match(await readFile(await download.path(), 'utf8'), /# New page\n\n- first\n- second unsaved$/);
});

test('without a publishing token, edits stay as local drafts and say so', async t => {
  const { page, input, requests } = await setup(t, { canPublish: false });
  await expect(page.locator('.owner-status')).toHaveText('sign in again to publish');
  await page.locator('.reader-content > p').last().click({ position: { x: 2, y: 2 } });
  await page.keyboard.insertText('x');
  await expect(input).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2000);
  assert.equal(requests.some(url => url.includes('/api/content/')), false);
});

test('inline highlights add no word spacing and paragraph gaps stay consistent', async t => {
  const source = '# Hi! I\'m Zane Chee.\n\nBuilding at [**cua (YC25)**](https://cua.ai), previously at **JPMorgan**, **SEA Group**, [**Hypotenuse AI (YC23)**](https://hypotenuse.ai).\n\nGraduating in December 2026. Find me on [GitHub](https://github.com/injaneity), [LinkedIn](https://linkedin.com/in/zanechee), [X](https://x.com/injaneity), & download my resume [here](!/zane.chee.resume.pdf).\n\nAlso a [**OpenAI Codex Ambassador**](https://developers.openai.com).';
  const { page } = await setup(t, { source });
  const spacing = await page.locator('.reader-content > p').evaluateAll(nodes => nodes.map(node => {
    const css = getComputedStyle(node);
    return { bottom: parseFloat(css.marginBottom), expected: parseFloat(css.fontSize) * 0.55 };
  }));
  for (const gap of spacing) assert.ok(Math.abs(gap.bottom - gap.expected) < 0.01);
  const extraWidths = await page.locator('.reader-content > p a').evaluateAll(nodes => nodes.map(node => {
    const css = getComputedStyle(node);
    return parseFloat(css.paddingLeft) + parseFloat(css.paddingRight) + parseFloat(css.marginLeft) + parseFloat(css.marginRight);
  }));
  assert.ok(extraWidths.length >= 5);
  assert.ok(extraWidths.every(width => Math.abs(width) < 0.01));
  await page.screenshot({ path: path.join(tmpdir(), 'portfolio-spacing.png') });
  assert.equal(await stored(page), source);
});
