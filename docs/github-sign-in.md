# github owner sign-in

the metadata below the article title shows `edit · create` only after `/api/auth/session` verifies the owner session. create starts a blank draft. edit opens the current page and resumes its latest linked local draft, if one exists. bookmark `/signin/` to sign in; it is not linked from the public site. signed-out requests to `/editor/` and its source copies return a real 404, not a login prompt.

## one-time setup

1. create a [github oauth app](https://github.com/settings/applications/new) for local development. set the homepage to `http://127.0.0.1:4173/` and the authorization callback to `http://127.0.0.1:4173/api/auth/callback`.
2. create `.env.local` in the project. copy the four server settings below from `.env.example`. put your client id and client secret there, never in chat or a `VITE_` variable.
3. generate a signing secret with `openssl rand -hex 32`, then put that value in `AUTH_SECRET`.
4. restart `npm run dev` on port 4173, or `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort` after building. open `/signin/` and choose **sign in with github**.

```dotenv
GITHUB_CLIENT_ID=your-oauth-app-client-id
GITHUB_CLIENT_SECRET=your-oauth-app-client-secret
AUTH_SECRET=your-random-signing-secret
AUTH_ORIGIN=http://127.0.0.1:4173
```

use the exact origin above, not `localhost`, if you registered `127.0.0.1`. if any settings are missing, sign-in stays disabled. there is no local owner bypass. `.env.local` is ignored by git. never commit credentials.

## deployment

public pages remain static on cloudflare pages. `functions/api/auth/[[action]].js` handles authentication, and `functions/editor/_middleware.js` protects editor routes. both use the same handler as local preview, with web crypto rather than node-only APIs. no vercel adapter or node compatibility flag is needed.

`public/_routes.json` limits function invocation to `/api/auth` and `/editor` routes. blog pages and assets stay static. `dist/404.html` prevents cloudflare's default homepage fallback for missing routes. all auth and editor responses are private and must not be cached.

for production, register a separate oauth app with homepage `https://zanechee.dev/` and callback `https://zanechee.dev/api/auth/callback`. leave wildcard matching and device flow off. set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `AUTH_SECRET`, and `AUTH_ORIGIN` as production environment bindings in the existing cloudflare pages project. use a fresh signing secret and `AUTH_ORIGIN=https://zanechee.dev`. redeploy after configuring secrets; they are bound to deployments. do not reuse development credentials in production or enable production login on `pages.dev` preview domains.

an ignored `.dev.vars.production` file can hold the four production values for `wrangler pages secret bulk .dev.vars.production --project-name <verified-project-name>`. never commit it or print its contents. `.env.local` remains local-only. production credentials must not be stored in `VITE_` variables, build output, or frontend code.

run `npx wrangler pages dev dist --compatibility-date 2026-09-22` to check the pages runtime locally. it can load `.dev.vars`; when testing dummy bindings, set `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false` to prevent accidental loading of local credentials.

## security and limits

- only github account id `44902825` with login `injaneity` is allowed. the fixed id prevents a different account from gaining access by reusing a username.
- oauth uses random state, pkce, an exact callback, and a short-lived http-only flow cookie. github issues single-use authorization codes. no repository scopes are requested.
- the server reads the authenticated github profile and discards the access token. tokens and secrets never reach client javascript or browser storage.
- sessions are signed, bound to the configured origin, and expire after eight hours. production cookies use `Secure`, `HttpOnly`, `SameSite=Lax`, and the `__Host-` prefix. localhost cookies omit `Secure` only for local http.
- sign-out is a same-origin post and clears this browser's cookies. rotating `AUTH_SECRET` invalidates all sessions; individual stolen sessions cannot otherwise be revoked before expiry in this stateless design.
- the editor hides on session expiry or a failed session check and preserves the current local draft. raw editor assets and already-public source copies are not secret. this is not encrypted draft storage.
- publishing is still not connected. adding a save-to-repository or x endpoint must verify the server session and csrf protection; hiding a button is not authorization.

run `npm run build && npm run test:site && npm run typecheck && npm run lint`. the auth tests use a mocked github provider. real local github sign-in has also been verified with the development app; production sign-in is not configured.

references: [github oauth flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [cloudflare pages functions](https://developers.cloudflare.com/pages/functions/get-started/), [cloudflare bindings and secrets](https://developers.cloudflare.com/pages/functions/bindings/).
