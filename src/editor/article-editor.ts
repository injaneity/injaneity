import { renderMarkdown, type Metadata } from '../lib/markdown.mjs';
import { createLiveEditor } from './live-markdown';

export function createArticleEditor(article: HTMLElement, changed: () => void, notify: (message: string) => void, rendered: () => void, limit: number) {
  let source = '';
  let metadata: Metadata = {};
  let enabled = false;
  let generation = 0;
  let active: { from: number; to: number; editor: ReturnType<typeof createLiveEditor> } | undefined;
  const past: string[] = [];
  const future: string[] = [];
  const navigation = article.querySelector('.article-navigation')?.outerHTML || '';
  const generatedIndex = [...article.querySelectorAll('.writing-entry')].map(node => node.outerHTML).join('');

  function read() {
    return active ? source.slice(0, active.from) + active.editor.source + source.slice(active.to) : source;
  }
  function commit() {
    if (!active) return;
    const next = read();
    if (next !== source) { past.push(source); if (past.length > 100) past.shift(); future.length = 0; }
    source = next;
    active.editor.view.destroy();
    active = undefined;
  }
  async function paint() {
    const version = ++generation;
    try {
      const html = await renderMarkdown(source, metadata, { safe: true, editable: true });
      if (version !== generation || active) return;
      article.innerHTML = html + navigation;
      const marker = source.indexOf('<!-- posts -->');
      if (marker >= 0 && generatedIndex) {
        const after = [...article.querySelectorAll<HTMLElement>('[data-edit-from]')].find(node => Number(node.dataset.editFrom) > marker);
        if (after) after.insertAdjacentHTML('beforebegin', generatedIndex);
        else article.insertAdjacentHTML('beforeend', generatedIndex);
      }
      for (const node of article.querySelectorAll<HTMLElement>('[data-edit-from]')) {
        if (enabled) node.tabIndex = 0;
        else node.removeAttribute('tabindex');
      }
      article.classList.toggle('is-editing', enabled);
      if (enabled) {
        const append = document.createElement('button');
        append.type = 'button'; append.className = 'append-paragraph'; append.ariaLabel = 'Add paragraph';
        append.textContent = source.trim() ? '+' : 'start writing…';
        append.addEventListener('click', () => activate(source.length, source.length));
        article.append(append);
      }
      rendered();
    } catch { notify('could not render this draft · your markdown is still saved'); }
  }
  async function activate(from: number, to: number) {
    if (!enabled) return;
    if (active) {
      const delta = active.editor.source.length - (active.to - active.from);
      if (from >= active.to) { from += delta; to += delta; }
      commit();
      await paint();
    }
    if (!enabled) return;
    const nodes = [...article.querySelectorAll<HTMLElement>(`[data-edit-from="${from}"][data-edit-to="${to}"]`)];
    const sample = nodes[0];
    const host = document.createElement('div');
    host.className = 'inline-manuscript';
    if (sample) {
      const style = getComputedStyle(sample);
      for (const key of ['fontSize', 'fontWeight', 'lineHeight', 'marginTop', 'marginBottom', 'textAlign'] as const) host.style[key] = style[key];
      host.dataset.block = sample.tagName.toLowerCase();
      sample.before(host);
      nodes.forEach(node => node.remove());
    } else {
      article.querySelector('.append-paragraph')?.before(host);
      host.style.fontSize = '17px';
    }
    const original = source.slice(from, to);
    const initial = from === source.length && source.length ? (source.endsWith('\n\n') ? '' : '\n\n') : '';
    const editor = createLiveEditor(host, () => changed(), () => notify('this draft is too large · limit 200,000 characters'), limit - source.length + (to - from));
    active = { from, to, editor };
    editor.setSource(initial + original);
    editor.view.focus();
    editor.view.dispatch({ selection: { anchor: editor.view.state.doc.length } });
    editor.view.dom.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); void finish(); }
    });
    editor.view.dom.addEventListener('focusout', () => {
      setTimeout(() => { if (active?.editor === editor && !editor.view.hasFocus) void finish(); }, 0);
    });
  }
  async function finish() {
    commit();
    await paint();
  }
  const click = (event: MouseEvent) => {
    if (!enabled || !(event.target instanceof Element) || event.target.closest('.inline-manuscript, .owner-controls, .append-paragraph, .article-navigation')) return;
    const block = event.target.closest<HTMLElement>('[data-edit-from]');
    if (!block) return;
    event.preventDefault();
    void activate(Number(block.dataset.editFrom), Number(block.dataset.editTo));
  };
  const keyboard = (event: KeyboardEvent) => {
    if (!enabled || active || !(event.target instanceof HTMLElement)) return;
    if (event.key === 'Enter' && event.target.matches('[data-edit-from]')) {
      event.preventDefault(); void activate(Number(event.target.dataset.editFrom), Number(event.target.dataset.editTo));
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      const from = event.shiftKey ? future : past, to = event.shiftKey ? past : future;
      const next = from.pop();
      if (next === undefined) return;
      event.preventDefault(); to.push(source); source = next; changed(); void paint();
    }
  };
  article.addEventListener('click', click);
  article.addEventListener('keydown', keyboard);
  return {
    get source() { return read(); },
    async setSource(value: string, details: Metadata) {
      ++generation;
      active?.editor.view.destroy(); active = undefined;
      source = value; metadata = details; past.length = 0; future.length = 0;
      enabled = true;
      await paint();
    },
    async enable() { enabled = true; await paint(); },
    async disable() { enabled = false; await finish(); },
    finish,
    focus() { (active?.editor.view.contentDOM || article.querySelector<HTMLElement>('[data-edit-from], .append-paragraph'))?.focus(); },
    async setMetadata(details: Metadata) { metadata = details; if (!active) await paint(); },
    destroy() { ++generation; enabled = false; commit(); article.classList.remove('is-editing'); article.removeEventListener('click', click); article.removeEventListener('keydown', keyboard); },
  };
}
