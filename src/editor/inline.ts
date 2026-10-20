import './editor.css';
import toolsHtml from './menu.html?raw';
import { getOwnerSession, signOut } from '../lib/owner-session';
import { parseFrontmatter } from '../lib/markdown.mjs';
import { createArticleEditor } from './article-editor';

// `published` is the source last confirmed on GitHub; a draft whose source differs has edits still to publish.
type Draft = { id: string; source: string; updated: string; page?: string; sha?: string; published?: string };
type Page = { slug: string; title: string };
type Remote = { source: string; sha: string };
const prefix = 'writing-desk:v1:';
const activeKey = 'writing-desk:active';
const limit = 200_000;
const pagePath = (slug?: string) => !slug || slug === '00-landing' ? '/' : `/${encodeURIComponent(slug)}/`;
const pending = (draft: Draft) => draft.published === undefined ? !!draft.source.trim() : draft.source !== draft.published;

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

async function fetchRemote(page: string): Promise<Remote | number> {
  const response = await fetch(`/api/content/${encodeURIComponent(page)}`, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) return response.status;
  const value = await response.json();
  if (typeof value?.source !== 'string' || typeof value.sha !== 'string') throw new Error('invalid page response');
  return value;
}
const slugOf = (source: string) => titleOf(source).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);

export async function startInlineEditor(slug: string, create: boolean, renderControls: () => void, draftId?: string) {
  const session = await getOwnerSession();
  if (!session.authenticated) throw new Error('Sign in again to edit');
  let canPublish = session.canPublish === true;
  const explicit = draftId ? drafts().find(item => item.id === draftId) : undefined;
  if (draftId && !explicit) throw new Error('Draft unavailable');
  const page = create ? undefined : explicit ? explicit.page : slug;
  // The live source comes from GitHub, so edits never start from a stale build.
  let remote: Remote | undefined;
  if (page && canPublish) {
    try {
      const result = await fetchRemote(page);
      if (typeof result === 'number') { if (result === 401) canPublish = false; else if (result !== 404) throw new Error('Could not open this page'); }
      else remote = result;
    } catch { canPublish = false; }
  }
  if (page && !remote && !explicit) {
    const response = await fetch(`/source/${encodeURIComponent(page)}.md`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not open this page');
    const source = await response.text();
    remote = { source, sha: '' };
  }
  if (remote && remote.source.length > limit) throw new Error('This page is too large to edit');
  let draft: Draft;
  if (explicit) {
    // Opening a draft on purpose makes it the next version of its page.
    draft = { ...explicit, ...(remote?.sha ? { sha: remote.sha } : {}), published: page ? remote?.source ?? explicit.published : explicit.published };
  } else if (create) {
    draft = { id: crypto.randomUUID(), source: '', updated: new Date().toISOString(), published: '' };
  } else {
    const linked = drafts().find(item => item.page === page && item.published !== undefined);
    // Unpublished edits from an earlier visit win, unless the page changed on GitHub since.
    if (linked && pending(linked) && (!remote?.sha || linked.sha === remote.sha)) draft = linked;
    else draft = { id: linked?.id || crypto.randomUUID(), source: remote!.source, updated: new Date().toISOString(), page, sha: remote!.sha || undefined, published: remote!.source };
  }
  let stored: string | null = localStorage.getItem(prefix + draft.id);
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
  let timer: ReturnType<typeof setTimeout>;
  let publishTimer: ReturnType<typeof setTimeout>;
  let publishing = false;
  let queued = false;
  let status = '';
  let frontmatter = current.source.match(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)(?:\r?\n)*/)?.[0] || '';
  let published: Page[] = [];
  function notice(message = '') { const error = element('editor-error'); error.textContent = message; error.hidden = !message; }
  function setStatus(next: string) { if (next !== status) { status = next; renderControls(); } }
  const editor = createArticleEditor(article, changed, notice, renderControls, () => schedule(1500), limit - frontmatter.length);
  const source = () => frontmatter + editor.source;
  function changed() { dirty = true; clearTimeout(timer); timer = setTimeout(save, 500); setStatus(canPublish ? 'editing' : 'sign in again to publish'); schedule(30_000); }
  function schedule(delay: number) {
    clearTimeout(publishTimer);
    if (canPublish && !abort.signal.aborted) publishTimer = setTimeout(() => void publish(), delay);
  }
  async function publish() {
    clearTimeout(publishTimer);
    if (!canPublish || invalidMetadata || abort.signal.aborted) return;
    if (publishing) { queued = true; return; }
    save();
    if (!pending(current)) { setStatus('published'); return; }
    const target = current.page || slugOf(current.source);
    if (!target) { setStatus('add a title to publish'); return; }
    if (!current.page && !frontmatter) {
      // New pages get a created date so the byline matches the rest of the site.
      frontmatter = `---\ncreated: ${new Date().toLocaleDateString('en-CA')}\n---\n\n`;
      dirty = true; save(); await editor.setMetadata(parseFrontmatter(source()).metadata);
    }
    const text = current.source;
    publishing = true; setStatus('publishing…');
    try {
      const response = await fetch(`/api/content/${encodeURIComponent(target)}`, { method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ source: text, ...(current.page && current.sha ? { sha: current.sha } : {}) }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && typeof result.sha === 'string') {
        Object.assign(current, { page: target, sha: result.sha, published: text });
        dirty = true; save(); notice('');
        setStatus(pending(current) ? 'editing' : 'published · live after the next deploy');
        if (pending(current)) schedule(1500);
        return;
      }
      if (response.status === 409 && current.page) {
        // A save that already landed (for example from a closing tab) is not a real conflict.
        const latest = await fetchRemote(current.page).catch(() => undefined);
        if (latest && typeof latest !== 'number' && latest.source === text) {
          Object.assign(current, { sha: latest.sha, published: text }); dirty = true; save(); setStatus('published'); return;
        }
      }
      if (response.status === 401) canPublish = false;
      setStatus('not published');
      notice(`${result.error || 'could not publish'} · your edits are kept in this browser`);
    } catch {
      setStatus('offline · will retry');
      schedule(15_000);
    } finally {
      publishing = false;
      if (queued) { queued = false; void publish(); }
    }
  }
  function publishOnExit() {
    // Pages can close before an async save finishes, so hand the latest edit to a keepalive request.
    save();
    if (!canPublish || publishing || !current.page || !pending(current) || current.source.length > 60_000) return;
    try {
      void fetch(`/api/content/${encodeURIComponent(current.page)}`, { method: 'PUT', credentials: 'same-origin', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: current.source, ...(current.sha ? { sha: current.sha } : {}) }) }).catch(() => {});
    } catch { /* The draft stays pending and publishes on the next visit. */ }
  }
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
    save();
    metadata.value = invalidMetadata ? metadata.value : frontmatter;
    const list = element('documents'); list.replaceChildren();
    for (const [heading, items] of [
      ['unpublished drafts', drafts().filter(pending).map(item => ({ title: titleOf(item.source), href: `${pagePath(item.page)}?draft=${encodeURIComponent(item.id)}` }))],
      ['published pages', published.map(item => ({ title: item.title, href: pagePath(item.slug) }))],
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
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key.toLowerCase() === 'k') { event.preventDefault(); menu(); }
    if (event.key.toLowerCase() === 's') { event.preventDefault(); if (event.shiftKey) download(); else { save(); void publish(); } }
  }, options);
  addEventListener('pagehide', publishOnExit, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); if (pending(current)) void publish(); } }, options);
  addEventListener('beforeunload', event => { if ((dirty || invalidMetadata) && !save()) { event.preventDefault(); event.returnValue = ''; } }, options);
  void fetch('/source/index.json').then(response => response.ok ? response.json() : []).then(value => { published = value; }).catch(() => {});
  await editor.setSource(current.source.slice(frontmatter.length), parseFrontmatter(current.source).metadata);
  dirty = true; save();
  if (!canPublish) setStatus('sign in again to publish');
  else if (pending(current) && (current.page || current.source.trim())) schedule(1500);
  return {
    get id() { return current.id; },
    get status() { return status; },
    canLeave,
    menu,
    destroy() { save(); clearTimeout(publishTimer); abort.abort(); editor.destroy(); tools.remove(); article.innerHTML = original; renderControls(); },
  };
}

// Visitors can edit too, but nothing is stored or published: a reload brings back the real page.
export async function startVisitorEditor(slug: string) {
  const response = await fetch(`/source/${encodeURIComponent(slug)}.md`);
  if (!response.ok) throw new Error('Could not open this page');
  const text = await response.text();
  if (text.length > limit) throw new Error('This page is too large to edit');
  const frontmatter = text.match(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)(?:\r?\n)*/)?.[0] || '';
  const article = document.querySelector<HTMLElement>('[data-reader-content]')!;
  const original = article.innerHTML;
  const error = document.createElement('p');
  error.id = 'editor-error'; error.setAttribute('role', 'alert'); error.hidden = true;
  const tools = document.createElement('div'); tools.id = 'editor-tools'; tools.append(error);
  document.body.append(tools);
  const notice = (message = '') => { error.textContent = message; error.hidden = !message; };
  const noop = () => {};
  const editor = createArticleEditor(article, noop, notice, noop, noop, limit - frontmatter.length);
  await editor.setSource(text.slice(frontmatter.length), parseFrontmatter(text).metadata);
  return {
    editIndex: (index: number, point?: { x: number; y: number }) => editor.editIndex(index, point),
    destroy() { editor.destroy(); tools.remove(); article.innerHTML = original; },
  };
}
