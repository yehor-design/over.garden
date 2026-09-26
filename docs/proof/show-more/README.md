# «Показати ще» — receipts (`OVE-518`, 2026-09-26)

**Lighthouse** (`pnpm measure:lighthouse`, CLI 13.5.0, default mobile emulation,
three runs per page with throttling applied — the gate's method — and three
simulated; medians). Both builds were measured the same day, on the same
machine, against the same local database: the production-weight fixture
(`pnpm fixture:production-weight`, a 94 kB cover first) plus 24 older
photographed entries, with the photographs served from a local static server.
`main` (`f2f460ee`) reads the feed in portions of eight; this branch in
portions of twenty.

| Page | LCP, eight (main) | LCP, twenty (this branch) | Simulated, eight → twenty |
| --- | ---: | ---: | ---: |
| `/` | 2 799 ms | 2 587 ms | 4 804 → 4 800 ms |
| `/feed` | 3 460 ms | 3 345 ms | 4 655 → 5 027 ms |

In every run the LCP element is the first card's photograph, and its load is
the LCP (2.0–3.1 s of load time; the render delay went from 5–7 ms to 25–26 ms
with the longer portion). Twenty cards do not move the budget; neither build
meets DESIGN.md §9's 2.0 s on production-weight photographs, which is the open
photograph-load gap (`OVE-469`), not this change. Script bytes: 284 523 →
285 953 (+1.4 kB). CLS 0.111 on `/` and 0.089 on `/feed` are the same before
and after.

The samples are `lighthouse-before-8-photographs.json` and
`lighthouse-after-20-photographs.json`; the text-only pair
(`lighthouse-before-8.json`, `lighthouse-after-20.json`) was taken first,
before the local media store served the photographs, and is kept because it
isolates the documents: 1 832 → 1 925 ms on `/`, 1 786 → 1 789 ms on `/feed`.

Screenshots: `home-loading-390.png` (the link in place, busy, while the next
portion is fetched) and `home-appended-390.png` (the portion appended across
the boundary).
