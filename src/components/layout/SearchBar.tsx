import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { usePagesStore } from '@/store/pagesStore';
import { useNavigate } from 'react-router-dom';

export const SearchBar: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const searchPages = usePagesStore((state) => state.searchPages);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const results = query.length > 0 ? searchPages(query) : [];

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (section: string, slug: string) => {
    setQuery('');
    setIsOpen(false);

    // Navigate to the appropriate route
    if (section === 'root') {
      if (slug === 'landing') {
        navigate('/');
      } else {
        navigate(`/${slug}`);
      }
    } else {
      navigate(`/${section}/${slug}`);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          placeholder="Search pages..."
          className="w-64 pl-9 pr-9 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
          {results.map((page) => (
            <button
              key={page.path}
              onMouseDown={() => handleSelect(page.section, page.slug)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
            >
              <div className="font-medium text-gray-900">{page.title}</div>
              <div className="text-sm text-gray-500">
                {page.section === 'root' ? '/' : `/${page.section}/`}{page.slug}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
