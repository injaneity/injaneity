import { contentResponse } from '../../../server/content.mjs';

export function onRequest({ request, env }) {
  return contentResponse(request, env);
}
