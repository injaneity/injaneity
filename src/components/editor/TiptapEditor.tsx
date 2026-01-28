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
import { createLowlight, common } from 'lowlight';
import { CodeBlockWithUI } from './extensions/CodeBlockWithUI';
import { LinkIconExtension } from './extensions/LinkIconExtension';
import { TextSelection } from '@tiptap/pm/state';

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

  // Create lowlight instance with common languages
  const lowlight = createLowlight(common);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        link: false,
        // Disable the default code block from StarterKit
        codeBlock: false,
      }),
      // Add CodeBlockLowlight with custom UI
      CodeBlockWithUI.configure({
        lowlight,
        defaultLanguage: 'plaintext',
        HTMLAttributes: {
          class: 'hljs',
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
        linkify: true,
      }),
      // Link extension must be last to avoid duplicate registration warning
      Link.extend({
        addInputRules() {
          return [
            new InputRule({
              find: /\[([^\]]+)\]\(([^)]+)\)\s$/,
              handler: ({ state, range, match }) => {
                try {
                  const { tr } = state;
                  const start = range.from;
                  const end = range.to;
                  const linkText = match[1];
                  const linkUrl = match[2];

                  if (linkText && linkUrl) {
                    const linkEndPos = start + linkText.length;

                    // Replace the markdown syntax with the link text and mark it
                    tr.replaceWith(start, end, state.schema.text(linkText + ' '))
                      .addMark(
                        start,
                        linkEndPos,
                        state.schema.marks.link.create({ href: linkUrl })
                      );

                    // Position cursor after the link and space
                    tr.setSelection(TextSelection.near(tr.doc.resolve(linkEndPos + 1)));
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
      // Add link icon extension
      LinkIconExtension,
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

      // Handle link icon clicks
      if (target.classList.contains('link-icon')) {
        e.preventDefault();
        e.stopPropagation();

        const anchor = target.previousElementSibling as HTMLAnchorElement;
        if (!anchor || anchor.tagName !== 'A') return;

        // Find the link in the editor and select it
        try {
          const pos = editor.view.posAtDOM(anchor, 0);
          const linkText = anchor.textContent || '';

          editor.chain()
            .focus()
            .setTextSelection({ from: pos, to: pos + linkText.length })
            .run();
        } catch (error) {
          console.error('Error selecting link:', error);
        }
        return;
      }

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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') {
        const { state } = editor;
        const { selection } = state;
        const pos = selection.from;

        // Only handle when nothing is selected
        if (!selection.empty) return;
        if (pos <= 0) return;

        try {
          const $current = state.doc.resolve(pos);
          const currentMarks = $current.marks();

          // CASE 1: Check if position right before cursor (pos-1) has a link mark
          if (pos > 0) {
            const $prev = state.doc.resolve(pos - 1);
            const prevMarks = $prev.marks();
            let linkMark = prevMarks.find(m => m.type.name === 'link');

            // CASE 2: If pos-1 has no link mark, check if it's a space after a link
            if (!linkMark && pos > 1) {
              const charAtPrevPos = state.doc.textBetween(pos - 1, pos);
              if (charAtPrevPos === ' ') {
                const $twoBack = state.doc.resolve(pos - 2);
                const twoBackMarks = $twoBack.marks();
                linkMark = twoBackMarks.find(m => m.type.name === 'link');
              }
            }

            if (linkMark) {
              const currentHasLink = currentMarks.some(m =>
                m.type.name === 'link' && m.attrs.href === linkMark.attrs.href
              );

              if (!currentHasLink) {
                // Find the start of the link
                let linkStart = pos - 1;
                for (let i = pos - 2; i >= 0; i--) {
                  const $pos = state.doc.resolve(i);
                  const marks = $pos.marks();
                  const hasSameLinkMark = marks.some(m =>
                    m.type.name === 'link' && m.attrs.href === linkMark.attrs.href
                  );
                  if (!hasSameLinkMark) {
                    linkStart = i + 1;
                    break;
                  }
                  if (i === 0) {
                    linkStart = 0;
                  }
                }

                // Find the actual end of the link (excluding trailing space if any)
                let linkEnd = linkStart;
                for (let i = linkStart; i < pos; i++) {
                  const $pos = state.doc.resolve(i);
                  const marks = $pos.marks();
                  const hasSameLinkMark = marks.some(m =>
                    m.type.name === 'link' && m.attrs.href === linkMark.attrs.href
                  );
                  if (hasSameLinkMark) {
                    linkEnd = i + 1;
                  }
                }

                // Check if there's a space after the link that should also be deleted
                let deleteEnd = pos;
                const charAtPos = state.doc.textBetween(pos - 1, pos);
                if (charAtPos === ' ') {
                  deleteEnd = pos;
                } else if (pos < state.doc.content.size) {
                  const charAfter = state.doc.textBetween(pos, pos + 1);
                  if (charAfter === ' ') {
                    deleteEnd = pos + 1;
                  }
                }

                const linkText = state.doc.textBetween(linkStart, linkEnd).trim();
                const linkHref = linkMark.attrs.href;
                const markdownText = `[${linkText}](${linkHref})`;

                e.preventDefault();
                e.stopPropagation();

                // Use transaction directly to insert plain text without processing
                const { tr } = editor.state;
                tr.delete(linkStart, deleteEnd);
                tr.insertText(markdownText, linkStart);

                editor.view.dispatch(tr);
                editor.commands.focus();

                return;
              }
            }
          }
        } catch (err) {
          console.error('Error in backspace handler:', err);
        }
      }
    };

    dom.addEventListener('click', handleClick);
    dom.addEventListener('keydown', handleKeyDown);
    return () => {
      dom.removeEventListener('click', handleClick);
      dom.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timeoutId);
    };
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [editor, editable, navigate]);

  // Handle link attributes (target, rel) for internal vs external links
  useEffect(() => {
    if (!editor || !editor.view) return;

    const timeoutId = setTimeout(() => {
      if (!editor || !editor.view) return;

      const viewDom = (editor.view as any).dom;
      if (!viewDom || !(viewDom instanceof HTMLElement)) return;

      const dom = viewDom as HTMLElement;

      const processLinkAttributes = () => {
        const anchors = Array.from(dom.querySelectorAll('a')) as HTMLAnchorElement[];

        anchors.forEach((anchor) => {
          const href = anchor.getAttribute('href') || '';
          const hasProtocol = /^https?:\/\//i.test(href);
          const looksLikeDomain = /^[a-z0-9.-]+\.[a-z]{2,}/i.test(href);
          const isExternal = hasProtocol || looksLikeDomain;

          if (!isExternal) {
            anchor.removeAttribute('target');
            anchor.removeAttribute('rel');
          } else {
            anchor.setAttribute('target', '_blank');
            anchor.setAttribute('rel', 'noopener noreferrer nofollow');

            if (looksLikeDomain && !hasProtocol) {
              anchor.setAttribute('href', `https://${href}`);
            }
          }
        });
      };

      processLinkAttributes();

      const observer = new MutationObserver(() => {
        requestAnimationFrame(processLinkAttributes);
      });

      observer.observe(dom, {
        childList: true,
        subtree: true,
        attributes: false,
      });

      const updateHandler = () => {
        requestAnimationFrame(processLinkAttributes);
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
