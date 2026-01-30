import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/core';

// React component to render image with caption
const ImageComponent = ({ node }: NodeViewProps) => {
  const { src, alt } = node.attrs;

  return (
    <NodeViewWrapper className="image-with-caption my-8">
      <div className="flex flex-col items-center gap-2">
        <img
          src={src}
          alt={alt || ''}
          className="max-w-full h-auto rounded-lg"
          loading="lazy"
        />
        {alt && (
          <figcaption className="text-sm text-gray-600 italic text-center font-sohne-regular">
            {alt}
          </figcaption>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const ImageWithCaption = Node.create({
  name: 'image',

  group: 'block',

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('src'),
        renderHTML: (attributes) => {
          if (!attributes.src) {
            return {};
          }
          return { src: attributes.src };
        },
      },
      alt: {
        default: null,
        parseHTML: (element) => element.getAttribute('alt'),
        renderHTML: (attributes) => {
          if (!attributes.alt) {
            return {};
          }
          return { alt: attributes.alt };
        },
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute('title'),
        renderHTML: (attributes) => {
          if (!attributes.title) {
            return {};
          }
          return { title: attributes.title };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageComponent);
  },
});
