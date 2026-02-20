import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { Markdown } from '@tiptap/markdown';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowUp, Code, ArrowDownToLine } from 'lucide-react';
import { SearchBar } from '../layout/SearchBar';
import { InputRule, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ErrorBoundary } from '../ErrorBoundary';
import { createLowlight, common } from 'lowlight';
import { CodeBlockWithUI } from './extensions/CodeBlockWithUI';
import { LinkIconExtension } from './extensions/LinkIconExtension';
import { ImageWithCaption } from './extensions/ImageWithCaption';
import { ColoredText } from './extensions/ColoredText';
import { TextSelection } from '@tiptap/pm/state';
import { formatArticleDate, serializeMarkdownDocument, type MarkdownArticleMetadata } from '@/lib/markdown';

interface TiptapEditorProps {
  initialContent: string;
  articleMetadata?: MarkdownArticleMetadata;
  editable: boolean;
  onContentChange?: (markdown: string) => void;
  placeholder?: string;
  onSaveStatusChange?: (status: 'saved' | 'saving' | 'unsaved') => void;
}

interface MarkdownSerializerMark {
  attrs: {
    href?: string;
    isDownload?: boolean;
  };
}

interface MarkdownLinkToken {
  attrGet: (name: string) => string | null;
}

export const TiptapEditor: React.FC<TiptapEditorProps> = ({
  initialContent,
  articleMetadata,
  editable,
  onContentChange,
  placeholder = 'Start writing...',
  onSaveStatusChange,
}) => {
  const saveTimeoutRef = useRef<number | undefined>(undefined);
  const lastContentRef = useRef(initialContent);
  const [, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showBackToTop, setShowBackToTop] = useState(false);
  const imageConversionInProgress = useRef(false);

  // Create lowlight instance with common languages
  const lowlight = useMemo(() => createLowlight(common), []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        link: false,
        codeBlock: false,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: 'task-item',
        },
      }),
      CodeBlockWithUI.configure({
        lowlight,
        defaultLanguage: 'plaintext',
        HTMLAttributes: {
          class: 'hljs',
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      Typography,
      TextStyle,
      Color,
      ColoredText,
      Markdown.extend({
        addProseMirrorPlugins() {
          return [
            ...(this.parent?.() || []),
            new Plugin({
              key: new PluginKey('markdownDownloadLinkParser'),
              appendTransaction: (transactions, _oldState, newState) => {
                // Only run when content changes
                const docChanged = transactions.some(tr => tr.docChanged);
                if (!docChanged) return null;

                // Check if this was triggered by setContent (initial markdown load)
                const isSetContent = transactions.some(tr => tr.getMeta('addToHistory') === false);
                if (!isSetContent) return null;

                const { doc, schema } = newState;
                const tr = newState.tr;
                let modified = false;

                doc.descendants((node, pos) => {
                  if (node.isText && node.marks.length > 0) {
                    node.marks.forEach((mark) => {
                      if (mark.type.name === 'link' && mark.attrs.href?.startsWith('!')) {
                        const href = mark.attrs.href.substring(1);
                        const from = pos;
                        const to = pos + node.nodeSize;

                        tr.removeMark(from, to, mark);
                        tr.addMark(from, to, schema.marks.link.create({ href, isDownload: true }));
                        modified = true;
                      }
                    });
                  }
                });

                return modified ? tr : null;
              },
            }),
          ];
        },
      }).configure({}),
      // ImageWithCaption must come AFTER Markdown extension
      ImageWithCaption,
      // Link extension - handles both regular and download links
      Link.extend({
        addStorage() {
          return {
            ...this.parent?.(),
            markdown: {
              serialize: {
                open() {
                  return '[';
                },
                close(...args: unknown[]) {
                  const mark = args[1] as MarkdownSerializerMark | undefined;
                  const href = mark?.attrs.href ?? '';
                  const isDownload = !!mark?.attrs.isDownload;
                  return isDownload ? `](!${href})` : `](${href})`;
                },
              },
              parse: {
                // Override how the markdown extension parses links
                link: {
                  mark: 'link',
                  getAttrs: (tok: MarkdownLinkToken) => {
                    const href = tok.attrGet('href');
                    if (href && href.startsWith('!')) {
                      return {
                        href: href.substring(1),
                        isDownload: true,
                      };
                    }
                    return {
                      href,
                      isDownload: false,
                    };
                  },
                },
              },
            },
          };
        },
        addAttributes() {
          const parentAttrs = (this.parent?.() || {}) as Record<string, unknown>;
          // Exclude the class attribute from parent since we handle it in renderHTML
          const attrsWithoutClass = { ...parentAttrs };
          delete attrsWithoutClass.class;

          return {
            ...attrsWithoutClass,
            isDownload: {
              default: false,
              rendered: false, // Don't render as HTML attribute, keep it internal only
              parseHTML: (element) => {
                const href = element.getAttribute('href') || '';
                return href.startsWith('!');
              },
            },
          };
        },
        parseHTML() {
          return [
            {
              tag: 'a[href]',
              getAttrs: (node) => {
                const href = (node as HTMLElement).getAttribute('href');
                if (!href) return false;

                // Check if it's a download link
                if (href.startsWith('!')) {
                  return {
                    href: href.substring(1), // Remove the ! prefix
                    isDownload: true,
                  };
                }

                return { href, isDownload: false };
              },
            },
          ];
        },
        renderHTML({ mark, HTMLAttributes }) {
          const isDownload = mark.attrs.isDownload;

          // Different styling for download links
          const className = isDownload
            ? 'cursor-pointer transition-colors font-semibold'
            : 'text-blue-600 hover:text-blue-800 cursor-pointer transition-colors underline';

          // For download links: remove target and rel (they prevent downloads)
          const downloadAttrs = isDownload ? {
            download: '',
            target: null,  // Explicitly remove target
            rel: null,     // Explicitly remove rel
          } : {};

          // Use inline style for orange color to ensure it's applied (CSS specificity)
          const styleAttr = isDownload ? { style: 'color: #F38020;' } : {};

          // Filter out class attribute
          const attrsWithoutClass = { ...HTMLAttributes };
          delete attrsWithoutClass.class;

          return [
            'a',
            mergeAttributes(attrsWithoutClass, {
              class: className,
              ...downloadAttrs,
              ...styleAttr,
            }),
            0,
          ];
        },
        addInputRules() {
          return [
            new InputRule({
              // Match [text](url) but NOT ![text](url) (images)
              find: /(?<!!)\[([^\]]+)\]\(([^)]+)\)\s$/,
              handler: ({ state, range, match }) => {
                try {
                  const { tr } = state;
                  const start = range.from;
                  const end = range.to;
                  const linkText = match[1];
                  let linkUrl = match[2];

                  // Check if it's a download link
                  const isDownload = linkUrl.startsWith('!');
                  if (isDownload) {
                    linkUrl = linkUrl.substring(1); // Remove the ! prefix
                  }

                  if (linkText && linkUrl) {
                    const linkEndPos = start + linkText.length;

                    // Replace the markdown syntax with the link text and mark it
                    tr.replaceWith(start, end, state.schema.text(linkText + ' '))
                      .addMark(
                        start,
                        linkEndPos,
                        state.schema.marks.link.create({ href: linkUrl, isDownload })
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
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: new PluginKey('downloadLinkTransform'),
              appendTransaction: (transactions, _oldState, newState) => {
                // Only run if doc changed
                const docChanged = transactions.some(tr => tr.docChanged);
                if (!docChanged) return null;

                const { doc, schema } = newState;
                const tr = newState.tr;
                let modified = false;

                doc.descendants((node, pos) => {
                  if (node.isText && node.marks.length > 0) {
                    node.marks.forEach((mark) => {
                      if (mark.type.name === 'link' && mark.attrs.href?.startsWith('!') && !mark.attrs.isDownload) {
                        // Found a link with ! prefix that hasn't been transformed yet
                        const href = mark.attrs.href.substring(1);
                        const from = pos;
                        const to = pos + node.nodeSize;

                        // Remove old mark and add new one with isDownload
                        tr.removeMark(from, to, mark);
                        tr.addMark(from, to, schema.marks.link.create({ href, isDownload: true }));
                        modified = true;
                      }
                    });
                  }
                });

                return modified ? tr : null;
              },
            }),
          ];
        },
        onCreate() {
          // Transform download links on initial load
          setTimeout(() => {
            const { doc, schema } = this.editor.state;
            const tr = this.editor.state.tr;
            let modified = false;

            doc.descendants((node, pos) => {
              if (node.isText && node.marks.length > 0) {
                node.marks.forEach((mark) => {
                  if (mark.type.name === 'link' && mark.attrs.href?.startsWith('!') && !mark.attrs.isDownload) {
                    const href = mark.attrs.href.substring(1);
                    const from = pos;
                    const to = pos + node.nodeSize;

                    tr.removeMark(from, to, mark);
                    tr.addMark(from, to, schema.marks.link.create({ href, isDownload: true }));
                    modified = true;
                  }
                });
              }
            });

            if (modified) {
              this.editor.view.dispatch(tr);
            }
          }, 0);
        },
      }).configure({
        openOnClick: false,
        HTMLAttributes: {},
      }),
      // Add link icon extension
      LinkIconExtension,
    ],
    content: initialContent,
    contentType: 'markdown',
    editable,
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-[680px] mx-auto focus:outline-none px-4 py-8',
        spellcheck: 'false',
      },
    },

    onUpdate: ({ editor }) => {
      if (onContentChange) {
        const markdown = editor.getMarkdown();

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
    if (editor && initialContent !== editor.getMarkdown()) {
      editor.commands.setContent(initialContent, { contentType: 'markdown' });
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
      const viewDom = editor.view.dom;
      if (!viewDom || !(viewDom instanceof HTMLElement)) return;

      const dom = viewDom as HTMLElement;

      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        // Handle image clicks - convert to markdown for editing
        // Only trigger on actual img element, not figure wrapper
        const imgElement = target.closest('img[data-image-markdown]') as HTMLImageElement | null;

        if (imgElement && editable) {
          // Prevent rapid-fire conversions
          if (imageConversionInProgress.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }

          imageConversionInProgress.current = true;
          e.preventDefault();
          e.stopPropagation();

          try {
            // Find the image node in the editor
            const pos = editor.view.posAtDOM(imgElement, 0);
            const resolvedPos = editor.state.doc.resolve(pos);

            // Find the actual image node
            let imageNode = null;
            let imagePos = -1;

            // Check if we're directly at an image node
            if (resolvedPos.parent.type.name === 'image') {
              imageNode = resolvedPos.parent;
              imagePos = resolvedPos.before();
            } else {
              // Search around the position for an image node
              const { doc } = editor.state;
              doc.nodesBetween(Math.max(0, pos - 5), Math.min(doc.content.size, pos + 5), (node, nodePos) => {
                if (node.type.name === 'image') {
                  imageNode = node;
                  imagePos = nodePos;
                  return false; // Stop searching
                }
              });
            }

            if (imageNode && imagePos >= 0) {
              const { src, alt, title } = imageNode.attrs;
              const altText = alt || '';
              const titleText = title ? ` "${title}"` : '';
              const markdown = `![${altText}](${src}${titleText})`;

              // Use transaction to replace block image with paragraph containing markdown text
              const { tr, schema } = editor.state;
              const paragraphNode = schema.nodes.paragraph.create(null, schema.text(markdown));
              tr.replaceWith(imagePos, imagePos + imageNode.nodeSize, paragraphNode);
              editor.view.dispatch(tr);

              // Position cursor after the markdown text
              setTimeout(() => {
                editor.commands.setTextSelection(imagePos + markdown.length);
                editor.commands.focus();
                // Reset flag after a short delay to prevent loops
                setTimeout(() => {
                  imageConversionInProgress.current = false;
                }, 100);
              }, 10);
            } else {
              imageConversionInProgress.current = false;
            }
          } catch (error) {
            console.error('Error converting image to markdown:', error);
            imageConversionInProgress.current = false;
          }
          return;
        }

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

        const href = anchor.getAttribute('href');
        if (!href) return;

        // Check if link has download attribute or is a downloadable file
        const hasDownloadAttr = anchor.hasAttribute('download');
        const isDownloadableFile = /\.(pdf|zip|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(href);

        // Manually trigger download for download links
        if (hasDownloadAttr || isDownloadableFile) {
          e.preventDefault();
          e.stopPropagation();

          // Create a temporary anchor element to trigger download
          const downloadLink = document.createElement('a');
          downloadLink.href = href;
          downloadLink.download = anchor.getAttribute('download') || href.split('/').pop() || 'download';
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
          return;
        }

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
                  const isDownload = linkMark.attrs.isDownload;
                  // Use different markdown format for download links
                  const markdownText = isDownload
                    ? `[${linkText}](!${linkHref})`
                    : `[${linkText}](${linkHref})`;

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

    let isProcessing = false;

    const timeoutId = setTimeout(() => {
      if (!editor || !editor.view) return;

      const viewDom = editor.view.dom;
      if (!viewDom || !(viewDom instanceof HTMLElement)) return;

      const dom = viewDom as HTMLElement;

      const processLinkAttributes = () => {
        // Prevent recursive processing
        if (isProcessing) return;
        isProcessing = true;

        const anchors = Array.from(dom.querySelectorAll('a')) as HTMLAnchorElement[];

        anchors.forEach((anchor) => {
          // Skip download links - they shouldn't have target="_blank"
          if (anchor.hasAttribute('download')) {
            anchor.removeAttribute('target');
            anchor.removeAttribute('rel');
            return;
          }

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

        isProcessing = false;
      };

      // Process once on mount
      processLinkAttributes();

      // Only process on editor updates, not on every DOM mutation
      const updateHandler = () => {
        requestAnimationFrame(processLinkAttributes);
      };

      editor.on('update', updateHandler);

      return () => {
        clearTimeout(timeoutId);
        try {
          editor.off('update', updateHandler);
        } catch {
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

  const location = useLocation();
  const publishedDateLabel = formatArticleDate(articleMetadata?.created);
  const updatedDateLabel = formatArticleDate(articleMetadata?.modified);
  const showUpdatedDate = !!updatedDateLabel;
  const showPublishedDate = !!publishedDateLabel && !showUpdatedDate;

  const downloadMarkdown = () => {
    if (!editor) return;

    const markdown = serializeMarkdownDocument(editor.getMarkdown(), articleMetadata);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    // Generate filename from current route
    const pathname = location.pathname;
    const pageName = pathname === '/' ? 'landing' : pathname.slice(1).replace(/\//g, '-');
    a.href = url;
    a.download = `${pageName}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!editor) {
    return null;
  }

  return (
    <ErrorBoundary>
      <div className="w-full min-h-screen bg-white flex flex-col overflow-hidden">
        {/* Centered Search Bar - Fixed at top */}
        <div className="flex-shrink-0 pt-12 bg-white z-10">
          <div className="max-w-2xl mx-auto px-4">
            <div className="flex items-center gap-4 border-b-2 border-gray-300 focus-within:border-[#F6821F] transition-colors pr-1">
              <div className="flex-1">
                <SearchBar centered />
              </div>
              {/* Download button next to search bar */}
              <button
                onClick={downloadMarkdown}
                className="group flex items-center gap-2 text-[#7c7c7c] hover:text-[#F6821F] transition-all duration-300 font-sohne-regular text-sm flex-shrink-0"
                aria-label="Download page as markdown"
              >
                <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 whitespace-nowrap">download page as markdown</span>
                <ArrowDownToLine className="w-5 h-5 flex-shrink-0" />
              </button>
            </div>

            {(showPublishedDate || showUpdatedDate) && (
              <div className="pt-2 text-right text-sm text-gray-500 font-sohne-regular pr-1">
                {showPublishedDate && (
                  <span>
                    <span className="font-semibold text-gray-700">Published</span> {publishedDateLabel}
                  </span>
                )}
                {showPublishedDate && showUpdatedDate && <span className="mx-2">•</span>}
                {showUpdatedDate && (
                  <span>
                    <span className="font-semibold text-gray-700">Updated</span> {updatedDateLabel}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Editor content - Scrollable area */}
        <div className="flex-1 overflow-y-auto px-2 sm:px-4 md:px-8 flex items-center">
          <div className="w-full max-w-[680px] mx-auto py-8">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Bottom right button container - switches between source code and return to top */}
        <div className="fixed bottom-8 right-8 z-50">
          {showBackToTop ? (
            /* Return to top button - replaces source code when scrolled */
            <button
              onClick={scrollToTop}
              className="flex items-center gap-2 text-[#F6821F] hover:text-[#d96d1a] transition-colors duration-300 font-sohne-regular text-sm"
              aria-label="Back to top"
            >
              <span>Return to top</span>
              <ArrowUp className="w-5 h-5" />
            </button>
          ) : (
            /* View source code - text expands left */
            <button
              onClick={() => window.open('https://github.com/injaneity/injaneity', '_blank', 'noopener,noreferrer')}
              className="group flex items-center gap-2 text-[#7c7c7c] hover:text-[#F6821F] transition-all duration-300 font-sohne-regular text-sm"
              aria-label="View source code"
            >
              <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 whitespace-nowrap">view source code</span>
              <Code className="w-5 h-5 flex-shrink-0" />
            </button>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};
