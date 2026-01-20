import { create } from 'zustand';
import { githubService, type PageMetadata } from '@/services/github/GitHubService';

interface PagesState {
  pages: PageMetadata[];
  loading: boolean;
  lastFetch: number | null;
  error: string | null;
  fetchPages: (force?: boolean) => Promise<void>;
  getPageBySlug: (slug: string, section?: string) => PageMetadata | undefined;
  searchPages: (query: string) => PageMetadata[];
}

const CACHE_TTL = 60000; // 1 minute

export const usePagesStore = create<PagesState>((set, get) => ({
  pages: [],
  loading: false,
  lastFetch: null,
  error: null,

  fetchPages: async (force = false) => {
    const { lastFetch, loading } = get();

    // Don't fetch if already loading
    if (loading) return;

    // Check cache TTL
    if (!force && lastFetch && Date.now() - lastFetch < CACHE_TTL) {
      return;
    }

    set({ loading: true, error: null });

    try {
      const pages = await githubService.listPages();
      set({
        pages,
        loading: false,
        lastFetch: Date.now(),
        error: null,
      });
    } catch (error: any) {
      set({
        loading: false,
        error: error.message || 'Failed to fetch pages',
      });
    }
  },

  getPageBySlug: (slug: string, section?: string) => {
    const { pages } = get();
    return pages.find(
      (page) =>
        page.slug === slug &&
        (!section || page.section === section)
    );
  },

  searchPages: (query: string) => {
    const { pages } = get();
    const lowerQuery = query.toLowerCase();

    return pages.filter(
      (page) =>
        page.title.toLowerCase().includes(lowerQuery) ||
        page.slug.toLowerCase().includes(lowerQuery) ||
        page.path.toLowerCase().includes(lowerQuery)
    );
  },
}));
