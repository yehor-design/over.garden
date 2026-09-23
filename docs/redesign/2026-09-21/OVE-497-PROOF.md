# Organism, variety, breed and register pages — OVE-497

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- **The card leads with who the organism is** (criteria 1, 6; OG-UX-013;
  DESIGN.md §5.18; ADR-0026 D9 amended). The header of every species,
  variety, breed and form card (`app/catalog-evidence-route.tsx`), in order:
  - **Crumbs.** For a species: Каталог. For a form: Каталог › its species by
    the reader's name › Усі форми.
  - **The kind in plain words.** вид, сорт, порода або лінія, or шкідник /
    хвороба for an organism EPPO lists as one. "Публічний вид" and its kin
    are gone from the page.
  - **The heading** is the organism's own name in the reader's language when
    the catalogue holds one ("Помідор їстівний", capitalised as a heading),
    with the accepted name beneath it marked `lang="la"`.
    - Without a common name the heading is the accepted name, marked as
      Latin; it is never a blank.
    - A cultivar or a breed keeps its own name.
  - **The fact paragraph** (ADR-0026 D9). A form's species is named as the
    reader knows it, quoted: "сорт виду «помідор їстівний»". The same
    paragraph is now the page's meta description, replacing "Публічний вид:
    …".
  - **Counts only when there is something to count.** "0 записів · 0 фото"
    no longer sits under the paragraph that already says nobody has written.
  - **"Додати в мій сад"** for what a gardener can keep: a cultivar, a breed,
    a plant or an animal, and not a pest or a disease. It leads to object
    setup, which offers the gardener's own objects of that organism first
    (OVE-485). A fungus, a pest or a virus offers nothing. The secondary
    "До каталогу" button became the first crumb.
- **Three layers, each said for what it is** (criterion 3; OG-UX-033).
  - Gardeners' experience comes first, each entry leading to its source
    entry.
  - The editors' growing note follows it rather than preceding it, in its own
    section (`data-organism-section="editorial"`), labelled "Від редакції
    OverGarden" with its source.
  - The sources' facts close the card.
- **Forms are a dozen on the card and every one in the register view**
  (criteria 1, 2; OG-UX-013).
  - The card statement aggregates twelve forms, the written-about first, and
    counts all of them (`ORGANISM_CARD_FORM_PREVIEW`). It used to aggregate
    every form into the card's JSON (maize has 4,197).
  - The card says "Тут 12 з 621." and links "Усі форми (621)".
  - The register view (`/species/{species}/register`) lists every public form
    of the species:
    - headed "Сорти виду «…»" for a plant, "Породи виду «…»" for an animal and
      "Форми" otherwise;
    - with the total and the registered counts;
    - with each form's registration where it has one, and "Не в цих реєстрах"
      where it has none. Before, the heading read "621 сортів … у реєстрах"
      and claimed a register for every row.
  - **Search and pages.** A real `GET` search matches a word anywhere in a
    name (normalized, no wildcards, `?q=`), and pages hold 100 (`?page=`).
    Both live in the address, so the browser's own Back from a cultivar
    returns to the same search and page (the "stable return context").
  - **Indexing.** A searched or later page is `noindex, follow` from the
    proxy (`paginatedListingRobotsTag`), and the canonical is the first page
    of every form. Past the last page is the not-found page.
  - **Unchanged.** Every form keeps its canonical URL, and every row links to
    it.
  - **Stricter queries.** The hub's queries now exclude inactive and
    user-created forms, as the card's always did. The two counts agree for
    all 256 species with forms in the local catalogue (13,309 forms).
- **Names and sources in words** (criteria 3, 4; `lib/catalog/source-names.ts`).
  - A name no assertion backs appeared under the ingest's key
    (`ua_state_register`). It now appears under the source's own name
    ("Ukraine State Register of Plant Varieties"), or "Каталог OverGarden"
    for the species backbone and the catalogue's own seeds. Where that source
    also asserted something, the two groups are one.
  - An identifier shows its register or database by name ("Держреєстр
    України", "Catalogue of Life") and its number as printed (08040055, not
    RegisterVarietis:08040055).
  - A registration status is in words and its country in the reader's
    language ("зареєстровано (Україна)"). A name's language is a language
    ("(українська)").
  - The accepted-name disagreement, the presence badges with EPPO's verbatim
    wording, and the attribution stay as they were.
- **Nothing about indexing on a reader's page** (criterion 4; OG-UX-032).
  The only indexing control is the owner's own disclosure, rendered for the
  owner alone. No evidence threshold changed: a card built only from sources
  stays `noindex` (ADR-0026 D9), and the hub's decision is the one it had.
- **Images** (criterion 5). The card shows gardeners' photographs in their
  entries, with their alt text, and nothing else. The catalogue holds no
  reference photographs, none is invented, and no illustration stands in for
  an identification photograph.

## Proof

`tests/organism-pages.spec.ts` (new, in the gate) passes 8/8 against
`next start`. It writes its own organisms the way an import writes them:

- a species with 621 forms, one written about and one registered with a
  number and a status;
- a species with one form;
- a fungus with no forms and no common name;
- a bee species with a breed;
- the shared organism fixture: a species and a cultivar gardeners here
  published about, with an editors' note on the cultivar.

1. **621 forms, from the served bytes.** The page has:
   - the common-name heading, the Latin line and the kind;
   - no "Публічний" inside the card;
   - the fact paragraph as the meta description;
   - no zero counts, and "Додати в мій сад";
   - exactly twelve forms, the written-about one first, with "Тут 12 з 621."
     and "Усі форми (621)" linking to the register.
2. **The register by keyboard and Back.** The card's link reaches "Сорти
   виду «помідор ове»" with 621 in total, 100 rows and "Сторінка 1 з 7", axe
   clean. Then:
   - Focus the field, type «барао» and press Enter: one row, with
     "Держреєстр України: 9497…".
   - Into the form: its crumbs lead to the species and to all forms; its fact
     names "сорт виду «помідор ове»"; the sources show the register by name,
     the number as printed, "зареєстровано", "(Україна)", and no ingest key.
   - Back returns to `?q=барао` with the field still holding it. "Показати
     всі" leads to "Наступна сторінка", which shows "Сторінка 2 з 7" and 100
     rows.
3. **Indexing of views.** The first page carries no `noindex`. `?page=2` and
   `?q=…` answer `noindex, follow`. `?page=8` is the not-found page inside a
   `noindex, follow` response. A species with no forms has no register (404).
4. **One form and none.** The mint names its one form with "Усі форми (1)"
   and no "N з M". The fungus is headed by its accepted name as Latin, with
   no forms, no register link and no "Додати в мій сад".
5. **Breeds, and Bulgarian and Russian.**
   - The bee's register in Bulgarian: "Породи на вида „Apis oveum“" (the
     accepted name stands in for a missing Bulgarian name).
   - The tomato in Russian: "Сорта вида «помидор ове»", "Страница 1 из 7".
   - The bee's card in Bulgarian names its breed and "Всички форми (1)".
6. **Three layers.** On the published-about cultivar, the sections run
   experience, editorial, names and sources. The experience entries lead to
   their source entries. The editors' note says "Від редакції OverGarden"
   and carries no journal link.
7. **Before any script.** With JavaScript off the species card, a static
   document, shows its heading and the link to every form.
8. **axe** is clean on a species, a form and a register in UK, BG and RU at
   390 and 1280 px, with no sideways scroll.

`organism-card.spec.ts` 6/6, with ADR-0026 D9's order now including the
editorial section. `accessibility.spec.ts` 8/8. `catalog-addresses`,
`catalog` 8/8 and `catalog-door` 9/9. One `catalog.spec.ts` test took the
organism links it follows from `/catalog`, which since `OVE-496` is the door
and links only what gardeners wrote about. It now takes them from the
register (`?kingdom=plantae`), where every plant is.

Unit tests:
- the card: the common-name heading and Latin line, the kind, "Додати в мій
  сад", for a species, a breed and a variety;
- the register: headings by kingdom, the total, "Не в цих реєстрах", the
  search form in the address, page links keeping the search, "nothing found"
  with the way back;
- the card statement: a fallback name folded into its source's group;
- the robots rule for the register's views.

The full unit suite (4,611 passed, 29 skipped), the banned-dependency, icon,
design-token, component, browser-spec, settled-read and address guards, the
type check and lint pass. The whole browser gate ran on the production build:
338 passed, 1 skipped, none failed.

### On real data

Run against the local catalogue (the full 2026-09 import):

| Read | Result | Time |
|---|---|---|
| The card statement for maize | 4,197 forms counted, twelve aggregated | 128 ms |
| Maize's common name | кукурудза звичайна / царевица / кукуруза | 3 ms |
| Register, page 1 of 42 | 100 rows, 4,019 in the UA register, 178 in the EU catalogue | 29 ms |
| Register, page 42 | 97 rows | 163 ms |
| Register, «ДЕ» | normalized to «де», 29 forms | 12 ms |
| Register, page 43 | empty, so the route answers not found | — |

## Left as it is

- The register view is request-time, as before. Its answer streams behind
  its loading boundary, so "past the last page" is the not-found page in a
  response that has already begun (200), kept out of the index by the proxy's
  header. The species and form cards are static documents.
- Pests' host lists and hosts' pest lists are still listed whole. Forms were
  the list that ran to thousands.
- The page title still reads "{name} · вид | OverGarden".
