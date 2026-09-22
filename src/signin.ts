import './index.css';
import './editor/editor.css';
import { getOwnerSession } from './lib/owner-session';

const message = document.getElementById('signin-message')!;
const link = document.getElementById('signin-link') as HTMLAnchorElement;
const retry = document.getElementById('signin-retry')!;
const errors: Record<string, string> = {
  denied: 'this account cannot open the writing desk.',
  invalid: 'that sign-in expired. please try again.',
  cancelled: 'sign-in was cancelled.',
  failed: 'sign-in could not finish. please try again.',
};
const error = errors[new URLSearchParams(location.search).get('auth') || ''];
async function check() {
  retry.hidden = true;
  try {
    const session = await getOwnerSession();
    if (session.authenticated) { location.replace('/'); return; }
    link.hidden = !session.configured;
    message.textContent = session.configured ? error || 'sign in to open your writing desk.' : 'sign-in is not available yet.';
  } catch {
    link.hidden = true;
    retry.hidden = false;
    message.textContent = 'could not check sign-in. please try again.';
  }
}
retry.addEventListener('click', check);
void check();
