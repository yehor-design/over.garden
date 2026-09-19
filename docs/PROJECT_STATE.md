# Project state

Status: living document. Update it whenever production behaviour, the direction,
or the list of known gaps changes. Read it first, then `AGENTS.md`.
Last reviewed: 2026-09-19.

This page answers four questions for anyone returning to OverGarden: what the
product is today, what is actually true in production right now, what is being
worked on next, and what is knowingly unfinished. Dated receipts live in
`docs/DELIVERY_LOG_2026-09.md`; decisions live in `docs/adr/`.

## What the product is

A public gardening journal for Ukraine and Bulgaria. A gardener keeps a
narrative journal per plant or animal; every entry is public and indexable;
public variety, topic, profile, and community pages aggregate first-hand
experience. There are no private entries, no drafts, no offline mode, and no
separate admin panel. Speed and search discovery come before defensive refusal.

The governing decisions are `docs/adr/ADR-0022-owner-mvp-reset.md` (D1–D7,
accepted 2026-09-02) and `docs/adr/ADR-0023-workspace-resilience.md` (D8,
accepted and implemented 2026-09-03). Older ADRs are immutable history and
never override them.

## What is true in production

Verified on 2026-09-07 against `https://over.garden` and the live providers.

| Area          | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy        | `main` at `1c8d186`, Vercel production READY, functions in `fra1` beside the database                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Public pages  | Cache Components: shells answer `x-vercel-cache: HIT`, tags revalidate on every mutation, workspace and API stay `no-store`                                                                                                                                                                                                                                                                                                                                                                                                |
| Indexability  | Every live public page is `index, follow` with one canonical and one JSON-LD graph; sitemap index plus entries, profiles, communities and catalog chunks. Under ADR-0026 D9 an organism card whose content comes only from sources stays `noindex` until a gardener publishes on it or the owner marks it: one of the 114,669 nodes is marked, carries `Taxon` JSON-LD with eight `sameAs`, and is the catalog chunk's only entry                                                                                          |
| Media         | Browser-made WebP: 2560 primary, 1280 and 480 variants, 16 px placeholder, served as plain `<img srcset>` from `media.over.garden`, immutable and CDN-cached. No Vercel image optimizer                                                                                                                                                                                                                                                                                                                                    |
| Media upload  | One session capability per composer, uploads straight to the Cloudflare Worker, two-hour lease renewed every five minutes, parallel promotion, weekly orphan sweep                                                                                                                                                                                                                                                                                                                                                         |
| Sessions      | Server-authoritative. The cookie-cached session decides at the moment of the mutation; no client gate                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Admin         | Owner pages live in the account menu under the sealed owner role. The Release Center, editions and extension packs are gone (ADR-0025, `OVE-385`) and the `/health` diagnostics page with them (ADR-0027, `OVE-410`, 2026-09-09), so `/health` now answers 404 for everyone; the menu carries five owner links                                                                                                                                                                                                             |
| Workspace     | Every page under `/garden/**` renders its own shell first and streams its data; failures are designed states with a class, a digest, and a retry (ADR-0023)                                                                                                                                                                                                                                                                                                                                                                |
| Server errors | Two JSON lines: `workspace_section_degraded` from `settleSection` for a section that failed and still rendered, and `workspace_server_error` from `src/instrumentation.ts` for anything that actually threw                                                                                                                                                                                                                                                                                                                |
| Schema        | Migrations `0001`–`0047`, `0049`, `0051`–`0058` and `0060`–`0064` applied, minus the two deliberately skipped and the two not needed in production. Slice 24 landed `0054` (the graph foundation) through `0061` (the closeout, 2026-09-07): `catalog_items.catalog_kind` and `status` are gone, and so are `catalog_match_suggestions` and `catalog_fuzzy_duplicate_suggestions` with the 2,267 rows they held. `0064` indexes the five columns the reconciliation's cleanup reads. See `docs/PRODUCTION_SCHEMA_STATE.md` |
| Interaction   | Like, bookmark, follow and comment are Server Actions on a form with a real endpoint, so they work before hydration and with JavaScript off. A like is a permanent row owned by an account or by one signed visitor cookie, with no expiry and no ceiling                                                                                                                                                                                                                                                                  |
| Sign-in       | One screen: `/auth/sign-in` and `/auth/sign-up` over one component and Server Actions. Every other page shows its own empty state and one link to it                                                                                                                                                                                                                                                                                                                                                                       |
| Matching      | The worker on the droplet runs the sealed release of `7b0a287` since 2026-09-07 with a fresh heartbeat, declaring the manifest's six handlers exactly; the API container, its route, and `matching.over.garden` were retired on 2026-09-03. Its `MEILISEARCH_HOST` and Caddy's upstream both named a container that stopped on 2026-07-23 until the same day, so the worker could not reach Meilisearch for six and a half weeks                                                                                           |
| Hosting       | Decided 2026-09-03: the DigitalOcean managed database and the `fra1` droplet stay                                                                                                                                                                                                                                                                                                                                                                                                                                          |

The seven owner requirements have one committed production receipt:
`docs/OWNER_MVP_RESET_PROOF_2026-09.md`, regenerated by
`pnpm prove:owner-mvp-reset`.

## Where the project is heading

**Decided 2026-09-18, being delivered: every address is ASCII, and an entry has
a number.** The owner copied an entry's address to share it and got 181
characters of `%D0%BA%D1%80…`: a browser hands the clipboard the percent-encoded
form, six characters per Cyrillic letter, and the product has no share control,
so that is how every link travels. ADR-0029 D4 had kept the gardener's alphabet
in the address because a search result shows it decoded; it never looked at the
clipboard. Amended the same day.

- **Shipped, `OVE-464`, 2026-09-19: a journal entry lives at
  `/@{handle}/post/{n}`** — a plain number counted per author, assigned at
  publish by a `before insert` trigger from a durable counter (migration
  `0076`), never changed, never reused after a deletion. `/journal/{slug}`,
  `/@{handle}/{slug}`, a name held before a rename and every locale-prefixed
  spelling of them answer **one** 308 to it; `/post/012`, `/post/0` and
  `/post/1a` are a real 404. `https://over.garden/@yehor/post/12` is 34
  characters where the same entry was 181.
- **Shipped, `OVE-465`: object passports, topics and communities take Latin
  names**, romanized by the language a name was written in — never by a
  constant, because the Ukrainian and Bulgarian tables spell the same letters
  differently (`домати` is `domati`, not `domaty`). A gardener's tag joins the
  topic that already carries its label, so the same word from two languages
  does not found two topics. Migration `0077` gives a topic the name history an
  entry and a passport already had; `pnpm address:names:romanize` moved the
  four Cyrillic passports production held, and every old address answers one
  308.
- **Then, `OVE-466`: the entry's name stops being issued.** It is still written
  at publish, because some twenty readers spell "this entry has a public
  address" as `public_slug is not null`.

Species, forms and handles were already ASCII and do not move. The tasks and
their traps are in `docs/ADDRESS_LAW_EXECUTION.md` under "Phase 5".

**Decided, 2026-09-17, not yet built.** The whole interface is redesigned onto
one design system (ADR-0031, SDD Slice 28, `OVE-439`–`OVE-459`). `DESIGN.md`
stopped being a stub and is now the canon: two token layers, a component
inventory with a binding contract, a three-column shell, and WCAG 2.2 AA
enforced by CI rather than by review.

The audit that produced it found a split nobody had named. **The token layer is
healthy** — five hard-coded colour utilities and five inline `style={{}}` in the
whole of `apps/web/src`, one `<main>`, a working skip link, cards as
`<article>`, zero images without `alt`, zero unlabelled controls, zero targets
under 24 px, and **zero contrast failures at AA** on `/journals` as measured.
(A first measurement claimed 102 failures; it parsed `getComputedStyle`'s
`lab()` output as RGB. Measure colour through a canvas, not a regex.)
**The component layer barely exists** — seven primitives, only `Button` adopted
at 78 imports, and **fifty files reaching for a raw `<input>`, `<select>` or
`<textarea>`**. The product does not need repainting; it needs the layer between
tokens and pages it never had.

Seven interface defects go with it, each now owned by a task: Ukrainian content
served under Bulgarian chrome with a language control the Ukraine market must
not render; `/journals` filtering through six `<select>`s behind an Apply
button; search that is an icon and nothing else; a mobile header whose brand
block clips, a floating control half off the right edge of every page, a tab bar
spending a slot on "Sign in" while writing an entry has no place on a phone; no
footer and no `contentinfo` landmark, with `/privacy`, `/support` and
`/first-publication-disclosure` linked from nowhere; two `aside` and two `nav`
landmarks unnamed; and a `.dark` block that is declared, consumed by four
utilities, reachable by no toggle, and still carrying shadcn's default purple.
Dark mode is removed rather than finished (ADR-0031 D2).

**The foundation four are built** (`OVE-440`, `OVE-439`, `OVE-441`, `OVE-442`,
merged 2026-09-17). `globals.css` holds the two token layers and nothing else
defines a token; the dark theme, the chart ramp and the sidebar group are gone;
`components/ui/` ships forty-two components and the six-state vocabulary,
each with a test that asks for it by role and accessible name; the six states of `DESIGN.md` §5.4 are a closed
set every page-family task consumes by name; and the nine rules of §10 are nine
checks that fail CI, each one observed red on a fixture that violates it on
purpose.

Three things the foundation work found that no unit test could see. `cn` was
deleting the colour from every filled button — `tailwind-merge` put a named
size and a named colour in the same class group, so a primary button drew body
ink on a green fill at **1.95:1**, with both classes still present in the
source. `border-input` was `#e5e5e5` at **1.28:1**, below WCAG 2.2 1.4.11's 3:1
for the boundary that identifies a control, on every input on the site. And the
focus ring was `#a1a1a1` at **2.32:1**, which failed the same rule everywhere.
All three are fixed and all three are now measured by a gate.

**The shell is the fifth thing built** (`OVE-443`, 2026-09-17). One `<header>`
in two shapes — a 56 px bar below `lg`, the 240 px rail above it — so the
`banner` landmark exists at every width and the primary action cannot render
twice; a 704 px content column; a 300 px context rail at `xl` that no screen
depends on; and the `contentinfo` landmark the product had never had, carrying
the catalogue, `/privacy`, `/support` and `/first-publication-disclosure` —
three pages nothing linked — plus the one language control. The catalogue's four
scattered entrances became one rail item; every address still answers (ADR-0029).
`site-shell-*` left `globals.css` for tokens (`--container-rail`,
`--container-content`, `--container-context`), except the two `env()` safe-area
rules, which are not design decisions.

Two things that measurement settled rather than code. The floating circular
control "clipped at the right edge of every page" is **Vercel's toolbar feedback
button**, injected at the edge for a browser carrying `__vercel_toolbar`; the
served HTML names it nowhere and neither does this repository, so no reader has
ever seen it (ADR-0031 D4, amended). And ADR-0031 D10's demand for a visible
`thiings.co` credit in the footer was a draft that misrecorded the owner's
decision; `DESIGN.md` §2.9 is the record, the footer carries no credit, and a
test fails if one appears.

A local trap worth one line, because it costs an hour: start the production
server for a browser proof **without** `--hostname 127.0.0.1`. With it, Next's
internal locale rewrite returns as `http://localhost:<port>/<locale>/…`, the
proxy runs again on the prefixed path, and ADR-0029 D9's "an entry carries no
locale prefix" rule 308s it back — a public entry then self-redirects forever.
It reproduces on `main` and on any branch; CI and Vercel bind differently and
never see it.

**The phone got the product's verb** (`OVE-444`, 2026-09-17). The tab bar is
five slots — Feed · Catalogue · **New entry** · Journals · You — where it used
to spend one on "Sign in" and offer no way to write an entry at all. "You" is
identity rather than authentication: sign-in for a stranger, the profile for a
gardener, and the destination is built by the one module that is allowed to
spell it. The primary action is one control per viewport: the rail draws it
from `lg`, the bar below it, never both at a width.

Three measurements decided the shape rather than three opinions. The brand link
was 36 px tall and is now 44 like every other control in the bar. The safe-area
padding was on the content region while the footer sat _below_ it, so on a short
page the footer was the thing hidden behind the bar — it is on the whole column
now, at 80 px, which clears the bar even when a Bulgarian label wraps under the
WCAG 1.4.12 overrides. And the tab slots carry no horizontal padding, because
four pixels of it is the difference between "Дневници" on one line and on two.

`tests/mobile-shell.spec.ts` holds all of it: 320 / 375 / 768 in `uk`, `bg` and
`ru`, a 44 × 44 assertion that measures the hit target (the box unioned with its
`::before`) rather than the class name, 400 % zoom at 1280 logical width, and
axe at 375 px on the home page, the journals directory, an organism card and the
workspace.

**One page, one language, and the contract page says what the code does**
(`OVE-446`, 2026-09-17). The defect the card was written for had already been
fixed that evening, by a different decision than the card proposed: the owner's
answer, put to them again and reaffirmed, is that **both markets offer all
three languages** and the market decides only which one a reader who has chosen
nothing starts in. `docs/INTERFACE_LOCALE_CONTRACT.md` had still described the
old model — Ukraine with one language and no control — and now records the real
one, with a section naming what is no longer true so nobody re-derives a rule
the product does not follow.

Two live defects came out of measuring rather than reading, both the old model
surviving where nobody looks. **The global error page drew no language control
for the Ukraine market**, read a market out of a locale prefix, and recognised
only `bulgaria:bg` and `bulgaria:ru` as contexts — so `bulgaria:uk` and
`ukraine:ru`, two ordinary readers, were silently reset to Ukrainian on the one
page they most need to understand; its test mocked the control with the same
market gate, so it passed throughout. And **the `[locale]` layout claimed a
market derived from the route's language**: measured on production, a reader in
Bulgaria whose language is Russian renders from the `/ru` subtree, and the
document told the error boundary they were in Ukraine.

What is asserted rather than described: 600 resolver combinations (country ×
persisted market × URL prefix × persisted locale) all answering with a
market-valid locale, the production failure among them as a named case; a
repo-wide guard that only three declared modules may build a cross-locale
address and each must emit a plain anchor; the three typed namespaces carrying
the same key set all the way down with no empty string; and an entry keeping
`lang` when it is listed in a feed or directory somebody is reading in another
language (WCAG 3.1.2) — proved end to end by publishing in Bulgarian and reading
in Ukrainian, not by a fixture.

`pnpm interface:locale:probe` is the production receipt: it records the resolved
market from the document's own context hint rather than guessing from a
screenshot. What it cannot do is forge a country — Vercel sets
`x-vercel-ip-country` at the edge and the resolver reads it first, so a
UA-signal vantage point is not reachable from a machine in Bulgaria. The country
dimension is the resolver matrix's to prove.

A harness fix that came with it: Better Auth rate-limits sign-up, and the fourth
call in a window answers `429` and writes nothing. Playwright runs spec _files_
in parallel, so specs signing a synthetic gardener in used to push one another
over the limit and fail with "Synthetic gardener was not persisted", which names
the symptom and hides the cause. `tests/helpers/synthetic-gardener.ts` retries
the window and says what it saw; four specs use it.

**Search stopped being an icon** (`OVE-445`, 2026-09-17). `⌘K`, `Ctrl+K`, `/`
and the rail's own control open one palette over journals, organisms,
gardeners, communities and actions, grouped in that order, with the shortcuts
in its footer and recent searches when the field is empty. The read is
`src/server/public-palette-search.ts` behind `/api/public/search/palette`:
public data only, no cookie and no session, and `no-store` all the same,
because the one caching exception in rule 5 is `/api/public/catalog/` and this
is a different route. The catalogue group goes through the picker's own
statement, untouched — `git diff` against `main` on that route and repository is
empty, and its P95 measured 7.88 ms of server time over 200 fresh URLs after
the change.

The palette is an enhancement and the test suite says so: a scripts-disabled
run asserts `/journals` and the catalogue still answer 200, still carry a real
`GET` search form, and still link each other. Gate 8's "the command palette
flow is declared, not skipped" placeholder is now the flow.

Three defects came out of driving it. **Mounted twice**, `⌘K` opened two
dialogs and a screen reader saw two comboboxes; the palette is a provider with
context-read triggers now. **`EmptyState` already carries
`data-screen-state`**, so the wrapper repeating it gave the document two of the
same marker. And the organism fixture's `read-then-insert` of the EPPO code
`LYPES` **raced** once a third spec started seeding it: two specs read "no row"
in the same instant, the second insert failed a unique constraint, `beforeAll`
aborted, and teardown then failed on an undefined fixture — so the error named
neither cause. One `on conflict do nothing` statement now.

**Authentication is finished** (`OVE-455`, 2026-09-17), and the gap this page
recorded is closed: **a successful sign-in has now been watched in a real
browser**, not only the refusal path. Watching it found the defect the gap was
hiding. `router.replace` is a client navigation, the shell lives in the root
layout, and a client navigation inside the same layout does not re-render it —
so a reader who signed in landed on the page they had asked for with the chrome
still offering them "sign in". It is a document navigation now, and the test
asserts the `next` round-trip, the signed-in chrome and the ADR-0022 D6
cross-tab reload in one run.

The screen itself is the anatomy Intercom, Cal.com, Uxcel, Mixpanel and
Relevance AI all ship: the provider above an `or` divider, labelled fields
beneath, the refusal inline, and the forgotten-password link beside the password
label. The Google button carries the **mark** — measured at 18 px on a 40 px
button, with clear space — because Google's own terms do not permit the bare
bordered button that shipped before. Its four brand colours are the one
exception the colour gate makes, by path, with a test asserting the exception is
exactly one file and that every other gate still applies inside it. The password
field has a show/hide control whose accessible name changes with its state, the
refusal is a `Callout` with `role="alert"` above the fields that never says
which of the two credentials was wrong, focus moves to the first control, and
`/auth/help` answers three questions with three headings instead of one muted
paragraph.

Three stale things turned up on the way, all of them invisible because nobody
ran them. `tests/auth-provider-retirement.spec.ts` asserted the
`garden-auth-panel` that `OVE-378` deleted a fortnight earlier — it is in no CI
list and no script, so it failed silently; it is rewritten against the screen
that exists. `tests/journal-deletion-retention.spec.ts` asserted `signUp.ok()`,
which is never true without a mail provider, and then seeds a column the schema
no longer has; the sign-up half is on the shared helper now and the column is a
spawned task. And the shell's context rail read "Далі / Далі" on any route with
no destination of its own, which nothing but a screenshot could have told us.

**The first screen a stranger sees is rebuilt** (`OVE-447`, 2026-09-17). `/`
and `/feed` are one column of `EntryCard`s at 704 px — object and kind above,
title, date, excerpt, a full-bleed 4:3 photograph, the byline, and an
engagement slot beneath — with the six designed states under them. `EntryCard`
is the system component three later tasks consume (`OVE-448`, `OVE-450`,
`OVE-454`), and its props are its contract: every string arrives localized, the
`id` is required because the `<article>` owes a reader an accessible name on
the server, and the cover's box is reserved with or without a photograph.

Four things the screens gave up. **The row of zeros is gone**: the feed offered
five "verified topics" of which three counted zero, and a filter that can only
return nothing is a dead end with a number beside it. A topic is offered when a
gardener has written on it, and the crawlable path to one is the context rail's
plain anchors. **The filter row stopped being links.** A chip's job is to say
whether it is on, `aria-pressed` does that, and `aria-pressed` on a link is an
ARIA error — so the chips are submit buttons in a `<form method="get">`, which
also means the press works before hydration and the filter lands in the URL.
**Signed-out `/feed` shows the real feed** behind one `Callout`, where it used
to show a single bordered card on a page whose whole purpose is a list.
**A one-page feed gets the sentence and no navigation**, because two disabled
edges with a status line between them is three controls saying the same nothing.

Two defects only a rendered page could show. The **consent banner sat on top of
the mobile tab bar** — the banner is `z-toast`, the bar is `z-rail`, and both
were anchored to the bottom of the viewport, so the product's one primary action
was underneath a cookie notice on every phone. And a **no-JavaScript like on an
entry answered 500**: `proxy.ts` rewrites `/@handle/slug` into the `[locale]`
tree for `GET` and `HEAD` only, so a progressive form's `POST` was matched by
`[locale]/[profileHandle]` — the wrong route — and Next resolves such a form's
action out of the matched route's own manifest. With the client bundle running
it worked, because the `Next-Action` header resolves the id globally. That is
exactly the shape of defect ADR-0024 D3 exists to prevent, and every test that
pressed the button in a hydrated browser passed. `POST` is rewritten now, and
`tests/public-hydration.spec.ts` posts the form over HTTP with no browser at
all and asserts the like count moved.

Two stale checks turned up with it. `a[href*="/journal/"]` had matched nothing
since `OVE-436` moved an entry's address under its author, so the hydration
spec's two liveliest tests had been skipping themselves and reporting a pass;
they read a card's own `data-entry-card` now. And an unscoped
`button[aria-pressed]` would have found a filter chip instead of the like
control the moment this task shipped one.

**The focus ring was drawing nothing, on every control in the product** — found
by measuring one chip and kept by a gate that now asserts the right thing.
Tailwind v4 compiles `outline-none` to `--tw-outline-style: none` and every
`focus-visible:outline-*` to `outline-style: var(--tw-outline-style)`, so the
thirty-seven controls carrying both resolved their ring to
`outline-style: none`. In Chromium: `:focus-visible` matched, `outline-width`
was `2px`, `outline-color` was set, `outline-style` was `none`, and a
screenshot of a keyboard-focused rail link showed no ring at all. It was
`focus-ring/50` as well — about 2.0:1 over white, below WCAG 2.2 1.4.11's 3:1
even where it drew. Neither check that should have caught it could: axe does
not test focus visibility, and gate 8 asserted `outlineWidth !== "0px"`, which
was true the whole time. `globals.css` carries one unlayered
`*:focus-visible { --tw-outline-style: solid }` now — it wins over
`@layer utilities` whatever a component writes — and gate 8 walks the keyboard
across a screen asserting the width, the style **and** the colour on every
control it reaches.

**The §9 LCP budget is not reachable, and it is not the pages** (`OVE-461`).
Measured through the Lighthouse CLI, three runs, median: `/` is **4.28 s** with
**CLS 0**, of which 2.90 s is render delay while the cover photograph has
finished loading at 1.38 s. `origin/main` measured 4.06 s. `root-document.tsx`
wraps the whole body in one `Suspense` because the shell awaits the session, so
every public page's content arrives inside `<div hidden>` and is revealed by
React's `$RC` script — LCP lands at TTI, and it is the same boundary that makes
a scripts-off reader see nothing. The owner's call on 2026-09-17: record the
measurement in each page-family PR and keep shipping; `OVE-461` owns the fix.

**The journals directory stopped being a form** (`OVE-448`, 2026-09-18). Six
`<select>`s stacked above the results behind an "Застосувати" button — on a
phone, six full-width controls and a submit before a reader saw one result —
became the faceted pattern Etsy, Walmart, Tripadvisor and Selfridges all ship:
filters apply on change, the active ones sit above the results as removable
chips, the count is always visible in a polite live region, sort is its own
right-aligned control, and below `lg` it all collapses into one button opening
a sheet with Apply and Clear. `FilterBar` is the component; `OVE-451` reuses it
and the URL vocabulary for the organism catalogue.

**The URL vocabulary is written down and tested** in
`src/lib/public-listing-filters.ts`: one query parameter per facet, named for
the facet, repeated for multi-select, plus `sort` and `page`, and absent means
unset. No packed parameter. The journals directory's own builder is expressed in
it, and both defaults are dropped rather than written — `page=1` is the listing,
and the default sort depends on whether there is a query at all, so spelling it
out would give one view two addresses.

Three things only the browser could show. **A chip built as a plain anchor
announces nothing**: it replaces the document, and a live region that arrives
with a fresh document has nothing to announce into. The chips are `Link`s now —
a real href for the unhydrated case, a client navigation once hydrated — and
the spec marks the region's node and asserts it survived. **Three facet
selects at 704 px truncate their own options**: "Усі публічні регіони" and
"Усі ідентичності" both clipped in a three-column grid, which is the Cyrillic
budget of `DESIGN.md` §2.6 failing; two columns fixed it, measured. And **a
streamed response carries several copies of every region** — `/journals` serves
two filter forms and four `<main>` in its bytes, one of each surviving React's
`$RC` swap — so a proof must ask how many a reader can _see_, not how many the
document holds.

Two more silent gates turned up. `pnpm smoke:public-journal-search-budget` had
been failing at its first statement since migration `0046` dropped
`journal_entries.public_noindex` on 2026-09-03, and nothing noticed because the
script is in no CI list. Fixed and measured: p95 **11.2 ms** against a 750 ms
budget, candidate cap 256 held, and the same proof on `origin/main` reads
10.8 ms — the search reads are byte-identical to `main`, which is what
criterion 9 actually needed. And `tests/journals-directory.spec.ts` went into
`pnpm gates:browser` **and** the CI list on the day it was written; five older
specs did not, and `OVE-462` owns them.

**The page the whole product exists to produce is rebuilt** (`OVE-449`,
2026-09-18). `/{handle}/{slug}` is a reading page: an eyebrow, the entry's
title as the page's one `h1`, the date and the safe region, a byline with the
gardener's picture, the cover at the column's full width, and the prose at
18/29 in a 704 px column — measured at 68 characters at 768 px and at 1440 px,
which is inside `DESIGN.md` §2.6's 60–75. At 375 px it is the viewport's
measure and not the design's, and that is stated rather than papered over: 60
characters at 18 px needs about 590 px of column, and shrinking the type to
reach the number would take it under the 13 px floor.

`MediaFigure` and `EngagementBar` are defined here and `OVE-450`, `OVE-452`,
`OVE-453` and `OVE-454` consume them.

**The byte-identical guarantee is now a committed file.** ADR-0028 promises
that an entry published before Slice 26 renders byte for byte what it rendered
before, and `journal-document-pre-slice-26.golden.html` is that promise as
3,088 bytes: the whole pre-Slice-26 surface — paragraph, headings at 2 and 3,
ordered and unordered lists two levels deep, a quote with an attribution, a
delimiter, an image, and the marks bold, italic and link — rendered on
`origin/main` and committed, with the test on the branch asserting it
reproduces them exactly. It does, at zero bytes' difference. Two facts close
the gap the golden file leaves: `git diff` on the renderer is empty, and the
entry page passes it no `className`, so the document's markup has no route by
which it could change. What could **not** be done is rendering production's own
stored documents: reading production is denied to the agent in this
environment, and the whole pre-Slice-26 _surface_ is the subject instead of a
sample of real rows.

Four things the rendered page showed. The cover was **letterboxed**: a 16:9
photograph drawn `contain` inside a 4:3 box, with grey bars above and below it
on every entry that had one. The byline **printed the handle twice** whenever a
gardener had set no display name. The context rail drew **three headings with
nothing under them**, and the author's handle overflowed its 300 px. And the
engagement bar **printed the like count twice** and held two polite live
regions — the bar's own and the control's — which is one more than a reader
should hear. The control owns the region now, because its number is the
optimistic one `useFormStatus` moves on the press; the bar draws one only for
a surface whose controls have no count.

The like control's accessible name states the action **and** the count now
("Подобається, 12 вподобань" becoming "Вподобано, 13 вподобань"), which is
what `DESIGN.md` §5.6 asked for and what a screen-reader user needs _before_
pressing.

Measured on the entry: LCP **4.29 s** against **4.45 s** on `main`, CLS **0**
both, and the LCP element is the gardener's photograph in both. The budget is
`OVE-461`'s, as above.

**The profile and the passport are a gardener's body of work** (`OVE-450`,
2026-09-18). `/{handle}` opens with `ProfileHeader` — picture, name, handle,
bio, region and languages, the counts, one action — and then three real tabs
with roving tabindex: objects, entries, about. The objects are `Card`s with a
`MediaFigure` at the 4:3 card ratio; the entries are the system's `EntryCard`;
the empty profile is `empty-first-run` for its owner and `empty-no-results` for
a visitor, which is the distinction `DESIGN.md` §5.4 draws and the old page did
not. `/{handle}/objects/{slug}` and `/lineage/objects/{id}` are one passport
rebuilt on the same primitives, with the identity carrying `lang="la"` only
when it is a binomial, the last breadcrumb carrying `aria-current`, and the
provenance list saying in a badge that only confirmed edges appear in it.

**There is no communities tab, and the absence is a decision.** The acceptance
criteria name one. `community_memberships` has no visibility column — a row
records `active`, `left` or `banned` and nothing about who may see it — so
publishing that set on a public profile would publish data no gardener ever
marked publishable, the fact of a ban included. That needs an owner decision,
not an implementation, so the third tab is `about` and the reason is recorded
in `src/lib/public-profile-tabs.ts`.

Three defects only a browser found, and two of them were in the obvious
design. **A tab that changed the address and not the view**: the selection was
read back out of the router, and that route reads its parameters on the server,
so an arrow key moved focus to a tab that stayed `aria-selected="false"` for a
frame or more. The selection is held in the component now and the address is
written beside it. **A parameter the proxy deleted**: `?tab=` never reached the
page at all, because the author-scoped rewrite rebuilds the search string from
the route's own allow-list in `lib/interface-route-policy.ts` — the address
said `entries` and the profile opened on its objects. And **a canonical that
redirected**: a gardener's rename moves every object passport's address, but
`publicProfileChangeTags` named no tag the passport's hour-long cache carries,
so a renamed gardener's passports went on advertising an address that 308s
until the cache aged out. The `catalog` family tag closes that; the entry pages
were already covered.

Proven against a production build on a scratch database, in
`tests/public-profile.spec.ts`, which went into `pnpm gates:browser` **and**
the CI list on the day it was written: axe clean at 375 px and 1440 px on five
surfaces (a full profile, its entries tab, an empty profile, an object passport
and a lineage passport); the arrow keys moving the tabs with the URL following
and a reload landing on the same view; a rename answering **308** for the
passport's old address with the canonical naming the new one, and **410** for
the retired profile handle with none of the gardener's work in the body; and a
follow posted as raw multipart with **no client bundle at all**, asserted by
the row appearing in `profile_follows`. The passport's two converted forms are
checked the same way — every form on the page either names an endpoint of its
own or carries the server-action reference that lets it submit unhydrated.

`OwnerScopedActionForm` is gone from both files this task owns, and both
actions files now take `(_previousState, formData)`, which is the shape
`useActionState` hands a progressive form.

**One catalogue, four doors closed** (`OVE-451`, 2026-09-18). The catalogue
had five entrances and the menu named it a sixth way: `/objects` listed the
living objects gardeners keep, `/species` listed the 114 669 organisms behind
them, `/variety`, `/breed` and `/col` were addresses of individual organisms,
and a reader could arrive at any of them without learning they were one graph.
The menu item said *Каталог* and landed on a page titled *Живі об'єкти* with a
card on it offering the catalogue again.

There is one listing now, at **`/catalog`** — the word the menu, the schema
(`catalog_items`) and the owner's own tools (`/garden/catalog`) already used.
One result card: the accepted name with `lang="la"` when the rank makes it a
binomial, the vernacular in the reader's language, the rank, the market
registers, and whether a gardener here has written about it. One set of facets
on `FilterBar` in the `OVE-448` vocabulary — kingdom, rank, register, written —
plus a search and the alphabet index, which stays a list of real links because
it is the crawl path into every organism page. Sixty rows per page, as a list:
sixty bordered boxes for sixty one-line names is a page to scroll past rather
than scan.

**Nothing stopped answering.** `/species` and `/objects` are `308`s to the view
they meant — `/objects` to `?grown=1`, which is what it showed — and the prefix
travels, so `/bg/species` lands on `/bg/catalog` and not on the Ukrainian one
(ADR-0029 D8). Every organism's own address is untouched in all three route
families. The two discovery consumers that described one graph to the indexing
rule twice became one.

**The trap this hid.** The redirect has to be decided *before* the proxy's
unknown-segment and section-root blocks: `/objects` has no directory in
`src/app` any more and `/species` has no index of its own, so both are exactly
the shapes those blocks answer 404 for. The first draft put the redirect below
them and turned two published addresses into 404s. `DESIGN.md` §5.8 records
that with the rest of the one-listing rule.

Measured on a gate database holding the real Catalogue of Life release —
119 415 rows, 95 867 of them addressable. The browse read's own latency, on
ten random facet combinations no server had answered before: **p95 23 ms**,
median 16 ms. Migration `0075` is why: the merged listing orders by name with
no kingdom predicate, which `0072`'s `(kingdom, initial, name)` index cannot
serve, so the unfiltered root — the address every reader lands on — was a
sequential scan of 95 867 rows plus a sort. The typeahead is untouched and
still inside its budget: server p95 **27.5 ms** against 100 ms, 716 B gzip
against 1 KiB.

Proven in `tests/catalog.spec.ts`, wired into `pnpm gates:browser` **and** the
CI list on the day it was written: every old entrance answering and landing on
the right view, every organism address unredirected, every filtered view
naming `/catalog` as its canonical and carrying `noindex, follow`, the form
filtering as a real `method="get"` the server honours, the alphabet walked by
keyboard, and axe clean at 375 px and 1440 px on the door, a filtered listing
and an empty one.

**The organism card carries its own provenance** (`OVE-452`, 2026-09-18). The
card holds more than any other page in the product — names in four languages,
identifiers across five sources, relations, facts with the assertions behind
them, presence badges for two countries, the attribution EPPO's licence
requires, the forms beneath a species, and the gardener experience under all
of it — and it arrived as one long column with no way in. It is the design
system now: `PageHeader`'s rhythm, `Section` per region, `Badge` for a count
and a status, `MediaFigure` for a gardener's photograph, and the shell's own
contents rail above `xl`, where every entry points at a section that is on the
page and open.

**Two things it fixed rather than restyled.** The identifiers — COL, GBIF,
WFO, EPPO, Wikidata — were in the JSON-LD's `sameAs` and nowhere a reader
could see them; they render now in the monospace the design system reserves
for a string somebody copies, each linking out. And **"Names and sources" is
not an accordion any more**: ADR-0026 D9 wrote it as *collapsed*, but a
collapsed section is invisible to a crawler even though it is in the DOM, and
that section holds the identifiers, the source behind every fact and the
licence attribution. The ADR is amended in place with the reason. The owner's
own controls stay behind a disclosure, because those are tools for one person
rather than facts.

The section order is ADR-0026 D9's, unchanged, and it is **read out of the
served bytes** in `tests/organism-card.spec.ts` rather than eyeballed — it
looks like a styling choice and is not: the fact-only first paragraph is what
makes the page usable as an answer, and reordering it silently undoes an
earlier slice's work.

`app/catalog-evidence-route.tsx` was the last `OwnerScopedActionForm` in this
family. Converting it reshaped `addCatalogPublicSlugToWishlistAction` to
`(previousState, formData)`, which the workspace's own call site shares — so
that form stopped needing hydration too.

Proven against a production build on the catalogue gate database, wired into
`pnpm gates:browser` and the CI list: the D9 order out of the bytes; no card
section rendered as a `<details>`; the identifiers visible, monospaced and
linking out; a source-only card still `noindex` with no JSON-LD at all; a
merged card's address still answering 308 to the survivor; and **axe clean at
375, 1024 and 1440 px on four cards** — one the owner marked indexable, a form
beneath a species, a source-only node, and one merged away. JSON-LD is
**byte-identical to `main`** on a real indexable card, 1 658 bytes both sides.
Lighthouse through the CLI on that card: LCP **0.8–1.1 s**, CLS **0**,
performance 98–100.

**Everything the product publishes has one shape** (`OVE-453`, 2026-09-18).
The blog, the guides, the answers, the market landings, the knowledge hub, the
topics, the EPPO source archive and the legal and support pages had a shape
each — three type scales and three header rhythms between the three article
kinds alone. There are two shapes now: `PublicArticle`, which is `OVE-449`'s
reading column reused rather than re-derived, and one hub built from
`PageHeader`, `FilterBar` and `ListRow`.

**The legal pages became readable without a word changing.** Headings that are
real headings with real ids, a contents list that is the rail above `xl` and a
list at the foot below it, and the reading measure instead of a wall. That
distinction is the whole of criterion 5 and it is a real one: the typography is
a design decision and the wording of a disclosure is a legal one, which is why
`src/lib/privacy/disclosures.test.ts` is in the task's table.

**The nine instrumented paths are a contract now.** GA4 and GTM are wired on
`/`, `/blog`, `/privacy`, `/support`, `/first-publication-disclosure` and the
`/answers/`, `/blog/`, `/guides/` and `/markets/` prefixes, and nowhere else —
so a redesign that moved one would take a month of missing data to notice.
`src/app/google-analytics.test.tsx` enumerates the set in both directions: each
path is measured, in every locale, and the families this slice touched —
`/catalog`, `/species/…`, `/@handle` — are not and did not become so.
`tests/editorial-surfaces.spec.ts` loads every one of them and confirms it
still answers.

Two things the browser found. The article's section body was wrapped in a
`<div>`, which left the reading column with **no paragraph in it at all** — and
a measure is read from a paragraph, so the check that would have caught a
broken column could not run. And three of these pages stream, so the first
bytes of a request are the skeleton: a proof that asked for them proved the
skeleton. Both are fixed, and the second is now the rule the spec states.

Along the way the shell's own context rail, the not-found page and the language
control came onto the token palette — all three appear on every page in this
family, so leaving them would have made "one shape" untrue at the edges.

Proven in `tests/editorial-surfaces.spec.ts`, into `pnpm gates:browser` and the
CI list: every instrumented path answering in every locale it has; one article
shape across a blog post and the two legal pages, with the measure asserted at
**320, 768 and 1440 px** (704 px, 18/29 at each); one hub shape across the blog
index and knowledge; the EPPO archive keeping its attribution and its
observation date; and **axe clean at 375 px and 1440 px on seven pages**, one
of each shape.

**A community stopped advertising its own emptiness** (`OVE-454`, 2026-09-18).
The one community on the site rendered `0 Записи · 0 Живі об'єкти · 0 Учасники`
as its entire card footer — three numbers spending the most valuable row on the
card to tell a visitor that nothing was happening. `communityFacts` returns
what a community *has*; a zero is absent, and a community with nothing yet
carries one badge that is true of it instead.

**Three things were wrong beneath the surface, and only one of them showed.**

- **Nothing on the community page worked before hydration.** Join, leave,
  contribute, report and block all submitted through `OwnerScopedActionForm`,
  which wraps the action in a client closure — and React answers a closure with
  `action="javascript:throw new Error('React form unexpectedly submitted.')"`,
  a placeholder it replaces on hydration and never before. Five controls on a
  page whose whole point is that a reader can act on it. All five are
  `OwnerScopedProgressiveForm` now, and the four actions carry the
  `(previousState, formData)` shape `useActionState` calls (ADR-0024 D3).
- **The rules of participation were `xl:hidden`.** Above `xl`, where the
  context rail took them, the community's own page carried no rules at all — so
  the widest reader was the one told least. They are a `Section` at every width
  now, and the rail carries what a rail is for: other communities.
- **A reply to a reply was invisible.** `buildCommentThreads` filed every reply
  under its `parentReplyToken` and then only ever read that map at a *root's*
  token, so a third-level comment was in the database, counted, and absent from
  the page. The server already refuses to store one, so nobody had met it — but
  a renderer that drops a row it does not recognise is a defect waiting for the
  first shape it has not met. Depth is now capped by construction, and every
  Reply in a thread leads to the one box under its root.

**What the browser found.** A permalink built from a comment's id would have
undone a real invariant: `createAuthIntentControlRef` exists so a guest's
sign-in round trip can name a control without the page printing the row it
refers to, and `public-engagement-panel.test.tsx` asserts a guest's rendered
thread contains no raw token. The anchor is the opaque ref instead.

**Membership is not a roster.** The community shows the people *writing* in it
— Circle's and Whop's active-members panel — and not everyone who pressed Join.
That is a privacy decision as much as a design one: a contributor published
their participation by publishing an entry, and `lib/privacy/disclosures.ts`
carries no disclosure covering a list of members.

**Three links this task wrote and then took back.** `localizedPath` is wrong
for `/garden` and `/account/**`: the prefixed tree is a subset of the
unprefixed one, so `/bg/garden` is a `404` the proxy decides before rendering.
And the empty state's one action anchored `#community-contribute`, which
first-run mode did not render — a button that scrolls nowhere. The member's
picker is on the page now, and the spec loads all three pages in all three
markets and fails on a prefixed workspace link.

Proven in `tests/communities.spec.ts`, into `pnpm gates:browser` and the CI
list: **axe clean at 375 px and 1440 px, signed out and signed in**, on the
list, the community, a filtered community and a discussion — a member's view
carries the membership form, the contribution picker, the report disclosure and
the reply box, and those are where a label goes missing. Plus: a card that
prints no nought; the rules present at both widths; the `kind` facet
round-tripping through the address; `empty-first-run` on a community with
nothing in it, and `empty-no-results` with no illustration on a filtered miss,
whose canonical points at the community so `?q=` never mints a thin page; all
three pages answering `200` in all three markets; a no-JavaScript POST for
membership and for a reply, each asserted to carry the `$ACTION_*` reference;
and no comment three levels deep in the database afterwards.

A flake worth recording: `tests/journals-directory.spec.ts` located its facets
document-wide, and the streamed shell leaves the loading skeleton's copy of the
form in the DOM until the reveal — so a full gate run, where the server is
busier, failed in strict mode on two matching selects. It is scoped to the
visible bar now.

The remaining page families (`OVE-454`–`OVE-459`) are still in Backlog.

The empty states have their pictures: six 3D objects from `thiings.co` in
`apps/web/public/illustrations/`, resolved through one manifest module
(`src/lib/illustrations.ts`), on the owner's position of 2026-09-17 — the free
tier, and no attribution anywhere, including the footer. `DESIGN.md` §2.9 now
records that instead of the visible credit it used to require, and says why the
files ship with the code rather than through the media pipeline, which exists
for a gardener's photographs. No page renders `EmptyState` yet, so they reach a
reader as the page families land. The gap the foundation declared — gate 8's
command-palette flow, blocked on `OVE-445` — is closed: that gate drives the
palette now.

**Decided, 2026-09-16, not yet built.** The editorial pipeline — a machine that
reads the websites the owner chose and drafts news and blog articles for him to
edit and publish — is built **inside OverGarden, for OverGarden only**
(ADR-0030). A standalone product for other sites was explored the same day and
rejected: everything expensive about it serves a customer who does not exist,
while this site's need is two markets and one domain. Buying a service was
rejected on arithmetic — every service in the category bills per article, and
each piece is written into `uk`, `bg` and `ru`, so ~43 pieces a month is ~130
articles: $40–650 bought against ~$5–26 in tokens self-run on infrastructure
already paid for. Sources may be in any language and each locale is written
separately, never translated. New in this decision and in none of the Slice 25
issues: internal links are a first-class output placed by a deterministic linker
over a candidate set resolved through the organism graph, and publishing
registers a mention that the organism card shows and the pipeline reuses as its
memory against repeating itself. ADR-0026 D9 stands unchanged — an editorial
mention does not make a source-only card indexable, and the measure of success
is how many cards get a first _gardener_ entry after a reader was sent to them.
Nothing is implemented: every issue of Slice 23 and Slice 25 is still in
Backlog. The eight Slice 25 issues were rewritten against the ADR the same day
and two were created for the linking work no task described. The owner also cut
the falsification gate that day — the five hand-made drafts that were to decide,
for nothing, whether the writing is good enough — so the first evidence of
quality now arrives at the pipeline's first real run, after the queue, the
tables and the reading module exist. Slice 23 comes first and depends on none
of it.

**Just delivered, 2026-09-10.** SDD Slice 26 (`OVE-411`–`OVE-417`) — the
composer takes Notion's shape. The owner asked for the editor to look and behave
like Notion, and answered the two questions that ask carried: which blocks, and
how literal the look. `JournalDocumentV1` grew heading level 1, a to-do list, a
callout, a code block and the marks underline, strikethrough and monospace,
additively at schema version 1 with **no SQL** — `content_document` is `jsonb`
whose only constraint is that it is an object, and the block allowlist has
always lived in TypeScript. The composer lost its row of thirteen glyph buttons
and gained a 708 px column with a gutter, a drag handle with an insertion line,
a `/` command menu, a floating selection pill, markdown-shaped input rules and
the keyboard shortcuts that go with them, painted in OverGarden's tokens and
Google Sans rather than Notion's greys. The public entry keeps its typography
and learns the four new blocks; a level-1 heading renders as an `h2` so the
entry title stays the page's one `h1`, and every entry published before the
slice produces byte-identical HTML. Decisions are ADR-0028; the browser proof is
`apps/web/tests/journal-notion-composer.spec.ts`.

Three defects had no headless expression and were found by running it: a
cancelled animation frame whose id stayed in its ref froze the gutter on the
first block; a state setter returning a fresh array on every commit made React
report "Maximum update depth exceeded"; and base-ui closes a controlled,
trigger-less menu with reason `sibling-open` when a submenu opens inside it, so
the block menu is one flat list.

**Previously delivered.** SDD Slice 22 (`OVE-376`–`OVE-379`) — the interaction,
language and sign-in surfaces stop layering hand-written client protocols over
platform primitives. Clicking Like answered `500` with an empty body on 7 of the
8 public journal entries because the capability token embedded the slug and
overflowed its own length bound on any Cyrillic text; it is now a permanent
owned row behind a Server Action. Fourteen pages embedded the sign-in form, two
of them offering Google and four remembering where to return; there is one
screen now. Choosing a language ran a two-phase distributed commit ending in a
full document replacement; it is a link. Net for the slice: roughly 7 000 lines
removed against 2 500 added.

The rule the slice leaves behind, learned the hard way and then corrected in
public: **a control on a public page may not depend on hydration to do its job.**
A `<form action={…}>` gets a real endpoint only when the action is a Server
Action reference or the `formAction` `useActionState` derives from one; wrap it
in any client closure and React renders `action="javascript:throw …"`, which
does nothing until the bundle runs. Three source-level tests now hold that
shape for the engagement controls, the sign-in screen, and the language control.

Verifying the slice in production on 2026-09-04 found two defects the slice had
shipped, one of them reported by the owner. Pressing "sign in" in the header
landed on `/garden`, an empty state offering a second "sign in" before the form,
because the header read the navigation item's label and hard-coded its own href;
every sign-in link is built by one function now, and an intent control returns
the reader to the composer rather than to the workspace around it.

The other: merely _hovering_ a language option rewrote the reader's saved language.
The proxy reads the preference from the locale prefix a request lands on, and
Next strips `Next-Router-Prefetch` before middleware runs, so the guard written
to exclude prefetches never fired. Cross-locale links now carry
`prefetch={false}`; a source test and a browser test hold it, and ADR-0024 D4
records the mechanism.

**Before that.** `OVE-374` — workspace resilience. Every page under
`/garden/**` renders its own shell immediately, streams its data in sections, and
turns every failure into a designed state with a retry and a reference code. It
existed because a verified framework defect leaves a skeleton on screen forever
when a Server Component throws during a postponed resume; see ADR-0023 and the
receipt in `docs/WORKSPACE_RESILIENCE_PROOF_2026-09.md`.

**Now.** The MVP reset is delivered, so the next work is product, not
platform: real gardeners publishing, and organic discovery measured rather than
assumed. One measurement gap blocks honest prioritisation; see known gaps
below.

**Delivered 2026-09-07, OVE-399 (Slice 24, task 14 of 14).** The slice is
closed: nothing of the old shape remains to confuse the next reader. Migration
`0061` drops `catalog_items.catalog_kind` and `catalog_items.status` (the graph
answers both with `node_kind`, `identity_state` and
`merged_into_catalog_item_id`), the old matcher's `catalog_match_suggestions`
and `catalog_fuzzy_duplicate_suggestions`, the retired job kind's payload check,
and `user_added` from `plant_objects.variety_state`; it renames the topic signal
that was named after the dropped column. Every reader and writer went first; the
three words the interface uses — species, sort, breed — survive as one
derivation in `src/server/catalog-kind-sql.ts`, because that vocabulary belongs
to the reader even though it is no longer a column. Meilisearch and the
`catalog_typeahead_reindex` job kind left the pick path with `OVE-387`'s
successor commit, and the retired smoke scripts and their Python counterparts
went with them. `pnpm prove:organism-graph` is the one command that checks the
delivered slice against production. Two defects surfaced on the way: the
reconciliation's assertion cleanup asked five `not exists` questions per source
record with three of the columns unindexed, so one delete read about 470,000
rows and the job cleared roughly thirty-five assertions a minute while
saturating the one-vCPU database (migration `0064` indexes them; the same plan
costs 17,700 → 17.47 and the rate went to about 3,300 a minute); and `0061`
made six earlier migrations un-replayable, which `prove-migration-reapply.ts`
found and each site now guards. The slice's dated receipt is
`docs/DELIVERY_LOG_ORGANISM_GRAPH_2026-09.md`, and the production proof it
leaves behind is `docs/ORGANISM_GRAPH_PROOF_2026-09.json`: 12 checks pass,
0 fail, none pending — see known gap 0 for the
distribution behind that number.

**Delivered 2026-09-07, OVE-395 (Slice 24, task 10 of 14).** Every registered
cultivar and breed is attached to its species. The three register importers
already wrote what a register says — a source row, a catalog item, its names
and a link — but none of them wrote the one fact a gardener sees: that this
denomination is a form _of_ something. One pass now turns a row from any of the
registers into the same claim (which species, under which denomination,
registered where and when) and writes a `form_of` relation, a denomination, a
register identifier, a `registration_status` fact with the market and the year,
and a form slug from the romanized denomination.

In production 15,900 register forms became 15,457 attachments and 443 queue
items, with none both and none neither. The tomato species page says it has 621
forms and lists them; a registered cultivar answers at
`/species/solanum-lycopersicum-species-backbone/suomy-ua-register-14115052`
with its registration recorded as `registered UA 2025`. The picker prefers what
is registered in the reader's market, in Ukrainian and in Bulgarian.

It never guesses: two candidate species is a decision for the owner, not a coin
toss, and a variety the Official Journal has removed gets a `withdrawn`
registration fact beside its unchanged node and relation. Nothing is deleted.

**Delivered 2026-09-07, OVE-394 (Slice 24, task 9 of 14).** EPPO is on the
graph. The 2026-09-03 observed capture holds overview, names and taxonomy for
129,214 identifiers, and a second capture takes hosts, distribution and
categorization for the same ones. Both live in the source layer; a job reads
them and calls nothing upstream.

Each identifier climbs the deterministic ladder — the EPPO code the Wikidata
crosswalk wrote, the scientific name with its authorship, the canonical name
with its rank, and then the Catalogue of Life checklist itself, which
materializes a node with the backbone's classification. Only a species the
checklist does not carry at all is created from EPPO: viruses, viroids and the
animal pests the scoped ingest leaves out. In production 108,770 of 121,777
active codes linked automatically and the graph grew from 15,959 nodes to
114,525.

Cards gained a presence badge for Ukraine and Bulgaria at country level, with
EPPO's verbatim status beside the word; the pest or disease label from the
kingdom and the host role; and the attribution line the licence requires, dated
by the day the data was downloaded. The projection guard gained its second
axis: a leaf that is source-only, forbidden, or that the capture never
classified never reaches a product surface.

**Delivered 2026-09-06, OVE-393 (Slice 24, task 8 of 14).** Every canonical
node now carries the identifiers the other sources are addressed by. An offline
worker job asks Wikidata for the Catalogue of Life, GBIF, World Flora Online
and EPPO identifiers of the nodes we hold — matched on the Catalogue of Life id
they already carry, and by taxon name for the higher taxa Wikidata does not
give one — and writes them beside a Wikidata item id. An identifier another
node already holds is never overwritten: it becomes a decision in the owner's
queue, because the uniqueness of an identifier is what makes the ladder's first
rung work at all.

The same items carry the words gardeners use. Labels and aliases in Ukrainian,
Bulgarian, Russian and English enter the alias ledger; a name in one of those
four languages, long enough to be a name, not a restatement of the scientific
one, and attached to exactly one node becomes a vernacular the card and the
picker show. Everything else waits as `review_needed` with its reason. The
card's `sameAs` gained the Wikidata link, and a card whose names changed asks
the outbox to re-render it.

In production all 29 nodes with a Catalogue of Life identifier received a
Wikidata id, with 72 identifiers and 111 vernacular names written and no
conflicts. Nothing on a gardener's request path calls Wikidata, and a test
reads the whole web source to keep it that way.

**Delivered 2026-09-06, OVE-392 (Slice 24, task 7 of 14).** Catalogue of Life
is the backbone. The July 2026 release (COL26.7, doi 10.48580/dgyhw) lives in
the source layer as `catalog_source_col_usages` and
`catalog_source_col_vernaculars`, two snapshots at a time: one to serve, one to
diff against. The worker's `catalog_source_refresh` job downloads the ColDP
archive, verifies its checksum, streams `NameUsage` and `VernacularName` into
Postgres, places every node gardeners, the registers or EPPO already touch on
the tree, diffs the release against the one it replaces and prunes what is no
longer needed.

Nodes gain their parent, rank, kingdom and ancestors from the checklist: the
tomato now resolves through Solanaceae to Plantae. A node the release does not
know becomes an owner decision rather than a guess, and two nodes claiming one
Catalogue of Life identifier become a merge in the queue. The refresh applies
ADR-0026 D4's classes: a rename renames and keeps the old spelling as a
synonym, an accepted name that became a synonym merges itself when no gardener
depends on it and waits in the queue when one does, and a usage that left the
release supersedes its assertions without deleting anything.

The picker gained its secondary path: when the canonical list is thin the
composer offers the whole checklist, and picking a row there creates the node,
its ancestors and its identifier from that moment. Picking the same organism
again reuses it.

**Scope in production.** The managed database has 10 GiB of disk, and the whole
release is 3.3 GB per snapshot. Production ingests the plant kingdoms —
Plantae, Fungi and Chromista, 1,976,974 usages — which is what the source
readiness manifest asked for. Animals keep the canonical picker, and one
environment variable adds them when the database is larger.

**Delivered 2026-09-06, OVE-391 (Slice 24, task 6 of 14).** The owner curates
from two links in the account menu. `/garden/catalog/queue` shows one decision
at a time, highest impact first: the two nodes side by side with their reasons
and confidence, Yes, No and Skip as Server Action forms, J and K walking the
stream without deciding, U undoing, and a confirmation step only for a merge
that moves more than fifty gardener objects. Under it, the week's automatic
decisions with one-click revert. `/garden/catalog/sources` shows one card per
source with its version, licence, counts and last refresh, and a Refresh button
that enqueues exactly one job per idempotency key. On a public organism card
the owner alone sees rename, pin a preferred name, set indexable, merge into
another node by its address, and the list of what has already been done to the
card with an undo beside each entry. Every action writes
`catalog_curation_actions` with its inverse and revalidates the card, and a
merge from the card travels the queue's own apply function rather than a second
implementation.
A Monday cron enqueues one digest email through the auth outbox, which
migration `0063` taught a second message kind. Applying and reverting still go
through the SQL functions of `0056`, so the worker and the owner cannot drift.

Two defects only a real browser against Postgres could show, both fixed here:
the owner forms rendered React's placeholder action and needed hydration (a
client closure around the action; `OwnerScopedProgressiveForm` passes the
reference through, and the queue, sources and card controls use it), and the
apply and revert wrappers read a row in the same statement that inserted it,
so every decision committed and then answered 500. The nineteen other call
sites of `OwnerScopedActionForm` still need hydration; that is recorded, not
fixed here.

**Delivered 2026-09-06, OVE-390 (Slice 24, task 5 of 14).** The
reconciliation ladder runs in the matching worker, off every request path.
Six rungs in order (`services/matching/app/catalog_reconcile.py`): a shared
external identifier, the same scientific name and authorship after gnparser,
the same canonical name within one kingdom and rank, a RapidFuzz match at
0.92 or better inside one genus, denominations equal after the shared
normalizer or under the official romanization, and co-usage by gardeners as a
supporting signal that never proposes on its own. A kingdom mismatch on an
otherwise exact name records `homonym_kingdom_conflict` and proposes nothing.
Each proposal carries a confidence and closed reason codes; at or above the
rule's threshold in `catalog_reconcile_thresholds` it applies itself, below it
becomes a queue item ordered by impact. Applying and reverting are two SQL
functions from migration `0056` (`catalog_apply_queue_item`,
`catalog_revert_action`), so the worker and the owner's page share one
implementation and every action carries the inverse that restores the graph.
Thresholds recalibrate from 30-day revert rates within [0.80, 0.99]. Four job
kinds join the matching queue (`catalog_reconcile`, `catalog_curation_apply`,
`catalog_threshold_recalibrate`, `catalog_source_refresh`) and the three
suggestion kinds leave it with their tables' producers; a queued job of a
retired kind terminalises as `unsupported_kind`. gnparser is a pinned,
checksummed release installed by `services/matching/scripts/install-gnparser.sh`
into the image and both CI runners. The romanization of ADR-0026 D8 now exists
in Python as well, held to the same 82-case fixture as the TypeScript module,
so the spelling a form is addressed by and the spelling the ladder matches
cannot drift.

**Delivered 2026-09-06, OVE-389 (Slice 24, task 4 of 14).** The organism
card: one cached read (`readPublicVarietyPageByCatalogItemId`, tags
`organism:{id}` and `catalog`) assembles the page from one statement over the
graph tables (`src/server/public-organism-card-query.ts`: names, identifiers,
relations, facts and the snapshots behind their assertions, public and
accepted assertions only) plus the launch-guarded gardener experience. Sections
in D9 order: a fact-only first paragraph from structured fields (kind, species,
number of forms, gardeners with public journals, oblasts; templates in uk, bg,
ru), the gardener experience with the spread by oblast, relations (forms of the
species, pests of the plant, hosts of the pest with the host class), a collapsed
native `<details>` "Names and sources" panel that lists each source's
assertions with version and observed date and names an accepted-name
disagreement neutrally, and an attribution footer with the download date, the
newest assertion date and an outbound link per source. A card whose content
comes only from sources is reachable but `noindex` and absent from the sitemap
until `first_hand_content_at` is set (the publish path sets it for the node
and its species) or the owner sets `indexable_override`
(`organism_without_first_hand_content`). Worker-side changes revalidate
through the outbox: migration `0062` admits `catalog_item` intents with reason
`catalog_card` and no owner, `/api/cron/catalog-card-revalidate` drains them
daily (Vercel's Hobby plan refuses a cron that runs more than once a day; the
ten-minute cadence needs the Pro plan, and the card read's hour-long cache
profile bounds staleness meanwhile), `scripts/prove-catalog-card-revalidate.ts`
proves the migration, its rollback and the drain in CI. Production apply of `0062` is
recorded in `docs/PRODUCTION_SCHEMA_STATE.md`.

**Delivered 2026-09-06, OVE-388 (Slice 24, task 3 of 14).** Every organism
has a permanent address: a species answers at `/species/{slug}`, a cultivar
or breed at `/species/{species}/{form}`, in every locale; `/id/{uuid}` is the
permalink, and `/eppo`, `/col`, `/gbif` and `/wikidata` resolve external
identifiers. Every slug a card ever had, every old `/variety` and `/breed`
path and every merged card answer HTTP 308 to the canonical path; an unknown
slug answers a real 404. The status is decided in `src/proxy.ts` with one
bounded lookup before any shell streams (the Cache Components soft-404 rule,
recorded in ADR-0026's consequences) and again by the page for client-side
navigations. Form slugs are romanized from the registered denomination
(resolution 55/2010 for Ukrainian, the 2009 law for Bulgarian) by
`src/lib/catalog/slugs.ts`; `assignCatalogSlug` never reuses a slug and the
`0054` trigger writes the history. A form without a linked species keeps its
legacy address until the registers task links it. One builder,
`publicCatalogEvidencePath`, spells every catalog path. Organism pages emit
`Taxon` JSON-LD (`@id` = permalink, `scientificName`, `taxonRank`,
`parentTaxon`, `sameAs`, `dateModified`) with a `BreadcrumbList` and uk/bg/ru
`hreflang`; the sitemap's catalog chunk lists canonical addresses only,
`lastmod` from the content clock or the newest entry. Proofs:
`tests/catalog-addresses.spec.ts` against `next start` (CI), the address
repository, proxy and page unit tests, the 82-case slug fixture. No SQL of
its own; the picker's statement deadline went from 150 to 400 ms in the same
change after production showed a cold 503 at ~160 ms. The statement was
rewritten on 2026-09-07 to choose its eight rows before decorating them; see
known gap 0 for what that fixed and what it did not.

**Delivered 2026-09-06, OVE-387 (Slice 24, task 2 of 14).** The catalog picker
is one Postgres statement behind the public route `/api/public/catalog/typeahead`
(prefix index, then trigram; one row per organism; ranked by match class, the
reader's market, gardener usage and the crop prior; a 100 ms P95 budget with a 400 ms deadline; 60 s
shared cache, the one exception to hard rule 5). Meilisearch, the trigram flag
and the three-way merge left the pick path. A gardener's own name is a text
label on the object (`variety_state = 'free_text'`), never a catalog card and
never shown on a public surface; migration `0055` turned every provisional
card into a label, retired the cards, re-normalized stored names with the
shared normalizer and added `catalog_recompute_search_weight()`, run daily by
`/api/cron/catalog-search-weight`. Every query that ends without a pick lands
in `catalog_search_misses`. The composer and the object page share one
WAI-ARIA combobox with three outcomes: a species, a form with its species
implied, or "add as my own name". The legacy TypeScript importers still write
the pre-0055 name form; the register task of the slice replaces them.

**Decided 2026-09-05, evening.** The organism knowledge graph, ADR-0026,
implemented as SDD Slice 24 (umbrella `OVE-400`, sub-issues `OVE-386` through
`OVE-399`): one canonical card
per organism in OverGarden's own identity space over the retained source layer;
Catalogue of Life as the classification backbone, everything else attached as
sourced assertions; a Postgres-only picker with three one-tap outcomes where a
gardener's own name is a text label and never a card; hierarchical permanent
addresses with slug history and `Taxon` JSON-LD; an exception-only curation
queue in the account menu that never blocks a gardener; sources added one full
slice at a time, Catalogue of Life first, then Wikidata, then EPPO with a second
capture for hosts, distribution and categorization. This supersedes the
sentence in ADR-0025 that no source-built catalog is planned; the release
model stays retired. Later the same evening the owner pre-authorized every
production step of the slice; `docs/ORGANISM_GRAPH_EXECUTION.md` is the
executor's runbook and records the scope.

**Decided 2026-09-05.** The Stable Registry release model and the Release
Center are retired from the product and from every plan (ADR-0025). No
Foundation release will be built; a source-fed catalog curated in place was
decided the same evening (ADR-0026); the
catalog gardeners use — `catalog_items`, matching suggestions, the trigram
typeahead, `/objects` and the species, variety and breed pages — is unchanged.
The EPPO observed capture that `OVE-375` closed on 2026-09-04 stays, with every
table that holds EPPO data, the capture tooling and the credential; the plans
for that data are ADR-0026 D11. Removing the retired code and its empty tables is one pending slice,
`OVE-385`; the destructive half waits for a read-only inventory and the owner's
approval.

**Not planned.** Private entries, drafts, offline mode, a separate admin panel,
voice dictation, server-side image processing, an ORM, and a source-built
catalog through Foundation releases, editions, extension packs or a Release
Center. Each is a positive decision in ADR-0022 or ADR-0025, not an omission.

## Known gaps, stated deliberately

0. **The picker's P95 budget is met when the database host is quiet, and
   the spread check still flips when it is not.** Before: P95 129–216 ms
   warm, about 410 ms across fifty distinct queries, four to ten of fifty
   answering `503`. After, 5 consecutive runs of `pnpm prove:organism-graph`
   against production on 2026-09-08, every sample forced past the shared
   cache: **P95 30–58 ms warm, 80–161 ms across fifty distinct
   queries** (median 25–38 ms), **0 `503` in 250 spread samples**,
   2 of 5 runs with every check passing; 150 per-query samples in the
   same hour answered 0 non-200 with P95 119 ms and P99 184 ms.

   What it took, each measured against production rather than reasoned about:
   the statement decorated 2,395 candidates before taking eight (PR #335);
   `similarity()` re-tokenised every name on every keystroke, about 26 µs on
   Cyrillic — 46–99 ms of a 3 ms scan for `со` — so migration `0065` stores
   each name's trigram set and `intarray` counts the intersection, bit for bit
   pg_trgm's float4 on every one of 246,888 names (PR #337); the fuzzy arm
   runs only when the prefix arm cannot fill the list — `(never executed)`
   for the sunflower family — and, for queries of up to six trigrams, takes
   its candidates from a GIN index over those sets with a microsecond recheck
   (migration `0066`, PR #338: `де ба` 118 → 46 ms); one row per duplicate
   cluster comes from `distinct on` under the `"C"` collation instead of a
   window paying strcoll; and `pg` holds the pooled connection for five
   minutes instead of ten seconds (PR #334). Every rewrite was proven
   row-identical on 178 fixture prefixes and 1,798 prefixes of sampled
   production names, in both execution orders. The heaviest crop prefix
   explains at 43–52 ms hot, against 442 ms and a `503` at the start.

   **What remains is the host, not the query.** The same statement, forty
   times back to back with every buffer hot and nothing else running: thirty
   runs within 44–53 ms, then 57–70, then 98, 115, 190 and 214 ms — and in
   the slowest run every plan node is uniformly four to five times slower,
   with zero blocks read. `pg_stat_statements`, installed for this, agrees:
   mean 25 ms, maximum 273 ms, no reads. That is CPU contention on a shared
   one-vCPU database, which no statement can engineer around; it is what makes
   a spread P95 of 80 ms in one minute 160 ms in the next. The remedy is a
   dedicated-CPU database plan, which is a cost decision and the owner's.
   Gardeners are shielded by the route's 60 s shared cache; the proof
   deliberately is not.

   Two things stay true and written down: a pasted register denomination of
   sixty characters takes the fuzzy arm past the 400 ms deadline and answers
   `503`, as it did before — the composer falls back to the own-name outcome
   by design; and the 26.6 ms in `OVE-387`'s original receipt was measured on
   a loopback database of about 15,900 nodes, never comparable.
   0a. **A species can display its genus's name, because equal weights are
   broken by import date.** Found on 2026-09-09 from the live product: typing
   `соняшник` offers **Соняхи** first — the Ukrainian name of the _genus_
   _Helianthus_, in the plural — for a node that is correctly _Helianthus
   annuus_ (`/species/helianthus-annuus-species-backbone`). A gardener looking
   for a sunflower is shown a category.

   The card and the picker take a node's display name from the first uk
   vernacular by `is_primary desc, weight desc, created_at, id`. That node has
   four, and the top two are tied:

   | name                | weight | source     | created    |
   | ------------------- | ------ | ---------- | ---------- |
   | соняхи              | 2.0    | wikidata   | 2026-09-06 |
   | соняшник однорічний | 2.0    | eppo-codes | 2026-09-07 |
   | сонях               | 0.0    | —          | 2026-07-02 |
   | соняшник            | 0.0    | —          | 2026-07-02 |

   So the tie is decided by `created_at`, and **which name a reader sees is
   decided by which import ran first** — a day apart, in this case. The genus
   label reached a species node through the Wikidata crosswalk.

   Measured scope: **five** species nodes carry a uk vernacular that is also a
   genus's uk vernacular. The narrow fix is to demote those five; the general
   one is to break the weight tie by something that means something — source
   precision, or rank agreement — rather than arrival order. Neither is done:
   both are production data changes and belong with their own receipt. The
   picker does show the matched name beneath the display name, so the row is
   findable; it is the wrong word in the largest type.

1. **The framework defect itself is unfixed, and unreported.** Under Cache
   Components a thrown Server Component error during a postponed resume never
   completes or errors its Suspense boundary on a hard load, so `error.tsx`
   never renders. `OVE-374` removed every workspace page's reliance on thrown
   errors, so no reader is stranded — but the defect is still there for any code
   that forgets, and the upstream report with the three-page reproduction has not
   been filed. ADR-0023 records the mechanism.
2. **The signed-in chrome can disagree with the page during an outage.** When
   the session store is unreachable, a workspace page says so, but the site
   header still renders its signed-out state ("sign in"). The page is honest;
   the chrome is not yet, and it sits outside `/garden/**`.
3. **The slice's browser proofs are partial, and one of them was overstated.**
   Like, language and sign-in each had their _endpoint_ proved with a real
   no-JavaScript POST against a production build, and all three were then
   verified end to end on production in a real browser. That is not the same as
   working with JavaScript off, and the earlier wording here said it was: every
   public page renders inside streamed Suspense boundaries, so with scripts
   disabled it shows nothing at all and no control is reachable. See ADR-0024
   D3 for the measurement and for why the crawler cases are nonetheless
   covered. A _successful_ sign-in was never
   walked through in a browser — only the refusal path — so the `next`
   round-trip and the ADR-0022 D6 cross-tab reload are asserted by tests rather
   than observed. CI runs `tests/public-hydration.spec.ts` against a real
   Chromium on every push; the other Playwright specs still run by hand.
4. **No denominator for reader-facing failures.** Vercel Web Analytics is not
   enabled for the project, and runtime logs are retained for about an hour, so
   there is no denominator for "how often does a reader hit a failure". Server
   errors are aggregated for seven days, and a degraded section now writes its
   own line with a bounded class and the digest the reader can see on screen.
   This gap is narrower than "no analytics": GA4 and GTM are wired in
   `root-document.tsx` behind a consent banner, and Microsoft Clarity behind an
   env flag — but only on a marketing subset of paths (`/`, `/blog`, `/privacy`,
   `/support`, `/first-publication-disclosure`, and the `/answers/`, `/blog/`,
   `/guides/`, `/markets/` prefixes). Journal entries, the feed, objects and the
   workspace send nothing, so activation and retention — how many gardeners
   journal, how often they publish, whether anyone reads back — are not measured
   anywhere today.
5. **Closed 2026-09-05: the Stable Registry is retired and gone.** ADR-0025
   took the release model and the Release Center out of the plan; `OVE-385`
   took them out of the code the same day — the pages, the Stable Catalog
   explorer at `/catalog`, the three `stable_registry_*` job kinds and
   handlers, the pack-artifact adapters, the registry search scope and the
   product-selection gate — and the worker runs with six handlers. Migration
   `0053` then dropped every `catalog_registry_*`, `stable_registry_product_*`
   and `stable_registry_public_catalog_*` table, `catalog_item_revisions`,
   their functions and the three registry payload CHECKs on `job_queue` from
   production under the owner's written approval, after a read-only inventory
   found all twenty tables empty; its rollback recreates every object, and its
   executed proofs run on every CI build (`docs/PRODUCTION_SCHEMA_STATE.md`).
   The three Release Center flags still installed in Vercel were deleted with
   the owner's permission. The EPPO observed capture — 129,214
   identifiers, closed 2026-09-04 on the owner's loopback database, with a
   `pg_dump` kept outside it — is retained on purpose, together with
   `catalog_source_*`, the public EPPO archive at `/sources/eppo`, and the
   capture tooling; none of them is ever on a drop list.
6. **One owner only.** There is no role-grant interface; the single sealed owner
   is bootstrapped by CLI (ADR-0022, D5).
7. **`matching_worker_heartbeats` has no build timestamp.** The retired API read
   it from the image environment and no column holds it, so the runtime proof
   reports the image digest instead of inventing a value.
8. **The job queue contract is generated now.** The matching image release
   refused seventy-eight correct builds between 2026-08-27 and 2026-09-04 because
   the expected handler set was a frozen literal in five places and the manifest
   had grown three Stable Registry kinds. `apps/web/src/server/job-queue-manifest.ts`
   is now the only place that says what the set is: `pnpm queue:contract:build`
   writes the JSON contract and the Python module, `queue:contract:check` fails
   on drift, and `queue:contract:prove-database` executes the database half.
   Releases are green again, and since 2026-09-05 a candidate image is
   verified on the runner before the one push to the registry, so every tag in
   GHCR is a sealed release; the seventy-eight unverified images published
   during the red window are still there and must not be installed. `0051`
   (the heartbeat handler set is checked for
   shape, not identity — an exact array made a mismatched worker unrecordable
   and therefore indistinguishable from a dead one) and `0052` (the four payload
   CHECK constraints four kinds declared and none had) were applied to
   production on 2026-09-05; `docs/PRODUCTION_SCHEMA_STATE.md` carries the
   receipts and says why one constraint is deliberately `NOT VALID`.
9. **Closed 2026-09-05: production runs the current worker.** The sealed
   release of `63ce91d` was installed and activated on the droplet after the
   eight-day red window; the heartbeat row carried all nine handlers and both
   production proofs answered ready. The six-handler release of `d5faee5`
   replaced it the same afternoon through the same `install`, `migrate`,
   `deploy`, with both proofs ready again. Getting there took two more defects, each
   found only by deploying: preflight compared the candidate's handler set
   with the incumbent worker's heartbeat, so a release that changes the set
   could never pass (PR #289), and the drain outcome wrote a bare NULL
   parameter that Postgres could not type, so the first nine-handler worker
   restarted on every loop until the release script restored the prior image
   (PR #290). The worker's SQL now executes against a real Postgres in CI and
   in the release path: `services/matching/tests/test_runtime_database.py`.
10. **The media-lifecycle cron had never run in production.** `vercel.json`
    schedules `/api/cron/media-lifecycle` daily at 03:00 UTC and Vercel Cron
    invokes a scheduled path with GET. The route exported `POST` only, so every
    invocation since the schedule was added answered 405. Observed on
    2026-09-05: `media_lifecycle_retention_runs` held zero rows ever, nine queue
    rows sat at `attempts = 0` unclaimed, and the five derivatives of five
    deleted journal entries were still served from `media.over.garden` with HTTP 200. An unauthenticated GET returned 405 for this path and 401 for the three
    cron routes that export GET, which is the whole difference. Fixed by
    exporting GET, and `src/app/api/cron/vercel-cron-contract.test.ts` now fails
    when any scheduled path has no GET, when a cron route is unscheduled, or
    when a scheduled route does not refuse an unauthenticated caller.
    `release-health.yml` probes the same thing against the deployed build once a
    day, because a route can be right in git and still not be what production
    serves. The fix is live — an unauthenticated GET now answers 401 — and the
    nine queued jobs drain on the next 03:00 UTC pass. Nothing was triggered by
    hand: `vercel env pull` does not return the `CRON_SECRET` value, and the
    evidence that the runtime holds one is that the learning-attribution cron,
    whose only production caller is its own scheduled route, advanced an outbox
    row three and a half days ago.

## How to check any of this yourself

```bash
cd apps/web
pnpm prove:owner-mvp-reset                 # the seven requirements against production
pnpm prove:workspace-resilience -- --base-url <running next start> --cookie-file <cookie>
pnpm smoke:matching-queue-health -- --environment production --confirm-environment production
pnpm smoke:matching-runtime-capabilities   # worker liveness from the heartbeat row
pnpm queue:contract:check                  # the generated queue contract matches the manifest
pnpm queue:contract:prove-database         # the two new CHECK constraints, executed
pnpm test:public-hydration                 # real Chromium, production build: public pages hydrate
pnpm exec tsx scripts/apply-reviewed-migration.ts --mode inventory --env-file <pulled-env>
```

Production reads are fine without asking. Anything that changes production data,
schema, or provider state needs one explicit owner approval each, per
`AGENTS.md`.
