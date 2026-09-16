# ADR-0030 — The editorial pipeline lives inside OverGarden, and links the graph

- **Status:** Accepted (decisions 2026-09-16). Execution folds into the existing
  SDD Slice 23 (`OVE-381`–`OVE-384`, `OVE-401`, `OVE-402`) and SDD Slice 25
  (`OVE-403`–`OVE-409`) projects, whose Linear descriptions predate this page.
- **Date:** 2026-09-16
- **Decision owner:** founder/owner
- **Supersedes:** nothing. It writes down decisions that until now lived only in
  Linear project descriptions and in conversation, confirms the 2026-09-06,
  2026-09-07 and 2026-09-08 editorial decisions where they still hold, and adds
  the internal-linking layer they never had.
- **Relates to:** ADR-0022 D1 (no CMS, no drafts as a third article state) and
  D3 (everything public is indexable), ADR-0026 D9 (a source-only organism card
  is `noindex` until a gardener publishes on it — **unchanged**, see D11),
  ADR-0028 (`JournalDocumentV1` is the document contract), ADR-0029 D8 (a slug
  is frozen at publish, a rename answers 308) and ADR-0029 D13 (the entity
  graph, and the finding that 114,669 organism pages have no inbound internal
  link).

## Context

A machine that reads chosen websites and drafts news and blog articles for the
owner to edit and publish has been designed three times: 2026-09-06 (no CMS,
separate news and blog entities, a proposal is not a draft, per-locale
proposals, external sources only), 2026-09-07 (no hosted scraping API, no
headless browser, sources are a list of websites read through feeds, WordPress
JSON, sitemaps or index pages), and 2026-09-08 (two agents on their own owner
pages, one instruction each, Run buttons per market, no cron, one model call,
memory of what was already written, a press always yields a draft). None of it
is in the repository: every issue of both slices is still in Backlog and no
`editorial_*` table or code exists.

On 2026-09-16 the owner reopened the idea as a **standalone product** — an
engine other products could integrate — and the session explored what that
would require: multi-tenancy, a vault for other people's model keys, billing,
CMS adapters, an SDK, an MCP server, a hosted review page, and uniqueness
checking paid for by the service. Four competitor reports were commissioned and
read that day.

The reports agree that no service combines source-grounded generation, memory
against repetition and cannibalization, service-paid uniqueness checking, and
signed API delivery of drafts into someone else's product. The closest are
theStacc (public MCP server, webhooks, publication gated on human approval in
code, cannibalization warnings; no source subscriptions, no paid checking, no
bring-your-own-key), Autoblogging.ai (RSS "Browse & Generate" plus a REST API
with a draft mode; no memory, no checking), Autoblogging.pro (API, HMAC-signed
webhooks, bring-your-own-key) and AirOps (a workflow platform that proves the
stack is possible, at $200–$2,000 a month, with the customer paying for the
plagiarism step).

Two things in those reports must be stated, because they change how much weight
the rest carries. Three of the four cite the concept document written earlier
the same day as a source, so their "unique advantages" sections restate the
idea back rather than testing it. And several specifics do not survive
arithmetic — one report prices a competitor at "$99 per site per month for 30
articles per day", and another puts the whole LLM cost of a draft at $0.03.

The decision that followed is about cost, not about the market.

## Decision

### D1. The pipeline is built inside OverGarden, for OverGarden only

No separate repository, no second deployable, no tenants, no public API, no
hosted review page, no CMS adapters, no SDK, no MCP server, no billing, and no
key vault. The sources list, the instruction, the run, the draft and the Publish
press all live in OverGarden, in its database, behind the owner role.

The standalone product is not deferred; it is out of scope. Anything that exists
only to serve a second customer is not built (D15).

### D2. Build, not buy — the arithmetic

Every service in the category bills per article, and OverGarden needs three
locales per piece (D4). At the volume the 2026-09-06 design allows — 7 news and
3 blog pieces a week, about 43 pieces a month — that is roughly **130 articles a
month**:

| Option | Basis | Per month |
| --- | --- | --- |
| Byword | ~$5 per article | ~$650 |
| theStacc | $99 per 30 articles | ~$430 |
| Arvow | subscription | ~$79 |
| Autoblogging.ai | credit tiers from $19 per 40 | ~$40–80 |
| Own pipeline, Claude Opus 5 | ~$0.60 per trilingual piece | **~$26** |
| Own pipeline, Claude Sonnet 5 | ~$0.24 per piece | **~$10** |
| Own pipeline, Claude Haiku 4.5 | ~$0.10 per piece | **~$5** |

The own-pipeline figures assume about 22,000 input tokens per piece (source
material plus instruction) and about 3,500 output tokens per locale, at the
first-party prices of 2026-09-16 — Opus 5 $5/$25, Sonnet 5 $2/$10, Haiku 4.5
$1/$5 per million tokens — and no charge for infrastructure, because the
droplet, the Postgres database and the Python worker are already paid for and
running. They are estimates to be replaced by measurements from the first real
runs.

A bought service also cannot do D9 or D10: it would have to guess OverGarden's
pages by matching strings in a sitemap, where the pipeline resolves entities
through the organism graph.

### D3. Sources, and how they are read

A source is a website the owner chose. It is read through a feed, a WordPress
JSON endpoint, a sitemap or an index page, in that order of preference; a source
that cannot be read this way is marked unreadable and replaced. `robots.txt` is
respected. Rendering JavaScript with a self-hosted browser is permitted for
sources that do not block it — that is rendering, not circumvention. Source text
is never stored: it lives inside the run.

Defeating anti-bot protection — solving CAPTCHAs, spoofing browser
fingerprints, rotating residential proxies to evade blocks, bypassing paywalls —
was raised on 2026-09-16 and is **not part of this design**; see D16.

### D4. One reading, three locales, never a translation

Sources may be in any language, including English. **Each piece is written
separately in all three of the product's languages — `uk`, `bg` and `ru` —
from the same source material**, and nothing is translated from another locale's
output. The market decides which websites are read, not which languages come
out: that is what the owner asked for on 2026-09-16, and the sentence this
paragraph replaced said the opposite, mapping `uk` to Ukraine and `bg`/`ru` to
Bulgaria.

Whether every piece deserves all three pages is a product judgement, not an
engineering one, and it is left reachable rather than settled: **one constant
(`EDITORIAL_OUTPUT_LOCALES`) decides**, so the other answer costs one line and
one test, with no schema and no prompt change. Reading an English source and writing Ukrainian is the same
operation as writing Ukrainian from a Ukrainian source, so this does not weaken
the 2026-09-06 decision; it is that decision applied to foreign material.

The three locale calls share the same source material as a stable prefix, so
that prefix is cached rather than paid for three times.

### D5. A model per role, and the provider is configuration

The pipeline assigns a model to each job — selecting material, writing the
draft, rewriting after a failed check — so the cheap work does not run on the
expensive model. The key is OverGarden's own. The per-run token spend has a
ceiling, and each draft records which model and which instruction version
produced it, because "quality dropped" is otherwise unanswerable.

The owner asked on 2026-09-16 to be able to switch models and providers freely
— OpenAI, Anthropic, Google, any of them. He asked it of the product that was
then rejected, and it survives here as a constraint on shape rather than a
feature: **which model serves which role is configuration, not code**, and the
pipeline talks to one adapter boundary, so adding a provider never touches the
generation, the checks or the linker. The cost table of D2 quotes Claude prices
because those are the prices that were measured, not because the pipeline is
bound to one vendor. What is not built is a user interface for any of this:
it is a configuration row, edited by the owner, for one site.

### D6. A press yields a draft; a human publishes

There is no schedule and no cron: a run starts when the owner presses Run for a
market. A run always produces a draft; the only draftless run is one where every
source failed. Publication is always a human press. There is no automatic
publication path, and none is added later.

### D7. Checks are mechanical, and mostly invisible

Overlap against the sources, overlap against what this site already published,
length bounds, a cliché list, the presence of a sources block: these run on
every draft, trip at most one rewrite, and stay invisible on the row — no badge,
no score, no note (2026-09-08). On external paid uniqueness checking, be precise about who decided what. The
owner decided on 2026-09-16 that **the service** buys and pays for an external
checker and hands the report over as the deliverable — he decided it of the
standalone product, whose value was selling other people that evidence. For one
site nobody has to be convinced, so this ADR carries the internal overlap check
as the gate (`OVE-403` already specifies at least 92 % unique against the
fetched corpus and every existing article) and leaves the external check as an
**open option**, not a rejected one: Copyscape Premium is about $0.11 for a
1,000-word article, which is affordable at this volume if a draft ever ships
something the internal check could not see.

The one visible exception, added 2026-09-16, is the link summary of D9.

### D8. Keywords are three different things

They are configured separately because they act at different stages: **topic
scope** filters which material is worth writing about; **target queries** shape
the piece, one primary query per piece and at most two or three secondary; and
the **lexicon** fixes how things are named. There is no keyword-density setting
and never will be — coverage of the question is checked, not occurrences of a
phrase. Query pools are per locale and are not translated between them.

### D9. Internal linking: a closed candidate set and a deterministic linker

Internal links into the product are a first-class output of the pipeline, not a
side effect of writing.

1. **The model never writes a URL.** Before the call, entities are extracted
   from the source material and resolved through the reconciliation ladder
   (`OVE-435`: label to taxon, `gnparser`, `form_of`) into a **candidate set**:
   the organism card, its ancestors (genus, family and higher ranks), the topics
   attached to them, gardener entries about them, communities, and this site's
   earlier articles on the subject. Each candidate carries its canonical address
   **for that locale**, its anchor text, and whether it has gardener content.
2. **Writing and linking are separate operations.** The model writes clean prose;
   a deterministic linker then wraps first occurrences, matching **only** within
   the candidate set. Matching across the whole graph of 246,888 names produces
   false positives on ordinary words; matching within the candidates cannot.
3. **An empty card is a valid target** when it matches the name (owner decision,
   2026-09-16). Index status does not filter candidates: the wrong link is an
   irrelevant one, not one that points at a card nobody has written on yet.
   Precision therefore carries the whole guard — a genus card linked from a
   sentence about a species is the failure case.
4. **Anchor text comes from the vernacular by an explicit rank rule**, not from
   the `is_primary, weight, created_at` order used elsewhere: that order makes
   *Helianthus annuus* display «Соняхи», the plural Ukrainian name of its genus,
   and that defect would otherwise ship in every article.
5. **Density.** About one link per 150 words, at most twelve per piece, one link
   per target, first occurrence only. The goal is every entity actually
   discussed linked once to the best page that exists, not the maximum number of
   links.
6. **Addresses are re-validated at publish**, not only at generation. A rename
   answers 308 (ADR-0029 D8) and a draft can sit for a week; publishing a link
   into a redirect is invisible to every test that runs before publication.
7. The draft carries one visible line: how many links, to how many pages, and
   how many of those pages have no gardener entries yet.

### D10. The mention registry is the other half of the link

Publishing registers a row per article and target, built from the links the
linker actually placed, so it can always be rebuilt from the published document.

- **The lifecycle is symmetric.** Editing an article re-synchronises its
  mentions; withdrawing it (the 410 of `OVE-384`) removes them. Otherwise cards
  keep pointing at pages that no longer exist.
- **Publishing invalidates the cards it mentioned.** Organism cards are cached
  for an hour; mentions need their own cache tag per node, beside the existing
  `organismAddressChangeTags`, or the block appears an hour late or never.
- **The card shows gardener entries first**, with editorial mentions as a
  secondary block, newest first, bounded, same locale only. One article that
  mentions twelve organisms must not take over twelve cards.
- **The registry is half the editorial memory.** Which nodes were written about,
  when and under which query is what prevents topical repetition and query
  cannibalization; `editorial_written` keeps the other half, the source URLs a
  piece was built from. They are two tables because they are two grains — one
  row per piece, one row per piece-and-target — and an earlier draft of this
  page claimed one structure served both, which writing the tasks disproved.

This is the visible counterpart of the `subjectOf` edge of ADR-0029 D13.1, and
a second answer to its finding that 114,669 organism pages have no inbound
internal link.

### D11. ADR-0026 D9 is unchanged

A first-party article that covers an organism and links to its card does **not**
make that card indexable. The card stays `noindex` until a gardener publishes on
it or the owner marks it by hand (owner decision, 2026-09-16, after the question
was put explicitly). The owner's manual mark remains the only path from
editorial coverage to indexation.

### D12. The measure of success is a first entry, not a link count

Because D11 holds, linking produces no indexed pages by itself. The metric that
matters is **how many organism cards received their first gardener entry after
an article sent a reader to them**. If that number is zero after three months,
the linking works as navigation and fails as an invitation, and what needs
changing is the card, not the number of links.

### D13. The piece is shaped to be quoted, not only to be read

Answer engines extract self-contained fragments, so the shape is part of the
output and is checked, not left to the model's taste:

- a **self-contained answer** to the piece's primary query inside the first
  hundred words, one that still makes sense lifted out of the article;
- **question-shaped subheadings** that map to the sub-questions of that query;
- one claim per paragraph, with the concrete dated numbers taken from the
  material rather than adjectives — those are the quotable units;
- the **sources block** that is already required, with links and access dates;
- **entity links** in the JSON-LD graph (`about` and `mentions`, pointing at
  organism cards and their identifiers), which is the machine-readable half of
  the internal links of D9 and rides on ADR-0029 D13.1;
- FAQ markup only where the questions are genuinely questions; it is for
  machine readability, not for a rich result.

Meta title and description are written around the primary query without
repeating it mechanically (D8).

### D14. Voice inputs, and the trap inside them

What shapes the voice, in increasing cost: the built-in instructions, the
owner's instruction text, the voice and lexicon files (`OVE-403` syncs these
from `docs/product-research/BRAND_CANON_v1.md` and `LEXICON_AND_OBJECTIONS.md`
and fails CI when they drift), a banned list — words, claims, formulations — and
required elements such as a disclaimer, and optionally three to ten of this
site's own published pieces as **style** exemplars.

The trap, and it is why examples are named here at all: **anything given as an
example must also be inside the overlap check**. A model handed exemplars for
tone will paraphrase them for substance, and an overlap check that only looks at
the fetched sources cannot see it. The same holds for the voice and lexicon
files.

### D15. Rejected

- **The standalone product**, and with it multi-tenancy, a key vault for other
  people's model keys, bring-your-own-key as a feature, billing and quotas, CMS
  adapters, SDKs, an MCP server, a hosted review page, signed outbound webhooks,
  and uniqueness checking paid for by the service as a business model. Rejected
  2026-09-16 in favour of one pipeline for one site.
- **Buying a third-party service** for OverGarden (D2).
- **Keyword density** as a setting (D8).
- **Any promise about AI-content detectors.** Their false-positive behaviour is
  not controllable and the claim cannot be kept.
- **Generated images**, deferred. The slot in the draft is defined so adding
  them later is not a schema change; what is produced now is a hero-image prompt
  and an alt text.
- The 2026-09-08 rejections stand and are not re-proposed: cron and schedules, a
  30-day item store, story clustering, a topic-selection job, a brief or any
  owner input beyond the instruction, two-pass composition, fingerprints, a
  claims array, bulk actions, soft delete, statistics, a pause control, learning
  from the owner's actions, and hosted scraping APIs.

### D16. Open

Whether to read sources that refuse automated reading, by circumventing
anti-bot protection, was raised on 2026-09-16 and is unresolved. Nothing in this
design does it, `robots.txt` compliance is the default, and the trade — cost per
request, a permanent arms race, and the fact that the site publishing the result
carries the exposure — is recorded here rather than in a feature.

## Consequences

- Slice 23 is unaffected and still required: no external service supplies
  `news_articles`, `blog_posts`, their public pages, feed placement, `hreflang`
  or JSON-LD, because OverGarden is not a CMS.
- Slice 25's issues need rewriting against this page before execution. `OVE-403`
  (the falsification gate: five drafts by hand, three of five publishable after
  less than twenty minutes of editing each) is unchanged and still comes first;
  it can be run by hand, at no cost, before any code.
- The linker and the mention registry are new work that none of the Slice 25
  issues describes.
- A queue kind for editorial runs still needs the migration and runtime
  allow-list `OVE-404` describes: `RuntimeRelease.from_environment` refuses any
  `QUEUE_NAME` but `matching`, and `matching_worker_heartbeats.queue_name` is
  the primary key with `CHECK (queue_name = 'matching')`.
- Cost per draft becomes a measured number in the run record, not an estimate.

## Rejected alternatives

- **A separate product with OverGarden as its first customer.** It was the
  starting position of 2026-09-16. What killed it was not the competitive
  landscape but the observation that everything expensive about it — tenants,
  key storage, billing, adapters, a face — serves a customer who does not exist,
  while OverGarden's own need is one site and two markets.
- **A headless engine in its own repository, consumed by OverGarden through a
  pinned container.** It keeps the product option open at the cost of a second
  deployable and a second thing that can fail quietly; the matching worker's
  `MEILISEARCH_HOST` pointed at a container that had stopped for six and a half
  weeks while its heartbeat stayed healthy.
- **Letting the model place links.** Cheaper to write, impossible to prove. A
  candidate set plus a deterministic linker can be shown to produce only
  addresses that resolve.
- **Filtering link candidates by index status.** Proposed and rejected by the
  owner the same day: relevance is the axis, and the first link into an empty
  card is what gives it its first content through D10.

## Rollout

1. `OVE-403` by hand, at no cost: five drafts from real English sources into
   `uk`, `bg` and `ru`, measured in editing minutes. This decides whether
   anything else is built.
2. Slice 23 — the entities and their public pages.
3. The queue kind, the sources registry and the reading module (`OVE-404`).
4. The run job, the three-locale write and the checks (`OVE-405`).
5. The candidate resolver, the linker and the mention registry (D9, D10) — new,
   not yet issued.
6. The owner pages: the instruction, Run per market, drafts with Publish and
   Delete (`OVE-406`).

Rollback at any point is deleting rows and a route: nothing here changes an
existing public address, and D11 keeps the catalog's indexation rule where it
was.
