import '@/experimental/app/standalone.css';
import { SimpleMarkdownEditor } from '@/experimental/editor/SimpleMarkdownEditor';
import { parseMarkdownDocument } from '@/lib/markdown';

const app = document.getElementById('app');

if (!app) {
  throw new Error('Missing #app root for experimental standalone editor.');
}

const appRoot = app;

const markdownModules = import.meta.glob('../../content/*.md', {
  query: '?raw',
  import: 'default',
});

function getSlugFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return params.get('slug') || '00-landing';
}

async function loadMarkdownDocument(slug: string) {
  const key = `../../content/${slug}.md`;
  const loader = markdownModules[key] as (() => Promise<string>) | undefined;

  if (!loader) {
    return {
      content: `# ${slug}`,
      metadata: {},
    };
  }

  const raw = await loader();
  return parseMarkdownDocument(raw);
}

async function mountStandaloneEditor() {
  const slug = getSlugFromLocation();
  const documentData = await loadMarkdownDocument(slug);
  await document.fonts.ready;

  document.title = `${slug} — experimental markdown editor`;
  appRoot.innerHTML = `
    <main class="simple-shell">
      <div class="simple-editor-frame">
        <div id="simple-editor-root"></div>
      </div>
    </main>
  `;

  const root = document.getElementById('simple-editor-root');
  if (!root) {
    throw new Error('Missing standalone editor root.');
  }

  const editor = new SimpleMarkdownEditor({
    root,
    initialMarkdown: documentData.content,
    placeholder: 'Start writing...',
  });

  window.addEventListener(
    'beforeunload',
    () => {
      editor.destroy();
    },
    { once: true },
  );
}

void mountStandaloneEditor();
