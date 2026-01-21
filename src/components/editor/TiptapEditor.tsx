import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { Markdown } from 'tiptap-markdown';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import { SearchBar } from '../layout/SearchBar';
import { InputRule } from '@tiptap/core';
import { ErrorBoundary } from '../ErrorBoundary';

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
        link: false,
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
        linkify: true,
      }),
      // Link extension must be last to avoid duplicate registration warning
      Link.extend({
        addInputRules() {
          return [
            new InputRule({
              find: /\[([^\]]+)\]\(([^)]+)\)$/,
              handler: ({ state, range, match }) => {
                try {
                  const { tr } = state;
                  const start = range.from;
                  const end = range.to;
                  const linkText = match[1];
                  const linkUrl = match[2];

                  if (linkText && linkUrl) {
                    tr.replaceWith(start, end, state.schema.text(linkText))
                      .addMark(
                        start,
                        start + linkText.length,
                        state.schema.marks.link.create({ href: linkUrl })
                      );
                  }
                } catch (error) {
                  console.error('Link input rule error:', error);
                }
              },
            }),
          ];
        },
      }).configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-[#F6821F] cursor-pointer transition-colors',
        },
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
          lastContentRef.current = markdown;
          setSaveStatus('unsaved');
          onSaveStatusChange?.('unsaved');

          // Clear existing timeout
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }

          // Debounce the callback to parent component
          saveTimeoutRef.current = setTimeout(() => {
            setSaveStatus('saving');
            onSaveStatusChange?.('saving');
            onContentChange(markdown);

            // After callback completes, set to saved
            setTimeout(() => {
              setSaveStatus('saved');
              onSaveStatusChange?.('saved');
            }, 100);
          }, 1000);
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

  // Intercept clicks on links inside the editor and use SPA navigation
  const navigate = useNavigate();
  useEffect(() => {
    if (!editor || !editor.view) return;

    // Delay access to ensure DOM is fully mounted
    const timeoutId = setTimeout(() => {
      // Double-check editor and view still exist
      if (!editor || !editor.view) return;

      // Ensure the view is fully mounted with a DOM element
      const viewDom = (editor.view as any).dom;
      if (!viewDom || !(viewDom instanceof HTMLElement)) return;
      
      const dom = viewDom as HTMLElement;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;

      let href = anchor.getAttribute('href');
      if (!href) return;

      // Check if link is external (has protocol or looks like a domain)
      const hasProtocol = /^https?:\/\//i.test(href);
      const isSpecial = href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:');
      const looksLikeDomain = /^[a-z0-9.-]+\.[a-z]{2,}/i.test(href);
      const isExternal = hasProtocol || looksLikeDomain;
      
      // For internal links (starts with / or ./ or ../), navigate via React Router
      if (!isExternal && !isSpecial) {
        e.preventDefault();
        e.stopPropagation();
        // Normalize relative paths for React Router
        const normalizedHref = href.startsWith('./') ? href.slice(1) : href;
        navigate(normalizedHref);
        return;
      }
      
      // For external links without protocol, add https:// and open in new tab
      if (isExternal && !isSpecial) {
        e.preventDefault();
        e.stopPropagation();
        const fullUrl = hasProtocol ? href : `https://${href}`;
        window.open(fullUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      
      // Special links (mailto, tel, hash) work normally
    };

    dom.addEventListener('click', handleClick);
    return () => {
      dom.removeEventListener('click', handleClick);
      clearTimeout(timeoutId);
    };
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [editor, editable, navigate]);

  // Mount icons and fix link attributes
  useEffect(() => {
    if (!editor || !editor.view) return;

    // Delay access to ensure DOM is fully mounted
    const timeoutId = setTimeout(() => {
      // Double-check editor and view still exist
      if (!editor || !editor.view) return;

      // Ensure the view is fully mounted with a DOM element
      const viewDom = (editor.view as any).dom;
      if (!viewDom || !(viewDom instanceof HTMLElement)) return;
      
      const dom = viewDom as HTMLElement;

    const processLinks = () => {
      const anchors = Array.from(dom.querySelectorAll('a')) as HTMLAnchorElement[];
      
      anchors.forEach((anchor) => {
        const href = anchor.getAttribute('href') || '';
        const hasProtocol = /^https?:\/\//i.test(href);
        const looksLikeDomain = /^[a-z0-9.-]+\.[a-z]{2,}/i.test(href);
        const isExternal = hasProtocol || looksLikeDomain;
        
        // Strip target and rel from internal links
        if (!isExternal) {
          anchor.removeAttribute('target');
          anchor.removeAttribute('rel');
        } else {
          // Ensure external links have proper attributes
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener noreferrer nofollow');
          
          // Add https:// protocol if missing for domain-only links
          if (looksLikeDomain && !hasProtocol) {
            anchor.setAttribute('href', `https://${href}`);
          }
        }
        
        // Mount icon if not already mounted
        if (!anchor.dataset.iconMounted) {
          // Remove any existing icon spans first
          const existingIcons = anchor.querySelectorAll('.link-icon-root');
          existingIcons.forEach(icon => icon.remove());
          
          // Create and append icon using CSS content instead of React
          anchor.dataset.iconMounted = 'true';
        }
      });
    };

    // Process immediately and after any DOM changes
    processLinks();
    
    // Use MutationObserver to catch any DOM changes
    const observer = new MutationObserver(() => {
      requestAnimationFrame(processLinks);
    });
    
    observer.observe(dom, {
      childList: true,
      subtree: true,
      attributes: false,
    });

    // Also process on editor updates
    const updateHandler = () => {
      requestAnimationFrame(processLinks);
    };

    editor.on('update', updateHandler);

    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
      try {
        editor.off('update', updateHandler);
      } catch (e) {
        // ignore
      }
    };
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [editor]);

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
    <ErrorBoundary>
      <div className="w-full min-h-screen bg-white flex flex-col overflow-hidden">
        {/* Centered Search Bar - Fixed at top */}
        <div className="flex-shrink-0 pt-12 pb-8 bg-white z-10">
          <div className="max-w-2xl mx-auto px-4">
            <SearchBar centered />
          </div>
        </div>

        {/* Editor content - Scrollable area */}
        <div className="flex-1 overflow-y-auto px-2 sm:px-4 md:px-8">
          <div className="w-full max-w-[680px] mx-auto">
            <EditorContent editor={editor} />
          </div>
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
    </ErrorBoundary>
  );
};
