import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('OAuth request options and sessions work in Cloudflare, with redirects rejected', async () => {
  const source = await readFile(new URL('../server/auth.mjs', import.meta.url), 'utf8');
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    compatibilityDate: '2026-09-22',
    script: `${source}
      export default { async fetch() {
        const results = [];
        for (const redirectStage of [null, 'token', 'profile']) {
          let requests = 0;
          const failures = [];
          const handler = createAuthHandler({
            env: { AUTH_ORIGIN: 'https://zanechee.dev', AUTH_SECRET: 'runtime-test-key-at-least-32-characters',
              GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-secret' },
            reportFailure: failure => failures.push(failure),
            fetcher: async (url, options) => {
              requests++;
              // Use workerd's Request constructor, not Node's permissive implementation.
              const request = new Request(url, options);
              if (request.redirect !== 'manual') throw new Error('redirects must not be followed');
              const stage = url.includes('access_token') ? 'token' : 'profile';
              if (stage === redirectStage) return new Response(null, {
                status: 302, headers: { Location: 'https://untrusted.example/' },
              });
              return Response.json(stage === 'token' ? { access_token: 'test-token' } : { id: 44902825, login: 'injaneity' });
            },
          });
          async function call(url, cookie = '') {
            const headers = new Headers();
            let status = 200;
            let body;
            await handler({ url, method: 'GET', headers: { host: 'zanechee.dev', cookie } }, {
              set statusCode(value) { status = value; },
              setHeader(name, value) { headers.delete(name); for (const item of [value].flat()) headers.append(name, item); },
              end(value = '') { body = value; },
            });
            return new Response(body, { status, headers });
          }
          const jar = response => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
          const login = await call('/api/auth/login');
          const state = new URL(login.headers.get('location')).searchParams.get('state');
          const callback = await call('/api/auth/callback?code=test-code&state=' + state, jar(login));
          const session = await call('/api/auth/session', jar(callback));
          results.push({ redirectStage, requests, failures, location: callback.headers.get('location'), session: await session.json() });
        }
        return Response.json(results);
      } }`,
  }));
  try {
    const [success, tokenRedirect, profileRedirect] = await (await runtime.dispatchFetch('http://localhost/')).json();
    assert.equal(success.session.authenticated, true);
    assert.equal(success.location, '/');
    assert.equal(success.requests, 2);
    assert.deepEqual(success.failures, []);
    for (const result of [tokenRedirect, profileRedirect]) {
      assert.equal(result.session.authenticated, false);
      assert.equal(result.location, '/signin/?auth=failed');
      assert.equal(result.failures[0].status, 302);
    }
    assert.equal(tokenRedirect.requests, 1);
    assert.equal(profileRedirect.requests, 2);
  } finally {
    await runtime.dispose();
  }
});
