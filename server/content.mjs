import { ownerToken } from './auth.mjs';

const limit = 200_000;
const encoder = new TextEncoder();
const slugPattern = /^[a-z0-9][a-z0-9_-]{0,99}$/i;

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
  } });
}
function toBase64(text) {
  const bytes = encoder.encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function fromBase64(value) {
  return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), (character) => character.charCodeAt(0)));
}

// Reads and commits src/content/<slug>.md for the signed-in owner. The browser never sees the GitHub token.
export async function contentResponse(request, env, { fetcher = fetch, clock = () => Date.now() } = {}) {
  const url = new URL(request.url);
  const slug = url.pathname.match(/^\/api\/content\/([^/]+)\/?$/)?.[1];
  if (!slug || !slugPattern.test(slug)) return json(404, { error: 'not found' });
  if (!['GET', 'PUT'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, PUT' } });
  const owner = await ownerToken({ headers: { cookie: request.headers.get('cookie') || '' } }, env, clock);
  if (!owner) return json(401, { error: 'sign in to edit' });
  if (url.host.toLowerCase() !== owner.config.host.toLowerCase()) return json(403, { error: 'unexpected host' });
  if (!owner.token) return json(401, { error: 'sign in again to publish' });
  const repository = env.CONTENT_REPOSITORY || 'injaneity/injaneity';
  const branch = env.CONTENT_BRANCH || 'main';
  const endpoint = `https://api.github.com/repos/${repository}/contents/src/content/${slug}.md`;
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${owner.token}`,
    'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'zanechee-portfolio' };
  const github = (target, options = {}) => fetcher(target, { ...options, headers: { ...headers, ...options.headers },
    signal: AbortSignal.timeout(15_000), redirect: 'manual' });

  try {
    if (request.method === 'GET') {
      const response = await github(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers: { 'Cache-Control': 'no-cache' } });
      if (response.status === 404) return json(404, { error: 'page not found' });
      if (response.status === 401) return json(401, { error: 'sign in again to publish' });
      if (!response.ok) return json(502, { error: 'github is unavailable' });
      const file = await response.json();
      return json(200, { source: fromBase64(file.content || ''), sha: file.sha });
    }

    // State-changing requests must come from the site itself, as JSON.
    if (request.headers.get('origin') !== owner.config.origin) return json(403, { error: 'invalid origin' });
    if (!/^application\/json\b/.test(request.headers.get('content-type') || '')) return json(415, { error: 'expected json' });
    const text = await request.text();
    if (text.length > limit * 2) return json(413, { error: 'page too large' });
    let body;
    try { body = JSON.parse(text); } catch { return json(400, { error: 'invalid json' }); }
    if (typeof body?.source !== 'string' || body.source.length > limit) return json(400, { error: 'invalid page' });
    if (body.sha !== undefined && (typeof body.sha !== 'string' || !/^[0-9a-f]{40}$/.test(body.sha))) return json(400, { error: 'invalid version' });
    const response = await github(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      message: `${body.sha ? 'Update' : 'Create'} ${slug} from zanechee.dev`, content: toBase64(body.source), branch,
      ...(body.sha ? { sha: body.sha } : {}),
    }) });
    // 409 is a stale sha; 422 without a sha means the page already exists.
    if (response.status === 409 || response.status === 422) return json(409, { error: body.sha ? 'the page changed elsewhere' : 'a page with this name already exists' });
    if (response.status === 401) return json(401, { error: 'sign in again to publish' });
    if (response.status === 403 || response.status === 404) return json(403, { error: 'github did not allow this change' });
    if (!response.ok) return json(502, { error: 'github is unavailable' });
    const result = await response.json();
    return json(200, { sha: result.content?.sha, commit: result.commit?.sha });
  } catch {
    return json(502, { error: 'github is unavailable' });
  }
}
