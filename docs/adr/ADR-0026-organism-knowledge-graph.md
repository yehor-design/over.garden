# ADR-0026 — The organism knowledge graph: one canonical card per organism, Catalogue of Life as backbone, curation that never blocks a gardener

- **Status:** Accepted (decision 2026-09-05, evening). Implementation is SDD
  Slice 24, `OVE-386` through `OVE-399`, in that order.
- **Date:** 2026-09-05
- **Decision owner:** founder/owner
- **Supersedes:** the sentence in ADR-0025 D1 that "no source-built catalog is
  planned" and the clause in ADR-0025 D2 that nothing may pre-empt the owner's
  EPPO plans (this record states them); the list of `noindex` cases in
  ADR-0022 D3 (one case added, D9 below); the account-menu link count in
  ADR-0022 D5 (two links added, D10 below); `AGENTS.md` hard rule 5 for one
  public route (D7 below); `docs/TECH_STACK_DECISIONS.md` invariant 9
  ("Typeahead uses Meilisearch"); the rule in
  `docs/product-research/SPECIES_BACKBONE_POLICY.md` that EPPO
  distribution text stays raw/source-only, for country-level status only (D11
  below). Older ADRs are immutable history and are not edited.
- **Relates to:** ADR-0016 (the observed capture and its rights model are
  retained and are now consumed); ADR-0022 (D3, D4, D5 stand except as amended
  here); ADR-0023 (every owner page under `/garden/**` keeps its shape);
  ADR-0024 (every control on a public page and every curation control is a
  Server Action form); ADR-0025 (the release model, editions, extension packs
  and the Release Center stay retired).

## Context

What the product has today. The catalog gardeners use is flat:
`catalog_items` with three kinds (`species`, `plant_variety`, `breed`), no
parent, no relation between a variety and its species, and `catalog_item_names`
searched by a trigram index. Under it lies a source layer that survived the
registry retirement: snapshots with licence and attribution, records with a
rights class on every field, links from items to records, and an alias review
ledger with `accepted`, `review_needed`, `rejected`, `generated` states. The
retained EPPO observed capture holds 129,214 identifiers with names and
taxonomy, and nothing about hosts, distribution or categorization. Four species
were imported from Catalogue of Life, WFO, GBIF, EPPO and Wikidata as a proof
wave; the Ukrainian State Register and the EU Official Journal Common Catalogue
were imported as varieties; a breed seed exists. Species, variety and breed
pages render through one evidence route with source credits and emit a generic
`Thing` in JSON-LD. The picker runs three searches per keystroke, Meilisearch
first in the result order, Postgres as the availability floor, the trigram
path behind a flag that ships disabled. A name a gardener adds becomes a
provisional catalog card that only its author can see in the list, waits for
the owner to confirm or merge it, and shows the gardener a trust label and a
source caveat meanwhile.

What the owner proposed on 2026-09-05: not a plain EPPO import but a universal
biological knowledge graph assembled from EPPO, Catalogue of Life, World Flora
Online, GBIF, Wikidata, national variety registers and breed sources, with one
canonical page per organism, assertions from every source, visible
disagreements, name history, relations between species, cultivar, breed, pest
and host, regional presence and a source on every fact.

What the discussion settled. The proposal is right as an architecture and
wrong as a first step, and the owner's own quality principle is what decides
the sequence: a knowledge graph's quality is the correctness and traceability
of every assertion and the stability of identity over time, not the number of
sources. Four of the proposed sources are one tree plus crosswalks: Catalogue
of Life is the community's shared tree, World Flora Online supplies its plant
part, GBIF aligns its backbone to it, and Wikidata carries the identifiers of
all four. Only EPPO is different in kind: codes, pests, hosts, country-level
presence. Cultivars and breeds are not taxa; they are registered forms that
attach to a species. The moat is not the public data, which anyone can
download, but the curated edges (local names in Ukrainian and Bulgarian, the
cultivar-to-species links, the pest-host pairs for two markets) and the
gardeners' journals attached to canonical nodes. Three things were proposed and
rejected in the same discussion and stay rejected: showing gardener-added names
to other gardeners; asking the gardener a species question when a name is not
found; zero-typing shortcuts in the picker.

## Decision

### D1. Identity and kinds

One canonical card per organism in OverGarden's own identity space: a UUID and
a slug that OverGarden owns. Source identifiers are crosswalks, never identity.
Three node kinds: `taxon`, `cultivar`, `breed`. A cultivar or breed attaches to
a species (or hybrid) node through a `form_of` relation and is never a branch
of the classification tree. "Pest" and "disease" are roles a taxon acquires
from EPPO categorization or a `pest_of` relation, not kinds. Merges, splits and
renames are recorded operations with permanent redirects; a gardener's object
follows the surviving node.

### D2. The backbone and the assertions

Catalogue of Life is the classification and accepted-name backbone. OverGarden
authors no tree. World Flora Online and GBIF corroborate through identifiers;
EPPO contributes codes, names, pest-host relations, categorization and
country-level presence; Wikidata contributes crosswalk identifiers and
vernaculars; registers and breed sources contribute registered forms. The
canonical accepted name follows the backbone; a deviation is a curator decision
with a recorded reason. Every fact is a reified assertion with source, source
release, observed time, rights class, confidence and curator decision.
Disagreements between sources are data: shown in a collapsed panel on the
card, never a blocker anywhere.

### D3. Storage and vocabulary

Postgres holds the graph in narrow tables: nodes (`catalog_items`, evolved in
place), names (`catalog_item_names`), relations, identifiers, facts, assertions,
plus the curation queue, its append-only actions, slug history and search
misses. Classification paths are materialized as ancestor arrays. No graph
database, no external search engine on the pick path. Rank, status and name
vocabularies come from ColDP and Darwin Core. One name normalizer exists in
SQL, TypeScript and Python and is held to one shared fixture.

### D4. Reconciliation

A deterministic, explainable, kingdom-aware ladder runs in the matching worker
off the request path: shared external identifier; exact scientific name with
authorship after a real name parser; canonical name within the same kingdom
and rank; fuzzy match within the same genus; cultivar and breed denominations
equal after normalization or under transliteration within the same species;
co-usage by gardeners as a supporting signal. A kingdom mismatch on an
otherwise exact name is recorded and never proposed. Above a per-rule threshold
a proposal applies itself and is logged with its inverse for seven days of
one-click revert; thresholds recalibrate from revert rates within fixed bounds.
Everything else becomes a queue item ordered by impact.

### D5. Curation never blocks a gardener

No gardener read or write path waits on a curation decision. Curation only
merges, renames, links and redirects; it never deletes a gardener's link, never
unpublishes, never blocks a pick. The picker and the composer do not read the
queue. When the worker is down, the picker answers from Postgres and the
gardener can still add an own name and publish. A gardener can re-resolve their
own object at any time with the same picker.

### D6. A gardener's own name

A name a gardener adds is a text label on their object (`variety_state =
'free_text'`), never a catalog card, never shown in other gardeners' lists, and
carries no trust label or caveat. No question is asked. The provisional card
path is retired and existing provisional cards become labels. The worker
proposes species links and label clusters to the queue and auto-links above
threshold.

### D7. The picker

Three one-tap outcomes: a species; a form with its species implied; "add as my
own name". The kind filter comes from the object being created. One row per
organism, with the matched name as a subtitle when it differs from the display
name. Ranking is automatic and market-aware: exact vernacular in the reader's
locale, then prefix vernacular, then exact scientific, then prefix, then fuzzy;
registered in the reader's market; gardener usage; a crop prior derived from
registered forms and host relations. The primary list searches canonical nodes;
a secondary "search the full catalogue" path searches the full Catalogue of
Life checklist and creates a node on pick. The typeahead is one Postgres query,
prefix index then trigram, with a budget of 100 ms at P95 server time and 1 KB
per response. The route carries no cookies and no personal data and may carry a
short public cache; this is the one exception to `AGENTS.md` hard rule 5.
Meilisearch and the trigram feature flag leave the pick path.

### D8. Addresses

Canonical paths are `/species/{slug}` for a species and
`/species/{slug}/{form-slug}` for a cultivar or breed, identical in every locale
with `hreflang` alternates. A species slug is the canonical scientific name in
Latin letters; a form slug is the registered denomination romanized per the
Cabinet of Ministers resolution 55 of 2010; vernaculars never appear in a slug.
Every slug ever assigned stays in a history table and answers HTTP 308 to the
current path forever. `/id/{uuid}` is the permalink and the `@id` in JSON-LD;
`/eppo/{code}`, `/col/{id}`, `/gbif/{key}` and `/wikidata/{qid}` resolve to the
canonical path; the old `/variety/*` and `/breed/*` paths redirect. Redirects and
404s are decided before the shell streams so the HTTP status is real.

### D9. The card and indexability

Section order: a fact-only first paragraph built from structured fields; the
gardener experience with spread by oblast; relations (forms, pests, hosts);
"Names and sources" collapsed; attribution with the last-updated date and an
outbound link per source. JSON-LD is `Taxon` with `@id`, `scientificName`,
`taxonRank`, `parentTaxon`, `sameAs` to Wikidata, Catalogue of Life, GBIF, EPPO
and WFO, `dateModified`, plus `BreadcrumbList`. A card whose content comes only
from sources is reachable but `noindex` until a gardener publishes on it or the
owner marks it indexable; this adds one case to the ADR-0022 D3 list. Indexable
cards sit in their own sitemap chunk. Card HTML is cached with tags; worker-side
changes revalidate through the outbox.

### D10. Owner surfaces

Two links join the account menu: the curation queue and the sources page,
amending the ADR-0022 D5 count. The queue is one decision stream: one item at a
time, two cards side by side, reasons and confidence, Yes, No, Skip and Undo as
Server Action forms, keyboard as an enhancement, ordered by impact, with the
seven-day list of automatic decisions and one-click revert. The sources page
shows one card per source with version, licence, counts, the automatically
linked share, a Refresh button that enqueues a job and a diff summary. The owner
edits a card in place: rename, pin a preferred name with a reason, set it
indexable, merge through search. Every action is audited with its inverse.
A weekly digest email counts new items and those carrying gardener objects.
Every decision records who made it, so a second curator later needs no
migration. Pages follow ADR-0023.

### D11. EPPO

The retained capture is reconciled onto the graph: codes as identifiers, names
in uk, bg, ru and en through the review ledger, taxonomy as corroboration. A
second observed capture, with the retained tooling and the same serial
constraints, adds hosts, distribution and categorization. Hosts become `pest_of`
relations with EPPO host classes; distribution becomes country-level presence
facts with the EPPO status verbatim and a normalized presence; categorization
becomes facts. Country-level status may be shown in the product, which
supersedes the source-only rule for it; EPPO publishes no coordinates at this
level and coordinates stay `forbidden`. The EPPO licence's attribution and last
download date appear on every card that shows an EPPO assertion. The public
archive at `/sources/eppo` stays and links to the canonical card.

### D12. Metrics

Catalog metrics live inside the product on an owner page and in Postgres, not
in GA: pick success rate, own-label rate, time to pick, the search-miss log,
auto-accept precision from revert rates, queue age. The search-miss log decides
which source and which long-tail nodes get attention next.

### D13. Sources and order

Each source is one full vertical slice: capture, normalize, reconcile, curate,
project, refresh. The order is the Slice 24 order below: graph foundation;
picker and labels; addresses; card; reconciliation; owner surfaces; Catalogue
of Life; Wikidata; EPPO; registers and breeds; WFO and GBIF; pest mentions in
entries; metrics; closeout. `docs/product-research/CATALOG_SOURCE_READINESS.md`
stays the source gate: blocked and conditional sources stay blocked and
conditional; GBIF occurrence data is never ingested; scraping is never used.
Pest mentions that gardeners link in entries, aggregated by oblast and week,
are first-hand data no source has and are part of this slice.

### D14. Rejected

A universal graph built in one step; showing gardener-added names to other
gardeners; asking the gardener a species question; zero-typing shortcuts; a
graph database; Meilisearch or any external search engine on the pick path;
a language model as the primary matcher (it is non-deterministic and cannot be
audited; it may assist ranking later); sources or conflicts in the gardener's
interface; wiki-style editing of cards by gardeners; GBIF occurrence points;
numeric identifiers in canonical URLs; localized slugs; a release model or a
Release Center of any kind.

### D15. Migration path

Evolutionary, never a big bang: the existing catalog tables are extended in
place with additive migrations, data is backfilled, reads switch, and legacy
columns and tables are dropped last with a rollback, a read-only inventory and
the owner's written approval, as `AGENTS.md` rule 10 requires. The runtime never
calls an upstream API; every source is consumed by an offline job. Every
migration in the slice has a rollback sibling and an executed proof on a fresh
bootstrap; every production application updates
`docs/PRODUCTION_SCHEMA_STATE.md` in the same PR.

## Vocabulary

The closed sets below are the contract between the fourteen tasks. A rename is
a breaking change for every later task and needs an amendment here.

- Node kind: `taxon`, `cultivar`, `breed`.
- Rank: `kingdom`, `phylum`, `class`, `order`, `family`, `subfamily`, `tribe`,
  `genus`, `subgenus`, `section`, `species`, `subspecies`, `variety`,
  `subvariety`, `form`, `unranked`, `cultivar`, `cultivar_group`, `grex`,
  `breed`, `strain`.
- Kingdom: `Plantae`, `Animalia`, `Fungi`, `Bacteria`, `Viruses`, `Chromista`,
  `Protozoa`, `Archaea`.
- Identity state: `active`, `merged`, `retired`.
- Name type: `scientific_accepted`, `scientific_synonym`, `vernacular`,
  `denomination`, `trade_designation`.
- Identifier scheme: `col`, `gbif`, `wfo`, `eppo`, `wikidata`, `ipni`, `powo`,
  `ua_register`, `eu_common_catalogue`, `vbo`, `grin`.
- Relation type: `form_of`, `pest_of`. Host class on `pest_of`: `major_host`,
  `host`, `wild_weed_host`, `incidental`, `experimental`, `artificial`,
  `unknown`.
- Fact predicate: `distribution_status`, `categorization`,
  `registration_status`. Normalized presence: `present`, `absent`,
  `transient`, `unknown`.
- Rights class: `source_public`, `source_only`, `forbidden`, `unknown`.
- Assertion decision: `automatic`, `curator_accepted`, `curator_rejected`,
  `superseded`.
- Queue item type: `label_link`, `node_merge`, `source_link`, `split_review`.
  Queue state: `open`, `accepted`, `rejected`, `skipped`, `auto_applied`,
  `reverted`.
- Action type: `merge`, `rename`, `link`, `unlink`, `pin_name`,
  `set_indexable`, `promote_label`, `revert`.
- Slug namespace: `species`, `form`.
- Picker match class, in rank order: `exact_vernacular_locale`,
  `prefix_vernacular_locale`, `exact_scientific`, `prefix_any`, `fuzzy`.
- Reason codes: `shared_identifier:{scheme}`, `exact_scientific_authorship`,
  `canonical_same_kingdom_rank`, `fuzzy_same_genus:{score}`,
  `denomination_equal`, `denomination_transliteration`, `co_usage:{n}`,
  `homonym_kingdom_conflict`.
- Job kinds: `catalog_reconcile`, `catalog_curation_apply`,
  `catalog_threshold_recalibrate`, `catalog_source_refresh`; retired:
  `catalog_match_suggestions_refresh`, `catalog_alias_suggestions_refresh`,
  `catalog_fuzzy_duplicate_qa_refresh`, and at closeout
  `catalog_typeahead_reindex`.

## Consequences

- The picker gets shorter and smarter without a new step; the composer loses
  its trust labels; a gardener never meets a source, a conflict or a queue.
- Public catalog URLs change once, to hierarchical paths, with permanent
  redirects from every old path; this is done before the catalog gains
  indexation, and never again.
- Catalogue of Life's full checklist lives in the source layer; canonical nodes
  exist only for what gardeners, registers and EPPO touch, so the primary list
  stays relevant while nothing is missing.
- The worker gains four job kinds and loses three; every change to the kind set
  regenerates the contract and ships as a sealed release.
- `AGENTS.md` hard rule 5 has one named exception; ADR-0022 D3 has one more
  `noindex` case; the account menu has six owner links.
- The owner's work after a source lands is a few dozen decisions at the top of
  the queue, then only what gardeners add; everything else is automatic.
- Production steps that need the owner each time: applying a migration,
  deploying a sealed worker release, running the second EPPO capture with the
  stored key, and the destructive closeout migration.

## Superseded clauses

- ADR-0025 D1, "No source-built catalog is planned": superseded. A source-fed
  catalog curated in place is planned and decided here; the release model,
  editions, extension packs and the Release Center stay retired.
- ADR-0025 D2, "Nothing here specifies them, and nothing here may pre-empt
  them": the EPPO plans are D11 of this record.
- ADR-0022 D3: the `noindex` list gains "an organism card without first-hand
  content" (D9).
- ADR-0022 D5: the account menu carries two more owner links (D10); the rule
  that admin is the product stands.
- `AGENTS.md` hard rule 5: one exception for the public catalog typeahead route
  (D7).
- `docs/TECH_STACK_DECISIONS.md` invariant 9: the typeahead is Postgres only.
- `docs/product-research/SPECIES_BACKBONE_POLICY.md`: country-level EPPO
  distribution status may reach the product (D11); the source precedence
  stands.

## Rollout and rollback

| Order | Issue | Slice | SQL |
| --- | --- | --- | --- |
| 1 | `OVE-386` | Graph foundation under the gardener catalog, zero visible change | `0054` |
| 2 | `OVE-387` | Postgres-only picker; a gardener's own name is a label | `0055` |
| 3 | `OVE-388` | Permanent addresses, slug history, permalinks, alias resolvers, Taxon JSON-LD | none |
| 4 | `OVE-389` | The organism card and the indexability rule | none |
| 5 | `OVE-390` | Reconciliation ladder in the worker, auto-accept with revert | `0056` |
| 6 | `OVE-391` | Owner curation: decision stream, source cards, inline edit, audit, digest | none (see issue) |
| 7 | `OVE-392` | Catalogue of Life backbone and the secondary search path | `0057` |
| 8 | `OVE-393` | Wikidata crosswalk and vernaculars | none |
| 9 | `OVE-394` | EPPO onto the graph; second capture for hosts, distribution, categorization | `0058` |
| 10 | `OVE-395` | Registered cultivars and breeds attached to species | none |
| 11 | `OVE-396` | WFO and GBIF identifiers | none |
| 12 | `OVE-397` | Pest mentions in entries; observed pest pressure | `0059` if a table is used |
| 13 | `OVE-398` | Catalog metrics on an owner page | `0060` |
| 14 | `OVE-399` | Closeout: legacy shape, Meilisearch catalog index, old kinds, docs, proof | `0061`, destructive, gated |

Migration numbers are reserved in `docs/MIGRATION_ALLOCATION.md`. A task with no
SQL that discovers it needs some reserves the next free number through a canon
change first.

Rollback is per task through its rollback script and the evolve-in-place rule:
every additive migration rolls back without touching gardener data; the
destructive closeout is applied last and only under the owner's written
approval. If this decision is falsified before the foundation lands, revert the
PR that merged this record; the retained EPPO capture and the gardener catalog
are untouched by that revert.

## Rejected alternatives

- Build the universal graph in one step: rejected because five sources
  reconciled at once without a proven process produce unreviewable conflicts;
  quality is per-assertion correctness, not breadth.
- Author OverGarden's own taxonomy: rejected; Catalogue of Life exists for that
  and the community converges on it.
- Show gardener-added names to every gardener: rejected by the owner on
  2026-09-05; the picker stays authoritative.
- Ask the gardener a species question when a name is not found: rejected by
  the owner on 2026-09-05 as one step too many.
- Zero-typing shortcuts in the picker: rejected by the owner on 2026-09-05.
- A graph database: rejected; Postgres answers at this scale and a second store
  is a second failure domain.
- Keep Meilisearch on the pick path: rejected; three searches per keystroke, a
  reindex lag and a worker dependency for a lookup Postgres answers alone.
- Numeric identifiers or localized vernaculars in canonical URLs: rejected;
  readable Latin slugs with permanent redirect history keep both stability and
  keyword value.
- A language model as the primary matcher: rejected for now; not deterministic,
  not auditable.
