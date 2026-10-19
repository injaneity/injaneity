const owner = { id: 44902825, login: 'injaneity' };
const sessionSeconds = 8 * 60 * 60;
const flowSeconds = 10 * 60;
const encoder = new TextEncoder();

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid encoding');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (character) => character.charCodeAt(0));
}
function randomValue() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
async function signingKey(config) {
  return crypto.subtle.importKey('raw', encoder.encode(config.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
// The GitHub token lives only inside the HttpOnly session cookie, encrypted with a key derived from AUTH_SECRET.
async function tokenKey(config) {
  const material = await crypto.subtle.digest('SHA-256', encoder.encode(`portfolio-github-token:${config.secret}`));
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function sealToken(token, config) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(config), encoder.encode(token)));
  return `${base64url(iv)}.${base64url(sealed)}`;
}
async function openToken(value, config) {
  if (typeof value !== 'string') return null;
  const [iv, sealed, extra] = value.split('.');
  if (!iv || !sealed || extra) return null;
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv) }, await tokenKey(config), decode(sealed)));
  } catch { return null; }
}

function configuration(env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.AUTH_SECRET || env.AUTH_SECRET.length < 32 || !env.AUTH_ORIGIN) return null;
  try {
    const url = new URL(env.AUTH_ORIGIN);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    return { origin: url.origin, host: url.host, secure: url.protocol === 'https:',
      clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET, secret: env.AUTH_SECRET };
  } catch { return null; }
}

async function sign(value, config) {
  const encoded = base64url(encoder.encode(JSON.stringify({ ...value, aud: config.origin })));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(config), encoder.encode(encoded));
  return `${encoded}.${base64url(new Uint8Array(signature))}`;
}

async function verify(value, kind, config, now) {
  if (!value || value.length > 4096) return null;
  const [encoded, signature, extra] = value.split('.');
  if (!encoded || !signature || extra) return null;
  try {
    const actual = decode(signature);
    if (actual.length !== 32 || !await crypto.subtle.verify('HMAC', await signingKey(config), actual, encoder.encode(encoded))) return null;
    const data = JSON.parse(new TextDecoder().decode(decode(encoded)));
    if (data.kind !== kind || data.aud !== config.origin || !Number.isFinite(data.exp) || data.exp <= now) return null;
    return data;
  } catch { return null; }
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }));
}

function cookieName(kind, config) { return `${config.secure ? '__Host-' : ''}portfolio_${kind}`; }
function cookie(kind, value, maxAge, config) {
  return `${cookieName(kind, config)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.secure ? '; Secure' : ''}`;
}

function safeReturnTo(input, origin) {
  if (!input || !input.startsWith('/') || input.startsWith('//') || /[\\\u0000-\u0020]/u.test(input)) return '/';
  try {
    const target = new URL(input, origin);
    if (target.origin !== origin || !/^\/(?:[a-z0-9_-]+\/?)?$/i.test(target.pathname)) return '/';
    return target.pathname + (target.pathname.replace(/\/$/, '') === '/editor' ? target.search : '') + target.hash;
  } catch { return '/'; }
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
function redirect(res, location) { res.statusCode = 303; res.setHeader('Location', location); res.end(); }

// Returns the owner's GitHub token for a request, or null when the session is missing, expired or predates publishing.
export async function ownerToken(req, env, clock = () => Date.now()) {
  const config = configuration(env);
  if (!config) return null;
  const session = await verify(cookies(req)[cookieName('session', config)], 'session', config, Math.floor(clock() / 1000));
  if (session?.sub !== owner.id || session?.login !== owner.login) return null;
  return { config, token: await openToken(session.gh, config) };
}

// Shared by the local preview and the deployment adapter. The access token is kept only encrypted in the session cookie.
export function createAuthHandler({ env = {}, fetcher = fetch, clock = () => Date.now(),
  reportFailure = (failure) => console.warn('owner-auth-failure', JSON.stringify(failure)) } = {}) {
  return async function auth(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const config = configuration(env);
    const url = new URL(req.url, config?.origin || 'http://localhost');
    const action = url.pathname.match(/^\/api\/auth\/([a-z]+)\/?$/)?.[1];
    if (!['session', 'login', 'callback', 'logout'].includes(action)) return json(res, 404, { error: 'not found' });
    const method = action === 'logout' ? 'POST' : 'GET';
    if (req.method !== method) { res.setHeader('Allow', method); return json(res, 405, { error: 'method not allowed' }); }
    if (!config) return json(res, action === 'session' ? 200 : 503, { authenticated: false, configured: false, error: 'github sign-in is not configured' });
    // Never construct OAuth redirects from a client-supplied Host header.
    if (String(req.headers.host || '').toLowerCase() !== config.host.toLowerCase()) return json(res, 403, { error: 'unexpected host' });
    const now = Math.floor(clock() / 1000);
    const jar = cookies(req);
    const session = await verify(jar[cookieName('session', config)], 'session', config, now);
    const isOwner = session?.sub === owner.id && session?.login === owner.login;

    if (action === 'session') return json(res, 200, { authenticated: isOwner, configured: true,
      ...(isOwner ? { login: owner.login, expiresAt: session.exp * 1000, canPublish: typeof session.gh === 'string' } : {}) });

    if (action === 'logout') {
      if (req.headers.origin !== config.origin) return json(res, 403, { error: 'invalid origin' });
      res.setHeader('Set-Cookie', [cookie('session', '', 0, config), cookie('oauth', '', 0, config)]);
      const token = isOwner ? await openToken(session.gh, config) : null;
      // Best effort: revoke the token at GitHub so a copied cookie stops working too.
      if (token) await fetcher(`https://api.github.com/applications/${config.clientId}/token`, {
        method: 'DELETE', headers: { Accept: 'application/vnd.github+json', Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
          'Content-Type': 'application/json', 'User-Agent': 'zanechee-portfolio' }, body: JSON.stringify({ access_token: token }),
        signal: AbortSignal.timeout(5000), redirect: 'manual',
      }).catch(() => {});
      return json(res, 200, { authenticated: false });
    }

    const callback = `${config.origin}/api/auth/callback`;
    if (action === 'login') {
      const next = safeReturnTo(url.searchParams.get('returnTo'), config.origin);
      if (isOwner) return redirect(res, next);
      const state = randomValue();
      const verifier = randomValue();
      res.setHeader('Set-Cookie', cookie('oauth', await sign({ kind: 'oauth', state, verifier, next, exp: now + flowSeconds }, config), flowSeconds, config));
      const github = new URL('https://github.com/login/oauth/authorize');
      github.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: callback,
        scope: 'public_repo', state, code_challenge: base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier)))),
        code_challenge_method: 'S256', allow_signup: 'false' }).toString();
      return redirect(res, github.href);
    }

    res.setHeader('Set-Cookie', cookie('oauth', '', 0, config));
    const flow = await verify(jar[cookieName('oauth', config)], 'oauth', config, now);
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!flow || typeof state !== 'string' || state !== flow.state || typeof flow.verifier !== 'string') return redirect(res, '/signin/?auth=invalid');
    if (url.searchParams.has('error')) return redirect(res, '/signin/?auth=cancelled');
    if (!code || code.length > 512) return redirect(res, '/signin/?auth=invalid');
    let stage = 'token-request';
    let status;
    let providerError;
    try {
      const exchange = await fetcher('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code,
          redirect_uri: callback, code_verifier: flow.verifier }), signal: AbortSignal.timeout(10_000), redirect: 'manual',
      });
      status = exchange.status;
      stage = 'token-response';
      // Workers does not support redirect: 'error'. Manual mode plus this check
      // rejects redirects without forwarding the client secret or access token.
      if (!exchange.ok) throw new Error('exchange failed');
      const token = await exchange.json();
      const knownErrors = ['incorrect_client_credentials', 'redirect_uri_mismatch', 'bad_verification_code', 'unverified_user_email'];
      if (knownErrors.includes(token.error)) providerError = token.error;
      if (typeof token.access_token !== 'string' || !token.access_token || token.error) throw new Error('no access token');
      stage = 'profile-request';
      status = undefined;
      const profile = await fetcher('https://api.github.com/user', {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token}`,
          'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'zanechee-portfolio' }, signal: AbortSignal.timeout(10_000), redirect: 'manual',
      });
      status = profile.status;
      stage = 'profile-response';
      if (!profile.ok) throw new Error('profile failed');
      const user = await profile.json();
      if (user.id !== owner.id || String(user.login).toLowerCase() !== owner.login) {
        res.setHeader('Set-Cookie', [cookie('oauth', '', 0, config), cookie('session', '', 0, config)]);
        return redirect(res, '/signin/?auth=denied');
      }
      stage = 'session-signing';
      status = undefined;
      res.setHeader('Set-Cookie', [cookie('oauth', '', 0, config), cookie('session', await sign({ kind: 'session', sub: owner.id,
        login: owner.login, gh: await sealToken(token.access_token, config), exp: now + sessionSeconds }, config), sessionSeconds, config)]);
      return redirect(res, safeReturnTo(flow.next, config.origin));
    } catch (error) {
      // Never expose codes, tokens, provider response bodies, or secrets in errors.
      const category = ['TypeError', 'SyntaxError', 'TimeoutError', 'AbortError'].includes(error?.name) ? error.name : 'Error';
      reportFailure({ stage, category, ...(status ? { status } : {}), ...(providerError ? { providerError } : {}) });
      return redirect(res, '/signin/?auth=failed');
    }
  };
}
