import '../index.css';
import './editor.css';
import { signOut } from '../lib/owner-session';

type Draft = { id: string; source: string; updated: string; page?: string };
type PublishedPage = { slug: string; title: string };
type PreviewResult = { revision: number; html?: string; words?: number; error?: string };
const prefix = 'writing-desk:v1:';
const activeKey = 'writing-desk:active';
const limit = 200_000;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = element<HTMLTextAreaElement>('manuscript');
const menu = element('documents');
const contents = element<HTMLDialogElement>('contents');
const saveState = element('save-state');
const previewState = element('preview-state');
const preview = element('preview');
const fileInput = element<HTMLInputElement>('markdown-file');
const shell = document.querySelector<HTMLElement>('.editor-shell')!;
let draft: Draft = { id: crypto.randomUUID(), source: '', updated: new Date().toISOString() };
let savedValue: string | null = null;
let dirty = false;
let storageFailed = false;
let published: PublishedPage[] = [];
let saveTimer: ReturnType<typeof setTimeout>;
let previewTimer: ReturnType<typeof setTimeout>;
let workerTimer: ReturnType<typeof setTimeout>;
let worker: Worker | undefined;
let revision = 0;
let openRequest = 0;
let composing = false;

function titleOf(source: string) {
  return source.match(/^#\s+(.+)$/m)?.[1].replace(/[*_`]/g, '').trim() || 'untitled draft';
}

function parseDraft(value: string | null): Draft | null {
  if (!value) return null;
  try {
    const item = JSON.parse(value);
    return typeof item.id === 'string' && typeof item.source === 'string' && item.source.length <= limit && typeof item.updated === 'string' ? item : null;
  } catch { return null; }
}

function draftOptions() {
  const drafts: Draft[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const item = parseDraft(localStorage.getItem(key));
      if (item) drafts.push(item);
    }
  } catch { /* The writing surface still works when storage is unavailable. */ }
  return drafts.sort((a, b) => b.updated.localeCompare(a.updated));
}

function refreshMenu() {
  menu.replaceChildren();
  function section(label: string, items: { title: string; value: string }[]) {
    if (!items.length) return;
    const heading = document.createElement('h2');
    heading.textContent = label;
    const list = document.createElement('ol');
    for (const [index, item] of items.entries()) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.open = item.value;
      if (item.value === `draft:${draft.id}`) button.setAttribute('aria-current', 'page');
      const number = document.createElement('span');
      number.className = 'contents-number';
      number.setAttribute('aria-hidden', 'true');
      number.textContent = String(index + 1).padStart(2, '0');
      const title = document.createElement('span');
      title.className = 'contents-entry-title';
      title.textContent = item.title;
      button.append(number, title);
      row.append(button);
      list.append(row);
    }
    menu.append(heading, list);
  }
  const drafts = draftOptions();
  if (!drafts.some((item) => item.id === draft.id)) drafts.unshift(draft);
  section('drafts', drafts.map((item) => ({ title: titleOf(item.source), value: `draft:${item.id}` })));
  section('published pages', published.map((page) => ({ title: page.title, value: `post:${page.slug}` })));
}

element('open-contents').addEventListener('click', () => {
  save();
  refreshMenu();
  contents.showModal();
});
element('close-contents').addEventListener('click', () => contents.close());
contents.addEventListener('click', (event) => {
  if (event.target !== contents) return;
  const bounds = contents.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) contents.close();
});

function save() {
  clearTimeout(saveTimer);
  if (!dirty) return !storageFailed;
  draft.source = input.value;
  draft.updated = new Date().toISOString();
  try {
    // Never overwrite a newer copy written by another tab.
    const current = localStorage.getItem(prefix + draft.id);
    const forked = current !== savedValue;
    if (forked) draft.id = crypto.randomUUID();
    const value = JSON.stringify(draft);
    localStorage.setItem(prefix + draft.id, value);
    savedValue = value;
    dirty = false;
    storageFailed = false;
    try { sessionStorage.setItem(activeKey, draft.id); } catch { /* Optional convenience only. */ }
    saveState.textContent = forked ? 'saved a separate copy · another tab changed this draft' : 'saved locally';
    refreshMenu();
    return true;
  } catch {
    storageFailed = true;
    saveState.textContent = 'not saved · browser storage unavailable or full · export a backup';
    return false;
  }
}

function renderPreview() {
  clearTimeout(previewTimer);
  if (composing) return;
  if (shell.dataset.mode === 'write') { updateWordCount(); return; }
  if (!worker) {
    worker = new Worker(new URL('./preview.worker.mjs', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<PreviewResult>) => {
      if (data.revision !== revision) return;
      clearTimeout(workerTimer);
      if (data.error) { previewState.textContent = data.error; return; }
      // The worker sanitizes raw HTML before applying trusted article transforms.
      preview.innerHTML = data.html || '';
      preview.querySelectorAll('[data-copy-code]').forEach((button) => { button.textContent = 'copy'; });
      element('word-count').textContent = `${data.words || 0} words`;
      previewState.textContent = '';
    };
    worker.onerror = () => {
      clearTimeout(workerTimer);
      worker?.terminate();
      worker = undefined;
      previewState.textContent = 'preview unavailable · keep writing or export your draft';
    };
  }
  previewState.textContent = '';
  worker.postMessage({ revision, source: input.value });
  clearTimeout(workerTimer);
  workerTimer = setTimeout(() => {
    worker?.terminate();
    worker = undefined;
    previewState.textContent = 'preview paused for a complex draft · edit to retry';
  }, 8000);
}

function changed() {
  draft.source = input.value;
  revision++;
  dirty = true;
  saveState.textContent = 'saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 160);
  if (shell.dataset.mode === 'write') updateWordCount();
}

function updateWordCount() {
  const body = input.value.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
  element('word-count').textContent = `~ ${body.trim().split(/\s+/u).filter(Boolean).length} words`;
}

function canSwitch() {
  return save() || confirm('this draft could not be saved. export it first to keep a copy. leave this draft anyway?');
}

function showDraft(next: Draft, stored: string | null = null) {
  clearTimeout(saveTimer);
  draft = next;
  savedValue = stored;
  input.value = next.source;
  input.scrollTop = 0;
  preview.parentElement!.scrollTop = 0;
  dirty = true;
  storageFailed = false;
  revision++;
  save();
  refreshMenu();
  renderPreview();
  contents.close();
}

function newDraft(source: string, page?: string) {
  showDraft({ id: crypto.randomUUID(), source, updated: new Date().toISOString(), ...(page ? { page } : {}) });
}

input.maxLength = limit;
input.addEventListener('input', changed);
input.addEventListener('compositionstart', () => { composing = true; });
input.addEventListener('compositionend', () => { composing = false; changed(); });

element('new-draft').addEventListener('click', () => {
  if (!canSwitch()) return;
  openRequest++;
  newDraft('');
  input.focus();
});

menu.addEventListener('click', async (event) => {
  const selected = (event.target as Element).closest<HTMLButtonElement>('[data-open]')?.dataset.open;
  if (!selected || !canSwitch()) { refreshMenu(); return; }
  contents.close();
  openRequest++;
  if (selected.startsWith('draft:')) {
    try {
      const value = localStorage.getItem(prefix + selected.slice(6));
      const item = parseDraft(value);
      if (item) showDraft(item, value);
      else saveState.textContent = 'draft unavailable · your current text is unchanged';
    } catch { saveState.textContent = 'could not open browser storage'; }
    return;
  }
  const page = published.find((item) => `post:${item.slug}` === selected);
  if (!page) return;
  await openPublished(page);
});

async function openPublished(page: PublishedPage) {
  const existing = draftOptions().find((item) => item.page === page.slug);
  if (existing) {
    const value = localStorage.getItem(prefix + existing.id);
    showDraft(existing, value);
    return true;
  }
  const request = ++openRequest;
  const sourceRevision = revision;
  saveState.textContent = 'opening…';
  try {
    const response = await fetch(`/editor/posts/${encodeURIComponent(page.slug)}.md`);
    if (!response.ok) throw new Error('Missing source');
    const source = await response.text();
    if (source.length > limit) throw new Error('Too large');
    if (request !== openRequest) return;
    if (revision !== sourceRevision && !canSwitch()) return;
    newDraft(source, page.slug);
    return true;
  } catch { if (request === openRequest) saveState.textContent = 'could not open that page · your draft is unchanged'; }
  return false;
}

element('import-draft').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file || !canSwitch()) return;
  if (file.size > limit) { saveState.textContent = 'file too large · import markdown under 200 kb'; return; }
  const request = ++openRequest;
  try {
    const source = await file.text();
    if (request !== openRequest || !canSwitch()) return;
    newDraft(source);
  } catch { saveState.textContent = 'could not read that file · your draft is unchanged'; }
});

element('export-draft').addEventListener('click', () => {
  save();
  const url = URL.createObjectURL(new Blob([input.value], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${titleOf(input.value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 100) || 'draft'}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
});

function setMode(mode: string) {
  shell.dataset.mode = mode;
  document.querySelectorAll<HTMLButtonElement>('.view-tools button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  renderPreview();
}
document.querySelectorAll<HTMLButtonElement>('.view-tools button').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode!)));
const mobile = matchMedia('(max-width: 700px)');
if (mobile.matches) setMode('write');
mobile.addEventListener('change', () => { if (mobile.matches && shell.dataset.mode === 'split') setMode('write'); });

// Following a preview link must not navigate away from an unsaved manuscript.
preview.addEventListener('click', async (event) => {
  const target = event.target as Element;
  const copy = target.closest('[data-copy-code]');
  if (copy) {
    try {
      await navigator.clipboard.writeText(copy.closest('.code-block-wrapper')?.querySelector('code')?.textContent || '');
      copy.setAttribute('aria-label', 'copied');
    } catch { previewState.textContent = 'clipboard unavailable · select and copy the code'; }
  }
  const link = target.closest<HTMLAnchorElement>('a');
  if (!link) return;
  event.preventDefault();
  const href = link.getAttribute('href');
  if (href?.startsWith('#')) {
    try { preview.querySelector(`#${CSS.escape(decodeURIComponent(href.slice(1)))}`)?.scrollIntoView({ block: 'start' }); } catch { /* Invalid fragment. */ }
  } else if (href) window.open(link.href, '_blank', 'noopener,noreferrer');
});

addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save(); }
});
addEventListener('pagehide', save);
addEventListener('owner-session-ended', save);
element('owner-signout').addEventListener('click', async () => {
  if (!canSwitch()) return;
  try { await signOut(); location.assign('/'); }
  catch { saveState.textContent = 'could not sign out · check your connection and try again'; }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('beforeunload', (event) => { if (dirty && !save()) { event.preventDefault(); event.returnValue = ''; } });

try {
  const id = sessionStorage.getItem(activeKey);
  const saved = id ? localStorage.getItem(prefix + id) : null;
  const restored = parseDraft(saved);
  if (restored) { draft = restored; savedValue = saved; }
} catch { /* Storage failure is shown by save(), without blocking typing. */ }
showDraft(draft, savedValue);
const route = new URLSearchParams(location.search);
const requestedPage = route.get('edit');
if (route.get('create') === '1') {
  newDraft('');
  history.replaceState(null, '', '/editor/');
}
fetch('/editor/posts.json').then(async (response) => {
  if (!response.ok) throw new Error('Missing index');
  published = await response.json();
  refreshMenu();
  if (requestedPage) {
    const page = published.find((item) => item.slug === requestedPage);
    if (!page) { saveState.textContent = 'that page is not available · choose a page from contents'; return; }
    if (await openPublished(page)) history.replaceState(null, '', '/editor/');
  }
}).catch(() => { saveState.textContent = 'published pages unavailable · local drafts still work'; });
