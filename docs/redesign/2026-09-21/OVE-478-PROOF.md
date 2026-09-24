# OVE-478 — the redesign, integrated, verified and released

Receipt for [OVE-478](https://linear.app/overgarden/issue/OVE-478/integrate-verify-and-release-the-complete-product-redesign),
the last task of OVE-474. Everything below is measured **locally** — a
production build of the tested tree, a real PostgreSQL 18, Meilisearch 1.48.1
and an S3 stand-in, Chromium 141 — unless it says **production**, and a local
figure is never offered as a production one.

- **Tested tree:** branch `claude/fervent-mendel-hnadyo` on `main` at
  `1aa34d6f` (OVE-469, the last program merge). The pull request, its CI runs,
  the merge commit and the deployment are under [Release](#release).
- **Evidence:** `docs/redesign/2026-09-21/ove-478/`. The two new sweeps write
  their rows to `apps/web/test-results/route-families/` and
  `apps/web/test-results/writing-journeys/` on every gate run; the copies in
  `ove-478/route-families/` and `ove-478/journeys/` are from the run this
  receipt cites.

## Summary

OVE-478 put the thirty-one redesign tasks on one tree and checked them as one
product: every page file owned, every family measured for a guest, a member
and the owner in Ukrainian, Bulgarian and Russian, the six writing journeys
walked with their steps counted and read back from the database, one real
screen reader driven by its own keys, and the whole gate run on the candidate.
Checking them together found defects no single task could see, and this change
fixes them rather than listing them:

- **Addresses that answered wrongly.** An unknown answer, guide, note or
  market name answered **`500` — on production** — and 23 of the 32
  `[...missing]` catch-alls answered `200` with a `noindex` body. Every address
  no page serves is now a real `404`, decided in `proxy.ts` before anything
  streams (ADR-0029 D3).
- **Words.** "Обліковий запис" named the account in a product where "запис"
  is an entry (154 strings in 13 files); Bulgarian called the account and the
  public profile both "профил"; the operator's erasure counts were Ukrainian on
  the Bulgarian and Russian screens; region names were English under every
  interface; the home page said a journal is published.
- **What a screen reader heard.** Orca read the author prefix and the name as
  one word («АвторОлена»); the composer announced "not yet published" straight
  after "published"; the object and edit pages were titled with the space's
  generic title; a Bulgarian or Russian reader of a garden page had a
  Ukrainian document around it. A publish lost to the network left the reader
  on the page's body — Publish was disabled while it worked, so it gave focus
  up, and Enter retried nothing — and the failure told a text note to fix "the
  marked photo". The garden's group headings read «Простори3»: Chromium drops
  a space that React writes alone after text, and thirty-odd more lines in the
  source had the same shape («Надіслано24 вересня»).
- **What the eye saw.** A tab strip cut the lowest pixel off its underline and
  focus ring; the raw `404`/`410` document and the global error page were the
  pre-redesign chrome.
- **The keyboard on a small screen.** With a phone's keyboard up, Tab
  scrolled the next control under the composer's sticky publish row, hidden
  whole (WCAG 2.4.11). Focus keeps a sticky row clear now.
- **Photographs.** Captions never reached the Following feed, community cards
  or saved entries: every photograph there was `alt=""`.
- **Writing.** The one composer could not create what the gardener does not
  have yet. A plant or an animal — in the space in context, another, or a new
  one — is now created while writing, with its first entry, in one
  transaction, the text kept (FAST_ENTRY "Creating during writing").
- **Gates.** Eighteen browser specs scanned without WCAG 2.2; the gate now
  fails a spec that spells its own list. Two new gate specs sweep every family
  and walk the six journeys.

Measured before and after on one machine and one database (criterion 15),
the candidate paints first 0.15–0.19 s later on three of four pages, and the
organism card at the same moment: `main`'s icons log 58–90 console errors a
page, which with DevTools attached makes it paint an emptier frame sooner and
then shift it (CLS up to 0.30 on `main`, at most 0.0004 here). `/journals`'
LCP is an excerpt painted in that frame and moves with it, 1.73 → 1.90 s; the
photographs' LCP moves within run-to-run noise. These are local numbers.

What stays open is classified under [Residuals](#residuals-classified): one
screen reader was heard, not VoiceOver or NVDA; the production LCP budget is
known gap 11, unchanged by this task; a web font can still move a feed card on
the local fixture, as it can on `main`; no research with gardeners was run, so
nothing here is a retention or conversion claim.

## Criterion by criterion

### 1. Route and function ownership

All 132 page files are classified and owned (`ove-478/route-matrix.md`, one
row per file; `ove-478/baseline-diff.md` against the audit's 114): **90
migrated, 9 intentionally redirected, 32 retired** (the `[...missing]`
catch-alls) **and 1 diagnostic** (`/skeleton`, `404` in production). No file is
unowned. Two capabilities are **future contracts with no page yet** and are not
passed here: notes backed by the database (OVE-381…402) and the editorial
owner pages (OVE-406). `ROUTE_OWNERSHIP.md` now has a row for every file — the
six `/q` twins added by OVE-467 had none, and its heading said 114 over 126
rows. Route handlers outside `/api`, and every API route, are in
`ove-478/api-routes.md`.

What every family owes every reader is measured by
`tests/route-families.spec.ts` for a guest, a member and the owner in UK, BG
and RU at 320 px: the status, the document's language, one visible `h1`, one
`main`, one language control, no sideways scroll, no error state, no two
controls drawn over each other and no label cut off by its box. A ✓ is all of
them; the rows are in `ove-478/route-families/{uk,bg,ru}.json`.

198 pages measured (66 UK, 66 BG, 66 RU); 0 cells fail a check.

| Role | Family | Owner | Address (UK) | UK | BG | RU |
| --- | --- | --- | --- | --- | --- | --- |
| guest | Feed · Latest | OVE-492 | `/` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Feed · Following | OVE-492 | `/feed` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Journals directory | OVE-492 | `/journals` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Journals · query view | OVE-482 | `/journals?kind=plant` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Entry | OVE-493 | `/@gardener_…/post/1` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Entry · removed (seven-day 410) | OVE-478 | `/@gardener_…/post/2` | 410 ✓ | 410 ✓ | 410 ✓ |
| guest | Entry · number nobody has | OVE-478 | `/@gardener_…/post/999999` | 404 ✓ | 404 ✓ | 404 ✓ |
| guest | Public profile | OVE-494 | `/@gardener_…` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Object passport | OVE-495 | `/@gardener_…/objects/route-sweep-…` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Catalogue · door | OVE-496 | `/catalog` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Catalogue · register | OVE-496 | `/catalog?q=tomato` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Organism card | OVE-497 | `/species/ove478-routes-organism-0-solanum-lycopersicum-…` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Organism · form | OVE-497 | `/species/ove478-routes-organism-0-solanum-lycopersicum-…/ove478-routes-organism-0-de-barao-…` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Communities | OVE-500 | `/communities` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Knowledge hub | OVE-498 | `/knowledge` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Answer | OVE-498 | `/answers/why-are-tomato-leaves-yellow` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Guide | OVE-498 | `/guides/start-a-living-plant-record` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Notes (blog) | OVE-499 | `/blog` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Note | OVE-499 | `/blog/ai-garden-advice-vs-real-garden-proof` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Market page | OVE-499 | `/markets/ukraine` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Source archive (EPPO) | OVE-499 | `/sources/eppo` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Privacy | OVE-505 | `/privacy` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Support | OVE-505 | `/support` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | First-publication disclosure | OVE-505 | `/first-publication-disclosure` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Sign in | OVE-504 | `/auth/sign-in` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Sign up | OVE-504 | `/auth/sign-up` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Sign-in help | OVE-504 | `/auth/help` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | My garden · guest | OVE-489 | `/garden` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Write · guest | OVE-486 | `/garden/new` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Activity · guest | OVE-501 | `/notifications` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Bookmarks · guest | OVE-502 | `/bookmarks` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Wishlist · guest | OVE-502 | `/wishlist` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Erasure request · guest | OVE-505 | `/erasure` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Unknown first segment | OVE-478 | `/no-such-family-here` | 404 ✓ | 404 ✓ | 404 ✓ |
| guest | Community | OVE-500 | `/communities/observation-and-care` | 200 ✓ | 200 ✓ | 200 ✓ |
| guest | Topic | OVE-498 | `/topics/breeds` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | My garden | OVE-489 | `/garden` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Write (global) | OVE-486 | `/garden/new` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Write (contextual) | OVE-486 | `/garden/new?object={uuid}` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Space setup | OVE-484 | `/garden/spaces/new` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Object setup | OVE-485 | `/garden/objects/new` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Space page | OVE-490 | `/garden/spaces/{uuid}` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Space settings | OVE-490 | `/garden/spaces/{uuid}/settings` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Object page | OVE-491 | `/garden/objects/{uuid}` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Object settings | OVE-491 | `/garden/objects/{uuid}/settings` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Object provenance | OVE-491 | `/garden/objects/{uuid}/provenance` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Entry editing | OVE-488 | `/garden/entries/{uuid}/edit` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Public profile editing | OVE-503 | `/garden/profile` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Account settings | OVE-503 | `/account/settings` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Sign-in and security | OVE-503 | `/account/security` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Activity | OVE-501 | `/notifications` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Activity preferences | OVE-501 | `/notifications/settings` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Bookmarks | OVE-502 | `/bookmarks` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Wishlist | OVE-502 | `/wishlist` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Erasure request | OVE-505 | `/erasure` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Lineage · questions | OVE-495 | `/garden/lineage/questions` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Lineage · claims | OVE-495 | `/garden/lineage/claims` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Owner queue · refused to a member | OVE-506 | `/garden/catalog/queue` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Moderation · refused to a member | OVE-500 | `/account/communities` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Erasure queue · refused to a member | OVE-505 | `/garden/privacy/erasure-requests` | 200 ✓ | 200 ✓ | 200 ✓ |
| member | Workspace · unknown address | OVE-478 | `/garden/no-such-page` | 404 ✓ | 404 ✓ | 404 ✓ |
| owner | Owner · decision queue | OVE-506 | `/garden/catalog/queue` | 200 ✓ | 200 ✓ | 200 ✓ |
| owner | Owner · sources | OVE-506 | `/garden/catalog/sources` | 200 ✓ | 200 ✓ | 200 ✓ |
| owner | Owner · erasure queue | OVE-505 | `/garden/privacy/erasure-requests` | 200 ✓ | 200 ✓ | 200 ✓ |
| owner | Owner · community moderation | OVE-500 | `/account/communities` | 200 ✓ | 200 ✓ | 200 ✓ |
| owner | Owner · comment moderation | OVE-500 | `/account/moderation/comments` | 200 ✓ | 200 ✓ | 200 ✓ |

### 2. Terminology in UK, BG and RU

The five words keep the meanings FAST_ENTRY gives them — a **space** is a
place, an **object** is one plant or animal a gardener keeps, an **organism**
is the shared reference, an **entry** is one dated observation, a **journal**
is the history entries make:

- A passport's tombstone said "living objects" and led to the organism
  catalogue — the mix-up OG-UX-019 found in its breadcrumb. It now leads to the
  author's "Рослини й тварини" or to the journals.
- "Опубліковані журнали відкриті для всіх" on the home page said a journal is
  what gets published; an entry is ("Опубліковані записи…"), in all three.
- **Account** is "акаунт" in UK and BG, as it was "аккаунт" in RU: 154
  strings in 13 files said "обліковий запис"/"профил" for the account, and BG
  used "профил" for the account and the public profile alike. "Профіль" /
  "профил" / "профиль" is now only the public profile, and
  `trust-surface-copy.test.ts` pins it. Operator audit logs in the privacy
  notice are "протоколи", so "журнал" means only a gardener's journal. The
  versioned erasure acknowledgement and first-publication lines keep the
  wording accepted under their versions, by rule.
- The operator's erasure counts read Ukrainian on the BG and RU screens (about
  30 labels spread from UK); every label is written per language now, and a
  test fails on a Ukrainian letter in them.
- Region names were English under every interface ("Region: Ukraine - Kyiv
  City" on entries, organism cards and lineage pages). Repositories hand over
  the code and the page words it: "Регіон: Україна — місто Київ", "Регион:
  Украйна — град Киев", "Регион: Украина — город Киев".
- **UGC stays out of the chrome.** On the BG and RU sweeps, every visible text
  node with a Ukrainian letter — 44 distinct strings, each listed with where it was seen in `ove-478/route-families/ukrainian-letters.md` — is a gardener's own words
  from the fixtures (titles, notes, object names, photo descriptions) or the
  language list's endonym "Українська"; none is interface text. The copy
  modules were scanned the same way and hold only that endonym. With Orca, a
  Bulgarian entry in a Ukrainian interface is spoken in a Bulgarian voice and
  its byline and dates in a Ukrainian one (criterion 7).
- **Long labels.** At 320 px, where BG and RU labels are longest against the
  width, in all three languages: no page scrolls sideways (0 of 198), and the only label clipped is the skip link, which is clipped until it has focus (174 of 174). The sweep also records every pair of control boxes that intersect, whatever layer each is drawn in — 1368 pairs, which the gate does not assert — and every pair but 9 is layering the page does on purpose, not a label running into its neighbour: 948 are the closed language menu's options lying over the footer links, 174 the skip link under the menu button, 218 a link or button under the fixed tab bar, 4 the editor's toolbar under the sticky publish row, 6 a password field's show-password button inside its field, and 9 the profile's open «more» menu over its tabs. The other 9 are two unnamed inputs on the three writing pages, one over the other, not investigated here.

### 3. States

| State | Where it is proven | The next action it offers |
| --- | --- | --- |
| 404, an address no page serves | `route-families.spec.ts` "every address no page serves…": 47 addresses — one below each of the 32 sections with a catch-all, an unknown answer, guide, note and market name in each language, and three deeper paths — 47 answer `404` with `noindex, nofollow` (47), in the reader's language, one `h1`, one link | home, in the reader's language |
| 404, an entry number or passport nobody has | sweep row "Entry · number nobody has"; the passport's by `public-object-passport-lifecycle.test.ts` | the author's other entries (`#profile-entries`) or plants and animals (`#profile-objects`), while the profile answers |
| 410, the seven-day retention | sweep row "Entry · removed (seven-day 410)" | the author's other entries |
| Forbidden | sweep rows "… · refused to a member" (the owner's queue, moderation, the erasure queue) | who may, and the way back |
| Expired link | `lineage-handoffs.spec.ts` (an expired invitation), `auth-screen.spec.ts` (an expired reset link) | ask again, or sign in |
| Empty, a new gardener | `garden-collection.spec.ts` (0 objects), `personal-surfaces.spec.ts`, the journey spec's new gardener | the one first action |
| No search results | `journals-directory.spec.ts`, `catalog.spec.ts`, `owned-destinations.spec.ts` | clear the search, search everywhere, or create while writing |
| Pending | the composer's "Публікуємо один завершений запис…", heard with Orca | Cancel |
| Bounded failure | `writing-journeys.spec.ts` (a publish refused before the server, and one committed with its answer lost), Orca (the network gone at Publish), `prove:workspace-resilience` | Retry, the text kept |

Two classes of address answered wrongly and now answer `404` before anything
streams (ADR-0029 D3). Paths below a section that none of its pages match —
`/catalog/x`, `/garden/objects/…/x`, `/bg/journals/x`, `/col/x/y` — answered
`200` with a `noindex` body: `SECTION_SUBPATHS` in `lib/root-route-segments.ts`
lists every served sub-path, and its test fails when it and the filesystem
drift. An unknown answer, guide, note or market name answered **`500` on
production** (`https://over.garden/answers/…`, a read-only GET, 2026-09-24),
the framework's English error page: those pages render on demand, so
`notFound()` came after the stream had begun; `server/authored-addresses.ts`
asks the authored content first. The sweep also fails on any page that renders
an error state — its own fixture opened the edit page on one (a hand-written
document the normalizer refuses), which is how that check was proven to bite.

### 4. Phosphor and Thiings

`pnpm check:interface-icons`: 0 violations. The last text glyphs acting as
icons went: the passport's "←"/"→" (Phosphor arrows), the object page's "›"
breadcrumb separators (CaretRight), and the raw lifecycle document's "▾" and
"✓" (`components/icons/raw-glyphs.ts`, paths of the installed Phosphor icons,
checked by test). An icon's size is a number in its attribute and a token in
the stylesheet (DESIGN.md §2.8): a `var()` in an SVG attribute made Chromium
log an error per icon and draw some as 150 × 288 boxes. What remains is
typography inside sentences: the owner queue's "A → B" for a merge.
Illustrations are Thiings on empty and setup states only (OVE-479); no error,
404 or destructive state carries one.

### 5. Dead links, rails, moved affordances

The crawl follows every same-origin link each swept page offered, as each
role, in each language:

| Language | Links followed | 2xx | 3xx | 404/410 on an entry or passport another spec removed | 404/410 elsewhere | 5xx |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| UK | 291 | 228 | 43 | 20 | 0 | 0 |
| BG | 287 | 209 | 41 | 37 | 0 | 0 |
| RU | 280 | 216 | 41 | 23 | 0 | 0 |
| all | 858 | 653 | 125 | 80 | 0 | 0 |

No link answered 404 or 5xx except the entity addresses in the fifth column.

Moved blocks keep their old anchors (OVE-491's legacy anchors; the space
journal's `308`). Every rail left is a page's own context with real links
(OVE-481, 494, 496, 498, 500 and 506 removed the generic ones). The `(default)`
wrappers the proxy never serves, and three API routes the product no longer
calls, are listed under Residuals, not deleted here.

### 6. Static bytes, settled reads, locale and session, no JavaScript

`static-documents.spec.ts` (in the gate) reads the static families' served
bytes with scripts off, and a reader without JavaScript reads the page.
`pnpm check:workspace-settled-reads`: 140 render modules scanned, 0 unsettled reads. The like panel's read
swallowed Next's own signals, so each runtime shell regeneration logged a
degraded panel no reader saw (ten false incidents in one sweep); it rethrows
them now (`unstable_rethrow`). A request-time document carried `lang="uk"` for
a Bulgarian or Russian reader; the shell sets the reader's language as its
segment arrives. The erasure pages, which bypass the shell, had no language
control; they have one.

### 7. Roles, languages, viewports, keyboard, and one real screen reader

Guest, member and owner × UK, BG, RU: the sweep (criterion 1). Viewports:
320 px (400 % zoom of 1280), 390 × 844 and 844 × 390 (a phone upright and on
its side), 1280 × 720, 1366 × 768 and 1440 × 900 (laptops), 1280 × 900 at
device scale 2 (200 % zoom) and 1280 at 200 % text.

**The screen reader.** Orca 46.1 with Chromium 141 on Linux (AT-SPI 2.52,
speech-dispatcher 0.12, espeak-ng 1.51), against `next start` of the tested
tree at 1280 × 900. Every key went through the X server (`xdotool`), so Orca
received it as from a keyboard; what it said is copied from its own debug log.
The transcript — 85 steps, every line spoken, the method and settings at its
top — is `ove-478/screen-reader/transcript.md` (and `.json`). Heard:

- **Structure.** The home page by headings (H), links (K) and landmarks (M),
  down to the language control in the footer's navigation; Enter, Tab, Enter
  chose Bulgarian, and the next page spoke in a Bulgarian voice. An unknown
  answer's `404`, in Bulgarian: the one way on, then the language control,
  nothing else.
- **Dialogs.** The journals' filters opened with Enter, and Orca read the
  panel in full, its explanation first, while focus stayed on «Фільтри» — a
  native popover leaves it on its button, and Tab goes on into the panel;
  Escape closed it with focus still there. The sign-out confirmation opened as
  an alert with focus inside it, and Escape gave focus back to «Вийти з
  акаунта».
- **Writing.** On `/garden/new` the picker has focus («Куди записати?
  editable combo box»). A plant the gardener does not have («Малина») is
  started while writing and cancelled back to the picker. The three «Томат
  черрі» are read with their spaces («Рослина · Балкон», «· Город», «·
  Теплиця»), and the one on the balcony is chosen by arrows; focus moves to
  the text. The first-publication box reads «check box not checked required,
  invalid entry», and Publish «grayed» until it is ticked. With the network
  gone, Publish announces «Запис не опубліковано. Спробуйте опублікувати ще
  раз.» once, the text stays and focus stays on Publish; Enter again
  publishes, and the database holds one entry, on the balcony's tomato.
- **Language.** A Bulgarian entry in a Ukrainian interface: its title and text
  in a Bulgarian voice, the page's own words in a Ukrainian one (OG-UX-030).
- **The collection.** «Простір саду», then «Простори 3» and «Рослини й
  тварини 3» by headings.

Found with it and fixed here: «АвторОлена», the byline's prefix and name read
as one word; "not yet published" announced straight after "published"; the
object and edit pages titled with the space's generic title; a Bulgarian or
Russian garden page with `lang="uk"`; focus lost to the page's body after a
failed publish (Publish was disabled while it worked), with a failure that
told a text note to fix "the marked photo"; and «Простори3», a space React
writes alone after text, which Chromium drops — the same shape was on
thirty-odd more lines (criterion 9).

Orca's own behaviour, left as it is: when the composer moves focus into its
field by script, Orca stays in browse mode, where the arrows read the page
rather than the list; the session steps out of the field and back
(Shift+Tab, Tab), and Orca follows into focus mode. Once, pressing the
account button, Orca announced it «grayed» as the menu's code replaced it;
the menu opened with focus on its first item.

Not heard: the space and object setup flows, the lineage inboxes, the
account's pages and the profile. They rest on keyboard walks, axe and DOM
assertions (residual 1).

### 8. The six writing journeys

`tests/writing-journeys.spec.ts`, in the gate, walks FAST_ENTRY's six
scenarios on a garden with three same-named tomatoes in three spaces, and
reads every acknowledged publish back from the database. An activation is a
press of a control; typing is not counted. `ove-478/journeys/journeys.json`
has each run's steps.

| # | Journey | Language, width | Activations before writing | to Publish | Steps | Where it landed | Acknowledged |
| ---: | --- | --- | ---: | ---: | --- | --- | --- |
| 1 | same-name object note | UK, 1280 | 2 | 1 | Write (shell) → choose the tomato in its space → Publish | object b6d95b6f in "Терасата до южния прозорец — наблюдения на многогодишните растения 2" | yes |
| 2 | space weather note | BG, 390 | 1 | 2 | Write (space) → mention one plant (required for a space entry) → Publish | space a66c37e9 (mentions c196b59c) | yes |
| 3 | change destination after text and photograph | RU, 1280 | 1 | 3 | Write (object) → Change → choose the other tomato → Publish | request for object 1b083c32 (was c196b59c); promotion refused locally | no — see below |
| 4a | create a plant while writing | UK, 390 | 3 | 1 | Write → New plant or animal «Малина» → choose its space → Publish | new object ca5203cc in "Терраса у южного окна — наблюдения за многолетними растениями 3" | yes |
| 4b | create an animal in a new space while writing | UK, 390 | 4 | 1 | Write → New plant or animal «Кури» → animal → in a new space → Publish | new object bb3b5cbd in new space "Курник" | yes |
| 5 | failed publish recovery | BG, 1280 | 1 | 2 | Write (object) → Publish (Enter) → connection reset before the server; focus stays on Publish → Publish again (Enter) → acknowledged once → Write (object) → Publish → committed, answer lost → Publish again → same publish id, answered from the committed entry | object b6d95b6f; one row per note | yes |
| 6 | find the published entry | RU, 390 | 0 | 0 | search My garden → open the tomato → open the entry | /@gardener_…/post/1 | yes |

- **Journey 3 is not acknowledged locally, by design of the stack.** A
  photograph is staged by the Cloudflare Worker and promoted when the entry is
  published; a local run cannot sign for the Worker, so the spec reads the
  publish request instead — it names the tomato chosen after the text and the
  photograph were in, with the image block and its claim receipt — and the
  refusal leaves the text, the photograph and zero rows. Promotion is the
  Worker's, outside what a local run proves (`OVE-487-PROOF.md` §Limits).
- **Journey 5 publishes twice on purpose.** A publish refused before the
  server is retried and acknowledged once; a publish that committed but whose
  answer was lost is retried with the same publish id and answered from the
  committed entry. One row per note.
- **Journey 6 writes nothing.** It finds the published entry again from My
  garden's search, the object's history and the permalink, in three steps.
- Creating while writing (journey 4) is new in this change: the object, the
  space when it is new, and the first entry are one transaction, and the
  composer lands on the new object's page.

### 9. WCAG 2.2 AA

- **Focus visible, and not obscured (2.4.7, 2.4.11):** every gate spec's ring
  walk; the phone sweep tabs up to 25 stops on 8 pages upright and on its side
  and fails on a control the fixed header or tab bar covers: 0 controls covered in 16 page loads.
- **Headings and landmarks:** one visible `h1` and one `main` on every swept
  page; Orca's landmark key walks banner, navigations, main, complementary,
  content information and the language navigation.
- **Dialogs return focus:** heard — Escape on the sign-out confirmation gives
  focus back to "Вийти з акаунта", and Escape on the journals' filters gives
  it back to "Фільтри"; `component-specimens.spec.ts` for every dialog, sheet
  and menu.
- **Names (4.1.2, 2.5.3):** the author prefix reaches the accessibility tree
  with its space now (a defect Playwright's computed name did not show); the
  language control's name carries the language it shows; the object and edit
  pages have titles of their own (2.4.2). Orca read the garden's group
  headings as «Простори3» and «Рослини й тварини3». A margin drew the gap, and
  the `{" "}` added first did not help: React writes a space that follows text
  after a `<!-- -->` separator, and Chromium drops a space standing alone there
  from the accessibility tree. Thirty-odd more places in the source had the
  same shape — the first-publication page's «Версіяfirst-publication-v6», a request's
  «Надіслано24 вересня», a saved entry's date, a card's safe region, the
  moderation and erasure queues' dates, the lineage page's depth. Every space
  between two words is inside its text now; `src/lib/jsx-word-spaces.test.ts`
  fails a lone one in the source, and the sweep fails a page where two words
  are read as one: 0 on 198 page loads.
- **Status messages (4.1.3):** the composer's region speaks only on a change
  of state, and a failure is announced once.
- **Target size (2.5.8):** axe `target-size` runs in every gate spec now —
  eighteen specs scanned with a WCAG 2.1 list until this change, and the
  browser-spec gate fails a spec that spells its own list;
  `mobile-shell.spec.ts` holds header and tab controls to 44 × 44.
- **Dragging (2.5.7):** `composer-media.spec.ts` and
  `journal-notion-composer.spec.ts` move photographs and blocks by keyboard.
- **Accessible authentication (3.3.8):** `auth-screen.spec.ts` — no cognitive
  test; paste and password managers allowed.

### 10. Mobile keyboard, orientation, text size, zoom, contrast, motion

- **200 % text (1.4.4):** with the reader's text size at 200 % on a 1280 px window, 0 of 8 pages (`/`, `/@gardener_…/post/1`, `/journals`, `/catalog`, `/species/ove478-routes-organism-1-solanum-lycopersicum-…`, `/@gardener_…`, `/auth/sign-in`, `/answers/ove478-no-such`) scroll sideways.
- **400 % zoom and reflow (1.4.10):** the 320 px sweep, every family, three
  languages; the horizontal strips at 100 % and 200 % zoom have no vertical
  track and clip no focus ring (`strips.json`, `strip-*.png`) — the profile's
  tab strip clipped the lowest pixel of its ring and underline until its rule
  moved inside it.
- **Portrait and landscape (1.3.4):** 390 × 844 and 844 × 390, the same 8 pages: 0 scroll sideways, and the focus walk above covers the fixed chrome (`phone-portrait-entry.png`, `phone-landscape-entry.png`). Photographs of both
  orientations are `redesign-fixtures.spec.ts`'s and OVE-469's
  production-weight fixture's.
- **Mobile keyboard:** a 390 × 390 viewport stands in for a phone with its
  keyboard up. Tab reaches the destination field, the text and Publish (the
  first-publication box ticked on the way, as Publish waits for it), and no
  control it reaches is hidden: 16 Tab stops from the top of the page to Publish, 0 of them hidden. The check found Tab scrolling
  the next control under the composer's sticky publish row, hidden whole
  (2.4.11); below `sm`, focus now keeps a sticky row's height clear
  (`--sticky-row-room`, DESIGN.md §2.11 "The bottom of the screen is one
  number"). The journeys
  at 390 px are typed with the keyboard.
- **Reduced motion (2.3.3):** with `prefers-reduced-motion`, 0 elements on the 8 pages have a transition or animation longer than 0.01 ms.
- **Forced colours:** the first Tab stop draws a 2 px ring on 8 of 8 pages, and the current section is underlined, not only coloured, on 7 of the 7 pages that mark one.
- **The first `/journals` result at laptop heights (OG-UX-011):** 1280×720: its top at 634 px of 720; 1366×768: its top at 634 px of 768; 1440×900: its top at 634 px of 900 — on the first screen at every laptop height.
- **Contrast, measured** from the tokens' own OKLCH values — the product ships
  one light theme, so there is one column:

| Pair | Minimum | Measured |
| --- | ---: | ---: |
| text (`--color-text` on `--color-surface`) | 4.5:1 | 17.89:1 |
| heading (`--color-text-heading` on `--color-surface`) | 4.5:1 | 14.32:1 |
| secondary text (`--color-text-secondary` on `--color-surface`) | 4.5:1 | 9.37:1 |
| muted text (`--color-text-muted` on `--color-surface`) | 4.5:1 | 6.32:1 |
| muted text on sunken (`--color-text-muted` on `--color-surface-sunken`) | 4.5:1 | 5.90:1 |
| link (`--color-text-link` on `--color-surface`) | 4.5:1 | 17.89:1 |
| text on the primary action (`--color-text-on-fill` on `--color-action`) | 4.5:1 | 17.89:1 |
| text on a danger fill (`--color-text-on-fill` on `--color-danger-fill`) | 4.5:1 | 5.75:1 |
| control border (`--color-border-control` on `--color-surface`) | 3:1 | 4.18:1 |
| focus ring on surface (`--color-focus-ring` on `--color-surface`) | 3:1 | 17.89:1 |
| focus ring on sunken (`--color-focus-ring` on `--color-surface-sunken`) | 3:1 | 16.71:1 |
| danger text on danger surface | 4.5:1 | 6.97:1 |
| success text on success surface | 4.5:1 | 8.41:1 |
| text on warning surface (`--color-text` on `--color-warning-surface`) | 4.5:1 | 16.75:1 |
| info text on info surface | 4.5:1 | 7.24:1 |

WCAG 2.x relative luminance, from each token's OKLCH value in `globals.css`
converted to sRGB.

### 11. No wrong destination, no duplicate

`writing-journeys.spec.ts` ends by reading every acknowledged publish back
from the database: each entry is on the object or space its journey chose, and
no body was written twice — including the retry after a publish that committed
with its answer lost, which is answered from the committed entry by the same
publish id. 6 of the 7 runs were acknowledged and read back where they were sent. These are fixture observations on a synthetic
garden, not research with gardeners.

### 12. The finding ledger

`ove-478/finding-ledger.md` maps all 45 OG-UX findings to receipts, specs and
residuals as of `main`: 35 met, 10 partly met, none unmet. OVE-478 took the
ten further where an integration task can:

| Finding | Why it was partly met | What OVE-478 did | Closure now |
| --- | --- | --- | --- |
| OG-UX-010 journals vs entries | the acceptance asks for user testing | the five words reviewed in three languages (criterion 2) | **Partly met** — labels ship; no research with gardeners was run (residual) |
| OG-UX-011 the journals' filters | the first result's place at a laptop height was never measured; axe on 2.1 | measured at 1280 × 720, 1366 × 768 and 1440 × 900 (criterion 10); axe on 2.2; the filters heard with Orca | **Met** |
| OG-UX-026 an animal called a plant | the Russian label had no test; names unheard | `living-object-passport.test.ts` asserts the BG and RU kind words; they are plain text in the accessibility tree | **Met** (not heard: residual 1) |
| OG-UX-028 WCAG 2.2 | 18 specs on 2.1; no screen reader | every gate spec on `WCAG_AA_TAGS`, the gate fails a spec with its own list; Orca heard (criterion 7) | **Met** for one pairing; VoiceOver and NVDA unperformed (residual 1) |
| OG-UX-029 photo descriptions | the Following feed, community cards and saved entries dropped captions | the caption reaches all three (`feedCardMediaByEntry`, `coverCaption`) | **Met**; captions not judged against real photographs (residual 5) |
| OG-UX-030 `lang` on a card | "verify with a screen reader" | heard: a Bulgarian entry in a Bulgarian voice, its byline and dates in a Ukrainian one | **Met** |
| OG-UX-031 horizontal strips | nothing showed the track gone or the ring whole | the strips at 100 % and 200 %: no track; a 1 px clip found and fixed | **Met** |
| OG-UX-041 covers and density | production LCP; crops never judged on real photographs | measured before and after (criterion 15); no change to LCP intended | **Partly met** — known gap 11 (residual 2); crops (residual 5) |
| OG-UX-042 accessibility beyond axe | no journey had manual AT | two of the six journeys heard (a same-name object note; the publish lost to the network, retried), with reading, the language control, a 404 and two dialogs | **Partly met** — four journeys proven by keyboard and axe only (residual 1) |
| OG-UX-043 large collections | FAST_ENTRY never walked as one suite; no create-while-writing | the six journeys with step counts, read back (criterion 8); a plant or animal created while writing | **Met**; synthetic 20 spaces / 1000 objects only (residual 6) |

The cross-cutting residuals of the ledger — no screen reader anywhere, axe on
2.1, English region names, decorative photographs — are closed except the ones
named above.

### 13. Prerequisite receipts

`ove-478/prerequisite-receipts.md`: all 34 prerequisite issues are Done, every
PR's six checks green on its head, and 36 of 39 tested trees identical to their
squash commits (three heads are not in the clone). OVE-478 found the
production deployments five receipts did not name (OVE-468, 469, 497, 502,
506); the two OVE-467 PRs without one (#441, #442) have no deployment Vercel
still keeps, and both commits are ancestors of every production deployment
since 2026-09-22.

### 14. Gates on the integrated candidate

Run on the candidate's tree, the same commands CI runs:

| Gate | Result |
| --- | --- |
| `pnpm lint` (`eslint . --max-warnings=0`) | 0 problems |
| `pnpm typecheck` — the app and the media-staging Worker | 0 errors |
| `pnpm check:banned-dependencies` | 1,147 files, 0 violations |
| `pnpm check:design-tokens` | 1,820 files, 0 primitives outside `globals.css` |
| `pnpm check:component-tests` | 54 components, 0 without a role-and-name test |
| `pnpm check:workspace-settled-reads` | 140 render modules, 0 unsettled reads |
| `pnpm check:browser-specs` | 63 specs in `tests/`, 62 in the gate, 1 with a script of its own, 0 problems |
| `pnpm check:interface-icons` | 0 violations |
| The accepted wireflows (`node --test …/wireflows/model.test.mjs`) | 8 of 8 |
| CI's database steps on a fresh database — `smoke:public-identity`, `db:types:check`, the queue and address contracts, `public:reads:prove-database` and the ten schema and catalogue proofs | 18 of 18 |
| `pnpm test` — vitest, the checks above, the media-staging Worker's tests and the ephemeral handoff | vitest 610 files and 5,317 tests passed, 13 skipped; the checks as above; the Worker 14 of 14; the handoff plan approved and aligned — exit 0 on `11a1aa01` |
| `pnpm build` on the fresh database | compiled; 341 static pages |
| The browser gate, `scripts/run-browser-gate.ts` (CI runs it in two shards) | 404 tests: 403 passed, 1 skipped (Google sign-in is not configured locally), 0 failed, 0 flaky, 15.1 min |

The browser gate ran on a database and a search index nothing else had
touched — a fresh PostgreSQL database bootstrapped by `pnpm local:bootstrap`,
a fresh Meilisearch — against a production build made on them, which is how a
CI runner starts. Of what criterion 14 names:

- **Realistic photographs and network (OVE-469):** `lcp-element.spec.ts` reads
  the browser's own LCP entry over photographs of production's weight, and the
  before/after in criterion 15 is measured on OVE-469's production-weight
  fixture.
- **Guest bundle evidence (OVE-468):** `on-demand-controls.spec.ts` presses
  every control whose code arrives on its first press before that code has
  arrived, and checks the press is kept; `measure:guest-script` counts what a
  guest downloads and runs, before and after (criterion 15).
- **Static documents:** `static-documents.spec.ts` and
  `public-hydration.spec.ts`.

### 15. Before and after, same environment

Methodology (ADR-0032 D9, the commands OVE-468 and OVE-469 left): the same machine, the same database — OVE-469's production-weight fixture, seeded afresh for this pair so that its entries lead the listings (`pnpm fixture:production-weight`: photographs of 94, 100, 143, 212 and 444 kB, browser-made WebP without variants, as production serves them) — the same port (3179) and the same two commands, run on `main` at `1aa34d6f` (**before**) and on the candidate (**after**) back to back, with nothing else running. Each side was measured in steady state, and in the same state as the other: only once two rounds of requests in a row, at least 75 seconds after its server started, returned the same pages — the same authors and photographs, and the same fonts' `Link: rel=preload` header, which depends on when a page's cached render was made rather than on the build. The fingerprints record, per side and page, that header and the authors and photographs served; they match (`measurements/fingerprints.log`, `measurements/warm-up.log`). A pair measured earlier on the final builds was discarded: by then the screen-reader sessions' text entries led both listings, which no longer weighed what production's do (`measurements/superseded/README.md`). **These are local numbers; they say nothing about production** (residual 2).

**What a guest's browser downloads and runs** (`pnpm measure:guest-script`, one fresh guest context per page, V8 block coverage; `guest-script-local-{before,after}.json`):

| Page | Script before `load`, kB transferred | Scripts before `load` | Script executed by idle, kB |
| --- | ---: | ---: | ---: |
| `/` (the feed) | 238.5 → 238.4 | 17 → 17 | 404.0 → 403.1 |
| an entry | 241.8 → 241.7 | 18 → 18 | 391.3 → 392.0 |
| an organism card | 240.4 → 240.3 | 17 → 17 | 409.0 → 408.1 |
| `/journals` | 238.5 → 238.4 | 17 → 17 | 405.9 → 404.8 |

**Lighthouse** (`pnpm measure:lighthouse`: CLI 13.5.0, default mobile emulation, three runs per page with throttling applied — the gate's method — and three simulated; medians; every sample and gzipped report in `measurements/lighthouse/`):

| Page | Transferred, kB | LCP applied | FCP applied | TTI applied | CLS applied | LCP simulated | TTI simulated |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` (the feed) | 1433.3 → 1434.0 | 3.43 → 3.55 s | 1.71 → 1.86 s | 11.64 → 10.16 s | 0.026 → 0.000 | 3.92 → 3.54 s | 4.35 → 4.43 s |
| an entry | 593.0 → 592.9 | 2.76 → 2.76 s | 1.74 → 1.94 s | 2.77 → 3.23 s | 0.291 → 0.000 | 3.61 → 3.77 s | 4.02 → 4.00 s |
| an organism card | 631.3 → 629.6 | 2.86 → 2.85 s | 2.26 → 2.26 s | 3.83 → 3.82 s | 0.000 → 0.000 | 4.37 → 4.36 s | 4.90 → 5.07 s |
| `/journals` | 1427.1 → 1427.4 | 1.73 → 1.90 s | 1.73 → 1.90 s | 11.21 → 11.19 s | 0.125 → 0.000 | 3.54 → 3.61 s | 4.58 → 4.50 s |

**First paint.** Every icon on `main` carries `width="var(--size-icon-md)"`, which Chromium 141 does not parse; it logs one console error per attribute — 58 to 90 per page on `main`, none on the candidate, which writes the pixel value (`interface-icon.tsx`). With DevTools attached, as Lighthouse attaches it, those errors slow the HTML parser, so `main` paints its first frame earlier with less of the page in it, and the rest then moves into place. A proxy served the same pages four ways, eight alternating rounds each at Lighthouse's applied throttling (medians, ms; `measurements/first-paint/`):

| Page | `main` | candidate | candidate, `main`'s icon attributes | `main`, the candidate's icon attributes |
| --- | ---: | ---: | ---: | ---: |
| `/journals`, FCP | 1740 | 1902 | 1730 | 1908 |
| `/` (the feed), FCP | 1848 | 1904 | 1730 | 1902 |

First paint follows the icon attributes and nothing else in the change. In this pair the candidate's first contentful paint is later on three of the four pages, by 0.15–0.19 s (the feed 1.71 → 1.86 s, an entry 1.74 → 1.94 s, `/journals` 1.73 → 1.90 s), and level on the organism card (2.26 → 2.26 s). The earlier, emptier frame is where `main`'s large layout shifts come from: the shell's content moving as the rest of the page arrives (`div.site-shell-content-safe-bottom`), in six of `main`'s twelve applied samples (0.10–0.29) and none of the candidate's, whose largest layout shift in any sample is 0.0004 — every sample, with the elements that moved, is in `first-paint/results.json`.

**Largest contentful paint.** The element is the same on both sides in every sample: a photograph on the feed, an entry and the organism card; an entry card's excerpt on `/journals`. On `/journals` it is painted in the first frame — LCP equals FCP in every sample — so it moves with first paint: 1.73 → 1.90 s. The feed's photograph is asked for at 0.64 s on both sides, with 529 and 530 kB of other transfers overlapping its download (the second run of each); it downloaded in 2.70–2.86 s on `main` and 2.80–2.90 s on the candidate, and its LCP is 3.40–3.56 s against 3.50–3.58 s: the 0.14 s between the download medians is less than the 0.16 s spread of `main`'s own three.

**The feed's web font.** Google Sans is `display: swap` over an Arial fallback whose metrics are not adjusted — Next has no metric table for it (`fonts.ts`) — and at 412 px each photographed card on the feed is 22 px taller in Google Sans than in the fallback. In the first pair, on the fixture as it was first seeded, a photographed card moved when the font arrived: 0.1130, 0.1130, 0.1130 on the candidate's feed (`measurements/superseded/`; a later run's reports name the two font files as the cause), the shift OVE-468 recorded as 0.118 on this fixture while production's `/` measured 0. In this pair, on the fixture seeded afresh, a card moved on neither side. The cause is in both builds and unchanged by this one (residual 11).

**Noise.** Applied TTI moves from run to run on the same build (on the candidate, the feed: 8.80, 10.16, 11.85 s), and simulated figures by up to 0.98 s (the simulated LCP of `/journals` on `main`: 3.16–4.14 s).

**What the first "after" run found.** The candidate's first build had the global error page import `globals.css`, and the bundler merged the fonts' stylesheet and the app's into one file: every page asked for one 20.5 kB stylesheet instead of two (3.7 and 17.0 kB), it finished about 0.1 s later, and first contentful paint under applied throttling moved later on every page. The page no longer imports it (its class names resolve against the stylesheet the failed layout already loaded, as on `main`), and the two stylesheets are back. That run and the `main` run it was compared with, on the fixture as it was first seeded, are kept in `measurements/superseded/`:

| Page | FCP applied, `main` | the candidate with one stylesheet |
| --- | ---: | ---: |
| `/` (the feed) | 1.81 s | 2.20 s |
| an entry | 1.77 s | 1.99 s |
| an organism card | 2.19 s | 2.24 s |
| `/journals` | 1.72 s | 2.04 s |

### 16. After release

Production is read after the release, never written (residual 3). This
session's network refuses `over.garden`, so the reads go through Vercel's own
fetch of the production domain, which returns the status, the headers and the
served HTML. What is read is recorded in the authenticated Linear receipt on
OVE-478 with the deployment it was read from, as OVE-469's production checks
were:

- the deployment of the squash commit is the one production serves, and it
  is `READY`;
- the served HTML of the home page, an entry, an organism card, a profile, a
  community and `/journals`: `200`, one canonical link, the language
  alternates, the page's own text in the first response — what a reader
  without JavaScript gets;
- an unknown answer's name and a path below a section that none of its pages
  match answer `404`, not `500` or a `200` with `noindex` (criterion 1);
- the consent notice is in the first response, and the served HTML starts no
  analytics script before a choice;
- the sign-in page and a workspace address for a guest answer as the local
  stack does.

Signing in, writing, erasure and moderation would write to production; they
are proven on the local stack (criteria 7 and 8) and stay unperformed there
(residual 3).

### 17. Canon and state

`docs/PROJECT_STATE.md` (the redesign is shipped; the OVE-478 entry; the
stale browser-proof sentence of known gap 3), `DESIGN.md` §2.8 (icon size),
§2.11 (focus clears a sticky bottom row; `data-bottom-sticky-row`), §5.4 (not
found is a document; the error documents and the app's stylesheet), §5.7 (a
tab strip's rule), §5.11 (creating while writing; the idle note is not news;
Publish loading, not disabled; a failure that names a photograph only when
there is one), §5.14 (the byline's name; a space between two words lives
inside the text), §6 (the language control on safe-exit pages; the
document's `lang`),
`ROUTE_OWNERSHIP.md`, `ACCESSIBILITY_FIXTURES.md` (2.2 everywhere; the
baselines; the AT session performed).

### 18. Closing

OVE-478 closes on this receipt with its residuals classified below; OVE-474
closes when OVE-478 is Done, all its children being Done. No claim is made
about retention or conversion: there is no data for either.

## Residuals, classified

Each residual says what it is, why it is not closed here, and who owns what
follows. None hides a failing gate.

1. **One screen reader, not three.** Orca on Chromium, on Linux, is the only
   pairing performed; no macOS, iOS or Windows machine was available, so
   VoiceOver and NVDA remain unperformed (`ACCESSIBILITY_FIXTURES.md`). The
   surfaces heard are listed in criterion 7; those not heard (the space and
   object setup, the lineage inboxes, the account's pages, the profile) rest
   on keyboard walks, axe and DOM assertions. *Environment limit; a session on
   a real device is the owner's to schedule.*
2. **The production LCP budget — known gap 11.** OVE-467 (criterion 2) and
   OVE-469 (criterion 3) were closed unmet by the owner's decision, and the
   budget's number and method for photograph-led pages is an open owner
   decision. OVE-478 changes nothing that should move LCP and measured that it
   did not (criterion 15). Production could not be measured from this session:
   its network policy refuses `over.garden` (a `403` to `CONNECT`), so
   OVE-469's production figures remain the latest. *Owner decision.*
3. **No mutation on production.** Signing in, publishing, erasure, moderation
   and consent choices were exercised on the local stack only; after release,
   production was read, not written (criterion 16). *Needs the owner's
   authorization for a production account and data.*
4. **No research with gardeners** (`EXECUTION_CONTRACT.md:27`). Step counts
   and destinations are fixture observations; OG-UX-010's user-testing clause
   stays open, and nothing here claims retention or conversion. *Product
   decision to run it.*
5. **Real photographs.** Descriptions and the focal-point crops of two- and
   three-photograph cards were checked on fixture photographs only; whether a
   crop keeps the evidence that matters is a judgement on real gardeners'
   photographs. *Content review, read-only.*
6. **Scale is synthetic.** 20 spaces and 1,000 objects on a local database;
   there is no 20-object preset. *Accepted; the picker's cursor pages and the
   collection's pages are what scale.*
7. **Pages the proxy never serves.** 27 `(default)` page files (24 migrated,
   3 redirected) are shadowed: every GET, HEAD and POST for their address is
   rewritten into `[locale]`. One carries a latent defect — the discussion
   wrapper re-exports `generateMetadata` without its `locale` — which is moot
   while it is shadowed. The market landings have no in-app link; they are
   reached from the sitemap and search. *Cleanup and an IA decision, recorded
   in `ove-478/route-matrix.md`, not done in an integration task.*
8. **API routes the product no longer calls** (`ove-478/api-routes.md`):
   `/api/public/objects/suggestions` and `/api/public/sources/eppo/suggestions`
   have no caller but their tests; `/api/garden/catalog/typeahead`, a `308`
   kept "for one release" for stale client bundles, is called only by three
   smoke scripts. *Removal is an API change with its own review.*
9. **A request-time page read without JavaScript.** The `(default)` tree —
   the garden, the account, sign-in, the erasure request — renders at request
   time inside a static root layout that cannot know the reader, so the shell
   writes their language on `<html>` with an inline script as its segment
   arrives. With scripts off, a Bulgarian or Russian reader of those pages
   keeps `lang="uk"` on the document, though every word is in their language.
   Public pages are static documents with their language in their bytes. *A
   limit of the static root layout (ADR-0032); recorded, not changed here.*
10. **Local gate noise.** `next start` logs `Invalid revalidate configuration
    provided: 0 < 1` while an entry or passport regenerates after a fixture's
    raw write — on `main` as on this branch (170 lines in the baseline run),
    as OVE-467's receipts classified it. *Pre-existing; not investigated
    here.*
11. **A web font can move the feed's cards.** Google Sans is `display: swap`
    over an Arial fallback whose metrics are not adjusted — Next has no metric
    table for it (`fonts.ts`, ADR-0022 D7) — and at 412 px each photographed
    card on the feed is 22 px taller once the font arrives. In the first
    before/after, on the production-weight fixture as first seeded, a
    photographed card moved when it did: CLS 0.1130 in every applied sample of
    the candidate's feed (a later run of the page named the two font files as
    the cause), the shift OVE-468 recorded as 0.118 on this fixture while
    production's `/` measured 0. In
    the final pair, on the fixture seeded afresh, it moved on neither side;
    DESIGN.md §9 allows 0.02 and "no layout shift from … a font". The cause is
    `main`'s too and this change leaves it as it was. Production was not
    measured from this session. *Pre-existing; a metric-matched fallback
    changes the typography wiring and belongs to its own task, measured before
    and after on production.*

## Validation

The stack every local figure above was taken on: PostgreSQL 18.4, Meilisearch
1.48.1, an S3 stand-in (moto) for R2, Node 22.22.2, Next.js 16.2.11 (`next
build` and `next start`), Playwright 1.61.1 with Chromium 141.0.7390.37, axe-core
4.12.1, Lighthouse 13.5.0, and for the screen reader Orca 46.1 with AT-SPI
2.52, speech-dispatcher 0.12 and espeak-ng 1.51 on Xvfb.

The runs this receipt cites, on 2026-09-24 (UTC):

- **The browser gate**, 18:03–18:18, against a production build of the code
  at `176ceb91` made at 18:02 on a PostgreSQL database and a Meilisearch
  created empty for it and bootstrapped by `pnpm local:bootstrap`, as a CI
  runner starts. `ove-478/route-families/` and `ove-478/journeys/` are this
  run's rows.
- **The static steps**, 18:18–18:19, and **CI's database steps**, 18:21–18:23
  on another fresh database.
- **`pnpm test`**, 18:23–18:25 on `11a1aa01`, on a database bootstrapped for
  it alone; the run before it, 18:19–18:21 on `176ceb91`, is the one the
  pinned digest and the race below come from.
- **The before/after pair**, 17:36–17:58, on the production-weight fixture
  seeded afresh at 17:33 (criterion 15).
- **The Orca session**, 15:35, on a build of the same source: every code file
  in `176ceb91` was last written before that build began.

Found while running them, and fixed here:

- **A first-paint regression, caught by the before/after measurement.** The
  candidate's global error page imported `globals.css`, and the bundler then
  merged the fonts' stylesheet and the app's into one file for every page;
  first contentful paint under applied throttling moved 0.2–0.35 s later on
  every page measured (criterion 15). The import is gone, the two stylesheets
  are back — the fonts' file byte for byte `main`'s — and the candidate was
  rebuilt and measured again.
- **Focus under the publish row, found by the keyboard-up check.** At
  390 × 390 the next control Tab reached was scrolled to just above the
  consent notice — under the composer's sticky publish row, hidden whole.
  Below `sm`, focus now keeps a sticky row's height clear, and a sticky row
  that does not say so fails `globals.test.ts` (criterion 10).
- **Focus lost after a failed publish, found by Orca.** Publish was disabled
  while it worked, so the button gave focus up, and a publish lost to the
  network left the reader on the page's body, where Enter retried nothing;
  the failure also told a text note to fix "the marked photo". Publish shows
  as loading and keeps focus now (DESIGN.md §4.4), and journey 5 retries by
  keyboard from where the reader is.
- **Words read as one, found by Orca, then by a check.** «Простори3» on the
  garden: a `{" "}` after text is written after React's `<!-- -->`, and
  Chromium drops it from the accessibility tree. A check in the sweep found
  the first-publication page's version line as well, and a source check
  found thirty-odd lines of the same shape on pages the sweep does not reach;
  all are fixed, and both checks run in the gate.
- **A later first paint, explained rather than fixed.** The before/after
  found first contentful paint 0.15–0.19 s later on three of four pages.
  `main` logs 58–90 console errors per page for its icons' `var()`
  attributes, which slows the parser into an earlier, emptier first frame
  that the rest of the page then shifts; a proxy that swapped only the icon
  attributes moved first paint with them (criterion 15).

And in the gate, where they would have failed CI on this candidate:

- Four specs had their axe tags moved to the shared list inside a function the
  page runs, where a Node constant does not exist; the tags travel as the
  callback's argument now, as in the other fourteen.
- The sweep expected the old `200` from a workspace catch-all; it expects the
  `404` this change makes.
- The profile spec read the author prefix as card text; it reads the byline
  link's name now.
- `owned-destinations.spec.ts` chose from a picker list that was about to be
  asked for again — its field already held the name, so focusing it showed the
  old list and replaced it 180 ms later — and published to the removed space.
  It failed the same way on `main` locally; the spec now waits for the fresh
  list and checks the choice before publishing.

And in `pnpm test`:

- **A pinned digest.** The Facebook-login retirement receipt pins
  `meta-marketing.tsx` by its digest, so that the Meta Ads code cannot drift
  unnoticed. Writing its privacy controls' two spaces inside their text moved
  the digest; the pin follows (`11a1aa01`), as it did each time that
  component's controls changed before.

And in CI, before any test ran:

- **R2's stand-in.** On 2026-09-24 MinIO's Quay images began to require a
  login, and every web job of this pull request's first CI run stopped
  pulling `quay.io/minio/minio` ("unauthorized"); `main`, green that morning,
  would have failed the same way. CI's S3 stand-in is moto's server now,
  pinned, from PyPI — the stand-in every local run above used
  (`.github/actions/web-setup/action.yml`; `TECH_STACK_DECISIONS.md`, CI
  runtime boundary).
- **A topic page nobody had written to.** `static-documents.spec.ts` read the
  first curated topic by slug without JavaScript and wanted more than 600
  visible characters. Which topics the gate's other specs have filled by then
  depends on how the gate is sharded; with this change's two new specs in the
  list, `animals` was empty in CI's second shard — 582 characters, no entry —
  as it is on the local gate database (544, on `main` too). The spec already
  publishes an entry through the real endpoint; it now reads the curated
  topic that entry is listed in, and fails if there is none. It passed alone
  on that database, where the old reading failed.

Seen, and not this change's: one full run failed
`attribution-outbox.test.ts` › "accepts the retained self-serve analytics
alias", which asserts that the learning report finds no unattributed gardener
in the whole database. Other integration files —
`engagement-like-ownership.integration.test.ts`,
`object-kind-collapse.upgrade.test.ts` — insert journal entries for owners
with no attribution while it runs, in parallel workers, and delete them after;
the report counted one. It passed alone and in the next full run. None of those
files is changed here; scoping the assertion to the test's own gardener is a
follow-up.

## Release

The browser gate, the static steps and CI's database steps ran on the code at
`176ceb91`; `pnpm test` ran again on `11a1aa01`, which moves one test's pinned
digest and nothing else (Validation). The commits after it change documents,
evidence and CI's S3 stand-in only. The pull request, the CI runs of its head, the squash
commit on `main` and the production deployment are recorded in the
authenticated Linear receipt on OVE-478 after the merge, with the production
reads of criterion 16 — as OVE-469's were.
