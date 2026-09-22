import { createAuthHandler } from './auth.mjs';

// Adapt Web Requests/Responses to the same tested handler used by local preview.
export async function authResponse(request, env, options = {}) {
  const url = new URL(request.url);
  const headers = new Headers();
  let status = 200;
  let body = '';
  await createAuthHandler({ ...options, env })({
    url: url.pathname + url.search,
    method: request.method,
    headers: { ...Object.fromEntries(request.headers), host: url.host },
  }, {
    set statusCode(value) { status = value; },
    setHeader(name, value) {
      headers.delete(name);
      for (const item of [value].flat()) headers.append(name, item);
    },
    end(value = '') { body = value; },
  });
  return new Response(body, { status, headers });
}

export async function isOwnerRequest(request, env) {
  const url = new URL('/api/auth/session', request.url);
  const response = await authResponse(new Request(url, { headers: request.headers }), env);
  return response.ok && (await response.json()).authenticated === true;
}

export function privateResponse(response, status = response.status) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('Vary', 'Cookie');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(response.body, { status, headers });
}
