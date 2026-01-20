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

  // Determine the actual slug from the pathname
  const pathname = location.pathname;
  const actualSlug = slug || pathname.split('/').filter(Boolean)[0] || 'landing';
  const contentPath = `src/content/${actualSlug}.md`;

  useEffect(() => {
    loadContent();
  }, [actualSlug]);

  const loadContent = async () => {
    setLoading(true);
    setError(null);

    try {
      // Always load fresh from markdown file
      try {
        const module = await import(`../../content/${actualSlug}.md?raw`);
        setContent(module.default);
      } catch (importError) {
        // If file doesn't exist, use default content
        const defaultContent = `# ${actualSlug.charAt(0).toUpperCase() + actualSlug.slice(1)}\n\nStart writing...`;
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
    // Just update state, don't persist to localStorage
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
