# OverGarden Whole-Repo Review

> Historical review snapshot. This document reviewed commit
> `27e95e76968b042c717b336ab99b1b5e156844a1` on 2026-06-27 and is not the
> current source of truth for execution. Use current Linear issues,
> `docs/SDD_VERTICAL_SLICE_ROADMAP.md`, `docs/SCAFFOLD_STATUS.md`, and the live
> repository state before planning or implementing work.

Date: 2026-06-27
Repository: `/Users/yehor/frontend/over.garden`
Branch reviewed: `main`
Commit reviewed: `27e95e76968b042c717b336ab99b1b5e156844a1`

This review was performed in review mode. No source files, git state, Linear state, or GitHub state were changed.

Checks run:

- `git fetch --prune`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `uv run python -m py_compile app/__init__.py app/main.py app/search.py app/worker.py`
- GitHub PR and CI history inspection

`pnpm local:bootstrap` and `pnpm db:types` were inspected but not run because `db:types` rewrites tracked generated files and the task was review-only.

## 1. Executive Judgment

Verdict: `Yellow`.

I would not put an unsupervised real pilot cohort through this today. I would allow only a founder-supervised friendly pilot after one hardening slice, with no claim that search/SEO is healthy and no open self-serve traffic.

The single biggest risk is that the core private journal path is disciplined, but several edge boundaries fail open: operator access, auth secret fallback, media ownership, and worker/search jobs. These are exactly the kinds of issues that make a product appear ready while silently weakening the trust model.

The highest-leverage fix is one vertical hardening slice before pilot: fail-closed auth/operator roles, owner-consistent media attachment/public reads, and worker unknown-job failure/dead-letter handling.

The current codebase is not a rewrite candidate. It is architecturally coherent enough to continue, but not safe enough to treat as public-pilot ready.

## 2. Top Findings

### Finding 1

- Severity: `P1`
- Confidence: `High`
- Area: privacy / code
- Files/lines: `apps/web/src/app/api/media/uploads/route.ts:15`, `apps/web/src/server/media/media-repository.ts:11`, `apps/web/src/server/media/media-repository.ts:100`, `apps/web/src/server/journal-repository.ts:1209`, `apps/web/src/server/public-variety-repository.ts:166`, `apps/web/src/server/public-variety-repository.ts:276`
- Evidence: upload API accepts optional `journalEntryId`; media row stores it with current `owner_user_id` but does not verify the entry belongs to that owner. Later public journal/variety media joins select processed media by `journal_entry_id` without asserting `media_assets.owner_user_id = journal_entries.owner_user_id`.
- Why it matters: if an entry UUID is known, one user can associate their processed derivative with another user's public entry. UUID secrecy is not an authorization boundary. This is a public content-injection/privacy-boundary bug.
- Violated invariant or research logic: `AGENTS.md` hard rule 6 requires scoped repositories for user/private data; hard rule 2 requires public media boundary to be trustworthy. `docs/product-research/CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md` defines visibility safety as binding, not best-effort.
- Recommended fix: reject `journalEntryId` at upload unless an owner-scoped repository proves the entry belongs to the current user; in attach/update path, validate target entry ownership; add owner equality to all public media joins; consider DB-level composite constraint or trigger if practical.
- Verification: add a cross-user test where user B uploads/processes a photo with user A's entry id; public journal and variety pages must not render B's derivative, and the API should return 403/400.

### Finding 2

- Severity: `P1`
- Confidence: `High`
- Area: security / infra
- Files/lines: `apps/web/src/lib/auth.ts:10`, `apps/web/src/lib/auth.ts:17`, `docs/INFRASTRUCTURE_REGISTRY.md:253`
- Evidence: Better Auth uses a hardcoded development secret when `BETTER_AUTH_SECRET` is absent. Infra docs say production env has the secret installed, but runtime code does not fail closed if that assumption drifts.
- Why it matters: a missing production env var becomes a known session-signing secret. This is exactly the kind of deployment fragility that makes a passed smoke non-durable.
- Violated invariant or research logic: `AGENTS.md` hard rule 10 says no secrets in git; production auth must not silently fall back to deterministic scaffolding.
- Recommended fix: allow the fallback only in explicit local development/test. In production/Vercel, throw during startup or expose a hard failed readiness state before auth is usable.
- Verification: targeted test or build-time check with `NODE_ENV=production` and no `BETTER_AUTH_SECRET` must fail; normal local dev still works.

### Finding 3

- Severity: `P1`
- Confidence: `High`
- Area: privacy / UX / code
- Files/lines: `apps/web/src/server/catalog-curator-auth.ts:12`, `apps/web/src/server/pilot-health-access.ts:14`, `apps/web/src/server/erasure-request-access.ts:14`, `docs/SCAFFOLD_STATUS.md:107`
- Evidence: empty `CATALOG_CURATOR_USER_IDS` falls back to any authenticated user. That same gate is reused for catalog curation, pilot health, and erasure request operator surfaces.
- Why it matters: a normal pilot user can become an operator if env is missing or empty. That can expose aggregate pilot health, erasure request metadata, and curation mutation surfaces.
- Violated invariant or research logic: privacy/trust docs treat operator and cross-user boundaries as safety-critical, not convenience gates.
- Recommended fix: fail closed in production when the allowlist is empty; split roles or define one explicit `OPERATOR_USER_IDS`; tests should assert denial for non-operators.
- Verification: signed-in non-operator manually sees denied state on `/garden/catalog/curation`, `/garden/pilot-health`, `/garden/privacy/erasure-requests`; server actions reject mutation.

### Finding 4

- Severity: `P1`
- Confidence: `High`
- Area: search / infra / product
- Files/lines: `services/matching/app/worker.py:27`, `services/matching/app/worker.py:108`, `apps/web/src/app/garden/objects/[objectId]/actions.ts:115`, `docs/PRODUCTION_PILOT_SMOKE.md:116`
- Evidence: publish/archive enqueues `journal_entry_index` and `journal_entry_unindex`; Python worker only handles catalog typeahead. Unsupported jobs return without error and are marked `done`.
- Why it matters: public journal search/deindex jobs are silently dropped. This invalidates H6/search-readiness claims and can become a privacy problem once indexed journal docs exist.
- Violated invariant or research logic: search is a privacy boundary; `docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md` requires deletion to deindex and search health to be proven, not assumed.
- Recommended fix: implement journal index/unindex or mark unsupported jobs failed/dead-letter with explicit `last_error`; add a typed job-kind contract shared by TS and Python docs/tests.
- Verification: worker test proves unsupported kind is not marked done; publish creates public-safe search doc; archive removes it.

### Finding 5

- Severity: `P1`
- Confidence: `Medium`
- Area: infra / product
- Files/lines: `docs/PRODUCTION_PILOT_SMOKE.md:10`, `docs/PRODUCTION_PILOT_SMOKE.md:28`, `docs/INFRASTRUCTURE_REGISTRY.md:287`
- Evidence: current `main` is newer than the documented production deployment snapshot. Docs say preview passed the full browser smoke, while production closeout still requires the same smoke on the selected public alias.
- Why it matters: pilot evidence can be polluted by deployment drift. H1/H4/H6 must measure user behavior, not whether the selected live URL is on the same app revision.
- Violated invariant or research logic: `docs/PRODUCTION_PILOT_SMOKE.md` says live pilot must measure behavior, not deployment fragility.
- Recommended fix: deploy current `main` to the selected pilot URL, rerun the full smoke, update registry with non-secret state only.
- Verification: repeat documented smoke: first entry with photo, derivative readback, follow-up, publish, public SSR, variety CTA, archive 410, pilot health readout, no HTML cache.

### Finding 6

- Severity: `P2`
- Confidence: `High`
- Area: tests / agent-drift
- Files/lines: `.github/workflows/ci.yml:57`, `.github/workflows/ci.yml:95`, `apps/web/package.json:14`, `docs/SCAFFOLD_STATUS.md:133`
- Evidence: CI runs lint/typecheck/test/build and Python compile, but not local bootstrap, DB migrations against Postgres, MinIO/R2 smoke, Meili smoke, or generated type drift check.
- Why it matters: SQL migrations are source of truth, but CI does not prove generated Kysely types are current or that a fresh local/prod-like bootstrap works.
- Violated invariant or research logic: ADR-0014 and `AGENTS.md` require SQL-as-source-of-truth, Kysely typed boundaries, and machine-checkable guardrails for agents.
- Recommended fix: add a CI job with Postgres/MinIO/Meili services, run `pnpm local:bootstrap`, run typegen into a temp file and diff against committed generated types.
- Verification: CI fails when SQL and generated DB types drift.

### Finding 7

- Severity: `P2`
- Confidence: `High`
- Area: product / privacy / docs
- Files/lines: `apps/web/src/app/privacy/page.tsx:31`, `apps/web/src/app/first-publication-disclosure/page.tsx:31`, `apps/web/src/app/erasure/page.tsx:44`, `docs/SCAFFOLD_STATUS.md:119`
- Evidence: privacy, first-publication disclosure, and erasure pages explicitly say they are placeholder pilot copy; erasure is non-destructive operator intake.
- Why it matters: acceptable for internal/friendly pilot, not acceptable for public release or trust-sensitive UA/BG users.
- Violated invariant or research logic: `docs/product-research/CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md` requires informed disclosure, deletion/deindexing, and GDPR mechanisms as binding.
- Recommended fix: reviewed legal/privacy copy, verified contact/process, processor/retention details, and real irreversible erasure/anonymization workflow after maintainer sign-off.
- Verification: legal checklist plus route tests for noindex, disclosure version logging, erasure state transitions, and public archive/deindex behavior.

### Finding 8

- Severity: `P2`
- Confidence: `Medium`
- Area: UX / product
- Files/lines: `apps/web/src/app/garden/first-entry-composer.tsx:605`, `apps/web/src/app/garden/first-entry-composer.tsx:690`, `apps/web/src/app/garden/objects/[objectId]/page.tsx:176`, `apps/web/src/app/garden/objects/[objectId]/page.tsx:248`
- Evidence: user-facing screens expose terms like local queue, sync, photo intent, catalog selected, stripped photo derivative, lifecycle state.
- Why it matters: early pilot learning can be distorted by implementation language. Users may bounce because the product feels like an internal QA console, not because journaling lacks value.
- Violated invariant or research logic: H1 measures voluntary journaling and return-to-record utility; copy/UI should not add avoidable cognitive tax.
- Recommended fix: one UX hardening slice for first-entry, offline recovery, publish/archive copy, and privacy language. Keep the same architecture; change the mental model.
- Verification: Playwright screenshots plus 5-user comprehension check: user can explain what is private, what is public, what happens offline, and what publish/archive do.

## 3. Product Logic Alignment Matrix

| Project claim / invariant | Source file | Current implementation evidence | Gap | Risk | Suggested vertical slice |
|---|---|---|---|---|---|
| No precise location in v0 | `AGENTS.md`; `docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md`; SQL | SQL only has `location_visibility` `region/hidden` and coarse `UA/BG` subdivision codes at `apps/web/sql/0001_walking_skeleton.sql:13`; analytics keys are bounded at `apps/web/src/server/analytics-events.ts:25` | Need broader privacy invariant suite and log/error audit | wartime-risk leak if future agents add exact fields | No precise location can be created, logged, indexed, or rendered |
| First-entry journaling tests H1 | `docs/product-research/OverGarden_B2_METRICS_v0.md:30`; PRD | `/api/garden/entries` canonical server path; owner-scoped repo; offline queue | UX still scaffold-ish; retention metrics provisional | invalid H1 signal | First entry to first return without founder-language UI |
| Photo derivative safety | `AGENTS.md`; PRD | `sharp` WebP derivative at `apps/web/src/server/media/derivatives.ts:17`; quarantine delete before public put at `apps/web/src/server/media/processor.ts:19`; tests pass | owner consistency bug in media association/public joins | public injection/privacy boundary break | Owner-consistent photo attachment and public readback |
| Public SSR pages | `docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md` | `/journal/[slug]` is route handler; `/variety/[slug]` SSR metadata; sitemap only indexable variety pages | live production smoke still needs current-main proof | H6 signal polluted by deploy state | Current-main public SSR smoke on selected pilot URL |
| Archive/delete 410 | `docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md:178`; app route/repo | route returns 410 for gone at `apps/web/src/app/journal/[slug]/route.ts:24`; archive sets `public_gone_at` at `apps/web/src/server/journal-repository.ts:887` | search unindex job is dropped by worker | deleted public content can remain in derived search later | Archive removes public search doc end to end |
| Public variety activation | `docs/SDD_VERTICAL_SLICE_ROADMAP.md`; app routes | `/variety/[slug]` CTA resolves server-side; `/garden` preselection uses public slug; enum analytics | production proof still branch/docs dependent | H4/H6 activation data not reliable | Public variety CTA to first real saved entry smoke |
| Pilot health metrics | `docs/product-research/OverGarden_B2_METRICS_v0.md` | aggregate readout exists and CI passes | gate fail-open; no PostHog/cohort depth | operator data visible to users; weak decision signal | Operator-only pilot health with H1/H4/H6 cohort slices |
| SEO/noindex | `docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md` | variety index threshold at `apps/web/src/server/public-variety-indexing.ts:1`; journal public pages noindex by default | threshold is intentionally crude; no AI/crawler monitor | under/over-indexing can poison H6 | Noindex-to-index promotion with crawler-safe evidence |
| Search/worker health | `AGENTS.md` hard rule 7; smoke doc | catalog typeahead safe docs exclude owner/private fields at `apps/web/src/server/search/catalog-documents.ts:4` | journal index/unindex jobs unimplemented and silently done | false search readiness; privacy boundary future risk | Public-safe journal indexing and unindexing |
| Offline sync/idempotency | tech stack docs; SDD | Dexie queue and idempotency covered by tests; photo intent uses upload/process flow | no real-device iOS Safari check; UI copy too technical | duplicate/failure recovery risk in field | Real-device offline capture and retry readback |

## 4. Privacy and Safety Audit

Can precise location leak anywhere?

I found no product schema/API path for coordinates in v0. The schema stores only hidden/region, and analytics properties are allowlisted. Better Auth tables contain normal auth metadata like IP/user agent, but product analytics/readouts do not expose them. Remaining risk is future drift, logs, and lack of full invariant tests.

Can original/quarantine photos leak?

Core path is solid: originals go to quarantine, derivative is generated with `sharp`, quarantine object is deleted, and public pages render derivative keys only. The major exception is the media owner-association bug above.

Can private journal text leak to public pages/search/logs/evidence?

Core public queries filter public/active entries, and public route escapes rendered text. Catalog typeahead explicitly excludes journal text. I did not find raw private body/title in analytics properties. Risk remains through operator gate and future search implementation.

Can one user read or mutate another user's data?

Core journal repositories are owner-scoped. The two exceptions are media association by arbitrary `journalEntryId` and fail-open operator surfaces.

Are public pages safe for Ukrainian wartime-risk users?

Directionally yes on location minimization and noindex defaults, but not ready for broad public traffic until role gates, media association, legal copy, and production smoke drift are fixed.

Are deletion/archive semantics product-correct and privacy-correct?

App route behavior is correct for 410/noindex and sitemap exclusion, but search unindexing is not implemented and is currently silently dropped by the worker.

## 5. Architecture and Agent-Drift Audit

Coherent parts:

- The stack matches ADR-0014: Next.js App Router, TypeScript, Kysely, SQL migrations, Better Auth, R2-style media, Meili/catalog search, Python worker, and Dexie offline queue.
- Core vertical slices are unusually well wired: SQL -> repo -> route/action -> UI -> tests -> docs.
- The product docs correctly keep public search/SEO, media, location, and archive behavior as safety boundaries.

Fragile parts:

- Operator access is duplicated through a catalog-curator helper and reused for unrelated surfaces.
- Media ownership is implicit, not enforced at every boundary.
- Job queue payloads are untyped across TS/Python; unsupported jobs look successful.
- CI does not prove SQL/typegen/bootstrap freshness.
- Legal placeholder state is honest in docs, but it means pilot-ready cannot become public-ready by accident.
- User-facing UI still leaks implementation terms, which future agents may copy into new flows.
- The research corpus contains a public-only strategic ambition, while the implemented MVP is private-by-default with explicit publish. That is a sane reversible path, but future agents need this tension named every time H4/H6 work is scoped.

## 6. Test and CI Gap Matrix

| Invariant | Existing test coverage | Missing test | Risk if untested | Recommended test |
|---|---|---|---|---|
| Production auth secret fail-closed | smoke/readiness checks env presence | runtime missing-secret failure | known fallback secret in prod | production-mode unit/startup test |
| Operator access explicit only | tests currently encode auth-only fallback | non-operator denied when allowlist empty in prod | pilot user sees/mutates operator data | route/action tests for curation, health, erasure |
| Media owner consistency | derivative + owner readback tests | cross-user attach/public join test | public content injection | two-user API/repo integration test |
| Public archive unindexes | 410 route/repo behavior | worker unindex proof | deleted content remains in search | publish/index/archive/unindex worker test |
| Journal job contract | catalog worker compile | unsupported job dead-letter/fail | false `done` jobs | worker unit/integration job-kind test |
| SQL/typegen freshness | lint/typecheck/test/build | temp typegen diff in CI | schema drift passes CI | `pnpm local:bootstrap` + typegen diff |
| No precise location anywhere | schema/contracts partial | logs/search/public pages invariant sweep | future exact-location regression | static + repo tests for forbidden fields |
| Offline sync idempotency | strong Dexie/Vitest coverage | real-device browser/offline check | field duplicate/lost photo | iOS Safari manual/Playwright-like smoke |
| Legal erasure | intake page/repo | irreversible anonymization workflow | false deletion promise | operator erasure state-machine tests |

## 7. Deployment and Infrastructure Review

Docs and code mostly agree on the intended stack: Vercel app, Better Auth, DigitalOcean Postgres, R2 quarantine/public buckets, Meilisearch/catalog typeahead, Python matching worker, and no Cloudflare HTML caching.

Material gaps:

- Current `main` is CI-green, but production smoke docs still describe a prior production deployment plus a branch preview pass. Do not treat that as current production readiness.
- Production worker/Meili host remains an open operational item in infra docs.
- Public app domains are still an open operational item.
- R2 public development URL disabling is still deferred after media readback proof.
- CI uses Node 22 while infra docs mention a newer production Node runtime expectation; not a launch blocker, but it is drift future agents can trip over.
- No secrets appeared in tracked files from the scans I ran; ignored `.env`/local artifacts stayed untouched.

## 8. Recommended Next Linear SDD Slices

### 1. Closed pilot operator boundary

User behavior: a normal pilot user signs in and cannot access or mutate catalog curation, pilot health, or erasure operator pages.

Why now: prevents trust leak before any real user.

End-to-end layers touched: env contract, access helpers, routes/actions, denied UI, tests, docs.

Acceptance criteria:

- Explicit operator can access.
- Non-operator cannot access.
- Empty allowlist fails closed in production.

Verification commands/manual checks:

- Focused auth tests.
- Manual signed-in non-operator check for `/garden/catalog/curation`, `/garden/pilot-health`, and `/garden/privacy/erasure-requests`.

Privacy/product invariant protected: scoped private/operator data.

### 2. Owner-consistent media attachment

User behavior: a user can attach a photo to their own entry, but cannot attach media to another user's entry.

Why now: closes the highest-risk media privacy bug.

End-to-end layers touched: upload API, media repository, public journal/variety queries, SQL constraint if chosen, tests.

Acceptance criteria:

- Cross-user attach is rejected.
- Public pages render only owner-consistent derivatives.

Verification commands/manual checks:

- Two-user media integration test.
- `pnpm test`

Privacy/product invariant protected: public photos are safe stripped derivatives bound to the right owner.

### 3. Production auth/env fail-closed smoke

User behavior: selected pilot URL either runs with correct auth env or refuses to run; no silent dev fallback.

Why now: avoids deployment drift masquerading as product behavior.

End-to-end layers touched: env validation, auth setup, health/pilot-smoke page, docs.

Acceptance criteria:

- Missing prod secret fails.
- Current-main public smoke passes on selected URL.

Verification commands/manual checks:

- Production-mode env test.
- Documented browser smoke from homepage first-entry through archive 410.

Privacy/product invariant protected: no scaffold secrets in production.

### 4. Public journal search index/unindex

User behavior: when a user publishes, public-safe search doc appears; when archived, it disappears.

Why now: H6/search cannot be claimed while jobs are dropped.

End-to-end layers touched: TS enqueue contract, Python worker, Meili documents, job_queue handling, tests, smoke docs.

Acceptance criteria:

- Unsupported jobs fail visibly.
- Journal jobs process only public fields.

Verification commands/manual checks:

- Worker integration test against local Meili.
- Publish/index/archive/unindex smoke.

Privacy/product invariant protected: search indexes public rows only.

### 5. Fresh checkout bootstrap proof

User behavior: a fresh agent checkout can bootstrap and save a first entry without manual repair.

Why now: AI-agent development needs machine-checkable rails.

End-to-end layers touched: CI service containers, `local:bootstrap`, typegen temp diff, first-entry API smoke.

Acceptance criteria:

- SQL/generated drift fails CI.
- Local bootstrap is proven.
- First-entry API path works against fresh local services.

Verification commands/manual checks:

- CI job with Postgres/MinIO/Meili.
- `pnpm local:bootstrap`
- temp typegen diff.

Privacy/product invariant protected: SQL source of truth and typed repo boundary.

### 6. Reviewed pilot privacy and erasure loop

User behavior: pilot user sees clear reviewed privacy/disclosure copy and can submit/track a real erasure request path.

Why now: trust-sensitive market; placeholder copy cannot carry public release.

End-to-end layers touched: copy, disclosure versioning, erasure workflow, operator UI, tests, docs.

Acceptance criteria:

- Reviewed text exists.
- Contact/process, retention, and processor details are verified.
- Relevant pages remain non-indexed.
- Publication disclosure is version-logged.

Verification commands/manual checks:

- Route tests.
- Legal checklist.
- Disclosure and erasure workflow test.

Privacy/product invariant protected: informed publication and deletion/deindexing.

### 7. First-entry/offline UX hardening

User behavior: user saves online/offline entries and understands recovery without technical terms.

Why now: H1 can be falsely killed by scaffold UI.

End-to-end layers touched: first-entry composer, offline queue UI, object page publish/archive copy, screenshots/tests.

Acceptance criteria:

- No implementation jargon in primary user flow.
- Privacy meaning remains explicit.
- Offline recovery is understandable to nontechnical users.

Verification commands/manual checks:

- Screenshot review.
- 5-user comprehension check.
- Focused component/route tests where applicable.

Privacy/product invariant protected: valid H1 learning signal.

## 9. Open Questions

- Is the next pilot meant to be one supervised friendly user, a small closed cohort, or public self-serve traffic? The current answer changes whether `Yellow` is acceptable.
- Who is the explicit production operator/admin user set? Reusing catalog curator IDs for erasure and pilot health is too vague.
- Is public journal search actually required for the next pilot, or should H6 be scoped to SSR variety/journal crawlability first?
- What is the legal release threshold: Ukrainian-only friendly pilot, Bulgaria/EU pilot, or public EU launch? The privacy/erasure bar changes materially.
- Should `db:types` be allowed to mutate in CI and then fail on diff, or should typegen output to a temp file only?

## 10. Final Recommendation

Pause for one hardening slice before any real unsupervised pilot.

Do not pause for a rewrite. The architecture is mostly coherent and the core product path is real. But shipping this as-is would be a founder mistake: the product would look ready while the trust boundaries around operator access, auth fallback, media ownership, and worker/search are not yet launch-grade.

After that hardening slice, a controlled pilot is reasonable. A public launch is not.
