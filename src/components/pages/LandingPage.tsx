import { useState, useEffect } from 'react';
import { TiptapEditor } from '@/components/editor/TiptapEditor';
import { loadMarkdownBySlug, type MarkdownArticleMetadata } from '@/lib/markdown';

export const LandingPage: React.FC = () => {
  const [content, setContent] = useState('');
  const [metadata, setMetadata] = useState<MarkdownArticleMetadata>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    setLoading(true);
    try {
      const document = await loadMarkdownBySlug('00-landing');
      if (document) {
        setContent(document.content);
        setMetadata(document.metadata);
        return;
      }

      setMetadata({});
      setContent(`This page seems to be empty...`);
    } catch (error: unknown) {
      console.error('Error loading content:', error);
      // Fallback default
      setContent(`This page seems to be empty...`);
      setMetadata({});
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

  if (!content && !loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <p className="text-gray-600 font-semibold">No content available.</p>
        </div>
      </div>
    );
  }

  return (
    <TiptapEditor
      initialContent={content}
      articleMetadata={metadata}
      editable={true}
      onContentChange={handleContentChange}
      placeholder="Start writing your landing page..."
    />
  );
};
