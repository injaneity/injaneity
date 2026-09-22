import '../index.css';
import './editor.css';
import { signOut } from '../lib/owner-session';
import { createLiveEditor } from './live-markdown';

type Draft = { id: string; source: string; updated: string; page?: string };
type PublishedPage = { slug: string; title: string };
const prefix = 'writing-desk:v1:';
const activeKey = 'writing-desk:active';
const limit = 200_000;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const menu = element('documents');
const contents = element<HTMLDialogElement>('contents');
const error = element('editor-error');
const metadata = element<HTMLTextAreaElement>('metadata');
const fileInput = element<HTMLInputElement>('markdown-file');
let draft: Draft = { id: crypto.randomUUID(), source: '', updated: new Date().toISOString() };
let savedValue: string | null = null;
let frontmatter = '';
let dirty = false;
let storageFailed = false;
let metadataInvalid = false;
let saveTimer: ReturnType<typeof setTimeout>;
let revision = 0;
let openRequest = 0;
let published: PublishedPage[] = [];

function notice(message = '') { error.textContent = message; error.hidden = !message; }
const editor = createLiveEditor(element('manuscript'), changed, () => notice('this draft is too large · limit 200 kb'), limit);

function titleOf(source: string) {
  return source.match(/^#\s+(.+)$/m)?.[1].replace(/[*_\x60]/g, '').trim() || 'untitled';
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
  } catch { /* Editing remains available if storage is blocked. */ }
  return drafts.sort((a, b) => b.updated.localeCompare(a.updated));
}
function refreshMenu() {
  menu.replaceChildren();
  const drafts = draftOptions();
  if (!drafts.some(item => item.id === draft.id)) drafts.unshift(draft);
  for (const [label, items] of [
    ['drafts', drafts.map(item => ({ title: titleOf(item.source), value: 'draft:' + item.id }))],
    ['published pages', published.map(page => ({ title: page.title, value: 'post:' + page.slug }))],
  ] as const) {
    if (!items.length) continue;
    const heading = document.createElement('h2'); heading.textContent = label;
    const list = document.createElement('ul');
    for (const item of items) {
      const row = document.createElement('li'), button = document.createElement('button');
      button.type = 'button'; button.dataset.open = item.value; button.textContent = item.title;
      if (item.value === 'draft:' + draft.id) button.setAttribute('aria-current', 'page');
      row.append(button); list.append(row);
    }
    menu.append(heading, list);
  }
}
function source() { return frontmatter + editor.source; }
function save() {
  clearTimeout(saveTimer);
  if (metadataInvalid) return false;
  if (!dirty) return !storageFailed;
  draft.source = source();
  if (draft.source.length > limit) { notice('this draft is too large · shorten it or download a copy'); return false; }
  draft.updated = new Date().toISOString();
  try {
    const current = localStorage.getItem(prefix + draft.id);
    const forked = current !== savedValue;
    if (forked) draft.id = crypto.randomUUID();
    const value = JSON.stringify(draft);
    localStorage.setItem(prefix + draft.id, value);
    savedValue = value; dirty = false; storageFailed = false;
    try { sessionStorage.setItem(activeKey, draft.id); } catch { /* Optional convenience. */ }
    notice(forked ? 'another tab changed this draft · kept your edits in a separate copy' : '');
    return true;
  } catch {
    storageFailed = true;
    notice('could not save · download a copy from the menu');
    return false;
  }
}
function changed() {
  revision++; dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}
function canSwitch() {
  return save() || confirm('this draft could not be saved. download it first to keep a copy. leave anyway?');
}
function showDraft(next: Draft, stored: string | null = null) {
  clearTimeout(saveTimer);
  draft = next; savedValue = stored;
  // Preserve frontmatter verbatim, outside the prose surface.
  frontmatter = next.source.match(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)(?:\r?\n)*/)?.[0] || '';
  metadata.value = frontmatter;
  metadataInvalid = false;
  metadata.removeAttribute('aria-invalid');
  editor.setSource(next.source.slice(frontmatter.length));
  dirty = true; storageFailed = false; revision++;
  save(); contents.close();
}
function newDraft(text = '', page?: string) {
  showDraft({ id: crypto.randomUUID(), source: text, updated: new Date().toISOString(), ...(page ? { page } : {}) });
}
function openMenu() {
  save(); refreshMenu(); metadata.value = metadataInvalid ? metadata.value : frontmatter;
  if (!contents.open) contents.showModal();
}
function closeMenu() { contents.close(); editor.view.focus(); }
element('open-contents').addEventListener('click', openMenu);
element('close-contents').addEventListener('click', closeMenu);
contents.addEventListener('click', event => {
  if (event.target !== contents) return;
  const bounds = contents.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeMenu();
});
metadata.addEventListener('input', () => {
  const value = metadata.value;
  metadataInvalid = !!value.trim() && !/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n)*$/.test(value);
  metadata.setAttribute('aria-invalid', String(metadataInvalid));
  if (metadataInvalid) { notice('page details must be enclosed by --- on separate lines'); return; }
  frontmatter = value.trim() ? value.replace(/\s*$/, '\n\n') : '';
  notice(); changed();
});
element('new-draft').addEventListener('click', () => {
  if (!canSwitch()) return;
  openRequest++; newDraft(); editor.view.focus();
});
async function openPublished(page: PublishedPage) {
  try {
    const existing = draftOptions().find(item => item.page === page.slug);
    if (existing) { showDraft(existing, localStorage.getItem(prefix + existing.id)); return true; }
  } catch { notice('could not open browser storage'); return false; }
  const request = ++openRequest, sourceRevision = revision;
  try {
    const response = await fetch('/editor/posts/' + encodeURIComponent(page.slug) + '.md');
    if (!response.ok) throw new Error('Missing source');
    const text = await response.text();
    if (text.length > limit) throw new Error('Too large');
    if (request !== openRequest) return false;
    if (revision !== sourceRevision) { notice('the page loaded after you started writing · open it again from the menu'); return false; }
    newDraft(text, page.slug);
    return true;
  } catch { if (request === openRequest) notice('could not open that page · your draft is unchanged'); }
  return false;
}
menu.addEventListener('click', async event => {
  const selected = (event.target as Element).closest<HTMLButtonElement>('[data-open]')?.dataset.open;
  if (!selected || !canSwitch()) return;
  openRequest++;
  if (selected.startsWith('draft:')) {
    try {
      const value = localStorage.getItem(prefix + selected.slice(6)), item = parseDraft(value);
      if (item) showDraft(item, value); else notice('draft unavailable');
    } catch { notice('could not open browser storage'); }
  } else {
    const page = published.find(item => 'post:' + item.slug === selected);
    if (page) await openPublished(page);
  }
});
element('import-draft').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]; fileInput.value = '';
  if (!file || !canSwitch()) return;
  if (file.size > limit) { notice('file too large · limit 200 kb'); return; }
  const request = ++openRequest, sourceRevision = revision;
  try {
    const text = await file.text();
    if (request !== openRequest || revision !== sourceRevision) return;
    newDraft(text);
  } catch { notice('could not read that file'); }
});
function download() {
  save();
  const text = metadataInvalid ? metadata.value + '\n\n' + editor.source : source();
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = (titleOf(source()).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 100) || 'draft') + '.md';
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
element('export-draft').addEventListener('click', download);
addEventListener('keydown', event => {
  if (!(event.metaKey || event.ctrlKey)) return;
  if (event.key.toLowerCase() === 'k') { event.preventDefault(); openMenu(); }
  if (event.key.toLowerCase() === 's') { event.preventDefault(); if (event.shiftKey) download(); else save(); }
});
addEventListener('pagehide', save);
addEventListener('owner-session-ended', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('beforeunload', event => { if ((dirty || metadataInvalid) && !save()) { event.preventDefault(); event.returnValue = ''; } });
element('owner-signout').addEventListener('click', async () => {
  if (!canSwitch()) return;
  try { await signOut(); location.assign('/'); } catch { notice('could not sign out · try again'); }
});

const route = new URLSearchParams(location.search);
const requestedPage = route.get('edit');
try {
  const id = sessionStorage.getItem(activeKey);
  const saved = id ? localStorage.getItem(prefix + id) : null;
  const restored = parseDraft(saved);
  if (restored && route.get('create') !== '1') { draft = restored; savedValue = saved; }
} catch { /* save() reports storage failures. */ }
showDraft(draft, savedValue);
const initialRevision = revision;
if (route.get('create') === '1') history.replaceState(null, '', '/editor/');
fetch('/editor/posts.json').then(async response => {
  if (!response.ok) throw new Error('Missing index');
  published = await response.json();
  if (requestedPage) {
    if (revision !== initialRevision) { notice('you started writing · open the requested page from the menu'); return; }
    const page = published.find(item => item.slug === requestedPage);
    if (!page) { notice('that page is not available'); return; }
    if (await openPublished(page)) history.replaceState(null, '', '/editor/');
  }
}).catch(() => { notice('published pages unavailable · your drafts are unchanged'); });
