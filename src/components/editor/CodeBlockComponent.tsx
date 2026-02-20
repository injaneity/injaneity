import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import { Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';
import { copyToClipboard } from '@/lib/clipboard';

export default function CodeBlockComponent({ node }: NodeViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = node.textContent;
    const success = await copyToClipboard(text);

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      console.error('Failed to copy code block');
    }
  }, [node.textContent]);

  const language = (node.attrs.language as string | null) || 'plaintext';

  return (
    <NodeViewWrapper className="code-block-wrapper" data-drag-handle="">
      <div className="code-block-header" contentEditable={false}>
        <span className="language-label">{language}</span>
        <button
          className="copy-button"
          onClick={handleCopy}
          aria-label="Copy code"
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
      <pre>
        <NodeViewContent<'code'> as="code" className="hljs" style={{ whiteSpace: 'pre' }} />
      </pre>
    </NodeViewWrapper>
  );
}
