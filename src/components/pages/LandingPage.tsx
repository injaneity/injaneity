import { useState, useEffect } from 'react';
import { TiptapEditor } from '@/components/editor/TiptapEditor';

const STORAGE_KEY = 'landing_page';

export const LandingPage: React.FC = () => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    setLoading(true);
    try {
      // Check localStorage for saved content
      const localContent = localStorage.getItem(STORAGE_KEY);
      
      if (localContent) {
        setContent(localContent);
      } else {
        // Use default content
        setContent(`# Hi! I'm Zane Chee.\n\n## About Me\n\nAs a full-time software engineer, I've learned that my true strength lies in designing software, not landscape sketches. From winning hackathons to building impactful systems, I thrive on solving tough problems.\n\n> In the spirit of art, my portfolio is fully editable with markdown. Try it!`);
      }
    } catch (error: any) {
      console.error('Error loading content:', error);
      setContent(`# Hi! I'm Zane Chee.\n\n## About Me\n\nAs a full-time software engineer, I've learned that my true strength lies in designing software, not landscape sketches. From winning hackathons to building impactful systems, I thrive on solving tough problems.\n\n> In the spirit of art, my portfolio is fully editable with markdown. Try it!`);
    } finally {
      setLoading(false);
    }
  };

  const handleContentChange = async (newContent: string) => {
    // Save to localStorage (client-side only)
    localStorage.setItem(STORAGE_KEY, newContent);
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

  return (
    <TiptapEditor
      initialContent={content}
      editable={true}
      onContentChange={handleContentChange}
      placeholder="Start writing your landing page..."
    />
  );
};
