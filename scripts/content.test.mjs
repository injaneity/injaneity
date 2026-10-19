import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { authResponse } from '../server/pages-auth.mjs';
import { contentResponse } from '../server/content.mjs';
import { onRequest as content } from '../functions/api/content/[slug].js';

const env = { GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-secret',
  AUTH_SECRET: randomBytes(32).toString('hex'), AUTH_ORIGIN: 'https://zanechee.dev' };
const origin = 'https://zanechee.dev';
const jar = (response) => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');

async function signIn(user = { id: 44902825, login: 'injaneity' }, token = 'gho_fixture-token') {
  const login = await authResponse(new Request(`${origin}/api/auth/login`), env);
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const callback = await authResponse(new Request(`${origin}/api/auth/callback?code=test&state=${state}`, { headers: { cookie: jar(login) } }), env, {
    fetcher: async (url) => Response.json(url.includes('access_token') ? { access_token: token } : user),
  });
  return jar(callback);
}
function github() {
  const requests = [];
  let file = { source: '# Hello\n\nWorld.\n', sha: 'a'.repeat(40) };
  const fetcher = async (url, options = {}) => {
    requests.push({ url, ...options, body: options.body && JSON.parse(options.body) });
    if (!options.method) return Response.json({ content: Buffer.from(file.source).toString('base64').replace(/(.{60})/g, '$1\n'), sha: file.sha });
    const body = JSON.parse(options.body);
    if (body.sha !== file.sha) return new Response('{}', { status: 409 });
    file = { source: Buffer.from(body.content, 'base64').toString('utf8'), sha: 'b'.repeat(40) };
    return Response.json({ content: { sha: file.sha }, commit: { sha: 'c'.repeat(40) } });
  };
  return { fetcher, requests, get file() { return file; } };
}
const put = (cookie, body, headers = {}) => new Request(`${origin}/api/content/computer-use`, { method: 'PUT',
  headers: { cookie, origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('the session cookie carries the GitHub token only encrypted', async () => {
  const cookie = await signIn();
  const payload = Buffer.from(cookie.split('=')[1].split('.')[0], 'base64url').toString('utf8');
  assert.doesNotMatch(payload, /fixture-token/);
  const session = await authResponse(new Request(`${origin}/api/auth/session`, { headers: { cookie } }), env);
  assert.equal((await session.json()).canPublish, true);
});

test('owners read the live source and commit edits with the token they signed in with', async () => {
  const cookie = await signIn();
  const remote = github();
  const read = await contentResponse(new Request(`${origin}/api/content/computer-use`, { headers: { cookie } }), env, { fetcher: remote.fetcher });
  assert.deepEqual(await read.json(), { source: '# Hello\n\nWorld.\n', sha: 'a'.repeat(40) });
  assert.match(read.headers.get('cache-control'), /no-store/);
  assert.equal(remote.requests[0].headers.Authorization, 'Bearer gho_fixture-token');
  assert.equal(remote.requests[0].url, 'https://api.github.com/repos/injaneity/injaneity/contents/src/content/computer-use.md?ref=main');
  const saved = await contentResponse(put(cookie, { source: '# Hello\n\nWorld, edited ✓.\n', sha: 'a'.repeat(40) }), env, { fetcher: remote.fetcher });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).sha, 'b'.repeat(40));
  assert.equal(remote.file.source, '# Hello\n\nWorld, edited ✓.\n');
  assert.equal(remote.requests[1].body.branch, 'main');
  assert.equal(remote.requests[1].body.message, 'Update computer-use from zanechee.dev');
  const stale = await contentResponse(put(cookie, { source: 'again', sha: 'a'.repeat(40) }), env, { fetcher: remote.fetcher });
  assert.equal(stale.status, 409);
});

test('writes fail closed without an owner session, same-origin JSON or a valid page', async () => {
  const cookie = await signIn();
  const remote = github();
  const call = (request) => contentResponse(request, env, { fetcher: remote.fetcher });
  assert.equal((await call(put('', { source: 'x' }))).status, 401);
  assert.equal((await call(put(await signIn({ id: 1, login: 'injaneity' }), { source: 'x' }))).status, 401);
  assert.equal((await call(put(cookie, { source: 'x' }, { origin: 'https://evil.example' }))).status, 403);
  assert.equal((await call(put(cookie, { source: 'x' }, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await call(put(cookie, { source: 'x'.repeat(200_001) }))).status, 400);
  assert.equal((await call(put(cookie, { source: 'x', sha: '../main' }))).status, 400);
  assert.equal((await call(new Request(`${origin}/api/content/..%2Fpackage`, { headers: { cookie } }))).status, 404);
  assert.equal((await call(new Request(`${origin}/api/content/a/b`, { headers: { cookie } }))).status, 404);
  assert.equal((await call(new Request('https://preview.pages.dev/api/content/computer-use', { headers: { cookie } }))).status, 403);
  assert.equal((await content({ request: new Request(`${origin}/api/content/computer-use`), env })).status, 401);
  assert.equal(remote.requests.length, 0);
});

