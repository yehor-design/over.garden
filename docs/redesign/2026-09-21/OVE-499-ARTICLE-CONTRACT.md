# Article and editorial component contract — OVE-499

What the public article components render today, and what the
database-backed editorial tasks must hand them to reuse them. This document
records a boundary. It ships no capability: no table, no feed item, no
translation, no pipeline.

## What exists today

Everything below is written in the code (`src/server/public-seo-content.ts`,
`src/server/public-localized-content.ts`) and rendered as a static document
in the languages it has.

| Family | Addresses | Count |
|---|---|---|
| Notes (the blog) | `/blog`, `/blog/{slug}` | 1 note, in uk, bg, ru |
| Answers | `/answers/{slug}` | 1, in uk, bg, ru |
| Guides | `/guides/{slug}` | 1, in uk, bg, ru |
| Market pages | `/markets/ukraine` (uk), `/bg/markets/bulgaria`, `/ru/markets/bulgaria` | 2 countries |
| EPPO archive | `/sources/eppo`, `/sources/eppo/{code}` | Behind `STABLE_REGISTRY_PUBLIC_DISCOVERY`. Production answers 404: the flag is off there. |

## What does not exist, and who owns it

The static pages must not look as though any of this had shipped: no "latest
news", no subscription, no author profile, no feed of notes.

| Capability | Owner |
|---|---|
| News as a first-party entity, with no author anywhere | OVE-381 |
| News as a peer item in the home feed | OVE-382 |
| News locale groups, `hreflang`, sitemap, `NewsArticle` | OVE-383 |
| News edit, withdraw (410), audit, likes | OVE-384 |
| Blog posts as an entity; the hard-coded note migrated with its URL | OVE-401 |
| Blog discovery and lifecycle, `BlogPosting` | OVE-402 |
| The editorial agent: instructions and checks, sources, runs, drafts | OVE-403, OVE-404, OVE-405, OVE-406 |
| Three independently written languages, never translated | OVE-408 |
| The editorial policy page | OVE-409 |
| The linker and the mention registry | OVE-437, OVE-438 |

This task changed wording and layout only. The note keeps its URL
(`/blog/ai-garden-advice-vs-real-garden-proof`), so OVE-401's migration still
finds it where it was.

## The components

### `PublicArticle` (`components/public/public-article.tsx`)

It renders the one reading shape: a page header, then the reading column,
then whatever follows the text.

- **`eyebrow`.** What kind of text it is, one or two words, never a sentence:
  "Нотатка", "Садівництво · Відповідь". A future news article says "Новина";
  its source disclosure goes in its own section.
- **`title`, `description`.** The page's `h1` and its lead. The lead is also
  what `metadata.description` should say.
- **`meta`.** The byline row, as label and value pairs. Entries with no value
  are dropped.
  - A note, a guide or an answer is signed "Редакція OverGarden" and dated.
  - **A news article passes no author entry at all** (OVE-381 D2). Its row
    is the date alone. There is no "published by" string and no empty
    author.
- **`sections`.** The text, one `h2` each, with a stable `id`
  (`articleSectionId`). The contents list them.
- **`contentsLabel`.** The contents' name: "Зміст" / "Съдържание" /
  "Содержание" (`chrome.contentsTitle`).
- **`contentsAfter`.** Headings the children render after the text: sources,
  related reading, where to start. Each `id` must be on a heading or a
  section the children render. Nothing is listed in the contents that is not
  on the page.
- **`children`.** Everything after the text, each part its own section with
  a real heading.
- **`jsonLd`.** One graph built from facts visible on the page
  (`buildPublicSurfaceMetadata`). A news article's graph carries no `author`
  node.

### Sources and disclosure (`components/public/public-knowledge-article.tsx`)

- **`KnowledgeCitedText`.** Renders `[n]` marks in a sentence as links to
  the n-th source (`lib/knowledge-citations.ts`). Machine-read text has the
  marks stripped (`stripKnowledgeCitations`).
- **`KnowledgeAboutSection`.** "Про цей текст". It lists:
  - the author row, which is optional in the contract, so a news article
    omits it;
  - the subject;
  - what the text rests on;
  - the sources, each with its title, publisher, URL, the date it shows and
    the date it was read;
  - the qualifications;
  - for advice, the specialist review;
  - the date.

  This is the "sources block with links and access dates" ADR-0030 D13
  requires. A drafted article fills it from the sources the pipeline read.
- **`KnowledgeRelatedSection`.** The one "Читайте також" list, each item
  labelled with what it is. An empty list renders nothing.

### What a database-backed piece must supply

To render with these components without new shapes:

| Field | Note |
|---|---|
| `title`, `description` (lead) | Per locale row; never translated from another row (OVE-408) |
| `sections` | Headings with stable ids, or a document the renderer outlines |
| `publishedDate`, `updatedDate` | ISO dates |
| `sources[]` | `{ title, publisher, url, language, sourceDate?, accessedDate }` |
| `basis`, `qualifications[]` | Plain sentences; product help cites no outside source |
| `related[]` | Answers, guides or topics by slug; a topic is listed only while it holds entries |
| author | **Absent for news.** The editorial byline for a note, guide or answer. |

## Checks that hold the boundary

- **The notes and market pages.** Unit tests keep the team's search plan out
  of the notes (`app/(default)/blog/**`) and commerce, coordinates and
  English cards out of the market pages (`app/(default)/markets/**`).
- **The archive.** `public-eppo-archive-explorer.test.tsx` keeps the words
  "safe", "approved" and "product identity" out of it, and keeps its licence
  credit on every record.
- **The browser.** `tests/reading-pages.spec.ts` reads every family in the
  served bytes, in three languages, without JavaScript and by keyboard.
