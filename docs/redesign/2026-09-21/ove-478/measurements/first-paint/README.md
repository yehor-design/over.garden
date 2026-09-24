# Why first paint moved, and what it bought

Under applied throttling, the candidate's first contentful paint is later than
`main`'s on three of the four pages measured, and the same on the fourth
(Lighthouse medians, `../lighthouse/local-{before,after}.json`, measured on
2026-09-24 between 17:36 and 17:58 UTC): the feed 1.71 → 1.86 s, `/journals`
1.73 → 1.90 s, an entry 1.74 → 1.94 s, the organism card 2.26 → 2.26 s. This
directory holds what that difference is, and the evidence (`results.json`).

## What `main` does differently

Every icon on `main` carries `width="var(--size-icon-md)"` and the same
`height`. Chromium 141 does not parse a `var()` in an SVG presentation
attribute, and logs one console error per attribute:
`Error: <svg> attribute width: Expected length, "var(--size-icon-md)"`. That is
58 to 90 errors per page on `main` (the feed 80, `/journals` 90, an entry 78,
the organism card 58) and none on the candidate, which writes the pixel value
on the SVG and the token in `data-og-icon-size` (`interface-icon.tsx`).

## What that does to first paint

With DevTools attached, as Lighthouse and Playwright attach it, each of those
errors costs the HTML parser time. The parser yields to render earlier on
`main`, and the first frame holds less of the page: on `/journals`, 168–221
elements and no entry card on `main`, 357–400 elements and five to seven cards
on the candidate. Laying out the larger frame takes longer: the trace's first
real layout is 103–113 objects in 89–91 ms on `main`, 183–267 objects in
170–213 ms on the candidate (CPU slowed four times). These frames were counted
at 13:10 UTC, on the fixture as it was first seeded (`results.json`,
`firstFrame`). What a browser does with no DevTools attached was not measured.

## The evidence that this is the cause

A local proxy served four variants of the same two pages, each through the
same path (the HTML buffered, rewritten or not, and gzipped the same way).
Eight rounds, the four variants in turn, the order reversed every other round,
at Lighthouse's applied mobile throttling set over CDP. Medians, in ms:

| Page | `main` | candidate | candidate with `main`'s icon attributes | `main` with the candidate's icon attributes |
| --- | ---: | ---: | ---: | ---: |
| `/journals`, FCP | 1740 | 1902 | 1730 | 1908 |
| `/`, FCP | 1848 | 1904 | 1730 | 1902 |

First paint follows the icon attributes and nothing else in the change: put
`main`'s invalid attributes into the candidate and it paints as early as
`main`; give `main` valid ones and it paints as late as the candidate.

## What the earlier first paint on `main` cost

The frame `main` paints early is a partial shell, and the rest of the page then
moves into it. Cumulative layout shift under applied throttling, every sample
of the pair (`results.json`, `lighthouseApplied`):

| Page | `main` | candidate |
| --- | --- | --- |
| `/` | 0.0264, 0.0002, 0.2013 | 0.0002 × 3 |
| `/journals` | 0.0004, 0.1581, 0.1254 | 0.0004 × 3 |
| an entry | 0.2914, 0.1485, 0.3009 | 0.0003 × 3 |
| the organism card | 0 × 3 | 0.0001, 0.0000, 0.0001 |

Six of `main`'s twelve samples have the shell's content moving as the rest of
the page arrives (`div.site-shell-content-safe-bottom`, 0.10–0.29, with no
cause Lighthouse can name), and in a seventh the header's logo link moved
(0.0264). No sample of the candidate's scores above 0.0004: what is left is
the consent notice's link, moved when Google Sans arrives (0.0001–0.0003), as
on `main`.

**The feed's web font.** The feed's cards are laid out in the Arial fallback
until Google Sans arrives, and differently after it: at Lighthouse's 412 px,
each photographed card is 22 px taller in Google Sans, and the first card's
photograph sits 22 px lower (measured on the candidate with the font files
blocked and allowed). Next has no metric table for Google Sans, so the
fallback's metrics are not adjusted (`fonts.ts`). In the first pair, on the
fixture as it was first seeded, the candidate's feed measured 0.1130 in every
sample (`../superseded/lighthouse/local-after.json`); a later run of the same
page named the two Google Sans files as that shift's cause
(`../superseded/discarded-run/`), and OVE-468 recorded it as 0.118 on this
fixture. In this pair, on the fixture seeded
afresh, no card moved on either side. The cause is in both builds and
unchanged by this one; it is recorded as a residual.

## Largest contentful paint

The element is the same on both sides in every sample: a photograph on the
feed, an entry and the organism card, and an entry card's excerpt on
`/journals`. Medians: the feed 3.43 → 3.55 s, `/journals` 1.73 →
1.90 s, an entry 2.76 → 2.76 s, the organism card 2.86 → 2.85 s.

- **`/journals`** paints its excerpt in the first frame on both sides (LCP
  equals FCP in every sample), so it moves with first paint.
- **The feed's photograph** is requested at 0.64 s on both sides, behind the
  same requests: 529 kB of other transfers overlap its download on `main` and
  530 kB on the candidate (the second sample of each, from the reports'
  network records). Its download took 2.70–2.86 s on `main` and 2.80–2.90 s on
  the candidate; the 0.14 s between the medians is less than the 0.16 s spread
  of `main`'s own three samples.

These are local numbers in one lab, with DevTools attached. They say nothing
about production (`OVE-478-PROOF.md`, criterion 15).
