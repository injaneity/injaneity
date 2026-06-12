import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { ArticleView } from '@/components/reader/ArticleView';
import { loadMarkdownBySlug, type MarkdownArticleMetadata } from '@/lib/markdown';

export const ReaderPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [content, setContent] = useState('');
  const [metadata, setMetadata] = useState<MarkdownArticleMetadata>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const slug = location.pathname.split('/').filter(Boolean)[0] || '00-landing';

  const loadContent = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const document = await loadMarkdownBySlug(slug);
      if (document) {
        setContent(document.content);
        setMetadata(document.metadata);
        return;
      }
      setError('Page not found');
    } catch (err: unknown) {
      console.error('Error loading content:', err);
      setError('Failed to load page content');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 font-sohne-regular">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="max-w-md w-full border-2 border-gray-300 rounded-md p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-gray-700 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">{error}</h2>
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

  return <ArticleView content={content} metadata={metadata} />;
};
