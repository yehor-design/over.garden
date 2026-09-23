# Notes, market pages and the source archive — OVE-499

The exact tested and merged commits, CI runs and the production check are in
the authenticated Linear receipt.

## What changed

- **The notes say what a gardener finds there** (criterion 1; OG-UX-034;
  DESIGN.md §5.20).
  - `/blog` was headed "Корисні публічні сторінки перед тонкими публічними
    сторінками." with an intro about search engines and empty catalogue
    pages. It now reads "Нотатки OverGarden": short texts from the editors on
    why to record a garden and how to use records, one's own and others'.
  - Each row carries the note's lead, its date and who signs it.
  - The way into the workspace says where it goes: "Перейти в Мій сад", not
    "Відкрити простір".
  - The note:
    - an eyebrow naming the format ("Нотатка"), and a byline signed
      "Редакція OverGarden" and dated;
    - its sections as the contents, titled "Зміст" rather than "Пов'язані
      шляхи";
    - one "Читайте також" list that is also in the contents. The separate
      workspace button, which repeated that list's own link, is gone.
  - "Публічні сторінки мають заслужити довіру до трафіку" was the team's
    plan. It is now "Опубліковане бачать усі": the published-journals promise
    and what that means for the writer. The title's hyphen is a dash.
  - The URL is unchanged, so moving notes into the database later still
    finds it.
- **Market pages explain their purpose** (criterion 2).
  - The eyebrow names the country instead of "Ринкова сторінка".
  - "Обіцянка" became "Що тут можна робити": what a gardener can record,
    read and look up, including the register of their country (Ukraine's
    State Register, the EU Common Catalogue).
  - "Що публічний discovery може безпечно використовувати зараз" became "Що
    варто знати":
    - everything published is public and searchable;
    - no precise place, in the privacy page's own wording;
    - three interface languages, with entries in their authors' language.
  - "Пов'язані шляхи" became "З чого почати": the journals, the catalogue,
    knowledge and the guide, in the page's language. Before, the Ukrainian
    page showed two English cards, because the related links were never
    translated.
  - The page offers nothing for sale and locates no one.
- **The EPPO archive is a reference, not a front door** (criterion 3).
  - It says what it is: "Довідкове джерело: EPPO's codes and names as
    OverGarden received them, not catalogue cards". It sends a gardener to
    the catalogue.
  - The records are searchable (a real `GET` form into its query view), 20
    to a page.
  - Every record, in the list and on its own page, shows its source credit,
    its licence and the date it was received, in the page's language. Dates
    were in the server's.
  - Four states are said in words: an empty archive, a search with no
    results (with the way back), a search the archive cannot run (why), and
    unavailable (retry the same view). "Знайдено записів: 0" is gone.
  - The words "безпечний", "схвалений" and "продуктова ідентичність" are
    gone.
  - The archive sets no `id="main-content"` of its own: the shell owns the
    skip link's target, and the second one made it ambiguous.
  - Its later pages and retries are plain links into its query view
    (`public-query-twin.ts`).
  - It uses the site's page header and column, the shared `Button`,
    `Select` and `Badge`, and `lang="la"` on scientific names.
- **Only what exists** (criteria 4, 5).
  - Nothing here creates an entity, a feed item, a translation or a
    pipeline step.
  - `docs/redesign/2026-09-21/OVE-499-ARTICLE-CONTRACT.md` records what the
    news and notes entity tasks must hand the article components: news with
    no author at all, sources with access dates, and per-locale rows. It also
    records what the static pages must not imply.
  - `KnowledgeAboutSection` now renders no author row when a piece has none.
- **What stays** (criterion 6). The addresses, the canonicals, the static
  bytes, source attributions, and the locale grouping: Ukraine in `uk`;
  Bulgaria in `bg` and `ru`; `/ru/markets/ukraine` still answers 308.
  Unavailable and error states stay real.

## Proof

`tests/reading-pages.spec.ts` is new and in the gate. It passes 5/5 against
`next start`.

1. **The notes, from the served bytes.**
   - The heading "Нотатки OverGarden", and no search-plan text.
   - The row carries its date and "Редакція OverGarden".
   - The note has its eyebrow, byline and three text headings, each linked
     from the contents, plus "Читайте також" in the contents, and its
     canonical.
   - Bulgarian and Russian: "Бележка" / "Заметка", "Прочетете също" /
     "Читайте также", and the guide in the reader's language.
2. **The market pages.**
   - `/markets/ukraine` has its four headings, "З чого почати" in the
     contents, and links to `/journals`, `/catalog`, `/knowledge` and the
     guide.
   - It has no English cards, no "discovery", "hreflang" or "UGC", and no
     price, cart, payment, delivery or coordinates. It carries the privacy
     page's location sentence.
   - `/bg/…` and `/ru/markets/bulgaria` link `/bg/journals` and
     `/ru/journals` and name the EU Common Catalogue.
   - `/ru/markets/ukraine` answers 308 to `/markets/ukraine`.
3. **The archive.**
   - The document has exactly one `id="main-content"`.
   - The eyebrow, the heading, the catalogue pointer, and the empty-archive
     sentence, with no nought and none of the old words.
   - `?q=zzqq` answers "За «zzqq» записів немає." with the way back, and
     `?q=a` answers why it cannot search.
   - Bulgarian and Russian empty archives.
4. **Keyboard reading** at 1280 and 390 px.
   - On the note, the first Tab is the skip link, and Enter lands in the
     page.
   - Tab reaches "Читайте також" in the contents (the rail above `xl`, the
     article's foot below it). Enter brings it into view.
   - axe is clean, with no sideways scroll, on the note, the notes, the
     Ukraine page and the archive, at both widths.
   - The Bulgarian and Russian Bulgaria pages, the Bulgarian archive and the
     Russian notes are axe-clean at 1280 px.
   - The Bulgarian missing-record page is in Bulgarian and scoped to the
     archive (no catalogue link), and axe-clean.
5. **Without JavaScript.**
   - The note's contents reach "Читайте також".
   - The market page renders.
   - The archive's search form submits into its query view and answers,
     and Back returns.

Before and after screenshots are in `docs/redesign/2026-09-21/ove-499/`.
The "before" set is production on 2026-09-23 for the notes and markets. For
the archive it is the local build of `main`, because production answers 404
behind `STABLE_REGISTRY_PUBLIC_DISCOVERY`.

Unit tests:
- **The notes.** The heading and byline, no search plan, "Перейти в Мій
  сад", and the note's related list in the contents.
- **The market pages.** Four sections, links in the page's language, no
  English cards, and no commerce or coordinates.
- **The archive.**
  - The explorer populated: a Latin display name, aliases, credit and
    licence on the record, the date in the page's language, and a plain
    next link.
  - Empty versus no results, invalid versus unavailable, and no second
    `#main-content`.
  - The route in Russian.

The full unit suite (4,623 passed, 29 skipped), every guard, the type check and
lint pass. The whole browser gate ran on the production build: 350 passed and 1 skipped. One failed, because Better Auth's sign-up limiter answered 429 to a synthetic gardener in `entry-composer`; run alone, it passed 4/4. `reading-pages` passed 5/5 inside the full run.

## Left as it is

- **The archive's populated state is proven by unit tests, not the
  browser.** A record exists only as part of a completed EPPO capture, and
  the gate's database holds none.
- **Without JavaScript and above `xl`, there is no contents list.** The rail
  is drawn by script and the article's foot copy is hidden at that width.
  Every heading is still on the page.
- **The editorial policy page, news, database-backed notes, the feed item
  and the pipeline** are the tasks the contract names.
