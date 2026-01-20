import { create } from 'zustand';

export interface PageMetadata {
  title: string;
  slug: string;
  path: string;
  section: 'projects' | 'experience' | 'root';
  wordCount: number;
}

interface PagesState {
  pages: PageMetadata[];
  getPageBySlug: (slug: string, section?: string) => PageMetadata | undefined;
  searchPages: (query: string) => PageMetadata[];
}

// Dynamically discover all .md files in the content folder using Vite's glob import
const contentFiles = import.meta.glob('/src/content/**/*.md', { eager: true, as: 'raw' });

// Generate pages list from discovered files
const staticPages: PageMetadata[] = Object.entries(contentFiles).map(([path, content]) => {
  // Extract filename without extension
  const filename = path.split('/').pop()?.replace('.md', '') || '';
  
  // Capitalize first letter for title
  const title = filename.charAt(0).toUpperCase() + filename.slice(1);
  
  // Count words in content
  const wordCount = (content as string).split(/\s+/).filter(word => word.length > 0).length;
  
  return {
    title,
    slug: filename,
    path: path.replace('/src/', 'src/'),
    section: 'root' as const,
    wordCount,
  };
});

export const usePagesStore = create<PagesState>((_, get) => ({
  pages: staticPages,

  getPageBySlug: (slug: string, section?: string) => {
    const { pages } = get();
    return pages.find(
      (page: PageMetadata) =>
        page.slug === slug &&
        (!section || page.section === section)
    );
  },

  searchPages: (query: string) => {
    const { pages } = get();
    const lowerQuery = query.toLowerCase();

    return pages.filter(
      (page: PageMetadata) =>
        page.title.toLowerCase().includes(lowerQuery) ||
        page.slug.toLowerCase().includes(lowerQuery) ||
        page.path.toLowerCase().includes(lowerQuery)
    );
  },
}));
