import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { usePagesStore, type PageMetadata } from '@/store/pagesStore';
import { useNavigate } from 'react-router-dom';

interface PagesState {
  pages: PageMetadata[];
  searchPages: (query: string) => PageMetadata[];
}

// Collapsed corner control: a search icon that expands into an input on
// hover or click, with results opening upward from the bottom corner.
export const SearchBar: React.FC = () => {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const searchPages = usePagesStore((state: PagesState) => state.searchPages);
  const allPages = usePagesStore((state: PagesState) => state.pages);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Show all pages when search is open, or filtered results when there's a query
  const results = query.length > 0 ? searchPages(query) : allPages;
  const showResults = focused && results.length > 0;
  const isOpen = expanded || focused || query.length > 0;

  // Scroll affordance: fade edges when there are more results off-screen
  const listRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateScrollHints = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 2);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);

  useEffect(() => {
    if (showResults) updateScrollHints();
  }, [showResults, results.length, updateScrollHints]);

  const handleSelect = (slug: string) => {
    setQuery('');
    setFocused(false);
    setExpanded(false);
    inputRef.current?.blur();

    // Navigate to the appropriate route - all files are in root of content folder
    if (slug === '00-landing') {
      navigate('/');
    } else {
      navigate(`/${slug}`);
    }
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {showResults && (
        /* left-7 aligns result text with the input placeholder (icon + gap) */
        <div className="absolute bottom-full left-7 mb-3 w-56 z-50">
          {canScrollUp && (
            <div className="pointer-events-none absolute top-0 left-0 right-0 h-10 z-10 bg-gradient-to-b from-[#FAF7F0] to-transparent" />
          )}
          {/* ~2.5 rows visible so the cut-off row signals there's more to scroll */}
          <div
            ref={listRef}
            onScroll={updateScrollHints}
            className="search-results max-h-[140px] overflow-y-auto"
          >
            {results.map((page: PageMetadata) => (
              <button
                key={page.path}
                onMouseDown={() => handleSelect(page.slug)}
                className="w-full py-2.5 text-left group/result font-sohne-regular"
              >
                <div className="font-semibold text-gray-900 group-hover/result:text-[#F6821F] transition-colors text-sm">{page.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">{page.slug}.md</div>
              </button>
            ))}
          </div>
          {canScrollDown && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 z-10 bg-gradient-to-t from-[#FAF7F0] to-transparent" />
          )}
        </div>
      )}

      <div
        className={`flex items-center gap-2 text-[#7c7c7c] transition-colors duration-300 ${isOpen ? 'text-[#F6821F]' : 'hover:text-[#F6821F]'}`}
      >
        <button
          onClick={() => {
            setExpanded(true);
            inputRef.current?.focus();
          }}
          className="flex-shrink-0 flex items-center justify-center"
          aria-label="Search pages"
        >
          <Search className="w-5 h-5" />
        </button>

        <div
          className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-w-xs opacity-100' : 'max-w-0 opacity-0'}`}
        >
          <div className="relative flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 200)}
              placeholder="Search pages..."
              className="w-48 pr-7 py-1 text-sm font-sohne-regular text-[#1F1F1F] placeholder-gray-400 bg-transparent border-b-2 border-gray-300 focus:border-[#F6821F] focus:outline-none transition-colors"
            />
            {query && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-1 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
