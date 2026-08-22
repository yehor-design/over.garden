# AI execution directive

Reconcile every live canon document and every saved Linear contract with the MVP posture ADR-0018 records, and mark the rest as historical rather than rewriting it. Start from current `main` and authenticated Linear read-back after OVE-333, OVE-337, OVE-338, and OVE-342 are Done and contained in origin/main, because only then is the posture fully implemented and the reconciliation can be proved against shipped behavior rather than intent. This issue owns the canon reconciliation, its classification instrument, and one written alignment record. It changes no runtime owner, no product behavior, and no test expectation.

# Execution metadata

* Contract: `overgarden.linear-sdd.v1`
* Issue identifier: `OVE-339`
* Issue kind: `canon_correction`
* User-facing: `no`
* Locale scope: `not-applicable`
* Repository change: `yes`
* Live deployment required: `no`
* Direct production-state mutation: `no`
* Authorization status: `not_required`
* Baseline SHA: `77d1dae77be65454dba62ce6178b2157ffbaf500`
* Evidence captured: `2026-08-19`
* Touches: `repository, tests, docs`
* Sensitive boundaries: `none`
* External systems: `Linear, GitHub`

# User or operator outcome and behavior

* Actor and precondition: an execution agent opens any canon document or saved contract on a build where ADR-0018 is the binding posture and the posture program has shipped.
* Happy path: every live authority document states the posture that the code actually implements, and every historical receipt is labelled as historical instead of silently contradicting the live canon.
* Degraded path: the classification instrument cannot decide whether a document is live authority or a historical receipt; it stops with one named `unclassified` receipt naming the exact path and changes nothing.
* Recovery path: revert this commit; the recovery is one revert because every document returns to its prior text and no runtime behavior was ever involved.
* Final read-back: no live authority document contradicts ADR-0018, every historical receipt carries its label, and the alignment record names each decision.
* Not sufficient as proof: a global search-and-replace, a document rewritten without reading what it governs, a historical receipt edited in place, or a claim of completeness without the enumerated classification.

# Product thinking and falsification

* Product-research branch: no_direct
* Job or protected outcome: keep the written canon truthful, so an agent that opens a document to decide how to behave reads the posture the product actually has.
* Load-bearing assumption: the contradiction is concentrated in a countable set of documents and each one can be classified as live authority or historical receipt by an explicit rule rather than by judgement.
* Product Thinking Gate: this is a documentation-consistency correction with no gardener surface, no public information architecture change, no pricing or market claim, and no product semantics; no product-research file directly constrains, governs, defines, requires, or applies to it.
* Falsification signal: a document resists classification, or reconciling one live authority document would change what the product does rather than what the canon says. Either falsifies the assumption that this is a documentation-only correction.
* Smallest reversible response: revert this single commit; the canon returns to its prior text with no data or behavior recovery step.

# Pinned baseline, reproduction, evidence, and counterevidence

Audit baseline: `77d1dae77be65454dba62ce6178b2157ffbaf500`, observed 2026-08-19.

Safe reproduction:

1. Fetch `origin/main`, prove a clean tree, and read this issue, its four predecessors, project, milestone, status, labels, and direct relations through authenticated Linear.
2. Enumerate every repository document containing a fail-closed posture claim and record the exact count and paths, so the reconciliation is proved against a measured surface rather than an estimate.
3. Confirm the named proof gap remains and stop if current main, the ADR-0018 receipt, or the enumerated set differs from this contract.

Confirmed evidence:

1. A repository-wide scan at this baseline finds forty-four documents carrying a fail-closed posture claim, which is the exact surface that ADR-0018 will contradict once it is merged.
2. `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md` is the highest authority among them, because every future contract is written against it and a stale posture claim there propagates into every new issue.
3. `apps/web/scripts/check-linear-agent-task.ts` contains no fail-closed posture requirement at this baseline, proved by a zero-match scan, so the validator needs no change and every posture contract already validates clean against it.
4. `docs/runbooks/`, `docs/superpowers/`, `docs/reviews/`, `docs/linear/`, and the dated baseline documents are completed receipts whose value is that they record what was true when written.

Counterevidence and preserved controls:

Counterevidence: a fail-closed sentence inside a completed receipt is not a contradiction, it is provenance; rewriting it would destroy the record and would falsely imply the earlier work was done under the current posture.

* Every runtime owner, test expectation, and product behavior stays exactly as the posture program left it; this issue may only change what documents say about that behavior.
* `apps/web/scripts/check-linear-agent-task.ts` stays unchanged, because its required vocabulary is about privacy and authorization evidence rather than posture.

Not proved at creation:

Not proved: whether any single document is live authority or a completed receipt is decided by the classification rule during execution, not asserted here; the instrument records the decision per path.

# Root cause or proof gap

The closest proved boundary is that the posture program changes behavior in code while forty-four documents keep asserting the prior posture in prose, and nothing in the repository detects that divergence. The standard itself is among them, so a stale claim there reaches every future contract through its consumers. The enforceable repair is one classification rule applied to the enumerated set, one reconciliation per live authority document, one historical label per completed receipt, and one written alignment record naming every decision. The recovery path is a revert of this commit, which restores the prior prose with no behavior involved.

Stop condition and decision branch: stop before any edit when the ADR-0018 receipt is absent, when the enumerated document set differs from the recorded count, or when reconciling a document would require a runtime change; reconcile and revalidate this issue, then reopen execution only from the corrected saved contract.

# Non-negotiable invariants

1. **INV-01 — Live authority is reconciled, historical receipts are labelled.** A document that an agent reads to decide current behavior is corrected to match ADR-0018; a document that records completed work receives a historical label and keeps its original text.
2. **INV-02 — Documentation only.** This issue changes no runtime owner, migration, test expectation, or product behavior; a required behavior change means the classification was wrong and execution stops.
3. **INV-03 — Every decision is enumerated.** The alignment record names each document in the measured set, its classification, and what changed, so a reader can audit the sweep instead of trusting it.
4. **INV-04 — Scope fence.** The validator, the offline removal owned by OVE-323, and every already-shipped posture owner are untouched.
5. **INV-05 — Bounded scan.** The classification scan completes inside its declared deadline and cancellation leaves the working tree unchanged.
6. **INV-06 — Evidence hygiene.** Raw user content, credentials, another-user identifiers, and precise location remain forbidden in every receipt this issue produces; each receipt is redacted to paths, classes, and counts.

# Exact data, state, protocol, and concurrency contract

* Data/schema: Not applicable — this correction changes prose and creates no SQL migration, database row, backfill, or production state.
* Request/action/API: Not applicable — no route, action, or payload exists in this issue.
* State transitions: each enumerated document resolves `unclassified -> live_authority -> reconciled` or `unclassified -> historical_receipt -> labelled`; an `unclassified` terminal state stops the run and changes nothing.
* Idempotency: rerunning the instrument on a reconciled tree reports zero remaining contradictions and makes no second edit.
* Concurrency: the instrument is a single-writer local scan with no shared claim; a second concurrent run reports `scan_already_running` and writes nothing.
* Deadlines/retry: the scan completes within the declared PERF-01 bound, retry is caller-initiated, and cancellation leaves the tree unchanged.
* External effects: repository text and the authenticated Linear read-back only; no deployment, provider, or production effect exists in this issue.
* External-system contract: the official Linear capability and the official GitHub capability recorded in docs/INFRASTRUCTURE_REGISTRY.md are each read back before use; every read-back stays idempotent under the declared task key, records a redacted receipt, and retains an executable rollback through one revert.

# Exact vertical scope, target files, and caller inventory

| Layer/surface | Exact existing owner or planned new path | Required change/read-back | Status |
| -- | -- | -- | -- |
| Contract standard | `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md` | Highest authority: reconcile its posture claim, because every future contract consumer inherits a stale statement from it. | required existing owner |
| Roadmap authority | `docs/SDD_VERTICAL_SLICE_ROADMAP.md` | Reconcile the posture claim that the slice roadmap asserts to its consumers. | required existing owner |
| Closeout authority | `docs/MAINLINE_CLOSEOUT.md` | Reconcile the posture claim that gates every delivery. | required existing owner |
| Privacy retention policy | `docs/MVP_PRIVACY_RETENTION_POLICY.md` | Reconcile the posture claim while keeping every retention cutoff exactly as it is. | required existing owner |
| Location firewall | `docs/PRECISE_LOCATION_TEXT_FIREWALL.md` | Reconcile the posture claim against what the shipped guard now records. | required existing owner |
| Index parity contract | `docs/PUBLIC_JOURNAL_INDEX_PARITY.md` | Reconcile the posture claim against the shipped admission and indexability behavior. | required existing owner |
| Mutation admission | `docs/architecture/AUTHENTICATED_MUTATION_ADMISSION.md` | Reconcile the posture claim against the shipped authorization behavior. | required existing owner |
| Launch corpus | `docs/LAUNCH_CORPUS.md` | Reconcile the posture claim against the shipped media behavior. | required existing owner |
| Alignment record | `docs/MVP_POSTURE_CONTRACT_ALIGNMENT.md` (new) | Name every enumerated document, its classification, and what changed. | required (new) |
| Classification instrument | `apps/web/scripts/verify-posture-canon-alignment.ts` (new) | Enumerate the measured set, classify each path, and emit a redacted aggregate receipt. | required (new) |
| Instrument tests | `apps/web/scripts/verify-posture-canon-alignment.test.ts` (new) | Prove classification, idempotent rerun, the declared deadline, and cancellation. | required (new) |
| Posture canon | `docs/adr/ADR-0018-mvp-posture.md` (new) (provided by the OVE-329 prerequisite) | Read the posture this sweep reconciles every other document against. | required (new) |

Caller/sibling/consumer inventory:

* Every remaining document in the measured set is classified by the same rule; the eight named above are the live authority documents whose stale text reaches the most consumers, and the rest are handled by classification rather than by individual naming.
* `apps/web/scripts/check-linear-agent-task.ts` is a read-only consumer of the standard and stays unchanged.
* `src/lib/offline/` remains untouched and is deleted by OVE-323.
* Verification command-relative planned path: `scripts/verify-posture-canon-alignment.ts` (new under `apps/web`); it is the sole PERF-01 and WAIT-01 instrument.

# Ordered implementation plan

1. Fetch current main, preserve local state, read the ADR-0018 receipt and this issue with relations, and stop on posture, count, or predecessor drift.
2. Run the enumeration and record the measured document set and its exact count as the baseline for this sweep.
3. Classify every enumerated path as live authority or historical receipt, and stop on any `unclassified` result rather than guessing.
4. Reconcile each live authority document to what ADR-0018 records and what the shipped owners now do.
5. Add the historical label to each completed receipt without altering its original text.
6. Write the alignment record naming every document, classification, and change, then rerun the instrument to prove zero remaining contradictions.
7. Re-read every saved Linear contract in the posture program and correct any body whose prose still asserts the retired posture.
8. Run broad gates, deliver through a pull request, fetch main, run the mainline closeout, and compare the full saved Linear digest.

# UX, accessibility, localization, degraded states, performance, and observability

* Locale matrix: Not applicable — this correction changes repository prose only and renders no gardener surface, localized string, or language selection.
* Accessibility: Not applicable — the instrument emits machine-readable classes in a terminal and creates no browser control.
* Degraded state and loading/error/retry: the complete active classes are `unclassified`, `live_authority`, `historical_receipt`, and `reconciled`; the run is finite, every terminal state names its class, and the recovery from any interrupted run is a clean working tree.
* Performance budget: PERF-01 (`canon_alignment_scan_duration`) — `canon_alignment_scan_duration` is at most 600000 ms and cancellation rejects late completion.
* Performance measurement: PERF-01 (`canon_alignment_scan_duration`) — VER-03 uses the monotonic timer at `scripts/verify-posture-canon-alignment.test.ts` to measure `canon_alignment_scan_duration`.
* Blocking alerts: forbidden
* Global wait overlay: forbidden
* Pointer trap: forbidden
* Unbounded polling/retry: forbidden
* Wait-safe controls: `terminal cancellation command`; `alignment status command` — both remain usable and enabled during every wait.
* Slow/down proof: WAIT-01 — VER-03 at `scripts/verify-posture-canon-alignment.test.ts` — injected `document scan timeout` asserts `terminal cancellation command` and `alignment status command` remain responsive and records a bounded `timed out` receipt.
* Observability: record path, classification class, change class, counts, and duration; never record raw user content, credentials, another-user identifiers, or precise location.

# Migration, compatibility, rollout, rollback, and cleanup

* Expand: add the instrument and the alignment record before editing any document, so every edit is made against a recorded classification.
* Legacy/backfill: no data migration and no backfill; completed receipts keep their original text and gain only a label.
* Compatibility: every consumer of a reconciled document keeps reading the same file at the same path; only its posture statement changes.
* Enforce: the sweep is not complete until the instrument reports zero remaining contradictions and the alignment record names every enumerated path.
* Rollout: no deployment; the change reaches agents when it is contained in origin/main.
* Rollback: revert this single commit; every document returns to its prior text.
* Cleanup/retention: retain the alignment record permanently as the sweep evidence and remove only temporary scan output.

# Dependencies, ownership boundaries, relations, and non-goals

* Blocked by: OVE-333, OVE-337, OVE-338, and OVE-342 merged and contained, because the canon may only be reconciled against posture behavior that has actually shipped and against instruments that already assert it.
* Blocks: OVE-186 launch closeout, because its evidence matrix asserts the fail-open, media, indexability, and admin behavior this program ships, so the closeout may only run against a canon that already states that posture.
* Related: OVE-329 posture canon, because ADR-0018 is the authority every reconciled document is measured against.
* Duplicate/replaces: none — this issue is the sole owner of the canon reconciliation.
* Acyclic execution order: `OVE-329 -> OVE-333 -> OVE-342 -> OVE-339 -> OVE-186`; no successor holds a reverse edge into a predecessor.
* Canonical owners: ADR-0018 owns the posture decision; this issue owns only the reconciliation of documents to it; every runtime owner keeps the contract its own issue gave it.
* Staged handshake: this issue consumes the four predecessor receipts and emits one alignment record; the OVE-186 launch closeout starts only from that record and a matching authenticated relation read-back.

Non-goals:

* No runtime, migration, test, or product behavior change of any kind.
* No edit to `apps/web/scripts/check-linear-agent-task.ts`, whose required vocabulary is about privacy and authorization evidence rather than posture.
* No rewriting of a completed receipt's original text.

# Measurable acceptance criteria

1. AC-01 — every document in the enumerated set carries a recorded classification, every live authority document states the ADR-0018 posture, and the instrument reports zero remaining contradictions
   * Protects: `INV-01`, `INV-03`.
   * Verified by: `VER-01`, `VER-04`.
2. AC-02 — every completed receipt keeps its original text and gains only a historical label, and zero runtime owner, test expectation, or product behavior changed in the diff
   * Protects: `INV-02`, `INV-04`, `INV-06`.
   * Verified by: `VER-02`, `VER-04`.
3. AC-03 — rerunning the instrument on the reconciled tree makes no second edit, and an injected scan timeout leaves the working tree unchanged with both declared controls usable
   * Protects: `INV-04`, `INV-05`.
   * Verified by: `VER-03`, `VER-04`.
4. AC-04 — PERF-01 (`canon_alignment_scan_duration`) — `canon_alignment_scan_duration` is at most 600000 ms; the declared representative document set resolves inside the bound while both declared controls stay usable
   * Protects: `INV-05`.
   * Verified by: `VER-03`, `VER-04`.
5. AC-05 — the implementation SHA is contained in origin/main, the alignment record names every enumerated path, every saved Linear body in the posture program matches the shipped posture, and the saved Linear body and relations match
   * Protects: `INV-03`, `INV-06`.
   * Verified by: `VER-05`, `VER-06`.

# Required test and fault matrix

| Case | Protects | Proves | Verification | Level | Fault/input | Expected receipt |
| -- | -- | -- | -- | -- | -- | -- |
| Happy path | `INV-01`, `INV-03` | `AC-01` | `VER-01`, `VER-04` | integration | complete enumerated document set at the pinned baseline | every path classified, every live authority reconciled, zero contradiction remaining |
| Authorization/another owner | `INV-02`, `INV-04` | `AC-02` | `VER-02`, `VER-04` | contract | a document owned by another issue or outside the measured set | untouched path and a recorded out-of-scope class |
| Invalid/boundary input | `INV-02`, `INV-04` | `AC-02` | `VER-02`, `VER-04` | contract | a document that resists classification or whose reconciliation would need a runtime change | `unclassified` terminal receipt and an unchanged working tree |
| Duplicate/replay | `INV-04`, `INV-05` | `AC-03` | `VER-03`, `VER-04` | integration | rerun on an already reconciled tree | zero second edit and an identical recorded classification |
| Concurrent race | `INV-04`, `INV-05` | `AC-03` | `VER-03`, `VER-04` | integration | two concurrent scans | one owner, one `scan_already_running`, zero duplicate edit |
| Timeout/crash/partial success | `INV-04`, `INV-05` | `AC-03`, `AC-04` | `VER-03`, `VER-04` | fault integration | document scan timeout, cancellation, crash, or restart | bounded `timed out` or recovery receipt and an unchanged working tree |
| Archive/erasure/revocation | `INV-02`, `INV-04` | `AC-02` | `VER-02`, `VER-04` | integration | a completed receipt, a dated baseline, and a stale historical claim | original text retained and a historical label added |
| Locale/a11y/degraded UI | `INV-02`, `INV-05` | `AC-02`, `AC-03` | `VER-02`, `VER-03`, `VER-04` | contract | terminal cancellation and status path with no browser surface | task-specific no-UI receipt with usable controls |
| Load/resource budget | `INV-05` | `AC-04` | `VER-03`, `VER-04` | load | the complete enumerated document set | PERF-01 (`canon_alignment_scan_duration`) — `canon_alignment_scan_duration` is at most 600000 ms; no unrelated regression |
| Mainline and saved-contract closeout | `INV-03`, `INV-06` | `AC-05` | `VER-05`, `VER-06` | delivery/read-back | exact feature SHA, alignment record, relations, and saved bodies | exact-SHA containment, matching digest, and acyclic relations |

# Verification commands and required evidence

## VER-01 — Classification and reconciliation contract

* Phase: local
* Proves: `AC-01`
* Command status: `must_be_added`
* Expected receipt: every enumerated path carries a classification and every live authority document states the ADR-0018 posture.

```bash
cd apps/web
pnpm exec vitest run scripts/verify-posture-canon-alignment.test.ts
```

## VER-02 — Documentation-only and historical-preservation proof

* Phase: local
* Proves: `AC-02`
* Command status: `must_be_added`
* Expected receipt: completed receipts keep their original text, out-of-scope paths stay untouched, and the diff contains no runtime, test, or migration change.

```bash
cd apps/web
pnpm exec vitest run scripts/verify-posture-canon-alignment.test.ts --testNamePattern "historical|out-of-scope|documentation-only|unclassified"
```

## VER-03 — Replay, race, performance, and no-wedge proof

* Phase: local/integration
* Proves: `AC-03`, `AC-04`
* Command status: `must_be_added`
* Expected receipt: rerun, concurrent, timeout, and cancellation fixtures end in the exact bounded terminal classes with an unchanged working tree.
* Performance proof: PERF-01 (`canon_alignment_scan_duration`) — target `scripts/verify-posture-canon-alignment.test.ts` measures `canon_alignment_scan_duration` at most 600000 ms and records a bounded threshold receipt.
* No-wedge proof: WAIT-01 — target `scripts/verify-posture-canon-alignment.test.ts` injects `document scan timeout`, proves `terminal cancellation command` and `alignment status command` remain responsive, and records a bounded `timed out` receipt.

```bash
cd apps/web
pnpm exec vitest run scripts/verify-posture-canon-alignment.test.ts --testNamePattern "replay|concurrent|timeout|cancel"
tsx scripts/verify-posture-canon-alignment.ts --prove-determinism --inject-dependency-timeout
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

## VER-05 — Mainline and Linear proof

* Phase: main
* Proves: `AC-05`
* Command status: `existing`
* Expected receipt: exact-SHA implementation containment and the mainline closeout gate pass on current origin/main.

```bash
git fetch origin main
git merge-base --is-ancestor "$OVE339_IMPLEMENTATION_SHA" origin/main
cd apps/web
pnpm mainline:closeout:check
```

## VER-06 — Task-specific alignment and Linear read-back

* Phase: read-back
* Proves: `AC-05`
* Command status: `must_be_added`
* Expected receipt: the alignment record names every enumerated path, the instrument reports zero remaining contradictions, and the official Linear capability returns complete fields, body digest, and relations that match under an idempotent read-back with an executable rollback.

```bash
cd apps/web
tsx scripts/verify-posture-canon-alignment.ts --emit-aggregate-receipt
# Authenticated Linear read-back: fetch this issue's title, team, project, milestone, status, priority, labels, full description, and relations; compare the saved UTF-8 SHA-256.
```

# Delivery, exact-SHA proof, and Linear closeout

* Delivery path: repository_change
* Delivery sequence: current_main -> preserve_local -> issue_branch -> conventional_commit -> branch_push -> pull_request -> exact_head_checks -> capture_feature_sha -> merge_without_bypass -> fetch_main -> containment -> mainline_closeout -> linear_readback -> done
* Issue branch: `codex/ove-339-posture-canon-alignment`
* Implementation SHA variable: `OVE339_IMPLEMENTATION_SHA`
* Direct main mutation: forbidden
* Local state preservation: required

Start from current main on `codex/ove-339-posture-canon-alignment`. Preserve all unrelated and ignored local files and secrets. Use a Conventional Commit, push, open a PR, and run exact-head checks. Before merge, record `OVE339_IMPLEMENTATION_SHA=$(git rev-parse HEAD)` exactly once in the redacted closeout receipt. Merge without bypass only after every required check passes. After merge, fetch origin/main, run `git merge-base --is-ancestor "$OVE339_IMPLEMENTATION_SHA" origin/main`, and then run `cd apps/web && pnpm mainline:closeout:check`. Perform the final Linear read-back and compare the saved-description SHA-256 before Done.

# Failure gates

Do not merge or mark `Done` when:

* OVE-333, OVE-337, OVE-338, or OVE-342 is not independently Done and contained, or the relation graph is stale, missing, reversed, duplicated, or cyclic;
* the enumerated document count differs from the recorded baseline without a named reason;
* any runtime owner, test expectation, migration, or product behavior appears in the diff;
* a completed receipt had its original text rewritten rather than labelled;
* a document remains `unclassified` while the sweep is claimed complete;
* `apps/web/scripts/check-linear-agent-task.ts` was edited;
* the declared deadline, cancellation, or rerun-idempotence proof fails;
* only local or branch proof exists without origin/main containment;
* the saved Linear body digest differs from the validated payload; or
* evidence contains a secret, credential, raw user content, another-user identifier, email, IP or user-agent, or precise location.

# Required context

Repository authority:

* `AGENTS.md`
* `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`
* `docs/SDD_VERTICAL_SLICE_ROADMAP.md`
* `docs/MAINLINE_CLOSEOUT.md`
* `docs/TECH_STACK_DECISIONS.md`
* `docs/adr/ADR-0014-agentic-stack-realignment.md`
* `docs/INFRASTRUCTURE_REGISTRY.md`
* `docs/MVP_PRIVACY_RETENTION_POLICY.md`
* `docs/PRECISE_LOCATION_TEXT_FIREWALL.md`
* `docs/PUBLIC_JOURNAL_INDEX_PARITY.md`
* `docs/architecture/AUTHENTICATED_MUTATION_ADMISSION.md`
* `docs/LAUNCH_CORPUS.md`
* `apps/web/scripts/check-linear-agent-task.ts`

Product research:

* `docs/product-research/README.md`

Linear and external context:

* OVE-329 full saved body and its ADR-0018 terminal receipt, because it is the authority every document is reconciled against
* OVE-333, OVE-337, OVE-338, and OVE-342 full saved bodies and terminal receipts, because the canon may only be reconciled against shipped behavior
* The superseded bodies of OVE-334 and OVE-336, retained as provenance for the media and discovery scopes their successors absorbed on 2026-08-21
