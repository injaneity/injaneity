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

function initOwnerControls() {
  const slug = document.body.dataset.pageSlug;
  if (!slug) return;
  let owner = false;
  let opening = false;
  let version = 0;
  let editor: Awaited<ReturnType<typeof import('./editor/inline').startInlineEditor>> | undefined;
  const query = new URLSearchParams(location.search);
  let requested = query.has('edit') || query.has('create') || query.has('draft');
  const render = () => {
    document.querySelectorAll('.owner-controls').forEach(node => node.remove());
    if (!owner) return;
    const article = document.querySelector('[data-reader-content]')!;
    if (!article.querySelector('.article-byline')) {
      const byline = document.createElement('div'); byline.className = 'article-byline'; article.prepend(byline);
    }
    const editing = editor?.editing || opening;
    for (const metadata of article.querySelectorAll('.article-byline')) {
      const controls = document.createElement('span'); controls.className = 'owner-controls';
      for (const label of editing ? ['done', '···'] : ['edit', 'create']) {
        const link = document.createElement('a');
        link.textContent = label; link.dataset.ownerAction = label;
        link.href = label === 'create' ? '/?create=1' : `${location.pathname}?edit=1`;
        if (label === '···') { link.ariaLabel = 'Editor actions'; link.setAttribute('aria-haspopup', 'dialog'); }
        if (metadata.textContent || controls.childNodes.length) controls.append(' · ');
        controls.append(link);
      }
      metadata.append(controls);
    }
    initCopyButtons();
  };
  const enter = async (create = false, draftId?: string) => {
    if (!owner || opening) return;
    if (editor && !create) { await editor.resume(); render(); return; }
    if (editor && !editor.canLeave()) return;
    opening = true; const request = ++version; render();
    try {
      const { startInlineEditor } = await import('./editor/inline');
      if (!owner || request !== version) return;
      editor?.destroy(); editor = undefined;
      const next = await startInlineEditor(slug, create, render, draftId);
      if (!owner || request !== version) { next.destroy(); return; }
      editor = next;
      history.replaceState(null, '', `${location.pathname}?${create || draftId ? `draft=${encodeURIComponent(next.id)}` : 'edit=1'}`);
    } catch {
      if (owner) alert('could not open editing. your drafts are unchanged. try signing in again.');
    } finally { opening = false; render(); }
  };
  document.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-owner-action]') : null;
    if (!target || !owner || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const action = target.dataset.ownerAction;
    if (action === '···') editor?.menu();
    else if (action === 'done') { await editor?.done(); if (!editor?.editing) history.replaceState(null, '', location.pathname); render(); }
    else await enter(action === 'create');
  });
  watchOwnerSession((session) => {
    owner = session?.authenticated === true;
    if (!owner) { ++version; const current = editor; editor = undefined; current?.destroy(); }
    render();
    if (owner && requested) {
      requested = false;
      void enter(query.get('create') === '1', query.get('draft') || undefined);
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
