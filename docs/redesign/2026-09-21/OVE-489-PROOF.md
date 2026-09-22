# My garden as a collection — OVE-489

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- **`/garden` is a collection, not a dashboard** (OG-UX-006). It leads with
  three named actions — New entry (`/garden/new`), Add a plant or animal
  (`/garden/objects/new`), New space (`/garden/spaces/new`) — then one search
  over everything owned, listed as two groups: spaces and plants or animals.
  The "needs attention" block, the recent-events section, the inventory and
  spaces previews and the facts footer are gone with
  `garden-workspace-view.tsx`; the last entries and the inbox stay in the
  context rail.
- **No editor on a returning gardener's home.** The first-entry composer (a
  new plant and its first entry in one form) shows only for a garden with no
  plant or animal yet, or for a reader who came to create: an activation link
  (`?source=homepage|direct-garden|public-variety`), a catalogue pick
  (`?catalog=`) or a resumed sign-in (`authIntent=create_object|save`). A
  space's journal (`?space=`) keeps its entries and offers Write into the one
  composer with the space named instead of embedding an editor.
- **Two reads, settled apart** (criterion 5, ADR-0023).
  `server/garden-collection-repository.ts` has `listGardenSpaces` and
  `listGardenObjects`, each one transaction with a 1.2 s statement timeout, a
  count statement (matching and owned) and a page statement; the page settles
  each on its own (`surface: garden-home`, sections `spaces` / `objects`), and
  `loadGardenWorkspaceContext` settles the rail's two reads. A failed group
  shows its own retry beside the group that answered; a failure is never
  counted as nought, never reads as setup and never offers the first-entry
  composer.
- **Facts, never a diagnosis** (criterion 4, OG-UX-023). A row says kind ·
  space · organism (the destination picker's order and its canonical name) and
  "Останній запис: 3 тижні тому" — the observation date of the newest active
  entry, relative to today — or "Ще без записів". Nothing on the page infers a
  plant's state from how often it was written about.
- **Scale** (criteria 2 and 3, OG-UX-043). Six things or fewer are one list
  with no search. Beyond that: the search (object name, space, variety, the
  organism's canonical name and any of its catalogue names — "помідор" finds a
  cherry tomato whose species is Solanum lycopersicum), the modes (all / plants
  and animals / spaces, counts beside them), the order (recent entry first —
  what was written, never what was opened — or by name, ties broken by
  identity) and pages of 24 plants or animals; spaces show six beside them and
  "All spaces (n)". A page past the end shows the last page. Query, mode,
  order and page are the URL, the search is the shared `FilterBar` (a GET form
  on `/garden`), pages and modes are anchors.
- **Contextual Write** (criterion 2): every row's Write is
  `/garden/new?object|space={id}&returnTo=/garden?…#garden-object-{id}` — one
  activation to the one composer with that destination named; Close and
  Escape return to that row.
- **Setup** (criterion 3): an empty garden gets the Thiings "Plant Pot"
  (`first-garden` role), one sentence of what a garden is made of and the
  three ways to start, the fastest first ("Написати перший запис" → the
  first-entry composer below it).
- **Old entry points follow**: `create_entry` resumes on
  `/garden#garden-collection`; object and space setup return to
  `#garden-objects` / `#garden-spaces`; a community's "write first" links go
  to `/garden/new`; the rail's recent space entries open the space's journal
  instead of a dead `#space-…` anchor.
- **Zero is omitted** (DESIGN.md §5.10) from the modes, the counts sentence and
  the rail's inbox.
- **Owned pages stay My garden; reference links say what they open**
  (criterion 6). Every `/garden/**` address lights My garden in the rail and
  the tab bar (proved on an object page). The passport's catalogue link was a
  bare "Відкрити каталог" beside the gardener's own object; it is now the
  secondary action "{organism} у каталозі" ("Apis mellifera у каталозі") on the
  owner's and the public passport, and the collection shows the organism as
  plain secondary text, never a link. The Ukrainian "До моєї градини" (a
  Bulgarian word) is "До мого саду".
- DESIGN.md §5.13 states the rules; PROJECT_STATE records the change.

## Proof

`tests/garden-collection.spec.ts` (new, registered in
`scripts/browser-gate-specs.ts`), against `next start` and the local database:

1. **0 / 1 / 100 / 1000 objects.** 0: setup with the illustration, the first
   action anchored to the first-entry composer, no collection; axe clean.
   1 space, 0 plants: the space row and the composer. 1 plant: read whole —
   no search, the row carries its space and a `<time>`, Write names it; axe
   clean. 100 in 3 spaces: search, "Сторінка 1 з 5", 24 rows, the plant
   written about yesterday first; "Tomato" finds the three same-named
   tomatoes, each with a different space line. 1000 in 20 spaces:
   "Сторінка 1 з 42", "All spaces (20)"; "— 999" finds exactly the one object;
   All spaces lists 20 and hides the plants.
2. **Query → object → Back**: the object page keeps My garden current
   (`aria-current` on the rail item, none on Catalogue; the phone tab bar
   agrees, OG-UX-008); Back returns to `?q=— 999` with the field filled and
   the row in view.
3. **Contextual Write**: the Write link's name is "Записати: {name}"; reached
   by keyboard, one Enter opens `/garden/new?object=…` with the destination
   named and no picker; Cancel lands on `#garden-object-{id}` with the row in
   view.
4. **UK / BG / RU at 320, 390 and 1440 px**: no sideways scroll; axe WCAG 2.2
   AA clean at 320 and 1440 in all three.
5. **Every view is an address**: `?q=Tomato&sort=name`, `?page=2` and a stale
   `?page=9` (→ "Сторінка 5 з 5") by hard load; the search is `GET /garden`,
   pages and modes are anchors, Write is an anchor.
6. **The name order and the Spaces mode** survive reload.

**Partial failure** — `pnpm prove:garden-collection-partial-failure`,
run alone against `next start` (a lock on a shared table would stall the
gate's other worker): a second connection holds an ACCESS EXCLUSIVE lock on
`catalog_items`, which only the plants-and-animals read touches
(`ove-489/partial-failure-receipt.json`):

| Hard load | Plants group | Retry | Spaces listed meanwhile | Setup claimed | Composer offered | After retry |
| -- | -- | -- | -- | -- | -- | -- |
| 200 | `query_timeout` | `/garden#garden-objects` | 3 of 3 | no | no | 24 rows |

The rail's inbox read waited on the same lock and showed "—" (unknown), not
a nought.

**Hard-load bounded failure** — `pnpm prove:workspace-resilience` against a
`next start` whose database is a closed port, with a signed-in cookie: all 8
workspace surfaces, `garden-home` included, answered 200 with their own
heading, `data-section-failure="connection_unavailable"`, no stranded
skeleton and no errored boundary.

Unit: `(home)/page.test.tsx` (20: actions, identity, recency, rail, simple vs
searchable, address parsing, `returnTo`, no results, setup, first plant,
explicit create, wishlist is not create, each group failing alone, space
journal, guest, unsafe return path, all reads failing, session store down),
`components/garden/garden-collection.test.tsx` (7),
`lib/garden/garden-collection.test.ts` (4). The two new SQL statements were
executed against a local database with 20 spaces / 1000 objects before the
browser run: 3–19 ms per view; vernacular, space and escaped `%_\` queries.

Local gate against the production build: `garden-collection` 6/6; the full
list 221 passed, 1 skipped (no Catalogue of Life snapshot), and 2 that met
Better Auth's sign-up limit (429) passed alone (`owned-destinations` 2/2,
`static-documents` 18/18). `pnpm test`, lint and typecheck green.

### Screenshots (`docs/redesign/2026-09-21/ove-489/`)

`uk-1440-0-setup`, `uk-1440-1-one-object`, `uk-1440-2-hundred-search`
("Tomato": three tomatoes, three spaces), `uk-1440-3-thousand-search`
(one of 1000), `uk-1440-4-partial-failure`, `uk-1440-5-partial-failure-retried`,
`uk-390-hundred-search`, `bg-320-hundred-search`, `ru-1440-hundred-search`.

Existing specs updated to the new home: `garden-workspace` (setup instead of
"needs attention"), `redesign-fixtures` (1000 objects → the collection),
`site-shell` (the object list), `owned-destinations`, `redesign-baselines`,
`catalog-picker`, `catalog-full-catalogue` (the first-entry composer through
`?source=direct-garden` once the gardener has an object).

## Not claimed

No real screen-reader session (OVE-478). The space's own page is OVE-490; the
object page's editors, settings and provenance are OVE-491.
