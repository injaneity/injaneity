import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { aliases, describeDocument, site, structuredData } from './site-metadata.mjs';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const files = (await readdir(path.join(root, 'src/content'))).filter((file) => file.endsWith('.md'));
const routes = files.map((file) => file === '00-landing.md' ? '/' : `/${file.slice(0, -3)}/`);
const htmlByRoute = new Map(await Promise.all(routes.map(async (route) => [route, await readFile(path.join(dist, route, 'index.html'), 'utf8')])));
const decode = (value) => value.replace(/&#x([\da-f]+);|&#(\d+);|&amp;|&quot;|&apos;|&lt;|&gt;/gi,
  (match, hex, decimal) => hex ? String.fromCodePoint(parseInt(hex, 16)) : decimal ? String.fromCodePoint(Number(decimal)) : ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' }[match]));

test('every markdown page has a canonical URL, description, parseable entity graph, and matching mirror', async () => {
  for (const [route, html] of htmlByRoute) {
    assert.ok(html.includes(`<link rel="canonical" href="${site.url}${route}"`), route);
    const description = decode(html.match(/<meta name="description" content="([^"]+)"/)[1]);
    assert.ok(description.length >= 30 && description.length <= 160, `${route}: description`);
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
    const ids = new Set(graph.map((node) => node['@id']));
    for (const node of graph) {
      for (const property of ['author', 'publisher', 'isPartOf', 'mainEntity', 'mainEntityOfPage']) {
        if (node[property]?.['@id']) assert.ok(ids.has(node[property]['@id']), `${route}: unresolved ${property}`);
      }
    }
    const title = decode(html.match(/<title>(.*?) · zanechee.dev<\/title>/)[1]);
    assert.equal(graph.find((node) => node['@id'] === `${site.url}${route}#webpage`).name, title);
    assert.ok(!title.includes('*'), `${route}: markdown leaked into title`);
    const mirror = new URL(html.match(/type="text\/markdown" href="([^"]+)"/)[1]);
    const markdown = await readFile(path.join(dist, mirror.pathname), 'utf8');
    assert.ok(markdown.includes(`Canonical: ${site.url}${route}`));
    assert.ok(!markdown.includes('<!-- posts -->'));
  }
});

test('all local pages are reachable by following HTML links from the homepage', async () => {
  const visited = new Set();
  const pending = ['/'];
  while (pending.length) {
    const route = pending.shift();
    if (visited.has(route)) continue;
    visited.add(route);
    const html = htmlByRoute.get(route);
    for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
      const url = new URL(decode(match[1]), `${site.url}${route}`);
      if (url.origin !== site.url) continue;
      if (htmlByRoute.has(url.pathname)) pending.push(url.pathname);
      else {
        const file = await stat(path.join(dist, decodeURIComponent(url.pathname))).catch(() => null);
        assert.ok(file?.isFile(), `${route}: dead link ${url.pathname}`);
      }
    }
  }
  assert.deepEqual([...visited].sort(), [...routes].sort());
});

test('writing, RSS, sitemap, and llms index cover the same published source files', async () => {
  const sitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8');
  const llms = await readFile(path.join(dist, 'llms.txt'), 'utf8');
  const feed = await readFile(path.join(dist, 'feed.xml'), 'utf8');
  for (const [route, html] of htmlByRoute) {
    assert.ok(sitemap.includes(`<loc>${site.url}${route}</loc>`), route);
    assert.ok(llms.includes(`](${site.url}${route})`), route);
    if (html.includes('"@type":"BlogPosting"')) {
      assert.ok(htmlByRoute.get('/writing/').includes(`href="${route}"`), route);
      assert.ok(feed.includes(`<link>${site.url}${route}</link>`), route);
    }
  }
  assert.ok(htmlByRoute.get('/writing/').includes('https://x.com/injaneity/status/2051730711712063994'));
  assert.equal((await readFile(path.join(dist, 'robots.txt'), 'utf8')).includes('Disallow: /'), false);
});

test('historical essay slugs redirect to existing canonical pages', async () => {
  for (const [alias, target] of Object.entries(aliases)) {
    assert.ok(htmlByRoute.has(target));
    const html = await readFile(path.join(dist, alias, 'index.html'), 'utf8');
    assert.ok(html.includes(`content="0;url=${target}"`));
    assert.ok(html.includes(`rel="canonical" href="${site.url}${target}"`));
  }
});

test('metadata strips inline formatting and safely embeds titles with HTML syntax', () => {
  const doc = describeDocument({ slug: 'example', content: '# What *exactly* is this?\n\nA short introduction.', metadata: {} });
  assert.equal(doc.title, 'What exactly is this?');
  assert.equal(doc.description, 'A short introduction.');
  doc.title = '</script><script>alert(1)</script>';
  const json = structuredData(doc, [doc]);
  assert.equal(json.includes('</script>'), false);
  assert.equal(JSON.parse(json)['@graph'][2].name, doc.title);
});
