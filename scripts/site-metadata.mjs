import { unified } from 'unified';
import remarkParse from 'remark-parse';

export const site = {
  url: 'https://zanechee.dev',
  name: 'zanechee.dev',
  author: 'Zane Chee',
  profiles: ['https://github.com/injaneity', 'https://linkedin.com/in/zanechee', 'https://x.com/injaneity'],
};

export const aliases = {
  '/dev-01': '/eytzinger/',
  '/rant-01': '/eytzinger/',
  '/rant-02': '/not-all-hackathons/',
  '/rant-03': '/python-decorators/',
};

export const escapeHtml = (value) => String(value).replace(/[&<>'"]/g,
  (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

export function textContent(node) {
  if (node.type === 'html' || node.type === 'image') return '';
  return node.value ?? (node.children || []).map(textContent).join('');
}

export function describeDocument(document) {
  const tree = unified().use(remarkParse).parse(document.content);
  const heading = tree.children.find((node) => node.type === 'heading' && node.depth === 1);
  const paragraph = tree.children.find((node) => node.type === 'paragraph' && textContent(node).trim());
  const title = document.metadata.title || (heading && textContent(heading)) || document.slug;
  const description = (document.metadata.description || (paragraph && textContent(paragraph)) || title).replace(/\s+/g, ' ').trim();
  const href = document.slug === '00-landing' ? '/' : `/${document.slug}/`;
  return { ...document, title, href, url: `${site.url}${href}`,
    description: description.length > 160 ? `${description.slice(0, 157).replace(/\s+\S*$/, '')}…` : description,
    kind: document.metadata.kind || 'article',
    markdownHref: document.slug === '00-landing' ? '/index.md' : `/${document.slug}.md`,
  };
}

export function postsByDate(documents) {
  return documents.filter((document) => document.kind === 'article')
    .sort((a, b) => (b.metadata.created || '').localeCompare(a.metadata.created || '') || a.title.localeCompare(b.title));
}

export function renderPostIndex(documents, formatDate) {
  return postsByDate(documents).map((post) => {
    const detail = [formatDate(post.metadata.created), post.metadata.category].filter(Boolean).join(' · ');
    return `<section class="writing-entry"><h2><a href="${post.href}">${escapeHtml(post.title)}</a></h2>${detail ? `<p class="writing-date">${escapeHtml(detail)}</p>` : ''}</section>`;
  }).join('\n');
}

export function structuredData(document, documents) {
  const personId = `${site.url}/#person`;
  const websiteId = `${site.url}/#website`;
  const blogId = `${site.url}/writing/#blog`;
  const pageId = `${document.url}#webpage`;
  const person = { '@type': 'Person', '@id': personId, name: site.author,
    url: `${site.url}/`, sameAs: site.profiles };
  const website = { '@type': 'WebSite', '@id': websiteId, url: `${site.url}/`,
    name: site.name, inLanguage: 'en', publisher: { '@id': personId } };
  const page = { '@type': document.kind === 'profile' ? 'ProfilePage' : document.kind === 'index' ? 'CollectionPage' : 'WebPage',
    '@id': pageId, url: document.url, name: document.title, description: document.description,
    inLanguage: 'en', isPartOf: { '@id': websiteId }, author: { '@id': personId },
    ...(document.metadata.created && { datePublished: document.metadata.created }),
    ...(document.metadata.modified && { dateModified: document.metadata.modified }),
  };
  const graph = [person, website, page];
  if (document.kind === 'profile') page.mainEntity = { '@id': personId };
  if (document.kind === 'article' || document.kind === 'index') {
    graph.push({ '@type': 'Blog', '@id': blogId, url: `${site.url}/writing/`,
      name: 'Writing by Zane Chee', author: { '@id': personId }, isPartOf: { '@id': websiteId } });
  }
  if (document.kind === 'article') {
    page.mainEntity = { '@id': `${document.url}#article` };
    graph.push({ '@type': 'BlogPosting', '@id': `${document.url}#article`,
      headline: document.title, description: document.description, url: document.url,
      mainEntityOfPage: { '@id': pageId }, author: { '@id': personId }, publisher: { '@id': personId },
      isPartOf: { '@id': blogId }, inLanguage: 'en',
      ...(document.metadata.created && { datePublished: document.metadata.created }),
      ...(document.metadata.modified && { dateModified: document.metadata.modified }),
      ...(document.metadata.image && { image: new URL(document.metadata.image, site.url).href }),
      ...(document.metadata.category && { articleSection: document.metadata.category }),
    });
  }
  if (document.kind === 'index') {
    page.mainEntity = { '@id': `${document.url}#posts` };
    graph.push({ '@type': 'ItemList', '@id': `${document.url}#posts`,
      itemListElement: postsByDate(documents).map((post, index) => ({
        '@type': 'ListItem', position: index + 1, name: post.title, url: post.url,
      })),
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

export function headMetadata(document, documents) {
  const image = document.metadata.image && new URL(document.metadata.image, site.url).href;
  return `<meta name="description" content="${escapeHtml(document.description)}" />
    <meta name="author" content="${site.author}" />
    <link rel="canonical" href="${document.url}" />
    <link rel="alternate" type="text/markdown" href="${site.url}${document.markdownHref}" title="Markdown" />
    <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="Writing by Zane Chee" />
    <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
    <link rel="alternate" type="text/plain" href="/llms.txt" title="Site index for AI readers" />
    <meta property="og:type" content="${document.kind === 'article' ? 'article' : 'website'}" />
    <meta property="og:site_name" content="${site.name}" />
    <meta property="og:title" content="${escapeHtml(document.title)}" />
    <meta property="og:description" content="${escapeHtml(document.description)}" />
    <meta property="og:url" content="${document.url}" />
    <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:creator" content="@injaneity" />
    ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ''}
    <script type="application/ld+json">${structuredData(document, documents)}</script>`;
}

export function discoveryFiles(documents) {
  const posts = postsByDate(documents);
  const xml = (body) => `<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`;
  const sitemap = xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${documents.map((document) => {
    const lastmod = document.metadata.modified || document.metadata.created;
    return `<url><loc>${escapeHtml(document.url)}</loc>${lastmod ? `<lastmod>${escapeHtml(lastmod)}</lastmod>` : ''}</url>`;
  }).join('')}</urlset>`);
  const feed = xml(`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Writing by Zane Chee</title><link>${site.url}/writing/</link><description>Essays on computer use, software, and personal experiences.</description><language>en</language><atom:link href="${site.url}/feed.xml" rel="self" type="application/rss+xml"/>${posts.map((post) => `<item><title>${escapeHtml(post.title)}</title><link>${post.url}</link><guid isPermaLink="true">${post.url}</guid><description>${escapeHtml(post.description)}</description>${post.metadata.created ? `<pubDate>${new Date(`${post.metadata.created}T00:00:00+08:00`).toUTCString()}</pubDate>` : ''}</item>`).join('')}</channel></rss>`);
  const links = (items) => items.map((document) => `- [${document.title}](${document.url}): ${document.description}`).join('\n');
  return {
    'sitemap.xml': sitemap,
    'feed.xml': feed,
    'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`,
    'llms.txt': `# Zane Chee\n\n> Personal website and writing by Zane Chee, a software engineer working on computer use.\n\n## Pages\n\n${links(documents.filter((document) => document.kind !== 'article'))}\n\n## Articles\n\n${links(posts)}\n\n## Formats\n\n- [RSS feed](${site.url}/feed.xml)\n- [Sitemap](${site.url}/sitemap.xml)\n\nEach HTML page links to its Markdown equivalent with rel="alternate".\n`,
  };
}
