# Lineage Scope Decision

Status: superseded execution decision
Date: 2026-07-01
Owner: founder/operator
Scope: lineage, provenance edges, claims, handles, invites, follow, and social graph implementation

## Superseded By 2026-07-03 Founder Decision

This 2026-07-01 decision is no longer the current MVP scope.

On 2026-07-03, the founder/operator explicitly superseded the post-MVP gate and approved lineage/social graph for MVP execution now. The current scope includes provenance edges, chains, claim inbox, invitations, public-safe `@handle` identity/profile, cross-user mention/typeahead, lineage graph readback, follow, ask-the-lineage, followed feed, and bounded notifications, while preserving all privacy and consent invariants below.

Current execution documentation:

- `docs/MVP_SCOPE_RECHECK_2026-07-03.md`
- Linear `OVE-114` through `OVE-139`, especially `OVE-122` through `OVE-126` and `OVE-133` through `OVE-135`

The historical caution in this file remains useful context, but it is not an instruction to block MVP lineage work anymore.

## Historical Decision (Superseded)

Lineage and social graph are post-MVP for current execution. They must not be started during founder rehearsal, the first friendly closed pilot, or the post-audit hardening batch.

The current MVP execution remains focused on:

- journal capture and same-object return behavior;
- safe publication and archive/readback;
- photo derivative safety;
- catalog/typeahead and source-backed seed quality;
- privacy, erasure readiness, and pilot trust copy;
- H1/H4/H6 pilot learning;
- public UGC/SEO readiness for journal and variety pages.

This decision supersedes the operational reading of `docs/product-research/LINEAGE_SOCIAL_GRAPH_SPEC_v0.md` and `docs/product-research/OverGarden_MVP_PRD_v0.md` where those files describe S14-S20 as full v0 scope. Those research files remain useful historical/product context, and their AC-INV1-5 privacy constraints remain binding for any future lineage work, but they are not authorization to implement social graph surfaces in the current MVP execution queue.

## Historical Why

`LINEAGE_SOCIAL_GRAPH_SPEC_v0.md` records a 2026-06-21 operator decision to build the full lineage layer in v0. Later repo execution did not implement that layer: `docs/SCAFFOLD_STATUS.md` records journal, publication, catalog, pilot, runtime, and post-audit hardening work, but no lineage tables, handles, follows, claim inbox, invitations, graph UI, or social graph job path.

The product risk is not that lineage is weak. The risk is sequencing. Lineage can create retention and defensibility, but it also adds sensitive cross-user identity, consent, and location-adjacent exposure before the single-player journal habit and public publishing behavior have been proven by real closed-pilot users.

The current active product learning gates remain:

- H1: real gardeners sustain a useful narrative journal habit.
- H4: real gardeners are willing to publish to an open/indexed channel.
- H6: public UGC can support organic discovery after H1 and H4 create enough public material to measure.

Lineage is a moat candidate after those gates, not a substitute for them.

## Historical Reconsideration Gates

Do not open implementation work for lineage/social graph until all gates below are true or a later dated founder/operator decision explicitly replaces this file.

1. Real closed-pilot evidence exists from `closed_pilot` users, not `founder_rehearsal` users. Founder rehearsal proves operator readiness only.
2. H1 is strong enough to widen learning: `/garden/pilot-learning/decision` reaches `continue`, or a founder/operator decision records why an `iterate` result is sufficient for a narrow next slice. The current `continue` rule is invited first-save rate at or above roughly two-thirds and returning gardeners at roughly 30% of first savers, with segment distribution checked.
3. H4 is not unknown or failed: `/garden/pilot-health` and/or `/garden/pilot-learning/decision` shows real `closed_pilot` publication behavior, and any H4 interpretation is recorded against `docs/product-research/KILL_CRITERIA_PREREG_v2.md` rather than inferred from internal smoke.
4. Public/legal/privacy readiness is not blocking the new surface: erasure/anonymization, public copy, and search/noindex rules are ready for a cross-user feature that can preserve structural edges after account erasure.
5. A fresh SDD slice exists and passes the roadmap SDD Slice Test. It must own the full user behavior end to end and must name the exact subset being built.

## Historical Non-Goals

Do not add any of the following in current MVP execution:

- lineage or edge tables;
- user handles;
- follow relationships;
- claim/confirm/decline inbox;
- non-user invitations for provenance;
- ask-the-lineage flows;
- lineage graph UI;
- cross-user typeahead;
- social graph notifications or jobs;
- public profile or full lineage graph routes.

Do not add a narrow precursor unless a later Linear issue explicitly names it and repeats the gates above. A schema-only precursor is not allowed.

## Current Lineage MVP Slice Rules

Any lineage MVP slice must keep AC-INV1-5 from `OverGarden_MVP_PRD_v0.md` and `CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md` as hard acceptance criteria:

- public/indexed cross-user artifacts are variety-mediated, not person-location mediated;
- tags/follows/mentions never raise target visibility;
- consent lives in the edge state;
- cross-links are earned and abuse-resistant;
- erasure uses irreversible anonymization and removes region from rare tombstones when needed to avoid re-identification.

The current slice sequence must test provenance value in small vertical behaviors without building the whole social network at once. Use the fresh Linear issues named in `docs/MVP_SCOPE_RECHECK_2026-07-03.md`, not the historical Slice 6 text.

## Current Next-Agent Instruction

The correct current action is:

1. Treat lineage/social graph as approved MVP scope under `docs/MVP_SCOPE_RECHECK_2026-07-03.md`.
2. Use the fresh vertical SDD issues in Linear, especially OVE-122 through OVE-126 and OVE-133 through OVE-135.
3. Preserve every privacy, consent, no-visibility-escalation, erasure, and public-safe projection invariant in this file and in `docs/product-research/CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md`.
4. Do not implement lineage as a schema-only, backend-only, or social-network-generic task.

## Historical Next-Agent Instruction (Superseded)

If a future agent sees S14-S20, lineage, follows, handles, claims, invitations, provenance edges, or social graph in product-research files, it must read this file first.

Unless this file has been superseded by a newer dated decision, the correct action is:

1. Do not implement lineage/social graph.
2. Continue current MVP/pilot hardening and evidence work.
3. If the task explicitly asks for lineage, stop and require a new founder/operator decision or a fresh vertical SDD slice that cites this file and proves the reconsideration gates.
