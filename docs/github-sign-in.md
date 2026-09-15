# github owner sign-in

the metadata below the article title shows `edit · create` only after `/api/auth/session` verifies the owner session. create starts a blank draft. edit opens the current page and resumes its latest linked local draft, if one exists. the editor itself starts behind a sign-in screen.

## one-time setup

1. create a [github oauth app](https://github.com/settings/applications/new) for local development. set the homepage to `http://127.0.0.1:4173/` and the authorization callback to `http://127.0.0.1:4173/api/auth/callback`.
2. create `.env.local` in the project. copy the four server settings below from `.env.example`. put your client id and client secret there, never in chat or a `VITE_` variable.
3. generate a signing secret with `openssl rand -hex 32`, then put that value in `AUTH_SECRET`.
4. restart `npm run dev` on port 4173, or `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort` after building. open `/editor/` and choose **sign in with github**.

```dotenv
GITHUB_CLIENT_ID=your-oauth-app-client-id
GITHUB_CLIENT_SECRET=your-oauth-app-client-secret
AUTH_SECRET=your-random-signing-secret
AUTH_ORIGIN=http://127.0.0.1:4173
```

use the exact origin above, not `localhost`, if you registered `127.0.0.1`. if any settings are missing, sign-in stays disabled. there is no local owner bypass. `.env.local` is ignored by git. never commit credentials.

## deployment

public pages remain static. authentication needs a server runtime: static-only hosting cannot run it. `api/auth/[action].js` is a vercel node-function adapter; the same handler runs in the local vite preview. the current github production integration deploys to cloudflare pages, which does not use this vercel adapter. owner sign-in there remains unavailable until a cloudflare pages function and production credentials are configured.

for production, register a separate oauth app with homepage `https://zanechee.dev/` and callback `https://zanechee.dev/api/auth/callback`. set the four server variables in the hosting settings, use a separate signing secret, and set `AUTH_ORIGIN=https://zanechee.dev`. do not reuse development credentials in production. preview deployment domains need their own explicit origin and oauth app settings if login there is required.

## security and limits

- only github account id `44902825` with login `injaneity` is allowed. the fixed id prevents a different account from gaining access by reusing a username.
- oauth uses random state, pkce, an exact callback, and a short-lived http-only flow cookie. github issues single-use authorization codes. no repository scopes are requested.
- the server reads the authenticated github profile and discards the access token. tokens and secrets never reach client javascript or browser storage.
- sessions are signed, bound to the configured origin, and expire after eight hours. production cookies use `Secure`, `HttpOnly`, `SameSite=Lax`, and the `__Host-` prefix. localhost cookies omit `Secure` only for local http.
- sign-out is a same-origin post and clears this browser's cookies. rotating `AUTH_SECRET` invalidates all sessions; individual stolen sessions cannot otherwise be revoked before expiry in this stateless design.
- the editor hides on session expiry or a failed session check and preserves the current local draft. raw editor assets and already-public source copies are not secret. this is not encrypted draft storage.
- publishing is still not connected. adding a save-to-repository or x endpoint must verify the server session and csrf protection; hiding a button is not authorization.

run `npm run build && npm run test:site && npm run typecheck && npm run lint`. the auth tests use a mocked github provider. real local github sign-in has also been verified with the development app; production sign-in is not configured.

references: [github oauth flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [vercel node functions](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration).
