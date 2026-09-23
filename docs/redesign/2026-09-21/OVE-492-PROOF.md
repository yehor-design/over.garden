# The feed's cards and its discovery bar — OVE-492

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- **`EntryCard` reads who, where, what** (criterion 1, OG-UX-014). One card
  serves the feed, `/feed`, `/journals`, a community and a profile. Its order:
  1. the author's avatar and name, then the date;
  2. the object, its kind and a coarse region;
  3. the title and the excerpt;
  4. the photographs;
  5. the topics, then the actions.

  A screen reader meets the same order. An entry without a public author
  starts at the date: the card never invents a person, and an editorial item
  is not given one. The avatar is hidden from assistive technology, since the
  name beside it says who it is. The link reads "Автор Олена" rather than
  "ОАвторОлена".
- **One meaning for a date** (criterion 3, OG-UX-016;
  `lib/entry-card-dates.ts`).
  - A card is dated by the observation, the entry's own date.
  - When the entry was published on another day, the card names that too
    ("Опубліковано 12 вер. 2026 р." / "Публикувано …" / "Опубликовано …").
    The feed orders by publication, and a backdated entry otherwise looks
    misplaced.
  - Before this change the feed and `/feed` showed publication while
    `/journals` showed observation, and nothing told them apart.
  - A `date` column is read by its local calendar parts, because
    node-postgres builds it at local midnight. It was proven in four time
    zones; `toISOString()` names the day before east of Greenwich.
- **Photographs at their own shape, or not at all** (criterion 5,
  OG-UX-041).
  - One photograph keeps its proportions, clamped between 4:5 and 16:9, and
    stands no taller than 32 rem. Its box is reserved from its intrinsic
    size, so a late photograph shifts nothing.
  - Two or three sit side by side as squares cropped at their focal points.
  - A text note draws no box: the grey 4:3 box with an icon is gone.
  - The first photograph of the first photographed card is still asked for
    at once. The rest wait.
  - `alt` stays the gardener's own description, never the title again
    (OG-UX-029, `publicCardMediaAltText`).
- **Read more, by name.** It appears only when the excerpt stopped short of
  the entry (`excerptTruncated` from both repositories). Its accessible name
  is the link's own words plus the title ("Читати далі Довгий огляд …"),
  built by `aria-labelledby`. No link sits inside another.
- **`lang` on the gardener's words only** (criterion 6, OG-UX-030). The title
  and excerpt carry the entry's language; the dates and the byline keep the
  page's. `/feed` now reads each entry's `source_language`, which it did not
  before.
- **One discovery bar** (criteria 2 and 4, OG-UX-015; DESIGN.md §5.1).
  - The feed's modes are **Latest** (`/`) and **Following** (`/feed`), as
    links. Following is offered to every reader: `/feed` shows a guest the
    public feed and what signing in adds, so the static home never asks who
    is reading.
  - Plants or animals and the trusted topics are facets behind one "Filters"
    button. Active filters are removable chips.
  - The two rows of toggle chips above the first card are gone.
  - The `plants` and `animals` system topics, which are the kind again, are
    no longer offered as topics in the feed, its rail or the directory. The
    one in the URL is still shown, so it can be removed.
  - `/feed` uses the same bar, with its own facets (source, plants or
    animals).
- **Entries are called entries** (OG-UX-010). The directory's results are
  "Знайдені записи" / "Намерени записи" / "Найденные записи", not "found
  journals". Its intro says a record is one dated entry and a plant's or
  animal's whole history is on its own page.
- **Also**:
  - `DESIGN.md` §5.14 records the card.
  - `PROJECT_STATE.md` and the `ROUTE_OWNERSHIP.md` rows are updated.
  - The static-documents check reads the bar's own `data-filter-bar-active`
    count instead of the retired toggle chips.

## Proof

`tests/public-feed-cards.spec.ts` (new, registered in
`scripts/browser-gate-specs.ts`), against `next start` and the local
database. The fixture, built through SQL, has five entries of one gardener:
three photographs of different shapes, a long entry, a text note, a backdated
entry and a Bulgarian entry. One entry published through the real ingress
expires the feed's cached reads. All 7 tests pass:

1. **Reading order at 1440 and 390:**
   - the first card's author is on the first screen;
   - in the photographed card, byline < object < title < photographs;
   - three images, the first named by its description;
   - no sideways scroll, axe clean.
2. **Late photographs** (every image delayed 2.5 s): the card's height and
   position are identical before and after they load, and nothing spills out
   of it.
3. **Backdated entry, UK/BG/RU:**
   - the byline has two `<time>`s; the observation is more than 100 days old;
   - the second `<time>` names publication in each language;
   - a same-day entry has one date;
   - `/journals?q=…` shows the same observation date and the same
     publication phrase.
4. **Text note and Read more** (390):
   - the text note has no photograph box and is under 300 px tall;
   - "Читати далі {title}" follows the title in Tab order;
   - Enter opens the entry, and Back returns to `?kind=plant` with the card in
     view.
5. **Language:** the Bulgarian entry's `[lang="bg"]` holds its title and no
   `<time>` and no byline; the dates read in Ukrainian.
6. **The bar at 1440 and 390:**
   - Latest is `aria-current`, and Following links `/feed`;
   - no plants chip on the first screen, axe clean;
   - Filters opens the panel, where choosing a kind is a draft until "Показати
     результати", which then lands on `/?kind=animal`;
   - the chip removes it;
   - Following and back to Latest.
7. **With scripts off, on the static `/`:**
   - the card reads in order;
   - Following is a real link;
   - Filters opens the native popover and the GET form lands on
     `?kind=animal`.

   A filtered view is a query twin that streams and needs scripts to reveal
   it (ADR-0032). That was true before this change: the old chip rows sat in
   the same streamed segment.

The whole local gate: 255 passed and 1 skipped. The 1 failure was Better
Auth's sign-up limit (429), and `owned-destinations` passed alone (2/2). On
the final build, after topic filtering and the directory's wording, these
were rerun green: `public-feed-cards` 7/7, `journals-directory` 7/7,
`static-documents` 18/18, `communities` 8/8.

Unit:
- `entry-card.test.tsx` (12): order; no invented author; `lang` scope; Read
  more's name; bounded ratios (portrait clamped to 4:5, landscape to 16:9);
  no box for text; at most three photographs.
- `entry-card-dates.test.ts` (4, also run under Kyiv, UTC, Los Angeles and
  Tokyo).
- `public-home-feed.test.tsx` (18): srcset kept, no box for text, the order,
  the backdated dates and Read more, the bar, Following for everyone, kind
  topics not offered twice, the skeleton.
- `public-journal-directory.test.tsx`, `(default)/page.test.tsx` and
  `[locale]/feed/page.test.tsx`: the bar for a guest and a gardener.

### Screenshots (`docs/redesign/2026-09-21/ove-492/`)

`feed-uk-1440-first-card`, `feed-uk-390-first-card`, `feed-uk-390-read-more`.

## Not claimed

- **The news-article merge and its cursor** (OVE-382). The card's no-author
  shape is ready for an editorial item, but no mixed feed exists yet.
- **Ranking or personalisation.** Latest is by publication and Following is
  the existing followed feed; neither is new.
- **A real screen-reader session** (OVE-478). The language scoping is
  asserted in the DOM, not heard.
