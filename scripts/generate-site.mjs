import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, 'src/content');
const distDir = path.join(root, 'dist');
const sourceUrl = 'https://github.com/injaneity/injaneity';
const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

function parseFrontmatter(raw) {
  const match = raw.match(frontmatterRegex);
  const metadata = {};
  if (!match) return { content: raw, metadata };
  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes(':')) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase().replace(/[-\s]+/g, '_');
    const value = rest.join(':').trim().replace(/^['"]|['"]$/g, '');
    if (key && value) metadata[key] = value;
  }
  return {
    content: raw.replace(frontmatterRegex, ''),
    metadata: {
      title: metadata.title,
      created: metadata.created || metadata.created_at || metadata.date || metadata.published,
      modified: metadata.modified || metadata.updated || metadata.updated_at || metadata.last_modified,
    },
  };
}

function formatDate(raw) {
  if (!raw) return null;
  const exact = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = exact ? new Date(Number(exact[1]), Number(exact[2]) - 1, Number(exact[3])) : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function extractTitle(content, slug) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : slug.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

function countWords(content) {
  return content
    .replace(/^#+\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function textOf(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (node.type === 'element' || node.type === 'root') return (node.children || []).map(textOf).join('');
  return '';
}

function visit(node, fn, parent = null, index = -1) {
  fn(node, parent, index);
  if (node.children) node.children.forEach((child, i) => visit(child, fn, node, i));
}

function element(tagName, properties = {}, children = []) {
  return { type: 'element', tagName, properties, children };
}

function transformArticle(metadata) {
  return (tree) => {
    const published = formatDate(metadata.created);
    const updated = formatDate(metadata.modified);
    visit(tree, (node, parent, index) => {
      if (node.type !== 'element') return;

      if (node.tagName === 'h1' && parent && index >= 0) {
        const dateText = updated ? ` · Updated ${updated}` : published ? ` · Published ${published}` : '';
        parent.children.splice(index + 1, 0, element('h6', { className: ['article-byline'] }, [
          element('a', { href: '/', className: ['byline-home'] }, [element('strong', {}, [{ type: 'text', value: '⎇ zanechee.dev' }])]),
          { type: 'text', value: dateText },
        ]));
      }

      if (node.tagName === 'a') {
        const href = String(node.properties?.href || '');
        if (href.startsWith('!') || href.startsWith('%21')) {
          node.properties.href = href.replace(/^(!|%21)/, '');
          node.properties.download = true;
          node.properties.className = [...(node.properties.className || []), 'download-link'];
          return;
        }
        const external = /^https?:\/\//i.test(href) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(href);
        if (external) {
          node.properties.href = /^https?:\/\//i.test(href) ? href : `https://${href}`;
          node.properties.target = '_blank';
          node.properties.rel = ['noopener', 'noreferrer', 'nofollow'];
        } else if (!href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
          const clean = href.startsWith('./') ? href.slice(1) : href;
          node.properties.href = /^\/[A-Za-z0-9_-]+$/.test(clean) ? `${clean}/` : clean;
        }
      }

      if (node.tagName === 'img') {
        const caption = node.properties?.title || node.properties?.alt;
        const figure = element('figure', { className: ['image-node'] }, [
          { ...node, properties: { ...node.properties, loading: 'lazy' } },
          ...(caption ? [element('figcaption', {}, [{ type: 'text', value: String(caption) }])] : []),
        ]);
        if (parent && index >= 0) parent.children[index] = figure;
      }

      if (node.tagName === 'pre') {
        const code = node.children?.find((child) => child.tagName === 'code');
        const className = code?.properties?.className || [];
        const language = String(className.find((item) => String(item).startsWith('language-')) || 'language-plaintext').replace('language-', '');
        const wrapper = element('div', { className: ['code-block-wrapper'] }, [
          element('div', { className: ['code-block-header'] }, [
            element('span', { className: ['language-label'] }, [{ type: 'text', value: language }]),
            element('button', { className: ['copy-button'], ariaLabel: 'Copy code', type: 'button', dataCopyCode: true }, []),
          ]),
          node,
        ]);
        if (parent && index >= 0) parent.children[index] = wrapper;
      }
    });
  };
}

async function renderMarkdown(content, metadata) {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeHighlight)
    .use(() => transformArticle(metadata))
    .use(rehypeStringify)
    .process(content);
  return String(file)
    .replace(/<a href="!(.*?)"/g, '<a href="$1" download class="download-link"')
    .replace(/<a href="%21(.*?)"/g, '<a href="$1" download class="download-link"');
}

function ditherFilter() {
  const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4">${bayer.flatMap((row, y) => row.map((v, x) => `<rect x="${x}" y="${y}" width="1" height="1" fill="rgb(${Math.round((v / 15) * 255)},${Math.round((v / 15) * 255)},${Math.round((v / 15) * 255)})"/>`)).join('')}</svg>`;
  const href = `data:image/svg+xml,${encodeURIComponent(tile)}`;
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><filter id="eink-dither" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB"><feImage href="${href}" width="4" height="4" result="bayerTile"/><feTile in="bayerTile" result="bayer"/><feComposite in="SourceGraphic" in2="bayer" operator="arithmetic" k1="0" k2="1" k3="0.2" k4="-0.1" result="biased"/><feComponentTransfer in="biased" result="quantized"><feFuncR type="discrete" tableValues="0.08 0.27 0.45 0.63 0.81 0.99"/><feFuncG type="discrete" tableValues="0.08 0.27 0.45 0.63 0.81 0.99"/><feFuncB type="discrete" tableValues="0.08 0.27 0.45 0.63 0.81 0.99"/></feComponentTransfer><feComposite in="quantized" in2="SourceGraphic" operator="in"/></filter></defs></svg>`;
}

function searchControl() {
  return `<div class="corner-search"><div class="search-control" data-search><div class="search-panel" data-search-results hidden><div class="search-results" data-search-list></div></div><div class="search-row"><button class="icon-button" type="button" aria-label="Search pages" data-search-button><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg></button><div class="search-input-shell"><div class="search-input-wrap"><input class="search-input" type="text" placeholder="Search pages..." data-search-input><button class="clear-button" type="button" aria-label="Clear search" data-search-clear hidden><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div></div></div></div></div>`;
}

async function assetTags() {
  const builtIndex = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
  return [...builtIndex.matchAll(/<(?:script|link)\b[^>]*>(?:<\/script>)?/g)].map((match) => match[0]).join('\n    ');
}

function pageHtml({ title, article, assets, pages }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} · zanechee.dev</title>
    ${assets}
  </head>
  <body>
    <div class="site-shell">
      <div class="eink-page"><div class="article-frame"><article class="reader-content">${article}</article></div></div>
      ${searchControl()}
      <div class="corner-action"><button class="corner-button" type="button" data-corner-button data-mode="source" aria-label="View source code"><span class="corner-label" data-corner-label>view source code</span><span data-corner-icon><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6"></path><path d="m8 6-6 6 6 6"></path></svg></span></button></div>
    </div>
    ${ditherFilter()}
    <canvas class="eink-overlay" aria-hidden="true"></canvas>
    <script id="search-index" type="application/json">${JSON.stringify(pages).replace(/</g, '\\u003c')}</script>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

async function main() {
  const files = (await fs.readdir(contentDir)).filter((file) => file.endsWith('.md')).sort();
  const documents = await Promise.all(files.map(async (file) => {
    const slug = file.replace(/\.md$/, '');
    const raw = await fs.readFile(path.join(contentDir, file), 'utf8');
    const parsed = parseFrontmatter(raw);
    return {
      slug,
      file,
      href: slug === '00-landing' ? '/' : `/${slug}/`,
      title: parsed.metadata.title || extractTitle(parsed.content, slug),
      wordCount: countWords(parsed.content),
      ...parsed,
    };
  }));
  const pages = documents.map(({ title, slug, href, file, wordCount, metadata }) => ({ title, slug, href, path: `src/content/${file}`, wordCount, created: metadata.created, modified: metadata.modified }));
  const assets = await assetTags();

  await fs.rm(path.join(distDir, 'index.html'), { force: true });
  for (const document of documents) {
    const article = await renderMarkdown(document.content, document.metadata);
    const html = pageHtml({ title: document.title, article, assets, pages });
    const outDir = document.slug === '00-landing' ? distDir : path.join(distDir, document.slug);
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'index.html'), html);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
