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
  watchOwnerSession((session) => {
    document.querySelectorAll('.owner-controls').forEach((node) => node.remove());
    if (!session?.authenticated) return;
    for (const metadata of document.querySelectorAll('.reader-content .article-byline')) {
      const controls = document.createElement('span');
      controls.className = 'owner-controls';
      for (const [label, href] of [['edit', `/editor/?edit=${encodeURIComponent(slug)}`], ['create', '/editor/?create=1']]) {
        const link = document.createElement('a');
        link.textContent = label;
        link.href = href;
        if (metadata.textContent || controls.childNodes.length) controls.append(' · ');
        controls.append(link);
      }
      metadata.append(controls);
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
