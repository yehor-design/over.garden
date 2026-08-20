# Linear AI Execution Task Standard

Status: binding

Contract version: `overgarden.linear-sdd.v1`

Applies to: every new or materially rewritten OverGarden Linear work item

Reference model: the audited OVE-213 through OVE-244 AI-execution directives

This document is the authority for Linear issue construction, autonomous-agent
Definition of Ready, creation/update/read-back, dependency representation, and
the minimum self-contained execution contract. It is deliberately stricter than
a conventional human handoff because the implementing agent must not have to
invent hidden product, security, data, lifecycle, rollout, or proof decisions.

`AGENTS.md`, current architecture/ADR documents, and binding product/privacy
policies override task-local implementation assumptions.
`docs/product-research/README.md` owns the Product Thinking Gate.
`docs/MAINLINE_CLOSEOUT.md` owns completion evidence and `Done`. Authenticated
current Linear read-back is the primary queue authority; `Current Execution
State` in `docs/SDD_VERTICAL_SLICE_ROADMAP.md` is its dated repository mirror.
Any discrepancy blocks task selection until both are reconciled and read back.

OVE-213 through OVE-244 are provenance examples, not reusable facts. Their
paths, versions, provider state, thresholds, dependencies, and evidence must not
be copied without current verification. The rules distilled here are normative.

Migration gate for the reference batch: authenticated Linear read-back on
2026-07-26 found all 32 issues from OVE-213 through OVE-244 open in `Todo` with
pre-`overgarden.linear-sdd.v1` descriptions. Before any one of those issues is
assigned, moved to `In Progress`, or implemented, an agent must re-audit that
issue against current `main`, current Linear fields/relations, current external
state, and this complete standard; materially rewrite its task-local contract;
run draft and final validation; save the final body to Linear; read the complete
saved body and container fields back; and prove byte/digest equality. A shared
template expansion or blanket batch assertion is not a substitute for the 32
individual reviews. This standardization change does not authorize those
product remediations or silently advance their states. Closed historical issues
are grandfathered unless reopened or materially rewritten, but an open unsafe
or contradictory contract is never grandfathered into execution.

## Core standard

Every issue must be:

- **Behavior-first.** Start with one observable gardener, visitor, moderator,
  maintainer, operator, or release behavior—not a code layer.
- **Vertical.** Own every affected layer necessary to prove that behavior. Do
  not split schema, repository, API, UI, worker, tests, and docs merely by layer.
- **Evidence-backed.** Separate verified facts, counterevidence, hypotheses,
  unknowns, and external state that must be checked at execution time.
- **Task-local and self-contained.** Links provide context; they do not replace
  task-specific invariants, state transitions, ownership, acceptance criteria,
  rollback, or failure gates.
- **Decision-complete.** The implementing agent may make local coding choices,
  but must not be forced to invent product semantics, authorization, privacy,
  identity, retention, idempotency, concurrency, external-effect, migration,
  rollout, or success semantics.
- **Execution/proof-complete.** Every acceptance claim maps to a test, command,
  provider read-back, exact-SHA receipt, or explicitly authorized manual
  observation. A `coordination_container` maps its integration acceptance to
  independently completed child contracts and Linear relation/state read-back;
  it never invents an implementation path of its own.
- **Fail-closed.** Missing authority, stale evidence, failed external proof,
  ambiguous ownership, or contradictory state keeps the issue unstarted/open.
- **Proportional.** Completeness is not measured by word count. Reuse canonical
  documents for shared facts, but repeat every binding task-specific condition.
  Remove boilerplate that does not constrain implementation or proof.

Do not use `as needed`, `etc.`, `follow the existing pattern`, `update tests`,
`handle edge cases`, `choose an owner`, `final name`, `TODO`, `TBD`, or another
open-ended placeholder where an agent would have to invent a material decision.
`TBC` and `FIXME` are equally invalid. Final descriptions reject balanced or
unbalanced `{{...}}`, recognized angle tokens such as `<owner:value>` or
`<40-character SHA>`, and recognized square-bracket placeholders such as
`[implementation-sha]`; environment-style aliases such as `$OWNER`,
`${OWNER}`, `$ASSIGNEE`, `%OWNER%`, `%ASSIGNEE%`, `@OWNER@`, `@ASSIGNEE@`,
`OWNER_TBD`, `OWNER_TBC`, `OWNER_PENDING`, `OWNER_TO_BE_FILLED`,
`OWNER_TO_BE_DECIDED`, `TBD_OWNER`, `TBA_OWNER`, `PENDING_OWNER`,
`OWNER_PLACEHOLDER`, `INSERT_OWNER`, `REPLACE_OWNER`, `REPLACE_ME`, `FILL_ME`,
`CHOOSE_OWNER`, `(OWNER)`, `XX_OWNER_XX`, `__OWNER__`, `T.B.D.`, and
`to-be-determined` are placeholders too. This includes any uppercase
`TBD`/`TBC`/`TODO`/`FIXME`/`TBA`/`PENDING` prefix or suffix used as a future
value. Real inline CommonMark links and route segments such as `[locale]`
remain valid. Link-reference
definition lines remain forbidden by the operativity rule below. A value
knowable only during execution uses an exact runtime capture command and
task-specific variable rather than a future-value placeholder. Use
`Not applicable — <specific verified reason>` only when the issue proves why a
conditional section or layer is genuinely unaffected.

## Allowed issue kinds

Every description declares exactly one issue kind:

1. `vertical_execution` — a product or UX behavior delivered end to end.
2. `remediation` — a defect, security, privacy, performance, or reliability
   failure repaired at the closest enforceable boundary and proved through the
   complete affected journey.
3. `operator_execution` — migration, data lifecycle, infrastructure, provider,
   release, backup/restore, or production-proof behavior with a concrete
   operator outcome, protected product invariant, bounded blast radius,
   executable proof, and rollback.
4. `decision_spike` — a time-bounded investigation whose only authorized output
   is evidence, a decision, and updates to the appropriate canon/roadmap. It
   must not silently ship production behavior.
5. `canon_correction` — a documentation/decision reconciliation with named
   contradictory sources, an explicit authority resolution, downstream consumer
   inventory, and machine-checkable stale-reference proof.
6. `coordination_container` — a non-executable outcome container that owns an
   acyclic child/relation graph and integration closeout only. It must never be
   assigned to an implementation agent, moved to `In Progress`, or used to hide
   missing child contracts.

Product issues normally touch at least three applicable layers. A localized
remediation is valid when it proves why one enforceable boundary fixes the full
journey. Operator and decision exceptions must not invent fake UI work merely to
look vertical; they must explain why a standalone bounded behavior is safer and
more honest than embedding it in a product slice.

Kind/metadata compatibility is closed:

| Issue kind               | Required compatibility                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vertical_execution`     | `User-facing: yes`; `Repository change: yes`; complete affected product journey.                                                                                                                                                                                         |
| `remediation`            | `Repository change: yes`; reproduced/proof-gapped journey, closest enforceable boundary, caller/bypass inventory, preserved controls, regression and recovery proof. A provider-only correction is `operator_execution`.                                                 |
| `operator_execution`     | `User-facing: no` unless it intentionally changes an operator UI; `Repository change` may be `yes` or `no`; classify/plan/authorize/apply/verify/rollback/cleanup and environment receipt.                                                                               |
| `decision_spike`         | `User-facing: no`; `Repository change: yes`; `Live deployment required: no`; `Direct production-state mutation: no`; `Touches` includes `docs`; timebox, evidence branches, exact canon/roadmap target, decision, reopen signal; no hidden implementation.               |
| `canon_correction`       | `User-facing: no`; `Repository change: yes`; `Live deployment required: no`; `Direct production-state mutation: no`; `Touches` includes `docs`; contradictory authorities, authority resolution, consumer inventory, stale-reference proof.                              |
| `coordination_container` | `User-facing: no`; `Repository change: no`; no deployment/mutation; `Authorization status: not_required`; `Touches: coordination`; `Sensitive boundaries: none`; `External systems: none`; child DAG/read-back/integration criteria only; never assigned or implemented. |

Split an issue when it contains independent behaviors with different owners,
approval gates, deployability, or rollback. Do not split when the pieces are
only layers of the same observable behavior. A `coordination_container` may
group independently executable children, but every child keeps its own complete
contract, owner, rollout, rollback, acceptance, and closeout evidence.

## Linear container-field contract

The description is only one part of the execution contract. At creation and
after every material update, set and read back all applicable Linear fields:

- **Title:** one specific actor/outcome or failure/recovery behavior in plain
  language. Do not title an issue with a layer (`Build schema`), agent command,
  vague quality (`Improve performance`), or solution before the problem. A
  remediation title names both the observed failure and the protected journey;
  an operator title names the mutation/proof and the protected invariant.
- **Team and project:** use the current OverGarden team and verified active
  project. Never infer a project from an old issue number or copied example.
- **Milestone/cycle:** use only a currently verified execution milestone/cycle
  whose scope contains the behavior. Leave it unset rather than inventing one.
- **Status:** create or rewrite in the team's planning/Triage/Backlog state.
  For executable kinds, `In Progress` begins only after Definition of Ready,
  dependency, branch/no-delta path, and start-gate read-back pass; `Done` follows
  the closeout contract only. A `coordination_container` is never `In Progress`:
  it remains unstarted until its children and integration receipt permit a
  direct terminal closeout.
- **Priority:** derive from verified severity, user/safety impact, dependency
  criticality, and urgency. Do not promote priority merely because a task is
  detailed or recently created; record the reason when it is P0/P1.
- **Labels:** reuse verified existing labels with stable semantics. Do not create
  synonyms, encode dependencies as labels, or use a label as a missing contract.
- **Assignee:** assign only a verified owner/executing agent. Never guess a human
  owner or treat an unassigned issue as authorization to start.
- **Parent/sub-issue:** use only for real outcome decomposition. A parent does
  not waive full contracts on executable children and cannot hide a cyclic or
  cross-owner dependency.
- **Relations:** use Linear's `blocked by`, `blocks`, `related`, duplicate, and
  replacement relations deliberately. A prose mention is not a relation; a
  relation is not proof that the described execution order is safe.
- **Description:** store the complete validated template body. Comments may add
  dated evidence/receipts but cannot silently override the current description.
- **Attachments/links:** attach only non-secret, privacy-safe artifacts with
  stable provenance. Provider consoles, PRs, CI, deployments, and official docs
  are linked directly; screenshots do not replace machine-readable read-back.

Linear assigns the issue identifier after creation, while the exact branch
contract requires that identifier. Therefore creation is intentionally two-pass:
create in a non-execution state, obtain/read back the identifier, hydrate the
identifier-specific branch and references, validate again, update, and read the
entire issue back before assignment or execution.

## Required execution metadata

Place this block immediately after `# AI execution directive`:

```markdown
- Contract: `overgarden.linear-sdd.v1`
- Issue identifier: `OVE-245`
- Issue kind: `vertical_execution`
- User-facing: `yes`
- Locale scope: `shared`
- Repository change: `yes`
- Live deployment required: `yes`
- Direct production-state mutation: `no`
- Authorization status: `not_required`
- Baseline SHA: `<40-character lowercase Git SHA>`
- Evidence captured: `<YYYY-MM-DD>`
- Touches: `repository, server, ui, tests, docs`
- Sensitive boundaries: `user-data, public-search`
- External systems: `none`
```

Allowed `Touches` values are `database`, `repository`, `server`, `ui`,
`local-retirement`, `background-job`, `search`, `media`, `auth`, `analytics`,
`infrastructure`, `deployment`, `coordination`, `tests`, and `docs`. A repository-changing
execution/remediation/operator issue includes `tests` and `docs` plus every
actual affected layer. An external-state-only operator issue declares
`Repository change: no` and must not invent a branch, test edit, docs edit, or
commit; it instead proves the existing executable control path and immutable
provider receipt. A `coordination_container` uses exactly
`Touches: coordination`, `Sensitive boundaries: none`, and
`External systems: none`; any implementation, provider, or sensitive surface
belongs to a separately executable child issue.

Allowed sensitive-boundary values are `none`, `user-data`, `precise-location`,
`media-originals`, `auth`, `public-search`, `secrets`, and `external-effects`.
Use a comma-separated list when several apply. `External systems` names exact
providers or `none`; it does not use generic `cloud` or `database` labels.

`Locale scope` is exactly one of `shared`, `ukraine-only`, `bulgaria`,
`unchanged`, or `not-applicable`. Shared user surfaces cover `uk`, `bg`, and
`ru`; Ukraine-only surfaces cover `uk` and prove the language control absent;
Bulgarian-market surfaces cover `bg|ru`; `unchanged` names and proves the reused
locale contract; `not-applicable` is restricted to non-user-facing work with a
specific reason.

`Live deployment required` means the normal approved release path must produce
exact-SHA runtime evidence. It is not by itself a new authorization gate.
`Direct production-state mutation` means an action outside that normal release:
live data/backfill/delete/classification, DNS/provider/storage/config mutation,
restore/cutover, cost/plan change, or another direct external effect.
`Authorization status` is `not_required`, `pending`, or `approved`. A pending
gate may allow only the explicitly listed safe pre-approval work; it never
authorizes the mutation. Approved status names the maintainer, immutable plan or
artifact digest, environment, scope, timestamp, and read-back receipt.

The baseline SHA records where evidence was observed; it is not permission to
implement from a stale checkout. Before editing, the implementation agent must
fetch and inspect current `main`, current Linear state, every named file and
caller, current migrations/tests, provider state, and dependency relations. If
drift invalidates the diagnosis or contract, stop, amend the issue, run this
standard again, and read the amended Linear description back. Never silently
widen scope or reinterpret an invariant.

## Mandatory description structure

Use the exact ordered H1 headings in
`docs/linear/AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md`. Every section must contain
task-specific content; a heading alone is not a contract. Except for executable
`bash` blocks inside `Verification commands and required evidence`, mandatory
directives, metadata, paths, tables, structured fields, and proof mappings must
be operative Markdown outside fenced code, four-space-indented code, and
blockquotes. CommonMark raw HTML blocks, comments, declarations, processing
instructions, and CDATA are forbidden because Linear rendering can hide their
contents; this includes generic and custom-element block tags such as `span`,
`svg`, `template`, `math`, and `x-hidden`, not only the named block-tag list.
Link-reference definition lines and GFM strikethrough are also forbidden
outside fenced verification commands because they render their contents hidden
or non-operative. Quoted, struck, reference-definition, raw-HTML-block, or
code-form examples never satisfy a contract field.

### 1. AI execution directive

State the single outcome, exact boundary, starting prerequisites, and what the
agent is authorized to change. Explicitly say whether this issue implements,
remediates, operates, investigates, reconciles canon, or coordinates. Name the
issue-specific branch after Linear assigns the identifier only when
`Repository change: yes`; a coordination container explicitly forbids an
assignee, branch, implementation, deployment, and direct mutation.

### 2. Execution metadata

Include the versioned metadata above. The declared triggers determine the
conditional gates in this standard and must match the actual scope.

### 3. User or operator outcome and behavior

Describe the observable happy path, degraded path, and recovery path. Identify
the actor and the final read-back. Avoid component-level language unless it is
part of the behavior.

### 4. Product thinking and falsification

Begin with exactly one operative structured field:
`Product-research branch: constrained` or
`Product-research branch: no_direct`. This enum is the sole branch authority;
free-form prose cannot select, defer, or override it.

State the user/operator job, motivation or protected trust/reliability outcome,
the load-bearing assumption, and evidence that would invalidate or reopen the
approach. User-facing work records the Product Thinking Gate and 2–5 genuinely
relevant research files. Every `User-facing: no` issue records the protected
product, trust, reliability, release, decision, canon, or integration outcome
and must either cite research that genuinely constrains the work or state a
specific task-local conclusion that no product-research file is directly
applicable. These branches are mutually exclusive. The research branch requires
identical non-empty sets of non-README paths here, each with a task-local
constraint explanation that names what the file constrains, and in `Required
context` for baseline verification. Path inventory applies equally to backtick
paths, plain paths, and Markdown link destinations; presentation syntax cannot
hide an undeclared research authority. A path followed only by `constrains`, a
duplicated generic phrase such as `constrains this bounded task contract in
implementation`, or another verb without a domain-specific substantive object
is not an explanation. The
no-direct-research branch requires zero such paths and a closed affirmative
conclusion; `not ruled out`, `open`, `pending`, `unknown`, or another unresolved
research state is invalid. Deferring selection/checking until implementation or
later making product, customer, user, or market research control, guide,
determine, or become mandatory for implementation is also invalid. Partial overlap,
contradictory no-direct claims, irrelevant/non-binding/decorative citations,
and context-only citations are forbidden. A
`coordination_container` names the protected integration outcome and child
evidence while owning zero implementation.

### 5. Pinned baseline, reproduction, evidence, and counterevidence

Include the audit SHA/date, safe reproduction, exact paths/symbols/lines when
verified, current observed failure, useful existing controls, and what was not
proved. Never turn an inference into a fact. External facts use current official
primary sources and a live provider read-back when drift matters. Evidence must
not contain secrets, precise location, raw user content, media keys, capability
URLs, emails, IP/user-agent, stable user IDs, or other prohibited data.

### 6. Root cause or proof gap

Name the closest enforceable failing boundary. If root cause is not proved,
declare the exact proof gap, bounded investigation, decision branches, and stop
condition; do not present the preferred hypothesis as confirmed.

### 7. Non-negotiable invariants

List authorization, ownership, identity, privacy, data, public eligibility,
retention, ordering, localization, and availability rules that no implementation
choice may weaken. Reuse the canonical owner rather than creating parallel
policy, queues, tables, predicates, or state machines. Give each material rule a
unique sequential `INV-##` identifier starting at `INV-01`; acceptance criteria
must not reference an invariant absent from this section.

### 8. Exact data, state, protocol, and concurrency contract

Specify every applicable schema field/constraint/index; request/response/status/
header shape; state/event transition; authority predicate; idempotency key and
retention; transaction boundary; lock/CAS/lease/claim fencing; retry/deadline/
cancellation; external-effect prepare/apply/read-back/compensation; cleanup and
terminal semantics. Name closed enums and numeric bounds. If a category is not
applicable, explain the concrete reason.

### 9. Exact vertical scope, target files, and caller inventory

List verified existing paths/symbols, intended new paths, every direct caller or
sibling contract that could bypass the fix, generated artifacts, tests, docs,
and external configuration surfaces. Existing paths under `Required context` must exist at
task-creation time; planned new target files are explicitly marked `new`.

### 10. Ordered implementation plan

Give dependency-aware numbered steps with stop/go gates. Begin with current-state
preflight and red tests; land contracts before consumers; order migrations and
external effects safely; finish with focused, broad, exact-SHA, deployment/live,
cleanup, and Linear read-back proof. Do not prescribe a destructive production
action before its plan/approval gate.

### 11. UX, accessibility, localization, degraded states, performance, and observability

For UI, define the verified market-valid locale matrix,
keyboard/focus/live-region behavior, loading/empty/error/retry/recovery states,
and what remains usable. Performance and waiting safety are structured data, not
free-form prose. Use exactly one canonical `PERF-01` identity and metric key in
both authoritative fields:

- ``Performance budget: PERF-01 (`metric_key`) — `metric_key` is at most NUMBER UNIT.``
  names one snake-case latency/deadline/timeout/
  response/render/interaction/queue/concurrency/worker/retry/poll/memory/load/
  resource identity, one unconditional upper-bound comparator, one numeric
  threshold, and one compatible unit. The only permitted suffix is an
  unconditional cancellation statement that fences/rejects/stops/prevents a
  named late result. Thresholds must be positive and finite; time budgets cannot
  exceed 24 hours. Fake/dummy/optional/ignored/example metric identities are
  invalid.
- ``Performance measurement: PERF-01 (`metric_key`) — VER-## uses the REAL_TIMER_OR_TEST at `<exact target>` to measure `metric_key`.``
  repeats the
  exact metric key and maps it to one existing verification block. The target
  is an exact command token, test path/selector, endpoint, or authenticated
  connector target repeated verbatim inside that VER block's evidence-producing
  executable/read-back command. Merely testing that a path exists, searching it
  with `rg`/`grep`, reading it, printing it, or mentioning it in a comment does
  not bind the target. Dummy, fictional, sham, pretend, illusory, nonexistent,
  imaginary, or purely declarative instruments are invalid.
- The referenced verification block owns exactly one authoritative
  ``Performance proof: PERF-01 (`metric_key`) — target `<same target>` measures `metric_key` at most NUMBER UNIT and records a bounded threshold receipt.``
  field. It cannot live in a
  Markdown code fence or indented code block.
- The identical ``PERF-01 (`metric_key`) — `metric_key` is at most NUMBER UNIT``
  contract is repeated in one acceptance criterion and one fault-matrix expected
  receipt. A different threshold or unit anywhere for the same canonical metric
  invalidates the issue.

An unrelated sentence, bare `is`, guesswork, disabled/nonexistent measurement,
average/typical/at-best qualifier, lower bound, modal, negative pseudo-budget,
aspirational/informational/illustrative target, or later clause that disables,
waives, makes non-mandatory, exceeds, permits/allows a larger numeric threshold,
or unbounds the contract
is invalid. When performance is genuinely unaffected, both fields use the same
specific, verified, task-local `Not applicable — ...` rationale of at least
eight substantive words; that branch conflicts with any
latency/freeze/deadline/timeout/resource requirement elsewhere in the issue.

The authoritative no-wedge block uses these exact enum/linked fields:

- `Blocking alerts: forbidden`
- `Global wait overlay: forbidden`
- `Pointer trap: forbidden`
- `Unbounded polling/retry: forbidden`
- `Wait-safe controls:` followed by at least two unique, concrete backtick
  control names and `— both remain usable and enabled during every wait.`
- ``Slow/down proof: WAIT-01 — VER-## at `<exact target>` — injected `<fault>` asserts `<control 1>` and `<control 2>` remain responsive and records a bounded `<recovery state>` receipt.``
  The referenced verification block must exist and its executable/read-back
  command must execute the exact target through an evidence-producing runner;
  existence/search/read/comment-only references do not count. Controls end in concrete interaction
  nouns; faults are domain-specific multiword slow/down/deadline/timeout values;
  recovery is one of the closed states enumerated in the tracked template.
- That verification block owns exactly one authoritative
  ``No-wedge proof: WAIT-01 — target `<same target>` injects `<same fault>`, proves `<same control 1>` and `<same control 2>` remain responsive, and records a bounded `<same recovery state>` receipt.``

Each structured field is a real zero-to-three-space Markdown bullet outside a
code fence; quoted examples and indented/fenced blocks do not count. The exact
fields are the sole authority and cannot be duplicated or overridden by later
prose. Any conditional
exception, re-enable/permission/requirement for blocking `window.alert`, a
global spinner/modal, a pointer trap, or unbounded poll/retry; any disabled,
noninteractive, blocked, inert, unavailable, page-wide veil/scrim/input lock,
captured interaction, illustrative/non-mandatory safeguard, or any skipped
assertion/missing receipt invalidates the issue. Double negatives such as `No
window.alert is forbidden`, anti-prohibitions such as `Do not prohibit alerts`,
and active permissions such as `allows window.alert` are invalid. Generic
`unrelated controls`, positional/placeholder names such as `primary control`,
`left button`, or `foo control`, one control, mismatched control names, or
`sample/mock/placeholder timeout` prose is insufficient. Legitimately disabled
authorization/lifecycle actions outside a wait context do not violate this
contract; the prohibition applies to named wait-safe controls and interaction
surfaces while work is pending, slow, or down—including prose that says a page,
interface, screen, platform, product, user navigation, click, or input stops
responding, cannot be used, is swallowed/ignored, or need not work. Logs,
metrics, traces, alerts, and receipts use
bounded safe classes/counts rather than user content or identifiers. Operational
issues state which categories are unaffected and why.

### 12. Migration, compatibility, rollout, rollback, and cleanup

Define expand/backfill/verify/enforce/contract order, fresh-bootstrap parity,
generated types, legacy-row classification, provider/version compatibility,
feature gates, dry-run/plan/apply/read-back, rollback limits, cleanup ownership,
and retention. A rollback must preserve privacy and must not resurrect unsafe
data, stale public state, reusable capabilities, or superseded semantics.

### 13. Dependencies, ownership boundaries, relations, and non-goals

Name `blocked by`, `blocks`, `related`, duplicates/replacements, canonical owner
for every shared contract, execution order, and why the graph is acyclic. Add
only explicit Linear relations after current relation read-back. If one issue
must land Phase A before another issue and resume with Phase B afterward, do not
create reciprocal blockers: specify named phases, immutable receipts, exact
main-containment gates, state between phases, one `related` relation, and the
sole owner of each mutation. List material non-goals and deferred behavior.

### 14. Measurable acceptance criteria

Use numbered, observable criteria with exact state/result/count/time/error/
privacy expectations. Cover happy, negative, boundary, retry, concurrency,
crash/recovery, authorization, another-user, locale, accessibility, performance,
and public/provider read-back where relevant. Avoid `works`, `fast`, `secure`,
`reliable`, `accessible`, `properly`, or `covered by tests` without a threshold
and proof method. Every `AC-##` names the `INV-##` values it protects and the
`VER-##` blocks that prove it; every material invariant must be covered.

### 15. Required test and fault matrix

Map each material invariant and acceptance criterion to focused unit/contract/
integration/browser/provider/direct-SQL tests. Name controlled race counts,
failure-injection points, stale-owner/token cases, partial external success, and
restart/overlap behavior where applicable. Sequential happy-path tests are not
concurrency proof.

### 16. Verification commands and required evidence

Provide copyable `bash` commands with exact working directory, safe environment,
focused checks first and broad checks afterward. Commands must exist now or be
explicit deliverables the issue adds. Do not include credentials or destructive
production arguments. SQL/Kysely work includes `pnpm local:bootstrap`,
`pnpm db:types`, `pnpm db:types:check`, generated-type verification, and
`git diff --check` as applicable. Every repository issue includes focused tests, lint, typecheck, the
appropriate broader suite/build, and `pnpm mainline:closeout:check` at closeout.
Every `VER-##` declares phase, exact `AC-##` coverage, command status, expected
safe receipt, and its own command/read-back block; AC/VER mapping is bidirectional.
`echo`, `printf`, `sleep`, `true`, or prose cannot substitute for proof. An
`external_readback` block names the exact provider command or uses a concrete
`# Authenticated <provider|Linear|connector|API> read-back: <operation>`
annotation when a connector operation is not a shell executable; authenticated
Linear/provider read-back remains mandatory outside the tracked task checker.

### 17. Delivery, exact-SHA proof, and Linear closeout

The section starts with one exact structured path and its exact ordered sequence;
these are the sole delivery-order authority:

- repository change: `Delivery path: repository_change` and
  `current_main -> preserve_local -> issue_branch -> conventional_commit -> branch_push -> pull_request -> exact_head_checks -> capture_feature_sha -> merge_without_bypass -> fetch_main -> containment -> mainline_closeout -> linear_readback -> done`;
- external state only: `Delivery path: external_state_only` and
  `baseline -> no_repository_delta -> environment_identity -> read_only_action -> immutable_receipt -> second_readback -> rollback_result -> cleanup_result -> linear_readback -> done`;
- coordination container: `Delivery path: coordination_container` and
  `unassigned -> outside_in_progress -> child_readback -> dag_proof -> children_done -> integration_receipt -> linear_readback -> terminal_closeout`.

The selected sequence is stored in exactly one `Delivery sequence:` bullet.
Repository delivery additionally owns exactly one `Issue branch`, one
`Implementation SHA variable`, `Direct main mutation: forbidden`, and
`Local state preservation: required` field. The other two paths omit those
repository-only fields. After identifier/child hydration, copy exactly one
matching copy-ready prose contract from the tracked template and resolve only
its declared identifier-dependent tokens. The final section contains those
structured fields plus that one prose contract—no added note, paraphrase,
synonym, exception, alternative branch/SHA, repeated post-terminal action, or
task-specific aside. Put task-specific deployment/provider/live evidence in
acceptance criteria and `VER-##` blocks; it never changes delivery order. This
closed grammar is intentional: it prevents an apparently correct structured
sequence from being contradicted by later natural language.

For `Repository change: yes`, require the exact affirmative clauses `Start from
current main` and `Preserve all unrelated and ignored local files and secrets`,
one unique branch `codex/<issue-id>-<slug>`, Conventional Commits, push, PR,
executed PR-head checks, and merge without bypass. Before merge, capture the
feature HEAD in the one exact task-specific `OVE###_IMPLEMENTATION_SHA`
variable exactly once; never unset, overwrite, reassign, or recapture it. A
second issue branch under any branch namespace, another SHA/HEAD/commit
variable, or direct push, commit, land, fast-forward, or ref write to `main`
invalidates the issue. Imperative prose must preserve the structured order:
Conventional Commit, branch push, PR, exact-head checks, feature-SHA capture,
merge without bypass, containment, then mainline closeout. After merge, use that same variable in
`git merge-base --is-ancestor` against
`origin/main`. Exact-SHA deployment/provider/live evidence is additive when
required and never replaces containment. For `Repository change: no`, forbid a
synthetic branch, commit, and PR. An external-state-only `operator_execution`
requires an explicit no-delta declaration, environment/digest, immutable
provider/action receipt, read-back, and rollback/cleanup result. A
`coordination_container` instead explicitly creates no branch, commit, PR, or
provider effect and requires zero own implementation, complete child identifiers
and DAG read-back, every child independently `Done`, and its own integration-AC
receipt before direct terminal closeout. Finish every path with a redacted
closeout receipt and complete Linear read-back. Creating or rewriting a
description is not implementation evidence. Every delivery obligation is an
affirmative, internally consistent, unconditional action/result clause and the
section itself must contain no scope-level weakening. Merely prefixing the
contract with `discretionary`, `recommended`, `try/aim/plan/intend`, `where
feasible/practical`, `optional`, `aspirational`, `voluntary`, `draft`,
`reference material only`, `examples, not requirements`, `free to disregard`,
`may`, `if available`, `unless necessary`, or
placing the right nouns inside `never`, `do not`, `without`, `no receipt`, or
another weakened/negative-open statement does not satisfy the contract.

### 18. Failure gates

List concrete states that forbid implementation start, rollout, closeout, or
`Done`: stale evidence, placeholder decisions, failed tests, cycle, unresolved
ownership, missing approval, drift, partial migration, local-only proof,
unverified provider effects, privacy leakage, or a behavior-specific false
positive. `Done` is forbidden until every failure gate is cleared.

### 19. Required context

List exact repo files, current related Linear issues, official primary external
references, and selected product research. A path required as existing context
must be verified with `rg --files`. For a `User-facing: no` research branch,
repeat the exact non-README path cited and explained in Product Thinking; a path
listed only here is padding and does not satisfy the gate. Do not paste secrets
or private comments.

### 20. Open maintainer authorization gates

Include this section only when a real action requires new authority: destructive
DB/data work, bulk mutation/deletion, external cost/plan change, production data
classification, provider/DNS/storage mutation, or privacy/security weakening.
Name the exact plan/receipt the maintainer must approve and the safe work that may
continue before approval. The section title remains stable for validation even
after approval; its `Authorization status` and receipt state whether a gate is
open or satisfied. Omit the section only when status is `not_required`.

## Conditional hard gates

| Trigger                                 | Additional mandatory contract                                                                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User-facing: yes`                      | Product Thinking Gate; `docs/product-research/README.md`; 2–5 relevant research files; verified market-valid locale matrix; accessibility; degraded states; browser behavior proof. |
| `database`                              | Additive migration number reservation; constraints/indexes/transactions; legacy classification; bootstrap mirror; Kysely regeneration/check; backfill/verify/rollback.              |
| `auth` or `secrets`                     | Enumeration/timing/error-shape analysis; official library/provider API; key provenance/rotation; session invalidation; logs and evidence redaction.                                 |
| `media` or `media-originals`            | Private quarantine; actual-byte validation; stripped derivative; original cleanup/absence proof; opaque public identity; archive/erasure races.                                     |
| `search` or `public-search`             | One canonical public eligibility predicate; public-only documents; cursor/query privacy; stale removal/convergence; Postgres/Meili parity.                                          |
| `local-retirement`                      | ADR-0017 network-required and server-authoritative semantics; explicit `network_unavailable_save_refused`; one isolated read-only retirement bridge for legacy device state; no new durable browser journal write. |
| `background-job`                        | Closed payload/state schema; claim/lease/CAS; retry/dead-letter/retention; duplicate/restart/overlap proof; nonblocking user path.                                                  |
| `analytics`                             | Consent/eligibility authority; closed event/version/properties; bounded enums; actor/cohort exclusions; no content/precise location/stable identity; failure isolation.             |
| Public route/indexability               | `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md`; canonical policy call; SSR/robots/sitemap/structured-data parity; thin/unsafe UGC remains fail-closed.                                     |
| Python target or command                | Existing service path or explicitly new target; `uv run --frozen pytest`; TS/Python contract parity when a shared payload/protocol is involved.                                     |
| External provider/system                | `docs/INFRASTRUCTURE_REGISTRY.md`; current plan/capability read-back; official source; idempotent diff; approval when state/cost changes; rollback and post-effect read-back.       |
| Container runtime                       | `docs/CONTAINER_RUNTIME_POLICY.md`; Apple Container first on supported Macs; exact justified Docker exception.                                                                      |
| `Direct production-state mutation: yes` | Read-only classify/plan; environment/digest confirmation; bounded apply; non-`not_required` authorization; drift refusal; verify; rollback/cleanup.                                 |
| Sensitive data                          | Threat/abuse boundary; exact forbidden fields; another-user/session tests; recursive log/trace/analytics/evidence redaction; precise-location negative proof when applicable.       |
| Performance/freeze                      | Main-thread/request/provider budgets; finite deadline/cancellation; bounded queues/workers; no alert/modal/global pointer trap; load and recovery matrix.                           |

## Definition of Ready

An issue is not execution-ready when any of these is true:

- The issue duplicates or conflicts with current Linear work and no canonical
  owner/replacement decision is recorded.
- Any metadata trigger is missing, false, or inconsistent with the scope.
- It fails the current `SDD Slice Test` or the applicable exception contract.
- It contains an unresolved placeholder, unverified existing path, invented
  command, or hidden dependency on the author's knowledge.
- Root cause is asserted without evidence instead of being labeled a proof gap.
- A material invariant lacks a measurable acceptance criterion and proof method.
- A qualitative claim lacks an explicit threshold or state.
- Authorization, identity, privacy, retention, idempotency, concurrency,
  external-effect, migration, or rollback semantics remain open to invention.
- Adjacent issues can both believe they own the same state/table/queue/policy.
- The blocker graph contains a self-edge, reciprocal blocker, or cycle.
- A destructive/external mutation lacks read-only plan, authorization, bounded
  blast radius, drift check, read-back, and rollback/cleanup.
- Several independent behaviors with different rollout/rollback are bundled.
- Product Thinking is absent or replaced by irrelevant research citations.
- The tracked task validator fails or the post-write Linear read-back differs.

`pnpm linear:task:check` returning `valid` means only that the Markdown
description satisfies the task-local contract. It does not prove Linear title,
team/project/milestone/status/priority/labels/assignee, relation DAG, approval,
or saved bytes. Execution-ready additionally requires authenticated connector
read-back of those fields, relation-cycle review, and post-write digest equality.
For `Authorization status: pending`, only the task's explicitly enumerated safe
pre-approval phase may start; the mutation/rollout gate remains closed.

## Creation, update, and read-back protocol

A change is material and triggers complete revalidation/read-back when it alters
the outcome/title, issue kind or metadata trigger, baseline evidence/root cause,
invariant, data/state/protocol/concurrency semantics, target/caller inventory,
dependency/owner/relation, acceptance or proof mapping, rollout/rollback/
cleanup, authorization/production scope, project/milestone/priority, or terminal
evidence. Typographic corrections that change none of those may use a lighter
read-back, but the saved body digest must still be refreshed.

1. Read current repo/branch/dirty state and fetch current `main`; do not trust a
   prior chat or old issue description.
2. Through the authenticated Linear connector, read team, project, milestone,
   workflow states, priority/labels, potential duplicates, related descriptions,
   comments needed for context, and relations. Do not use a private-token or UI
   workaround when the connector is unavailable.
3. For `User-facing: yes`, run the Product Thinking Gate. For
   `User-facing: no`, record the protected outcome and either cite research that
   genuinely constrains the work or record a specific no-direct-research
   conclusion. Run current external/provider verification whenever applicable.
4. Draft from `docs/linear/AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md`; run structural,
   semantic, dependency/DAG, privacy, and adversarial reviews.
5. Before an identifier exists, placeholders are permitted only in a local draft.
   Create the issue in its planning/Triage/Backlog state, obtain the identifier,
   render the exact branch and closeout contract, and immediately validate the
   final description. Do not assign execution or move it In Progress yet.
6. Create/update in small logical batches. Preserve unrelated status, priority,
   assignee, labels, milestone, comments, attachments, and relations.
7. Read back identifier, URL, title, entire description, team/project/milestone,
   status, priority, labels, and relations. Check the GraphQL `errors` array even
   on HTTP 200. Compare exact intended/saved UTF-8 bytes or SHA-256; a mutation
   success flag without read-back is not proof.
8. Add only intended blocker/related/duplicate relations after proving the graph
   stays acyclic; then read every relation back. Description mentions are not a
   substitute for deliberately verified relations.
9. Run the checker again on the saved body. Only then may the issue be considered
   execution-ready. Creating/updating the issue never counts as implementation or
   `Done` evidence.

Linear supports team/workspace issue templates and required form fields. The
current bundled connector can mirror this canon into Linear documents but does
not expose team-template administration. Making the repository template the
OverGarden default is therefore an explicit maintainer UI gate until that
capability exists; agents must not use private-token or browser automation to
pretend it was completed. The repository version remains authoritative, and
template/document drift must be reconciled and read back rather than silently
accepted.

The maintainer closes that UI gate only after all of the following are true:

1. Create or update one OverGarden team template named
   `OverGarden — AI-Agent Execution Issue (v1)` from the repository template at
   the exact merged `main` SHA; do not maintain a second divergent body.
2. Configure it as the OverGarden team's default issue template and preserve the
   team/project/status/label/priority/milestone rules from this standard rather
   than baking stale queue values into the body.
3. Open a new unsaved issue from the normal create flow and verify the selected
   team receives that default, all 19 required H1 headings, the contract version,
   exact structured performance/no-wedge fields, and no truncated Markdown.
4. Record a redacted receipt containing template name, team, verification date,
   merged source SHA, and SHA-256 of the repository template; never include a
   private token or issue content containing user data.
5. Read the template back through the strongest available official surface and
   compare it with the merged repository source. If exact machine read-back is
   unavailable, record that limitation and keep the repository file
   authoritative; do not claim digest equality from a visual spot check.

Official Linear mechanics used by this protocol (verified 2026-07-26):

- [Issue templates](https://linear.app/docs/issue-templates) documents team and
  workspace templates, default templates, and required fields in form templates.
- [Creating issues](https://linear.app/docs/creating-issues) documents creation
  and the post-create identifier needed for the two-pass hydration above.
- [Issue relations](https://linear.app/docs/issue-relations) defines blocking,
  related, and duplicate semantics; OverGarden adds the stricter acyclic graph
  and staged-handoff rules in this standard.
- [GraphQL API](https://linear.app/developers/graphql) documents issue mutations
  and the `errors` payload; this standard additionally requires full read-back
  and digest comparison instead of trusting mutation transport success.

## Machine validation

Validate a concrete draft before Linear write and the exact read-back afterward:

```bash
cd apps/web
pnpm linear:task:check -- --file ../../path/to/issue.md --phase final
cat ../../path/to/issue.md | pnpm linear:task:check -- --stdin --phase final
pnpm linear:task:check -- --file ../../path/to/read-back.md --phase final --expected-sha256 <validated-pre-write-sha256>
pnpm linear:task:standard:check
```

`--phase template` validates the tracked template while allowing its explicit
placeholders. `--phase final` rejects placeholders and requires a concrete
identifier-specific contract. `--expected-sha256` makes post-write read-back fail
when the returned UTF-8 body differs byte-for-byte from the validated payload.
File paths may be current-working-directory-relative or repository-root-relative.
The checker parses CommonMark fences, exact metadata/enums, issue-kind
compatibility, concrete product/evidence fields, sequential `INV-##`/`AC-##`/
`VER-##` definitions, bidirectional mappings, and every row of the seven-column
fault matrix. It rejects negative keyword stuffing, qualitative performance,
wait traps, non-asserting verification blocks, missing aggregate repository
gates, hazardous commands in any action surface, shell-chain executables after
`&&`/`||`/`|`/`;`, invalid working-directory/path/symbol references, synthetic
repository delivery for no-delta tasks, weak provider read-back, fabricated or
future approval receipts, and coordination containers without a concrete child
DAG and child-by-child integration coverage.
Final validation requires an available `origin/main`, proves the baseline is an
ancestor, and rejects existing context/target/command paths absent from the
declared baseline Git tree; it never falls back to a feature `HEAD` as main
authority. The checker validates repository evidence and Markdown; it cannot authenticate
Linear container fields or relations, so connector read-back remains mandatory.
A second adversarial agent review remains mandatory for high-risk, cross-system,
destructive, security, privacy, or P0/P1 issues.

The repository CI job tests the standard/template/validator when that workflow
runs; it does not receive private live Linear descriptions. Local pre-write and
post-read-back validation is therefore mandatory even when CI is green. Do not
claim automatic PR enforcement while CI triggers are administratively paused.

Do not game the checker with keyword stuffing. There is no minimum character
count. Do not weaken the checker merely to make a draft pass; repair the task or
document a genuinely non-applicable conditional with a specific reason.

## OVE-213 through OVE-244 lessons retained

- OVE-213/214/217/218 made responsiveness measurable: finite deadlines,
  cancellation/fencing, bounded work, and no platform-wide wait trap.
- OVE-215/216/225/227/242 assigned one canonical owner to cleanup, erasure,
  queue contracts, projection convergence, and terminal proof.
- OVE-219/220/221/223/239 separated request latency from durable work and made
  search budgets, cursor/query privacy, public eligibility, and fallback exact.
- OVE-222 made the canonical locale-aware URL owner explicit and required
  forward/back/reload/query/return-path proof across every SSR/browser producer,
  including negative proof for double prefixes, open redirects, and cookie
  oscillation.
- OVE-224 normalized and classified internal namespaces before application
  routing: literal/encoded/mixed/double-encoded/malformed inputs, no recursive
  decode, GET/HEAD/RSC/prefetch parity, legitimate Unicode controls, and a hard
  empty-body `404` before shell, locale, session, or fixture access.
- OVE-226/232/240/241 specified complete auth route inventories, official API
  contracts, rotation/fallback, anti-enumeration, and single-use recovery state.
- OVE-231/243/244 proved that media tasks need actual-byte admission, stable
  identity, bounded concurrency, external-effect compensation, original-absence
  proof, and staged non-circular ownership.
- OVE-228/230/233 treated CI, upgrade, restore, artifact, deployment, and provider
  receipts as behavior—not as prose or a green status assumption.
- OVE-234/235/236/237/238 made privacy/moderation/session/abuse/redirect rules
  exact at every write/read boundary, including negative and race cases.
- OVE-229 separated synthetic/excluded activity from decision-grade learning and
  failed closed on unclassified evidence.

The transferable lesson is not “make every issue long.” It is: leave no
load-bearing decision implicit, give every shared contract one owner, prove the
behavior under failure and concurrency, and define `Done` before implementation.

## Standard-change protocol

Changes to this standard require one PR that updates, as applicable:

- this document and its contract version;
- `docs/linear/AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md`;
- `apps/web/scripts/check-linear-agent-task.ts` and its tests;
- `AGENTS.md`, `README.md`, the SDD roadmap, Product Thinking, and closeout
  pointers;
- the mirrored Linear team documents after connector read-back, plus the default
  team template once the documented maintainer/capability gate is completed.

Do not silently edit an existing version's meaning. Materially incompatible
changes create the next contract version and include migration guidance for open
issues. Closed historical issues are not retroactively invalidated unless
reopened or materially rewritten. Open pre-version issues that are explicitly
named by a migration gate, including OVE-213 through OVE-244 above, must satisfy
that gate before assignment or implementation.
