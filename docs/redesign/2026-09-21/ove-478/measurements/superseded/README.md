# The before/after runs that were superseded

The first pair was measured on 2026-09-24 between 11:43 and 12:04 UTC, both
builds made at 11:38 against the same database: `main` (`local-before`) and
the candidate's first build (`local-after`). That build had
`src/app/global-error.tsx` import `globals.css`. The bundler then merged the
fonts' stylesheet (3.7 kB) and the app's (17.0 kB) into one 20.5 kB file for
every page, and first contentful paint under applied throttling moved 0.2–0.35
s later on every page measured. These four files are that pair's summaries,
with every sample's figures. Their gzipped Lighthouse reports, which the
summaries still name, were not kept. The entry and the organism card they name
are the production-weight fixture as it was seeded then; it was seeded again
before the pair in `..`, under new addresses.

The import was removed and the candidate rebuilt. Two runs of the rebuilt
candidate were discarded. The first, between 12:27 and 12:37 UTC, measured
pages its build had just prerendered, which sent the fonts' `Link:
rel=preload` header: the fonts were requested with the document. Whether a
page sends it depends on when its cached render was made, not on the build,
and the `main` run had not been measured in a known state of it. Its three
applied reports of the feed are kept
(`discarded-run/`), because they name the cause of the feed's 0.1130: a
photographed card moved when two Google Sans files arrived
(`../first-paint/README.md`, residual 11). The second, between 12:43 and
12:53, ran after a screen-reader session had published an entry, so its
listings were not the ones `main` had been measured with; it was not kept.

A later pair, measured on the final builds between 17:05 and 17:25 UTC, was
discarded as well and not kept. It matched side for side, but by then the
screen-reader sessions had published nine text entries into the same
database, and the feed and `/journals` led with those instead of the fixture's
photographs: the listings no longer weighed what production's do. The fixture
was seeded again (`pnpm fixture:production-weight`), and the pair in `..` was
measured on it, back to back on one database state (`OVE-478-PROOF.md`,
criterion 15).
