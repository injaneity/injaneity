import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { ArticleView } from '@/components/reader/ArticleView';
import { loadMarkdownBySlug } from '@/lib/markdown';

export const ReaderPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const slug = location.pathname.split('/').filter(Boolean)[0] || '00-landing';
  const document = loadMarkdownBySlug(slug);

  if (!document) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="max-w-md w-full border-2 border-gray-300 rounded-md p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-gray-700 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Page not found</h2>
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

  return <ArticleView content={document.content} metadata={document.metadata} />;
};
