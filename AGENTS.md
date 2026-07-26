# AGENTS.md — OverGarden

Operating guide for AI agents and humans working in this repo. Read this before any change. Current stack authority is `docs/TECH_STACK_DECISIONS.md` plus ADR-0014. `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md` is the binding construction and Definition-of-Ready contract for every new or materially rewritten Linear work item. Live non-secret infrastructure values and provider links live in `docs/INFRASTRUCTURE_REGISTRY.md`. Product-thinking research lives in `docs/product-research/`. Older ADRs are historical if ADR-0014 supersedes them.

## Project

OverGarden is a gardening journal plus catalog-as-social-graph for Ukraine and Bulgaria. The audience includes Ukrainian users under wartime risk, so location privacy and image metadata handling are safety-critical.

## Current MVP Scope

The current MVP scope reconciliation is `docs/MVP_SCOPE_RECHECK_2026-07-03.md`. It supersedes the 2026-07-01 OVE-96 decision that deferred lineage/social graph. SEO/AEO, localization, full M:N journaling, composer friction work, self-serve auth, and lineage/social graph are MVP scope as vertical SDD slices. Monetization is post-MVP. Apple Sign-In is not MVP after the 2026-07-04 founder decision; revisit it only after MVP if native App Store distribution or a fresh sign-in access requirement makes it necessary.
Object kinds are exactly `{plant, animal}`; a hive is an animal with a bee-breed catalog identity; see `docs/OBJECT_CATEGORY_MODEL_2026-07-23.md`.

Public SEO/AEO indexability policy lives in `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md` and `apps/web/src/server/public-surface-indexing-policy.ts`. Sitemap entries, route robots metadata, and structured data must use that server policy instead of duplicating thinness or public-surface rules.

## Current Stack

- Next.js App Router + TypeScript on Vercel.
- shadcn/ui only for UI primitives.
- Better Auth for auth.
- DigitalOcean Managed Postgres for production data; Apple Container-first local Postgres on supported Macs, with Docker only as fallback.
- Kysely as the typed SQL builder. SQL migrations are schema source of truth. No ORM.
- Cloudflare R2 for media: private quarantine bucket -> worker-created public derivative.
- Meilisearch as a derived public search/typeahead index.
- Python worker for RapidFuzz/Splink/PyICU/CyrTranslit matching, dedup, and reindex work.
- Plain Postgres `job_queue` table for TS -> Python background work. No Redis, no pgmq, no Python-only queue framework.
- PWA offline capture with Dexie/IndexedDB and idempotency keys.
- Cloudflare for DNS/edge/WAF/R2. Cloudflare must not cache HTML.

## Container Runtime Policy

- Runtime authority lives in `docs/CONTAINER_RUNTIME_POLICY.md`.
- Prefer Apple Container for local containerized development on supported Apple Silicon/macOS 26 machines.
- Use Docker only as a fallback when Apple Container is unavailable or does not provide a required feature, such as GitHub Actions Ubuntu service containers, Linux production droplet process management, mature Compose restart policies, or another explicitly verified gap.
- Do not assume Docker Desktop is required for local OverGarden work after OVE-77. Local Postgres, Meilisearch, and MinIO start through `infra/container-up`; matching-image and worker/search smoke use the Apple Container-first path on supported Macs.
- GitHub Actions Ubuntu CI may keep Docker service containers as the OVE-75 platform-bound exception; never treat that as a local Docker Desktop prerequisite.
- When Docker remains in CI, production, or fallback docs, state why Apple Container does not fit that specific surface.

## Hard Rules

1. User/product precise location remains locked in v0. Do not collect, store, send, log, index, render, or infer precise coordinates for OverGarden users, journal entries, media, analytics, public/search documents, operator evidence, or product UI; region-level or hidden only. External catalog/source ingestion may store legally reusable occurrence/distribution coordinates only in isolated raw/source snapshot tables with provenance, license, and usage flags; those fields must stay out of user data, analytics, Meilisearch/public projections, logs, and product UI unless a later explicit ADR and SDD slice promote a safe aggregate projection.
2. Public photos must be stripped derivatives. Upload originals only to private quarantine, re-encode/resize/strip with `sharp`, publish derivative only, delete the original after successful processing.
3. Client-side EXIF stripping is an optimization, not a safety boundary. Never trust client processing as the only privacy control.
4. No browser-direct broad database access. All app data access goes through server APIs/server actions/repositories. Presigned upload URLs are narrow object-specific exceptions.
5. Kysely is allowed and expected. Do not introduce Prisma, Drizzle, TypeORM, or another ORM without a superseding ADR.
6. Scoped repositories are mandatory for user/private data. Types do not protect against missing `user_id`, visibility, or public/private predicates.
7. Meilisearch indexes public rows only. Treat search indexing as a privacy boundary and test it.
8. Realtime is not a source of truth. Add live updates only after the canonical server fetch path exists.
9. Public editorial, landing, guide, and answer SEO/AEO pages may be server-rendered and indexable at MVP launch when they contain useful first-party content. Thin, unsafe, or user-generated public pages, including UGC, variety, topic, lineage, and profile pages, must stay `noindex` and out of sitemaps until explicit quality gates promote them.
10. No secrets in git. Use env vars/platform secret stores. `.env*` is git-ignored except `.env.example`.
11. Do not guess external service values. Read `docs/INFRASTRUCTURE_REGISTRY.md` before touching DNS, R2, media URLs, deployment env, or external service wiring, then verify live provider state when drift would matter.
12. Do not make product decisions from implementation convenience alone. Before shaping a feature, UI flow, public page, analytics event, onboarding step, or user-facing Linear issue, run the Product Thinking Gate in `docs/product-research/README.md`. Every `User-facing: no` issue, including remediation, operator, security, migration, decision, canon, and coordination work, must still state its protected product/trust/reliability outcome, load-bearing assumption, and falsification signal under `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`; it must choose exactly one branch: identical non-empty sets of genuinely constraining non-README research paths in both its Product Thinking rationale and Required context, or a specific task-local no-direct-research conclusion with zero research paths. A `coordination_container` names the protected integration outcome and child evidence while owning zero implementation.
13. Launch guest corpus hygiene is governed by `docs/LAUNCH_CORPUS.md` (OVE-199): never present production smoke/visual fixtures as real gardeners; production archive/seed requires explicit maintainer sign-off on the exact plan report.
14. MVP learning for H1/H4/H6 is governed by `docs/MVP_LEARNING_SIGNALS.md` (OVE-200): synthetic/editorial/bot actors are exclusions only; unclassified activity fails the decision gate closed; self-serve and closed-pilot cohorts stay separate.

## Workflow

- Build a walking skeleton first, then vertical SDD slices.
- Keep changes scoped and wire all affected surfaces together: SQL/types -> repository -> route/action -> UI -> tests -> docs.
- Prefer machine-checkable guardrails over prose instructions: typecheck, lint, focused tests, privacy tests, SSR tests, media tests, search-index tests.
- Before starting the next Linear issue after completed critical work, read `docs/MAINLINE_CLOSEOUT.md` and run `cd apps/web && pnpm mainline:closeout:check`. For any repository change, Linear `Done` is not accepted until the implementation commit is contained in current `origin/main`; exact-SHA deployment/provider proof is additive. An external-state-only operator task with no repository delta must instead carry the explicit provider receipt and no-code declaration required by the Linear task standard. A non-executable coordination container creates no branch or effect and closes directly from independently completed children, an acyclic relation read-back, and its own integration receipt.
- Any Linear SDD issue touching media, DNS, production env, deployment, storage, or external services must include `docs/INFRASTRUCTURE_REGISTRY.md` under the exact `Required context` heading and update it when external values change.
- Any Linear SDD issue with user-facing behavior must include `docs/product-research/README.md` plus the relevant 2-5 research files selected by the Product Thinking Gate.
- English for code, identifiers, comments, commit messages, and repository docs.
- Conventional Commits.

## Product Research

`docs/product-research/` is the duplicated research corpus from the original Startups research folder. Treat it as the repo-local product memory for ICP, JTBD, positioning, brand, IA, UX, SEO/content, growth, business model, trust/privacy, and validation evidence.

Do not treat copied research files as the current technical stack authority when they conflict with root repo docs. Product facts come from the research corpus; implementation facts come from `AGENTS.md`, `docs/TECH_STACK_DECISIONS.md`, ADR-0014, the SDD roadmap, and live code.

## Linear SDD Task Rule

Every new or materially rewritten Linear work item must conform to `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`, start from `docs/linear/AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md`, and pass the tracked validator before creation/update and again after Linear read-back. This includes product execution, remediation, migrations, infrastructure/provider/release work, decision spikes, canon correction, and non-executable coordination containers; the standard defines the exact vertical or bounded-exception contract for each kind.

OVE-213 through OVE-244 are open pre-`overgarden.linear-sdd.v1` reference tasks, not ready-to-execute exceptions. Before any one is assigned, moved to `In Progress`, or implemented, re-audit and materially rewrite that individual issue against current `main`, authenticated current Linear fields/relations, external state, and the full standard; pass draft and final validation; save it; read the complete Linear issue back; and prove the saved-description digest matches. Do not bulk-certify the range or change its execution state as part of governance-only standardization.

Run:

```bash
cd apps/web
pnpm linear:task:check -- --file ../../path/to/issue.md --phase final
pnpm linear:task:standard:check
```

Product execution issues must be vertical SDD slices, not layer tickets. A valid issue starts from a concrete user behavior and owns every affected layer needed to prove that behavior end to end: SQL/types -> scoped repository -> route/action/API -> UI -> background job/search/media/offline/event boundary when relevant -> tests -> docs. Remediation and operator exceptions must still own a complete observable journey, one enforceable boundary, bounded blast radius, rollback, and executable read-back; do not add fake UI or unrelated layers to satisfy a quota.

Do not create standalone product-execution issues such as "build schema", "build UI", "add media pipeline", "add analytics", "build public pages", or "wire search" unless that work is inside the same user-visible path. Before creating or accepting any Linear work item, run the common `SDD Slice Test` plus its issue-kind-specific test in `docs/SDD_VERTICAL_SLICE_ROADMAP.md`; rewrite any item that fails its applicable test before implementation or coordination.

Never treat a linked document, parent issue, comment, or prior chat as a substitute for task-local invariants, state/protocol/concurrency semantics, dependencies, acceptance criteria, commands, rollback, failure gates, or exact-SHA closeout. Never assign or start implementation while placeholders, stale evidence, ownership ambiguity, cyclic relations, missing approval, or validator failures remain.

The roadmap is not the full backlog. Authenticated current Linear read-back is the primary queue authority; `Current Execution State` in `docs/SDD_VERTICAL_SLICE_ROADMAP.md` is its dated repository mirror. Any discrepancy blocks task selection until both are reconciled and read back. Older execution-batch text and task-local OVE-213 through OVE-244 implementation facts are historical provenance unless explicitly reverified. Later horizon slices must be rewritten into fresh agent-executable Linear tasks after current implementation friction and product learning are reviewed.

## Decision Changes

Existing ADRs are immutable historical records. To change a stack decision, add a superseding ADR and update the consolidated docs/instructions so future agents do not read contradictory canon.

## Do Not Touch Without Explicit Maintainer Sign-off

- Destructive database changes, schema drops, bulk deletes, history rewrites, force-push.
- Weakening location privacy, media derivative guarantees, scoped repository rules, or search-index privacy boundaries.
