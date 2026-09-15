import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

function textContent(node) {
  return node.value ?? (node.children || []).map(textContent).join('');
}

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
      description: metadata.description,
      kind: metadata.kind,
      category: metadata.category,
      image: metadata.image,
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

function visit(node, fn, parent = null, index = -1) {
  fn(node, parent, index);
  // The visitor inserts the byline and wraps elements, so the list can grow.
  if (node.children) for (let i = 0; i < node.children.length; i++) visit(node.children[i], fn, node, i);
}

function element(tagName, properties = {}, children = []) {
  return { type: 'element', tagName, properties, children };
}

function transformArticle(metadata) {
  return (tree) => {
    const headingIds = new Set();
    const published = formatDate(metadata.created);
    const updated = formatDate(metadata.modified);
    visit(tree, (node, parent, index) => {
      if (node.type !== 'element') return;

      if (/^h[1-5]$/.test(node.tagName) && !node.properties.id) {
        const base = textContent(node).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section';
        let id = base;
        for (let suffix = 2; headingIds.has(id); suffix++) id = `${base}-${suffix}`;
        headingIds.add(id);
        node.properties.id = id;
      }

      if (node.tagName === 'h1' && parent && index >= 0) {
        const dateText = updated ? `updated ${updated}` : published ? `created ${published}` : '';
        parent.children.splice(index + 1, 0, element('div', { className: ['article-byline'] },
          dateText ? [{ type: 'text', value: dateText.toLowerCase() }] : []));
      }

      if (node.tagName === 'a') {
        const href = String(node.properties?.href || '');
        if (href.startsWith('!') || href.startsWith('%21')) {
          const target = href.replace(/^(!|%21)/, '');
          try {
            node.properties.href = ['http:', 'https:'].includes(new URL(target, 'https://zanechee.dev').protocol) ? target : '';
          } catch { node.properties.href = ''; }
          node.properties.download = true;
          node.properties.className = [...(node.properties.className || []), 'download-link'];
          return;
        }
        const external = /^https?:\/\//i.test(href) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(href);
        if (external) {
          node.properties.href = /^https?:\/\//i.test(href) ? href : `https://${href}`;
          node.properties.target = '_blank';
          node.properties.rel = ['noopener', 'noreferrer'];
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

async function renderMarkdown(content, metadata = {}, { safe = false } = {}) {
  const parser = unified().use(remarkParse).use(remarkGfm);
  const tree = parser.parse(content);
  let hasHtml = false;
  let hasCode = false;
  visit(tree, (node) => {
    if (node.type === 'html') hasHtml = true;
    if (node.type === 'code') hasCode = true;
  });
  const processor = parser().use(remarkRehype, { allowDangerousHtml: true });
  // Prose does not need an HTML parser or dozens of syntax grammars.
  if (hasHtml) processor.use((await import('rehype-raw')).default);
  processor.use(safe ? rehypeSanitize : () => {}, {
      ...defaultSchema,
      tagNames: [...defaultSchema.tagNames, 'video', 'source'],
      attributes: { ...defaultSchema.attributes, video: ['controls', 'preload', 'poster', 'ariaLabel'], source: ['src', 'type'] },
    });
  if (hasCode || hasHtml) processor.use((await import('rehype-highlight')).default);
  processor.use(() => transformArticle(metadata)).use(rehypeStringify);
  const file = processor.stringify(await processor.run(tree));
  return String(file)
    .replace(/<p>(<figure class="image-node">[\s\S]*?<\/figure>)<\/p>/g, '$1')
    .replace(/<a href="!(.*?)"/g, '<a href="$1" download class="download-link"')
    .replace(/<a href="%21(.*?)"/g, '<a href="$1" download class="download-link"');
}

function ditherFilter() {
  const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4">${bayer.flatMap((row, y) => row.map((v, x) => `<rect x="${x}" y="${y}" width="1" height="1" fill="rgb(${Math.round((v / 15) * 255)},${Math.round((v / 15) * 255)},${Math.round((v / 15) * 255)})"/>`)).join('')}</svg>`;
  const href = `data:image/svg+xml,${encodeURIComponent(tile)}`;
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><filter id="eink-dither" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB"><feImage href="${href}" width="4" height="4" result="bayerTile"/><feTile in="bayerTile" result="bayer"/><feComposite in="SourceGraphic" in2="bayer" operator="arithmetic" k1="0" k2="1" k3="0.2" k4="-0.1" result="biased"/><feComponentTransfer in="biased" result="quantized"><feFuncR type="discrete" tableValues="0.08 0.27 0.45 0.63 0.81 0.99"/><feFuncG type="discrete" tableValues="0.08 0.27 0.45 0.63 0.81 0.99"/><feFuncB type="discrete" tableValues="0.08 0.27 0.45 0.63 0.81 0.99"/></feComponentTransfer><feComposite in="quantized" in2="SourceGraphic" operator="in"/></filter><filter id="ink-paper" x="-3%" y="-8%" width="106%" height="116%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.018 0.62" numOctaves="2" seed="19" result="fibres"/><feDisplacementMap in="SourceGraphic" in2="fibres" scale="0.55" xChannelSelector="R" yChannelSelector="G" result="wobbled"/><feTurbulence type="fractalNoise" baseFrequency="0.16 0.28" numOctaves="2" seed="31" result="pigmentGrain"/><feColorMatrix in="pigmentGrain" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 0" result="porosityRaw"/><feComponentTransfer in="porosityRaw" result="porosity"><feFuncA type="discrete" tableValues="0.18 0.38 0.6 0.8 0.94 1"/></feComponentTransfer><feComposite in="wobbled" in2="porosity" operator="in" result="porousInk"/><feComponentTransfer in="pigmentGrain" result="densityVariation"><feFuncR type="linear" slope="0.1" intercept="0"/><feFuncG type="linear" slope="0.1" intercept="0"/><feFuncB type="linear" slope="0.1" intercept="0"/></feComponentTransfer><feComposite in="densityVariation" in2="porousInk" operator="in" result="variationInInk"/><feBlend in="porousInk" in2="variationInInk" mode="screen" result="texturedInk"/><feGaussianBlur in="texturedInk" stdDeviation="0.14" result="bleed"/><feComponentTransfer in="bleed" result="faintBleed"><feFuncA type="linear" slope="0.22"/></feComponentTransfer><feMerge><feMergeNode in="faintBleed"/><feMergeNode in="texturedInk"/></feMerge></filter></defs></svg>`;
}


export { parseFrontmatter, formatDate, renderMarkdown, ditherFilter, visit };
