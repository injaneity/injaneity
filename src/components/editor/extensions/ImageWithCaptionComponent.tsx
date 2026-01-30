import { NodeViewWrapper } from '@tiptap/react';
import React from 'react';
import type { NodeViewProps } from '@tiptap/react';

export const ImageWithCaptionComponent: React.FC<NodeViewProps> = ({
  node,
  getPos,
  editor
}) => {
  const { src, alt, title } = node.attrs;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Convert to markdown text
    const altText = alt || '';
    const titleText = title ? ` "${title}"` : '';
    const markdown = `![${altText}](${src}${titleText})`;

    const pos = getPos();
    if (typeof pos === 'number') {
      // Use transaction to replace image with paragraph containing markdown text
      const { tr, schema } = editor.state;
      const paragraphNode = schema.nodes.paragraph.create(null, schema.text(markdown));
      tr.replaceWith(pos, pos + node.nodeSize, paragraphNode);
      editor.view.dispatch(tr);

      // Focus and position cursor
      setTimeout(() => {
        editor.commands.setTextSelection(pos + markdown.length);
        editor.commands.focus();
      }, 10);
    }
  };

  return (
    <NodeViewWrapper
      className="image-node"
      contentEditable={false}
      data-image-markdown="true"
    >
      <img
        src={src}
        alt={alt || ''}
        className="max-w-full h-auto cursor-pointer"
        loading="lazy"
        onClick={handleClick}
        data-image-markdown="true"
      />
    </NodeViewWrapper>
  );
};
