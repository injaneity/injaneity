import './index.css';
import { watchOwnerSession } from './lib/owner-session';

type Icon = 'copy' | 'check';
const $ = <T extends Element>(selector: string, root: ParentNode = document) => root.querySelector<T>(selector);

function icon(name: Icon) {
  const paths = {
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>',
    check: '<path d="M20 6 9 17l-5-5"></path>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function initCopyButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy-code]').forEach((button) => {
    button.innerHTML = icon('copy');
    if (button.dataset.copyReady) return;
    button.dataset.copyReady = 'true';
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.closest('.code-block-wrapper')?.querySelector('code')?.textContent ?? '');
      button.innerHTML = icon('check');
      setTimeout(() => { button.innerHTML = icon('copy'); }, 2000);
    });
  });
}

// Every page is editable in place. Only the signed-in owner's edits are saved and published;
// a visitor's edits live in memory and vanish on reload.
function initOwnerControls() {
  const slug = document.body.dataset.pageSlug;
  if (!slug) return;
  let owner = false;
  let opening = false;
  let failed = false;
  let version = 0;
  let editor: Awaited<ReturnType<typeof import('./editor/inline').startInlineEditor>> | undefined;
  let visitor: Awaited<ReturnType<typeof import('./editor/inline').startVisitorEditor>> | undefined;
  let visitorLoading: Promise<unknown> | undefined;
  const query = new URLSearchParams(location.search);
  let requested = { create: query.get('create') === '1', draft: query.get('draft') || undefined };
  const render = () => {
    document.querySelectorAll('.owner-controls').forEach(node => node.remove());
    if (!owner) return;
    const article = document.querySelector('[data-reader-content]')!;
    if (!article.querySelector('.article-byline')) {
      const byline = document.createElement('div'); byline.className = 'article-byline'; article.prepend(byline);
    }
    for (const metadata of article.querySelectorAll('.article-byline')) {
      const controls = document.createElement('span'); controls.className = 'owner-controls';
      const status = opening ? 'opening…' : editor?.status;
      if (status) {
        const label = document.createElement('span'); label.className = 'owner-status'; label.textContent = status;
        if (metadata.textContent) controls.append(' · ');
        controls.append(label);
      }
      const link = document.createElement('a');
      link.textContent = 'create'; link.dataset.ownerAction = 'create'; link.href = '/?create=1';
      if (metadata.textContent || controls.childNodes.length) controls.append(' · ');
      controls.append(link);
      metadata.append(controls);
    }
    initCopyButtons();
  };
  const open = async (create = false, draftId?: string) => {
    if (!owner || opening) return;
    if (editor && !editor.canLeave()) return;
    opening = true; const request = ++version; render();
    try {
      const { startInlineEditor } = await import('./editor/inline');
      if (!owner || request !== version) return;
      editor?.destroy(); editor = undefined;
      visitor?.destroy(); visitor = undefined;
      const next = await startInlineEditor(slug, create, render, draftId);
      if (!owner || request !== version) { next.destroy(); return; }
      editor = next;
      if (create || draftId) history.replaceState(null, '', `${location.pathname}?draft=${encodeURIComponent(next.id)}`);
      else if (location.search) history.replaceState(null, '', location.pathname);
    } catch {
      failed = true;
      if (owner) alert('could not open editing. your drafts are unchanged. try signing in again.');
    } finally { opening = false; render(); }
  };
  document.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-owner-action]') : null;
    if (!target || !owner || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    failed = false;
    await open(true);
  });
  // Visitors load the editor on their first click, so reading stays as light as before.
  const article = document.querySelector<HTMLElement>('[data-reader-content]');
  article?.addEventListener('click', event => {
    if (owner || editor || visitor || !(event.target instanceof Element)) return;
    if (event.target.closest('a[href], button, video, summary') || getSelection()?.toString()) return;
    const block = event.target.closest('[data-reader-content] > *');
    if (!block || block.matches('.article-byline, .article-navigation')) return;
    const index = [...article.children].indexOf(block);
    const point = { x: event.clientX, y: event.clientY };
    const request = version;
    visitorLoading ??= import('./editor/inline').then(({ startVisitorEditor }) => startVisitorEditor(slug)).then(next => {
      if (owner || request !== version) { next.destroy(); return; }
      visitor = next;
      return next.editIndex(index, point);
    }).catch(() => {}).finally(() => { visitorLoading = undefined; });
  });
  watchOwnerSession((session) => {
    owner = session?.authenticated === true;
    if (!owner && editor) { ++version; const current = editor; editor = undefined; current.destroy(); }
    if (owner && visitor) { ++version; const current = visitor; visitor = undefined; current.destroy(); }
    render();
    if (owner && !editor && !opening && !failed) {
      const { create, draft } = requested;
      requested = { create: false, draft: undefined };
      void open(create, draft);
    }
  });
}

function initReaderAlignment() {
  const reader = $<HTMLElement>('[data-reader-content]');
  if (!reader) return;
  const frame = reader.closest<HTMLElement>('.article-frame');

  const update = () => {
    const frameStyle = frame ? getComputedStyle(frame) : null;
    const verticalPadding = frameStyle
      ? Number.parseFloat(frameStyle.paddingTop) + Number.parseFloat(frameStyle.paddingBottom)
      : 0;
    const availableHeight = frame ? frame.clientHeight - verticalPadding : innerHeight;
    const centered = reader.scrollHeight <= availableHeight + 1;
    reader.classList.toggle('is-vertically-centered', centered);
  };

  addEventListener('resize', update, { passive: true });
  new ResizeObserver(update).observe(reader);
  document.fonts.ready.then(update);
  update();
}

addEventListener('DOMContentLoaded', () => [initCopyButtons, initOwnerControls, initReaderAlignment].forEach((init) => init()));
