import { isOwnerRequest, privateResponse } from '../../server/pages-auth.mjs';

export async function onRequest({ request, env, next }) {
  if (!await isOwnerRequest(request, env)) {
    const notFound = await env.ASSETS.fetch(new Request(new URL('/404.html', request.url)));
    return privateResponse(notFound, 404);
  }
  return privateResponse(await next());
}
