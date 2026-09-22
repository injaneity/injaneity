import { authResponse } from '../../../server/pages-auth.mjs';

export function onRequest({ request, env }) {
  return authResponse(request, env);
}
