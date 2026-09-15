import { parseFrontmatter, renderMarkdown } from '../lib/markdown.mjs';

self.onmessage = async ({ data: { revision, source } }) => {
  try {
    const { content, metadata } = parseFrontmatter(source);
    const html = await renderMarkdown(content, metadata, { safe: true });
    const words = content.trim().split(/\s+/u).filter(Boolean).length;
    self.postMessage({ revision, html, words });
  } catch {
    self.postMessage({ revision, error: 'preview could not render this draft. your text is unchanged.' });
  }
};
