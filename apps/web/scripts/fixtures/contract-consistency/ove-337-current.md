# AI execution directive

Make speed enforceable: declare a Core Web Vitals budget per public surface class and fail the build when a surface exceeds it. Start from current `main` and authenticated Linear read-back after OVE-335 is Done and contained in origin/main. This issue owns the budget declaration, the measuring instrument, its CI wiring, and the first round of fixes needed to bring every declared surface inside budget. It changes no indexability decision and no structured data emitter.

# Execution metadata

* Contract: `overgarden.linear-sdd.v1`
* Issue identifier: `OVE-337`
* Issue kind: `vertical_execution`
* User-facing: `yes`
* Locale scope: `shared`
* Repository change: `yes`
* Live deployment required: `yes`
* Direct production-state mutation: `no`
* Authorization status: `not_required`
* Baseline SHA: `77d1dae77be65454dba62ce6178b2157ffbaf500`
* Evidence captured: `2026-08-19`
* Touches: `repository, server, ui, deployment, tests, docs`
* Sensitive boundaries: `user-data, public-search`
* External systems: `Vercel, Linear, GitHub`

# User or operator outcome and behavior

* Actor and precondition: a gardener on a mid-range phone and a slow Ukrainian or Bulgarian connection opens a public surface on a build where no Core Web Vitals measurement exists anywhere in the repository.
* Happy path: every declared public surface class is measured and reports `pass` against its budget, and a change that would exceed a budget fails the pull request before it can merge.
* Degraded path: an injected measured surface response timeout returns one bounded receipt, keeps `Retry measurement command` and `Budget report command` usable, and records `not_measured` rather than allowing a silent pass.
* Recovery path: revert this commit; the gate disappears and no product behavior changes, because the gate only measures.
* Final read-back: the aggregate receipt records a `pass` or a named `over_budget` for every declared surface class, and the gate runs green in CI on the merge commit.
* Not sufficient as proof: a budget raised until a surface passes, a surface exempted without a named constant and a recorded reason, a flaky measurement accepted as a result, or a partial run treated as success.

# Product thinking and falsification

* Product-research branch: constrained
* Job or protected outcome: stop a gardener on a mid-range phone and a slow Ukrainian or Bulgarian connection from abandoning a page before it renders, which is the failure mode that costs the most traffic and is currently measured by nothing
* Load-bearing assumption: a performance goal that no gate measures drifts over time, so the durable form of maximum speed is a declared per-surface budget that fails CI, and the first enforcement round will surface real regressions rather than confirm the status quo
* Product Thinking Gate: `docs/product-research/MVP_LOGGING_DESIGN-BRIEF.md` constrains the capture journey to low-friction narrative entry with one honest save moment, so discovery work must leave the writing path exactly as fast as it is today. `docs/product-research/CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md` constrains every read and receipt to the exact authenticated owner under private-by-default visibility, so discovery may surface exactly what an owner already chose to publish. `docs/product-research/CROSS_LOCALE_BG_UA.md` constrains every public surface to serve a real Ukraine and Bulgaria audience in its own language, so each surface must carry market-valid `uk`, `bg`, and `ru` treatment.
* Falsification signal: a page an owner kept private becomes reachable, a threshold is loosened to make a failing surface pass, or an owner outside this scope changes behavior. Each falsifies this change itself.
* Smallest reversible response: revert this single commit; canonical storage is unchanged, so the baseline behavior returns with no data recovery step.

# Pinned baseline, reproduction, evidence, and counterevidence

Audit baseline: `77d1dae77be65454dba62ce6178b2157ffbaf500`, observed 2026-08-19.

Safe reproduction:

1. Fetch `origin/main`, prove a clean tree, and read this issue, its predecessor, successor, project, milestone, status, labels, and direct relations through authenticated Linear.
2. Record the current behavior of every named owner for each public surface class, so each change is proved against recorded behavior rather than intent.
3. Confirm the named proof gap remains and stop if current main, the ADR-0018 receipt, or the caller inventory invalidates this contract.

Confirmed evidence:

1. `.github/workflows/ci.yml` carries the behavior named in its scope row at this baseline, verified by reading the file at the pinned SHA.
2. `apps/web/src/app/layout.tsx` carries the behavior named in its scope row at this baseline, verified by reading the file at the pinned SHA.
3. `apps/web/next.config.ts` carries the behavior named in its scope row at this baseline, verified by reading the file at the pinned SHA.
4. `apps/web/scripts/prove-public-journal-search-budget.ts` carries the behavior named in its scope row at this baseline, verified by reading the file at the pinned SHA.

Counterevidence and preserved controls:

Counterevidence: the current conservative behavior was a deliberate protection for owner privacy and index quality, and this issue records what it changes rather than relabeling the prior decision as a mistake.

* Owner visibility and publication controls stay exactly as they are; discovery may only reach what an owner already chose to publish.
* `src/lib/offline/` remains untouched and is deleted by OVE-323; no owner inside it is changed here.

Not proved at creation:

Not proved: the real-world search and answer-engine response to this change is unknown at this baseline and becomes measurable only after the recorded classes ship.

# Root cause or proof gap

The closest proved boundary is that no Core Web Vitals measurement exists anywhere in the repository: a search across the web application finds no largest contentful paint, interaction to next paint, or cumulative layout shift owner, and the only budget instrument is a single search-latency prover. Speed is therefore an intention with no evidence behind it and no way to detect a regression. The enforceable repair is one declared budget per public surface class plus a measuring instrument wired into CI, with a regression fixture proving a deliberately over-budget surface fails the gate. The recovery path is a revert of this commit, which removes the gate without changing any product behavior.

Stop condition and decision branch: stop before implementation when the ADR-0018 receipt, the named owner set, or the caller inventory differs; reconcile and revalidate this issue, then reopen execution only from the corrected saved contract.

# Non-negotiable invariants

1. **INV-01 — Every public surface class has a declared budget.** No public surface class ships without a largest contentful paint, interaction to next paint, and cumulative layout shift number it must meet.
2. **INV-02 — The budget is enforced.** Exceeding a declared budget fails the gate, and every declared surface class carries its numbers as a named constant with a recorded reason.
3. **INV-03 — Measurement is reproducible.** The instrument produces the same class for the same build under the declared conditions, so a failure is actionable; a flaky measurement is a defect in the instrument and must be repaired in the instrument.
4. **INV-04 — Scope fence.** This issue changes no indexability decision, no structured data emitter, no page copy, and nothing under `src/lib/offline/`, whose deletion belongs to OVE-323.
5. **INV-05 — Bounded measurement.** Every measured surface resolves inside its declared deadline; cancellation stops the run without a partial receipt being treated as a pass.
6. **INV-06 — Evidence hygiene.** Raw user content, media keys, another-user identifiers, credentials, and precise location remain forbidden in every receipt this issue produces; each receipt is redacted to classes, counts, and durations, and carries a negative proof that precise location is absent.

# Exact data, state, protocol, and concurrency contract

* Data/schema: Not applicable — this work changes computed and rendered behavior only and creates no SQL migration, database row, backfill, or production state.
* Request/action/API: each named owner keeps its current signature and adds one closed class to its result; no route, method, or payload shape is removed, so every existing caller keeps compiling.
* Budget contract: `PUBLIC_SURFACE_BUDGET` declares, per surface class, a largest contentful paint bound in milliseconds, an interaction to next paint bound in milliseconds, and a cumulative layout shift bound as a unitless ratio; the starting values are 2500, 200, and 0.1, and each is an owner-adjustable named constant.
* Result contract: each measured surface resolves to exactly one member of `pass`, `over_budget`, or `not_measured`, and `not_measured` fails the gate exactly as `over_budget` does, so an incomplete run can never read as success.
* Exemption contract: an exemption is a named constant carrying the surface class and a recorded reason; no runtime flag, environment variable, or comment-based exemption path exists.
* State transitions: each surface resolves `evaluating -> passing` or `evaluating -> refused`, and every terminal state carries exactly one machine-readable reason class.
* Idempotency: identical input and build yield an identical class; the decision is a pure function of the recorded inputs and carries no accumulated state between runs.
* Concurrency: the owners hold no shared claim or lock, so concurrent readers observe one consistent class; any rebuild path reuses its existing single-writer contract.
* Deadlines/retry: every decision resolves within the declared PERF-01 bound, retry is caller-initiated and single-flight, and cancellation rejects a late result.
* External effects: read and serve only; the exact-SHA deployment to the official Vercel capability is the sole external effect, and it is verified by read-back.
* External-system contract: the official provider capability recorded in docs/INFRASTRUCTURE_REGISTRY.md is read back before use; every provider-facing operation stays idempotent under the declared task key, records a redacted read-back receipt, and retains an executable rollback.
* Search/public projection: public eligibility remains an explicit predicate; Meilisearch stays a public-only derived projection, a stale derived document is rebuilt from Postgres, and parity is measured against the canonical Postgres read model.

# Exact vertical scope, target files, and caller inventory

| Layer/surface | Exact existing owner or planned new path | Required change/read-back | Status |
| -- | -- | -- | -- |
| Budget declaration | `apps/web/src/lib/performance/public-surface-budget.ts` (new) | Declare the largest contentful paint, interaction to next paint, and cumulative layout shift numbers each public surface class must meet. | required (new) |
| CI wiring | `.github/workflows/ci.yml` | Run the budget gate on every pull request so a regression cannot merge. | required existing owner |
| Application shell | `apps/web/src/app/layout.tsx` | Fix render-blocking work found by the first measurement round, without changing what the page says. | required existing owner |
| Build configuration | `apps/web/next.config.ts` | Apply the build-level settings the first measurement round proves necessary. | required existing owner |
| Search budget precedent | `apps/web/scripts/prove-public-journal-search-budget.ts` | Read-back only: reuse its receipt shape so budget evidence stays consistent across instruments. | required existing owner |
| Rewritten expectations | `apps/web/src/app/layout.test.tsx`; `apps/web/next.config.test.ts` | Each must be rewritten to cover the build settings and shell behavior the first measurement round proves necessary, keeping every visible string unchanged. | required existing owner |
| Verification instrument | `apps/web/scripts/verify-core-web-vitals-budget.ts` (new) | Measure every declared surface and emit a redacted aggregate receipt. | required (new) |
| Instrument tests | `apps/web/scripts/verify-core-web-vitals-budget.test.ts` (new) | Prove per-surface classes, replay determinism, timeout, and cancellation. | required (new) |
| Docs | `docs/adr/ADR-0018-mvp-posture.md` (new) (provided by the OVE-329 prerequisite) | Read the posture decision and the named accepted exposure before changing any owner. | required (new) |

Caller/sibling/consumer inventory:

* Every route that consumes the named owners keeps compiling because each added class is additive; a caller that ignores the class it receives is a regression this issue must catch.
* `src/lib/offline/` remains untouched and is deleted by OVE-323; no caller inside it is converted here.
* Verification command-relative planned path: `scripts/verify-core-web-vitals-budget.ts` (new under `apps/web`); it maps to the full repository owner named in the table and is the sole PERF-01 and WAIT-01 instrument.

# Ordered implementation plan

1. Fetch current main, preserve local state, read the ADR-0018 receipt and the OVE-335 coverage receipt, and stop on posture or surface-set drift.
2. Enumerate the public surface classes from the indexability policy and record that list as the declared measurement set for this gate.
3. Declare `PUBLIC_SURFACE_BUDGET` with the three bounds per class, reusing the receipt shape of `prove-public-journal-search-budget.ts` so budget evidence stays consistent across instruments.
4. Build the measuring instrument, prove it produces the same class twice for the same build, and record a deliberately over-budget fixture that fails the gate.
5. Wire the gate into the pull-request workflow so a change that exceeds a budget cannot merge.
6. Run the first measurement round and fix only the render-blocking work in `layout.tsx` and the build-level settings in `next.config.ts` that the measurement proves necessary.
7. Rewrite the two existing test files to cover the new build settings and shell behavior, keeping every visible string unchanged.
8. Run broad gates, deliver through a pull request, deploy the exact SHA, fetch main, run the mainline closeout, and compare the saved Linear digest.

# UX, accessibility, localization, degraded states, performance, and observability

* Locale matrix: shared `uk`, `bg`, and `ru` receive identical treatment; no locale is served an English default and no locale keeps wording that names a retired rule.
* Accessibility: every reader-visible class change keeps keyboard reachability, is announced through a polite live region where it is rendered, and is conveyed by text rather than color alone.
* Degraded state and loading/error/retry: the complete active classes are `evaluating`, `passing`, `refused`, and `degraded`; every wait is finite and every terminal state names its class.
* Performance budget: PERF-01 (`public_surface_render_time`) — `public_surface_render_time` is at most 2500 ms and cancellation rejects late completion.
* Performance measurement: PERF-01 (`public_surface_render_time`) — VER-03 uses the monotonic timer at `scripts/verify-core-web-vitals-budget.test.ts` to measure `public_surface_render_time`.
* Blocking alerts: forbidden
* Global wait overlay: forbidden
* Pointer trap: forbidden
* Unbounded polling/retry: forbidden
* Wait-safe controls: `Retry measurement command`; `Budget report command` — both remain usable and enabled during every wait.
* Slow/down proof: WAIT-01 — VER-03 at `scripts/verify-core-web-vitals-budget.test.ts` — injected `measured surface response timeout` asserts `Retry measurement command` and `Budget report command` remain responsive and records a bounded `degraded` receipt.
* Observability: record surface class, terminal class, count buckets, duration, and cancellation class; never record raw user content, media keys, credentials, another-user identifiers, request metadata, or precise location.

# Migration, compatibility, rollout, rollback, and cleanup

* Expand: declare the budget constant and build the instrument before wiring the gate, so the first CI run measures against numbers that were reviewed rather than invented under pressure.
* Legacy/backfill: no migration and no data backfill; the gate measures and never writes product state.
* Compatibility: no runtime behavior changes except the render-blocking and build-level work the first measurement round proves necessary, and no visible string moves.
* Enforce: the change is complete only when every declared surface class reports `pass`, the deliberately over-budget fixture fails the gate, and the gate is a required pull-request check.
* Rollout: land the instrument, the budget, and the required gate in one pull request together with the fixes for every surface the first measurement round flags, so the gate is enforcing from its first green run.
* Rollback: revert this single commit; the gate disappears and no product behavior changes, because the gate only measures.
* Cleanup/retention: retain the first full measurement receipt permanently as the performance baseline every later run is compared against.

# Dependencies, ownership boundaries, relations, and non-goals

* Blocked by: OVE-335 merged and contained, because this issue starts from the state that predecessor leaves.
* Blocks: the MVP discovery closeout.
* Related: OVE-329 posture canon, because ADR-0018 is the record of the MVP posture this issue serves.
* Duplicate/replaces: none — this issue is the sole owner of the named discovery step.
* Acyclic execution order: `OVE-331 -> OVE-335 -> OVE-337`; no successor holds a reverse edge into a predecessor.
* Canonical owners: ADR-0018 owns the posture decision; this issue owns only the named owners and their callers; every other owner keeps its current contract.
* Staged handshake: this issue emits a redacted aggregate per-surface receipt after current-main containment; the successor starts only from that receipt and a matching authenticated relation read-back.

Non-goals:

* No change to any owner outside the named table, and no deletion of anything under `src/lib/offline/`.
* No indexability decision and no structured data emitter change, both of which OVE-335 owns.
* No visual redesign; only render-blocking and build-level work proved necessary by measurement.

# Measurable acceptance criteria

1. AC-01 — every declared public surface class is measured against its budget and the aggregate receipt records a pass or a named failure for each
   * Protects: `INV-01`, `INV-02`, `INV-06`.
   * Verified by: `VER-01`, `VER-04`.
2. AC-02 — a surface exceeding its budget fails the gate rather than warning, an unauthorized caller cannot run the instrument against private surfaces, and precise location is absent from every receipt with negative proof
   * Protects: `INV-02`, `INV-03`, `INV-06`.
   * Verified by: `VER-02`, `VER-04`.
3. AC-03 — two runs of the same build produce the same pass or fail class per surface, and an injected surface timeout yields one bounded degraded receipt with both declared controls usable and no partial pass
   * Protects: `INV-04`, `INV-05`.
   * Verified by: `VER-03`, `VER-04`.
4. AC-04 — PERF-01 (`public_surface_render_time`) — `public_surface_render_time` is at most 2500 ms; the declared representative load fixture resolves inside the bound while both declared controls stay usable
   * Protects: `INV-05`.
   * Verified by: `VER-03`, `VER-04`.
5. AC-05 — the implementation SHA is contained in origin/main, the exact-SHA deployment is READY, the budget gate runs green in CI on the merge commit, and the saved Linear body and relations match
   * Protects: `INV-04`, `INV-06`.
   * Verified by: `VER-05`, `VER-06`.

# Required test and fault matrix

| Case | Protects | Proves | Verification | Level | Fault/input | Expected receipt |
| -- | -- | -- | -- | -- | -- | -- |
| Happy path | `INV-01`, `INV-02`, `INV-06` | `AC-01` | `VER-01`, `VER-04` | integration | complete authorized fixture and current dependency receipt | exact terminal behavior, stable identity, and safe aggregate read-back |
| Authorization/another owner | `INV-02`, `INV-03` | `AC-02` | `VER-02`, `VER-04` | contract | anonymous, ordinary, another-user, stale-session, or wrong-environment actor | redacted generic denial, zero leak, zero unauthorized mutation |
| Invalid/boundary input | `INV-02`, `INV-03` | `AC-02` | `VER-02`, `VER-04` | contract | malformed ID, state, kind, cursor, digest, rights, source, precise location, or forbidden field | closed error, redacted receipt, and negative proof that precise location is absent |
| Duplicate/replay | `INV-04`, `INV-05` | `AC-03` | `VER-03`, `VER-04` | integration | exact idempotency replay and mismatching replay | one effect for exact replay and stale/mismatch denial for changed input |
| Concurrent race | `INV-04`, `INV-05` | `AC-03` | `VER-03`, `VER-04` | integration | two synchronized writers or worker claims | one winner, bounded loser receipt, one committed canonical state |
| Timeout/crash/partial success | `INV-04`, `INV-05` | `AC-03`, `AC-04` | `VER-03`, `VER-04` | fault integration | measured surface response timeout, cancellation, crash, restart, or partial derived effect | bounded degraded or recovery receipt, no late unsafe effect |
| Archive/erasure/revocation | `INV-02`, `INV-03` | `AC-02` | `VER-02`, `VER-04` | integration | rights block, inactive/superseded/revoked state, or stale public projection | unsafe row absent, history retained, canonical state converged |
| Locale/a11y/degraded UI | `INV-03`, `INV-05` | `AC-02`, `AC-03` | `VER-02`, `VER-03`, `VER-04` | browser/contract | uk, bg, ru, keyboard path, and slow/down dependency | explicit locale and focus/status behavior or task-specific no-UI receipt with usable controls |
| Load/resource budget | `INV-05` | `AC-04` | `VER-03`, `VER-04` | load | declared representative corpus/load fixture | PERF-01 (`public_surface_render_time`) — `public_surface_render_time` is at most 2500 ms; no unrelated regression |
| Mainline and saved-contract closeout | `INV-04`, `INV-06` | `AC-05` | `VER-05`, `VER-06` | delivery/read-back | exact feature SHA, deployment/provider receipt, relations, and saved body | exact-SHA containment, terminal provider state, matching digest, and acyclic relations |

# Verification commands and required evidence

## VER-01 — Focused behavior contract

* Phase: local
* Proves: `AC-01`
* Command status: `must_be_added`
* Expected receipt: every declared surface resolves through the named owners with its recorded class, matching its regression fixture.

```bash
cd apps/web
pnpm exec vitest run scripts/verify-core-web-vitals-budget.test.ts
```

## VER-02 — Safety, authorization, locale, and projection contract

* Phase: local/integration
* Proves: `AC-02`
* Command status: `must_be_added`
* Expected receipt: unauthorized, malformed, rights, location, privacy, locale, accessibility, and stale cases produce bounded safe states and zero forbidden effect.

```bash
cd apps/web
pnpm exec vitest run scripts/verify-core-web-vitals-budget.test.ts --testNamePattern "authorization|forbidden|location|locale|keyboard|canonical"
```

## VER-03 — Retry, race, performance, and no-wedge proof

* Phase: local/integration
* Proves: `AC-03`, `AC-04`
* Command status: `must_be_added`
* Expected receipt: duplicate, concurrent, timeout, crash, restart, cancellation, and partial-effect fixtures end in the exact bounded terminal classes with one canonical effect.
* Performance proof: PERF-01 (`public_surface_render_time`) — target `scripts/verify-core-web-vitals-budget.test.ts` measures `public_surface_render_time` at most 2500 ms and records a bounded threshold receipt.
* No-wedge proof: WAIT-01 — target `scripts/verify-core-web-vitals-budget.test.ts` injects `measured surface response timeout`, proves `Retry measurement command` and `Budget report command` remain responsive, and records a bounded `degraded` receipt.

```bash
cd apps/web
pnpm exec vitest run scripts/verify-core-web-vitals-budget.test.ts --testNamePattern "replay|concurrent|timeout|cancel"
tsx scripts/verify-core-web-vitals-budget.ts --prove-determinism --inject-dependency-timeout
```

## VER-04 — Broad repository, database, Python, and build gates

* Phase: local/CI
* Proves: `AC-01`, `AC-02`, `AC-03`, `AC-04`
* Command status: `existing`
* Expected receipt: every applicable focused dependency, lint, typecheck, test, build, standard, and diff gate exits zero on the exact feature SHA.

```bash
cd apps/web
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm linear:task:standard:check
git diff --check
```

## VER-05 — Mainline, deployment, provider, and Linear proof

* Phase: main/deployment/live
* Proves: `AC-05`
* Command status: `existing`
* Expected receipt: exact-SHA implementation containment, a READY deployment, and the mainline closeout gate pass on current origin/main.

```bash
git fetch origin main
git merge-base --is-ancestor "$OVE337_IMPLEMENTATION_SHA" origin/main
cd apps/web
pnpm mainline:closeout:check
```

## VER-06 — Task-specific deployment, provider, product, and Linear read-back

* Phase: deployment/live/read-back
* Proves: `AC-05`
* Command status: `must_be_added`
* Expected receipt: the exact-SHA deployment is READY with canonical aliases, the aggregate per-surface receipt is redacted and terminal, and complete Linear fields, body digest, and relations match.

```bash
cd apps/web
tsx scripts/verify-core-web-vitals-budget.ts --emit-aggregate-receipt --base-url https://over.garden
# Authenticated official Vercel read-back: verify the READY deployment SHA and canonical aliases equal the implementation SHA through a read-only probe.
# Authenticated Linear read-back: fetch this issue's title, team, project, milestone, status, priority, labels, full description, and relations; compare the saved UTF-8 SHA-256.
```

# Delivery, exact-SHA proof, and Linear closeout

* Delivery path: repository_change
* Delivery sequence: current_main -> preserve_local -> issue_branch -> conventional_commit -> branch_push -> pull_request -> exact_head_checks -> capture_feature_sha -> merge_without_bypass -> fetch_main -> containment -> mainline_closeout -> linear_readback -> done
* Issue branch: `codex/ove-337-core-web-vitals-budget`
* Implementation SHA variable: `OVE337_IMPLEMENTATION_SHA`
* Direct main mutation: forbidden
* Local state preservation: required

Start from current main on `codex/ove-337-core-web-vitals-budget`. Preserve all unrelated and ignored local files and secrets. Use a Conventional Commit, push, open a PR, and run exact-head checks. Before merge, record `OVE337_IMPLEMENTATION_SHA=$(git rev-parse HEAD)` exactly once in the redacted closeout receipt. Merge without bypass only after every required check passes. After merge, fetch origin/main, run `git merge-base --is-ancestor "$OVE337_IMPLEMENTATION_SHA" origin/main`, and then run `cd apps/web && pnpm mainline:closeout:check`. Perform the final Linear read-back and compare the saved-description SHA-256 before Done.

# Failure gates

Do not merge, deploy, or mark `Done` when:

* OVE-335 is not independently Done and contained, or the relation graph is stale, missing, reversed, duplicated, or cyclic;
* any owner outside the named table changed behavior, or anything under `src/lib/offline/` was touched;
* a page an owner kept private or unpublished became reachable, or owner visibility changed in any way;
* a declared threshold or budget was loosened to make a failing surface pass;
* a test was weakened rather than rewritten, or a rewritten test never exercises the previously failing surface;
* the declared deadline, cancellation, replay determinism, or aggregate receipt proof fails;
* only local or branch proof exists without origin/main containment and a READY exact-SHA deployment;
* the saved Linear body digest differs from the validated payload; or
* evidence contains a secret, credential, raw user content, media key, another-user identifier, email, IP or user-agent, or precise location.

# Required context

Repository authority:

* `AGENTS.md`
* `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`
* `docs/SDD_VERTICAL_SLICE_ROADMAP.md`
* `docs/MAINLINE_CLOSEOUT.md`
* `docs/TECH_STACK_DECISIONS.md`
* `docs/adr/ADR-0014-agentic-stack-realignment.md`
* `docs/INFRASTRUCTURE_REGISTRY.md`
* `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md`
* `.github/workflows/ci.yml`
* `apps/web/src/app/layout.tsx`
* `apps/web/next.config.ts`
* `apps/web/scripts/prove-public-journal-search-budget.ts`

Product research:

* `docs/product-research/README.md`
* `docs/product-research/MVP_LOGGING_DESIGN-BRIEF.md`
* `docs/product-research/CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md`
* `docs/product-research/CROSS_LOCALE_BG_UA.md`

Linear and external context:

* OVE-329 full saved body and its ADR-0018 terminal receipt, because this issue serves exactly the posture that canon names
* OVE-335 full saved body and its terminal receipt, because this issue starts from the state that predecessor leaves
* Official Vercel deployment capability read-back for the registry-owned project
