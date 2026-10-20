# Worklog

## 2026-10-20 — Smooth editing while publishing; Backspace joins paragraphs

- Each edit re-rendered the whole article with innerHTML, which reloaded images and video and re-rasterised the dithered text, so block hops grew to ~330ms with ~100ms long tasks. The editor now reconciles the article block by block and only swaps blocks whose HTML changed; long tasks are gone. Copy buttons are no longer redrawn on every render.
- Backspace at the very start of a paragraph joins it onto the end of the block above (with a space), keeping the caret at the join. Fenced code, tables, raw HTML, and headings/lists/quotes being joined keep their structure.

## 2026-10-20 — Reveal markdown per span, not per line

- Clicking into a sentence showed raw markdown for the whole line. Inline syntax (bold, italics, strikethrough, code spans, links, bullets, task boxes) now shows only for the span the caret touches; headings, quotes and code fences stay line-level.
- The caret lands where you click instead of at the end of the block.
- Verified: build, typecheck, lint, site suites, and nine browser scenarios including span-level reveal.

## 2026-10-20 — Editing for every visitor

- Request: anyone can edit any page; only the owner's GitHub-signed-in edits persist, others vanish on refresh.
- Visitors load the editor on their first click into the article and edit in memory only (no storage, no publishing). Raw source moved from owner-only `/editor/posts/` to public `/source/`.
- Verified: build, typecheck, lint, site suites, and eight browser scenarios including a visitor edit that reload discards.

## 2026-10-19 — Always-on editing that publishes

- Request: no switching between edit and read; when signed in through `/signin/`, edits should persist to the live site.
- Removed `edit` / `stop editing`. Owners get the editable page as soon as the session is verified; links, buttons and video still work.
- Sign-in now asks for `public_repo` and keeps the token encrypted in the session cookie. `/api/content/<slug>` reads source from GitHub and commits edits to `main` with sha-checked updates, which triggers the Cloudflare Pages deploy. Browser drafts remain as an offline buffer.
- Verified: build, typecheck, lint, site/auth/content suites, and seven browser scenarios against a fake repository.

## 2026-09-28 — Edit on the reader page

- Request: make editing use the page visitors see, not a separate writing desk.
- Plan: keep the existing reader shell and shared Markdown renderer; activate a source editor only for the selected block. Preserve local drafts, source, frontmatter, owner checks, and silent saves.
- Verification: focused renderer and browser checks for layout parity, inline editing, draft recovery, and session expiry. Leave unrelated suites to CI.
- Non-blocking: no papercuts tool is available. The repository's AGENTS.md architecture description predates the static reader and owner editor. No CI workflow is currently configured in this checkout.
- Implemented: edit/create lazy-load on the article route; shared rendered blocks activate Markdown in place; done keeps the local draft readable; session loss restores public content. Legacy editor links redirect to the article. Draft storage keys and frontmatter remain compatible.
- Verified: build, typecheck, lint, seven editor/renderer checks, and four isolated browser scenarios. Desktop and mobile heading/paragraph/header/footer geometry, fonts, and filters match exactly before and after entering edit mode. Screenshots inspected; no separate shell or text area appears until a block is selected.
- Publishing remains unchanged: edits are local drafts, not automatic site publication.

## 2026-09-28 — Simplify editing controls

- Replaced `done · ···` with `stop editing · create`. Create retains the existing save/unsaved-work guard. Draft tools remain available through Cmd/Ctrl+K.
- Updated the focused browser assertion and editor documentation. No new non-blocking issues found; no papercuts tool is available.
- Verified: production build, typecheck, diff check, and the single reader/edit/resume browser scenario pass.

## 2026-09-28 — Reader spacing

- Screenshot showed uneven spaces beside inline links and loose gaps between short paragraphs.
- Matched link margins to highlight padding so the highlight extends without adding text width. Tightened paragraph gaps from 0.72rem to 0.55em; retained line height and the shared read/edit styles.
- Preserve the user's browser draft; reproduce its layout with a test fixture, not a content-file edit. No papercuts tool is available.
- Verified: build and diff check pass. One focused browser test confirms zero added link width, 0.55em paragraph gaps, read/edit geometry parity, and unchanged draft source. Inspected the rendered screenshot.
