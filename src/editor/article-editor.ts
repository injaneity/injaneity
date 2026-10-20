import { renderMarkdown, type Metadata } from '../lib/markdown.mjs';
import { createLiveEditor } from './live-markdown';

export function createArticleEditor(article: HTMLElement, changed: () => void, notify: (message: string) => void, rendered: () => void, settled: () => void, limit: number) {
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
  // Swap only the blocks that changed. Re-rendering the whole article reloads its images and video
  // and re-rasterises every dithered glyph, which made each edit stall on long pages.
  function reconcile(fragment: DocumentFragment) {
    const key = (node: Node) => node instanceof Element
      ? node.outerHTML.replace(/ data-edit-(?:from|to)="\d+"/g, '')
      : `${node.nodeType}:${node.textContent}`;
    const current = [...article.childNodes].filter(node => !(node instanceof Element && node.matches('.owner-controls')));
    const keys = current.map(key);
    let cursor = 0;
    for (const node of [...fragment.childNodes]) {
      const wanted = key(node);
      const match = keys.indexOf(wanted, cursor);
      if (match < 0) { article.insertBefore(node, current[cursor] ?? null); continue; }
      for (; cursor < match; cursor++) current[cursor].remove();
      const kept = current[cursor++];
      if (kept instanceof HTMLElement && node instanceof HTMLElement) {
        for (const name of ['data-edit-from', 'data-edit-to']) {
          const value = node.getAttribute(name);
          if (value === null) kept.removeAttribute(name); else kept.setAttribute(name, value);
        }
      }
    }
    for (; cursor < current.length; cursor++) current[cursor].remove();
  }
  async function paint() {
    const version = ++generation;
    try {
      const html = await renderMarkdown(source, metadata, { safe: true, editable: true });
      if (version !== generation || active) return;
      const next = document.createElement('template');
      next.innerHTML = html + navigation;
      const fragment = next.content;
      const marker = source.indexOf('<!-- posts -->');
      if (marker >= 0 && generatedIndex) {
        const after = [...fragment.querySelectorAll<HTMLElement>('[data-edit-from]')].find(node => Number(node.dataset.editFrom) > marker);
        if (after) after.insertAdjacentHTML('beforebegin', generatedIndex);
        else fragment.append(document.createRange().createContextualFragment(generatedIndex));
      }
      for (const node of fragment.querySelectorAll<HTMLElement>('[data-edit-from]')) {
        if (enabled) node.tabIndex = 0;
        else node.removeAttribute('tabindex');
      }
      if (enabled) {
        const append = document.createElement('button');
        append.type = 'button'; append.className = 'append-paragraph'; append.ariaLabel = 'Add paragraph';
        append.textContent = source.trim() ? '+' : 'start writing…';
        append.addEventListener('click', () => activate(source.length, source.length));
        fragment.append(append);
      }
      reconcile(fragment);
      article.classList.toggle('is-editing', enabled);
      rendered();
    } catch { notify('could not render this draft · your markdown is still saved'); }
  }
  // Backspace at the very start of a paragraph joins it onto the end of the block above, like a word processor.
  async function joinPrevious() {
    if (!active) return false;
    const text = active.editor.source.replace(/^\s+/, '');
    const block = (from: number, to: number) => source.slice(from, to);
    // Fences, tables, raw HTML and headings, lists or quotes keep their structure; only prose moves up.
    const structured = (value: string) => /^(?:```|~~~|\||<|#{1,6}\s|>|[-*+]\s|\d+[.)]\s)/.test(value.trimStart());
    if (!text || structured(text)) return false;
    const previous = [...article.querySelectorAll<HTMLElement>('[data-edit-from]')]
      .map(node => ({ from: Number(node.dataset.editFrom), to: Number(node.dataset.editTo) }))
      .filter(range => range.to <= active!.from)
      .sort((a, b) => b.to - a.to)[0];
    if (!previous || /^(?:```|~~~|\||<)/.test(block(previous.from, previous.to).trimStart())) return false;
    const head = source.slice(0, previous.to).replace(/[ \t]+$/, '');
    const joint = head.length + 1;
    const next = `${head} ${text}${source.slice(active.to)}`;
    past.push(source); if (past.length > 100) past.shift(); future.length = 0;
    source = next;
    active.editor.view.destroy();
    active = undefined;
    changed();
    await paint();
    const merged = [...article.querySelectorAll<HTMLElement>('[data-edit-from]')].find(node => Number(node.dataset.editFrom) === previous.from);
    if (merged) await activate(previous.from, Number(merged.dataset.editTo), undefined, joint - previous.from);
    settled();
    return true;
  }
  async function activate(from: number, to: number, point?: { x: number; y: number }, offset?: number) {
    if (!enabled) return;
    if (active) {
      const delta = active.editor.source.length - (active.to - active.from);
      if (from >= active.to) { from += delta; to += delta; }
      commit();
      await paint();
      settled();
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
    // Put the caret where the reader clicked; the editor lays text out like the rendered block.
    const caret = offset ?? (point ? editor.view.posAtCoords(point) : null);
    editor.view.dispatch({ selection: { anchor: Math.min(caret ?? editor.view.state.doc.length, editor.view.state.doc.length) } });
    editor.view.dom.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); void finish(); }
      const selection = editor.view.state.selection.main;
      if (event.key === 'Backspace' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey
        && selection.empty && selection.head === 0 && active?.editor === editor) {
        event.preventDefault(); event.stopPropagation();
        void joinPrevious();
      }
    }, true);
    editor.view.dom.addEventListener('focusout', () => {
      setTimeout(() => { if (active?.editor === editor && !editor.view.hasFocus) void finish(); }, 0);
    });
  }
  async function finish() {
    const wasActive = !!active;
    commit();
    await paint();
    if (wasActive) settled();
  }
  const click = (event: MouseEvent) => {
    // Links, buttons and media keep working, so the editable page still reads like the public one.
    if (!enabled || !(event.target instanceof Element) || event.target.closest('.inline-manuscript, .owner-controls, .append-paragraph, .article-navigation, a[href], button, video, summary')) return;
    if (getSelection()?.toString()) return;
    const block = event.target.closest<HTMLElement>('[data-edit-from]');
    if (!block) return;
    event.preventDefault();
    void activate(Number(block.dataset.editFrom), Number(block.dataset.editTo), { x: event.clientX, y: event.clientY });
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
      event.preventDefault(); to.push(source); source = next; changed(); void paint().then(settled);
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
    finish,
    focus() { (active?.editor.view.contentDOM || article.querySelector<HTMLElement>('[data-edit-from], .append-paragraph'))?.focus(); },
    async editIndex(index: number, point?: { x: number; y: number }) {
      const block = article.children[index] as HTMLElement | undefined;
      if (block?.dataset.editFrom) await activate(Number(block.dataset.editFrom), Number(block.dataset.editTo), point);
    },
    async setMetadata(details: Metadata) { metadata = details; if (!active) await paint(); },
    destroy() { ++generation; enabled = false; commit(); article.classList.remove('is-editing'); article.removeEventListener('click', click); article.removeEventListener('keydown', keyboard); },
  };
}
