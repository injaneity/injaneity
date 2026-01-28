import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const LinkIconExtension = Extension.create({
  name: 'linkIcon',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('linkIcon'),

        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const processedLinks = new Set<string>();

            state.doc.descendants((node, pos) => {
              if (!node.isText) return;

              const marks = node.marks;
              const linkMark = marks.find(mark => mark.type.name === 'link');

              if (linkMark && node.text) {
                // Check if this is the last text node with this link mark
                const endPos = pos + node.nodeSize;
                const $endPos = state.doc.resolve(endPos);

                // Look ahead to see if the next node also has the same link mark
                const nextNode = $endPos.parent.maybeChild($endPos.index());
                const hasNextLinkNode = nextNode?.marks.some(m =>
                  m.type.name === 'link' && m.attrs.href === linkMark.attrs.href
                );

                // Only add decoration if this is the end of the link
                if (!hasNextLinkNode) {
                  const linkKey = `${linkMark.attrs.href}-${pos}`;

                  if (!processedLinks.has(linkKey)) {
                    processedLinks.add(linkKey);

                    // Create a widget decoration (inline element)
                    const icon = document.createElement('span');
                    icon.className = 'link-icon';
                    icon.contentEditable = 'false';
                    icon.setAttribute('data-link-icon', 'true');
                    icon.setAttribute('aria-label', 'link icon');

                    const decoration = Decoration.widget(endPos, icon, {
                      side: 1, // Position after the text
                    });

                    decorations.push(decoration);
                  }
                }
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
