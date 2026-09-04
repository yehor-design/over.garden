# Product Research Corpus

Status: pre-development research, reconciled with the repository on 2026-09-04
Source folder: `/Users/yehor/Desktop/Startups/OverGarden` (kept in sync with this directory)
Reconciled against: `main` `ab52664`

## The one rule

**This corpus is not the source of truth about the product. The repository is.**

Everything here was written before the code existed. The product went through several
product turns since, and a number of decisions recorded in these files were cancelled.
What the corpus still owns: market, ICP, JTBD, the actual words users use, positioning,
competitors, GTM, risk, and the numbers behind the bet. What it no longer supplies:
product and technical decisions.

## Read in this order

1. **`PRODUCT_CANON_2026-09.md`** — what the product is today, verified against the code. Read it first.
2. **`SUPERSEDED_DECISIONS_LEDGER.md`** — every cancelled research decision, what replaced it, and where that is recorded.
3. **`RESEARCH_STATUS_INDEX.md`** — the class of every file: `ЧИННЕ` (current), `ДОКАЗ` (evidence),
   `ЗАМІЩЕНО-ЧАСТКОВО` (partly superseded), `ЗАМІЩЕНО-ПОВНІСТЮ` (fully superseded),
   `РЕТРОСПЕКТИВА` (retrospective), `ІНСТРУМЕНТ` (research instrument).
4. Then the two to five files that actually bear on the task.

Every file carries a dated status header. A file without one was added after 2026-09-04 and
has no status: treat it as partly superseded until it is checked against the canon.
Corrections made inside a file are tagged `[ПЕРЕПИСАНО 2026-09-04]` — grep for that tag to
see exactly what was rewritten and why.

The corpus is written in Ukrainian, and so are the three guiding documents above; this README
is the English repo-facing entry point to them.

## Where implementation truth lives

| Question | Answer in the repository |
| --- | --- |
| What is live in production | `docs/PROJECT_STATE.md` |
| How we work, the hard rules | `AGENTS.md` |
| Current decisions | `docs/adr/ADR-0022`, `ADR-0023`, `ADR-0024` |
| The stack in detail | `docs/TECH_STACK_DECISIONS.md` |
| Providers, domains, env | `docs/INFRASTRUCTURE_REGISTRY.md` |
| Which migrations production actually runs | `docs/PRODUCTION_SCHEMA_STATE.md` |
| What shipped in September and why | `docs/DELIVERY_LOG_2026-09.md` |

Older ADRs are immutable history and never override the current ones.
Note that `docs/product-research/TECH_STACK_DECISIONS.md` is now a pointer and a delta —
the root `docs/TECH_STACK_DECISIONS.md` is the stack authority.

## Product Thinking Gate

Before implementing a user-facing change:

1. Read `PRODUCT_CANON_2026-09.md`.
2. Find the two to five research files that genuinely bear on the change (`rg` this corpus for
   the feature, segment, market, language, privacy risk, or growth mechanism) and name them
   under the task's `Key files`.
3. If a research file conflicts with the canon, **the canon wins**. Say so in one sentence and
   take the smallest reversible path.
4. Work with no user-facing behaviour cites a research file only when it genuinely constrains
   the decision; otherwise it says so in one sentence.

## Maintaining the corpus

- When a research finding becomes binding for implementation, **promote it into the repository**
  (an ADR, a current spec, `AGENTS.md`) instead of leaving it only here.
- When the product cancels a research decision, **add a row to `SUPERSEDED_DECISIONS_LEDGER.md`**
  and fix that file's status header in the same pull request.
- Add new research as a new file with a status header, not as an edit to old evidence.
- **Never rewrite raw evidence** (verbatim user voice, per-block summaries, corpus numbers).
  Its value is precisely that it was not edited.

## Fast routing

### Canon and strategy

- `MASTER_DOSSIER.md`, `DRIVE2_CANON_v1.md`, `SYNTH_CANON_FINAL.md`, `DECISION_LAYER.md`
- `OverGarden_MVP_PRD_v0.md`, `OverGarden_BUSINESS_PLAN_v1.md`, `LEAN_CANVAS_v1.1.md`
- `RISK_REGISTER.md`, `KILL_CRITERIA_PREREG_v2.md`

### ICP, segments, JTBD, user voice

- `ЦА_CANON_v1.md`, `ICP_DRAFT_v0_HYPOTHESIS.md`, `SEGMENT_RESEARCH_WAVE1_PLANTS_v1.md`
- `JOBSPACE_MAP.md`, `JOB_CLUSTERS.md`, `CROSS_LOCALE_BG_UA.md`
- `STATE_OF_UA.md`, `STATE_OF_BG.md`, `UA_summaries_all.md`, `BG_summaries_all.md`
- `Пряма мова — Threads.md`, `Пряма мова — bg mamma.md`, `LEXICON_AND_OBJECTIONS.md`

### Product, IA, UX, trust

- `B3_INFORMATION_ARCHITECTURE_AND_FLOWS_v0.md`, `OverGarden_PAGE_ARCHITECTURE_v1.md`
- `OverGarden_PAGE_ARCH_DECISIONS_v0.md`, `CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md`
- `ENTRY_DATA_AND_RANKABILITY_SPEC_v0.md`, `Механіки логування.md`
- `overgarden-living-journals.md`, `MVP_LOGGING_DESIGN-BRIEF.md`

### Positioning, brand, messaging

- `POSITIONING_CANON_v1.md`, `BRAND_CANON_v1.md`, `BRAND_REFERENCE_STRATEGY_v1.md`
- `C1_POSITIONING_MESSAGING_OBJECTIONS_v0.md`, `LEXICON_AND_OBJECTIONS.md`, `C2_LANDING_SMOKE_TESTS_v1.md`

### SEO, public content, growth

- `B5_SEO_CONTENT_ARCHITECTURE_v2.md`, `AI_SEO_SYNTHESIS_v0.md`, `GEO_AEO_DELTA_RESEARCH_v1.md`
- `VIRALITY_RESEARCH_FINAL.md`, `BEACHHEAD_GTM_v0.md`, `WEDGE_MATRIX.md`

### Market, business, GTM

- `TAM_SAM_SOM_UA.md`, `TAM_SAM_SOM_BG.md`, `TAM_SAM_SOM_combined_viability.md`
- `B4_PRICING_MONETIZATION_HYPOTHESIS_v0.md`, `OverGarden_B2_METRICS_v0.md`
- `C2_RECRUITING_AND_SCREENER_v4.md`, `C2_INTERVIEW_GUIDE_v2.md`, `C3_COMPETITIVE_MATRIX_v2.md`
- `D1_SWOT_v1.md`, `D3_PORTERS_FIVE_FORCES_v1.md`

### Catalog, data, sources

- `CATALOG_SOURCE_READINESS.md` and `SPECIES_BACKBONE_POLICY.md` — **current gates**
- `DB_SEED_AND_DATA-MODEL_SPEC_v1_2.md`, `MATCHING-ENGINE_STACK_SPEC.md` — superseded build specs
- `SOURCES_REGISTRY.md`, `DECISION_BRIEF_DATA-SOURCING.md`, `API_*`

### Lineage and social graph

- `LINEAGE_SOCIAL_GRAPH_SPEC_v0.md`, `GRAY_NODES_HYPOTHESES.md`
- `ONLYFARMERS_FINAL.md`, `ONLYFARMERS_OSINT_DOSSIER.md`

### Drive2 audits

- `drive2/` — dated 2026-07-05 audits and implementation notes; retrospective only.
