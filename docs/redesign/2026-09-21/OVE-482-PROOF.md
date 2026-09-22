# Discovery search and filters — OVE-482

Baseline: `c098bd28` (main). Exact tested/merged identities, CI and production
verification belong to the authenticated Linear receipt.

## What changed

`components/ui/filter-bar.tsx` is the one discovery bar of `/journals`,
`/catalog`, `/communities/{slug}` and `/knowledge`, in three tiers
(DESIGN.md §5.1):

| Tier | Before | After |
| --- | --- | --- |
| Search | caller's field, one of six equal controls | the widest control, scoped to the listing |
| Primary mode | a select among the facets (`kind`, `kingdom`) | plain links with `aria-current="page"`, in one place, wrapping rather than scrolling |
| Secondary facets | inline selects on desktop that applied on change; below `lg` a base-ui sheet **portalled outside the form**, so its Apply submitted nothing and its close button was named "Скинути" | one "Filters (n)" button at every width, n = applied secondary facets; a native `popover` panel (bottom sheet below `lg`, side panel above) labelled by its heading |

The panel is a draft. "Show results" applies; Close (named Close in UK/BG/RU,
`popovertargetaction="hide"`), Escape and light dismiss discard the draft by
restoring every control to its committed value. "Clear filters" drops the
secondary facets and keeps query, mode and sort. "Clear all" beside the chips
remains the full reset. The journals empty result offers Clear filters when a
secondary filter is on, so the typed query survives.

No-JavaScript: two sibling GET forms. The bar form carries search, sort, mode
and committed facets as hidden fields; the panel form (controls associated by
the `form` attribute) carries draft facets plus committed query, mode and sort.
`popovertarget` opens the panel with scripts off.

Hydrated: every change navigates the document for listings with `/q` twins
(journals, catalog, and now communities and knowledge, which previously used a
client push into a twin boundary), and shows a pending status while it travels.
URLs keep the ADR-0032 vocabulary; no static page reads `searchParams`.

Shared words live in `lib/filter-bar-copy.ts` (UK/BG/RU): Close, Show results,
Clear filters, pending, modes label, panel description, `Filters (n)`.

## Proof

- Unit: `filter-bar.test.tsx` (12) — popover wiring, Close name, draft discard
  on toggle, panel form association and carried query, Show results, sort on
  change, document navigation, multi-select repetition, modes semantics, no
  Filters button without secondary facets. Listing render tests updated.
- Browser (`journals-directory.spec.ts`, registered): keyboard mode → panel →
  Show results → sort; URL survives reload and Back with the query kept;
  Close discards the draft, focus returns to the trigger, Escape likewise;
  Clear filters keeps `q`; scripts-off panel opens and applies; 375 px sheet is
  full width and bottom-anchored with named Close/Show results; axe clean at
  375 and 1440 px, filtered and unfiltered.
- `catalog.spec.ts`, `communities.spec.ts`, `static-documents.spec.ts` now assert
  the mode as the served current link; `redesign-baselines.spec.ts` asserts the
  Close name with its expected-failure annotation removed.
- Full local browser gate on a fresh `ove482_gates` database before the final
  locator updates: 195 passed, 1 existing skip, 4 failures, all four stale
  assertions of the old contract, each rerun green after the update.
- Manual (in-app browser, production build): UK 1440 px panel; BG 375 px catalog
  with modes wrapping, `Филтри (1)`, bottom sheet with Close, Clear filters and
  Show results.

## Not claimed

A `/q` twin still streams its results, so a scripts-off reader sees the served
query view only where OVE-461's reveal applies; the panel mechanism itself is
proven from the static document. No real screen-reader session was run for this
task; OVE-478 owns the integrated AT transcript.
