# writing desk

after signing in at `/signin/`, every page is editable as you read it. there is no edit or read mode. click a paragraph, heading, list, image, or table to edit its markdown in place; escape or moving focus renders that block again. links, buttons, and video controls keep working, so click beside a link to edit its paragraph.

edits publish to the site. when a block is finished (or after 30 seconds of continuous typing, `cmd+s`, switching tabs, or closing the page), the page's markdown is committed to `src/content/<slug>.md` on `main`, and cloudflare pages redeploys it. the byline shows the state: **editing**, **publishing…**, **published · live after the next deploy**, or **not published** with the reason. each open loads the page's source from github, not the last build, so reloading shows your edit even before the deploy finishes. if the page changed on github since you opened it, the save stops with a conflict instead of overwriting; your version stays in the drafts list.

**create** starts a blank article in the same shell. it publishes once it has a `# title`, as `src/content/<title-slug>.md` with a `created` date; an existing page with that name is never overwritten. the small `+` after the article adds a paragraph. every edit is also kept in this browser, so nothing is lost while offline or signed out; it publishes on the next visit. `cmd+k` / `ctrl+k` opens the tools: unpublished drafts, published pages, new, import, download, page details, and sign out. frontmatter stays out of the prose and can be edited under **page details**. sessions from before publishing existed show **sign in again to publish** and keep edits local until you sign in again.

import and download preserve the markdown text, including frontmatter. `cmd+s` / `ctrl+s` saves; adding shift downloads. imports are limited to 200 kb and drafts to 200,000 characters. storage errors remain visible, and leaving with unsaved work triggers a warning. a conflicting save from another tab creates a separate copy. undo history resets when switching drafts so one page cannot undo into another.

## publishing boundary

`/api/content/<slug>` (`server/content.mjs`, deployed as `functions/api/content/[slug].js`) reads and commits page source for the signed-in owner with the github token from sign-in; see [setup](github-sign-in.md). it accepts only same-origin json puts, page names matching `[a-z0-9_-]`, and up to 200,000 characters, and it always sends the sha it loaded so a stale page cannot overwrite a newer one. `CONTENT_REPOSITORY` and `CONTENT_BRANCH` override the default `injaneity/injaneity` and `main`. unpublished browser drafts are never included in the site build.

the writing index is generated during the build. its `<!-- posts -->` marker is preserved, and generated entries remain visible in their original position. the shared article renderer displays tables, images, and video. draft html is sanitized, so scripts, unsafe urls, and unsafe embeds cannot execute. remote images can make requests to their hosts. unedited source, comments, frontmatter, and line endings are retained rather than reconstructed from html.

## implementation

- `src/main.ts` loads editing as soon as the owner session is verified. signed-out reading does not download the editing code.
- `src/editor/inline.ts` manages owner checks, drafts, frontmatter, local saves, publishing, downloads, and conflict copies.
- `src/editor/article-editor.ts` renders through `src/lib/markdown.mjs`, with source offsets on top-level blocks. only the active block mounts `src/editor/live-markdown.ts`; the rest remains the actual article html. finishing a block does not serialize the rendered dom back into markdown.
- `/editor/` remains owner-protected for old bookmarks and redirects into the article. its source endpoints stay owner-protected. the separate writing desk is removed.
- the editor reuses the existing `.reader-content`, `.article-frame`, header, footer, and alignment logic. on session loss it saves the draft, removes editing, and restores the public article.

for editor work, build, run `node --test scripts/editor.test.mjs`, and run `npm run test:editor`. use typecheck and lint for source checks; defer the full site/auth suite to CI. browser tests use a separate headless chromium profile with test-only auth fixtures; they do not alter a real browser profile or application auth. use an installed google chrome on macos, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, or install the bundled browser with `npx playwright install chromium`. tests compare read/edit geometry and styles on desktop and mobile, then check source preservation, undo, local recovery, session expiry, media rendering, and signed-out code loading.
