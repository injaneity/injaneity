import { Settings, Search, Plus } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePagesStore } from '@/store/pagesStore';
import { CreatePageModal } from '@/components/modals/CreatePageModal';
import toast from 'react-hot-toast';

interface FloatingActionBarProps {
  saveStatus?: 'saved' | 'saving' | 'unsaved';
  demoMode?: boolean;
}

export const FloatingActionBar: React.FC<FloatingActionBarProps> = () => {
  const { isAuthenticated, login, logout } = useAuth();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createPageModalOpen, setCreatePageModalOpen] = useState(false);
  const [patInput, setPatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const searchPages = usePagesStore((state) => state.searchPages);
  const fetchPages = usePagesStore((state) => state.fetchPages);
  const allPages = usePagesStore((state) => state.pages);
  const pagesError = usePagesStore((state) => state.error);
  const pagesLoading = usePagesStore((state) => state.loading);

  // Show all pages when search is open with no query, otherwise show filtered results
  const searchResults = searchQuery.length > 0 ? searchPages(searchQuery) : allPages;

  // Fetch pages on mount (available for both guests and admin)
  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  // Show action bar on scroll down and lock it at the top
  useEffect(() => {
    const handleScroll = () => {
      // Show action bar after scrolling down 150px and keep it visible
      if (window.scrollY > 150) {
        setIsVisible(true);
      }
      // Don't hide it when scrolling back up - once visible, stay visible
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close search on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSettingsClick = () => {
    setSettingsOpen(!settingsOpen);
  };

  const handlePATSubmit = async () => {
    if (!patInput.trim()) return;

    setLoading(true);
    const result = await login(patInput);
    setLoading(false);

    if (result.success) {
      toast.success('Logged in successfully!');
      setSettingsOpen(false);
      setPatInput('');
    } else {
      toast.error(result.error || 'Login failed');
    }
  };

  const handleLogout = () => {
    logout();
    setSettingsOpen(false);
    toast.success('Logged out');
  };

  const handleSearchSelect = (section: string, slug: string) => {
    // Navigate using React Router - automatically adds to browser history
    if (section === 'root') {
      if (slug === 'landing') {
        navigate('/');
      } else {
        navigate(`/${slug}`);
      }
    } else {
      navigate(`/${section}/${slug}`);
    }

    // Clear search
    setSearchQuery('');
    setSearchOpen(false);
  };

  return (
    <>
      {/* Action Bar - locked at top when visible with white background */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
        }`}
      >
        <div className="bg-white border-b border-gray-200 py-3">
          <div className="flex items-center justify-center gap-3">
        {/* Status: Guest or Admin */}
        <span className={`text-sm font-sohne-regular ${isAuthenticated ? 'text-[#F38020]' : 'text-gray-500'}`}>
          {isAuthenticated ? 'Admin' : 'Guest'}
        </span>

        {/* Divider */}
        <div className="w-px h-4 bg-gray-300" />

        {/* Search bar - with dropdown results */}
        <div className="relative" ref={searchRef}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search..."
            className="pl-8 pr-3 py-1.5 text-sm bg-white border border-gray-200 rounded focus:outline-none focus:border-gray-300 font-sohne-regular w-48"
          />

          {/* Search results dropdown */}
          {searchOpen && (
            <div className="absolute top-full mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto z-[70]">
              {pagesLoading ? (
                <div className="px-4 py-3 text-sm text-gray-500 font-sohne-regular">
                  Loading pages...
                </div>
              ) : pagesError ? (
                <div className="px-4 py-3 text-sm text-red-600 font-sohne-regular">
                  {isAuthenticated
                    ? 'Failed to load pages'
                    : 'Login to search pages (repo may be private)'}
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((page) => (
                  <button
                    key={page.path}
                    onClick={() => handleSearchSelect(page.section, page.slug)}
                    className="w-full px-4 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
                  >
                    <div className="font-sohne-medium text-sm text-gray-900">{page.title}</div>
                    <div className="font-sohne-regular text-xs text-gray-500 mt-0.5">
                      {page.section === 'root' ? '/' : `/${page.section}/`}{page.slug}
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-gray-500 font-sohne-regular">
                  {searchQuery ? 'No pages found' : 'No pages available'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-gray-300" />

        {/* Create button - only visible when authenticated */}
        {isAuthenticated && (
          <>
            <button
              onClick={() => setCreatePageModalOpen(true)}
              className="p-1.5 rounded bg-[#F38020] hover:bg-[#d96d1a] transition-colors"
              title="Create Page"
            >
              <Plus className="w-4 h-4 text-white" />
            </button>

            {/* Divider */}
            <div className="w-px h-4 bg-gray-300" />
          </>
        )}

        {/* Settings button */}
        <button
          onClick={handleSettingsClick}
          className="p-1.5 rounded hover:bg-gray-100 transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4 text-gray-700" />
        </button>
          </div>
        </div>
      </div>

      {/* Settings dropdown with PAT input */}
      {settingsOpen && isVisible && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setSettingsOpen(false)} />
          <div className="fixed top-16 left-1/2 -translate-x-1/2 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-[60] overflow-hidden">
            <div className="p-4">
              {!isAuthenticated ? (
                <>
                  <h3 className="text-sm font-sohne-medium text-gray-900 mb-3">GitHub PAT</h3>
                  <input
                    type="password"
                    value={patInput}
                    onChange={(e) => setPatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePATSubmit()}
                    placeholder="ghp_xxxxxxxxxxxx"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F38020] font-sohne-regular text-sm mb-3"
                    autoFocus
                  />
                  <button
                    onClick={handlePATSubmit}
                    disabled={loading || !patInput.trim()}
                    className="w-full px-4 py-2 bg-[#F38020] text-white rounded-lg hover:bg-[#d96d1a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-sohne-regular text-sm"
                  >
                    {loading ? 'Logging in...' : 'Login'}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-sohne-regular text-sm"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Create Page Modal */}
      <CreatePageModal
        isOpen={createPageModalOpen}
        onClose={() => setCreatePageModalOpen(false)}
      />
    </>
  );
};
