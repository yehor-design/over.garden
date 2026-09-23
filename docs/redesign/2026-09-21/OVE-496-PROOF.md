# The catalogue's door — OVE-496

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- **`/catalog` opens on a door, not on page one of its register**
  (criteria 1–3; OG-UX-012; DESIGN.md §5.17). The unfiltered address, in
  every language, renders `components/public/public-catalog-door.tsx`, a
  static document like the page it replaces. In order:
  - **A search with its scope said out loud.** "Що шукаєте": Рослини (chosen
    until the reader says otherwise), Тварини or Усе, then the name, common or
    scientific. It is a real `GET` form (`role="search"`) to the register,
    whose kingdom mode shows the same choice, so a search widens where it
    answered.
  - **What gardeners here wrote about**, up to twelve
    (`readCatalogFirstHandOrganisms`: the register's own `grown=1` view,
    the most recently first written about first), with how many there are
    and a link to all of them. With none it says so. Nothing on the door
    claims popularity or evidence it does not have (ADR-0026 D9).
  - **Species, form and your own object**, one sentence each, as a
    definition list a reader can skip.
  - **The register hubs**, the crops with registered varieties.
  - **The whole register**: every kingdom with its count, and the alphabet.
    There is no "all letters" on the door, because the door is all of them.
  - Each of the four reads is settled on its own. At request time a failed
    one hides its section and the page says part of the catalogue could not
    be shown; the search reads nothing and is always there. In the static
    render a failed read defers instead of caching a degraded document, as
    before. The loading fallback is the door with its sections held.
  - **No context rail.** The kingdoms and register hubs a rail would carry
    are sections of the door; at 1280 px the same choice appeared as a scope,
    a rail and a section at once (OG-UX-015).
- **The register behind it keeps everything it had** (criteria 1, 5, 6). Any
  filter, letter, sort or search is the register, rendered at request time
  through the `/q/catalog` twin exactly as before, with the one `FilterBar`
  (search, kingdom modes, rank, register and first-hand filters, sort,
  chips), pagination and the alphabet. Its breadcrumb leads back to the door.
  Its canonical, `noindex` past page one and the 404 past the last page are
  unchanged. The register has no unfiltered page one: removing its last
  filter is the door.
- **A search finds names the way they are stored** (criteria 5, 6). The
  listing lower-cased the query and nothing else, while every stored name is
  `catalog_normalize_name`'s output, so a typographic apostrophe, ё or ґ typed
  one way found nothing stored the other. The prefix now goes through
  `normalizeCatalogName` (the SQL function's mirror, held to the shared
  fixture), loses `%` and `_` so it can never widen into a wildcard, and keeps
  the 120-character bound (`normalizedSearchPrefix`).
- **An exact name outranks the alphabet** (criteria 2, 3). With a query the
  register orders an exact normalized name (the organism's or any of its
  names) first, then species before their forms, then what was written
  about, then the chosen sort. "м'ята перцева" is the species, not the first
  of its sixty cultivars.
- **A form names its species** (criterion 2). A cultivar, variety,
  subspecies or breed row says "Сорт виду «м'ята перцева»" from its
  `form_of` relation (`catalogSpeciesNameSql`), in the reader's language when
  the catalogue has it. "4217" on its own told a reader nothing.
- **Add to my garden, where the reader keeps it already** (criterion 4). A
  plant or animal row offers "Додати в мій сад":
  `/garden/objects/new?catalog=<slug>` (`rel="nofollow"`), which is object
  setup (OVE-485). It offers the reader's own objects of that organism first,
  each a link to write about it, and "add another" continues into
  progressive setup. A fungus or a virus offers nothing. The organism card
  stays the reference page.
- **An empty search among plants says where it would find something**
  (criterion 6): "Шукати в усьому каталозі (1)", counted from the kingdom
  facet, which ignores the kingdom filter. It used to offer only a reset.
- **Every catalogue read runs with JIT off** (criterion 5; `withoutJit`,
  `set local jit = off` in the read's own transaction). The planner prices a
  name search far above what it costs, so Postgres compiled it. See the
  measurements below: in production a search for «томат» took 1,188 ms with
  JIT and 189 ms without.
- **Links from the door into the register are document navigations**
  (`DocumentLink` in `components/ui/link.tsx`; context rail items can be
  `document`). The register is the door's `/q` twin. While a link's route
  tree has not arrived, Next 16.2 predicts one from the same path without its
  query (`deprecated_requestOptimisticRouteCacheEntry`), which here is the
  door itself. The door's page needs no request, so none was made and only
  the URL changed. With the prefetch held for three seconds, as on a slow
  phone, that happened on every click. From one register view to another the
  server's answer corrects the tree, so those links stay client navigations.
  The rule is written down in `lib/public-query-twin.ts`, and DESIGN.md §5.1
  already had it for `FilterBar`.
- **The Knowledge page's way into the catalogue says what the door does**:
  "Знайдіть рослину чи тварину — за звичною чи науковою назвою"
  (`catalog-front-door.tsx`), rather than describing a register by kingdom
  and letter.
- The catalogue rail's counts are in the reader's number format (they read
  "65832").

No second search service, no taxonomy download, no new route and no schema
change. The typeahead (ADR-0026 D7), the organism addresses and the indexing
decisions are untouched.

## Proof

`tests/catalog-door.spec.ts` (new, registered in the gate after
`catalog.spec.ts`) passes 9/9 against `next start`. It writes its own
organisms into the local database the way an import does: two mints with
Ukrainian, Bulgarian and Russian names, a cultivar of each (one called
"4217…"), a honey bee, a chanterelle with a Russian name spelled with ё, and
sixty-one numbered cultivars. One mint is marked written about. The door is a
static document cached for days, so the spec tells it the catalogue changed
the way production does — a card intent, drained by the cron route — and
reads it until it says so.

1. **The door.** Heading, "Рослини" checked, the spearmint and not the
   peppermint under what gardeners wrote about, the three legend terms,
   kingdom and letter links into the register, no context rail at 1280 px,
   axe clean.
2. **On a slow connection.** With every register prefetch held for three
   seconds, a letter and a kingdom on the door land on the register: its
   heading, the chosen letter marked current, rows shown; the plants view.
   Against the previous build, where they were client links, the same test
   failed as a reader would see it: the door's heading at `?letter=m`.
3. **Common names typed any way.** "м’ята" with a typographic apostrophe
   finds both mints stored with a straight one, each naming its species. "м'ята
   перцева" puts the peppermint first and not the spearmint. "Mentha spi"
   finds the spearmint.
4. **A numbered cultivar** says "Сорт виду «м'ята перцева»", and offers
   object setup for itself.
5. **Nothing among plants.** The bee searched among plants: no rows, "Шукати в
   усьому каталозі (1)", which finds it. The chanterelle, in Russian with е
   and with ё, is found and offered to nobody's garden.
6. **Bulgarian and Russian, and a second page.** In each, a common name
   ("джоджен"; "мята", which answers with both mints, each naming its
   species), a scientific one ("Mentha pip", "Mentha spi"), and the bee
   searched among plants: no rows, "Търсене в целия каталог (1)" / "Искать во
   всём каталоге (1)", which finds it. "Перцева ове" shows 60 of 61 and
   "Наступна сторінка" shows the last.
7. **Before any script.** With JavaScript off the door's form is on the
   screen. Submitting it asks with `kingdom=plantae`, and the answer is in
   the served document (a streamed twin segment, per the owner's decision of
   2026-09-04).
8. **From the catalogue to a garden**, as a member signed in through the
   screen. For the spearmint they keep, object setup offers "Моя м'ята"
   first, linked to write about it, and following it opens that object. For
   the cultivar they do not keep, setup continues from the space step, and the
   database holds one new object in that space with that organism, variety
   selected.
9. **axe** is clean on the door and a result list in UK, BG and RU at 320
   and 1280 px, with no sideways scroll.

`tests/catalog.spec.ts` 8/8, now with the door's own `GET` form, the
register's form, the door's 27-item alphabet and the register's 28 after a
keyboard press. `tests/static-documents.spec.ts` 18/18: `/catalog` is still a
static document with visible content and no scripts needed, in all three
languages, and a query still reaches the twin.

Unit tests:
- the door: the search and its scope, first-hand only and counted, the legend,
  the register one step away, a partial state that keeps the search, three
  languages, and no context rail;
- the page: the door for an unfiltered request, a partial door, every one of
  the door's four reads and the register's three deferring a static render
  instead of caching a degraded one, the recoverable error at request time,
  and 404 past the last page;
- the register row: the species of a form, "Add to my garden" for plants and
  animals only, the search everywhere, the breadcrumb to the door;
- the search prefix: the stored form for apostrophes, ё, ґ and accents; no
  wildcard; the 120-character bound;
- `DocumentLink`: a real link with `Link`'s look, focusable, with nothing of
  the client router on it;
- the Knowledge card: the door's words, linking to `/catalog`.

The full unit suite (4,603 passed, 29 skipped), the banned-dependency, icon,
design-token, component, browser-spec, settled-read and address guards, the
type check and lint pass.

The whole browser gate ran on the production build: 329 passed, 1 skipped.
The one failure was `object-setup.spec.ts` being refused sign-up by Better
Auth's rate limit (429 four times in the synthetic-gardener helper), a limit
of the run rather than the page; alone it passes 5/5. The door's rail and the
Knowledge card changed after that run, so every spec that visits the door or
Knowledge ran again on the final build and passed: `catalog-door` 9,
`catalog` 8, `static-documents` 18, `site-shell` 9, `editorial-surfaces` 6,
`mobile-shell` 23, `public-hydration` 7, `analytics-consent` 5 and
`accessibility` 8.

### What JIT cost

`ove-496/performance.json` holds both runs. The reads are the repository's own
functions: "on" rewrites the repository's `set local jit = off` on the wire
and nothing else differs.

| Read | Local, JIT on | Local, JIT off | Production, JIT on | Production, JIT off |
|---|---|---|---|---|
| Search «томат», plants | 551 ms | 33 ms | 1,188 ms | 189 ms |
| Search «м'ята», everything | 455 ms | 31 ms | 334 ms | 238 ms |
| Facets for «томат» in plants | 297 ms | 24 ms | 712 ms | 430 ms |
| Unfiltered facets (the door) | 56 ms | 57 ms | no JIT | no JIT |
| A kingdom, a letter, first-hand, kingdoms | ±5 ms | | not measured | |

- **Local:** 95,863 addressable organisms (119,412 rows); wall time, a fresh
  pool per mode, the median of five after a first run.
- **Production** is a DigitalOcean managed cluster: PostgreSQL 18.6,
  `jit = on`, `jit_above_cost` 100,000, 114,669 catalogue rows. The same
  statements ran as `EXPLAIN (ANALYZE)`, each in a read-only transaction with
  a 15-second statement timeout, after one warm-up pass; the figures are
  planning plus execution. The connection came from the production
  environment file, not `vercel env run`, and the probe refused a loopback
  host. No probe session was left open, and the environment file was deleted
  afterwards. The count behind the tomato search took 933 ms with JIT and
  58 ms without.

## Left as it is

- The register's answer is request-time content in the twin, streamed into
  a segment that takes the runtime to reveal (ADR-0032 D5; the owner's
  standing decision of 2026-09-04). Without scripts the door is fully
  visible and its form works; the answer arrives in the served bytes, not on
  the screen.
- `?page=2` with no other filter is still a register page, and its page one
  is the door. Nothing on the site links there.
- `/catalog` stays a static document. Its LCP budget belongs to the
  static-documents work (ADR-0032 D8) and was not re-measured here.
- No production data was written: the member flows ran against the local
  database, and the production checks are reads.
