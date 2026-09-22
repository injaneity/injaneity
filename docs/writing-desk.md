# writing desk

after signing in, use **edit** or **create** below an article title. `/editor/` is a single live markdown surface: headings, emphasis, links, lists, and code format in place. the current line reveals its markdown while you edit. there are no view modes, footer, or routine save messages.

drafts save silently in this browser after a short pause. the `···` menu next to the site url holds drafts, published pages, new, import, download, page details, and sign out. `cmd+k` / `ctrl+k` opens it; escape closes it. frontmatter stays out of the prose and can be edited under **page details**. opening a published page resumes its linked draft or makes a local copy, not an edit to the live site. reload restores the active draft in the same tab. clearing browser data removes drafts, so download markdown backups. this is not encrypted storage.

import and download preserve the markdown text, including frontmatter. `cmd+s` / `ctrl+s` saves; adding shift downloads. imports are limited to 200 kb and drafts to 200,000 characters. storage errors remain visible, and leaving with unsaved work triggers a warning. a conflicting save from another tab creates a separate copy. undo history resets when switching drafts so one page cannot undo into another.

## publishing boundary

github owner sign-in is wired in; see [setup](github-sign-in.md) for the required oauth app credentials. there is no publishing endpoint, cloud draft storage, or x integration yet. export the manuscript and review it before placing it in `src/content/` and building the site. the editor is excluded from the sitemap and marked `noindex`; neither measure is authentication. drafts are never included in the site build.

the writing index is generated during the build. its `<!-- posts -->` marker is preserved as source. embedded html and tables remain source text; html is never executed. image labels appear in place without fetching remote images. this is a live source editor, not an exact published-page preview.

## implementation

- `editor/index.html` is a separate build entry. public articles do not import the editor.
- `src/editor/main.ts` manages drafts and preserves frontmatter, debounces saves, ignores stale loads, and forks conflicting saves from another tab.
- `src/editor/live-markdown.ts` uses codemirror to decorate visible markdown without rewriting the stored source. it loads after owner verification. the old preview worker and separate rendering surface are removed.
- the editor and public pages share `src/index.css`, the newsreader font, paper texture, and link accent. editor controls have their own small stylesheet.

run `npm run build`, `npm run test:site`, `npm run test:editor`, `npm run typecheck`, and `npm run lint`. browser tests use a separate headless chromium profile with test-only auth fixtures; they do not alter a real browser profile or application auth. use an installed google chrome on macos, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, or install the bundled browser with `npx playwright install chromium`. tests cover live formatting, undo, draft recovery, stale loads, storage failure, markdown download, inert html, mobile margins, and scrolling. public reader and editor downloads have separate size budgets.
