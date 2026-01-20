import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { Markdown } from 'tiptap-markdown';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { SearchBar } from '../layout/SearchBar';

interface TiptapEditorProps {
  initialContent: string;
  editable: boolean;
  onContentChange?: (markdown: string) => void;
  placeholder?: string;
  onSaveStatusChange?: (status: 'saved' | 'saving' | 'unsaved') => void;
}

export const TiptapEditor: React.FC<TiptapEditorProps> = ({
  initialContent,
  editable,
  onContentChange,
  placeholder = 'Start writing...',
  onSaveStatusChange,
}) => {
  const saveTimeoutRef = useRef<number | undefined>(undefined);
  const lastContentRef = useRef(initialContent);
  const [_, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showBackToTop, setShowBackToTop] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Link.configure({
        openOnClick: !editable,
        HTMLAttributes: {
          class: 'text-[#F6821F] underline hover:text-[#d96d1a] cursor-pointer transition-colors',
        },
      }),
      Image,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      Typography,
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: initialContent,
    editable,
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-[680px] mx-auto focus:outline-none px-4 py-8',
      },
    },
    onUpdate: ({ editor }) => {
      if (onContentChange) {
        const markdown = ((editor.storage as any).markdown as any).getMarkdown();

        // Check if content actually changed
        if (markdown !== lastContentRef.current) {
          setSaveStatus('unsaved');
          onSaveStatusChange?.('unsaved');

          // Clear existing timeout
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }

          // Set saving status and debounce save
          saveTimeoutRef.current = setTimeout(() => {
            setSaveStatus('saving');
            onSaveStatusChange?.('saving');
            onContentChange(markdown);
            lastContentRef.current = markdown;

            // After save completes, set to saved
            setTimeout(() => {
              setSaveStatus('saved');
              onSaveStatusChange?.('saved');
            }, 500);
          }, 2000);
        }
      }
    },
  });

  // Update editor when content changes externally
  useEffect(() => {
    if (editor && initialContent !== ((editor.storage as any).markdown as any).getMarkdown()) {
      editor.commands.setContent(initialContent);
      lastContentRef.current = initialContent;
    }
  }, [initialContent, editor]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  // Show back to top button when scrolled down
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!editor) {
    return null;
  }

  return (
    <div className="w-full min-h-screen bg-white relative flex items-center">
      {/* Centered Search Bar */}
      <div className="absolute top-0 left-0 right-0 pt-12 pb-8">
        <div className="max-w-2xl mx-auto px-4">
          <SearchBar centered />
        </div>
      </div>

      {/* Editor content - centered vertically */}
      <div className="w-full">
        <EditorContent editor={editor} />
      </div>

      {/* Back to top button */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 flex items-center gap-2 text-[#F6821F] hover:text-[#d96d1a] transition-colors duration-300 z-50 font-sohne-regular text-sm"
          aria-label="Back to top"
        >
          <span>Return to top</span>
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
