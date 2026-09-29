import './editor.css';
import toolsHtml from './menu.html?raw';
import { getOwnerSession, signOut } from '../lib/owner-session';
import { parseFrontmatter } from '../lib/markdown.mjs';
import { createArticleEditor } from './article-editor';

type Draft = { id: string; source: string; updated: string; page?: string };
type Page = { slug: string; title: string };
const prefix = 'writing-desk:v1:';
const activeKey = 'writing-desk:active';
const limit = 200_000;
const pagePath = (slug?: string) => !slug || slug === '00-landing' ? '/' : `/${encodeURIComponent(slug)}/`;

function parseDraft(value: string | null): Draft | undefined {
  try {
    const draft = JSON.parse(value || 'null');
    if (typeof draft?.id === 'string' && typeof draft.source === 'string' && draft.source.length <= limit && typeof draft.updated === 'string') return draft;
  } catch { return; }
}
function drafts() {
  const result: Draft[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) { const draft = parseDraft(localStorage.getItem(key)); if (draft) result.push(draft); }
    }
  } catch { return result; }
  return result.sort((a, b) => b.updated.localeCompare(a.updated));
}
const titleOf = (source: string) => source.match(/^#\s+(.+)$/m)?.[1].replace(/[*_`]/g, '').trim() || 'untitled';

export async function startInlineEditor(slug: string, create: boolean, renderControls: () => void, draftId?: string) {
  const session = await getOwnerSession();
  if (!session.authenticated) throw new Error('Sign in again to edit');
  let draft = draftId ? drafts().find(item => item.id === draftId) : !create ? drafts().find(item => item.page === slug) : undefined;
  if (draftId && !draft) throw new Error('Draft unavailable');
  let stored: string | null = draft ? localStorage.getItem(prefix + draft.id) : null;
  if (!draft) {
    let source = '';
    if (!create) {
      const response = await fetch(`/editor/posts/${encodeURIComponent(slug)}.md`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not open this page');
      source = await response.text();
      if (source.length > limit) throw new Error('This page is too large to edit');
    }
    draft = { id: crypto.randomUUID(), source, updated: new Date().toISOString(), ...(!create ? { page: slug } : {}) };
  }
  if (!(await getOwnerSession()).authenticated) throw new Error('Sign in again to edit');
  const current: Draft = draft;
  const article = document.querySelector<HTMLElement>('[data-reader-content]')!;
  const original = article.innerHTML;
  document.body.insertAdjacentHTML('beforeend', toolsHtml);
  const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const tools = element('editor-tools');
  const dialog = element<HTMLDialogElement>('contents');
  const metadata = element<HTMLTextAreaElement>('metadata');
  const fileInput = element<HTMLInputElement>('markdown-file');
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let dirty = false;
  let storageFailed = false;
  let invalidMetadata = false;
  let editing = true;
  let timer: ReturnType<typeof setTimeout>;
  let frontmatter = current.source.match(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)(?:\r?\n)*/)?.[0] || '';
  let published: Page[] = [];
  function notice(message = '') { const error = element('editor-error'); error.textContent = message; error.hidden = !message; }
  const editor = createArticleEditor(article, changed, notice, renderControls, limit - frontmatter.length);
  const source = () => frontmatter + editor.source;
  function changed() { dirty = true; clearTimeout(timer); timer = setTimeout(save, 500); }
  function save() {
    clearTimeout(timer);
    if (invalidMetadata) return false;
    if (!dirty) return !storageFailed;
    current.source = source(); current.updated = new Date().toISOString();
    if (current.source.length > limit) { notice('draft too large · download a copy'); return false; }
    try {
      const conflict = localStorage.getItem(prefix + current.id) !== stored;
      if (conflict) current.id = crypto.randomUUID();
      const value = JSON.stringify(current);
      localStorage.setItem(prefix + current.id, value);
      stored = value; dirty = false; storageFailed = false;
      try { sessionStorage.setItem(activeKey, current.id); } catch { /* Keep local storage as the source of truth. */ }
      notice(conflict ? 'another tab changed this draft · kept your edits in a separate copy' : '');
      return true;
    } catch { storageFailed = true; notice('could not save · download a copy from the menu'); return false; }
  }
  function canLeave() { return save() || confirm('this draft could not be saved. download a copy before leaving. leave anyway?'); }
  function menu() {
    if (!editing) return;
    save();
    metadata.value = invalidMetadata ? metadata.value : frontmatter;
    const list = element('documents'); list.replaceChildren();
    for (const [heading, items] of [
      ['drafts', drafts().map(item => ({ title: titleOf(item.source), href: `${pagePath(item.page)}?draft=${encodeURIComponent(item.id)}` }))],
      ['published pages', published.map(item => ({ title: item.title, href: `${pagePath(item.slug)}?edit=1` }))],
    ] as const) {
      const label = document.createElement('h2'); label.textContent = heading;
      const group = document.createElement('ul');
      for (const item of items) {
        const row = document.createElement('li'), link = document.createElement('a');
        link.textContent = item.title; link.href = item.href; row.append(link); group.append(row);
      }
      list.append(label, group);
    }
    if (!dialog.open) dialog.showModal();
  }
  element('close-contents').addEventListener('click', () => { dialog.close(); editor.focus(); }, options);
  element('new-draft').addEventListener('click', () => { if (canLeave()) location.assign('/?create=1'); }, options);
  element('import-draft').addEventListener('click', () => fileInput.click(), options);
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]; fileInput.value = '';
    if (!file || !canLeave()) return;
    if (file.size > limit) { notice('file too large · limit 200 kb'); return; }
    try {
      const imported = { id: crypto.randomUUID(), source: await file.text(), updated: new Date().toISOString() };
      localStorage.setItem(prefix + imported.id, JSON.stringify(imported));
      if (!abort.signal.aborted) location.assign(`/?draft=${imported.id}`);
    } catch { notice('could not import this file'); }
  }, options);
  function download() {
    save();
    const text = invalidMetadata ? metadata.value + '\n\n' + editor.source : source();
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = (titleOf(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 100) || 'draft') + '.md';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  element('export-draft').addEventListener('click', download, options);
  metadata.addEventListener('input', () => {
    const value = metadata.value;
    invalidMetadata = !!value.trim() && !/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n)*$/.test(value);
    metadata.setAttribute('aria-invalid', String(invalidMetadata));
    const error = element('metadata-error'); error.hidden = !invalidMetadata;
    error.textContent = invalidMetadata ? 'enclose page details in --- on separate lines' : '';
    if (invalidMetadata) return;
    frontmatter = value.trim() ? value.replace(/\s*$/, '\n\n') : '';
    changed(); void editor.setMetadata(parseFrontmatter(source()).metadata);
  }, options);
  element('owner-signout').addEventListener('click', async () => {
    if (!canLeave()) return;
    try { await signOut(); location.reload(); } catch { notice('could not sign out · try again'); }
  }, options);
  addEventListener('keydown', event => {
    if (!editing || !(event.metaKey || event.ctrlKey)) return;
    if (event.key.toLowerCase() === 'k') { event.preventDefault(); menu(); }
    if (event.key.toLowerCase() === 's') { event.preventDefault(); if (event.shiftKey) download(); else save(); }
  }, options);
  addEventListener('pagehide', save, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); }, options);
  addEventListener('beforeunload', event => { if ((dirty || invalidMetadata) && !save()) { event.preventDefault(); event.returnValue = ''; } }, options);
  void fetch('/editor/posts.json').then(response => response.ok ? response.json() : []).then(value => { published = value; }).catch(() => {});
  await editor.setSource(current.source.slice(frontmatter.length), parseFrontmatter(current.source).metadata);
  dirty = true; save();
  return {
    get id() { return current.id; },
    get editing() { return editing; },
    canLeave,
    menu,
    async resume() { editing = true; await editor.enable(); },
    async done() { if (!canLeave()) return; editing = false; dialog.close(); await editor.disable(); save(); },
    destroy() { save(); abort.abort(); editor.destroy(); tools.remove(); article.innerHTML = original; renderControls(); },
  };
}
