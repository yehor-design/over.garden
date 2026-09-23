# Knowledge, answers, guides and topics — OVE-498

The exact tested and merged commits, CI runs and the production check are in
the authenticated Linear receipt.

## What changed

- **Each piece says its subject before its format** (criterion 3;
  OG-UX-033; DESIGN.md §5.19).
  - A guide or an answer is gardening advice or help with OverGarden
    (`PublicKnowledgeSubject` in `server/public-seo-content.ts`).
  - The eyebrow, the hub row and the Article's `about` say which, first:
    "Садівництво · Відповідь", "Довідка OverGarden · Посібник".
  - "Авторський матеріал" is gone.
- **The answer rests on sources and says what it is not** (criterion 2).
  - The tomato answer was rewritten from four sources, read in full on
    2026-09-23: two University of Maryland Extension pages, UW–Madison
    Extension and the RHS. Every claim ends in its source numbers, `[1][2]`,
    each linking to that source (`lib/knowledge-citations.ts`,
    `KnowledgeCitedText`).
  - Claims no source supported as worded were removed: old leaves yellowing
    with age, and "водний стрес / поганий дренаж / стрес коренів" said of
    every plant.
  - The answer now reads, in order:
    - the short answer;
    - "Як розрізнити причини", six observable patterns, each cited;
    - "Що записати, щоб знайти причину", the editors' method, which asserts
      nothing;
    - two gardening questions.
  - "Про цей текст" (`KnowledgeAboutSection`) gives the author, the subject
    and what the text rests on.
    - The sources are numbered, each with the date it shows and the date it
      was read.
    - Two qualifications follow: "Це не діагноз", and that the sources
      describe US and UK gardens.
    - The review row says "Агроном чи фахівець із захисту рослин цей текст не
      перевіряв."
  - The claim ledger is `OVE-498-PROVENANCE.md`.
- **Provenance is one step away, not above the answer** (criterion 3). The
  byline is the author, the date and "4 джерела й обмеження", which links to
  "Про цей текст". The answer comes first.
- **Product help stays out of advice** (criterion 3). The two questions about
  OverGarden (publishing a photo, diagnosis) left the FAQ.
  - They are now "Як записати це в OverGarden", a section labelled
    "Довідка OverGarden" that ends at the guide.
  - The `FAQPage` is the two gardening questions, without citation marks.
  - The guide says it is help with OverGarden. It rests on the product and
    cites nothing outside it, and the page says so.
- **Gardeners' entries that exist** (criteria 2, 6).
  - Before, the answer read its entries from `watering-and-moisture` and
    `stress-and-recovery`, and the guide from `care-checks`. None of these
    topics was ever created, so both pages said "0 публічних записів"
    everywhere.
  - Now the answer shows entries about the tomato species (production: 9),
    and the guide other gardeners' plant records (`plants`).
  - The section is headed by what the entries are about ("Що садівники
    записали про томати"). Its count carries "вони не підтверджують і не
    спростовують текст вище", and each entry is a heading.
  - The rest is one document request away, `Усі записи (N)`, into the
    journals' query view (`public-query-twin.ts`).
  - A failed read retries the page the reader is on, not the hub.
- **Counts are of what can be shown** (criterion 1; OG-UX-032). A topic now
  counts only entries a listing can render: those whose author has an
  address (ADR-0029 D9). The evidence query takes its hundred ids by the same
  rule, so a run of unaddressable entries can no longer fill the hundred and
  leave the page empty.
  - Production counts are unchanged: `plants` showed 9 in its header and 9 in
    its list before.
  - The gate database had 156 `plants` entries with no address, so its header
    said 156 over a list of none.
- **The hub** (criteria 1, 4).
  - The rows run answers, then topics, then guides. Each says what it is
    about and what it rests on: an answer's sources and date, or a topic's
    count of entries and its last entry's date.
  - "Достатньо досвіду для індексації" and "Перевірена тема" are gone, and so
    is every topic with nothing in it.
  - Search matches a piece's own words: "азот" finds the answer, which does
    not say it in its title.
  - The rail that repeated the results, and its copy under the results below
    `xl`, are gone.
  - The filter chips leave by document (`documentLinks`).
  - If topics cannot be read, the answers and guides stay, with a notice and
    a retry.
- **A topic** (criteria 1, 4). The header gives the count of entries and the
  last entry's date, with no badge. Then:
  - a search of its own entries, a real `GET` form into
    `/journals?topic=…&q=…`;
  - up to eight entries, stating neither the count nor "why it is related" a
    second time;
  - one related section, "Відповіді й посібники на цю тему".

  The rail that repeated the entries is gone.
- **One related section, labelled** (criterion 4). "Читайте також" lists what
  exists, each item labelled with what it is: "Садівництво · Відповідь",
  "Тема · 9 записів садівників". A topic with no entries is not offered.
- **Long reading and heading navigation** (criterion 6).
  - An article's contents list every `h2` on the page, the trailing sections
    too (`PublicArticle`'s `contentsAfter`).
  - They are the rail above `xl` and the article's foot below it. Headings
    keep clear of the sticky header (`scroll-mt-20`).
  - The contents are titled "Зміст" (they were titled "Поширені питання" on
    the answer).
- **What stays** (criterion 5). The addresses, the canonicals, `hreflang` in
  all three languages, the index decision (every live page), the sitemap rows
  and the structured-data types: `FAQPage` for the answer, `Article` for the
  guide, `CollectionPage` for the hub and topics.

## Proof

`tests/knowledge-pages.spec.ts` is new and in the gate. It passes 8/8 against
`next start`.

The answer and the guide are prerendered at build, so their gardeners'
entries are whatever the gate's database held then. For the tomato species
and for `plants`, that is nothing a listing can show, so both pages show the
empty state and say so.

The populated side is read on the spec's own topic, "Балконні томати": two
entries by a gardener with an address. It is created if missing and never
deleted, because other specs request every curated topic.

1. **The answer, from the served bytes.**
   - The heading, "Садівництво · Відповідь", and "4 джерела й обмеження"
     linking to `#answer-about`.
   - None of "Продуктові", "принцип", "Поточна версія", "MVP" or "Авторський
     матеріал".
   - The outline in order: the answer, the causes, what to note, the FAQ,
     gardeners' entries, help with OverGarden, about. "Читайте також" appears
     while `plants` holds entries.
   - Citations `[1]`–`[4]`, each with its target. Source 1 is marked
     `lang="en"` and links to its page, with "переглянуто 23 вер. 2026".
   - "Це не діагноз" and the review row.
   - The FAQ holds no OverGarden, WebP or "Опублікувати". The product help
     names OverGarden and links the guide.
   - The empty state, with no count.
   - The canonical, the `bg` and `ru` alternates, no `noindex`.
   - A `FAQPage` whose two questions are the gardening ones, with no marks.
2. **The guide, from the served bytes.**
   - "Довідка OverGarden · Посібник" and "Основа й обмеження".
   - "Зовнішніх джерел немає: текст описує сам OverGarden." and "Це довідка
     про OverGarden, а не садівнича порада."
   - No specialist-review row.
   - Its related section is the answer, labelled "Садівництво · Відповідь".
3. **Bulgarian and Russian.** The answer, the guide and the hub in each:
   - the heading, the subject, "4 източника и ограничения" / "4 источника и
     ограничения", "За този текст" / "Об этом тексте";
   - the entries' heading, the fourth citation, and the guide link in the
     reader's language;
   - nothing about indexing.
4. **A topic with entries.** On "Балконні томати":
   - The header reads "2 записи садівників · останній запис …". There is no
     badge and no "індексац".
   - Two entries appear as headings, newest first, with the count and "Чому
     це пов'язано" not repeated, and no rail.
   - "Усі записи (2)" goes to `/journals?topic=…` as a plain link.
   - axe is clean at 1280 and 390 px, with no sideways scroll.
   - By keyboard, the topic's search takes "кільцями" to the journals
     narrowed to the topic. They show the one entry that says it, and not
     the other. Back returns to the topic.
5. **Topic → answer → source → back.** The run starts on `/topics/plants`,
   which has no rail and no "індексац", and whose related section names the
   answer.
   - Into the answer.
   - Tab to citation `[1]` and press Enter. The address becomes
     `#knowledge-source-1`, and the source is in view.
   - Follow the source. The other site is answered by the spec, so the gate
     depends on no university's server.
   - Back returns to `#knowledge-source-1`, still in view. Back again reaches
     the answer, and once more the topic.
   - axe is clean on the topic.
6. **Heading navigation.** At 1280 px the rail, and at 390 px the article's
   foot, list exactly the page's `h2` ids in order, and following "Про цей
   текст" lands on it. axe is clean on the answer, the guide and the hub at
   1280 and 390 px, and on the answer and a topic in Bulgarian and Russian.
7. **The hub's search.**
   - The rows say "Садівництво · Відповідь", "4 джерела" and "Довідка
     OverGarden · Посібник", and nothing about indexing.
   - "азот" leaves one row: the answer.
   - "кактусові мушки" is the no-results screen with its way out.
8. **Without JavaScript.**
   - The answer's heading and short answer render, and citation `[3]`
     reaches its source.
   - The topic's search form submits into the journals and finds its entry,
     and Back returns to the topic.

Unit tests:
- **Content.**
  - Advice cites sources, and product help cites none.
  - Every citation in every language names a source, and every source is
    cited.
  - Evidence and related topics are topics the product creates.
  - No editorial meta says "principle" or "guidance".
- **The routes.**
  - The answer's outline, citations, sources, product help and `FAQPage`
    without the product questions or marks.
  - The guide as product help, with its related answer and `about`.
  - The hub's rows, its order, search in the body, and partial topics.
  - A topic's search form, its counts without a badge, no rail, and its
    related answers and guides.
- **The evidence list.** A descriptive heading, the count and note, the
  plain link into the journals, headings for entries, and a retry on the same
  page.
- **The copy.** No "індекс" or "перевірен" anywhere, and the counts in all
  three languages.

The full unit suite passes (4,620 passed, 29 skipped). So do the
banned-dependency, icon, design-token, component, browser-spec, settled-read
and address guards, the type check and lint. The database proof of every
public read (`pnpm public:reads:prove-database`, 56 cases) passes with the
two changed queries. The whole browser gate ran on the production build: 327 passed and 1
skipped. Two failed and 17 did not run, all because Better Auth's sign-up
limiter answered 429 to a synthetic gardener: in `site-shell`, and in the
setup of `static-documents`, which stopped the rest of that file. Run alone
on the final build, `static-documents` passed 18/18, `site-shell` 9/9,
`knowledge-pages` 8/8 and `editorial-surfaces` 6/6.

## Left as it is

- **The blog, articles, markets and source archives.** They are `OVE-499`,
  including the blog heading OG-UX-034 names. `PublicArticle`'s contents now
  take trailing headings, and the blog's contents are still titled with its
  related-paths label.
- **One answer and one guide.** This change makes those two credible and
  gives the next ones a shape the tests enforce (sources, citations,
  subject). It adds no new horticultural content beyond what the four sources
  support.
- **The answer's evidence is the tomato species' entries only.** Entries
  about a tomato cultivar are linked to the cultivar, not the species, so
  they are not among them. The journals' `catalog` filter has the same rule.
