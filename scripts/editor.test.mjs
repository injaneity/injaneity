import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseFrontmatter, renderMarkdown } from '../src/lib/markdown.mjs';

test('editor uses the article renderer for headings, links, code, lists and frontmatter', async () => {
  const { content, metadata } = parseFrontmatter('---\ncreated: 2026-09-15\n---\n# A draft\n\n[writing](/writing)\n\n- one\n- two\n\n```js\nconst value = 1;\n```');
  assert.equal(metadata.created, '2026-09-15');
  const html = await renderMarkdown(content, metadata, { safe: true });
  assert.match(html, /<h1 id="a-draft">/);
  assert.match(html, /href="\/writing\/"/);
  assert.match(html, /<ul>/);
  assert.match(html, /code-block-wrapper/);
  assert.match(html, /hljs-keyword/);
});

test('preview strips executable HTML, CSS, embeds and dangerous URLs', async () => {
  const html = await renderMarkdown(`<script>alert(1)</script>
<style>body{display:none}</style>
<iframe src="https://example.com"></iframe>
<img src="x" onerror="alert(1)">
<a href="javascript:alert(1)">bad</a>

[download](!javascript:alert%281%29)

<video controls poster="/images/poster.jpg"><source src="/videos/demo.mp4" type="video/mp4"></video>`, {}, { safe: true });
  assert.doesNotMatch(html, /<script|<style|<iframe|onerror|javascript:/i);
  assert.match(html, /<video controls/);
  assert.match(html, /src="\/videos\/demo.mp4"/);
});

test('article dates sit below the title while the site header stays separate', async () => {
  const html = await renderMarkdown('# A draft\n\nText.', { created: '2026-01-01', modified: '2026-09-15' });
  assert.match(html, /<\/h1><div class="article-byline">updated sep 15, 2026<\/div>/);
  assert.doesNotMatch(html, /byline-home|zanechee\.dev/);
  const created = await renderMarkdown('# New post', { created: '2026-09-15' });
  assert.match(created, /class="article-byline">created sep 15, 2026/);
  const undated = await renderMarkdown('# Undated');
  assert.match(undated, /<div class="article-byline"><\/div>/);
  const reader = await readFile('dist/index.html', 'utf8');
  const header = reader.match(/<header\b[\s\S]*?<\/header>/)?.[0];
  assert.match(header, /zanechee\.dev/);
  assert.doesNotMatch(header, /updated|created|published|owner-controls|\/editor\//);
});

test('editor is noindex and does not add editor code to public pages', async () => {
  const reader = await readFile('dist/index.html', 'utf8');
  const editor = await readFile('dist/editor/index.html', 'utf8');
  assert.match(editor, /noindex, nofollow/);
  assert.match(editor, /data-mode="write"/);
  assert.match(editor, /<dialog id="contents" aria-labelledby="contents-title"/);
  assert.doesNotMatch(editor, /<select\b/);
  assert.match(editor, /editor-.*\.js/);
  assert.doesNotMatch(reader, /editor-.*\.js|preview\.worker|posts\.json/);
  assert.doesNotMatch(await readFile('dist/sitemap.xml', 'utf8'), /\/editor\//);
  const scripts = [...reader.matchAll(/<script[^>]+src="([^"]+)"/g)];
  const preloads = [...reader.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)];
  let bytes = 0;
  for (const [, url] of [...scripts, ...preloads]) bytes += gzipSync(await readFile(`dist${url}`)).length;
  assert.ok(bytes < 2500, `reader scripts grew to ${bytes} bytes gzip`);
  const worker = (await readdir('dist/assets')).find((name) => name.startsWith('preview.worker-'));
  const workerSize = gzipSync(await readFile(`dist/assets/${worker}`)).length;
  assert.ok(workerSize < 75_000, `base preview worker grew to ${workerSize} bytes gzip`);
});

test('editor copies retain source frontmatter instead of importing a rendered mirror', async () => {
  const entries = JSON.parse(await readFile('dist/editor/posts.json', 'utf8'));
  for (const entry of entries) {
    assert.equal(await readFile(`dist/editor/posts/${entry.slug}.md`, 'utf8'), await readFile(`src/content/${entry.slug}.md`, 'utf8'));
  }
});

test('editor keeps accessible controls without repeated captions or starter copy', async () => {
  const html = await readFile('dist/editor/index.html', 'utf8');
  assert.match(html, /<label class="sr-only" for="manuscript">markdown<\/label>/);
  assert.match(html, /aria-describedby="draft-notice"/);
  assert.match(html, /saved in this browser only · not published/);
  assert.match(html, /id="preview-state" class="preview-status" role="status"><\/p>/);
  assert.doesNotMatch(html, /pane-caption|on the page|preparing preview|side by side|contents-footnote/);
  const source = await readFile('src/editor/main.ts', 'utf8');
  assert.doesNotMatch(source, /const welcome|the page is yours|live preview|min read|newDraft\('# untitled/);
  assert.match(source, /source: ''/);
  assert.match(source, /storageFailed = true/);
  assert.match(source, /if \(restored\) \{ draft = restored/);
});

test('production preview worker renders without access to document', async () => {
  const filename = (await readdir('dist/assets')).find((name) => name.startsWith('preview.worker-'));
  const url = pathToFileURL(path.resolve('dist/assets', filename)).href;
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    global.self = { postMessage: data => parentPort.postMessage(data) };
    import(${JSON.stringify(url)}).then(() => parentPort.on('message', data => self.onmessage({ data })));
  `, { eval: true });
  try {
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('worker timed out')), 8000);
      worker.once('error', (error) => { clearTimeout(timer); reject(error); });
      worker.once('message', (data) => { clearTimeout(timer); resolve(data); });
      worker.postMessage({ revision: 9, source: '# worker &amp; paper\n\nA **live** preview.' });
    });
    assert.equal(result.revision, 9);
    assert.match(result.html, /worker &#x26; paper/);
    assert.match(result.html, /<strong>live<\/strong>/);
  } finally { await worker.terminate(); }
});
