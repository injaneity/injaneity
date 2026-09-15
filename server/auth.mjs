import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const owner = { id: 44902825, login: 'injaneity' };
const sessionSeconds = 8 * 60 * 60;
const flowSeconds = 10 * 60;

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

function sign(value, config) {
  const encoded = Buffer.from(JSON.stringify({ ...value, aud: config.origin })).toString('base64url');
  return `${encoded}.${createHmac('sha256', config.secret).update(encoded).digest('base64url')}`;
}

function verify(value, kind, config, now) {
  if (!value || value.length > 4096) return null;
  const [encoded, signature, extra] = value.split('.');
  if (!encoded || !signature || extra) return null;
  const expected = createHmac('sha256', config.secret).update(encoded).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString());
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

// Shared by the local preview and the deployment adapter. No access tokens are stored.
export function createAuthHandler({ env = process.env, fetcher = fetch, clock = () => Date.now() } = {}) {
  return async function auth(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const config = configuration(env);
    const url = new URL(req.url, config?.origin || 'http://localhost');
    const action = url.pathname.replace(/\/$/, '').split('/').at(-1);
    if (!['session', 'login', 'callback', 'logout'].includes(action)) return json(res, 404, { error: 'not found' });
    const method = action === 'logout' ? 'POST' : 'GET';
    if (req.method !== method) { res.setHeader('Allow', method); return json(res, 405, { error: 'method not allowed' }); }
    if (!config) return json(res, action === 'session' ? 200 : 503, { authenticated: false, configured: false, error: 'github sign-in is not configured' });
    // Never construct OAuth redirects from a client-supplied Host header.
    if (String(req.headers.host || '').toLowerCase() !== config.host.toLowerCase()) return json(res, 403, { error: 'unexpected host' });
    const now = Math.floor(clock() / 1000);
    const jar = cookies(req);
    const session = verify(jar[cookieName('session', config)], 'session', config, now);
    const isOwner = session?.sub === owner.id && session?.login === owner.login;

    if (action === 'session') return json(res, 200, { authenticated: isOwner, configured: true,
      ...(isOwner ? { login: owner.login, expiresAt: session.exp * 1000 } : {}) });

    if (action === 'logout') {
      if (req.headers.origin !== config.origin) return json(res, 403, { error: 'invalid origin' });
      res.setHeader('Set-Cookie', [cookie('session', '', 0, config), cookie('oauth', '', 0, config)]);
      return json(res, 200, { authenticated: false });
    }

    const callback = `${config.origin}/api/auth/callback`;
    if (action === 'login') {
      const next = safeReturnTo(url.searchParams.get('returnTo'), config.origin);
      if (isOwner) return redirect(res, next);
      const state = randomBytes(32).toString('base64url');
      const verifier = randomBytes(32).toString('base64url');
      res.setHeader('Set-Cookie', cookie('oauth', sign({ kind: 'oauth', state, verifier, next, exp: now + flowSeconds }, config), flowSeconds, config));
      const github = new URL('https://github.com/login/oauth/authorize');
      github.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: callback,
        scope: '', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256', allow_signup: 'false' }).toString();
      return redirect(res, github.href);
    }

    res.setHeader('Set-Cookie', cookie('oauth', '', 0, config));
    const flow = verify(jar[cookieName('oauth', config)], 'oauth', config, now);
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!flow || typeof state !== 'string' || state !== flow.state || typeof flow.verifier !== 'string') return redirect(res, '/editor/?auth=invalid');
    if (url.searchParams.has('error')) return redirect(res, '/editor/?auth=cancelled');
    if (!code || code.length > 512) return redirect(res, '/editor/?auth=invalid');
    try {
      const exchange = await fetcher('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code,
          redirect_uri: callback, code_verifier: flow.verifier }), signal: AbortSignal.timeout(10_000), redirect: 'error',
      });
      if (!exchange.ok) throw new Error('exchange failed');
      const token = await exchange.json();
      if (typeof token.access_token !== 'string' || !token.access_token || token.error) throw new Error('no access token');
      const profile = await fetcher('https://api.github.com/user', {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token}`,
          'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'zanechee-portfolio' }, signal: AbortSignal.timeout(10_000), redirect: 'error',
      });
      if (!profile.ok) throw new Error('profile failed');
      const user = await profile.json();
      if (user.id !== owner.id || String(user.login).toLowerCase() !== owner.login) {
        res.setHeader('Set-Cookie', [cookie('oauth', '', 0, config), cookie('session', '', 0, config)]);
        return redirect(res, '/editor/?auth=denied');
      }
      res.setHeader('Set-Cookie', [cookie('oauth', '', 0, config), cookie('session', sign({ kind: 'session', sub: owner.id,
        login: owner.login, exp: now + sessionSeconds }, config), sessionSeconds, config)]);
      return redirect(res, safeReturnTo(flow.next, config.origin));
    } catch {
      // Never expose codes, tokens, provider response bodies, or secrets in errors.
      return redirect(res, '/editor/?auth=failed');
    }
  };
}
