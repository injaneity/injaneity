export type OwnerSession = { authenticated: boolean; configured: boolean; login?: string; expiresAt?: number };

export async function getOwnerSession(): Promise<OwnerSession> {
  const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('session unavailable');
  const value = await response.json();
  if (typeof value.authenticated !== 'boolean' || typeof value.configured !== 'boolean') throw new Error('invalid session response');
  if (value.authenticated && (value.login !== 'injaneity' || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now())) throw new Error('invalid owner session');
  return value;
}

export function watchOwnerSession(onChange: (session: OwnerSession | null) => void) {
  let pending = false;
  let expiry: ReturnType<typeof setTimeout>;
  const refresh = async () => {
    if (pending || document.hidden) return;
    pending = true;
    try {
      const session = await getOwnerSession();
      clearTimeout(expiry);
      if (session.authenticated && session.expiresAt) expiry = setTimeout(refresh, Math.max(0, session.expiresAt - Date.now()) + 50);
      onChange(session);
    } catch { onChange(null); }
    finally { pending = false; }
  };
  addEventListener('pageshow', refresh);
  addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  void refresh();
  return refresh;
}

export async function signOut() {
  const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('sign out failed');
}
