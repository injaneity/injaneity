import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createAuthHandler } from '../server/auth.mjs';

const env = { GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-client-secret',
  AUTH_SECRET: randomBytes(32).toString('hex'), AUTH_ORIGIN: 'https://zanechee.dev' };

function call(handler, path, { method = 'GET', headers = {} } = {}) {
  const result = { statusCode: 200, headers: {}, body: '' };
  return handler({ url: path, method, headers: { host: 'zanechee.dev', ...headers } }, {
    set statusCode(value) { result.statusCode = value; },
    setHeader(key, value) { result.headers[key.toLowerCase()] = value; },
    end(value = '') { result.body = value; },
  }).then(() => result);
}
function cookieHeader(response) {
  return [response.headers['set-cookie']].flat().filter(Boolean).map((cookie) => cookie.split(';')[0]).join('; ');
}
async function begin(handler, next = '/computer-use/') {
  const login = await call(handler, `/api/auth/login?returnTo=${encodeURIComponent(next)}`);
  const location = new URL(login.headers.location);
  return { login, location, state: location.searchParams.get('state'), cookie: cookieHeader(login) };
}
function fixture(user = { id: 44902825, login: 'injaneity' }) {
  const requests = [];
  let now = Date.now();
  const handler = createAuthHandler({ env, clock: () => now, fetcher: async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify(url.includes('access_token') ? { access_token: 'fixture-token' } : user), { status: 200 });
  } });
  return { handler, requests, advance(seconds) { now += seconds * 1000; } };
}
async function finish(handler, flow) {
  return call(handler, `/api/auth/callback?code=fixture-code&state=${flow.state}`, { headers: { cookie: flow.cookie } });
}

test('missing settings fail closed without a development owner bypass', async () => {
  const handler = createAuthHandler({ env: {} });
  assert.deepEqual(JSON.parse((await call(handler, '/api/auth/session')).body), { authenticated: false, configured: false, error: 'github sign-in is not configured' });
  assert.equal((await call(handler, '/api/auth/login')).statusCode, 503);
});

test('OAuth uses state, PKCE, exact callback and no repository scopes', async () => {
  const { handler, requests } = fixture();
  const flow = await begin(handler, '/editor/?edit=python-decorators');
  assert.equal(flow.location.origin, 'https://github.com');
  assert.equal(flow.location.searchParams.get('scope'), '');
  assert.equal(flow.location.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(flow.location.searchParams.get('redirect_uri'), 'https://zanechee.dev/api/auth/callback');
  assert.match(flow.login.headers['set-cookie'], /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  assert.match(flow.login.headers['set-cookie'], /^__Host-/);
  const response = await finish(handler, flow);
  assert.equal(response.headers.location, '/editor/?edit=python-decorators');
  assert.equal(requests.length, 2);
  const verifier = requests[0].options.body.get('code_verifier');
  assert.equal(createHash('sha256').update(verifier).digest('base64url'), flow.location.searchParams.get('code_challenge'));
  const session = await call(handler, '/api/auth/session', { headers: { cookie: cookieHeader(response) } });
  assert.equal(JSON.parse(session.body).authenticated, true);
  assert.equal(JSON.parse(session.body).login, 'injaneity');
  assert.doesNotMatch(session.body + cookieHeader(response), /fixture-token|test-client-secret/);
  assert.match(session.headers['cache-control'], /no-store/);
});

test('matching a username alone cannot grant owner access', async () => {
  for (const user of [{ id: 123, login: 'injaneity' }, { id: 44902825, login: 'someone-else' }]) {
    const { handler } = fixture(user);
    const response = await finish(handler, await begin(handler));
    assert.equal(response.headers.location, '/editor/?auth=denied');
    assert.equal(JSON.parse((await call(handler, '/api/auth/session', { headers: { cookie: cookieHeader(response) } })).body).authenticated, false);
  }
});

test('missing, mismatched, tampered and expired OAuth state is rejected before token exchange', async () => {
  const { handler, requests, advance } = fixture();
  const flow = await begin(handler);
  for (const [state, cookie] of [['wrong', flow.cookie], [flow.state, ''], [flow.state, flow.cookie + 'tampered']]) {
    const response = await call(handler, `/api/auth/callback?code=fixture-code&state=${state}`, { headers: { cookie } });
    assert.equal(response.headers.location, '/editor/?auth=invalid');
  }
  advance(601);
  assert.equal((await finish(handler, flow)).headers.location, '/editor/?auth=invalid');
  assert.equal(requests.length, 0);
});

test('session signatures, expiry, configured host and transport are enforced', async () => {
  const { handler, advance } = fixture();
  const response = await finish(handler, await begin(handler));
  const cookie = cookieHeader(response);
  assert.equal(JSON.parse((await call(handler, '/api/auth/session', { headers: { cookie: cookie + 'x' } })).body).authenticated, false);
  assert.equal((await call(handler, '/api/auth/login', { headers: { host: 'evil.example' } })).statusCode, 403);
  advance(8 * 3600 + 1);
  assert.equal(JSON.parse((await call(handler, '/api/auth/session', { headers: { cookie } })).body).authenticated, false);
  const insecure = createAuthHandler({ env: { ...env, AUTH_ORIGIN: 'http://zanechee.dev' } });
  assert.equal((await call(insecure, '/api/auth/login')).statusCode, 503);
});

test('return paths cannot redirect to another origin', async () => {
  const { handler } = fixture();
  for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', '/%5cevil.example', '/api/auth/login']) {
    const response = await finish(handler, await begin(handler, next));
    assert.equal(response.headers.location, '/');
  }
});

test('logout requires a same-origin POST and clears both cookies', async () => {
  const { handler } = fixture();
  assert.equal((await call(handler, '/api/auth/logout')).statusCode, 405);
  assert.equal((await call(handler, '/api/auth/logout', { method: 'POST', headers: { origin: 'https://evil.example' } })).statusCode, 403);
  assert.equal((await call(handler, '/api/auth/logout', { method: 'POST' })).statusCode, 403);
  const response = await call(handler, '/api/auth/logout', { method: 'POST', headers: { origin: env.AUTH_ORIGIN } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['set-cookie'].length, 2);
  assert.ok(response.headers['set-cookie'].every((cookie) => cookie.includes('Max-Age=0')));
});

test('provider failures do not leak credentials or mint a session', async () => {
  const handler = createAuthHandler({ env, fetcher: async () => { throw new Error('secret fixture-token'); } });
  const response = await finish(handler, await begin(handler));
  assert.equal(response.headers.location, '/editor/?auth=failed');
  assert.doesNotMatch(JSON.stringify(response), /fixture-token|test-client-secret|portfolio_session=/);
});
