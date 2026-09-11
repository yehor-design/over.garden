# Linear archive — Issues still open when the archive was taken

Snapshot taken 2026-09-11 before the OverGarden Linear workspace was pruned to fit
its plan limit. One section per issue, in the shape `AGENTS.md` requires. Descriptions
are as Linear's list API returns them and are truncated where marked; the full text of
a shipped task also lives in its pull request and in `docs/DELIVERY_LOG_*`.

## OVE-186 — Drive2-parity production closeout: prove the complete guest-to-journal journey on main

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-186/drive2-parity-production-closeout-prove-the-complete-guest-to-journal
- Branch: `yehordesign/ove-186-drive2-parity-production-closeout-prove-the-complete-guest`

# AI execution directive

Prove one current-main MVP release only after its remaining integration gates are independently complete. This is an `operator_execution` closeout: it creates no repository change and owns no feature implementation. It runs the current deterministic Drive2 matrix, the exact-SHA production read path, the documented authenticated self-serve proof, provider read-backs, redacted cleanup, and final Linear read-back against o… (truncated, use `get_issue` for full description)

## OVE-250 — Stable Registry program closes only after immutable capture, simple curation, public discovery, product selection, editions, and production proof

- Status: Canceled
- Linear: https://linear.app/overgarden/issue/OVE-250/stable-registry-program-closes-only-after-immutable-capture-simple
- Branch: `yehordesign/ove-250-stable-registry-program-closes-only-after-immutable-capture`

# AI execution directive

Coordinate the Stable Registry integration outcome only. This issue is a non-executable `coordination_container`: it is never assigned, never enters In Progress, creates no branch, implementation, deployment, provider call, database/search mutation, or production effect. It closes only after every named child is independently Done, the complete saved relation graph is acyclic, the <issue id="69496675-77b5-4ca0-aa40-da8c… (truncated, use `get_issue` for full description)

## OVE-319 — Owner publishes plant-variety and animal-breed extension packs through the Stable Registry workflow

- Status: Canceled
- Linear: https://linear.app/overgarden/issue/OVE-319/owner-publishes-plant-variety-and-animal-breed-extension-packs-through
- Branch: `yehordesign/ove-319-owner-publishes-plant-variety-and-animal-breed-extension`

# AI execution directive

Implement the owner journey for importing, grouping, reviewing, approving, and locally activating official plant-variety and animal-breed extension packs through the same Stable Registry Release Center. Start from current `main` and authenticated Linear read-back after <issue id="61ba0f0e-00f5-4315-84fc-bf14c31e64db" href="https://linear.app/overgarden/issue/OVE-257/gardeners-immediately-find-select-save-and-reload-ever… (truncated, use `get_issue` for full description)

## OVE-334 — Retire the media quarantine bucket and two-phase upload, keeping erasure and non-media retention

- Status: Canceled
- Linear: https://linear.app/overgarden/issue/OVE-334/retire-the-media-quarantine-bucket-and-two-phase-upload-keeping
- Branch: `yehordesign/ove-334-retire-the-media-quarantine-bucket-and-two-phase-upload`

# AI execution directive

> **Superseded 2026-08-21 — absorbed into** <issue id="5734bcfc-01a6-4aff-9ada-29c204cc16e0" href="https://linear.app/overgarden/issue/OVE-333/media-ingest-simplification-one-accepted-upload-becomes-one-stored">OVE-333</issue>**.** This body is retained as provenance only. Execute <issue id="5734bcfc-01a6-4aff-9ada-29c204cc16e0" href="https://linear.app/overgarden/issue/OVE-333/media-ingest-simplification-one-accepted-u… (truncated, use `get_issue` for full description)

## OVE-336 — AEO structured answers: structured data, canonical, and complete uk/bg/ru alternates on every indexable surface

- Status: Canceled
- Linear: https://linear.app/overgarden/issue/OVE-336/aeo-structured-answers-structured-data-canonical-and-complete-ukbgru
- Branch: `yehordesign/ove-336-aeo-structured-answers-structured-data-canonical-and`

# AI execution directive

> **Superseded 2026-08-21 — absorbed into** <issue id="ca2a1c18-1da0-4615-b191-388ffe346000" href="https://linear.app/overgarden/issue/OVE-335/indexability-and-aeo-one-measured-content-threshold-decides-indexing">OVE-335</issue>**.** This body is retained as provenance only. Execute <issue id="ca2a1c18-1da0-4615-b191-388ffe346000" href="https://linear.app/overgarden/issue/OVE-335/indexability-and-aeo-one-measured-conten… (truncated, use `get_issue` for full description)

## OVE-380 — Public pages do not hydrate below the shell, so every client control is inert on a hard load

- Status: Canceled
- Linear: https://linear.app/overgarden/issue/OVE-380/public-pages-do-not-hydrate-below-the-shell-so-every-client-control-is
- Branch: `yehordesign/ove-380-public-pages-do-not-hydrate-below-the-shell-so-every-client`

## Not reproduced — closed 2026-09-04

**The defect does not exist.** Acceptance criterion 1 asked for a reproduction outside the in-app browser; it ran, and it falsified the report.

Against a local production build and against production itself, a real Chromium hydrates `main`, the like control and the language control, and leaves no postponed template unresolved:

```
PROBE {"main":true,"likeForm":true,"language":true,"formAction":"","postpon… (truncated, use `get_issue` for full description)

## OVE-381 — News articles become a first-party entity: owner composer, public page, and no author anywhere

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-381/news-articles-become-a-first-party-entity-owner-composer-public-page
- Branch: `yehordesign/ove-381-news-articles-become-a-first-party-entity-owner-composer`

## Outcome

The owner opens **Owner tools → News** in the account menu, sees an (initially empty) list of published articles, clicks Create, writes a headline and a body in the same Lexical composer used for journal entries, adds photos through the same staging pipeline, confirms, and publishes. The article is live at `/news/{slug}` in its locale within one request. Its photos are served from `media.over.garden` with the same `srcset` treatment … (truncated, use `get_issue` for full description)

## OVE-382 — News articles appear in the home feed as a peer item, merged on one cursor

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-382/news-articles-appear-in-the-home-feed-as-a-peer-item-merged-on-one
- Branch: `yehordesign/ove-382-news-articles-appear-in-the-home-feed-as-a-peer-item-merged`

## Outcome

A reader on the home page sees news articles interleaved with gardener journal entries in one stream ordered by publication time, on the first page and on every page after it. A news card is unmistakably OverGarden's own writing: no object block, no author line, an explicit label. Applying a kind or topic filter removes news from the stream. Publishing an article makes it visible on the next request, not after the feed's cache window… (truncated, use `get_issue` for full description)

## OVE-383 — News locale groups, hreflang, sitemap, and NewsArticle structured data

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-383/news-locale-groups-hreflang-sitemap-and-newsarticle-structured-data
- Branch: `yehordesign/ove-383-news-locale-groups-hreflang-sitemap-and-newsarticle`

## Outcome

An article written in Ukrainian can be given a Bulgarian and a Russian version. The three are one article in three languages: each has its own URL and its own publication time, they point at each other with `hreflang`, and a reader is offered the version in their own language when one exists. Every published article is in the sitemap, is indexable, and carries `NewsArticle` structured data naming OverGarden as both author and publish… (truncated, use `get_issue` for full description)

## OVE-384 — News article lifecycle: edit, withdraw to a proxy-decided 410, audit rows, and likes

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-384/news-article-lifecycle-edit-withdraw-to-a-proxy-decided-410-audit-rows
- Branch: `yehordesign/ove-384-news-article-lifecycle-edit-withdraw-to-a-proxy-decided-410`

## Outcome

The owner can correct a published article and can take one out of circulation. A withdrawn article's URL answers `410 Gone` with `noindex, nofollow` before any page renders, its media stops being reachable, and it leaves every listing and the sitemap. Every publish, edit, and withdrawal leaves one audit row that names the action and nothing about the person. Readers can like a news article the same way they like a journal entry.

## … (truncated, use `get_issue` for full description)

## OVE-401 — Blog posts become a first-party entity: own table, owner page, database-backed /blog, and the hardcoded posts migrated with their URLs intact

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-401/blog-posts-become-a-first-party-entity-own-table-owner-page-database
- Branch: `yehordesign/ove-401-blog-posts-become-a-first-party-entity-own-table-owner-page`

## Outcome

The owner opens **Owner tools → Blog** in the account menu, sees the post that today lives in TypeScript — one post, `ai-garden-advice-vs-real-garden-proof`, in `uk`, `bg` and `ru` at `5f1ce27` — as rows, clicks Create, writes in the same Lexical composer the news entity uses, adds photos through the same staging pipeline, confirms, and publishes. The post is live at `/blog/{slug}` in its locale within one request and `/blog` lists i… (truncated, use `get_issue` for full description)

## OVE-402 — Blog post discovery and lifecycle: locale groups from the database, hreflang, BlogPosting JSON-LD with dateModified, edit, and withdraw to a proxy-decided 410

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-402/blog-post-discovery-and-lifecycle-locale-groups-from-the-database
- Branch: `yehordesign/ove-402-blog-post-discovery-and-lifecycle-locale-groups-from-the`

## Outcome

A blog post written in Ukrainian can be given a Bulgarian and a Russian version, the three point at each other with `hreflang`, and a reader is offered their own language when it exists. Every published post carries `BlogPosting` structured data naming OverGarden as author and publisher and shows when it was last updated. The owner can correct a post and can take one out of circulation: a withdrawn post's URL answers `410 Gone` with … (truncated, use `get_issue` for full description)

## OVE-403 — The editorial instructions and the checks module: write them, prove them on real material from the owner's websites

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-403/the-editorial-instructions-and-the-checks-module-write-them-prove-them
- Branch: `yehordesign/ove-403-the-editorial-instructions-and-the-checks-module-write-them`

## Outcome

The two files the pipeline runs on exist and are proven: `instructions.md`, the built-in half of the prompt that tells the agent how to write for OverGarden, and `editorial_checks.py`, which decides mechanically whether what came back is good enough to keep. The other half of the prompt is the instruction the owner writes on the page (`OVE-406`); this task fixes how the two are joined — the built-in file first, the owner's direction … (truncated, use `get_issue` for full description)

## OVE-404 — The sources registry and the reading module: the websites each agent walks, and the second worker that runs them

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-404/the-sources-registry-and-the-reading-module-the-websites-each-agent
- Branch: `yehordesign/ove-404-the-sources-registry-and-the-reading-module-the-websites`

## Outcome

On the News page and on the Blog page the owner sees **Sources** — the websites that agent walks — and adds one by pasting its address. Each row says what the site turned out to offer (a feed, the WordPress API, a sitemap, or plain pages), when it was last read, how many items it gave, and whether its `robots.txt` refuses us or its pages need JavaScript. Nothing is scheduled and nothing is stored: the reading module is what the run j… (truncated, use `get_issue` for full description)

## OVE-405 — The run job: on the owner's press the agent reads its sources, skips what it has already written about, and always leaves a finished draft

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-405/the-run-job-on-the-owners-press-the-agent-reads-its-sources-skips-what
- Branch: `yehordesign/ove-405-the-run-job-on-the-owners-press-the-agent-reads-its-sources`

## Outcome

The owner presses **Run** on the News page or the Blog page. The agent for that page reads the websites that page lists, **puts aside every article it has already written from**, follows the built-in editorial instructions and the owner's own instruction, and writes one finished piece — headline, body, a Sources block of links. Before it is saved the text is checked for copied passages and for repeating something already published; i… (truncated, use `get_issue` for full description)

## OVE-406 — The agent block on the News and Blog pages: the instruction the owner writes, the Run button, the run's state, and the drafts it produced

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-406/the-agent-block-on-the-news-and-blog-pages-the-instruction-the-owner
- Branch: `yehordesign/ove-406-the-agent-block-on-the-news-and-blog-pages-the-instruction`

## Outcome

**Owner tools → News** and **Owner tools → Blog** each carry, above the published list: the agent's instruction in a large text box the owner writes and saves (up to 40 000 characters); a **Run** button per market — "Run for Ukraine", "Run for Bulgaria" — with the state of the last run beside it ("running since 12:04", "done — 1 draft from 7 new articles", or, when the sites themselves failed, "could not read 3 of 3 sources"); and th… (truncated, use `get_issue` for full description)

## OVE-407 — Blog topics chosen by the machine: one topic per market every second day from the sources' last week, composed with internal evidence into a finished post; the Blog inbox

- Status: Canceled
- Linear: https://linear.app/overgarden/issue/OVE-407/blog-topics-chosen-by-the-machine-one-topic-per-market-every-second
- Branch: `yehordesign/ove-407-blog-topics-chosen-by-the-machine-one-topic-per-market-every`

**Canceled on 2026-09-08 — folded into** `OVE-405` **and** `OVE-406`**.**

The owner asked for the simplest shape that does the job: the agent walks the sources, writes the piece, puts it in a draft. That removed the separate topic-selection job this issue owned (the write job now picks its own subject from the material) and the separate Blog inbox (one component serves both inboxes, in `OVE-406`).

What lived here and where it went:

* topic se… (truncated, use `get_issue` for full description)

## OVE-408 — Bulgarian market drafts in both its languages: the write job produces a bg and a ru draft of the same piece, grouped for hreflang, never translated

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-408/bulgarian-market-drafts-in-both-its-languages-the-write-job-produces-a
- Branch: `yehordesign/ove-408-bulgarian-market-drafts-in-both-its-languages-the-write-job`

## Outcome

When the owner presses "Run for Bulgaria", the run produces two drafts of the same piece — one in `bg`, one in `ru` — each written on its own from the same material, never by translating the other. They sit together in the drafts list, and when the owner publishes both, the two articles form one `hreflang` group. Ukraine stays single-language.

## Owner decisions this task implements

ADR-0027 D13 (one draft per market locale, compos… (truncated, use `get_issue` for full description)

## OVE-409 — The editorial policy page: who writes OverGarden's news and blog, how sources are chosen and credited, what the bot is called

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-409/the-editorial-policy-page-who-writes-overgardens-news-and-blog-how
- Branch: `yehordesign/ove-409-the-editorial-policy-page-who-writes-overgardens-news-and`

## Outcome

A reader can open `/editorial-policy` in `uk`, `bg` or `ru` and learn who writes OverGarden's news and blog (OverGarden, as an organization), that pieces are machine-drafted from the sources the owner chose and published by the owner, how sources are chosen and credited (every piece ends with a Sources block of links), what the bot is called and that it obeys `robots.txt`, and where to ask for a correction. The page is linked from th… (truncated, use `get_issue` for full description)

## OVE-419 — The address law: record ADR-0029 and mark what it supersedes

- Status: In Progress
- Linear: https://linear.app/overgarden/issue/OVE-419/the-address-law-record-adr-0029-and-mark-what-it-supersedes
- Branch: `yehordesign/ove-419-the-address-law-record-adr-0029-and-mark-what-it-supersedes`

## Outcome

`docs/adr/ADR-0029-address-law.md` states one rule per addressing question, and every document that described the old behaviour points at it.

## Owner decisions this task implements

Decisions of 2026-09-11, taken after the audit of 2026-09-10:

* entries move to `/@{handle}/{slug}` so the random suffix leaves the shape;
* untranslated pages lose their locale prefixes;
* listings are never filtered or badged by language;
* the law a… (truncated, use `get_issue` for full description)

## OVE-420 — Every URL the app emits becomes absolute, and Open Graph is finished

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-420/every-url-the-app-emits-becomes-absolute-and-open-graph-is-finished
- Branch: `yehordesign/ove-420-every-url-the-app-emits-becomes-absolute-and-open-graph-is`

## Outcome

No relative URL leaves the app. `canonical`, every `hreflang` alternate, `og:url` and every JSON-LD `@id` are fully qualified, so the language layer the code already builds stops being inert.

## Owner decisions this task implements

ADR-0029 D1 (an address is an identifier), D13 item 1 in part. Audit findings ADR-01 and SUR-04.

## Scope (in / out)

**In:** `metadataBase` from `getPublicSiteUrl()`; absolute URLs in `buildPublicSurfa… (truncated, use `get_issue` for full description)

## OVE-421 — The sitemap stops submitting noindex pages, and robots.txt says what the policy says

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-421/the-sitemap-stops-submitting-noindex-pages-and-robotstxt-says-what-the
- Branch: `yehordesign/ove-421-the-sitemap-stops-submitting-noindex-pages-and-robotstxt`

## Outcome

No chunk emits a `<url>` the page itself would refuse to index, chunks are counted in URLs rather than records, and `robots.txt` matches the document that describes it.

## Owner decisions this task implements

ADR-0029 D15 phase 0. Audit findings SUR-01, SUR-02, SUR-03.

## Scope (in / out)

**In:** every chunk passes `resolvePublicSurfaceDiscoveryForRequest(...).decision.sitemapEligible` — only `topics` does today, and all three li… (truncated, use `get_issue` for full description)

## OVE-422 — Geography stops redirecting, and every page canonicalises to the URL it was served from

- Status: Backlog
- Linear: https://linear.app/overgarden/issue/OVE-422/geography-stops-redirecting-and-every-page-canonicalises-to-the-url-it
- Branch: `yehordesign/ove-422-geography-stops-redirecting-and-every-page-canonicalises-to`

## Outcome

A canonical URL answers 200 to everyone, and no page declares a canonical that redirects. The canonical loop closes.

## Owner decisions this task implements

ADR-0029 D10 ("geography suggests; it never redirects"), D3. Audit findings ADR-02, ADR-03.

## Scope (in / out)

**In:** remove the `localized-link` geo-307 from `getLocaleRoutingResponse`; a dismissible banner offering the other locale, using the existing switcher; `canonical… (truncated, use `get_issue` for full description)

