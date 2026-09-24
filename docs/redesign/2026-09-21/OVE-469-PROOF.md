# LCP ≤ 2.0 s on production data — OVE-469

The exact tested and merged commits, CI runs and the production checks are in
the authenticated Linear receipt. This delivers criteria 1, 2, 4 and 5, gives
every public photograph on production its variants, and measures what decides
criterion 3. Criterion 3 — LCP ≤ 2.0 s and FCP ≤ 1.5 s applied, on
production — is **not met**, and this document says why with numbers. On
2026-09-24 the owner closed the issue with these facts and left the budget's
number and method for photograph-led pages as an open decision
(`docs/PROJECT_STATE.md`, known gap 11).

## The baseline

Production after the chrome's bundle diet (2026-09-23): Lighthouse CLI 13.5.0,
median of three, `ove-469/lighthouse/production-baseline*`.

| Page | LCP applied | FCP applied | LCP simulated | CLS |
| --- | --- | --- | --- | --- |
| `/` | 5.73 s | 2.87 s | 5.61 s | 0 |
| `/@yehor/post/9` | 2.80 s | 2.80 s | 6.70 s | 0 |
| `/species/solanum-lycopersicum` | 5.16 s | 2.92 s | 5.53 s | 0 |

On `/`, the waterfall under applied throttling runs like this:

- The cover (94 kB, `High`) is asked for at 0.69 s and finishes at 5.74 s.
- It shares the link with 17 script chunks (≈ 250 kB), four font files (108 kB)
  and two stylesheets (20 kB).
- The stylesheet ends at 2.79 s, so FCP is 2.87 s.
- From 2.86 s seven more photographs join: lazy, below the fold, 103–453 kB
  each, 1.5 MB together.

**None of production's 13 public photographs has a `srcset`**
(`production-photographs-srcset.json`, from the 11 public entry pages). A 224 px
slot is sent a 147 kB file.

## Why the levers do not add up

Applied throttling delays each request's first byte by 562.5 ms and shares
1,474.56 kbit/s *evenly between the requests in flight*, whatever their
priority. `ove-469/applied-throttling-model.py` replays that rule over
production's requests and predicts today's cover at 5.60 s, against 5.73 s
measured. Its scenarios:

| Cover finishes | Scenario |
| --- | --- |
| 5.60 s | today |
| 7.21 s | stylesheet inlined — layout at ~0.9 s, so the lazy photographs start then |
| 4.52 s | inlined, normal faces only, below the fold as 480 px variants |
| 4.02 s | the same with a 40 kB cover |
| 2.63 s | inlined, no fonts, 40 kB cover, nothing below the fold |
| 1.68 s | the same, with the framework's script in one request instead of 17 |
| 1.47 s | no script in the window at all |

Two things follow:

1. **Anything that brings first paint forward brings the lazy photographs
   forward, and they take the link from the cover.** A lazy image is asked for
   when layout finds it near the viewport, and on a slow connection Chrome's
   distance reaches thousands of pixels. So FCP and LCP pull against each
   other while the photographs below the fold weigh 100–450 kB.
2. **The script alone keeps a photograph over 2.0 s.** Seventeen chunks of the
   framework's script, each taking an equal share, leave a 40 kB cover at
   2.63 s with nothing else competing.

## The levers, measured

A production-weight fixture, local production build, same database for every
row, median of three (`ove-469/lighthouse/local-heavy-*`). Every lever is
evaluated here before it may cost a production release.

| Page, applied | main | italic Cyrillic not preloaded | + `experimental.inlineCss` |
| --- | --- | --- | --- |
| `/` LCP / FCP | 2.95 / 1.93 s | **3.80** / 1.74 s | **5.33** / 0.86 s |
| entry LCP / FCP (CLS) | 2.66 / 1.60 s (0) | 2.67 / 1.60 s (0) | 2.97 / 0.74 s (**0.401**) |
| organism card LCP / FCP | 2.86 / 1.89 s | **3.11** / 1.74 s | 3.10 / 0.86 s |

- **Font preload budget (lever 4).** Italic Latin is on the first screen: the
  accepted name beneath an organism card's heading. Italic Cyrillic is not, so
  it was made to load on use, one 17 kB file fewer. That brought the stylesheet
  in 0.2 s sooner, and with it the four lazy photographs, and the cover
  finished 0.85 s later on the feed. **Withdrawn**; the measurement stays.
  Declaring the family in two calls also taught one trap:
  - `subsets` decides only what is preloaded; every call declares every range.
  - So a third call for italic Cyrillic would have declared the Latin italic
    range again, under a file name without the preload's.
  - The later rule wins, so the preloaded file would have gone unused.
- **Inlined CSS (lever 3).** FCP drops to 0.74–0.86 s, but the feed's LCP gets
  worse by 2.4 s, for the reason above. The entry shifts by 0.401 in two of
  three runs: its text paints before the web font arrives, and
  `adjustFontFallback: false` means the fallback is not metric-matched. The
  feed's HTML grows to 376 kB, because Next inlines the CSS twice (in `<style>`
  and in the RSC payload). **Rejected.**
- **Below the fold, `fetchpriority="low"` (lever 2).** Rejected on 2026-09-20:
  production's waterfall already shows lazy photographs outside the viewport at
  `Low`, and applied throttling does not read priority.
- **The script (lever 5)** is the chrome's bundle diet, released the day
  before this baseline.

## What ships

- **Criterion 2.** `tests/lcp-element.spec.ts`, in the gate, reads the
  browser's own `largest-contentful-paint` entry at 412 and 1,440 px on:
  - `/`, an entry, an organism card with a gardener's photograph, `/journals`
    and a profile.
  It fails if that element is a lazy image.
  - Its photographs paint because they are real files of production's weights
    in the local media store. `static-documents.spec.ts` still asks the same of
    the geometry, where its photographs are rows with no file.
  - Seen red first, on the organism card: with its first gardener photograph
    made lazy, "organism card at 412 px: the LCP element …/1.webp is lazy"
    (`lcp-element-seen-red.txt`).
  - Green, the LCP element is the photograph (`<img loading="eager"
    fetchpriority="high">`) on the entry at both widths, on the card on a phone
    and on the profile at both widths. The feed and the directory lead with a
    text entry the spec publishes (`lcp-elements.json`).
- **Criterion 5.** `pnpm fixture:production-weight` seeds a local database and
  media store with production's weights — a 94 kB cover and cards of 103, 147,
  209 and 453 kB, browser-made WebP, no variants. Seed first and build after:
  the listings prerender from the database. On it, the feed measures 2.95 s
  where the light fixture said 1.78 s.
- **Criterion 1.** ADR-0032's consequences and DESIGN.md §9 now say which rows
  have no "before" taken the same way, instead of leaving a reader to compare
  across environments.
- **Criterion 4.** CLS is 0 on every page measured on production, before and
  after, and on the local fixture with what ships. The gate is green three
  times in a row on the final code, each run in CI's order:
  - two full local runs, each on a fresh database: create it, bootstrap it,
    build against it, then the gate;
  - CI itself.

  Each gave 389 passed and the one existing skip. CI passed one of them, an
  owner-curation test, only on its retry: for a moment that page holds two
  copies of its owner surface. It is unrelated to this change and has a task
  of its own. Getting there took two fixes to the gate. Both were races, and
  neither was caused by this change:
  - **`knowledge-pages.spec.ts` compared cached pages with a count taken
    once.** It counted the `plants` topic's entries in `beforeAll` and
    expected four cached pages to agree. Any spec's publish re-renders those
    pages with its plant entry, and its cleanup deletes the row by SQL, which
    re-renders nothing. So the answer kept a related section over a topic that
    was empty again. This failed `main` twice on 2026-09-23 and this branch's
    first CI run; this branch's spec began after that failure, so it was not
    the cause. The spec now publishes its own `plants` entry through the real
    endpoint (`tests/helpers/publish-plant-entry.ts`), which fills the topic
    for the whole run, and asserts the populated side.
  - **`scanAccessibility` scanned a page whose title had not arrived.** After
    a client navigation the next page's `<title>` streams in with its
    metadata, which can land after its content. The fifth local run failed
    once in `organism-pages.spec.ts`: its trace shows the forms register's
    head without a title when the scan began, and with it 194 ms later. The
    scan now waits for a non-empty title. A page without one still fails, by
    name.

## Variants for the photographs already published

The owner chose this lever on 2026-09-24. It was applied to production the same
day with `scripts/backfill-media-variants.ts`.

- **Inventory**, read-only (`ove-469/media-variants-inventory.json`): 15 live,
  public photographs had no variants — the 13 on entry pages and two more. All
  were served, 93–453 kB, each row with its intrinsic size.
- **Apply** (`ove-469/media-variants-apply.json`): each variant was made the
  way the upload path makes one, in a browser (headless Chromium): the whole
  photograph drawn once, each variant drawn from it smoothed at "high", WebP at
  quality 85 (ADR-0022 D2).
  - 29 variants were written beside their primaries (14 at 1280, 15 at 480),
    none replacing an object.
  - Each row now records its variants, in one guarded statement. Every
    decoded size matched the row's.
  - All 29 answer 200 from `media.over.garden` with the bytes written.
- **What it buys:** the 480 variants weigh 493 kB together, against 2.62 MB for
  the primaries. The listings' small slots (224–336 px) now take those.
- **What it does not:** the feed's cover is 1,080 px, so it has only a 480
  variant, and a phone asks for about 663 px. It still takes the 94 kB
  original. A phone rung (720) is what would lighten the cover. The database
  allows only `{1280, 480}`, so that is a migration and a change to the upload
  path and the staging worker, not a backfill.

## Production with the variants

Read back on 2026-09-24, after the backfill, the same way as the baseline:
Lighthouse CLI 13.5.0, median of three, the same three pages
(`ove-469/lighthouse/production-after-variants*`). The text-only entry is the
control: it has no photograph, so nothing here changed it.

| Page | LCP applied | FCP applied | LCP simulated | Bytes transferred |
| --- | --- | --- | --- | --- |
| `/` | 5.73 → **5.32 s** | 2.87 → 2.87 s | 5.61 → 4.64 s | 2.17 → 1.28 MB |
| `/@yehor/post/9` (control) | 2.80 → 2.82 s | 2.80 → 2.82 s | 6.70 → 4.64 s | 1.06 → 1.06 MB |
| `/species/solanum-lycopersicum` | 5.16 → **5.09 s** | 2.92 → 2.94 s | 5.53 → 5.61 s | 1.45 → 1.24 MB |

- **All 15 public photographs are now sent with a `srcset`** on the 15 public
  pages that show them (`production-photographs-srcset-after-variants.json`).
  The first read after the backfill still found `/` and `/journals` without
  one: that read got the cached page and started its refresh, and the page
  served twenty seconds later had it.
- **The feed sends 41 % fewer bytes and paints its cover 0.4 s sooner.** The
  cover itself is unchanged: it is 1,080 px, so it has only a 480 variant, and
  a phone asks for 663 px. It is asked for at 0.69 s and finishes at 5.34 s.
  At 2.86 s seven photographs below the fold join it:
  - the five in the half- and third-width slots now weigh 26–50 kB each;
  - the two full-width cards still take their 1280 variants, 303 and 153 kB.
- **The model holds.** `applied-throttling-model.py`, given these weights,
  predicts the cover at 5.29 s against 5.32 s measured. With a phone rung
  (720 px: a cover of about 60 kB, full-width cards of 80–103 kB) it predicts
  4.03 s. It predicts 3.56 s with nothing below the fold before the paint as
  well, and 3.25 s with only the two normal faces preloaded on top of that.
- **The simulated figure is not read as a change.** It moved on the control
  too, by 2.1 s, and on `/` its three runs spread from 3.96 to 5.63 s.
- CLS is 0 on all three pages, as it was.

## What the owner decided

The owner chose, on 2026-09-24, to close this issue with the facts above rather
than hold it open for 2.0 s. Criterion 3 cannot be met by the levers this issue
lists, and the ones that could reach it change something that is not this
task's to change. They stay open as one decision, recorded as known gap 11 in
`docs/PROJECT_STATE.md`. A Linear card could not be created: the workspace is at
its free issue limit.

- **The photographs' weight.** Done for the existing ladder, above. A phone
  rung would lighten the cover itself and the full-width cards, to about 4.0 s
  by the model. It needs a migration.
- **The method.** Applied throttling shares the link per request, so a page's
  number of requests counts as much as its bytes, and a correct priority counts
  for nothing. Field data, or the simulated figure, would measure a different
  thing.
- **The budget.** For a page whose LCP is a photograph, and whose framework
  ships its script in seventeen requests, 2.0 s under applied slow 4G needs
  the script out of the first two seconds.
- **The fallback font.** A metric-matched fallback for Google Sans would let
  first paint come early without the 0.401 shift, which is what an inlined
  stylesheet needs.
