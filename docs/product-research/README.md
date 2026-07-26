# Product Research Corpus

Status: imported product-thinking source corpus
Imported from: `/Users/yehor/Desktop/Startups/OverGarden`
Imported on: 2026-06-26
Scope: ICP, JTBD, market, positioning, product strategy, information architecture, SEO/content strategy, trust/privacy, virality, business model, catalog/data strategy, and validation evidence.

This directory duplicates the OverGarden research folder into the app repository so agents can work from one repo context instead of relying on a separate desktop folder.

## Authority Boundaries

Use this corpus as product-thinking authority for:

- ICP, personas, segments, geography, language, and cultural context.
- User problems, JTBD, motivation, trust, privacy concerns, and diary/journal behavior.
- Positioning, brand, messaging, objections, copy direction, and category framing.
- Product flows, information architecture, content architecture, SEO/GEO/AEO strategy, and launch wedge.
- Market, business model, pricing hypotheses, GTM, risks, kill criteria, and validation evidence.
- Catalog/data/matching requirements when shaping user-facing product behavior.

Do not use this corpus as the final authority for current implementation stack when it conflicts with root repo docs. For runtime architecture, use:

- `AGENTS.md`
- `docs/TECH_STACK_DECISIONS.md`
- `docs/adr/ADR-0014-agentic-stack-realignment.md`
- `docs/SDD_VERTICAL_SLICE_ROADMAP.md`
- `docs/INFRASTRUCTURE_REGISTRY.md`

If a copied research file such as `TECH_STACK_DECISIONS.md` conflicts with the current root stack docs, the root repo docs win for implementation. The research file still remains useful as historical context.

## Product Thinking Gate

Before creating, accepting, or implementing any user-facing Linear issue, product feature, UI flow, public page, onboarding path, analytics event, catalog behavior, or GTM-facing surface:

1. Search this corpus with `rg` for the feature, user behavior, segment, object type, market, language, privacy risk, or growth mechanism.
2. Select the 2-5 most relevant research files and include them under the task's exact `Required context` heading.
3. State the product assumption the slice is testing.
4. State the user job, motivation, or trust concern that shaped the implementation.
5. If research docs conflict with each other or with current implementation docs, name the conflict and choose the smallest reversible path.
6. Keep the SDD shape vertical: the research informs one user behavior; it does not justify layer-only tasks.

For pure remediation, security, privacy, migration, infrastructure, provider, release, decision, canon, or non-executable coordination work with no user-facing behavior, record the protected product/trust/reliability or integration outcome, load-bearing assumption, and falsification signal required by `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`. Cite product-research files only when they genuinely constrain the decision; when none does, record a specific task-local no-direct-research conclusion instead of padding the task with irrelevant context. One of those two paths is mandatory. A coordination container instead proves its child DAG and integration receipt with zero own implementation. This exception does not waive product invariants, executable proof, or the issue-kind contract.

The research and no-direct-research paths above are mutually exclusive. The research path requires identical non-empty sets of non-README file paths in the issue's Product Thinking rationale (each with its task-local constraint) and Required context (for baseline existence verification). The no-direct path requires zero product-research paths. Partial overlap, a Product-Thinking-only citation, a context-only citation, or a no-direct conclusion combined with citations does not satisfy the gate.

## Fast Routing

Use these entry points first, then search deeper with `rg`.

### Canon And Strategy

- `MASTER_DOSSIER.md`
- `DRIVE2_CANON_v1.md`
- `SYNTH_CANON_FINAL.md`
- `DECISION_LAYER.md`
- `OverGarden_MVP_PRD_v0.md`
- `OverGarden_BUSINESS_PLAN_v1.md`
- `LEAN_CANVAS_v1.1.md`
- `RISK_REGISTER.md`
- `KILL_CRITERIA_PREREG_v2.md`

### ICP, Segments, JTBD, User Voice

- `ЦА_CANON_v1.md`
- `ICP_DRAFT_v0_HYPOTHESIS.md`
- `SEGMENT_RESEARCH_WAVE1_PLANTS_v1.md`
- `JOBSPACE_MAP.md`
- `JOB_CLUSTERS.md`
- `CROSS_LOCALE_BG_UA.md`
- `STATE_OF_UA.md`
- `STATE_OF_BG.md`
- `UA_summaries_all.md`
- `BG_summaries_all.md`
- `Пряма мова — Threads.md`
- `Пряма мова — bg mamma.md`

### Product, IA, UX, Trust

- `B3_INFORMATION_ARCHITECTURE_AND_FLOWS_v0.md`
- `OverGarden_PAGE_ARCHITECTURE_v1.md`
- `OverGarden_PAGE_ARCH_DECISIONS_v0.md`
- `CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md`
- `ENTRY_DATA_AND_RANKABILITY_SPEC_v0.md`
- `Механіки логування.md`
- `overgarden-living-journals.md`
- `MVP_LOGGING_DESIGN-BRIEF.md`

### Positioning, Brand, Messaging

- `POSITIONING_CANON_v1.md`
- `BRAND_CANON_v1.md`
- `BRAND_REFERENCE_STRATEGY_v1.md`
- `C1_POSITIONING_MESSAGING_OBJECTIONS_v0.md`
- `LEXICON_AND_OBJECTIONS.md`
- `C2_LANDING_SMOKE_TESTS_v1.md`

### SEO, Public Content, Growth

- `B5_SEO_CONTENT_ARCHITECTURE_v2.md`
- `AI_SEO_SYNTHESIS_v0.md`
- `GEO_AEO_DELTA_RESEARCH_v1.md`
- `VIRALITY_RESEARCH_FINAL.md`
- `VIRALITY_RESEARCH_SUMMARY.md`
- `BEACHHEAD_GTM_v0.md`
- `WEDGE_MATRIX.md`

### Market, Business, GTM

- `TAM_SAM_SOM_UA.md`
- `TAM_SAM_SOM_BG.md`
- `TAM_SAM_SOM_combined_viability.md`
- `B4_PRICING_MONETIZATION_HYPOTHESIS_v0.md`
- `OverGarden_B2_METRICS_v0.md`
- `C2_RECRUITING_AND_SCREENER_v4.md`
- `C2_INTERVIEW_GUIDE_v2.md`
- `C3_COMPETITIVE_MATRIX_v2.md`
- `D1_SWOT_v1.md`
- `D3_PORTERS_FIVE_FORCES_v1.md`

### Catalog, Data, API, Matching

- `DB_SEED_AND_DATA-MODEL_SPEC_v1_2.md`
- `MATCHING-ENGINE_STACK_SPEC.md`
- `API_SYNTHESIS_INDEX.md`
- `API_TOOLS_SUMMARY.md`
- `API_TOOLS_README.md`
- `API_TOOLS_RESEARCH__SUMMARY.md`
- `API_VERIFY_RESULTS.md`
- `DECISION_BRIEF_DATA-SOURCING.md`
- `SOURCES_REGISTRY.md`

### Lineage And Social Graph

- `LINEAGE_SOCIAL_GRAPH_SPEC_v0.md`
- `GRAY_NODES_HYPOTHESES.md`
- `ONLYFARMERS_FINAL.md`
- `ONLYFARMERS_OSINT_DOSSIER.md`

## Maintenance

- Keep this directory in sync when the source research folder changes.
- Prefer adding a short update note or a new canon file over silently editing imported research history.
- When a research insight becomes binding for implementation, promote it into `AGENTS.md`, `docs/SDD_VERTICAL_SLICE_ROADMAP.md`, a current spec, or an ADR instead of leaving it only in this corpus.
