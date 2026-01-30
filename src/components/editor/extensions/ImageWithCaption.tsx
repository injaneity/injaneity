import { Node, mergeAttributes } from '@tiptap/core';

export const ImageWithCaption = Node.create({
  name: 'image',

  group: 'block',

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => {
          // Handle both <img> tags and <figure> wrappers
          const img = element.tagName === 'IMG' ? element : element.querySelector('img');
          return img?.getAttribute('src') || null;
        },
        renderHTML: (attributes) => {
          if (!attributes.src) {
            return {};
          }
          return { src: attributes.src };
        },
      },
      alt: {
        default: null,
        parseHTML: (element) => {
          const img = element.tagName === 'IMG' ? element : element.querySelector('img');
          return img?.getAttribute('alt') || null;
        },
        renderHTML: (attributes) => {
          if (!attributes.alt) {
            return {};
          }
          return { alt: attributes.alt };
        },
      },
      title: {
        default: null,
        parseHTML: (element) => {
          const img = element.tagName === 'IMG' ? element : element.querySelector('img');
          return img?.getAttribute('title') || null;
        },
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
      {
        tag: 'figure',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { alt } = HTMLAttributes;

    // If there's alt text, render as a figure with caption
    if (alt) {
      return [
        'figure',
        { class: 'image-with-caption' },
        [
          'img',
          mergeAttributes(HTMLAttributes, {
            class: 'max-w-full h-auto rounded-lg',
            loading: 'lazy',
          }),
        ],
        [
          'figcaption',
          { class: 'text-sm text-gray-600 italic text-center font-sohne-regular' },
          alt,
        ],
      ];
    }

    // No alt text, just render the image
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        class: 'max-w-full h-auto rounded-lg',
        loading: 'lazy',
      }),
    ];
  },
});
