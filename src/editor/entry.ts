import '../index.css';
import './editor.css';
import { watchOwnerSession } from '../lib/owner-session';

const gate = document.getElementById('owner-gate')!;
const message = document.getElementById('owner-message')!;
const retry = document.getElementById('owner-retry')!;
const desk = document.querySelector<HTMLElement>('.editor-shell')!;
let loaded = false;
let latestAuthenticated = false;
let loading: Promise<unknown> | undefined;

const refresh = watchOwnerSession(async (session) => {
  latestAuthenticated = session?.authenticated === true;
  if (!latestAuthenticated) {
    dispatchEvent(new Event('owner-session-ended'));
    (document.getElementById('contents') as HTMLDialogElement).close();
    desk.hidden = true;
    gate.hidden = false;
    retry.hidden = session !== null;
    message.textContent = !session ? 'could not check access. please try again.' : 'this page is no longer available.';
    if (session) location.reload();
    return;
  }
  try {
    if (!loaded) {
      loading ??= import('./main');
      await loading;
      loaded = true;
    }
    if (!latestAuthenticated) return;
    gate.hidden = true;
    desk.hidden = false;
  } catch {
    loading = undefined;
    message.textContent = 'the editor could not load. your saved drafts are unchanged.';
    retry.hidden = false;
  }
});
retry.addEventListener('click', refresh);
