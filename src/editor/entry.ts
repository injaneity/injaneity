import '../index.css';
import { getOwnerSession } from '../lib/owner-session';

const query = new URLSearchParams(location.search);
async function redirect() {
  try {
    const session = await getOwnerSession();
    if (!session.authenticated) { location.replace('/'); return; }
    const slug = query.get('edit');
    if (slug && /^[a-z0-9_-]+$/i.test(slug)) {
      location.replace(`${slug === '00-landing' ? '/' : `/${slug}/`}?edit=1`);
      return;
    }
    if (query.get('create') === '1') { location.replace('/?create=1'); return; }
    const active = sessionStorage.getItem('writing-desk:active');
    const draft = active ? JSON.parse(localStorage.getItem('writing-desk:v1:' + active) || 'null') : null;
    if (draft?.id) {
      const page = typeof draft.page === 'string' && /^[a-z0-9_-]+$/i.test(draft.page) && draft.page !== '00-landing' ? `/${draft.page}/` : '/';
      location.replace(`${page}?draft=${encodeURIComponent(draft.id)}`);
    } else location.replace('/?create=1');
  } catch { document.getElementById('owner-message')!.textContent = 'could not open editing. return to the article and try again.'; }
}
void redirect();
