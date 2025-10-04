import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { UnifiedMarkdownEditor } from './UnifiedMarkdownEditor';

interface DynamicMarkdownPageProps {
  basePath: string; // e.g., "projects" or "experience"
}

export function DynamicMarkdownPage({ basePath }: DynamicMarkdownPageProps) {
  const params = useParams();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMarkdown = async () => {
      setLoading(true);

      try {
        // Build the file path based on params
        // e.g., params = { id: "1" } -> projects-1.md
        // e.g., params = { category: "web", id: "2" } -> projects-web-2.md
        const pathParts = Object.values(params).filter(Boolean);
        const fileName = pathParts.length > 0 
          ? `${basePath}-${pathParts.join('-')}.md`
          : `${basePath}.md`;

        // Dynamically import the markdown file
        const module = await import(`../${fileName}?raw`);
        setContent(module.default);
      } catch (err) {
        console.error(`Failed to load ${basePath} markdown:`, err);
        setContent(`# File Not Found\n\nCouldn't load the requested page.`);
      } finally {
        setLoading(false);
      }
    };

    loadMarkdown();
  }, [basePath, params]);

  if (loading) {
    return (
      <div className="w-full max-w-2xl lg:max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <p>Loading...</p>
      </div>
    );
  }

  // Create a unique key based on the full path
  const key = `${basePath}-${Object.values(params).join('-')}`;

  return <UnifiedMarkdownEditor key={key} initialContent={content} />;
}
