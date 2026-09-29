export type Metadata = { title?: string; created?: string; modified?: string; kind?: string; [key: string]: string | undefined };
export function parseFrontmatter(source: string): { content: string; metadata: Metadata };
export function renderMarkdown(content: string, metadata?: Metadata, options?: { safe?: boolean; editable?: boolean }): Promise<string>;
