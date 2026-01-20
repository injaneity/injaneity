import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { TiptapEditor } from '@/components/editor/TiptapEditor';
import { AlertCircle } from 'lucide-react';

export const EditorPage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Determine section from pathname
  const pathname = location.pathname;
  const section = pathname.startsWith('/projects')
    ? 'projects'
    : pathname.startsWith('/experience')
    ? 'experience'
    : undefined;

  // Determine the content path
  // Use "index" as slug when slug is undefined (for /projects and /experience routes)
  const actualSlug = slug || 'index';
  const contentPath = section
    ? `src/content/${section}/${actualSlug}.md`
    : `src/content/${actualSlug}.md`;

  useEffect(() => {
    loadContent();
  }, [section, slug]);

  const loadContent = async () => {
    setLoading(true);
    setError(null);

    try {
      // Check localStorage first
      const storageKey = `page_${contentPath}`;
      const localContent = localStorage.getItem(storageKey);

      if (localContent) {
        // Use local edits if they exist
        setContent(localContent);
      } else {
        // Otherwise use default content based on section
        const defaultContent = section === 'projects'
          ? `# Projects\n\nThis is the ${actualSlug === 'index' ? 'main projects' : actualSlug} page.`
          : section === 'experience'
          ? `# Experience\n\nThis is the ${actualSlug === 'index' ? 'main experience' : actualSlug} page.`
          : `# ${actualSlug}\n\nStart writing...`;
        setContent(defaultContent);
      }
    } catch (err: any) {
      console.error('Error loading content:', err);
      setError('Failed to load page content');
    } finally {
      setLoading(false);
    }
  };

  const handleContentChange = async (newContent: string) => {
    // Save to localStorage (client-side only)
    const storageKey = `page_${contentPath}`;
    localStorage.setItem(storageKey, newContent);
    setContent(newContent);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-[#F6821F] mx-auto mb-4"></div>
          <p className="text-gray-600 font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white px-4">
        <div className="max-w-md w-full bg-red-50 border-2 border-red-200 rounded-md p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold text-red-900 mb-2">Error</h2>
              <p className="text-red-800 mb-4">{error}</p>
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2 bg-[#F6821F] text-white rounded-md hover:bg-[#d96d1a] transition-colors text-sm font-semibold"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TiptapEditor
      initialContent={content}
      editable={true}
      onContentChange={handleContentChange}
      placeholder="Start writing..."
    />
  );
};
