import { isValidElement, useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, Code, Check, Copy } from 'lucide-react';
import { SearchBar } from '../layout/SearchBar';
import { ErrorBoundary } from '../ErrorBoundary';
import { copyToClipboard } from '@/lib/clipboard';
import { formatArticleDate, type MarkdownArticleMetadata } from '@/lib/markdown';

interface ArticleViewProps {
  content: string;
  metadata?: MarkdownArticleMetadata;
}

function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return extractText(node.props.children);
  return '';
}

const CodeBlock: React.FC<{ children?: ReactNode }> = ({ children }) => {
  const [copied, setCopied] = useState(false);

  const codeElement = isValidElement<{ className?: string; children?: ReactNode }>(children)
    ? children
    : null;
  const languageMatch = codeElement?.props.className?.match(/language-([\w-]+)/);
  const language = languageMatch?.[1] ?? 'plaintext';

  const handleCopy = async () => {
    const ok = await copyToClipboard(extractText(children));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="language-label">{language}</span>
        <button onClick={handleCopy} className="copy-button" aria-label="Copy code">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
};

export const ArticleView: React.FC<ArticleViewProps> = ({ content, metadata }) => {
  const navigate = useNavigate();
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > 300);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const publishedDateLabel = formatArticleDate(metadata?.created);
  const updatedDateLabel = formatArticleDate(metadata?.modified);
  const showUpdatedDate = !!updatedDateLabel;
  const showPublishedDate = !!publishedDateLabel && !showUpdatedDate;

  return (
    <ErrorBoundary>
      <div className="w-full min-h-screen flex flex-col">
        {/* Dithered e-ink subtree: search header + article. The fixed corner
            button stays outside because an ancestor filter would re-anchor it. */}
        <div className="eink-page flex-1 flex flex-col">
        {/* Article content */}
        <div className="flex-1 px-2 sm:px-4 md:px-8">
          <article className="reader-content w-full max-w-[680px] mx-auto px-4 pt-20 pb-8">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeHighlight]}
              components={{
                pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                // Byline with site name + date metadata directly under the
                // title, using the same h6 "metadata subheading" format that
                // markdown content can use via `###### ...`
                h1: ({ children }) => (
                  <>
                    <h1>{children}</h1>
                    <h6 className="article-byline">
                      <strong
                        role="link"
                        tabIndex={0}
                        className="byline-home cursor-pointer"
                        onClick={() => navigate('/')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate('/');
                          }
                        }}
                      >
                        ⎇ zanechee.dev
                      </strong>
                      {(showPublishedDate || showUpdatedDate) && (
                        <>
                          {' '}· {showPublishedDate && <>Published {publishedDateLabel}</>}
                          {showUpdatedDate && <>Updated {updatedDateLabel}</>}
                        </>
                      )}
                    </h6>
                  </>
                ),
                a: ({ href, children }) => {
                  // `!`-prefixed hrefs are download links
                  const isDownload = href?.startsWith('!');
                  const cleanHref = isDownload ? href!.substring(1) : href ?? '';

                  if (isDownload) {
                    return (
                      <a href={cleanHref} download className="download-link font-semibold">
                        {children}
                      </a>
                    );
                  }

                  const hasProtocol = /^https?:\/\//i.test(cleanHref);
                  const isSpecial = cleanHref.startsWith('#') || cleanHref.startsWith('mailto:') || cleanHref.startsWith('tel:');
                  const looksLikeDomain = /^[a-z0-9.-]+\.[a-z]{2,}/i.test(cleanHref);
                  const isExternal = hasProtocol || looksLikeDomain;

                  if (isExternal) {
                    const fullUrl = hasProtocol ? cleanHref : `https://${cleanHref}`;
                    return (
                      <a href={fullUrl} target="_blank" rel="noopener noreferrer nofollow">
                        {children}
                      </a>
                    );
                  }

                  if (isSpecial) {
                    return <a href={cleanHref}>{children}</a>;
                  }

                  // Internal link: navigate via React Router
                  const normalizedHref = cleanHref.startsWith('./') ? cleanHref.slice(1) : cleanHref;
                  return (
                    <a
                      href={normalizedHref}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(normalizedHref);
                      }}
                    >
                      {children}
                    </a>
                  );
                },
                img: ({ src, alt, title }) => (
                  <figure className="image-node">
                    <img src={src} alt={alt ?? ''} loading="lazy" />
                    {(title || alt) && <figcaption>{title || alt}</figcaption>}
                  </figure>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </article>
        </div>
        </div>

        {/* Bottom left search - collapsed icon that expands on hover/click */}
        <div className="fixed bottom-8 left-8 z-50">
          <SearchBar />
        </div>

        {/* Bottom right button - switches between source code and return to top */}
        <div className="fixed bottom-8 right-8 z-50">
          {showBackToTop ? (
            <button
              onClick={scrollToTop}
              className="flex items-center gap-2 text-[#F6821F] hover:text-[#d96d1a] transition-colors duration-300 font-sohne-regular text-sm"
              aria-label="Back to top"
            >
              <span>Return to top</span>
              <ArrowUp className="w-5 h-5" />
            </button>
          ) : (
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
