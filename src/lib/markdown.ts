export interface MarkdownArticleMetadata {
  title?: string;
  created?: string;
  modified?: string;
}

export interface ParsedMarkdownDocument {
  content: string;
  metadata: MarkdownArticleMetadata;
}

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

function normalizeFrontmatterKey(key: string): string {
  return key.trim().toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseFrontmatterBlock(frontmatterBlock: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  const lines = frontmatterBlock.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;

    const rawKey = line.slice(0, separatorIndex);
    const rawValue = line.slice(separatorIndex + 1);
    const key = normalizeFrontmatterKey(rawKey);
    const value = stripWrappingQuotes(rawValue);

    if (!key || !value) continue;
    parsed[key] = value;
  }

  return parsed;
}

function firstPresentValue(source: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (value) return value;
  }
  return undefined;
}

export function parseMarkdownDocument(rawMarkdown: string): ParsedMarkdownDocument {
  const match = rawMarkdown.match(FRONTMATTER_REGEX);
  if (!match) {
    return {
      content: rawMarkdown,
      metadata: {},
    };
  }

  const frontmatter = parseFrontmatterBlock(match[1]);
  const content = rawMarkdown.replace(FRONTMATTER_REGEX, '');

  return {
    content,
    metadata: {
      title: frontmatter.title,
      created: firstPresentValue(frontmatter, ['created', 'created_at', 'date', 'published']),
      modified: firstPresentValue(frontmatter, ['modified', 'updated', 'updated_at', 'last_modified']),
    },
  };
}

export function serializeMarkdownDocument(content: string, metadata?: MarkdownArticleMetadata): string {
  if (!metadata) return content;

  const frontmatterLines = [
    metadata.title ? `title: ${metadata.title}` : null,
    metadata.created ? `created: ${metadata.created}` : null,
    metadata.modified ? `modified: ${metadata.modified}` : null,
  ].filter(Boolean) as string[];

  if (frontmatterLines.length === 0) return content;

  return `---\n${frontmatterLines.join('\n')}\n---\n\n${content.replace(/^\n+/, '')}`;
}

function parseDateValue(rawValue: string): Date | null {
  const isoDateMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatArticleDate(rawValue?: string): string | null {
  if (!rawValue) return null;

  const parsedDate = parseDateValue(rawValue);
  if (!parsedDate) return rawValue;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsedDate);
}

export async function loadMarkdownBySlug(slug: string): Promise<ParsedMarkdownDocument | null> {
  try {
    const module = await import(`../content/${slug}.md?raw`);
    return parseMarkdownDocument(module.default);
  } catch {
    return null;
  }
}
