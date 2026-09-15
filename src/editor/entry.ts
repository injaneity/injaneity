import '../index.css';
import './editor.css';
import { watchOwnerSession } from '../lib/owner-session';

const gate = document.getElementById('owner-gate')!;
const message = document.getElementById('owner-message')!;
const signIn = document.getElementById('owner-signin') as HTMLAnchorElement;
const retry = document.getElementById('owner-retry')!;
const desk = document.querySelector<HTMLElement>('.editor-shell')!;
let loaded = false;
let latestAuthenticated = false;
let loading: Promise<unknown> | undefined;
const errors: Record<string, string> = {
  denied: 'this desk is restricted to injaneity. sign in with that github account.',
  invalid: 'that sign-in link expired or could not be verified. please try again.',
  cancelled: 'github sign-in was cancelled. your drafts are unchanged.',
  failed: 'github sign-in could not finish. please try again.',
};
const params = new URLSearchParams(location.search);
const authError = errors[params.get('auth') || ''];
params.delete('auth');
const next = '/editor/' + (params.size ? `?${params}` : '');
signIn.href = `/api/auth/login?returnTo=${encodeURIComponent(next)}`;

const refresh = watchOwnerSession(async (session) => {
  latestAuthenticated = session?.authenticated === true;
  if (!latestAuthenticated) {
    dispatchEvent(new Event('owner-session-ended'));
    (document.getElementById('contents') as HTMLDialogElement).close();
    desk.hidden = true;
    gate.hidden = false;
    signIn.hidden = !session?.configured;
    retry.hidden = session !== null;
    message.textContent = !session ? 'could not check sign-in. check your connection and try again.'
      : !session.configured ? 'github sign-in needs its server settings. see docs/github-sign-in.md in the project.'
        : authError || 'sign in with github to create a post or edit the page you were reading.';
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
