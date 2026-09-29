# writing desk

after signing in, use **edit** below an article title. editing stays on that article, inside the same reader shell, with the same header, footer, type, spacing, highlights, and paper. click a paragraph, heading, list, image, or table to edit its markdown in place. escape or moving focus renders that block again. **stop editing** returns to reading the local draft. reloading without an edit query returns to the published page; **edit** resumes the linked draft.

the controls show **stop editing · create** while editing. **create** starts a blank article in the same shell. the small `+` after the article adds a paragraph. drafts save silently in this browser after a short pause. `cmd+k` / `ctrl+k` opens the draft tools: drafts, published pages, new, import, download, page details, and sign out. escape closes the menu. frontmatter stays out of the prose and can be edited under **page details**. opening a published page resumes its linked draft or makes a local copy, not an edit to the live site. clearing browser data removes drafts, so download markdown backups. this is not encrypted storage.

import and download preserve the markdown text, including frontmatter. `cmd+s` / `ctrl+s` saves; adding shift downloads. imports are limited to 200 kb and drafts to 200,000 characters. storage errors remain visible, and leaving with unsaved work triggers a warning. a conflicting save from another tab creates a separate copy. undo history resets when switching drafts so one page cannot undo into another.

## publishing boundary

github owner sign-in is wired in; see [setup](github-sign-in.md) for the required oauth app credentials. there is no publishing endpoint, cloud draft storage, or x integration yet. export the manuscript and review it before placing it in `src/content/` and building the site. the editor is excluded from the sitemap and marked `noindex`; neither measure is authentication. drafts are never included in the site build.

the writing index is generated during the build. its `<!-- posts -->` marker is preserved, and generated entries remain visible in their original position. the shared article renderer displays tables, images, and video. draft html is sanitized, so scripts, unsafe urls, and unsafe embeds cannot execute. remote images can make requests to their hosts. unedited source, comments, frontmatter, and line endings are retained rather than reconstructed from html.

## implementation

- `src/main.ts` loads editing only after an owner clicks edit/create or opens an owner edit link. signed-out reading does not download the editing code.
- `src/editor/inline.ts` manages owner checks, drafts, frontmatter, saves, downloads, and conflict copies.
- `src/editor/article-editor.ts` renders through `src/lib/markdown.mjs`, with source offsets on top-level blocks. only the active block mounts `src/editor/live-markdown.ts`; the rest remains the actual article html. finishing a block does not serialize the rendered dom back into markdown.
- `/editor/` remains owner-protected for old bookmarks and redirects into the article. its source endpoints stay owner-protected. the separate writing desk is removed.
- the editor reuses the existing `.reader-content`, `.article-frame`, header, footer, and alignment logic. on session loss it saves the draft, removes editing, and restores the public article.

for editor work, build, run `node --test scripts/editor.test.mjs`, and run `npm run test:editor`. use typecheck and lint for source checks; defer the full site/auth suite to CI. browser tests use a separate headless chromium profile with test-only auth fixtures; they do not alter a real browser profile or application auth. use an installed google chrome on macos, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, or install the bundled browser with `npx playwright install chromium`. tests compare read/edit geometry and styles on desktop and mobile, then check source preservation, undo, local recovery, session expiry, media rendering, and signed-out code loading.
