import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { usePagesStore, type PageMetadata } from '@/store/pagesStore';
import { useNavigate } from 'react-router-dom';

interface PagesState {
  pages: PageMetadata[];
  searchPages: (query: string) => PageMetadata[];
}

interface SearchBarProps {
  centered?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ centered = false }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const searchPages = usePagesStore((state: PagesState) => state.searchPages);
  const allPages = usePagesStore((state: PagesState) => state.pages);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Show all pages when search is open, or filtered results when there's a query
  const results = query.length > 0 ? searchPages(query) : allPages;

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (slug: string) => {
    setQuery('');
    setIsOpen(false);

    // Navigate to the appropriate route - all files are in root of content folder
    if (slug === 'landing') {
      navigate('/');
    } else {
      navigate(`/${slug}`);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${centered ? 'w-5 h-5' : 'w-4 h-4'} text-gray-400`} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          placeholder="Search pages..."
          className={`${centered ? 'w-full pl-10 pr-10 py-3 text-base' : 'w-64 pl-9 pr-9 py-2 border-b-2 border-gray-300 focus:border-[#F6821F]'} focus:outline-none transition-all bg-transparent`}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className={centered ? 'w-5 h-5' : 'w-4 h-4'} />
          </button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-white border-2 border-gray-200 shadow-lg max-h-96 overflow-y-auto z-50">
          {results.map((page: PageMetadata) => (
            <button
              key={page.path}
              onMouseDown={() => handleSelect(page.slug)}
              className="w-full px-4 py-4 text-left hover:bg-[#FFF5ED] transition-colors border-b border-gray-100 last:border-0 group"
            >
              <div className="flex items-start justify-between">
                <div className="flex flex-col">
                  <div className="font-semibold text-gray-900 group-hover:text-[#F6821F] transition-colors">{page.title}</div>
                  <div className="text-xs text-gray-500 mt-1">{page.slug}.md</div>
                </div>
                <div className="text-sm text-gray-400">{page.wordCount} words</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
