# writing desk

open `/editor/` on the local preview. it starts as a single writing page. use **write**, **read**, or **side by side** at the bottom to change the view. on a phone, write and read use the full screen.

drafts save to this browser's local storage after a short pause. **contents** opens a paper-style list of local drafts and published pages, with actions for starting or importing a manuscript. escape or **back to page** closes the contents sheet. opening a published page makes a local copy, not an edit to the live site. reload restores the active draft in the same tab. clearing browser data removes drafts, so export `.md` files for backups. this is not encrypted storage.

import and export preserve the markdown text, including frontmatter. `cmd+s` / `ctrl+s` saves locally. imports are limited to 200 kb. if storage is blocked or full, the editor reports that it cannot save and offers a leave-page warning while unsaved work remains.

## publishing boundary

github owner sign-in is wired in; see [setup](github-sign-in.md) for the required oauth app credentials. there is no publishing endpoint, cloud draft storage, or x integration yet. export the manuscript and review it before placing it in `src/content/` and building the site. the editor is excluded from the sitemap and marked `noindex`; neither measure is authentication. drafts are never included in the site build.

the writing index is generated during the build. its `<!-- posts -->` marker is not expanded in a draft preview. unsupported or unsafe embedded html is stripped from the preview, including scripts, styles, and iframes. video, images, and links are supported; external images can make requests to their hosts.

## implementation

- `editor/index.html` is a separate build entry. public articles do not import the editor.
- `src/editor/main.ts` uses a native textarea, preserves browser text editing, debounces saves, ignores stale preview results, and forks conflicting saves from another tab.
- `src/editor/preview.worker.mjs` runs markdown conversion outside the main thread. code highlighting and html parsing load only when needed.
- `src/lib/markdown.mjs` is shared with the static generator. the preview opts into html sanitization before applying the article transforms.
- the preview and public pages share `src/index.css`, the newsreader font, paper texture, and link treatment. editor controls have their own small stylesheet.

run `npm run build`, then `npm run test:site`, `npm run typecheck`, and `npm run lint`. tests cover preview sanitization, worker rendering without a dom, source copies, search exclusion, and a public-reader script size limit.
