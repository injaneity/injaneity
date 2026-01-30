import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { InputRule } from '@tiptap/core';
import { ImageWithCaptionComponent } from './ImageWithCaptionComponent';

export const ImageWithCaption = Node.create({
  name: 'image',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (element) => {
          const img = element as HTMLImageElement;
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt'),
            title: img.getAttribute('title'),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { alt, src, title } = HTMLAttributes;
    // Minimal fallback - just img tag for serialization/copy-paste
    // ReactNodeViewRenderer handles the actual interactive rendering
    return ['img', { src, alt: alt || '', title }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageWithCaptionComponent);
  },

  addInputRules() {
    return [
      new InputRule({
        // Match ![alt](url) followed by space
        find: /!\[([^\]]*)\]\(([^)]+)\)\s$/,
        handler: ({ state, range, match }) => {
          const [, alt, src] = match;
          const { tr } = state;
          const start = range.from;
          const end = range.to;

          if (src) {
            const $start = state.doc.resolve(start);
            const parent = $start.parent;

            // Create image node
            const imageNode = this.type.create({
              src,
              alt: alt || null,
            });

            // Check if paragraph only contains the markdown (ignoring whitespace)
            const textContent = parent.textContent.trim();
            const markdownText = match[0].trim(); // The matched markdown without trailing space

            // If the paragraph only contains this markdown, replace entire paragraph
            if (textContent === markdownText || textContent === markdownText.replace(/\s$/, '')) {
              const parentPos = $start.before();
              tr.replaceWith(parentPos, parentPos + parent.nodeSize, imageNode);
            } else {
              // Multiple things in paragraph, just replace the markdown text
              tr.replaceWith(start, end, imageNode);
            }
          }
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Convert to markdown on Enter when image is selected
      // OR convert markdown to image when Enter pressed on markdown text
      Enter: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;

        // Case 1: Image node selected - convert to markdown
        if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
          const node = selection.node;
          const { src, alt, title } = node.attrs;
          const altText = alt || '';
          const titleText = title ? ` "${title}"` : '';
          const markdown = `![${altText}](${src}${titleText})`;

          // Replace image with markdown text in a paragraph
          const pos = selection.from;
          editor.commands.deleteRange({ from: pos, to: selection.to });
          editor.commands.insertContentAt(pos, {
            type: 'paragraph',
            content: [{ type: 'text', text: markdown }],
          });

          // Position cursor after the markdown text
          setTimeout(() => {
            editor.commands.setTextSelection(pos + markdown.length + 1);
            editor.commands.focus();
          }, 10);
          return true;
        }

        // Case 2: Cursor in paragraph - check if line has image markdown
        const { $from } = selection;
        const parent = $from.parent;

        if (parent.type.name === 'paragraph') {
          const textContent = parent.textContent;
          const imageMatch = textContent.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);

          if (imageMatch) {
            const [, alt, src] = imageMatch;
            const parentPos = $from.before();

            // Create image node
            const imageNode = this.type.create({
              src,
              alt: alt || null,
            });

            // Replace paragraph with image
            const { tr } = editor.state;
            tr.replaceWith(parentPos, parentPos + parent.nodeSize, imageNode);
            editor.view.dispatch(tr);

            return true;
          }
        }

        return false;
      },

      // Allow navigating past images with ArrowDown
      ArrowDown: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;

        if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
          // Move cursor to after the image
          const pos = selection.to;
          editor.commands.setTextSelection(pos);
          return true;
        }

        return false;
      },

      // Allow navigating past images with ArrowUp
      ArrowUp: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;

        if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
          // Move cursor to before the image
          const pos = selection.from;
          editor.commands.setTextSelection(Math.max(0, pos - 1));
          return true;
        }

        return false;
      },
    };
  },
});
