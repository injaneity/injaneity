# Worklog

## 2026-09-28 — Edit on the reader page

- Request: make editing use the page visitors see, not a separate writing desk.
- Plan: keep the existing reader shell and shared Markdown renderer; activate a source editor only for the selected block. Preserve local drafts, source, frontmatter, owner checks, and silent saves.
- Verification: focused renderer and browser checks for layout parity, inline editing, draft recovery, and session expiry. Leave unrelated suites to CI.
- Non-blocking: no papercuts tool is available. The repository's AGENTS.md architecture description predates the static reader and owner editor. No CI workflow is currently configured in this checkout.
- Implemented: edit/create lazy-load on the article route; shared rendered blocks activate Markdown in place; done keeps the local draft readable; session loss restores public content. Legacy editor links redirect to the article. Draft storage keys and frontmatter remain compatible.
- Verified: build, typecheck, lint, seven editor/renderer checks, and four isolated browser scenarios. Desktop and mobile heading/paragraph/header/footer geometry, fonts, and filters match exactly before and after entering edit mode. Screenshots inspected; no separate shell or text area appears until a block is selected.
- Publishing remains unchanged: edits are local drafts, not automatic site publication.
