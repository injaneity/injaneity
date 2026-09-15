import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { aliases, describeDocument, discoveryFiles, escapeHtml, headMetadata, postsByDate, renderPostIndex, site } from './site-metadata.mjs';
import { parseFrontmatter, formatDate, renderMarkdown, ditherFilter, visit } from '../src/lib/markdown.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, 'src/content');
const distDir = path.join(root, 'dist');

function markdownMirror(content, document) {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkStringify);
  const tree = processor.parse(content);
  const absolute = (url) => {
    const clean = url.replace(/^(!|%21)/, '');
    if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(clean) && !clean.endsWith('.md')) return `https://${clean}`;
    return new URL(clean, document.url).href;
  };
  visit(tree, (node) => {
    if (['link', 'image', 'definition'].includes(node.type)) node.url = absolute(node.url);
    if (node.type === 'html') node.value = node.value.replace(/\b(src|href|poster)="(\/[^\"]*)"/g,
      (_, attribute, url) => `${attribute}="${absolute(url)}"`);
  });
  return `<!-- Canonical: ${document.url} -->\n<!-- Author: Zane Chee -->\n${document.metadata.created ? `<!-- Published: ${document.metadata.created} -->\n` : ''}\n${processor.stringify(tree)}`;
}


async function assetTags() {
  const builtIndex = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
  return [...builtIndex.matchAll(/<(?:script|link)\b[^>]*>(?:<\/script>)?/g)].map((match) => match[0]).join('\n    ');
}

function pageHtml({ document, documents, article, assets }) {
  const { title } = document;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} · zanechee.dev</title>
    ${headMetadata(document, documents)}
    ${assets}
  </head>
  <body data-page-slug="${escapeHtml(document.slug)}">
    <a class="skip-link" href="#main-content">skip to content</a>
    <div class="site-shell">
      <div class="eink-page">
        <header class="reader-header" data-reader-header><p class="reader-header-metadata"><a href="/" rel="author">⎇ zanechee.dev</a></p></header>
        <main id="main-content" class="article-frame" tabindex="-1" aria-label="${escapeHtml(title)}"><article class="reader-content" data-reader-content>${article}</article></main>
        <nav class="reader-footer" aria-label="Primary"><a href="/">about me</a><span aria-hidden="true">·</span><a href="/writing/">writing</a><span aria-hidden="true">·</span><a href="/01-experience/">experience</a></nav>
      </div>
    </div>
    ${ditherFilter()}
  </body>
</html>`;
}

async function main() {
  const files = (await fs.readdir(contentDir)).filter((file) => file.endsWith('.md')).sort();
  const documents = await Promise.all(files.map(async (file) => {
    const slug = file.replace(/\.md$/, '');
    const raw = await fs.readFile(path.join(contentDir, file), 'utf8');
    const parsed = parseFrontmatter(raw);
    return describeDocument({
      slug,
      raw,
      ...parsed,
    });
  }));
  const assets = await assetTags();
  const editorDir = path.join(distDir, 'editor');
  await fs.mkdir(path.join(editorDir, 'posts'), { recursive: true });
  await fs.writeFile(path.join(editorDir, 'posts.json'), JSON.stringify(documents.map(({ slug, title }) => ({ slug, title }))));
  for (const document of documents) await fs.writeFile(path.join(editorDir, 'posts', `${document.slug}.md`), document.raw);
  const editorHtml = await fs.readFile(path.join(editorDir, 'index.html'), 'utf8');
  await fs.writeFile(path.join(editorDir, 'index.html'), editorHtml.replace('<!-- ink-filter -->', ditherFilter()));

  await fs.rm(path.join(distDir, 'index.html'), { force: true });
  for (const document of documents) {
    const indexMarker = '<!-- posts -->';
    const content = document.kind === 'index'
      ? document.content.replace(indexMarker, renderPostIndex(documents, formatDate))
      : document.content;
    if (document.kind === 'index' && !document.content.includes(indexMarker)) throw new Error('Writing index is missing its posts marker');
    let article = await renderMarkdown(content, document.metadata);
    if (document.kind === 'article') article += '<nav class="article-navigation" aria-label="More writing"><a href="/writing/">all writing</a> · <a href="/" rel="author">about the author</a></nav>';
    const html = pageHtml({ document, documents, article, assets });
    const outDir = document.slug === '00-landing' ? distDir : path.join(distDir, document.slug);
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'index.html'), html);
    const markdown = document.kind === 'index' ? document.content.replace(indexMarker,
      postsByDate(documents).map((post) => `- [${post.title}](${post.url})${post.metadata.created ? ` — ${post.metadata.created}` : ''}`).join('\n')) : document.content;
    await fs.writeFile(path.join(distDir, document.markdownHref.slice(1)), markdownMirror(markdown, document));
  }
  for (const [file, content] of Object.entries(discoveryFiles(documents))) await fs.writeFile(path.join(distDir, file), content);
  for (const [from, to] of Object.entries(aliases)) {
    const directory = path.join(distDir, from.slice(1));
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Article moved</title><meta name="robots" content="noindex"><link rel="canonical" href="${site.url}${to}"><meta http-equiv="refresh" content="0;url=${to}"></head><body><a href="${to}">Read the article</a></body></html>`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
