# AI execution directive

Template drafting rule: replace every `{{placeholder}}` and remove every
drafting note before the final Linear write.

{{Implement, remediate, operate, investigate, reconcile canon, or coordinate}}
{{one observable behavior or integration outcome}}. Start from current `main`
and current Linear read-back after {{prerequisites}} are proved. This issue
authorizes {{exact scope}} and does not authorize {{adjacent scope}}. For a
`coordination_container`, state that it is non-executable, never assigned, and
has no branch, implementation, deployment, or production mutation.

# Execution metadata

- Contract: `overgarden.linear-sdd.v1`
- Issue identifier: `{{OVE-### assigned by Linear}}`
- Issue kind: `{{vertical_execution|remediation|operator_execution|decision_spike|canon_correction|coordination_container}}`
- User-facing: `{{yes|no}}`
- Locale scope: `{{shared|ukraine-only|bulgaria|unchanged|not-applicable}}`
- Repository change: `{{yes|no}}`
- Live deployment required: `{{yes|no}}`
- Direct production-state mutation: `{{yes|no}}`
- Authorization status: `{{not_required|pending|approved}}`
- Baseline SHA: `{{40-character lowercase Git SHA}}`
- Evidence captured: `{{YYYY-MM-DD}}`
- Touches: `{{comma-separated allowed layer values}}`
- Sensitive boundaries: `{{comma-separated allowed values or none}}`
- External systems: `{{exact provider names or none}}`

Allowed `Touches` values: `database`, `repository`, `server`, `ui`,
`local-retirement`, `background-job`, `search`, `media`, `auth`, `analytics`,
`infrastructure`, `deployment`, `coordination`, `tests`, `docs`. A
`local-retirement` issue must state ADR-0017 network-required and
server-authoritative semantics, the `network_unavailable_save_refused` state,
and the exact read-only retirement bridge; it cannot authorize a new durable
browser journal write.

Every final issue must state the applicable ADR-0018 MVP posture. Use
serve-under-uncertainty plus the accepted cross-account-read exposure for
authorization/ownership/session ambiguity; format-conversion-only for media;
`PUBLIC_SURFACE_INDEXABILITY_THRESHOLD` for public discovery; and in-product
admin under `AdminUserRole` for operator surfaces. Retired refusal vocabulary
may appear only inside an explicitly superseded historical statement.

# User or operator outcome and behavior

- Actor and precondition: {{who starts from what state}}.
- Happy path: {{ordered interaction or operator action}}.
- Degraded path: {{bounded behavior when a dependency is slow/down/stale}}.
- Recovery path: {{retry, resume, rollback, or safe alternative}}.
- Final read-back: {{observable result and what must remain absent}}.
- Not sufficient as proof: {{mock, configured-only, local-only, or other false positive}}.

# Product thinking and falsification

- Product-research branch: {{constrained|no_direct}}
- Job or protected outcome: {{user job, motivation, trust, safety, reliability, or release outcome}}.
- Load-bearing assumption: {{specific testable assumption}}.
- Product Thinking Gate: {{2–5 relevant research files for user-facing work; for User-facing: no, choose exactly one branch — cite each genuinely constraining non-README path here, explain with a substantive object exactly what it constrains, and repeat the identical non-empty path set in Required context, or record a closed affirmative no-direct-research conclusion with zero research paths and no open/not-ruled-out uncertainty; always name the protected product/trust/reliability/release/decision/canon/integration outcome, and for coordination name child evidence plus zero own implementation}}.
- Falsification signal: {{measurable evidence that stops/reopens the approach}}.
- Smallest reversible response: {{decision or rollback when falsified}}.

# Pinned baseline, reproduction, evidence, and counterevidence

Audit baseline: `{{same 40-character SHA}}`, observed {{YYYY-MM-DD}}.

Safe reproduction:

1. {{safe command or UI/operator step}}.
2. {{second step}}.
3. {{expected current failure or proof gap}}.

Confirmed evidence:

1. `{{verified existing path:symbol or line}}` — {{observed fact}}.
2. `{{verified test/path}}` — {{observed fact}}.
3. {{current Linear/provider fact with source/read-back date, if applicable}}.

Counterevidence and preserved controls:

- {{existing invariant/test/component that must be reused}}.
- {{fact that narrows the diagnosis}}.

Not proved at creation:

- {{explicit unknown and exact execution-time verification}}.

# Root cause or proof gap

{{State the proved closest failing boundary. If it is not proved, name the
suspected cause, bounded investigation, decision branches, and stop condition.}}

# Non-negotiable invariants

1. **INV-01 — {{Authorization and owner-scope invariant}}.**
2. **INV-02 — {{Privacy/location/media/search/auth invariant}}.**
3. **INV-03 — {{Identity/public eligibility/visibility invariant}}.**
4. **INV-04 — {{Data consistency/retention invariant}}.**
5. **INV-05 — {{Availability/degraded-state invariant}}.**
6. **INV-06 — {{Canonical owner that must be reused instead of forked}}.**

# Exact data, state, protocol, and concurrency contract

- Data/schema: {{fields, constraints, indexes, ownership, or specific Not applicable reason}}.
- Request/action/API: {{input, normalization, output, status, headers, auth, errors}}.
- State transitions: {{closed states/events, guards, writes, terminal semantics}}.
- Idempotency: {{key/receipt scope, mismatch, replay result, retention}}.
- Concurrency: {{transaction, lock/CAS/lease/claim, token and stale-writer behavior}}.
- Deadlines/retry: {{DB-time budgets, cancellation, backoff, max attempts}}.
- External effects: {{prepare/apply/read-back/compensation/cleanup, or specific Not applicable reason}}.

# Exact vertical scope, target files, and caller inventory

| Layer/surface                                 | Exact existing owner or planned new path | Required change/read-back | Status                                                                       |
| --------------------------------------------- | ---------------------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| Data/types                                    | `{{path or reason}}`                     | {{contract}}              | {{required or specific Not applicable reason}}                               |
| Scoped repository                             | `{{path or reason}}`                     | {{contract}}              | {{status}}                                                                   |
| Route/action/API                              | `{{path or reason}}`                     | {{contract}}              | {{status}}                                                                   |
| UI/operator path                              | `{{path or reason}}`                     | {{contract}}              | {{status}}                                                                   |
| Worker/search/media/local-retirement/provider | `{{path or reason}}`                     | {{contract}}              | {{status}}                                                                   |
| Tests                                         | `{{exact paths}}`                        | {{proof}}                 | {{required for a repository change, or specific no-repository-delta reason}} |
| Docs/runbook                                  | `{{exact paths}}`                        | {{authority/update}}      | {{required for a repository change, or specific no-repository-delta reason}} |

Caller/sibling/consumer inventory:

- {{Every path that could bypass or diverge from the fix}}.
- `{{new exact path}}` (new) — {{single owner and purpose}}.

# Ordered implementation plan

1. Re-read context, fetch current `main`, inspect dirty state, read Linear relations, and rerun reproduction. Stop if drift invalidates the contract.
2. {{Add/preserve failing regression and classify-only evidence, or read back every coordination child contract}}.
3. {{Land the contract/data/state boundary, or validate the child DAG and canonical owners, with a stop/go condition}}.
4. {{Implement repository/server/external-effect behavior, execute the bounded provider path, or prove zero container-owned implementation}}.
5. {{Implement UI/operator/degraded behavior, or prove the applicable no-user-surface reason}}.
6. {{Run migration/backfill/provider plan behind exact approval gates, or prove no mutation is authorized}}.
7. {{Run focused, race/fault, broad, exact-SHA, provider, or child-integration proof appropriate to the declared kind}}.
8. {{Deliver PR/main/deployment/cleanup, no-delta operator receipt, or direct terminal coordination closeout; then perform complete Linear read-back}}.

# UX, accessibility, localization, degraded states, performance, and observability

- Locale matrix: {{shared (`uk`,`bg`,`ru`), Ukraine-only (`uk` + no-control proof), Bulgaria (`bg`,`ru`), unchanged with reused-contract proof, or operator-only Not applicable reason}}.
- Accessibility: {{keyboard, focus, semantics, live region, or specific no-UI reason}}.
- Loading/error/retry: {{finite states and controls that remain usable}}.
- Performance budget: PERF-01 (`{{canonical_metric_key}}`) — `{{same canonical_metric_key}}` is at most {{one number}} {{one compatible unit}}{{optional exact suffix: and cancellation fences/rejects/stops/prevents late completion/response/writes/evidence admission/relation state}}.
- Performance measurement: PERF-01 (`{{same canonical_metric_key}}`) — VER-{{NN}} uses the {{one real timer/probe/histogram/benchmark/test}} at `{{exact command token, test path, selector, endpoint, or connector target repeated in that VER command}}` to measure `{{same canonical_metric_key}}`.
- Blocking alerts: forbidden
- Global wait overlay: forbidden
- Pointer trap: forbidden
- Unbounded polling/retry: forbidden
- Wait-safe controls: `{{first concrete control}}`; `{{second concrete control}}` — both remain usable and enabled during every wait.
- Slow/down proof: WAIT-01 — VER-{{NN}} at `{{same exact executable/read-back target}}` — injected `{{concrete domain-specific slow/timeout/down fault}}` asserts `{{same first control}}` and `{{same second control}}` remain responsive and records a bounded `{{recovery|retry|inconclusive|drift recovery|unstarted|failed|cancelled|timed out|available|degraded|restored|rolled back|completed}}` receipt.
- Observability: {{safe state/count/timing allowlist, alerts, retention, prohibited fields}}.

# Migration, compatibility, rollout, rollback, and cleanup

- Expand: {{additive sequence or specific Not applicable reason}}.
- Legacy/backfill: {{classification, bounded plan/apply, drift handling}}.
- Compatibility: {{old/new reader-writer/provider/version window}}.
- Enforce: {{proof required before strict gate/constraint}}.
- Rollout: {{feature gate, batches/concurrency, deployment/provider order}}.
- Rollback: {{safe disable/roll-forward and what must never be resurrected}}.
- Cleanup/retention: {{canonical owner, terminal proof, horizon, orphan scan}}.

# Dependencies, ownership boundaries, relations, and non-goals

- Blocked by: {{issue IDs and consumed proof, or none with reason}}.
- Blocks: {{issue IDs and behavior unlocked, or none with reason}}.
- Related: {{issue IDs and shared boundary, or none with reason}}.
- Duplicate/replaces: {{canonical issue or none}}.
- Acyclic execution order: {{dependency order and cycle proof}}.
- Canonical owners: {{one owner per shared table/queue/policy/predicate/worker/effect}}.
- Staged handshake: {{Phase A receipt/state/intermediate/Phase B gate, or specific Not applicable reason}}.

Coordination-container child DAG (delete for executable kinds; a coordination
container must name every concrete child identifier rather than a future range):

| Child issue   | Independently executable outcome | Relation/direction            | Verified owner | Required terminal receipt       |
| ------------- | -------------------------------- | ----------------------------- | -------------- | ------------------------------- |
| `{{OVE-###}}` | {{child outcome}}                | {{blocked by/blocks/related}} | {{owner}}      | {{Done plus immutable receipt}} |

- Integration criterion: {{container-owned read-back that becomes true only after every named child is independently Done}}.
- DAG proof: {{complete nodes/edges, cycle check, and reconciliation when saved relations differ}}.

Non-goals:

- {{Adjacent feature/refactor not authorized}}.
- {{Second non-goal}}.

# Measurable acceptance criteria

1. **AC-01 — {{happy-path assertion}}**
   - Given: {{precondition}}.
   - When: {{action}}.
   - Then: {{exact state/result/count/time/read-back}}.
   - Protects: `{{INV-01}}`.
   - Verified by: `VER-01`.
2. **AC-02 — {{negative/authorization/privacy assertion}}**
   - Given/When/Then: {{exact denial and zero leak/mutation}}.
   - Protects: `{{INV-01}}`, `{{INV-02}}`.
   - Verified by: `VER-02`.
3. **AC-03 — {{boundary/locale/accessibility assertion}}**
   - Protects: `{{INV-02}}`, `{{INV-03}}`.
   - Verified by: `VER-02`.
4. **AC-04 — {{retry/idempotency/reload assertion}}**
   - Protects: `{{INV-04}}`.
   - Verified by: `VER-03`.
5. **AC-05 — {{concurrency/race assertion, or specific Not applicable reason}}**
   - Protects: `{{INV-04}}`, `{{INV-05}}`.
   - Verified by: `VER-03`.
6. **AC-06 — {{crash/partial-effect recovery assertion, or specific Not applicable reason}}**
   - Protects: `{{INV-04}}`, `{{INV-05}}`.
   - Verified by: `VER-03`.
7. **AC-07 — PERF-01 (`{{same canonical_metric_key}}`) — `{{same canonical_metric_key}}` is at most {{same number}} {{same unit}}; {{observable performance/resource/availability outcome}}**
   - Protects: `{{INV-05}}`.
   - Verified by: `VER-04`.
8. **AC-08 — {{exact-SHA deployment/provider/public proof}}**
   - Protects: `{{INV-06}}`.
   - Verified by: `VER-05`.

# Required test and fault matrix

| Case                          | Protects | Proves | Verification | Level                                          | Fault/input                                       | Expected receipt                                                                                                                                  |
| ----------------------------- | -------- | ------ | ------------ | ---------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Happy path                    | {{INV}}  | {{AC}} | {{VER}}      | {{unit/contract/integration/browser/provider}} | {{exact valid fixture/action}}                    | {{exact state/read-back}}                                                                                                                         |
| Authorization/another owner   | {{INV}}  | {{AC}} | {{VER}}      | {{level}}                                      | {{other owner/session/role}}                      | {{generic denial, zero leak/mutation}}                                                                                                            |
| Invalid/boundary input        | {{INV}}  | {{AC}} | {{VER}}      | {{level}}                                      | {{closed boundary values}}                        | {{closed error, preserved state}}                                                                                                                 |
| Duplicate/replay              | {{INV}}  | {{AC}} | {{VER}}      | {{level}}                                      | {{same key/receipt, mismatch, expiry}}            | {{one effect, exact receipt}}                                                                                                                     |
| Concurrent race               | {{INV}}  | {{AC}} | {{VER}}      | {{level}}                                      | {{barrier/worker count/failure point}}            | {{winner/loser counts and final state, or specific Not applicable reason}}                                                                        |
| Timeout/crash/partial success | {{INV}}  | {{AC}} | {{VER}}      | {{level}}                                      | {{deadline/cancel/crash/external partial effect}} | {{bounded recovery/compensation}}                                                                                                                 |
| Archive/erasure/revocation    | {{INV}}  | {{AC}} | {{VER}}      | {{level}}                                      | {{lifecycle transition and stale projection}}     | {{absence/convergence proof}}                                                                                                                     |
| Locale/a11y/degraded UI       | {{INV}}  | {{AC}} | {{VER}}      | {{level}}                                      | {{market, keyboard, dependency failure}}          | {{market-valid locale matrix and usable controls, or specific Not applicable reason}}                                                             |
| Load/resource budget          | {{INV}}  | {{AC}} | {{VER}}      | {{level}}                                      | {{declared concurrency/load profile}}             | PERF-01 (`{{same canonical_metric_key}}`) — `{{same canonical_metric_key}}` is at most {{same number}} {{same unit}}; {{no unrelated regression}} |

# Verification commands and required evidence

Replace every illustrative command block with the task's exact executable path.
For `Repository change: no`, remove repository-only commands and use an
`external_readback` command or API query that returns the immutable no-delta
receipt; do not leave an inapplicable Git/PR command in the saved issue.
When the authenticated connector operation is not a shell executable, place the
exact operation in the bash block as
`# Authenticated {{provider|Linear|connector|API}} read-back: {{concrete query}}`;
never replace proof with `echo`, `printf`, `sleep`, `true`, or prose.

## VER-01 — Focused contract proof

- Phase: local
- Proves: `AC-01`
- Command status: `{{existing|must_be_added|external_readback}}`
- Expected receipt: exit 0 plus {{safe result classes}}.

```bash
cd apps/web
pnpm exec vitest run {{exact-focused-test-paths}}
```

## VER-02 — Safety and UI contract

- Phase: local
- Proves: `AC-02`, `AC-03`
- Command status: `{{existing|must_be_added|external_readback}}`
- Expected receipt: exit 0 plus {{safe summary}}.

```bash
cd apps/web
{{exact privacy/a11y/localization command}}
```

## VER-03 — Retry, race, and recovery

- Phase: local/integration
- Proves: `AC-04`, `AC-05`, `AC-06`
- Command status: `{{existing|must_be_added|external_readback}}`
- Expected receipt: {{exact bounded state/count classes}}.
- Performance proof: PERF-01 (`{{same canonical_metric_key}}`) — target `{{same exact executable/read-back target}}` measures `{{same canonical_metric_key}}` at most {{same number}} {{same unit}} and records a bounded threshold receipt.
- No-wedge proof: WAIT-01 — target `{{same exact executable/read-back target}}` injects `{{same concrete fault}}`, proves `{{same first control}}` and `{{same second control}}` remain responsive, and records a bounded `{{same concrete recovery state}}` receipt.

```bash
cd apps/web
{{exact race/fault/provider command containing the same executable/read-back target token}}
```

## VER-04 — Broad repository gates or no-delta provider proof

- Phase: local/CI
- Proves: `AC-07`
- Command status: `{{existing|must_be_added|external_readback}}`
- Expected receipt: {{every repository command exits 0 on the exact SHA, or immutable no-delta provider receipt}}.

```bash
cd apps/web
{{pnpm lint/typecheck/test/build and git diff --check for Repository change: yes, or exact read-only provider proof command for no}}
```

## VER-05 — Mainline and live proof

- Phase: main/deployment/live
- Proves: `AC-08`
- Command status: `{{existing|must_be_added|external_readback}}`
- Expected receipt: contained exact SHA, required deployment/provider state, redacted live result.

```bash
git fetch origin main
git merge-base --is-ancestor "${{TASK_PREFIX}}_IMPLEMENTATION_SHA" origin/main
cd apps/web
pnpm mainline:closeout:check
{{exact deployment/provider/live command, or a specific external-state-only reason}}
```

# Delivery, exact-SHA proof, and Linear closeout

Every applicable step below is unconditional and binding. Do not prefix this
section with discretionary/recommended/try/aim/plan/intend/where-feasible or
other non-binding scope language.

- Delivery path: {{repository_change|external_state_only|coordination_container}}
- Delivery sequence: {{copy exactly one matching canonical sequence below and delete the two inapplicable paths}}
- Issue branch: `{{exact codex/ove-###-slug for repository_change; otherwise delete this field}}`
- Implementation SHA variable: `{{exact OVE###_IMPLEMENTATION_SHA for repository_change; otherwise delete this field}}`
- Direct main mutation: {{forbidden for repository_change; otherwise delete this field}}
- Local state preservation: {{required for repository_change; otherwise delete this field}}

Canonical repository-change sequence: `current_main -> preserve_local -> issue_branch -> conventional_commit -> branch_push -> pull_request -> exact_head_checks -> capture_feature_sha -> merge_without_bypass -> fetch_main -> containment -> mainline_closeout -> linear_readback -> done`.

Canonical external-state-only sequence: `baseline -> no_repository_delta -> environment_identity -> read_only_action -> immutable_receipt -> second_readback -> rollback_result -> cleanup_result -> linear_readback -> done`.

Canonical coordination-container sequence: `unassigned -> outside_in_progress -> child_readback -> dag_proof -> children_done -> integration_receipt -> linear_readback -> terminal_closeout`.

The final issue must retain the selected structured fields above and exactly one
matching copy-ready paragraph below. Delete all labels/instructions and the two
inapplicable paragraphs. Resolve only the declared `{{...}}` tokens. Do not add,
remove, paraphrase, reorder, or append delivery prose; task-specific
deployment/provider/live proof belongs in acceptance criteria and `VER-##`.

Repository-change path copy-ready paragraph:

Start from current main on `codex/{{issue-id-lower}}-{{slug}}`. Preserve all unrelated and ignored local files and secrets. Use a Conventional Commit, push, open a PR, and run exact-head checks. Before merge, record `{{OVE###_IMPLEMENTATION_SHA}}=$(git rev-parse HEAD)` exactly once in the redacted closeout receipt. Merge without bypass only after every required check passes. After merge, fetch origin/main, run `git merge-base --is-ancestor "${{OVE###_IMPLEMENTATION_SHA}}" origin/main`, and then run `cd apps/web && pnpm mainline:closeout:check`. Perform the final Linear read-back and compare the saved-description SHA-256 before Done.

External-state-only operator path copy-ready paragraph:

Declare no-repository-delta at baseline and create no branch, commit, PR, deployment, or provider effect. Record the exact environment class, official capability response class, immutable redacted receipt, digest, second read-back, zero-effect rollback, session cleanup, and final Linear read-back. Compare the saved-description SHA-256 before Done.

Coordination-container path copy-ready paragraph:

Remain unassigned and outside In Progress. Create no branch, commit, PR, deployment, implementation, or provider effect. Perform the final Linear read-back of every complete child identifier ({{comma-separated OVE-### child identifiers in dependency-table order}}) and relation, prove the child DAG is acyclic and every child is independently Done, record the integration acceptance receipt, compare the saved-description SHA-256, and move the container through direct terminal closeout.

# Failure gates

Do not start implementation, mutate production, merge, deploy, or mark `Done` when:

- {{Issue-specific stale evidence, unresolved owner, or missing dependency}}.
- {{Issue-specific privacy/security/data contradiction}}.
- {{Missing migration/provider approval or failed read-back}}.
- {{Failed negative/race/crash/performance criterion}}.
- The description contains a placeholder or depends on hidden knowledge.
- Only local/branch/configured proof exists where current-main/CI/deployment/provider/live proof is required.
- The blocker graph is cyclic or saved relations differ from the intended DAG.
- Linear saved-description SHA-256 differs from the validated payload.
- Evidence contains secrets, precise location, raw user content, media keys/capabilities, email, IP/user-agent, or stable user identity.

# Required context

Repository authority:

- `AGENTS.md`
- `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`
- `docs/SDD_VERTICAL_SLICE_ROADMAP.md`
- `docs/MAINLINE_CLOSEOUT.md`
- `docs/TECH_STACK_DECISIONS.md`
- `docs/adr/ADR-0014-agentic-stack-realignment.md`
- `docs/adr/ADR-0018-mvp-posture.md`
- {{additional exact architecture/product/privacy/operation files}}

Product research:

- `docs/product-research/README.md`
- `docs/product-research/{{relevant-file-1}}.md`
- `docs/product-research/{{relevant-file-2}}.md`
  Drafting note: for `User-facing: yes`, retain 2–5 genuine files. For
  `User-facing: no`, choose exactly one branch: retain an identical non-empty set
  of genuinely constraining non-README paths here and in Product Thinking, or use
  a specific no-direct-research conclusion with zero paths. A coordination
  container names the protected integration outcome and child evidence while
  owning zero implementation. Remove this drafting note from the final issue.

Linear and external context:

- {{related issue IDs and exact fields/relations to read}}
- {{official primary provider/library documents with current URLs}}
- `docs/INFRASTRUCTURE_REGISTRY.md` (retain for external/provider/storage/deployment state)

# Open maintainer authorization gates

Drafting note: delete this entire section when no new authority is required.

- Authorization status: `{{pending|approved}}`.
- Gate: {{exact destructive/external/cost/privacy-sensitive action}}.
- Required approval artifact: {{read-only plan path, SHA-256 digest, environment and rule identity}}.
- Approval receipt: {{pending, or maintainer identity + timestamp + approved scope + immutable receipt}}.
- Work allowed before approval: {{safe tests/code/read-only plan}}.
- Work forbidden before approval: {{exact mutation}}.
- Stop/read-back condition: {{drift, mismatch, failed cleanup, or provider result}}.
