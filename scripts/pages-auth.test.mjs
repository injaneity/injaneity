import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { authResponse, isOwnerRequest } from '../server/pages-auth.mjs';
import { onRequest as api } from '../functions/api/auth/[[action]].js';
import { onRequest as editor } from '../functions/editor/_middleware.js';

const env = { GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-secret',
  AUTH_SECRET: 'a-test-signing-key-at-least-32-characters-long', AUTH_ORIGIN: 'https://zanechee.dev' };
const request = (path, headers = {}) => new Request(`https://zanechee.dev${path}`, { headers });
const cookie = (response) => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');

test('Pages API produces JSON rather than the static homepage and rejects nested routes', async () => {
  const response = await api({ request: request('/api/auth/session'), env: {} });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).configured, false);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal((await api({ request: request('/api/auth/nested/login'), env })).status, 404);
  assert.equal((await api({ request: new Request('https://preview.pages.dev/api/auth/login'), env })).status, 403);
});

test('Pages callback preserves both secure Set-Cookie headers and owner session', async () => {
  const login = await authResponse(request('/api/auth/login?returnTo=%2Feditor%2F'), env);
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const callback = await authResponse(request(`/api/auth/callback?code=test&state=${state}`, { cookie: cookie(login) }), env, {
    fetcher: async (url) => Response.json(url.includes('access_token') ? { access_token: 'test-token' } : { id: 44902825, login: 'injaneity' }),
  });
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), '/editor/');
  assert.equal(callback.headers.getSetCookie().length, 2);
  assert.ok(callback.headers.getSetCookie().every(value => value.includes('HttpOnly') && value.includes('Secure')));
  const authenticated = request('/editor/', { cookie: cookie(callback) });
  assert.equal(await isOwnerRequest(authenticated, env), true);
  let served = false;
  const response = await editor({ request: authenticated, env, next: async () => { served = true; return new Response('desk'); } });
  assert.equal(served, true);
  assert.equal(await response.text(), 'desk');
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('signed-out editor, nested source copies and missing configuration all fail closed', async () => {
  for (const path of ['/editor', '/editor/', '/editor/index.html', '/editor/posts.json', '/editor/posts/00-landing.md']) {
    let served = false;
    let assetPath;
    const response = await editor({ request: request(path), env: { ASSETS: { fetch: async (req) => {
      assetPath = new URL(req.url).pathname;
      return new Response('page not found');
    } } }, next: async () => { served = true; return new Response('secret'); } });
    assert.equal(response.status, 404);
    assert.equal(served, false);
    assert.equal(assetPath, '/404.html');
    assert.equal(await response.text(), 'page not found');
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
});

test('only auth and editor invoke functions; sign-in is unlisted and missing pages have a 404 document', async () => {
  const routes = JSON.parse(await readFile('dist/_routes.json', 'utf8'));
  assert.deepEqual(routes.include, ['/api/auth', '/api/auth/*', '/editor', '/editor/*']);
  assert.match(await readFile('dist/signin/index.html', 'utf8'), /noindex, nofollow/);
  assert.match(await readFile('dist/404.html', 'utf8'), /page not found/);
  for (const path of ['index.html', 'writing/index.html', 'sitemap.xml', 'llms.txt']) {
    assert.doesNotMatch(await readFile(`dist/${path}`, 'utf8'), /href="\/signin\/|https:\/\/zanechee.dev\/signin\//);
  }
});
