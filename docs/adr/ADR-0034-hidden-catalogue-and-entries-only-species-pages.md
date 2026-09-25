# ADR-0034 — The catalogue is hidden, a species page is its entries, and the menu keeps only what gardeners use

- **Status:** Accepted (decisions 2026-09-25, SDD Slice 29 pieces 1, 6 and 9,
  approved piece by piece by the owner). Recorded by `OVE-511` (29.01).
  Implemented by `OVE-513` (communities), `OVE-514` (Knowledge), `OVE-515`
  (system topics), `OVE-516` (market pages), `OVE-517` (spelling), `OVE-518`
  («Показати ще»), `OVE-519` (the species page), `OVE-520` («Рослини й
  тварини»), `OVE-521` (navigation), `OVE-522` («Каталог видів») and `OVE-529`
  (feed categories).
- **Date:** 2026-09-25
- **Decision owner:** founder/owner
- **Supersedes:**
  - ADR-0026 **D9** (the card's sections, its facts paragraph, relations,
    "Names and sources", `Taxon` JSON-LD with `sameAs`, the owner's "mark
    indexable" override, and "indexable once a gardener *ever* published on
    it") — see D5–D7;
  - ADR-0026 **D10** where it puts the owner's rename, pin, mark-indexable and
    merge controls on the card — see D8;
  - ADR-0029 **D13.2** ("a catalog entry in the site shell", the `/species`
    browse hierarchy as the catalogue's front door) — see D2 and D4;
  - ADR-0029 **D9**'s directories row where it lists `/knowledge`,
    `/communities` and `/objects`, and its topic, community and editorial
    rows (`/markets/…`, `/communities/{slug}`) — see D9–D12;
  - ADR-0030's premise that articles live at their own hubs (`/blog`,
    `/guides`, `/answers`) as the reader's way in — see D10;
  - ADR-0031's 2026-09-21 amendment **D4** ("Explore owns
    catalogue/reference/community/knowledge discovery") and the Explore hub of
    `docs/redesign/2026-09-21/INFORMATION_ARCHITECTURE.md` — see D3;
  - `docs/superpowers/specs/2026-07-13-ove-184-moderated-community-design.md`
    (the operator-curated community) — see D11;
  - `DESIGN.md` §3.2 (navigation), §5.17, §5.18, §5.19, §5.20 (market pages)
    and §5.21, rewritten in the same change.

  Older ADRs are immutable; this page names what it overrides and they are not
  edited.
- **Relates to:** ADR-0032 (every page here is a static document), ADR-0024 D3
  (no control depends on hydration), ADR-0035 (the standard species base that
  names the rows), ADR-0037 (the photo collage and share image), ADR-0033 (the
  wishlist, retired for the same reason).

## Context

On 2026-09-25 the owner reviewed how a gardener meets the organism catalogue:
114,669 nodes, reachable from the «Огляд» rail item, the mobile tab, the
footer, the command palette's «Організми» group and every card's breadcrumb.
Their conclusion was that a gardener never needs to browse a botanical
register. A species or a cultivar matters at one moment only — while the
gardener says what their own plant or animal is — and on one kind of page: the
page that gathers what people wrote about that species.

In the same review the owner took out everything the menu offered that no
gardener used or that the owner had never approved: the Knowledge hub and its
three articles, the six system topics, the two market landings and the one
operator-curated community. The owner's rule for the new pages was just as
short: "не має бути розділів всередині сторінки … Має бути просто перелік
записів про конкретний вид", and "Людина теж бачить опис, структуровані дані
й заголовок" — nothing on a page is for Google only.

## Decision

### D1. The catalogue is hidden, not deleted

- No link leads to `/catalog` or its register views: not the rail, not the
  mobile tabs, not the footer, not the ⌘K palette (its «Організми» group goes),
  not a species page's breadcrumb, not any other page.
- The code and the address stay. `/catalog` keeps answering, and the owner's
  queue and sources pages keep reading the catalogue.
- Species and cultivars are chosen only while a gardener creates or edits their
  own object (ADR-0035).

### D2. «Рослини й тварини» is the crawl path to species pages

- A public page at `/species` (`/bg/species`, `/ru/species`), named
  «Рослини й тварини» (bg «Растения и животни», ru «Растения и животные»). The
  owner approved the name "поки що тимчасово", so the address does not carry
  it.
- Under the title, one sentence: «Рослини й тварини, про які люди ведуть
  журнали на Overgarden. Відкрийте, щоб прочитати їхні записи.»
- It lists every **published** species (D5), one row per species: entries
  about a cultivar or breed count toward its species ("якщо користувач має
  обраний сорт, значить вид у нього вже вибраний").
- A row is the everyday name with the Latin name under it, and nothing else:
  no counts, authors or photographs ("нічого не додаємо"). The everyday name
  comes from the standard species base (ADR-0035 D3), then the catalogue's
  common name, then the Latin name alone.
- Filter «Усі · Рослини · Тварини», a search field «Пошук», and a sort
  «Найновіші» (the default: the species with the newest entry first) ·
  «Найпопулярніші» · «За абеткою». Filters and sort are links, search is a
  `GET` form; each works without JavaScript.
- The base list is indexable and in the sitemap. Every filtered, sorted,
  searched or later view answers `noindex, follow` and renders from the `/q`
  twin (ADR-0032 D5).
- **Addresses.** `/species` has answered 308 to `/catalog` since `OVE-451`;
  that redirect is removed and the page takes the address. `/objects` ("what
  gardeners here have written about") now answers one 308 to `/species`. The
  proxy's old 308 was `no-store`, so no browser holds it.

### D3. Navigation

- **Desktop rail:** Стрічка, Мій сад, Події, New entry as the one persistent
  action, then «Рослини й тварини», and «Спільноти» with a «Скоро» badge that
  cannot be pressed.
- **Mobile bottom tabs:** Стрічка · Новий запис · Мій сад · Події. Four tabs.
  «Рослини й тварини» and «Спільноти · Скоро» sit in the phone's menu, not in
  the bottom tabs.
- The «Огляд» (Explore) hub is gone, and with it the catalogue, Knowledge and
  community entries it grouped.

### D4. A species page publishes itself with its first public entry

- A species is **published** while at least one public, active entry exists
  about an object whose species is it or one of its forms (`form_of`). One
  builder answers the question for the page, the sitemap, IndexNow,
  «Рослини й тварини» and «Каталог видів»; nobody keeps a second copy.
- It replaces "`first_hand_content_at` was ever set" and the owner's
  `indexable_override`. A page whose last entry is deleted, unpublished, erased
  or moved to another species is unpublished again: `noindex`, out of the
  sitemap and every list.
- An unpublished address still answers 200 (ADR-0029 D3; the hidden `/catalog`
  still links to it) with the header and an empty state.
- The threshold is one entry, for the page and for the list ("залишаємо
  обмеження в 1 запис для автоматичної публікації", "поріг 1 і для
  переліку"). There is no review before publication.

### D5. What a species page shows

From top to bottom, and nothing else:

1. the name in the reader's language, with the Latin name under it (the Latin
   name alone when there is no common name);
2. a short text: the owner's description (D8), or until one exists the
   placeholder «Записи про цю рослину від людей, які ведуть її журнал на
   Overgarden.» («…цю тварину…» for animals), in uk, bg and ru;
3. the photo collage (ADR-0037);
4. a visible heading «Записи»;
5. every public entry about the species and its cultivars or breeds, newest
   first, in portions of 20 with «Показати ще» (D13).

Removed: every section («Досвід садівників», relations, forms, pests, hosts,
EPPO presence, «Назви та джерела», identifiers, the «На цій сторінці» rail and
the editors' note), every count, «Додати в мій сад» and its `?catalog=`
prefill, and the owner's controls on the card.

A cultivar or breed page, `/species/{species}/{form}`, keeps its address and
takes the same layout with that form's entries only, a link to its species and
the same publication rule; its placeholder says «…цей сорт…» / «…цю породу…»,
and it has no owner description.

### D6. Nothing on a page is for Google only

- The meta description is the visible description or placeholder.
- JSON-LD describes only what the page shows: the page, the organism by its two
  shown names, the visible text and the listed entries. No `sameAs` to source
  identifiers.
- The heading «Записи» is visible, not only announced.
- Source data — Catalogue of Life, Wikidata, the UA register, the EU common
  catalogue, EPPO, GBIF and WFO identifiers — stays in the database because the
  species field and the standard base are built from it, and is never shown on
  a page.

### D7. The share image

A species page's `og:image` is the photograph the owner picks in «Каталог
видів» (D8), and the newest photograph of the species until they pick one
(ADR-0037).

### D8. «Каталог видів» — the owner's page

- An owner-only page in the account menu at `/garden/catalog/species` (added to
  the `REINSTATED_PATHS` of `lib/retired-control-plane-routes.ts`, beside the
  queue and the sources page; ADR-0026 D10's retired namespace otherwise
  stands). It lists every published species page; each row opens that species'
  settings.
- Settings hold the description in uk, bg and ru — **all three are required to
  save** — and the share image.
- Owner role only. There is no admin role in this scope (`docs/ADMIN_ROLE_BOOTSTRAP.md`
  stands).
- The owner's rename, pin-name, mark-indexable, merge and revert controls leave
  the card. Merges stay in the owner's queue. Moving rename or pin-name into
  «Каталог видів» was not approved.

### D9. Communities are deleted until after MVP

- Every community (today one, `observation-and-care`), its memberships,
  contributions, rules, moderators, reports and audit rows, its pages, its
  repository, its copy, the owner's `/account/communities` page and its tables
  are deleted. The entries themselves stay in their authors' journals. Comment
  moderation (`/account/moderation/comments`) is separate and stays. The
  owner's words: "аби не було зайвого".
- The menu shows «Спільноти · Скоро» (the same word in uk, bg and ru), not
  pressable and not in the bottom tabs.
- Communities that gardeners create themselves return after MVP, as their own
  decision.
- `/communities` and every path below it answer a real 404 (ADR-0029 D3).

### D10. No «Знання»: Overgarden's own publications are feed categories

- The Knowledge hub is removed. Overgarden's own publications appear in the
  main feed among gardeners' entries, in three categories: «Новини», «Блог»,
  «Посібник». The author on their cards is «Overgarden».
- «Посібник» holds guides. Answers to questions («Чому жовтіє листя
  томатів?») go under «Блог».
- `/knowledge` answers one 308 to the feed filtered to «Посібник»; `/blog`
  answers one 308 to the feed filtered to «Блог».
- The three existing articles in `public-seo-content.ts` — the blog note on AI
  advice against records, the guide "start a living plant record" and the
  answer on yellow tomato leaves — are deleted completely, not migrated. Their
  addresses answer a real 404.
- This changes Slice 23 and Slice 25 (ADR-0030): news and blog posts are feed
  items with the author «Overgarden», not "no author anywhere", and `/blog` is
  not a database-backed index page. Everything else in ADR-0030 stands.

### D11. Topics: the system topics go, gardeners' tags publish at once

- The six system topics are deleted: plants, animals, species, plant
  varieties, breeds, observation-and-care, with their pages and their
  `journal_entry_topic_signals`. The feed's plants/animals filter reads the
  object's kind, not a topic, and stays.
- Gardeners' own tags stay and **publish immediately**. Each tag has a public
  page at `/topics/{slug}` from its first public entry, with no review step.
  Abuse goes through the complaint procedure (ADR-0038). Public topic pages
  were `trust_state = 'curated'` only; that filter goes.

### D12. The market landings go

`/markets/ukraine` and `/markets/bulgaria` are deleted and answer a real 404.
Marketing landings will be made separately later, with different content and
no tie to the catalogue.

### D13. Every long list says «Показати ще»

- The feed, «Рослини й тварини», species pages, profiles, topic pages and
  bookmarks load in portions of 20.
- At the end of a list is a visible «Показати ще». It loads the next portion
  by itself when it scrolls into view, and it is a real link to the next
  address (`?page=N` or a cursor) that works without JavaScript and that a
  crawler follows. It is never a hydration-only control (ADR-0024 D3,
  ADR-0032).
- A later portion's address answers `noindex, follow`; the first page is the
  canonical.

### D14. The brand is «Overgarden»

Every user-facing string spells the brand «Overgarden», never «OverGarden»:
copy, titles, JSON-LD `name` and `publisher`, emails and legal text. The domain
`over.garden`, code identifiers, file names and dated historical documents do
not change. It is its own task, done last so it does not respell copy other
tasks delete.

## Consequences

- A reader reaches species pages from entries and from «Рослини й тварини»;
  nobody reaches the register by accident.
- A species page costs what its entries cost. The organism card's sections,
  counts and source records no longer render, which also removes most of the
  ~1 MB page weight measured on 2026-09-21.
- `first_hand_content_at` and `indexable_override` lose their readers. They are
  dropped when nothing reads them, by a migration with its row counts recorded
  first.
- Object setup's `?catalog=` entry loses its only caller (the card's «Додати в
  мій сад»).
- The owner's queue keeps merges. Its «прив'язати назву» (`label_link`) items go
  with the worker's auto-linking (ADR-0035 D6).
- A community, a system topic, a market page or a Knowledge article that a
  search engine indexed now answers 404, or one 308 where D10 names a
  destination.
