# ADR-0032 — A public page is a static document

- **Status:** Accepted (2026-09-20). Delivered for the document, the shell,
  the home feed, the journal entry and the organism card by `OVE-461`; the
  remaining page families follow the same recipe (D8).
- **Date:** 2026-09-20
- **Decision owner:** founder/owner — "not the simplest, the fastest or the
  cheapest: the best, whatever the size of the change" (2026-09-19).
- **Supersedes:** the single request-time boundary of ADR-0022 D4's first
  implementation (`root-document.tsx` wrapping `<body>` in one `Suspense`), and
  the paragraph of `DESIGN.md` §9 that called the LCP budget unreachable.
  ADR-0022 D4 itself — public pages are cached with tags and revalidated by the
  mutations that change them — stands, and this is what it always implied.
- **Relates to:** ADR-0023 (a failure is a settled value), ADR-0024 D3 (a
  public control may not depend on hydration), ADR-0029 D10 (one address, `200`
  to everyone, the proxy picks the subtree), ADR-0031 D9 / `DESIGN.md` §9 (the
  budgets are gates).

## Context

`DESIGN.md` §9 gives every public page `LCP ≤ 2.0 s` on slow 4G. On 2026-09-17
the home feed measured 4.28 s and the paragraph recording it said the budget
was unreachable. It was re-measured on production on 2026-09-19 with three
instruments, because one tool is not a finding:

| Instrument | Result on `https://over.garden/` |
| --- | --- |
| The served bytes | 0 visible characters outside `<div hidden>`; `<title>` at byte 60 673, after `</head>`; the first `<img>` at byte 69 890 |
| Lighthouse CLI, simulated slow 4G, median of 3 | LCP **5.16 s**, FCP 1.56 s, TTI 5.25 s, CLS 0 |
| Lighthouse CLI, throttling really applied, median of 3 | LCP **5.44 s**, of which 4.7 s is the photograph's own download |
| Chromium, unthrottled, instrumented | `$RC` asked to reveal the page at 307–356 ms; revealed at 604–631 ms |

Four causes, none of which is a page's fault.

1. **One boundary around everything.** The document awaited the reader's
   language and session before rendering anything, so every page arrived inside
   `<div hidden>` and React's inline runtime moved it into place.
2. **React 19.2 throttles that move.** `$RC` reveals a boundary that completes
   after first paint no sooner than **300 ms after the previous reveal**. So the
   page was hidden for 300 ms on a connection where every byte had arrived, and
   on an unthrottled trace the bundle always ran first — which is why Lighthouse
   reports LCP at TTI: its simulation charges LCP with every script that
   evaluated before the observed paint.
3. **The photograph could not be prioritised.** An `<img>` inside a hidden
   container has no layout, so the browser cannot know it is in the viewport;
   its preload link was in the streamed body, not the head. It competed with
   329 KB of script and 106 KB of fonts for a 1.6 Mbps pipe.
4. **Nothing was served from the edge but a skeleton.** Every request needed
   the function; one cold start in three runs measured a 3.2 s TTFB.

The same boundary is why a reader without JavaScript saw nothing
(ADR-0024 D3's known gap) and why the consent notice flashed on every hard load
for a reader who had already answered it.

## Decisions

### D1. Two documents, told apart by whether the route knows its language

A **static document** is every public page. Its language is in its route
(`/[locale]/…`), so the chrome, the page and the page's photograph are part of
the prerendered shell: in the first bytes, outside every `<div hidden>`,
painted without a runtime. A **request-time document** is the workspace, the
account, the sign-in screens and the few public addresses with no prefixed
twin; its address carries no language, so it resolves language, market and
session per request behind one boundary, as before.

To make that true for every reader, **the proxy rewrites the default locale
too.** A Ukrainian reader used to render from the unprefixed tree, whose root
layout also serves the workspace and therefore cannot know its language; the
product's largest market was the one that could not have a static document.
`/journals` now renders from `/uk/journals` exactly as `/bg/journals` always
has. The address does not change (ADR-0029 D10). The unprefixed tree keeps its
public wrappers: a Server Action posts to the unprefixed address and resolves
out of that route's manifest.

*Rejected:* splitting the unprefixed tree into route groups with two layouts.
It moves eighty route directories and a hundred path pins to keep a second copy
of the public tree alive. *Accepted cost:* a Ukrainian reader moving between a
public page and the workspace now loads a document, as Bulgarian and Russian
readers always have; both documents are cheap.

### D2. The session is started, never awaited

A prerender cannot know who is reading. The static document calls
`getSiteShellSessionState()` and hands the **promise** to the shell. The few
regions that differ between a guest and a gardener — the gardener's own
destinations, where the primary action leads, the account region, the tab bar,
the cross-tab session signal — are each a `ShellRegion`: a boundary whose
fallback is **the guest's working rendering**, never a skeleton, and whose
resolved rendering takes the same box. A page does the same with
`SignedInOnly`. What needs no bytes (the palette's commands, the closed mobile
menu, the owner scope) reads the session once it has settled and never
suspends — from a store, not from a context (D10).

`unstable_rethrow` opens every `catch` on this path. A blanket catch would
answer "guest" *into the prerender*, and the shell would tell every gardener
they are signed out with no hole left to correct it.

The owner scope's hidden field reaches a static page's forms after hydration.
That is inside its contract — "a missing id only skips the comparison, the
session itself decides" — and the workspace, where the comparison matters, is a
request-time document that still renders it on the server.

### D3. A static document does not read its address on the server

It is prerendered at the route's path and served at the browser's
(`/uk/journals` against `/journals`), so anything written from the raw
pathname would differ at hydration. `canonicalSiteShellPath` is the one
spelling both agree on.

And `usePathname()` cannot simply sit behind a boundary there. Next builds an
address's shell by resuming the route's fallback shell; the boundary completes
during that resume; React outlines it with a segment id allotted **at flush**,
after the postponed state was captured; the request-time resume allots the same
ids again. Measured: `S:7`–`S:b` twice in `/journals`, five segments never
revealed, four hydration errors. **The only boundary a static document may
carry is one a prerender can only postpone** — a session region, or a page
region around request data.

So the address is `null` in the served HTML and arrives after hydration, from a
reader that only mounts on the client. What a reader *sees* does not wait: an
inline script in the document's first bytes puts the section on
`<html data-shell-section>` and `globals.css` draws the current item from it.
What arrives with hydration is what needs React — `aria-current`, the language
options' exact targets, the sign-in link's return path. Before it, a language
option leads to that language's home: a working control, one step less exact.

### D4. A static shell never carries a failure, and a build never needs a database

A page settles a failed read into a designed state (ADR-0023). A degraded state
that renders *successfully* is a shell Next will cache and serve to everyone,
`noindex` included, until the read's `cacheLife` runs out. So a failure is never
part of a prerender: each request retries for itself, and a failed `use cache`
call is not stored, so the next regeneration heals the shell.

*How* a page defers depends on whether it has a boundary above it, and the
first version of this decision got that wrong.

**A page behind a boundary of its own** — a family not converted yet — waits
for the request with `await connection()`: before its first read
(`deferWithoutDatabase`) and in the `catch` that settles a failure
(`deferFailureToRequest`). The boundary keeps its fallback in the shell.

**A static page has no boundary above it** (D6), and `await connection()`
outside a boundary is a build error. Measured on 2026-09-20: a build with
`DATABASE_URL` unset stopped at `/uk` with "Uncached data was accessed outside
of `<Suspense>`" — which is every Vercel Preview. So a static page is *attempted*
(`renderStaticPublicPage`): its render function runs once as `"static"`, and
either returns the page or throws `StaticRenderDeferred` from
`deferStaticRenderWithoutDatabase` / `deferStaticRenderAfterFailure` — before
anything is rendered, since a page's reads come before its first element. Only
then does a boundary appear, around a second run of the same function that
waits for a request first. The shell carries the skeleton and a hole; nothing
degraded is cached. It heals by itself: the deferred branch reads a clock with
a one-minute life, so the shell is regenerated and the static render is
attempted again. Measured: a build made with no database, started with one,
served `/` as a static document 41 s later.

**And a build asks before it reads.** A rejected `use cache` read aborts a
prerender *however the rejection is handled* — a `catch` does not save the
build. A build against a closed port stopped at the first page that read. So
during `next build` a static render reads only if a cached probe that cannot
reject says the database answers (`staticReadsAreAvailable`); at run time nobody
asks, because a failed read there fails one regeneration and the shell being
served stays. Builds with no database, with an unreachable one and with a
healthy one all succeed; only the last produces static documents at once.

The shared metadata loaders take `document: "static"` from a converted page
and default to `"request"` — `await connection()` first, exactly as before this
ADR — so a family that has not been converted never reads at build time.

### D5. A query string renders from the listing's twin

Reading `searchParams` is what makes a page dynamic, so the page at the
canonical path never does. A listing has a **twin** — the same renderer mounted
under one reserved segment, `/q` — and the proxy rewrites a request there only
when it carries a parameter the route's own policy accepts. `utm_source` and
the like, which the policy drops, get the static document. `/q` is not an
address: a request that names it answers 404.

*Rejected:* a fallback that shows the default listing and swaps to the filtered
one — a flash of the wrong results on every shared link. *Rejected:* a
prerender per filter combination — unbounded cache writes from one loop over a
query string.

### D6. No boundary above a static page; one sample for a dynamic route

React outlines any boundary whose content exceeds its progressive chunk size
(12.8 kB) into a hidden segment, fallback first — in a prerender too. So a
static page has no `loading.tsx` above it: the locale tree has no root
`loading.tsx`, and each page that still renders at request time carries its own
beside it. A fallback is part of the prerendered shell and may not read the
request; one that speaks a language takes it from `params`, in a layout.

Without `generateStaticParams` a dynamic route's params are request data: it
has only a fallback shell and its content streams on every request. With one
sample, the first request for an address renders it whole and the result is
kept and tagged. The sample is `STATIC_PARAMS_PLACEHOLDER`, not a row — a build
must not need a database — and the route renders nothing for it rather than
`notFound()`, whose render of a sampled path is static and turns the document's
session read into a build error.

### D7. The consent notice is drawn by CSS from what `<html>` says before paint

The notice is in every static document's bytes and reads neither the address
nor the stored answer. The inline script writes `data-analytics-route` and
`data-analytics-consent` on `<html>`; one unlayered rule draws the notice only
for a measured path with no answer. It paints with the page when it is owed,
never flashes for a reader who answered, is never a late LCP candidate — on a
text page it is the largest thing on a phone's screen — and a reader without
JavaScript, whom nothing measures, never sees it. The tags themselves mount
after hydration.

### D8. The recipe, and the gate that keeps it

A page family becomes static by: no `searchParams` and no session in the page
(D2, D5); its route awaits `renderStaticPublicPage`, whose render function
awaits `deferStaticRenderWithoutDatabase(phase)` before the first read and calls
`deferStaticRenderAfterFailure(phase)` where it would settle a failure, and its
`generateMetadata` passes `document: "static"` to the shared loader (D4); no
boundary above it and a placeholder sample if its route is dynamic (D6);
request data only inside a boundary that a prerender can only postpone (D3);
and nothing it provides to the tree changes by itself (D10).

`tests/static-documents.spec.ts` (`pnpm test:static-documents`) asserts it over
HTTP, not through the DOM: for each static family, the page's `<h1>` and its
first photograph are outside every `<div hidden>`, `<title>` and the
photograph's preload are in `<head>`, and the visible text without a runtime is
not empty. It runs in CI against the production build, beside the hydration
proof, and it is also where D10 is held.

### D9. How the budget is measured

`LCP ≤ 2.0 s` is measured through the Lighthouse **CLI** with throttling
**applied** (`--throttling-method=devtools`), median of three, against a
production build; the simulated figure is recorded beside it. Simulation charges
LCP with every script that *evaluated before the paint on the unthrottled
trace* — on a loopback server that is all of them, whatever the page does, so
it measures the bundle and not the document. Applied throttling observes the
paint. Both numbers go in a page-family PR; the applied one is the gate.

### D10. Nothing above a page changes by itself

A static document learns two things after it has been served: who is reading,
when the session settles, and where they are, when hydration can ask the
router. A page may tell the chrome a third: what goes in the context rail. All
three first arrived the obvious way — state in the shell, handed down as
context.

React cannot look inside a boundary it has not hydrated. When a context above
one changes, or the component that draws it renders again, React assumes the
boundary is affected and tries to hydrate it early. If the boundary's content
has been **streamed but not yet revealed** it cannot — and React reveals a
completed boundary no sooner than 300 ms after the previous reveal — so it gives
the served HTML up and renders the boundary on the client. The segment is
dropped when its turn comes. Measured on 2026-09-20: `/communities/{slug}`
held its whole `<main>` twice for 200 ms (the hidden segment and React's own
copy) and then threw the server's away; production, on the old document, never
did. A transition does not prevent it: the lane is bumped, the boundary is still
pending, the result is the same. It happens on a *fast* machine and not under a
4× CPU throttle, which is the wrong way round for anything a test suite catches
by accident.

So:

- **What arrives late lives in a store, not in a context value**
  (`src/lib/value-store.ts`, `useSyncExternalStore`). The provider hands down
  the store, which never changes; the regions that read it render by
  themselves. The address, the settled session, the owner scope's owner and
  notice, and the rail's modules are all stores.
- **The component the page renders inside holds no state and subscribes to
  nothing.** The mobile menu owns whether it is open; the palette reads the
  session when a query settles instead of taking new `actions` when it does.
- **A region reads the address inside its boundary, on both sides**, never
  beside it: a region that read it outside would hand its own boundary new
  props the moment the address arrived.

Held three ways. `shell-state-stability.test.tsx` hydrates a document with a
pending boundary and asks whether its fallback is still the node the server
sent after the chrome has learned all three things — with a control that does
the same through a context and loses the node, so the test is known to be able
to fail. `site-shell.test.tsx` reads the framed shell's source for hooks that
hold state. And `tests/static-documents.spec.ts` wraps React's `$RC`/`$RV` in a
real browser, **holds every reveal back 1.2 s** so that hydrate-then-reveal is
the only order on any machine, and fails on a segment whose boundary was gone —
for a guest and for a gardener, on static pages and on the families that still
render at request time. Against the context-based shell it fails on the first
address.

*Rejected:* wrapping the updates in `startTransition` — it was the first fix,
it cured the organism card (whose boundaries were complete, merely not yet
hydrated) and did nothing for a pending one. *Rejected:* keeping the state and
memoizing the page subtree — context propagation does not go through props.

## Consequences

Measured on a production build, slow 4G and 4× CPU really applied, median of
three (2026-09-20). "Before" is production on 2026-09-19.

| Page | LCP, applied | FCP | TTI | CLS | LCP, simulated | Visible characters without a runtime |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | 5.44 s → **1.90 s** | 1.88 s | 3.49 s | 0 | 5.16 s → 4.43 s | 0 → 4 324 |
| a journal entry | **1.65 s** | 1.60 s | 2.31 s | 0 | 4.29 s → 3.31 s | 0 → 2 179 |
| an organism card | **1.74 s** | 1.74 s | 3.12 s | 0 | 3.97 s | 0 → 1 882 |

The card first measured **5.10 s** after the conversion, with the text on
screen at 1.74 s. The second, later LCP candidate was the same paragraph as a
*new DOM node*: the shell set two pieces of state right after mount, the update
reached the page's boundary before React had hydrated it, and React threw the
served `<main>` away and rendered it again on the client. It reproduced only
under Lighthouse's request latency (562 ms), which is why a faster trace never
showed it. Making those updates transitions brought the card to 1.75 s — and was
half a fix: a boundary still *pending* is given up under a transition too, which
the community page showed a day later. The shell has no such state now (D10).

- A static document is served from the edge; a cold function delays a
  gardener's account region, not a stranger's first paint.
- A public page renders for a reader without JavaScript (ADR-0024 D3's gap
  closes for the converted families).
- The simulated figure stays above budget until the bundle shrinks: 337 KB of
  script on a public reading page is its own debt, recorded in
  `docs/PROJECT_STATE.md`.
- Converting a family is a recipe and a gate row, not a design.
