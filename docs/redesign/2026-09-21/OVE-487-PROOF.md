# Photographs and blocks in the shared composer — OVE-487

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- **One row of ordinary tools under the text**
  (`components/garden/lexical-journal/journal-composer-tools.tsx`, a labelled
  group rendered by the Lexical client, so every consumer of
  `StructuredJournalComposer` has it — the entry composer, the first-entry
  composer and the edit composer): **Photo** (several files in one pick),
  **bold**, **italic**, **bulleted list**, and **Block ▾** — every block of the
  registry with its Phosphor glyph (`journal-block-command-icons.tsx`, the same
  record the gutter's menus and the slash menu now read). A pointer press is
  cancelled before the editor loses its selection; a keyboard press acts on the
  selection Lexical still holds and puts the caret back; a chosen block takes
  the caret (the menu's `finalFocus` gives focus to the editor, not back to the
  trigger). The slash menu, the gutter and the shortcuts are unchanged; the
  shortcut sheet ends the row from `sm` up.
- **Text first.** The first line's placeholder is "Як минув день у саду?"
  (no slash key); later empty lines still name it. Below `sm` the 56 px gutter
  is hidden and the text has the whole width (DESIGN.md §5.11).
- **Photographs go into the story.** The separate "Optional photo" section of
  the entry composer and the first-entry composer is gone. Photo inserts the
  chosen files where the caret is — an empty line is replaced, nothing selected
  is: Lexical's `$insertNodes` replaced a selected block (a block move leaves a
  node selection) and selected words, and now photographs go after the selected
  block and the range is collapsed first.
- **Per photograph** (`journal-lexical-image-node.tsx`): its step in words —
  "Читаємо фото на пристрої… / Стискаємо у WebP на пристрої… / Надсилаємо в
  тимчасове сховище…" with the progress bar — and "Готове. З'явиться разом із
  записом після публікації." once staged, never "uploaded"/"published". A
  failure says its reason once (the duplicate "photo failed" line and the
  generic message under the editor are gone). Controls are always visible (no
  hover): Up, Down, Retry (failed only), Replace, Cover (`aria-pressed` when it
  is the cover) and Remove — each named with the photograph, e.g. "Прибрати:
  Фото 2 — Жовті плями на нижньому листі". Up/Down move the block by one,
  announce "{photo} переміщено на позицію {n} з {total}" in the composer's
  live region and keep focus on the photograph that moved. Keys pressed on
  these controls no longer reach Lexical (Enter on a focused button used to
  become a new paragraph). The preview keeps the photograph's own shape
  (`w-auto max-w-full max-h-128`), so a portrait is not padded out to the
  column.
- **Readiness beside Publish** (`journal-media-readiness.tsx`): one line for
  all photographs — "Готуємо фото: 1 з 3. «Опублікувати» зачекає на решту." /
  "Не вдалося підготувати: Фото 2, Фото 3. …" / "Фото готові: 2.
  Опубліковуються лише разом із записом." Publish with a failed photograph
  sends nothing and moves focus to that photograph's Retry. The edit composer
  shows the same line (silent when every photograph is already published).
- **Cover after media.** `JournalCoverControls` renders nothing until there is
  a photograph in the story, a cover photograph of its own, or a removal
  waiting for an answer. The focal control of the edit composer already
  appeared only with a photograph.
- **Descriptions (OG-UX-029).** The caption field is "Опис фото" with the
  placeholder "Що видно на фото — напр., жовті плями на нижньому листі".
  Feed, directory, followed-feed and community cards use
  `publicCardMediaAltText`: the photograph's caption, else `alt=""` — never the
  entry title the card's link has just announced. The feed/directory media
  query now selects `media_assets.caption`. The entry page keeps
  `publicMediaAltText` (caption, else title), OVE-432's rule for the page where
  the photograph is the content.
- **Copy that claimed a draft**: the editor's failure body said "Чернетку
  збережено…" (there are no drafts, ADR-0022); it now says the text stays on
  the screen and Retry continues. The limit of ten photographs has its own
  message instead of that failure body.
- **The editor's focus ring** is the product's (`outline-focus-ring`, offset
  4 px): the unlayered focus rule had turned `outline-none` into a black medium
  outline around the whole story.

### A production defect found on the way (PR #448)

`BrowserEphemeralMediaStager` read `fetch` through a getter and called it as
`this.fetcher(…)`; browsers refuse that receiver ("Illegal invocation") before
any request. The production chunk carried exactly that code, so **every
photograph added in any composer failed in production** after its WebP was
made, with no request reaching `/api/media/staging/sessions` or the Worker.
Every stager unit test injected its own fetcher, so none could see it. Fixed
in PR #448 (merged `da14a196`) with a test that stubs a receiver-checking
`fetch` and fails on the old getter. Production after the deploy, read in the
owner's browser without publishing anything: `POST /api/media/staging/sessions`
200, then `PUT media-stage.over.garden/…/1` 201, `…/1/v1280` 201,
`…/1/v480` 201; Remove sent the generation's `DELETE` (200). The served chunk
now reads `get fetcher(){return this.options.fetcher??((e,t)=>fetch(e,t))}`
and the old chunk answers 404.

## Proof

### Browser gate — `tests/composer-media.spec.ts` (registered)

Staging is answered in the browser's own terms (session capability, one
receipt per staged WebP) and the publish request is read and refused, so
nothing reaches production:

1. **A plain note** (UK, 1280 → 390 → 1280): no cover section and no photo
   section; the tool row has Photo, B, I, list, Block; the first placeholder
   has no slash; a selected word is bolded from the row and the caret stays in
   the editor (`aria-pressed` true); Tab from the editor reaches Block, Enter
   opens it, Quote is chosen and the caret is in the new quote; at 390 px the
   canvas has 0 px left padding and the gutter is hidden, at 1280 it is 56 px;
   Publish → exactly one entry whose document contains the quote.
2. **Photographs** (UK, 1280): one pick of a portrait JPEG, a landscape PNG and
   a file that only says it is a JPEG → three blocks; the cover section
   appears; the portrait sits in the upload step while its PUT is held
   ("Надсилаємо в тимчасове сховище"), then says ready-to-publish; the
   landscape's upload is refused and the broken file never converts; the
   readiness line names Фото 2 and Фото 3; Publish sends nothing and focuses
   the landscape's Retry; Remove of the broken file is named "Прибрати: Фото
   3"; a caption renames the portrait's controls; Retry by keyboard succeeds;
   Remove takes the broken file; Down by keyboard moves the portrait below the
   landscape, the live region says "Фото 2 — Жовті плями на нижньому листі
   переміщено на позицію 3 з 4" and focus stays on the portrait; the line says
   "Фото готові: 2."; Publish sends the document's photographs in the story's
   order with the caption, the automatic cover, and **exactly** the receipts
   of their latest uploads; every upload was `image/webp` with a long edge ≤
   2560, no rendition was staged twice, nothing of the broken file was ever
   uploaded; the refused publish persists nothing; no page errors.

### Other gate specs run locally against the production build

`journal-notion-composer.spec.ts` 2/2 (updated: the tool row is a labelled
group; the first placeholder invites writing and the next names "/"; the cover
section appears with the first photograph), `entry-composer.spec.ts` 4/4,
`journal-entry.spec.ts` 6/6 (old entries render), `static-documents.spec.ts`
18/18 (the LCP rule now skips illustrations by what they are, not by an empty
`alt`, since an uncaptioned card photograph is `alt=""` too),
`accessibility.spec.ts` 8/8, `garden-workspace.spec.ts` 6/6.

### Unit

Image controls (named actions, move bounds, ready only for staged photographs,
failure reason once), readiness summary and copy in UK/BG/RU (no "uploaded",
"saved" or "published" claim), cover section absent without photographs and
present with one, command coverage (the row reaches every block; every command
has a Phosphor glyph), copy keys and placeholders, `publicCardMediaAltText`,
the feed query selecting `caption`, the home feed rendering caption/`alt=""`,
and the stager's default `fetch`. Document goldens and round-trips unchanged.

### Screenshots (`docs/redesign/2026-09-21/ove-487/`)

`uk-1280-*`, `uk-390-*`, `bg-390-*`, `ru-390-*`: `1-empty` (text first, no
photo or cover section), `2-pending-failed` (upload step, refused upload,
broken file, readiness naming the failed photographs), `3-ready` (captioned,
ready to publish, cover section, readiness "ready"); `uk-1280-4-block-menu`.

## Limits

- The server's claim and promotion of staged photographs is the unchanged
  ADR-0019 contract; it is proven by the Worker's own tests and was not
  re-run end to end locally (a local Worker must call back
  `https://over.garden`, by its configuration check). The production read
  above proves the browser half after PR #448.
- Community and followed-feed cards do not yet carry captions (their queries
  select no caption); their photographs are decorative until they do.
