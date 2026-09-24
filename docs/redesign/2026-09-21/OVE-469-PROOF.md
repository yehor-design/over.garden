# LCP ≤ 2.0 s on production data — OVE-469, first slice

The exact tested and merged commits, CI runs and the production checks are in
the authenticated Linear receipt. This slice delivers criteria 1, 2 and 5 and
the measurements that decide criterion 3. Criterion 3 — LCP ≤ 2.0 s and FCP
≤ 1.5 s applied, on production — is **not met**, and this document says why
with numbers, because the answer is a decision for the owner, not a lever.

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

## What this slice ships

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

## What needs the owner

Criterion 3 cannot be met by the levers this issue lists, and the ones that
could reach it change something that is not this task's to change:

- **The photographs' weight.** Variants for the 13 photographs, possibly with a
  phone-sized rung, would be browser-made WebP within ADR-0022 D2. It is a
  production write: new objects in R2 and variant columns on 13 rows. By the
  model it takes `/` from 5.6 s toward 4 s, not to 2.0 s.
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
