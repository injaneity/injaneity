import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { parseFrontmatter, renderMarkdown } from '../src/lib/markdown.mjs';

test('article renderer supports headings, links, code, lists and frontmatter', async () => {
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

test('legacy editor is noindex and the inline editor stays off the reader load path', async () => {
  const reader = await readFile('dist/index.html', 'utf8');
  const editor = await readFile('dist/editor/index.html', 'utf8');
  assert.match(editor, /noindex, nofollow/);
  assert.doesNotMatch(editor, /id="manuscript"|editor-shell/);
  assert.doesNotMatch(editor, /<select\b/);
  assert.match(editor, /editor-.*\.js/);
  assert.doesNotMatch(reader, /editor-.*\.js|preview\.worker|posts\.json/);
  assert.doesNotMatch(await readFile('dist/sitemap.xml', 'utf8'), /\/editor\//);
  const scripts = [...reader.matchAll(/<script[^>]+src="([^"]+)"/g)];
  const preloads = [...reader.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)];
  let bytes = 0;
  for (const [, url] of [...scripts, ...preloads]) bytes += gzipSync(await readFile(`dist${url}`)).length;
  assert.ok(bytes < 4000, `reader scripts grew to ${bytes} bytes gzip`);
  const controller = (await readdir('dist/assets')).find((name) => /^inline-.*\.js$/.test(name));
  const editorSize = gzipSync(await readFile(`dist/assets/${controller}`)).length;
  assert.ok(editorSize < 180_000, `inline editor and shared renderer grew to ${editorSize} bytes gzip`);
});

test('editor copies retain source frontmatter instead of importing a rendered mirror', async () => {
  const entries = JSON.parse(await readFile('dist/editor/posts.json', 'utf8'));
  for (const entry of entries) {
    assert.equal(await readFile(`dist/editor/posts/${entry.slug}.md`, 'utf8'), await readFile(`src/content/${entry.slug}.md`, 'utf8'));
  }
});

test('editor keeps accessible controls without repeated captions or starter copy', async () => {
  const html = await readFile('src/editor/menu.html', 'utf8');
  assert.match(html, /id="editor-error" role="alert" hidden/);
  assert.doesNotMatch(html, /pane-caption|preparing preview|side by side|contents-footnote|<footer|data-mode|preview-state|save-state/);
  const surface = html.replace(/<dialog\b[\s\S]*?<\/dialog>/, '');
  assert.doesNotMatch(surface, />contents<|>export<|saved locally|download markdown|not published/);
  const source = await readFile('src/editor/inline.ts', 'utf8');
  assert.doesNotMatch(source, /const welcome|the page is yours|live preview|min read|newDraft\('# untitled/);
  assert.match(source, /storageFailed = true/);
  assert.match(source, /drafts\(\)\.find\(item => item.page === slug\)/);
});

test('editable blocks use exactly the published renderer with lossless source offsets', async () => {
  const source = '# Title\r\n\r\nA **bold** [link](/writing/).\r\n\r\n- one\r\n- two\r\n\r\n```js\r\nconst x = 1;\r\n```\r\n\r\n![paper](/logo.svg)\r\n\r\n| a | b |\r\n| - | - |\r\n| 1 | 2 |';
  const metadata = { created: '2026-09-28' };
  const reader = await renderMarkdown(source, metadata, { safe: true });
  const editable = await renderMarkdown(source, metadata, { safe: true, editable: true });
  assert.equal(editable.replace(/ data-edit-(?:from|to)="\d+"/g, ''), reader);
  const blocks = [...editable.matchAll(/data-edit-from="(\d+)" data-edit-to="(\d+)"/g)].map(([, from, to]) => source.slice(Number(from), Number(to)));
  assert.deepEqual(blocks, ['# Title', 'A **bold** [link](/writing/).', '- one\r\n- two', '```js\r\nconst x = 1;\r\n```', '![paper](/logo.svg)', '| a | b |\r\n| - | - |\r\n| 1 | 2 |']);
});
