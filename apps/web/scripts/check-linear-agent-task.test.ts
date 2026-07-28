import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseLinearTaskCliArgs,
  REQUIRED_LINEAR_TASK_HEADINGS,
  validateLinearAgentTask,
} from "./check-linear-agent-task";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const baselineSha = execFileSync("git", ["rev-parse", "origin/main"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();

const repositoryDeliverySequence =
  "current_main -> preserve_local -> issue_branch -> conventional_commit -> branch_push -> pull_request -> exact_head_checks -> capture_feature_sha -> merge_without_bypass -> fetch_main -> containment -> mainline_closeout -> linear_readback -> done";
const externalStateDeliverySequence =
  "baseline -> no_repository_delta -> environment_identity -> read_only_action -> immutable_receipt -> second_readback -> rollback_result -> cleanup_result -> linear_readback -> done";
const coordinationDeliverySequence =
  "unassigned -> outside_in_progress -> child_readback -> dag_proof -> children_done -> integration_receipt -> linear_readback -> terminal_closeout";

function repositoryDeliveryFields(branch: string) {
  return [
    "- Delivery path: repository_change",
    `- Delivery sequence: ${repositoryDeliverySequence}`,
    `- Issue branch: \`${branch}\``,
    "- Implementation SHA variable: `OVE999_IMPLEMENTATION_SHA`",
    "- Direct main mutation: forbidden",
    "- Local state preservation: required",
  ].join("\n");
}

function repositoryDeliveryContract(branch: string) {
  return `${repositoryDeliveryFields(branch)}\nStart from current main on \`${branch}\`. Preserve all unrelated and ignored local files and secrets. Use a Conventional Commit, push, open a PR, and run exact-head checks. Before merge, record \`OVE999_IMPLEMENTATION_SHA=$(git rev-parse HEAD)\` exactly once in the redacted closeout receipt. Merge without bypass only after every required check passes. After merge, fetch origin/main, run \`git merge-base --is-ancestor "$OVE999_IMPLEMENTATION_SHA" origin/main\`, and then run \`cd apps/web && pnpm mainline:closeout:check\`. Perform the final Linear read-back and compare the saved-description SHA-256 before Done.`;
}

function externalStateDeliveryFields() {
  return [
    "- Delivery path: external_state_only",
    `- Delivery sequence: ${externalStateDeliverySequence}`,
  ].join("\n");
}

function coordinationDeliveryFields() {
  return [
    "- Delivery path: coordination_container",
    `- Delivery sequence: ${coordinationDeliverySequence}`,
  ].join("\n");
}

function validFinalTask(overrides: Record<string, string> = {}): string {
  const sections: Record<string, string> = {
    "AI execution directive":
      "Repair the bounded request failure from current main after reproduction. This issue authorizes the repository and server correction and forbids adjacent product expansion.",
    "Execution metadata": [
      "- Contract: `overgarden.linear-sdd.v1`",
      "- Issue identifier: `OVE-999`",
      "- Issue kind: `remediation`",
      "- User-facing: `no`",
      "- Locale scope: `not-applicable`",
      "- Repository change: `yes`",
      "- Live deployment required: `no`",
      "- Direct production-state mutation: `no`",
      "- Authorization status: `not_required`",
      `- Baseline SHA: \`${baselineSha}\``,
      "- Evidence captured: `2026-07-26`",
      "- Touches: `repository, server, tests, docs`",
      "- Sensitive boundaries: `none`",
      "- External systems: `none`",
    ].join("\n"),
    "User or operator outcome and behavior":
      "The operator reproduces one failure, receives a bounded response, observes the degraded path, performs recovery through a safe retry, and completes final read-back of the recovered state. Configuration alone is not proof.",
    "Product thinking and falsification":
      "- Product-research branch: no_direct\nProtected outcome: bounded journal access. The load-bearing assumption is that the server boundary owns the failure. Falsification signal: counterevidence at current main stops implementation and reopens diagnosis. This operational remediation has no direct product-research dependency.",
    "Pinned baseline, reproduction, evidence, and counterevidence": `Baseline ${baselineSha} was observed on 2026-07-26. Confirmed evidence: reproduce with a redacted fixture and inspect the exact caller. Counterevidence: a successful bounded request at current main stops the repair. Not proved: production behavior remains unclaimed until exact-SHA live proof. Evidence records bounded result classes and omits secrets, precise location, user content, and stable identity.`,
    "Root cause or proof gap":
      "The closest proved gap is an uncaught server deadline at the request boundary. A failing regression contract test must reproduce it before implementation; disagreement stops the task.",
    "Non-negotiable invariants":
      "1. INV-01: authorization and owner scope remain unchanged.\n2. INV-02: no precise location, private content, secret, media capability, or public-search document may leak.\n3. INV-03: the existing scoped repository remains the sole data owner.\n4. INV-04: cancellation prevents late writes.\n5. INV-05: shipped exact-SHA proof is authoritative.",
    "Exact data, state, protocol, and concurrency contract":
      "Data is unchanged. The server returns one closed error class by the finite deadline. Retry is bounded and idempotent. Concurrent attempts do not duplicate effects. Cancellation fences late writes; terminal read-back remains authoritative.",
    "Exact vertical scope, target files, and caller inventory":
      "Inspect `apps/web/src/server/public-surface-indexing-policy.ts`, its route caller, adjacent error mapper, focused tests, and this runbook. Change only the verified boundary and every caller that can bypass it. Tests and docs are required.",
    "Ordered implementation plan":
      "1. Fetch current main, inspect dirty state and Linear relations, then reproduce.\n2. Add the red test.\n3. Repair the boundary.\n4. Exercise cancellation and retry.\n5. Run focused and broad proof.\n6. Deliver and read back Linear.",
    "UX, accessibility, localization, degraded states, performance, and observability":
      "Locale matrix: Not applicable — this operational remediation changes no rendered copy or locale behavior. The existing browser journey remains keyboard usable in the degraded state.\n- Performance budget: PERF-01 (`request_deadline`) — `request_deadline` is at most 2 seconds and cancellation prevents late writes.\n- Performance measurement: PERF-01 (`request_deadline`) — VER-02 uses the focused monotonic timer test at `scripts/check-linear-agent-task.test.ts` to measure `request_deadline`.\n- Blocking alerts: forbidden\n- Global wait overlay: forbidden\n- Pointer trap: forbidden\n- Unbounded polling/retry: forbidden\n- Wait-safe controls: `catalog navigation`; `cancel control` — both remain usable and enabled during every wait.\n- Slow/down proof: WAIT-01 — VER-02 at `scripts/check-linear-agent-task.test.ts` — injected `dependency timeout` asserts `catalog navigation` and `cancel control` remain responsive and records a bounded `recovery` receipt.\n- Observability: metrics contain bounded classes only.",
    "Migration, compatibility, rollout, rollback, and cleanup":
      "No schema migration or backfill is authorized because data is unchanged. Rollout uses the existing deployment path. Rollback reverts the isolated boundary change; cleanup removes the temporary red fixture only after permanent tests pass.",
    "Dependencies, ownership boundaries, relations, and non-goals":
      "No blocker is known after current Linear relation read-back. The existing server error mapper is the canonical owner. The graph is acyclic. Non-goals are schema changes, provider changes, and feature redesign.",
    "Measurable acceptance criteria": [
      "1. **AC-01 — PERF-01 (`request_deadline`) — `request_deadline` is at most 2 seconds; the bounded happy path returns once.**\n   - Protects: INV-01.\n   - Verified by: VER-01.",
      "2. **AC-02 — the failure path returns the closed error with zero mutation.**\n   - Protects: INV-02.\n   - Verified by: VER-01.",
      "3. **AC-03 — cancellation prevents every late write.**\n   - Protects: INV-03, INV-04.\n   - Verified by: VER-02.",
      "4. **AC-04 — two retries produce one final effect.**\n   - Protects: INV-04.\n   - Verified by: VER-02.",
      "5. **AC-05 — current-main and closeout proof use the same shipped SHA.**\n   - Protects: INV-05.\n   - Verified by: VER-03.",
    ].join("\n"),
    "Required test and fault matrix": [
      "| Case | Protects | Proves | Verification | Level | Fault/input | Expected receipt |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| Happy path | INV-01 | AC-01 | VER-01 | contract | one valid bounded request | PERF-01 (`request_deadline`) — `request_deadline` is at most 2 seconds; one response |",
      "| Authorization/another owner | INV-02 | AC-02 | VER-01 | contract | another-owner redacted fixture | closed error and zero mutation |",
      "| Concurrent cancellation | INV-03, INV-04 | AC-03, AC-04 | VER-02 | integration | two attempts separated by a cancellation barrier | zero late writes and one final effect |",
      "| Deadline/crash/restart recovery load | INV-04 | AC-03, AC-04 | VER-02 | integration | deadline plus crash under 20 requests | bounded recovery with one effect |",
      "| Exact-main read-back | INV-05 | AC-05 | VER-03 | repository | shipped SHA and origin/main | one contained SHA and matching receipt |",
    ].join("\n"),
    "Verification commands and required evidence": [
      "## VER-01 — Focused contract proof",
      "- Phase: local",
      "- Proves: AC-01, AC-02",
      "- Command status: existing",
      "- Expected receipt: exit 0 and bounded state counts.",
      "```bash",
      "cd apps/web",
      "pnpm exec vitest run src/server/public-surface-indexing-policy.test.ts",
      "```",
      "## VER-02 — Fault and retry proof",
      "- Phase: local",
      "- Proves: AC-03, AC-04",
      "- Command status: existing",
      "- Expected receipt: controlled cancellation and two attempts.",
      "- Performance proof: PERF-01 (`request_deadline`) — target `scripts/check-linear-agent-task.test.ts` measures `request_deadline` at most 2 seconds and records a bounded threshold receipt.",
      "- No-wedge proof: WAIT-01 — target `scripts/check-linear-agent-task.test.ts` injects `dependency timeout`, proves `catalog navigation` and `cancel control` remain responsive, and records a bounded `recovery` receipt.",
      "```bash",
      "cd apps/web",
      "pnpm exec vitest run scripts/check-linear-agent-task.test.ts",
      "```",
      "## VER-03 — Broad and closeout proof",
      "- Phase: local and main",
      "- Proves: AC-05",
      "- Command status: existing",
      "- Expected receipt: every command exits 0 on the exact SHA.",
      "```bash",
      "cd apps/web",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test",
      "pnpm build",
      "git diff --check",
      "pnpm mainline:closeout:check",
      "```",
    ].join("\n"),
    "Delivery, exact-SHA proof, and Linear closeout":
      repositoryDeliveryContract("codex/ove-999-bounded-request"),
    "Failure gates":
      "Stop on stale evidence, dirty-state overlap, failed regression, unresolved owner, cyclic relation, missing current-main containment, unredacted proof, or saved-description digest mismatch. Local-only proof cannot close the task.",
    "Required context": [
      "- `AGENTS.md`",
      "- `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`",
      "- `docs/SDD_VERTICAL_SLICE_ROADMAP.md`",
      "- `docs/MAINLINE_CLOSEOUT.md`",
      "- `docs/TECH_STACK_DECISIONS.md`",
      "- `docs/adr/ADR-0014-agentic-stack-realignment.md`",
      "- `apps/web/src/server/public-surface-indexing-policy.ts`",
    ].join("\n"),
  };

  Object.assign(sections, overrides);
  return REQUIRED_LINEAR_TASK_HEADINGS.map(
    (heading) => `# ${heading}\n\n${sections[heading]}`,
  ).join("\n\n");
}

function metadataWith(overrides: Record<string, string>): string {
  let metadata =
    validFinalTask().match(
      /# Execution metadata\n\n([\s\S]*?)\n\n# User or operator outcome/,
    )?.[1] ?? "";
  for (const [key, value] of Object.entries(overrides)) {
    metadata = metadata.replace(
      new RegExp(`^- ${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}: .+$`, "m"),
      `- ${key}: \`${value}\``,
    );
  }
  return metadata;
}

function validVerticalExecutionTask(): string {
  return validFinalTask({
    "AI execution directive":
      "Implement one bounded gardener wishlist journey from current main. This issue authorizes the exact server, repository, and UI path plus its tests and docs; adjacent navigation and catalog behavior remain unchanged.",
    "Execution metadata": metadataWith({
      "Issue kind": "vertical_execution",
      "User-facing": "yes",
      "Locale scope": "shared",
      Touches: "repository, server, ui, tests, docs",
    }),
    "User or operator outcome and behavior":
      "A signed-in gardener saves one catalog object, sees the saved state once, receives a bounded degraded state when the server deadline expires, and completes browser read-back with no duplicate item. Recovery is one explicit retry that returns to the saved state.",
    "Product thinking and falsification":
      "- Product-research branch: constrained\nUser job: preserve one intended garden object without losing browsing context. `docs/product-research/overgarden-living-journals.md` constrains the task to a durable journal-linked saved object rather than a detached engagement counter. `docs/product-research/OverGarden_PAGE_ARCHITECTURE_v1.md` constrains the task to an inline wishlist transition that preserves catalog navigation context. The load-bearing assumption is that an inline wishlist transition reduces context loss. Falsification signal: observed browser evidence of higher abandonment or an ambiguous saved state stops rollout and reopens the interaction decision.",
    "Pinned baseline, reproduction, evidence, and counterevidence": `Baseline ${baselineSha} was observed on 2026-07-26. Confirmed evidence: the current wishlist action, repository owner, locale page, and tests exist at the named paths. Counterevidence: a current-main browser journey that already produces one idempotent saved item and bounded recovery stops implementation. Not proved: production latency and mobile-browser behavior remain unclaimed until exact-SHA proof. Evidence uses synthetic identifiers and omits secrets, precise location, user content, and stable identity.`,
    "Root cause or proof gap":
      "The closest proof gap is the missing end-to-end saved/degraded/recovery contract across the action and rendered page. If the red browser or contract proof locates ownership outside the wishlist boundary, stop and reopen scope before editing.",
    "Non-negotiable invariants":
      "1. INV-01: only the authenticated owner may create or read the wishlist row.\n2. INV-02: one client intent produces at most one saved object.\n3. INV-03: a deadline or cancellation creates zero late writes and no global wait trap.\n4. INV-04: `uk`, `bg`, and `ru` expose the same state machine, keyboard path, and focus recovery.\n5. INV-05: closeout proves the merged implementation from current origin/main.",
    "Exact data, state, protocol, and concurrency contract":
      "The canonical owner remains `wishlist-repository`. UI state is `idle -> saving -> saved` or `idle -> saving -> failed -> retrying -> saved`; terminal server read-back wins. A stable client intent key fences duplicate concurrent submissions. The request deadline is finite, cancellation prevents late writes, retry is bounded and idempotent, and another owner receives the closed authorization class.",
    "Exact vertical scope, target files, and caller inventory":
      "Inspect and change only `apps/web/src/app/wishlist/actions.ts`, `apps/web/src/server/wishlist-repository.ts`, `apps/web/src/app/[locale]/wishlist/page.tsx`, their direct callers, focused tests, and the named behavior docs. Inventory every caller that can save or render wishlist state; unrelated catalog navigation is excluded.",
    "Ordered implementation plan":
      "1. Fetch current main, read Linear relations, and reproduce with a synthetic owner.\n2. Add failing action/repository and rendered-state proofs.\n3. Implement the idempotent owner-scoped transition at the canonical boundary.\n4. Add bounded deadline, cancellation, degraded state, and retry recovery.\n5. Prove `uk`, `bg`, and `ru` keyboard/focus parity and zero duplicate effects.\n6. Run focused and broad gates, deliver through PR, and read back Linear.",
    "UX, accessibility, localization, degraded states, performance, and observability":
      "Locale matrix: `uk`, `bg`, and `ru` use the same closed states and market-valid copy. The browser path is keyboard operable, announces the degraded saving/failure/recovery state without stealing focus, and restores focus to the initiating control.\n- Performance budget: PERF-01 (`request_deadline`) — `request_deadline` is at most 2 seconds and cancellation fences late completion.\n- Performance measurement: PERF-01 (`request_deadline`) — VER-02 uses the focused browser timer test at `src/app/[locale]/wishlist/page.test.tsx` to measure `request_deadline`.\n- Blocking alerts: forbidden\n- Global wait overlay: forbidden\n- Pointer trap: forbidden\n- Unbounded polling/retry: forbidden\n- Wait-safe controls: `catalog navigation`; `locale switcher` — both remain usable and enabled during every wait.\n- Slow/down proof: WAIT-01 — VER-02 at `src/app/[locale]/wishlist/page.test.tsx` — injected `server timeout` asserts `catalog navigation` and `locale switcher` remain responsive and records a bounded `retry` receipt.\n- Observability: bounded result and timing classes without content or stable identity.",
    "Migration, compatibility, rollout, rollback, and cleanup":
      "No schema migration or backfill is authorized because the existing wishlist identity remains canonical. Existing saved rows remain readable. Rollout uses the normal app deployment. Rollback reverts the isolated action/UI contract without deleting rows; cleanup removes temporary synthetic fixtures after permanent tests pass.",
    "Dependencies, ownership boundaries, relations, and non-goals":
      "The current Linear relation read-back must show no active blocker or cycle. `wishlist-repository` owns persistence, the action owns request translation, and the locale page owns presentation. Non-goals are catalog ranking, notifications, schema changes, and provider changes.",
    "Measurable acceptance criteria": [
      "1. **AC-01 — one authenticated save returns exactly one owner-scoped row.**\n   - Protects: INV-01.\n   - Verified by: VER-01.",
      "2. **AC-02 — two concurrent submissions with one intent key leave exactly one row.**\n   - Protects: INV-02.\n   - Verified by: VER-01.",
      "3. **AC-03 — PERF-01 (`request_deadline`) — `request_deadline` is at most 2 seconds; a forced deadline returns the local degraded state with zero late writes and unrelated controls enabled.**\n   - Protects: INV-03.\n   - Verified by: VER-02.",
      "4. **AC-04 — `uk`, `bg`, and `ru` each preserve keyboard initiation, announcement, retry, and focus recovery.**\n   - Protects: INV-04.\n   - Verified by: VER-02.",
      "5. **AC-05 — the implementation SHA is contained in fetched origin/main and the saved Linear body digest matches.**\n   - Protects: INV-05.\n   - Verified by: VER-03.",
    ].join("\n"),
    "Required test and fault matrix": [
      "| Case | Protects | Proves | Verification | Level | Fault/input | Expected receipt |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| Owner happy path and another-owner denial | INV-01 | AC-01 | VER-01 | integration | one owner request plus another-owner request | one owner-scoped row and one closed denial |",
      "| Duplicate concurrent intent | INV-02 | AC-02 | VER-01 | integration | two requests sharing one intent key | one row and one terminal result |",
      "| Deadline, load, and recovery cancellation | INV-03 | AC-03 | VER-02 | component/contract | 20 requests held beyond 2 seconds then released | PERF-01 (`request_deadline`) — `request_deadline` is at most 2 seconds; bounded recovery, zero late writes, unrelated control usable |",
      "| Shared locale keyboard recovery | INV-04 | AC-04 | VER-02 | rendered behavior | `uk`, `bg`, and `ru` save/fail/retry cycles | matching states, announcement, and restored focus |",
      "| Merged closeout | INV-05 | AC-05 | VER-03 | repository/Linear | implementation SHA plus saved description | origin/main containment and matching digest |",
    ].join("\n"),
    "Verification commands and required evidence": [
      "## VER-01 — Owner and idempotency contract",
      "- Phase: local",
      "- Proves: AC-01, AC-02",
      "- Command status: existing",
      "- Expected receipt: exit 0 with one owner-scoped row after duplicate intent.",
      "```bash",
      "cd apps/web",
      "pnpm exec vitest run src/app/wishlist/actions.test.ts src/server/wishlist-repository.test.ts",
      "```",
      "## VER-02 — Rendered degraded and locale behavior",
      "- Phase: local browser contract",
      "- Proves: AC-03, AC-04",
      "- Command status: existing",
      "- Expected receipt: exit 0 with bounded failure, usable controls, three locales, and restored focus.",
      "- Performance proof: PERF-01 (`request_deadline`) — target `src/app/[locale]/wishlist/page.test.tsx` measures `request_deadline` at most 2 seconds and records a bounded threshold receipt.",
      "- No-wedge proof: WAIT-01 — target `src/app/[locale]/wishlist/page.test.tsx` injects `server timeout`, proves `catalog navigation` and `locale switcher` remain responsive, and records a bounded `retry` receipt.",
      "```bash",
      "cd apps/web",
      "pnpm exec vitest run 'src/app/[locale]/wishlist/page.test.tsx'",
      "```",
      "## VER-03 — Broad and closeout proof",
      "- Phase: local and main",
      "- Proves: AC-05",
      "- Command status: existing",
      "- Expected receipt: every command exits 0 on the exact merged SHA.",
      "```bash",
      "cd apps/web",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test",
      "pnpm build",
      "git diff --check",
      "pnpm mainline:closeout:check",
      "```",
    ].join("\n"),
    "Delivery, exact-SHA proof, and Linear closeout":
      repositoryDeliveryContract("codex/ove-999-wishlist-journey"),
    "Failure gates":
      "Stop on stale baseline, dirty overlap, an unresolved caller, failed owner/idempotency proof, missing locale or keyboard state, a wait trap, a late write, cyclic Linear relations, absent origin/main containment, or saved-description digest mismatch. Local-only proof cannot close the issue.",
    "Required context": [
      "- `AGENTS.md`",
      "- `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`",
      "- `docs/SDD_VERTICAL_SLICE_ROADMAP.md`",
      "- `docs/MAINLINE_CLOSEOUT.md`",
      "- `docs/TECH_STACK_DECISIONS.md`",
      "- `docs/adr/ADR-0014-agentic-stack-realignment.md`",
      "- `docs/product-research/README.md`",
      "- `docs/product-research/overgarden-living-journals.md`",
      "- `docs/product-research/OverGarden_PAGE_ARCHITECTURE_v1.md`",
      "- `apps/web/src/app/wishlist/actions.ts`",
      "- `apps/web/src/server/wishlist-repository.ts`",
      "- `apps/web/src/app/[locale]/wishlist/page.tsx`",
    ].join("\n"),
  });
}

function validDecisionSpikeTask(): string {
  return validFinalTask({
    "AI execution directive":
      "Run a time-bounded evidence spike that decides whether the AI-executable Linear contract remains version 1. This issue authorizes proof and canon only, with no production behavior or hidden implementation.",
    "Execution metadata": metadataWith({
      "Issue kind": "decision_spike",
      Touches: "repository, tests, docs",
    }),
    "User or operator outcome and behavior":
      "A maintainer receives one explicit accept-or-supersede decision, sees a bounded degraded outcome when evidence is inconclusive, and completes canon and consumer read-back without production behavior changes. Recovery reopens the named evidence branch with its original cutoff.",
    "Product thinking and falsification":
      "- Product-research branch: no_direct\nProtected outcome: agents receive one unambiguous task contract before implementation. No product-research file directly constrains this repository-governance decision. The load-bearing assumption is that the predeclared evidence branches discriminate version 1 from a superseding contract. Falsification signal: an unresolved high-severity counterexample reopens the decision rather than selecting a default.",
    "Pinned baseline, reproduction, evidence, and counterevidence": `Baseline ${baselineSha} was observed on 2026-07-26. Confirmed evidence: the standard, template, validator, and canon consumers can be enumerated and tested. Counterevidence: a contract incompatibility that cannot be expressed without product behavior stops the spike. Not proved: no application/runtime improvement or Linear administration capability is claimed. Evidence omits secrets, precise location, user content, and stable identity.`,
    "Root cause or proof gap":
      "The proof gap is whether one contract version can encode every allowed issue kind without ambiguous execution semantics. Any non-discriminating evidence branch stops the spike and reopens the decision; no production behavior may change.",
    "Non-negotiable invariants":
      "1. INV-01: the spike ends in one explicit accept, supersede, or reopen decision before the timebox expires.\n2. INV-02: the chosen decision updates one canon authority and every named consumer without contradictory guidance.\n3. INV-03: the spike changes no application behavior, provider state, schema, or live deployment.\n4. INV-04: closeout proves the docs/test commit from current origin/main.",
    "Exact data, state, protocol, and concurrency contract":
      "Evidence state is `uncollected -> collected -> classified -> decided` or `uncollected -> collected -> inconclusive -> reopened`. Every branch has a fixed observation, bounded deadline, and cancellation rule. Parallel reviewers write independent receipts; the maintainer decision serializes canon. No production data, request protocol, provider effect, or runtime concurrency behavior is changed.",
    "Exact vertical scope, target files, and caller inventory":
      "The decision target is `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`; reconcile `docs/linear/AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md`, `apps/web/scripts/check-linear-agent-task.ts`, its tests, and every binding canon pointer. Application code and external state are read-only and outside the authorized output.",
    "Ordered implementation plan":
      "1. Freeze a four-hour timebox and the accept/supersede/reopen evidence branches.\n2. Run independent contract and canon counterexample reviews.\n3. Classify every finding against the predeclared branches.\n4. Stop on inconclusive evidence and record the reopen owner.\n5. Record the explicit decision, rejected branch, and falsification signal in canon.\n6. Prove consumer parity and deliver with no production behavior.",
    "UX, accessibility, localization, degraded states, performance, and observability":
      "Locale matrix: Not applicable — this time-bounded repository-governance decision renders no UI or copy. Degraded state means `inconclusive` with the decision reopened; recovery is a new evidence run.\n- Performance budget: PERF-01 (`decision_deadline`) — `decision_deadline` is at most 240 minutes and cancellation stops late evidence admission.\n- Performance measurement: PERF-01 (`decision_deadline`) — VER-02 uses the decision timer test at `scripts/check-linear-agent-task.test.ts` to measure `decision_deadline`.\n- Blocking alerts: forbidden\n- Global wait overlay: forbidden\n- Pointer trap: forbidden\n- Unbounded polling/retry: forbidden\n- Wait-safe controls: `evidence navigation`; `cancel control` — both remain usable and enabled during every wait.\n- Slow/down proof: WAIT-01 — VER-02 at `scripts/check-linear-agent-task.test.ts` — injected `evidence source timeout` asserts `evidence navigation` and `cancel control` remain responsive and records a bounded `inconclusive` receipt.\n- Observability: the redacted branch-classification receipt only.",
    "Migration, compatibility, rollout, rollback, and cleanup":
      "No schema/data migration, backfill, provider apply, or deployment is authorized. Compatibility requires all open version-1 descriptions to remain interpretable unless a superseding contract includes explicit migration guidance. Rollback reverts the canon/test commit; cleanup records rejected evidence and removes temporary local drafts.",
    "Dependencies, ownership boundaries, relations, and non-goals":
      "The standard owns construction semantics, the template owns drafting shape, and the validator owns offline checks. Linear administration remains an external maintainer gate. Relations must be read back and acyclic. Non-goals are implementing product issues, mutating existing issue state, and changing provider configuration.",
    "Measurable acceptance criteria": [
      "1. **AC-01 — PERF-01 (`decision_deadline`) — `decision_deadline` is at most 240 minutes; the run records exactly one accept, supersede, or reopen decision with every evidence branch classified.**\n   - Protects: INV-01.\n   - Verified by: VER-01.",
      "2. **AC-02 — the selected decision appears in the authority, template, validator tests, and every named canon consumer with zero contradictory active statement.**\n   - Protects: INV-02.\n   - Verified by: VER-01.",
      "3. **AC-03 — the diff contains zero application/provider/schema behavior change and its commit is contained in origin/main.**\n   - Protects: INV-03, INV-04.\n   - Verified by: VER-02.",
    ].join("\n"),
    "Required test and fault matrix": [
      "| Case | Protects | Proves | Verification | Level | Fault/input | Expected receipt |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| Happy decision path | INV-01 | AC-01 | VER-01 | decision contract | accept, supersede, and reopen observations | PERF-01 (`decision_deadline`) — `decision_deadline` is at most 240 minutes; one classified decision receipt |",
      "| Another consumer under concurrent review | INV-02 | AC-02 | VER-01 | canon contract | one stale active consumer across 2 reviewers | failing parity proof until reconciled |",
      "| Deadline recovery under review load | INV-03, INV-04 | AC-03 | VER-02 | repository | deadline plus hidden application/provider path in the diff | bounded recovery or contained docs/test-only SHA |",
    ].join("\n"),
    "Verification commands and required evidence": [
      "## VER-01 — Decision and consumer contract",
      "- Phase: local decision proof",
      "- Proves: AC-01, AC-02",
      "- Command status: existing",
      "- Expected receipt: all branches classified and standard/template/validator/canon parity exits 0.",
      "```bash",
      "cd apps/web",
      "pnpm exec vitest run scripts/check-linear-agent-task.test.ts",
      "```",
      "## VER-02 — Scope and merged closeout",
      "- Phase: local and main",
      "- Proves: AC-03",
      "- Command status: existing",
      "- Expected receipt: docs/test-only diff, broad gates exit 0, and exact SHA is contained in main.",
      "- Performance proof: PERF-01 (`decision_deadline`) — target `scripts/check-linear-agent-task.test.ts` measures `decision_deadline` at most 240 minutes and records a bounded threshold receipt.",
      "- No-wedge proof: WAIT-01 — target `scripts/check-linear-agent-task.test.ts` injects `evidence source timeout`, proves `evidence navigation` and `cancel control` remain responsive, and records a bounded `inconclusive` receipt.",
      "```bash",
      "cd apps/web",
      "pnpm exec vitest run scripts/check-linear-agent-task.test.ts",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test",
      "pnpm build",
      "git diff --check",
      "pnpm mainline:closeout:check",
      "```",
    ].join("\n"),
    "Delivery, exact-SHA proof, and Linear closeout":
      repositoryDeliveryContract("codex/ove-999-linear-contract-decision"),
    "Failure gates":
      "Stop on expired timebox, unclassified evidence, contradictory authority, an application/provider/schema diff, an unresolved Linear relation, failed proof, absent origin/main containment, or saved-description digest mismatch. Inconclusive evidence must reopen the decision.",
    "Required context": [
      "- `AGENTS.md`",
      "- `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`",
      "- `docs/linear/AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md`",
      "- `apps/web/scripts/check-linear-agent-task.ts`",
      "- `apps/web/scripts/check-linear-agent-task.test.ts`",
      "- `docs/SDD_VERTICAL_SLICE_ROADMAP.md`",
      "- `docs/MAINLINE_CLOSEOUT.md`",
      "- `docs/TECH_STACK_DECISIONS.md`",
      "- `docs/adr/ADR-0014-agentic-stack-realignment.md`",
    ].join("\n"),
  });
}

function validCanonCorrectionTask(): string {
  return validFinalTask({
    "AI execution directive":
      "Reconcile the bounded execution-queue authority contradiction from current main. This issue authorizes canon, consumer checks, and stale-reference proof only; application and provider behavior remain unchanged.",
    "Execution metadata": metadataWith({
      "Issue kind": "canon_correction",
      Touches: "repository, tests, docs",
    }),
    "User or operator outcome and behavior":
      "An agent selects the next task from authenticated Linear, observes a bounded degraded state when the roadmap mirror disagrees, and completes read-back with one queue owner and zero stale active instruction. Recovery reconciles the mirror and repeats authenticated Linear read-back before selection resumes.",
    "Product thinking and falsification":
      "- Product-research branch: no_direct\nProtected outcome: implementation agents do not start obsolete work. No product-research file directly constrains this canon-only queue correction. The load-bearing assumption is that authenticated Linear must own current queue state while the roadmap is a dated mirror. Falsification signal: an unavailable authenticated read path reopens the authority decision rather than promoting stale prose.",
    "Pinned baseline, reproduction, evidence, and counterevidence": `Baseline ${baselineSha} was observed on 2026-07-26. Confirmed evidence: active documents contain contradictory queue-authority wording and consumers can be enumerated. Counterevidence: zero conflicting active statement at current main stops the correction. Not proved: no product behavior, issue status, relation mutation, or deployment result is claimed. Evidence omits secrets, precise location, user content, and stable identity.`,
    "Root cause or proof gap":
      "The closest proved gap is contradictory authority wording between current Linear and a repository mirror. If consumer inventory finds another binding queue owner, stop and reopen the authority decision before editing.",
    "Non-negotiable invariants":
      "1. INV-01: authenticated current Linear is the sole primary execution queue.\n2. INV-02: the roadmap remains a dated mirror and any discrepancy blocks selection.\n3. INV-03: historical issue text stays historical and cannot silently become active authority.\n4. INV-04: closeout proves every named consumer and the merged canon SHA.",
    "Exact data, state, protocol, and concurrency contract":
      "Queue state is `aligned` or `drifted`; drift blocks selection until one authenticated read, one repository reconciliation, and a second authenticated read return `aligned`. Linear owns current status/priority/relations; repository canon owns construction rules. Concurrent doc edits are serialized through one PR. A bounded 10-second read deadline and cancellation fence stale responses; stale saved bytes fail digest comparison.",
    "Exact vertical scope, target files, and caller inventory":
      "Treat `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md` as construction authority and authenticated Linear as queue authority. Reconcile `AGENTS.md`, `docs/SDD_VERTICAL_SLICE_ROADMAP.md`, `docs/MAINLINE_CLOSEOUT.md`, and every binding pointer. Prove each stale active reference removed or explicitly marked historical; code behavior and Linear issue mutation are excluded.",
    "Ordered implementation plan":
      "1. Fetch main and capture authenticated Linear queue read-back.\n2. Inventory every active consumer and the exact contradiction.\n3. Add a failing canon-parity fixture.\n4. Correct the authority wording without rewriting historical evidence.\n5. Run stale-reference and broad proof.\n6. Deliver through PR, read back merged canon, then re-read Linear without mutation.",
    "UX, accessibility, localization, degraded states, performance, and observability":
      "Locale matrix: Not applicable — this canon correction renders no user or operator UI. Degraded state is a fail-closed task-selection block with an explicit drift receipt; recovery is repository plus authenticated Linear read-back.\n- Performance budget: PERF-01 (`linear_read_deadline`) — `linear_read_deadline` is at most 10 seconds and cancellation rejects late responses.\n- Performance measurement: PERF-01 (`linear_read_deadline`) — VER-02 uses the connector timer test at `scripts/check-linear-agent-task.test.ts` to measure `linear_read_deadline`.\n- Blocking alerts: forbidden\n- Global wait overlay: forbidden\n- Pointer trap: forbidden\n- Unbounded polling/retry: forbidden\n- Wait-safe controls: `queue navigation`; `refresh control` — both remain usable and enabled during every wait.\n- Slow/down proof: WAIT-01 — VER-02 at `scripts/check-linear-agent-task.test.ts` — injected `Linear timeout` asserts `queue navigation` and `refresh control` remain responsive and records a bounded `drift recovery` receipt.\n- Observability: the redacted authority/digest receipt only.",
    "Migration, compatibility, rollout, rollback, and cleanup":
      "No schema/data migration, backfill, provider apply, or deployment is authorized. Historical evidence remains readable through dated labels. Rollout is the merged canon commit. Rollback reverts that commit if authority proof fails; cleanup removes only temporary audit extracts.",
    "Dependencies, ownership boundaries, relations, and non-goals":
      "Authenticated Linear owns queue state; the standard owns task construction; the roadmap mirrors a dated read. One PR owner serializes canon changes and the relation graph stays unchanged and acyclic. Non-goals are reordering issues, changing statuses/relations, implementing product behavior, or editing external providers.",
    "Measurable acceptance criteria": [
      "1. **AC-01 — every active queue instruction names authenticated current Linear as primary and the roadmap as a dated mirror.**\n   - Protects: INV-01, INV-02.\n   - Verified by: VER-01.",
      "2. **AC-02 — every superseded batch or issue statement is labeled historical and zero stale active authority match remains.**\n   - Protects: INV-03.\n   - Verified by: VER-01.",
      "3. **AC-03 — PERF-01 (`linear_read_deadline`) — `linear_read_deadline` is at most 10 seconds; all named consumers pass parity proof and the canon commit is contained in origin/main with matching Linear read-back.**\n   - Protects: INV-04.\n   - Verified by: VER-02.",
    ].join("\n"),
    "Required test and fault matrix": [
      "| Case | Protects | Proves | Verification | Level | Fault/input | Expected receipt |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| Happy primary authority parity | INV-01, INV-02 | AC-01 | VER-01 | canon | one roadmap-primary contradiction fixture | checker rejects drift then accepts reconciled authority |",
      "| Another stale reference under concurrent load | INV-03 | AC-02 | VER-01 | canon | one old batch phrased as current across 2 reviewers | zero active stale match and preserved historical label |",
      "| Timeout recovery and main read-back | INV-04 | AC-03 | VER-02 | repository/Linear | 10-second Linear timeout plus complete consumer inventory | PERF-01 (`linear_read_deadline`) — `linear_read_deadline` is at most 10 seconds; bounded recovery, contained SHA, and matching read-back |",
    ].join("\n"),
    "Verification commands and required evidence": [
      "## VER-01 — Authority and stale-reference contract",
      "- Phase: local canon proof",
      "- Proves: AC-01, AC-02",
      "- Command status: existing",
      "- Expected receipt: standard tests exit 0 with one primary authority and rejected stale fixture.",
      "```bash",
      "cd apps/web",
      "pnpm exec vitest run scripts/check-linear-agent-task.test.ts",
      "```",
      "## VER-02 — Consumer and merged closeout",
      "- Phase: local and main",
      "- Proves: AC-03",
      "- Command status: existing",
      "- Expected receipt: all consumers and broad gates pass on one contained SHA.",
      "- Performance proof: PERF-01 (`linear_read_deadline`) — target `scripts/check-linear-agent-task.test.ts` measures `linear_read_deadline` at most 10 seconds and records a bounded threshold receipt.",
      "- No-wedge proof: WAIT-01 — target `scripts/check-linear-agent-task.test.ts` injects `Linear timeout`, proves `queue navigation` and `refresh control` remain responsive, and records a bounded `drift recovery` receipt.",
      "```bash",
      "cd apps/web",
      "pnpm exec vitest run scripts/check-linear-agent-task.test.ts",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test",
      "pnpm build",
      "git diff --check",
      "pnpm mainline:closeout:check",
      "```",
    ].join("\n"),
    "Delivery, exact-SHA proof, and Linear closeout":
      repositoryDeliveryContract("codex/ove-999-queue-canon"),
    "Failure gates":
      "Stop on incomplete consumer inventory, unresolved contradictory authority, a stale active reference, historical-evidence rewrite, Linear mutation, failed parity proof, absent origin/main containment, or saved-description digest mismatch. Queue drift blocks task selection.",
    "Required context": [
      "- `AGENTS.md`",
      "- `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`",
      "- `docs/linear/AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md`",
      "- `docs/SDD_VERTICAL_SLICE_ROADMAP.md`",
      "- `docs/MAINLINE_CLOSEOUT.md`",
      "- `docs/TECH_STACK_DECISIONS.md`",
      "- `docs/adr/ADR-0014-agentic-stack-realignment.md`",
    ].join("\n"),
  });
}

function validExternalOperatorTask(): string {
  return validFinalTask({
    "AI execution directive":
      "Classify the production managed-database capability through read-only provider operations and record one immutable receipt. This operator issue authorizes no repository delta, provider mutation, deployment, or synthetic implementation commit.",
    "Execution metadata": metadataWith({
      "Issue kind": "operator_execution",
      "Repository change": "no",
      Touches: "infrastructure",
      "External systems": "DigitalOcean Managed Postgres",
    }),
    "User or operator outcome and behavior":
      "The operator identifies the registry-owned environment, classifies one backup capability from the official provider read-back, receives a bounded degraded receipt when the provider is unavailable, and completes final provider plus Linear read-back with zero mutation. Recovery reruns the same read-only query once.",
    "Product thinking and falsification":
      "- Product-research branch: no_direct\nProtected outcome: recovery planning uses current provider facts without risking production state. No product-research file directly constrains this read-only provider classification. The load-bearing assumption is that the official metadata endpoint exposes the decision-grade capability. Falsification signal: an absent, stale, or contradictory provider field stops classification and reopens the operator plan.",
    "Pinned baseline, reproduction, evidence, and counterevidence": `Baseline ${baselineSha} was observed on 2026-07-26. Confirmed evidence: the infrastructure registry names DigitalOcean Managed Postgres as production authority and the official API exposes database metadata. Counterevidence: a registry/provider environment mismatch stops all classification. Not proved: no backup restore, plan change, database write, deployment, or repository improvement is claimed. The redacted receipt omits credentials, hostnames, IPs, user data, precise location, and stable identity.`,
    "Root cause or proof gap":
      "The closest proof gap is the unverified current backup-capability class for the exact registry-owned environment. Any identity or capability mismatch stops execution and reopens provider diagnosis before a conclusion is saved.",
    "Non-negotiable invariants":
      "1. INV-01: every provider operation remains read-only and idempotent with zero production-state change.\n2. INV-02: the classified environment identity must match the non-secret infrastructure registry.\n3. INV-03: unavailable, stale, or contradictory provider evidence returns an explicit inconclusive receipt.\n4. INV-04: terminal provider and Linear read-back use the same redacted evidence digest.",
    "Exact data, state, protocol, and concurrency contract":
      "Operator state is `unclassified -> identity_verified -> capability_verified -> receipt_saved` or `unclassified -> inconclusive`. The official provider API is the source of truth; the registry supplies expected non-secret identity. Queries are read-only, bounded to one environment, idempotent, and safe to retry. The deadline is 10 seconds, cancellation rejects a late response, concurrent reads create no effect, and the final read-back digest wins without retaining a secret field.",
    "Exact vertical scope, target files, and caller inventory":
      "No repository target exists. Read `docs/INFRASTRUCTURE_REGISTRY.md` without editing it, query only the registry-owned DigitalOcean Managed Postgres resource, and save the redacted provider/Linear receipt. Every other database, plan, backup action, branch, test edit, docs edit, and provider mutation is excluded.",
    "Ordered implementation plan":
      "1. Classify the exact registry environment and expected resource identity.\n2. Form a read-only idempotent query plan against the official DigitalOcean API.\n3. Verify identity and capability; stop on drift or unavailable evidence.\n4. Record a redacted immutable provider receipt and digest.\n5. Verify a second provider read-back produces the same class.\n6. Record cleanup, rollback-as-zero-effect, and authenticated Linear read-back.",
    "UX, accessibility, localization, degraded states, performance, and observability":
      "Locale matrix: Not applicable — this read-only operator classification renders no product UI or copy. Degraded state is an explicit inconclusive receipt; recovery repeats the read-only query.\n- Performance budget: PERF-01 (`provider_read_deadline`) — `provider_read_deadline` is at most 10 seconds and cancellation rejects late responses.\n- Performance measurement: PERF-01 (`provider_read_deadline`) — VER-02 uses the provider probe timer test at `DigitalOcean:db-123:backup-capability` to measure `provider_read_deadline`.\n- Blocking alerts: forbidden\n- Global wait overlay: forbidden\n- Pointer trap: forbidden\n- Unbounded polling/retry: forbidden\n- Wait-safe controls: `terminal cancel control`; `read-only status command` — both remain usable and enabled during every wait.\n- Slow/down proof: WAIT-01 — VER-02 at `DigitalOcean:db-123:backup-capability` — injected `provider timeout` asserts `terminal cancel control` and `read-only status command` remain responsive and records a bounded `inconclusive` receipt.\n- Observability: the redacted provider receipt only.",
    "Migration, compatibility, rollout, rollback, and cleanup":
      "No schema migration, backfill, provider apply, rollout, or deployment is authorized. Compatibility is read-only across the current official API. Rollback is proof of zero effect because no mutation occurs. Cleanup closes the temporary authenticated session and retains only the redacted immutable receipt and digest.",
    "Dependencies, ownership boundaries, relations, and non-goals":
      "The infrastructure registry owns expected environment identity; the official DigitalOcean API owns current capability; Linear owns terminal task evidence. Relations must be read back and acyclic. Non-goals are restore execution, plan/cost change, database queries, credentials rotation, repository edits, and deployment.",
    "Measurable acceptance criteria": [
      "1. **AC-01 — provider resource identity equals the registry-owned environment and zero mutation operation is issued.**\n   - Protects: INV-01, INV-02.\n   - Verified by: VER-01.",
      "2. **AC-02 — PERF-01 (`provider_read_deadline`) — `provider_read_deadline` is at most 10 seconds for each read; one official capability class or one explicit inconclusive class returns across the bounded retry.**\n   - Protects: INV-03.\n   - Verified by: VER-02.",
      "3. **AC-03 — provider and Linear receipts contain the same SHA-256 digest and no prohibited field.**\n   - Protects: INV-04.\n   - Verified by: VER-03.",
    ].join("\n"),
    "Required test and fault matrix": [
      "| Case | Protects | Proves | Verification | Level | Fault/input | Expected receipt |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| Happy exact-environment read | INV-01, INV-02 | AC-01 | VER-01 | provider | registry resource ID and read-only metadata request | matching identity and zero mutation audit class |",
      "| Provider timeout recovery under concurrent load | INV-03 | AC-02 | VER-02 | provider | 10-second timeout across 2 reads or contradictory field | PERF-01 (`provider_read_deadline`) — `provider_read_deadline` is at most 10 seconds; bounded retry then explicit inconclusive receipt |",
      "| Another terminal redaction and digest check | INV-04 | AC-03 | VER-03 | provider/Linear | provider receipt plus saved issue body | equal digest and zero prohibited field |",
    ].join("\n"),
    "Verification commands and required evidence": [
      "## VER-01 — Environment identity read-back",
      "- Phase: provider",
      "- Proves: AC-01",
      "- Command status: external_readback",
      "- Expected receipt: immutable registry/provider identity classes and zero mutation operation.",
      "```bash",
      "# Authenticated DigitalOcean Managed Postgres read-back: get database metadata for registry-owned UUID db-123",
      "```",
      "## VER-02 — Capability and degraded-state read-back",
      "- Phase: provider",
      "- Proves: AC-02",
      "- Command status: external_readback",
      "- Expected receipt: official capability class or bounded inconclusive class after one retry.",
      "- Performance proof: PERF-01 (`provider_read_deadline`) — target `DigitalOcean:db-123:backup-capability` measures `provider_read_deadline` at most 10 seconds and records a bounded threshold receipt.",
      "- No-wedge proof: WAIT-01 — target `DigitalOcean:db-123:backup-capability` injects `provider timeout`, proves `terminal cancel control` and `read-only status command` remain responsive, and records a bounded `inconclusive` receipt.",
      "```bash",
      "# Authenticated DigitalOcean Managed Postgres read-back: target DigitalOcean:db-123:backup-capability; get backup capability for production database db-123 twice within the evidence window",
      "```",
      "## VER-03 — Terminal provider and Linear digest",
      "- Phase: closeout",
      "- Proves: AC-03",
      "- Command status: external_readback",
      "- Expected receipt: matching redacted provider and saved-description SHA-256 values.",
      "```bash",
      "# Authenticated Linear read-back: get issue OVE-999 full description and compare its digest with provider receipt db-123",
      "```",
    ].join("\n"),
    "Delivery, exact-SHA proof, and Linear closeout": `${externalStateDeliveryFields()}\nDeclare no-repository-delta at baseline and create no branch, commit, PR, deployment, or provider effect. Record the exact environment class, official capability response class, immutable redacted receipt, digest, second read-back, zero-effect rollback, session cleanup, and final Linear read-back. Compare the saved-description SHA-256 before Done.`,
    "Failure gates":
      "Stop on registry/provider identity drift, unavailable official capability evidence, any mutation verb or effect, unbounded retry, secret or user-data exposure, missing cleanup, cyclic Linear relation, or saved-description digest mismatch. An inconclusive receipt keeps dependent execution blocked.",
    "Required context": [
      "- `AGENTS.md`",
      "- `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`",
      "- `docs/SDD_VERTICAL_SLICE_ROADMAP.md`",
      "- `docs/MAINLINE_CLOSEOUT.md`",
      "- `docs/TECH_STACK_DECISIONS.md`",
      "- `docs/adr/ADR-0014-agentic-stack-realignment.md`",
      "- `docs/INFRASTRUCTURE_REGISTRY.md`",
    ].join("\n"),
  });
}

function validCoordinationContainerTask(): string {
  return validFinalTask({
    "AI execution directive":
      "Coordinate one release-readiness integration outcome through child OVE-1000. This coordination container is non-executable, never assigned, owns only the acyclic child DAG and integration receipt, and authorizes no implementation, provider effect, or deployment.",
    "Execution metadata": metadataWith({
      "Issue kind": "coordination_container",
      "Repository change": "no",
      Touches: "coordination",
      "Sensitive boundaries": "none",
      "External systems": "none",
    }),
    "User or operator outcome and behavior":
      "The coordinator reads child OVE-1000 and its relation, observes a bounded degraded state while the child or integration receipt is incomplete, and completes final read-back only after the independent child and integration outcome are terminal. Recovery returns the container to the unstarted gate and repeats the authenticated read on drift.",
    "Product thinking and falsification":
      "- Product-research branch: no_direct\nProtected outcome: one coherent integration receipt without hiding executable work in a parent. No product-research file directly constrains this non-executable coordination graph. The load-bearing assumption is that OVE-1000 is the complete independently owned child set. Falsification signal: another implementation owner, rollback boundary, or missing receipt reopens decomposition before closeout.",
    "Pinned baseline, reproduction, evidence, and counterevidence": `Baseline ${baselineSha} was observed on 2026-07-26. Confirmed evidence: Linear can read child OVE-1000, its terminal state, and its relation to OVE-999. Counterevidence: an undeclared executable owner or cycle stops coordination closeout. Not proved: the container itself produces no code, provider state, deployment, or product behavior. Evidence contains only issue identifiers and bounded receipt classes.`,
    "Root cause or proof gap":
      "Not applicable — this coordination container has no defect or implementation boundary of its own; its proof gap is only child-DAG completeness and integration acceptance.",
    "Non-negotiable invariants":
      "1. INV-01: OVE-1000 remains independently executable, owned, and terminal before integration acceptance.\n2. INV-02: the OVE-999/OVE-1000 relation graph remains complete and acyclic.\n3. INV-03: the container remains unassigned, outside In Progress, and creates zero implementation or provider effect.\n4. INV-04: terminal closeout records one matching child, integration, and saved-body receipt.",
    "Exact data, state, protocol, and concurrency contract":
      "Container state is `unstarted -> children_complete -> integration_accepted -> terminal`; any child reopen or relation drift returns it to `unstarted`. Linear child state and relation read-back are authoritative. Parallel child work remains isolated behind independent contracts; integration serializes only after all terminal receipts. The read deadline is 10 seconds, cancellation rejects late relation state, and concurrency is bounded to 2 reads. The container writes no repository or provider state.",
    "Exact vertical scope, target files, and caller inventory":
      "The exact scope is Linear container OVE-999, child OVE-1000, their saved relation, the child's terminal receipt, and the integration acceptance receipt. Zero repository target, caller, implementation, deployment, or external system is authorized.",
    "Ordered implementation plan":
      "1. Read OVE-999, child OVE-1000, full descriptions, states, owners, and relations.\n2. Prove the child table is complete and the relation graph is acyclic.\n3. Leave the container unassigned and unstarted while OVE-1000 is nonterminal.\n4. Read OVE-1000 terminal evidence independently.\n5. Evaluate the container-owned integration criterion.\n6. Save and read back the integration and description digests, then close directly to terminal.",
    "UX, accessibility, localization, degraded states, performance, and observability":
      "Locale matrix: Not applicable — this non-executable coordination container renders no product UI or copy. Degraded state is `unstarted` with the exact missing child/integration receipt; recovery repeats authenticated Linear read-back.\n- Performance budget: PERF-01 (`linear_read_deadline`) — `linear_read_deadline` is at most 10 seconds and cancellation rejects late relation state.\n- Performance measurement: PERF-01 (`linear_read_deadline`) — VER-02 uses the connector timer test at `Linear:OVE-999:integration` to measure `linear_read_deadline`.\n- Blocking alerts: forbidden\n- Global wait overlay: forbidden\n- Pointer trap: forbidden\n- Unbounded polling/retry: forbidden\n- Wait-safe controls: `Linear issue navigation`; `refresh control` — both remain usable and enabled during every wait.\n- Slow/down proof: WAIT-01 — VER-02 at `Linear:OVE-999:integration` — injected `relation read timeout` asserts `Linear issue navigation` and `refresh control` remain responsive and records a bounded `unstarted` receipt.\n- Observability: the redacted child/integration receipt only.",
    "Migration, compatibility, rollout, rollback, and cleanup":
      "No schema migration, backfill, repository rollout, deployment, or provider action exists. A child reopen rolls the container back to `unstarted`; relation drift blocks closeout. Cleanup retains only redacted child/integration receipts and the saved-body digest.",
    "Dependencies, ownership boundaries, relations, and non-goals": [
      "Every child owns its contract and remains independently executable. The container is never assigned, the DAG is acyclic, and the integration receipt is the sole container-owned outcome.",
      "| Child issue | Independently executable outcome | Relation/direction | Verified owner | Required terminal receipt |",
      "| --- | --- | --- | --- | --- |",
      "| `OVE-1000` | bounded release behavior | blocks OVE-999 | release owner from authenticated Linear | Done plus immutable behavior receipt |",
      "- Integration criterion: OVE-1000 is independently Done, its immutable receipt matches the declared release behavior, and the aggregate readiness check has zero failure gate.",
      "- DAG proof: enumerate OVE-999 and OVE-1000, read back the blocks edge, and fail on any cycle, missing node, duplicate owner, or saved-relation drift.",
      "Non-goals are implementation, assignment, In Progress state, branch/commit/PR, deployment, provider mutation, and rewriting child acceptance.",
    ].join("\n"),
    "Measurable acceptance criteria": [
      "1. **AC-01 — OVE-1000 is independently Done with its required immutable behavior receipt.**\n   - Protects: INV-01.\n   - Verified by: VER-01.",
      "2. **AC-02 — the OVE-999/OVE-1000 blocks graph contains both nodes, one intended edge, and zero cycle.**\n   - Protects: INV-02.\n   - Verified by: VER-01.",
      "3. **AC-03 — PERF-01 (`linear_read_deadline`) — `linear_read_deadline` is at most 10 seconds; OVE-999 remains unassigned and unstarted until the integration receipt passes, then closes directly with zero own effect and a matching saved-body digest.**\n   - Protects: INV-03, INV-04.\n   - Verified by: VER-02.",
    ].join("\n"),
    "Required test and fault matrix": [
      "| Case | Protects | Proves | Verification | Level | Fault/input | Expected receipt |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| Happy child terminal proof for OVE-1000 | INV-01 | AC-01 | VER-01 | Linear child | Done state plus immutable behavior receipt | accepted independent child receipt |",
      "| Concurrent OVE-999/OVE-1000 timeout recovery under read load | INV-02 | AC-02 | VER-01 | Linear DAG | 10-second timeout, missing/reversed/duplicate edge, or cycle | PERF-01 (`linear_read_deadline`) — `linear_read_deadline` is at most 10 seconds; bounded recovery or exact graph-drift block |",
      "| Another container integration and digest check | INV-03, INV-04 | AC-03 | VER-02 | Linear integration | incomplete receipt, assignment, In Progress state, or body drift | unstarted block or direct terminal receipt with zero effect |",
    ].join("\n"),
    "Verification commands and required evidence": [
      "## VER-01 — OVE-1000 child and DAG read-back",
      "- Phase: coordination",
      "- Proves: AC-01, AC-02",
      "- Command status: external_readback",
      "- Expected receipt: OVE-1000 terminal evidence plus the complete acyclic OVE-999 relation graph.",
      "```bash",
      "# Authenticated Linear read-back: get OVE-999 and child OVE-1000 with full states, owners, descriptions, receipts, and relations",
      "```",
      "## VER-02 — OVE-999 integration and terminal digest",
      "- Phase: coordination closeout",
      "- Proves: AC-03",
      "- Command status: external_readback",
      "- Expected receipt: passing integration, zero own effect, direct terminal state, and matching saved-body digest.",
      "- Performance proof: PERF-01 (`linear_read_deadline`) — target `Linear:OVE-999:integration` measures `linear_read_deadline` at most 10 seconds and records a bounded threshold receipt.",
      "- No-wedge proof: WAIT-01 — target `Linear:OVE-999:integration` injects `relation read timeout`, proves `Linear issue navigation` and `refresh control` remain responsive, and records a bounded `unstarted` receipt.",
      "```bash",
      "# Authenticated Linear read-back: target Linear:OVE-999:integration; compare OVE-1000 receipt with OVE-999 integration criterion and fetch OVE-999 terminal description digest",
      "```",
    ].join("\n"),
    "Delivery, exact-SHA proof, and Linear closeout": `${coordinationDeliveryFields()}\nRemain unassigned and outside In Progress. Create no branch, commit, PR, deployment, implementation, or provider effect. Perform the final Linear read-back of every complete child identifier (OVE-1000) and relation, prove the child DAG is acyclic and every child is independently Done, record the integration acceptance receipt, compare the saved-description SHA-256, and move the container through direct terminal closeout.`,
    "Failure gates":
      "The non-executable container is never assigned. Stop terminal closeout when OVE-1000 is open or missing evidence, a relation is absent/reversed/cyclic, ownership is ambiguous, integration fails, any own effect appears, or the saved-body digest differs.",
    "Required context": [
      "- `AGENTS.md`",
      "- `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`",
      "- `docs/SDD_VERTICAL_SLICE_ROADMAP.md`",
      "- `docs/MAINLINE_CLOSEOUT.md`",
      "- `docs/TECH_STACK_DECISIONS.md`",
      "- `docs/adr/ADR-0014-agentic-stack-realignment.md`",
      "- Linear issue `OVE-1000` full description, state, owner, receipts, and relations",
    ].join("\n"),
  });
}

describe("Linear AI execution task validator", () => {
  it("accepts the tracked issue template in template phase", async () => {
    const template = await readFile(
      path.join(
        repoRoot,
        "docs",
        "linear",
        "AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md",
      ),
      "utf8",
    );

    const report = validateLinearAgentTask(template, { phase: "template" });

    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects template drift in PERF/WAIT identity, operative fields, and post-merge order", async () => {
    const template = await readFile(
      path.join(
        repoRoot,
        "docs",
        "linear",
        "AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md",
      ),
      "utf8",
    );
    const variants = [
      template.replaceAll("PERF-01", "PERF-99"),
      template.replaceAll("WAIT-01", "WAIT-99"),
      template.replace(
        /^- Performance measurement:/m,
        "    - Performance measurement:",
      ),
      template.replace(
        "git fetch origin main\ngit merge-base --is-ancestor",
        "git merge-base --is-ancestor",
      ),
      template.replace(
        'git merge-base --is-ancestor "${{TASK_PREFIX}}_IMPLEMENTATION_SHA" origin/main\ncd apps/web\npnpm mainline:closeout:check',
        'pnpm mainline:closeout:check\ngit merge-base --is-ancestor "${{TASK_PREFIX}}_IMPLEMENTATION_SHA" origin/main',
      ),
    ];
    for (const variant of variants) {
      expect(
        validateLinearAgentTask(variant, { phase: "template" }).errors.length,
      ).toBeGreaterThan(0);
    }
  });

  it("rejects template-phase research, performance, wait-safety, and delivery polarity bypasses", async () => {
    const template = await readFile(
      path.join(
        repoRoot,
        "docs",
        "linear",
        "AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md",
      ),
      "utf8",
    );
    const variants: Array<[string, string]> = [
      [
        "provisional no_direct research",
        template.replace(
          "record a closed affirmative no-direct-research conclusion with zero research paths and no open/not-ruled-out uncertainty",
          "record a provisional no-direct-research guess and let the implementation agent choose research during coding",
        ),
      ],
      [
        "lower-bound performance budget",
        template.replace(
          "`{{same canonical_metric_key}}` is at most {{one number}}",
          "`{{same canonical_metric_key}}` is at least {{one number}}",
        ),
      ],
      [
        "dummy performance instrument",
        template.replace(
          "uses the {{one real timer/probe/histogram/benchmark/test}}",
          "uses the {{one dummy/fake instrument}}",
        ),
      ],
      [
        "disableable wait-safe controls",
        template.replace(
          "both remain usable and enabled during every wait.",
          "both may be disabled during every wait.",
        ),
      ],
      [
        "disableable slow/down proof controls",
        template.replace(
          "asserts `{{same first control}}` and `{{same second control}}` remain responsive",
          "asserts `{{same first control}}` and `{{same second control}}` may be disabled",
        ),
      ],
      [
        "allowed direct-main mutation",
        template.replace(
          "{{forbidden for repository_change; otherwise delete this field}}",
          "{{allowed for repository_change; otherwise delete this field}}",
        ),
      ],
      [
        "optional local-state preservation",
        template.replace(
          "{{required for repository_change; otherwise delete this field}}",
          "{{optional for repository_change; otherwise delete this field}}",
        ),
      ],
      [
        "stale-main destructive local-state instruction",
        template.replace(
          "Start from current main on `codex/{{issue-id-lower}}-{{slug}}`. Preserve all unrelated and ignored local files and secrets.",
          "Start from stale main on `codex/{{issue-id-lower}}-{{slug}}`. Delete all unrelated and ignored local files and secrets.",
        ),
      ],
    ];

    for (const [label, variant] of variants) {
      expect(variant, label).not.toBe(template);
      expect(
        validateLinearAgentTask(variant, { phase: "template" }).errors.map(
          (error) => error.code,
        ),
        label,
      ).toContain("template_exact_contract");
    }

    const additiveContradictions: Array<[string, string, string]> = [
      [
        "deferred no_direct addendum",
        "Product thinking and falsification",
        "A no_direct decision may be provisional; the implementation agent can choose research during coding.",
      ],
      [
        "lower-bound performance addendum",
        "UX, accessibility, localization, degraded states, performance, and observability",
        "PERF-01 may instead use a performance target of at least one second.",
      ],
      [
        "fake instrument addendum",
        "UX, accessibility, localization, degraded states, performance, and observability",
        "A dummy performance instrument may replace the declared probe.",
      ],
      [
        "disableable wait controls addendum",
        "UX, accessibility, localization, degraded states, performance, and observability",
        "Wait-safe controls may be disabled while the dependency is pending.",
      ],
      [
        "disableable wait proof addendum",
        "UX, accessibility, localization, degraded states, performance, and observability",
        "WAIT-01 may block both controls while collecting the receipt.",
      ],
      [
        "direct-main addendum",
        "Delivery, exact-SHA proof, and Linear closeout",
        "Direct main mutation is allowed for repository changes.",
      ],
      [
        "optional preservation addendum",
        "Delivery, exact-SHA proof, and Linear closeout",
        "Local state preservation is optional when the worktree is crowded.",
      ],
      [
        "stale destructive delivery addendum",
        "Delivery, exact-SHA proof, and Linear closeout",
        "The agent may start from stale main and delete unrelated local files.",
      ],
    ];

    for (const [label, heading, contradiction] of additiveContradictions) {
      const variant = template.replace(
        `# ${heading}\n\n`,
        `# ${heading}\n\n${contradiction}\n\n`,
      );
      expect(variant, label).not.toBe(template);
      expect(
        validateLinearAgentTask(variant, { phase: "template" }).errors.map(
          (error) => error.code,
        ),
        label,
      ).toContain("template_exact_contract");
    }
  });

  it("rejects malformed template cross-field placeholders, open selectors, duplicate sequences, and VER-05 command decoys", async () => {
    const template = await readFile(
      path.join(
        repoRoot,
        "docs",
        "linear",
        "AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md",
      ),
      "utf8",
    );
    const canonicalRepositorySequence = `Canonical repository-change sequence: \`${repositoryDeliverySequence}\`.`;
    const ver05Commands = [
      "git fetch origin main",
      'git merge-base --is-ancestor "${{TASK_PREFIX}}_IMPLEMENTATION_SHA" origin/main',
      "cd apps/web",
      "pnpm mainline:closeout:check",
    ].join("\n");
    const reversedVer05Commands = [
      "pnpm mainline:closeout:check",
      "cd apps/web",
      'git merge-base --is-ancestor "${{TASK_PREFIX}}_IMPLEMENTATION_SHA" origin/main',
      "git fetch origin main",
    ].join("\n");
    const proseDecoyWithReversedCommands = template
      .replace(ver05Commands, reversedVer05Commands)
      .replace(
        "## VER-05 — Mainline and live proof\n",
        `## VER-05 — Mainline and live proof\n\nProse decoy says ${ver05Commands.replaceAll("\n", ", then ")}.\n`,
      );
    const variants: Array<[string, string, string]> = [
      [
        "malformed performance budget grammar",
        template.replace(
          "PERF-01 (`{{canonical_metric_key}}`) — `{{same canonical_metric_key}}` is at most {{one number}} {{one compatible unit}}",
          "PERF-01 {{canonical_metric_key}} — {{same canonical_metric_key}} around {{one number}} {{one compatible unit}}",
        ),
        "template_exact_contract",
      ],
      [
        "performance measurement VER placeholder mismatch",
        template.replace("— VER-{{NN}} uses the", "— VER-{{MM}} uses the"),
        "template_exact_contract",
      ],
      [
        "performance proof target mismatch",
        template.replace(
          "Performance proof: PERF-01 (`{{same canonical_metric_key}}`) — target `{{same exact executable/read-back target}}`",
          "Performance proof: PERF-01 (`{{same canonical_metric_key}}`) — target `{{different executable/read-back target}}`",
        ),
        "template_exact_contract",
      ],
      [
        "performance proof metric mismatch",
        template.replace(
          "Performance proof: PERF-01 (`{{same canonical_metric_key}}`)",
          "Performance proof: PERF-01 (`{{different_metric_key}}`)",
        ),
        "template_exact_contract",
      ],
      [
        "slow/down proof VER placeholder mismatch",
        template.replace(
          "Slow/down proof: WAIT-01 — VER-{{NN}}",
          "Slow/down proof: WAIT-01 — VER-{{MM}}",
        ),
        "template_exact_contract",
      ],
      [
        "no-wedge proof target mismatch",
        template.replace(
          "No-wedge proof: WAIT-01 — target `{{same exact executable/read-back target}}`",
          "No-wedge proof: WAIT-01 — target `{{different executable/read-back target}}`",
        ),
        "template_exact_contract",
      ],
      [
        "open delivery-sequence selector",
        template.replace(
          "{{copy exactly one matching canonical sequence below and delete the two inapplicable paths}}",
          "{{copy exactly one matching canonical sequence below and delete the two inapplicable paths}} or invent an alternative",
        ),
        "template_exact_contract",
      ],
      [
        "duplicate fake canonical repository sequence",
        template.replace(
          canonicalRepositorySequence,
          `${canonicalRepositorySequence}\n\nCanonical repository-change sequence: \`stale_main -> direct_main -> done\`.`,
        ),
        "template_exact_contract",
      ],
      [
        "wrong VER-05 SHA variable",
        template.replace(
          'git merge-base --is-ancestor "${{TASK_PREFIX}}_IMPLEMENTATION_SHA" origin/main',
          'git merge-base --is-ancestor "${{OTHER_PREFIX}}_IMPLEMENTATION_SHA" origin/main',
        ),
        "template_delivery_order",
      ],
      [
        "VER-05 prose decoy with reversed bash commands",
        proseDecoyWithReversedCommands,
        "template_delivery_order",
      ],
    ];

    for (const [label, variant, expectedCode] of variants) {
      expect(variant, label).not.toBe(template);
      expect(
        validateLinearAgentTask(variant, { phase: "template" }).errors.map(
          (error) => error.code,
        ),
        label,
      ).toContain(expectedCode);
    }
  });

  it("keeps every binding planning entry point linked to the canonical standard", async () => {
    const entryPoints = [
      "AGENTS.md",
      "README.md",
      "docs/SDD_VERTICAL_SLICE_ROADMAP.md",
      "docs/TECH_STACK_DECISIONS.md",
      "docs/product-research/README.md",
      "docs/MAINLINE_CLOSEOUT.md",
      "docs/SCAFFOLD_STATUS.md",
      "docs/LINEAGE_SCOPE_DECISION.md",
      "docs/WALKING_SKELETON.md",
    ];
    const contents = await Promise.all(
      entryPoints.map(async (relativePath) => ({
        relativePath,
        source: await readFile(path.join(repoRoot, relativePath), "utf8"),
      })),
    );

    for (const { relativePath, source } of contents) {
      expect(source, relativePath).toContain(
        "docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md",
      );
    }
  });

  it("keeps contract version and mandatory headings aligned across standard, template, and validator", async () => {
    const [standard, template] = await Promise.all([
      readFile(
        path.join(repoRoot, "docs", "LINEAR_AI_EXECUTION_TASK_STANDARD.md"),
        "utf8",
      ),
      readFile(
        path.join(
          repoRoot,
          "docs",
          "linear",
          "AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md",
        ),
        "utf8",
      ),
    ]);

    expect(standard).toContain("Contract version: `overgarden.linear-sdd.v1`");
    expect(template).toContain("- Contract: `overgarden.linear-sdd.v1`");
    for (const [index, heading] of REQUIRED_LINEAR_TASK_HEADINGS.entries()) {
      expect(standard).toContain(`### ${index + 1}. ${heading}`);
      expect(template).toContain(`# ${heading}`);
    }
  });

  it("accepts a complete concrete remediation contract", () => {
    const report = validateLinearAgentTask(validFinalTask(), {
      checkRepositoryPathsAtBaseline: false,
    });

    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it("accepts both non-user-facing research-resolution paths", () => {
    const explicitNoDirectResearch = validateLinearAgentTask(validFinalTask(), {
      checkRepositoryPathsAtBaseline: false,
    });
    expect(explicitNoDirectResearch.errors).toEqual([]);

    const researchPath = "docs/product-research/OverGarden_B2_METRICS_v0.md";
    const citedResearch = validateLinearAgentTask(
      validFinalTask({
        "Product thinking and falsification": `- Product-research branch: constrained\nProtected outcome: bounded journal access. The load-bearing assumption is that the server boundary owns the failure. Falsification signal: counterevidence at current main stops implementation and reopens diagnosis. Research constraint: \`${researchPath}\` defines the reliability signal this remediation protects.`,
        "Required context": [
          validFinalTask().match(/# Required context\n\n([\s\S]+)$/)?.[1] ?? "",
          `- \`${researchPath}\``,
        ].join("\n"),
      }),
      { checkRepositoryPathsAtBaseline: false },
    );
    expect(citedResearch.errors).toEqual([]);
  });

  it("rejects non-user-facing work with neither research nor a no-direct conclusion", () => {
    const report = validateLinearAgentTask(
      validFinalTask({
        "Product thinking and falsification":
          "- Product-research branch: no_direct\nProtected outcome: bounded journal access. The load-bearing assumption is that the server boundary owns the failure. Falsification signal: counterevidence at current main stops implementation and reopens diagnosis.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    );

    expect(report.errors.map((error) => error.code)).toContain(
      "non_user_product_research_resolution",
    );
  });

  it("rejects non-user-facing research cited only in Product thinking", () => {
    const researchPath = "docs/product-research/OverGarden_B2_METRICS_v0.md";
    const report = validateLinearAgentTask(
      validFinalTask({
        "Product thinking and falsification": `- Product-research branch: constrained\nProtected outcome: bounded journal access. The load-bearing assumption is that the server boundary owns the failure. Falsification signal: counterevidence at current main stops implementation and reopens diagnosis. Research constraint: \`${researchPath}\` defines the reliability signal this remediation protects.`,
      }),
      { checkRepositoryPathsAtBaseline: false },
    );

    expect(report.errors.map((error) => error.code)).toContain(
      "non_user_product_research_resolution",
    );
  });

  it("rejects non-user-facing research listed only in Required context", () => {
    const researchPath = "docs/product-research/OverGarden_B2_METRICS_v0.md";
    const report = validateLinearAgentTask(
      validFinalTask({
        "Product thinking and falsification":
          "- Product-research branch: constrained\nProtected outcome: bounded journal access. The load-bearing assumption is that the server boundary owns the failure. Falsification signal: counterevidence at current main stops implementation and reopens diagnosis.",
        "Required context": [
          validFinalTask().match(/# Required context\n\n([\s\S]+)$/)?.[1] ?? "",
          `- \`${researchPath}\``,
        ].join("\n"),
      }),
      { checkRepositoryPathsAtBaseline: false },
    );

    expect(report.errors.map((error) => error.code)).toContain(
      "non_user_product_research_resolution",
    );
  });

  it("rejects partial research-path overlap and contradictory no-direct declarations", () => {
    const firstPath = "docs/product-research/OverGarden_B2_METRICS_v0.md";
    const secondPath = "docs/product-research/OverGarden_B5_VALIDATION_v0.md";
    const baseContext =
      validFinalTask().match(/# Required context\n\n([\s\S]+)$/)?.[1] ?? "";

    const partialOverlap = validateLinearAgentTask(
      validFinalTask({
        "Product thinking and falsification": `- Product-research branch: constrained\nProtected outcome: bounded journal access. The load-bearing assumption is that the server boundary owns the failure. Falsification signal: counterevidence at current main stops implementation and reopens diagnosis. Research constraints: \`${firstPath}\` defines the reliability signal and \`${secondPath}\` defines its validation boundary.`,
        "Required context": [baseContext, `- \`${firstPath}\``].join("\n"),
      }),
      { checkRepositoryPathsAtBaseline: false },
    );
    expect(partialOverlap.errors.map((error) => error.code)).toContain(
      "non_user_product_research_resolution",
    );

    const contradictoryBranches = validateLinearAgentTask(
      validFinalTask({
        "Product thinking and falsification": `- Product-research branch: no_direct\nProtected outcome: bounded journal access. The load-bearing assumption is that the server boundary owns the failure. Falsification signal: counterevidence at current main stops implementation and reopens diagnosis. This remediation has no direct product-research dependency, while \`${firstPath}\` constrains the reliability signal.`,
        "Required context": [baseContext, `- \`${firstPath}\``].join("\n"),
      }),
      { checkRepositoryPathsAtBaseline: false },
    );
    expect(contradictoryBranches.errors.map((error) => error.code)).toContain(
      "non_user_product_research_conflict",
    );
  });

  it("supports explained Unicode and spaced product-research paths", () => {
    const baseContext =
      validFinalTask().match(/# Required context\n\n([\s\S]+)$/)?.[1] ?? "";
    for (const researchPath of [
      "docs/product-research/ЦА_CANON_v1.md",
      "docs/product-research/Пряма мова — Threads.md",
    ]) {
      const report = validateLinearAgentTask(
        validFinalTask({
          "Product thinking and falsification": `- Product-research branch: constrained\nProtected outcome: bounded journal access. The load-bearing assumption is that the server boundary owns the failure. Falsification signal: counterevidence at current main stops implementation and reopens diagnosis. Research constraint: \`${researchPath}\` defines the task-local trust boundary for this remediation.`,
          "Required context": [baseContext, `- \`${researchPath}\``].join("\n"),
        }),
        { checkRepositoryPathsAtBaseline: false },
      );

      expect(report.errors).toEqual([]);
    }

    const userFacingTask = validVerticalExecutionTask()
      .replace(
        "docs/product-research/overgarden-living-journals.md",
        "docs/product-research/ЦА_CANON_v1.md",
      )
      .replace(
        "docs/product-research/OverGarden_PAGE_ARCHITECTURE_v1.md",
        "docs/product-research/Пряма мова — Threads.md",
      );
    expect(
      validateLinearAgentTask(userFacingTask, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).not.toContain("product_research_count");
  });

  it("rejects a bare research path without a task-local constraint explanation", () => {
    const researchPath = "docs/product-research/ЦА_CANON_v1.md";
    const baseContext =
      validFinalTask().match(/# Required context\n\n([\s\S]+)$/)?.[1] ?? "";
    const report = validateLinearAgentTask(
      validFinalTask({
        "Product thinking and falsification": `- Product-research branch: constrained\nProtected outcome: bounded journal access. The load-bearing assumption is that the server boundary owns the failure. Falsification signal: counterevidence at current main stops implementation and reopens diagnosis. Research: \`${researchPath}\`.`,
        "Required context": [baseContext, `- \`${researchPath}\``].join("\n"),
      }),
      { checkRepositoryPathsAtBaseline: false },
    );

    expect(report.errors.map((error) => error.code)).toContain(
      "non_user_product_research_resolution",
    );
  });

  it("rejects vacuous research explanations and open no-direct conclusions", () => {
    const researchPath = "docs/product-research/ЦА_CANON_v1.md";
    const baseContext =
      validFinalTask().match(/# Required context\n\n([\s\S]+)$/)?.[1] ?? "";
    const vacuousResearch = validateLinearAgentTask(
      validFinalTask({
        "Product thinking and falsification": `- Product-research branch: constrained\nProtected outcome: bounded journal access. The load-bearing assumption is that the server boundary owns the failure. Falsification signal: counterevidence at current main stops implementation and reopens diagnosis. Research: \`${researchPath}\` constrains.`,
        "Required context": [baseContext, `- \`${researchPath}\``].join("\n"),
      }),
      { checkRepositoryPathsAtBaseline: false },
    );
    expect(vacuousResearch.errors.map((error) => error.code)).toContain(
      "non_user_product_research_resolution",
    );

    const openConclusion = validateLinearAgentTask(
      validFinalTask({
        "Product thinking and falsification":
          "- Product-research branch: no_direct\nProtected outcome: bounded journal access. No direct product-research dependency has been ruled out, so discovery remains open. The load-bearing assumption is that the server boundary owns the failure. Falsification signal: counterevidence at current main stops implementation and reopens diagnosis.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    );
    expect(openConclusion.errors.map((error) => error.code)).toContain(
      "non_user_product_research_resolution",
    );
  });

  it("rejects deferred or non-binding product-research authority", () => {
    for (const contradiction of [
      "Research selection is deferred to implementation.",
      "Relevant product-research will be chosen during coding.",
      "Product research becomes mandatory after coding begins.",
      "A product-research check occurs during implementation.",
      "Product research may become relevant after implementation starts.",
      "Product-research remains binding for this implementation.",
      "The product-research corpus controls implementation choices.",
      "Product-research applicability will be decided during implementation.",
      "The customer-research corpus will guide coding.",
    ]) {
      const task = validFinalTask().replace(
        "No schema migration",
        `${contradiction}\nNo schema migration`,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        contradiction,
      ).toContain("non_user_product_research_resolution");
    }

    for (const contradiction of [
      "The product-research constraints are merely decorative.",
      "The product-research evidence has no effect on implementation.",
      "The cited studies do not matter and are reference decoration only.",
      "The cited research constraints are advisory.",
      "The cited research constraints are optional.",
    ]) {
      const task = validVerticalExecutionTask().replace(
        "The load-bearing assumption",
        `${contradiction} The load-bearing assumption`,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        contradiction,
      ).toContain("user_facing_product_research_resolution");
    }
  });

  it("extracts product-research authority from plain paths and Markdown destinations", () => {
    for (const authority of [
      "Authority: docs/product-research/OverGarden_B2_METRICS_v0.md defines the reliability requirement.",
      "[Research authority](docs/product-research/OverGarden_B2_METRICS_v0.md) defines the reliability requirement.",
      "Authority: docs/product-research/ЦА_CANON_v1.md defines the reliability requirement.",
      "Authority: docs/product-research/Пряма мова — Threads.md defines the reliability requirement.",
      "Authority: `./docs/product-research/ЦА_CANON_v1.md` defines the reliability requirement.",
      "[Research authority](./docs/product-research/Пряма мова — Threads.md) defines the reliability requirement.",
    ]) {
      const task = validFinalTask().replace(
        "No schema migration",
        `${authority}\nNo schema migration`,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        authority,
      ).toContain("non_user_product_research_conflict");
    }

    const undeclaredPath =
      "docs/product-research/OverGarden_B5_VALIDATION_v0.md";
    const userFacingTask = validVerticalExecutionTask().replace(
      "The load-bearing assumption",
      `${undeclaredPath} also governs implementation. The load-bearing assumption`,
    );
    expect(
      validateLinearAgentTask(userFacingTask, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("user_facing_product_research_resolution");
  });

  it("rejects generic duplicated or semantically vacuous product-research explanations", () => {
    for (const genericExplanation of [
      "constrains this bounded task contract in implementation",
      "constrains exact complete correct agent behavior",
    ]) {
      const task = validVerticalExecutionTask()
        .replace(
          "constrains the task to a durable journal-linked saved object rather than a detached engagement counter",
          genericExplanation,
        )
        .replace(
          "constrains the task to an inline wishlist transition that preserves catalog navigation context",
          genericExplanation,
        );

      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        genericExplanation,
      ).toContain("user_facing_product_research_resolution");
    }
  });

  it("accepts a complete user-facing vertical execution contract", () => {
    const report = validateLinearAgentTask(validVerticalExecutionTask(), {
      checkRepositoryPathsAtBaseline: false,
    });

    expect(report.errors).toEqual([]);
  });

  it("accepts a complete time-bounded decision spike contract", () => {
    const report = validateLinearAgentTask(validDecisionSpikeTask(), {
      checkRepositoryPathsAtBaseline: false,
    });

    expect(report.errors).toEqual([]);
  });

  it("accepts a complete canon-correction contract", () => {
    const report = validateLinearAgentTask(validCanonCorrectionTask(), {
      checkRepositoryPathsAtBaseline: false,
    });

    expect(report.errors).toEqual([]);
  });

  it("rejects a degraded tracked template section", async () => {
    const template = await readFile(
      path.join(
        repoRoot,
        "docs",
        "linear",
        "AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md",
      ),
      "utf8",
    );
    const corrupted = template.replace(
      /# Product thinking and falsification\n[\s\S]*?\n# Pinned baseline/,
      "# Product thinking and falsification\n\n{{fill this}}\n\n# Pinned baseline",
    );

    expect(
      validateLinearAgentTask(corrupted, { phase: "template" }).errors.map(
        (error) => error.code,
      ),
    ).toContain("template_section_marker");
  });

  it("rejects a nonexistent Git baseline and required context path", () => {
    const report = validateLinearAgentTask(
      validFinalTask({
        "Execution metadata": metadataWith({
          "Baseline SHA": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        }),
        "Required context": [
          "- `AGENTS.md`",
          "- `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`",
          "- `docs/SDD_VERTICAL_SLICE_ROADMAP.md`",
          "- `docs/MAINLINE_CLOSEOUT.md`",
          "- `docs/TECH_STACK_DECISIONS.md`",
          "- `docs/adr/ADR-0014-agentic-stack-realignment.md`",
          "- `apps/web/src/server/does-not-exist.ts`",
        ].join("\n"),
      }),
    );

    expect(report.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "baseline_commit_missing",
        "context_path_missing",
      ]),
    );
  });

  it("binds the delivery branch to the concrete Linear identifier", () => {
    const report = validateLinearAgentTask(
      validFinalTask({
        "Execution metadata": metadataWith({ "Issue identifier": "OVE-245" }),
      }),
    );

    expect(report.errors.map((error) => error.code)).toContain(
      "delivery_issue_branch_mismatch",
    );
  });

  it("requires bidirectional AC and VER mapping and a command per VER", () => {
    const verification = validFinalTask()
      .match(
        /# Verification commands and required evidence\n\n([\s\S]*?)\n\n# Delivery/,
      )?.[1]
      ?.replace("- Proves: AC-01, AC-02", "- Proves: AC-02")
      .replace(
        /```bash\ncd apps\/web\npnpm exec vitest run scripts\/check-linear-agent-task\.test\.ts\n```/,
        "Provider receipt is described in prose only.",
      );
    const report = validateLinearAgentTask(
      validFinalTask({
        "Verification commands and required evidence": verification ?? "",
      }),
    );

    expect(report.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "verification_mapping_mismatch",
        "verification_command_missing",
      ]),
    );
  });

  it("requires unique sequential invariants and rejects unknown AC mappings", () => {
    const acceptance =
      validFinalTask()
        .match(
          /# Measurable acceptance criteria\n\n([\s\S]*?)\n\n# Required test and fault matrix/,
        )?.[1]
        ?.replace("Protects: INV-01.", "Protects: INV-99.") ?? "";
    const report = validateLinearAgentTask(
      validFinalTask({
        "Non-negotiable invariants":
          "1. INV-01: authorization remains unchanged.\n2. INV-01: privacy remains unchanged.\n3. INV-03: the scoped repository remains canonical.",
        "Measurable acceptance criteria": acceptance,
      }),
    );

    expect(report.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "invariant_duplicate",
        "inv_sequence",
        "invariant_reference_missing",
      ]),
    );
  });

  it("rejects no-op proof and nonexistent repository command paths", () => {
    const verification =
      validFinalTask()
        .match(
          /# Verification commands and required evidence\n\n([\s\S]*?)\n\n# Delivery/,
        )?.[1]
        ?.replace(/```bash[\s\S]*?```/g, "```bash\necho ok\n```") ?? "";
    const noOpCodes = validateLinearAgentTask(
      validFinalTask({
        "Verification commands and required evidence": verification,
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(noOpCodes).toContain("verification_command_noop");

    const missingPathVerification = verification.replace(
      "echo ok",
      "uv run --frozen python services/matching/definitely-missing.py",
    );
    const missingPathCodes = validateLinearAgentTask(
      validFinalTask({
        "Verification commands and required evidence": missingPathVerification,
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(missingPathCodes).toContain("verification_path_missing");
  });

  it("accepts pnpm builtins and real repo-root Python verification paths", () => {
    const verification =
      validFinalTask()
        .match(
          /# Verification commands and required evidence\n\n([\s\S]*?)\n\n# Delivery/,
        )?.[1]
        ?.replace(
          "pnpm exec vitest run src/server/public-surface-indexing-policy.test.ts",
          [
            "pnpm install --frozen-lockfile",
            "cd ../..",
            "uv run --frozen pytest services/matching/tests/test_canary.py",
            "uv run --frozen python services/matching/scripts/run_catalog_typeahead_reindex.py --help",
          ].join("\n"),
        ) ?? "";
    const report = validateLinearAgentTask(
      validFinalTask({
        "Verification commands and required evidence": verification,
      }),
      { checkRepositoryPathsAtBaseline: false },
    );

    expect(report.errors).toEqual([]);
  });

  it("binds AC references to their structured mapping fields", () => {
    const acceptance =
      validFinalTask()
        .match(
          /# Measurable acceptance criteria\n\n([\s\S]*?)\n\n# Required test and fault matrix/,
        )?.[1]
        ?.replace(
          "- Protects: INV-01.",
          "- Protects: the bounded owner contract.\n   - Evidence note: INV-01 and VER-01 appear here but are not mappings.",
        ) ?? "";
    const codes = validateLinearAgentTask(
      validFinalTask({ "Measurable acceptance criteria": acceptance }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);

    expect(codes).toContain("acceptance_invariant_mapping");
  });

  it("requires the fault matrix to map every invariant and acceptance criterion", () => {
    const codes = validateLinearAgentTask(
      validFinalTask({
        "Required test and fault matrix":
          "Happy timeout recovery under concurrent load for another owner uses VER-01 only.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);

    expect(codes).toContain("fault_matrix_invariant_missing");
    expect(codes).toContain("fault_matrix_acceptance_missing");
  });

  it("accepts Linear-normalized two-dash table delimiters on read-back", () => {
    const task = validFinalTask().replace(
      /\| --- \| --- \| --- \| --- \| --- \| --- \| --- \|/g,
      "| -- | -- | -- | -- | -- | -- | -- |",
    );

    expect(
      validateLinearAgentTask(task, { phase: "final", repoRoot }),
    ).toMatchObject({ valid: true, errors: [] });
  });

  it("rejects stale baseline declarations and empty or escaping target inventories", () => {
    const staleCodes = validateLinearAgentTask(
      validFinalTask({
        "Pinned baseline, reproduction, evidence, and counterevidence":
          "Baseline aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa. Confirmed evidence and counterevidence are bounded. Not proved: live behavior. The closest mismatch stops implementation.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(staleCodes).toContain("pinned_baseline_mismatch");

    const emptyCodes = validateLinearAgentTask(
      validFinalTask({
        "Exact vertical scope, target files, and caller inventory":
          "The server owner and every caller will be inventoried before editing, but no concrete target is named.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(emptyCodes).toContain("target_inventory_empty");

    const escapeCodes = validateLinearAgentTask(
      validFinalTask({
        "Exact vertical scope, target files, and caller inventory":
          "Inspect `docs/../../../../../../etc/passwd` and its caller.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(escapeCodes).toContain("target_path_escape");
  });

  it("rejects hazardous verification commands", () => {
    const verification = validFinalTask()
      .match(
        /# Verification commands and required evidence\n\n([\s\S]*?)\n\n# Delivery/,
      )?.[1]
      ?.replace("pnpm lint", "git push --force origin main\npnpm lint");
    const report = validateLinearAgentTask(
      validFinalTask({
        "Verification commands and required evidence": verification ?? "",
      }),
    );

    expect(report.errors.map((error) => error.code)).toContain(
      "hazardous_verification_command",
    );
  });

  it("rejects bare N/A instead of a specific Not applicable reason", () => {
    const report = validateLinearAgentTask(
      validFinalTask({
        "Migration, compatibility, rollout, rollback, and cleanup":
          "Migration: N/A. Rollback and cleanup preserve the existing bounded state.",
      }),
    );

    expect(report.errors.map((error) => error.code)).toContain(
      "bare_not_applicable",
    );
  });

  it("compares post-write read-back bytes to the validated digest", () => {
    const task = validFinalTask();
    const digest = validateLinearAgentTask(task).sha256;

    expect(
      validateLinearAgentTask(task, {
        expectedSha256: digest,
        checkRepositoryPathsAtBaseline: false,
      }).valid,
    ).toBe(true);
    expect(
      validateLinearAgentTask(`${task}\n`, {
        expectedSha256: digest,
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("readback_digest_mismatch");
  });

  it("accepts a bounded external-state-only operator contract without a synthetic PR", () => {
    const report = validateLinearAgentTask(validExternalOperatorTask(), {
      checkRepositoryPathsAtBaseline: false,
    });

    expect(report.errors).toEqual([]);
  });

  it("accepts a non-executable coordination container with child integration closeout", () => {
    const report = validateLinearAgentTask(validCoordinationContainerTask(), {
      checkRepositoryPathsAtBaseline: false,
    });

    expect(report.errors).toEqual([]);
  });

  it("enforces issue-kind metadata compatibility", () => {
    const report = validateLinearAgentTask(
      validFinalTask({
        "Execution metadata": metadataWith({
          "Issue kind": "vertical_execution",
          "User-facing": "no",
        }),
      }),
    );

    expect(report.errors.map((error) => error.code)).toContain(
      "issue_kind_metadata_mismatch",
    );
  });

  it.each([
    [
      "decision_spike",
      {
        "Issue kind": "decision_spike",
        "Direct production-state mutation": "yes",
      },
      "issue_kind_metadata_mismatch",
    ],
    [
      "canon_correction",
      { "Issue kind": "canon_correction" },
      "canon_kind_contract",
    ],
    [
      "coordination_container",
      {
        "Issue kind": "coordination_container",
        "Repository change": "no",
        Touches: "coordination",
      },
      "coordination_kind_contract",
    ],
  ])(
    "enforces %s-specific safety semantics",
    (_kind, metadata, expectedCode) => {
      const report = validateLinearAgentTask(
        validFinalTask({ "Execution metadata": metadataWith(metadata) }),
      );

      expect(report.errors.map((error) => error.code)).toContain(expectedCode);
    },
  );

  it("rejects unresolved placeholders and vague implementation choices", () => {
    const report = validateLinearAgentTask(
      validFinalTask({
        "Root cause or proof gap":
          "{{root cause}}. Follow the existing pattern and handle edge cases as needed.",
      }),
    );

    expect(report.valid).toBe(false);
    expect(report.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["unresolved_placeholder", "vague_language"]),
    );
  });

  it.each([
    "{{}}",
    "{{owner",
    "{{owner\nresource-id}}",
    "<owner>",
    "<resource-id>",
    "<provider|Linear|connector|API>",
    "<owner:value>",
    "<40-character SHA>",
    "<40-char SHA>",
    "<SHA>",
    "<git-sha>",
    "[owner]",
    "[owner_id]",
    "[owner:value]",
    "[40-character SHA]",
    "[40-char SHA]",
    "[owner.email]",
    "[implementation-sha]",
    "[git.sha]",
    "[insert owner]",
    "[exact path]",
    "[owner] (before implementation)",
    "[owner](before-implementation)",
    "TBC",
    "FIXME",
    "TBD_OWNER",
    "OWNER_TBC",
    "TODO_OWNER",
    "FIXME_OWNER",
    "OWNER_TO_BE_DECIDED",
    "OWNER_PENDING",
    "PENDING_OWNER",
    "INSERT_OWNER",
    "REPLACE_OWNER",
    "${OWNER}",
    "$ASSIGNEE",
    "%ASSIGNEE%",
    "@ASSIGNEE@",
    "TBA",
    "TBA_OWNER",
    "OWNER_TBA",
    "RESOURCE_TBC",
    "__INSERT_OWNER__",
    "${INSERT_OWNER}",
    "__OWNER_GOES_HERE__",
    "OWNER_GOES_HERE",
    "$OWNER",
    "%OWNER%",
    "OWNER_TBD",
    "OWNER_TO_BE_FILLED",
    "OWNER_PLACEHOLDER",
    "REPLACE_ME",
    "FILL_ME",
    "CHOOSE_OWNER",
    "(OWNER)",
    "@OWNER@",
    "XX_OWNER_XX",
    "__OWNER__",
    "T.B.D.",
    "to-be-determined",
  ])("rejects final placeholder form %j", (placeholder) => {
    const report = validateLinearAgentTask(
      validFinalTask({
        "Root cause or proof gap": `The closest enforceable boundary is ${placeholder}; the failing regression proof must resolve it before implementation.`,
      }),
      { checkRepositoryPathsAtBaseline: false },
    );

    expect(report.errors.map((error) => error.code)).toContain(
      "unresolved_placeholder",
    );
  });

  it("does not classify dynamic route segments or inline Markdown link labels as placeholders", () => {
    const report = validateLinearAgentTask(
      validFinalTask({
        "Root cause or proof gap":
          "The closest enforceable boundary is the verified `apps/web/src/app/[locale]/wishlist/page.tsx` caller; the failing regression proof, [path](https://linear.app/docs/issue-templates), [owner](https://linear.app/docs/creating-issues), and <kbd>Enter</kbd> reference define the stop condition.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    );

    expect(report.errors.map((error) => error.code)).not.toContain(
      "unresolved_placeholder",
    );
  });

  it("rejects duplicate metadata and preserves exact-byte digest semantics", () => {
    const task = validFinalTask();
    const duplicateMetadataTask = task.replace(
      "- Issue kind: `remediation`",
      "- Issue kind: `remediation`\n- Issue kind: `remediation`",
    );

    expect(
      validateLinearAgentTask(duplicateMetadataTask).errors.map(
        (error) => error.code,
      ),
    ).toContain("metadata_duplicate");
    expect(validateLinearAgentTask(task).sha256).not.toBe(
      validateLinearAgentTask(task.replaceAll("\n", "\r\n")).sha256,
    );
  });

  it("does not treat heading-shaped fenced text as an operative section", () => {
    const task = validFinalTask({
      "Root cause or proof gap": [
        "The closest proved root cause is the bounded server deadline; the regression proof stops implementation and reopens diagnosis on disagreement.",
        "~~~text",
        "# This is fixture input, not a task section",
        "~~~",
      ].join("\n"),
    });

    const codes = validateLinearAgentTask(task, {
      checkRepositoryPathsAtBaseline: false,
    }).errors.map((error) => error.code);
    expect(codes).toContain("section_operativity");
    expect(codes).not.toContain("heading_contract");
  });

  it("rejects missing or reordered mandatory headings", () => {
    const task = validFinalTask()
      .replace("# Root cause or proof gap", "# Root cause")
      .replace(
        "# Ordered implementation plan",
        "# Ordered implementation steps",
      );
    const report = validateLinearAgentTask(task);

    expect(report.errors.map((error) => error.code)).toContain(
      "heading_contract",
    );
    expect(report.errors.map((error) => error.code)).toContain(
      "heading_presence",
    );
  });

  it("requires infrastructure registry context for an external system", () => {
    const report = validateLinearAgentTask(
      validFinalTask({
        "Execution metadata":
          validFinalTask()
            .match(/# Execution metadata\n\n([\s\S]*?)\n\n# User/)?.[1]
            ?.replace(
              "External systems: `none`",
              "External systems: `Cloudflare R2`",
            ) ?? "",
      }),
    );

    expect(report.errors.map((error) => error.code)).toContain(
      "infrastructure_registry",
    );
  });

  it("rejects generic external-system CSV values and activates sensitive auth gates", () => {
    const genericCodes = validateLinearAgentTask(
      validFinalTask({
        "Execution metadata": metadataWith({
          "External systems": "cloud, database",
        }),
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(genericCodes).toContain("external_systems_value");

    const authCodes = validateLinearAgentTask(
      validFinalTask({
        "Execution metadata": metadataWith({
          "Sensitive boundaries": "auth",
        }),
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(authCodes).toContain("auth_secret_contract");
  });

  it("rejects qualitative performance claims without numeric no-wedge proof", () => {
    const acceptance =
      validFinalTask()
        .match(
          /# Measurable acceptance criteria\n\n([\s\S]*?)\n\n# Required test and fault matrix/,
        )?.[1]
        ?.replace(
          "PERF-01 (`request_deadline`) — `request_deadline` is at most 2 seconds; the bounded happy path returns once",
          "the request works fast, properly, and reliably",
        ) ?? "";
    const codes = validateLinearAgentTask(
      validFinalTask({
        "Measurable acceptance criteria": acceptance,
        "UX, accessibility, localization, degraded states, performance, and observability":
          "Locale matrix: Not applicable — no copy changes. The degraded state is keyboard usable. Performance is fast with deadline, cancellation, and bounded work. Observability is safe. No alert, spinner, pointer trap, or unrelated control block is allowed.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);

    expect(codes).toContain("qualitative_acceptance");
    expect(codes).toContain("performance_budget_missing");
  });

  it("does not mistake an unrelated number for a named performance budget", () => {
    for (const performance of [
      "locale scope covers 3 locales while deadline, cancellation, and bounded work remain named without a threshold",
      "request deadline is 3% with bounded cancellation",
      "memory is 2 seconds with bounded cancellation",
      "request deadline is not under 2 seconds, measured by the timer test",
      "request deadline may be under 2 seconds, measured by the timer test",
      "request latency is 2 seconds minimum, measured by the timer test",
      "request deadline fails to stay under 2 seconds, measured by the timer test",
      "request latency is 2 seconds at best, measured by the timer test",
      "worker count is 2 requests/s, measured by the load test",
      "queue depth is 4 workers, measured by the queue probe test",
    ]) {
      const codes = validateLinearAgentTask(
        validFinalTask({
          "UX, accessibility, localization, degraded states, performance, and observability": `Locale matrix: Not applicable — this remediation changes 3 locale classifications but no rendered copy. The degraded state remains keyboard usable. Performance: ${performance}. Window.alert is forbidden. A global spinner or modal is forbidden. A pointer trap is forbidden. Unrelated controls remain usable and must not be disabled. Observability is bounded.`,
        }),
        { checkRepositoryPathsAtBaseline: false },
      ).errors.map((error) => error.code);

      expect(codes).toContain("performance_budget_missing");
    }
  });

  it("binds performance measurement to the same numeric metric contract", () => {
    for (const measurement of [
      "PERF-02 — VER-02 uses the focused timer test to measure the request deadline.",
      "PERF-01 — VER-02 uses an unrelated startup benchmark to measure the request deadline.",
      "PERF-01 — VER-02 uses guesswork to measure the request deadline.",
      "PERF-01 — VER-02 uses a disabled timer test to measure the request deadline.",
      "PERF-01 — VER-02 uses a nonexistent probe to measure the request deadline.",
    ]) {
      const codes = validateLinearAgentTask(
        validFinalTask().replace(
          /^- Performance measurement:.*$/m,
          `- Performance measurement: ${measurement}`,
        ),
        { checkRepositoryPathsAtBaseline: false },
      ).errors.map((error) => error.code);

      expect(codes).toContain("performance_measurement_missing");
    }
  });

  it("does not borrow a numeric budget from a later UX label", () => {
    const codes = validateLinearAgentTask(
      validFinalTask({
        "UX, accessibility, localization, degraded states, performance, and observability":
          "Locale matrix: Not applicable — this remediation changes no rendered copy. The degraded state remains keyboard usable. Performance: fast. Window.alert is forbidden. A global spinner or modal is forbidden. A pointer trap is forbidden. Unbounded polling and retry loops are forbidden. Usable while waiting: catalog navigation and the cancel control remain usable and must not be disabled. Injected slow/down proof: a forced dependency timeout test at most 2 seconds, measured by a focused timer, proves both controls stay responsive and records the bounded recovery receipt. Observability: bounded classes only.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);

    expect(codes).toContain("performance_budget_missing");
  });

  it("rejects later prose that weakens the structured performance contract", () => {
    for (const contradiction of [
      "The deadline is not enforced.",
      "The timer test is skipped.",
      "This budget is aspirational only.",
      "The request may take arbitrarily long in recovery.",
      "The deadline will be disabled after deployment.",
    ]) {
      const task = validFinalTask().replace(
        "- Observability:",
        `${contradiction}\n- Observability:`,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        contradiction,
      ).toContain("performance_contract_conflict");
    }
  });

  it("rejects double-negative no-wedge clauses", () => {
    const codes = validateLinearAgentTask(
      validFinalTask({
        "UX, accessibility, localization, degraded states, performance, and observability":
          "Locale matrix: Not applicable — this remediation changes no rendered copy. The degraded state remains keyboard usable. Performance: request deadline is 2 seconds with bounded cancellation. No window.alert is forbidden. No global spinner or modal is forbidden. No pointer trap is forbidden. Unrelated controls remain usable and must not be disabled. Observability is bounded.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "no_wedge_contract",
        "no_wedge_positive_conflict",
      ]),
    );
  });

  it("binds no-wedge polarity to exact enum fields", () => {
    const allowedWording = validFinalTask();
    expect(
      validateLinearAgentTask(allowedWording, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).not.toEqual(
      expect.arrayContaining([
        "no_wedge_contract",
        "no_wedge_positive_conflict",
      ]),
    );

    const contradictory = validateLinearAgentTask(
      validFinalTask()
        .replace("- Blocking alerts: forbidden", "- Blocking alerts: allowed")
        .replace("- Pointer trap: forbidden", "- Pointer trap: permitted")
        .replace(
          "- Unbounded polling/retry: forbidden",
          "- Unbounded polling/retry: acceptable",
        )
        .replace(
          "- Wait-safe controls: `catalog navigation`; `cancel control` — both remain usable and enabled during every wait.",
          "- Wait-safe controls: `catalog navigation`; `cancel control` — both may be disabled during every wait.",
        ),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(contradictory).toContain("no_wedge_contract");
  });

  it("rejects active permissions, anti-prohibitions, and incomplete no-wedge receipts", () => {
    const antiProhibition = validFinalTask().replace(
      "- Observability:",
      "Do not prohibit alerts. Do not prohibit a global spinner or modal. Do not prohibit pointer traps. Do not prohibit unbounded polling and retry loops.\n- Observability:",
    );
    expect(
      validateLinearAgentTask(antiProhibition, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toEqual(expect.arrayContaining(["no_wedge_positive_conflict"]));

    const activePermission = validFinalTask().replace(
      "- Observability:",
      "The interface allows window.alert, keeps pointer traps enabled, and treats unbounded polling loops as acceptable.\n- Observability:",
    );
    expect(
      validateLinearAgentTask(activePermission, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("no_wedge_positive_conflict");

    for (const replacement of [
      "- Wait-safe controls: `cancel control` — both remain usable and enabled during every wait.",
      "- Wait-safe controls: no concrete controls remain usable and enabled during every wait.",
      "- Slow/down proof: VER-02 — a forced timeout test.",
    ]) {
      const task = replacement.startsWith("- Wait-safe")
        ? validFinalTask().replace(/^- Wait-safe controls:.*$/m, replacement)
        : validFinalTask().replace(/^- Slow\/down proof:.*$/m, replacement);
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
      ).toContain("no_wedge_contract");
    }
  });

  it("rejects scoped hazard exceptions, disabled controls, and negated slow proof", () => {
    for (const scopedProhibition of [
      "Window.alert is forbidden except during recovery. A global spinner or modal is forbidden. A pointer trap is forbidden. Unbounded polling and retry loops are forbidden.",
      "Window.alert is forbidden where possible. A global spinner or modal is forbidden. A pointer trap is forbidden. Unbounded polling and retry loops are forbidden.",
      "Window.alert is forbidden only in tests. A global spinner or modal is forbidden. A pointer trap is forbidden. Unbounded polling and retry loops are forbidden.",
      "Window.alert is forbidden by default. A global spinner or modal is forbidden. A pointer trap is forbidden. Unbounded polling and retry loops are forbidden.",
      "Window.alert will be enabled during recovery.",
      "A pointer trap will be used during recovery.",
      "A global spinner is required during recovery.",
      "Unbounded polling loops become acceptable during recovery.",
    ]) {
      const task = validFinalTask().replace(
        "- Observability:",
        `${scopedProhibition}\n- Observability:`,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
      ).toContain("no_wedge_positive_conflict");
    }

    const disabledControls = validFinalTask().replace(
      "both remain usable and enabled during every wait",
      "both become noninteractive during every wait",
    );
    expect(
      validateLinearAgentTask(disabledControls, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("no_wedge_contract");

    const negatedSlowProof = validFinalTask().replace(
      "injected `dependency timeout` asserts `catalog navigation` and `cancel control` remain responsive and records a bounded `recovery` receipt",
      "injected `dependency timeout` does not assert `catalog navigation` and `cancel control` remain responsive and records no `recovery` receipt",
    );
    expect(
      validateLinearAgentTask(negatedSlowProof, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("no_wedge_contract");

    const skippedSlowProof = validFinalTask().replace(
      "records a bounded `recovery` receipt.",
      "records a bounded `recovery` receipt, but the assertion is skipped and no receipt exists.",
    );
    expect(
      validateLinearAgentTask(skippedSlowProof, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("no_wedge_contract");
  });

  it("requires decision spikes to own a concrete canon target", () => {
    const codes = validateLinearAgentTask(
      validFinalTask({
        "Execution metadata": metadataWith({
          "Issue kind": "decision_spike",
          "User-facing": "no",
          "Live deployment required": "no",
          "Direct production-state mutation": "no",
          Touches: "repository, server",
        }),
        "AI execution directive":
          "Run a time-bounded evidence decision, update canon, define the reopen signal, and ship no production behavior.",
        "Exact vertical scope, target files, and caller inventory":
          "Inspect `apps/web/src/server/public-surface-indexing-policy.ts` only.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);

    expect(codes).toContain("decision_touches");
    expect(codes).toContain("decision_canon_target");
  });

  it("keeps pending authorization in Failure gates and rejects negative approved receipts", () => {
    const pendingTask = `${validFinalTask({
      "Execution metadata": metadataWith({
        "Authorization status": "pending",
      }),
    })}\n\n# Open maintainer authorization gates\n\n- Authorization status: pending\n- Gate: bounded provider mutation.\n- Required approval artifact: read-only plan with environment and digest.\n- Approval receipt: pending.\n- Work allowed before approval: read-only classification.\n- Work forbidden before approval: provider mutation.\n- Stop/read-back condition: drift or mismatch.`;
    const pendingCodes = validateLinearAgentTask(pendingTask, {
      checkRepositoryPathsAtBaseline: false,
    }).errors.map((error) => error.code);
    expect(pendingCodes).toContain("authorization_pending_failure_gate");

    const approvedTask = pendingTask
      .replace(
        "Authorization status: `pending`",
        "Authorization status: `approved`",
      )
      .replace(
        "Authorization status: pending",
        "Authorization status: approved",
      )
      .replace(
        "Approval receipt: pending.",
        "Approval receipt: pending and not approved; maintainer, approved scope, timestamp 2026-07-26, environment production.",
      );
    const approvedCodes = validateLinearAgentTask(approvedTask, {
      checkRepositoryPathsAtBaseline: false,
    }).errors.map((error) => error.code);
    expect(approvedCodes).toContain("authorization_approved_negative_receipt");
  });

  it("requires real research context for user-facing work", () => {
    const metadata = validFinalTask()
      .match(/# Execution metadata\n\n([\s\S]*?)\n\n# User/)?.[1]
      ?.replace("User-facing: `no`", "User-facing: `yes`");
    const report = validateLinearAgentTask(
      validFinalTask({ "Execution metadata": metadata ?? "" }),
    );

    expect(report.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "product_research_gate",
        "product_research_count",
      ]),
    );
  });

  it.each(["&&", "||", "|", ";", "&"])(
    "validates every executable after the %s shell operator",
    (operator) => {
      const verification =
        validFinalTask()
          .match(
            /# Verification commands and required evidence\n\n([\s\S]*?)\n\n# Delivery/,
          )?.[1]
          ?.replace(
            "pnpm exec vitest run src/server/public-surface-indexing-policy.test.ts",
            `pnpm exec vitest run src/server/public-surface-indexing-policy.test.ts ${operator} definitely-missing-proof-tool`,
          ) ?? "";
      const codes = validateLinearAgentTask(
        validFinalTask({
          "Verification commands and required evidence": verification,
        }),
        { checkRepositoryPathsAtBaseline: false },
      ).errors.map((error) => error.code);

      expect(codes).toContain("verification_executable_missing");
    },
  );

  it("does not misparse standard stderr redirection as a hidden command", () => {
    const verification =
      validFinalTask()
        .match(
          /# Verification commands and required evidence\n\n([\s\S]*?)\n\n# Delivery/,
        )?.[1]
        ?.replace("pnpm lint", "pnpm lint 2>&1") ?? "";
    const codes = validateLinearAgentTask(
      validFinalTask({
        "Verification commands and required evidence": verification,
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);

    expect(codes).not.toContain("verification_executable_missing");
  });

  it("rejects ls/pwd/date-only proof and aggregate git-status-only repository suites", () => {
    const verification =
      validFinalTask()
        .match(
          /# Verification commands and required evidence\n\n([\s\S]*?)\n\n# Delivery/,
        )?.[1]
        ?.replace(/```bash[\s\S]*?```/g, "```bash\nls; pwd; date\n```") ?? "";
    const noOpCodes = validateLinearAgentTask(
      validFinalTask({
        "Verification commands and required evidence": verification,
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(noOpCodes).toContain("verification_command_noop");

    const gitOnlyCodes = validateLinearAgentTask(
      validFinalTask({
        "Verification commands and required evidence": verification.replace(
          "ls; pwd; date",
          "git status",
        ),
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(gitOnlyCodes).toContain("verification_command_noop");
    expect(gitOnlyCodes).toContain("repository_verification_family_missing");

    const oneFakeVerification =
      validFinalTask()
        .match(
          /# Verification commands and required evidence\n\n([\s\S]*?)\n\n# Delivery/,
        )?.[1]
        ?.replace(
          "cd apps/web\npnpm exec vitest run src/server/public-surface-indexing-policy.test.ts",
          "git status --short",
        ) ?? "";
    const oneFakeCodes = validateLinearAgentTask(
      validFinalTask({
        "Verification commands and required evidence": oneFakeVerification,
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(oneFakeCodes).toContain("verification_command_noop");

    const fakeFocusedVerification =
      validFinalTask()
        .match(
          /# Verification commands and required evidence\n\n([\s\S]*?)\n\n# Delivery/,
        )?.[1]
        ?.replaceAll(
          "src/server/public-surface-indexing-policy.test.ts",
          "fake/directory",
        )
        .replaceAll(
          "scripts/check-linear-agent-task.test.ts",
          "fake/other-directory",
        ) ?? "";
    const fakeFocusedCodes = validateLinearAgentTask(
      validFinalTask({
        "Verification commands and required evidence": fakeFocusedVerification,
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(fakeFocusedCodes).toContain(
      "repository_verification_family_missing",
    );
  });

  it("rejects hazardous commands in any fenced section, including chained SQL/shell", () => {
    const codes = validateLinearAgentTask(
      validFinalTask({
        "Root cause or proof gap": [
          "The closest regression proof gap is the server boundary; mismatch stops implementation.",
          "```sql",
          "SELECT 1; DROP TABLE users;",
          "```",
          "```bash",
          "pnpm lint && rm -rf $HOME",
          "```",
        ].join("\n"),
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);

    expect(codes).toContain("hazardous_verification_command");
  });

  it("tracks command cwd, accepts correct service cwd, and rejects missing/escaping cwd paths", () => {
    const baseVerification =
      validFinalTask().match(
        /# Verification commands and required evidence\n\n([\s\S]*?)\n\n# Delivery/,
      )?.[1] ?? "";
    const validService = baseVerification.replace(
      "cd apps/web\npnpm exec vitest run src/server/public-surface-indexing-policy.test.ts",
      "cd services/matching\nuv run --frozen pytest tests/test_canary.py",
    );
    const validCodes = validateLinearAgentTask(
      validFinalTask({
        "Verification commands and required evidence": validService,
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(validCodes).not.toContain("verification_path_missing");

    const wrongCwdCodes = validateLinearAgentTask(
      validFinalTask({
        "Verification commands and required evidence": baseVerification.replace(
          "cd apps/web",
          "cd services/matching",
        ),
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(wrongCwdCodes).toContain("verification_path_missing");

    const escapeCodes = validateLinearAgentTask(
      validFinalTask({
        "Verification commands and required evidence": baseVerification.replace(
          "cd apps/web",
          "cd ../../..",
        ),
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(escapeCodes).toContain("verification_cwd_escape");
  });

  it("supports repository path:line and path:symbol locators without hiding missing paths", () => {
    const locatedTask = validFinalTask({
      "Required context":
        validFinalTask()
          .match(/# Required context\n\n([\s\S]*)$/)?.[1]
          ?.replace(
            "apps/web/src/server/public-surface-indexing-policy.ts",
            "apps/web/src/server/public-surface-indexing-policy.ts:PUBLIC_SURFACE_INDEXING_POLICY",
          ) ?? "",
      "Exact vertical scope, target files, and caller inventory":
        "Inspect `apps/web/src/server/public-surface-indexing-policy.ts:42:7` and `apps/web/src/server/public-surface-indexing-policy.ts:resolvePublicSurface`; change the bounded caller only.",
    });
    const locatedCodes = validateLinearAgentTask(locatedTask, {
      checkRepositoryPathsAtBaseline: false,
    }).errors.map((error) => error.code);
    expect(locatedCodes).not.toEqual(
      expect.arrayContaining(["context_path_missing", "target_path_missing"]),
    );

    const missingCodes = validateLinearAgentTask(
      locatedTask.replace(
        "apps/web/src/server/public-surface-indexing-policy.ts:resolvePublicSurface",
        "apps/web/src/server/not-real.ts:resolvePublicSurface",
      ),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(missingCodes).toContain("target_path_missing");
  });

  it("rejects multiple or conflicting pinned baseline SHAs", () => {
    const codes = validateLinearAgentTask(
      validFinalTask({
        "Pinned baseline, reproduction, evidence, and counterevidence": `Baseline ${baselineSha}. Audit baseline aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa. Confirmed evidence: exact caller reproduction. Counterevidence: a bounded success stops work. Not proved: live behavior remains unclaimed.`,
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);

    expect(codes).toContain("pinned_baseline_mismatch");
  });

  it("requires row-valid INV-to-AC-to-VER fault mappings and covers every VER", () => {
    const malformed = validFinalTask()
      .match(
        /# Required test and fault matrix\n\n([\s\S]*?)\n\n# Verification commands and required evidence/,
      )?.[1]
      ?.replace("| INV-01 | AC-01 | VER-01 |", "| INV-01 | AC-03 | VER-01 |")
      .replaceAll("VER-03", "VER-02");
    const codes = validateLinearAgentTask(
      validFinalTask({ "Required test and fault matrix": malformed ?? "" }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);

    expect(codes).toContain("fault_matrix_row_mapping");
    expect(codes).toContain("fault_matrix_verification_missing");
  });

  it("rejects negative/open product, evidence, external-system, and auth semantics", () => {
    const productCodes = validateLinearAgentTask(
      validFinalTask({
        "Product thinking and falsification":
          "Protected outcome: unknown. Load-bearing assumption: missing. Falsification signal: unavailable.",
        "Pinned baseline, reproduction, evidence, and counterevidence": `Baseline ${baselineSha}. Confirmed evidence: unavailable. Counterevidence: unknown. Not proved: missing.`,
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(productCodes).toEqual(
      expect.arrayContaining([
        "product_outcome_concrete",
        "product_assumption_concrete",
        "product_falsification_concrete",
        "confirmed_evidence_concrete",
      ]),
    );

    const externalCodes = validateLinearAgentTask(
      validFinalTask({
        "Execution metadata": metadataWith({
          "External systems": "Cloudflare R2",
        }),
        "Ordered implementation plan":
          "Official API unavailable; capability unknown; operation is non-idempotent; read-back absent; rollback impossible.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(externalCodes).toContain("external_system_contract");

    const authCodes = validateLinearAgentTask(
      validFinalTask({
        "Execution metadata": metadataWith({
          "Sensitive boundaries": "auth",
        }),
        "Exact data, state, protocol, and concurrency contract":
          "Enumeration unknown; rotation forbidden; session unavailable; evidence is not redacted; official API absent.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(authCodes).toEqual(
      expect.arrayContaining([
        "auth_secret_contract",
        "auth_official_source_contract",
      ]),
    );
  });

  it.each(["slow", "stalled", "unresponsive", "janky", "pause", "wedged"])(
    "activates performance and no-wedge gates for UX-only `%s` wording",
    (term) => {
      const acceptance =
        validFinalTask()
          .match(
            /# Measurable acceptance criteria\n\n([\s\S]*?)\n\n# Required test and fault matrix/,
          )?.[1]
          ?.replace("within 2 seconds", "before its finite deadline") ?? "";
      const codes = validateLinearAgentTask(
        validFinalTask({
          "Measurable acceptance criteria": acceptance,
          "UX, accessibility, localization, degraded states, performance, and observability": `Locale matrix: Not applicable — no locale behavior changes. Keyboard degraded state remains named. Performance: ${term}. Alerts, a global spinner, pointer traps, and unrelated-control disablement are allowed. Observability remains named.`,
        }),
        { checkRepositoryPathsAtBaseline: false },
      ).errors.map((error) => error.code);
      expect(codes).toContain("performance_budget_missing");
      expect(codes).toContain("no_wedge_contract");
      expect(codes).toContain("no_wedge_positive_conflict");
    },
  );

  it("requires a concrete decision docs target, not generic docs prose", () => {
    const codes = validateLinearAgentTask(
      validFinalTask({
        "Execution metadata": metadataWith({
          "Issue kind": "decision_spike",
          "User-facing": "no",
          "Live deployment required": "no",
          "Direct production-state mutation": "no",
          Touches: "repository, docs",
        }),
        "AI execution directive":
          "Run a time-bounded evidence decision, update canon, define the reopen signal, and ship no production behavior.",
        "Exact vertical scope, target files, and caller inventory":
          "Record the selected canon somewhere under docs/ after selection.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);

    expect(codes).toContain("decision_canon_target");
  });

  it("enforces exact locale tokens rather than substring or superset matches", () => {
    const metadata = metadataWith({
      "User-facing": "yes",
      "Locale scope": "shared",
    });
    for (const matrix of [
      "Locale matrix: ukulele, bgp, runtime.",
      "Locale matrix: `uk`, `bg`, `ru`, `en`.",
    ]) {
      const codes = validateLinearAgentTask(
        validFinalTask({
          "Execution metadata": metadata,
          "UX, accessibility, localization, degraded states, performance, and observability": `${matrix} Keyboard degraded behavior is specified. Performance: 2 seconds with deadline, bounded cancellation. No alerts are allowed; no global spinner is allowed; no pointer trap is allowed; unrelated controls remain usable and must not be disabled. Observability is bounded.`,
        }),
        { checkRepositoryPathsAtBaseline: false },
      ).errors.map((error) => error.code);
      expect(codes).toContain("locale_matrix_contract");
    }
  });

  it("rejects coordination metadata drift and keyword-only child prose", () => {
    const codes = validateLinearAgentTask(
      validFinalTask({
        "Execution metadata": metadataWith({
          "Issue kind": "coordination_container",
          "Repository change": "no",
          Touches: "coordination, server",
          "Sensitive boundaries": "user-data",
          "External systems": "Linear",
        }),
        "AI execution directive":
          "This non-executable container is never assigned; it names child, acyclic, and integration concepts only.",
        "Dependencies, ownership boundaries, relations, and non-goals":
          "Child work is independently executable; integration is acyclic, but identifiers will be selected later.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "coordination_touches",
        "coordination_sensitive_boundaries",
        "coordination_external_systems",
        "coordination_child_inventory",
      ]),
    );
  });

  it("rejects no-repository local proof, version-only external proof, provider mismatch, and positive PR delivery", () => {
    const verification =
      validFinalTask()
        .match(
          /# Verification commands and required evidence\n\n([\s\S]*?)\n\n# Delivery/,
        )?.[1]
        ?.replace(
          "Command status: existing",
          "Command status: external_readback",
        )
        .replace(
          "cd apps/web\npnpm exec vitest run src/server/public-surface-indexing-policy.test.ts",
          "gh --version\n# Authenticated AWS read-back: get bucket state for bucket-x",
        ) ?? "";
    const codes = validateLinearAgentTask(
      validFinalTask({
        "Execution metadata": metadataWith({
          "Issue kind": "operator_execution",
          "Repository change": "no",
          Touches: "infrastructure",
          "External systems": "Cloudflare R2",
        }),
        "Verification commands and required evidence": verification,
        "Delivery, exact-SHA proof, and Linear closeout":
          "Create branch codex/ove-999-proof, commit the receipt, and open a PR. Also declare no-repository-delta, immutable receipt, environment, read-back, rollback, cleanup, and SHA-256.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "external_readback_operation_missing",
        "external_readback_annotation_invalid",
        "no_repository_verification_status",
        "no_repository_delivery_mutation",
      ]),
    );
  });

  it("rejects negated repository and no-repository delivery proof", () => {
    const repositoryCodes = validateLinearAgentTask(
      validFinalTask({
        "Delivery, exact-SHA proof, and Linear closeout":
          "Start from current main on `codex/ove-999-negative-proof`. Never use a Conventional Commit; do not open a PR; do not run `git merge-base --is-ancestor $OVE999_IMPLEMENTATION_SHA origin/main`; never run `pnpm mainline:closeout:check`. Do not perform the final Linear read-back or compare the saved-description SHA-256.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(repositoryCodes).toContain("delivery_weakened_obligation");

    const noRepositoryCodes = validateLinearAgentTask(
      validFinalTask({
        "Execution metadata": metadataWith({
          "Issue kind": "operator_execution",
          "Repository change": "no",
          "User-facing": "no",
          Touches: "infrastructure",
          "External systems": "DigitalOcean API",
        }),
        "Delivery, exact-SHA proof, and Linear closeout":
          "Declare no-repository-delta at baseline. Perform the final Linear read-back and compare the saved-description SHA-256. No immutable provider receipt, environment identity, rollback result, or cleanup result is recorded.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(noRepositoryCodes).toEqual(
      expect.arrayContaining([
        "delivery_contract",
        "delivery_weakened_obligation",
      ]),
    );
  });

  it("rejects conditional or optional delivery obligations for every path", () => {
    const weakenedRepository = validateLinearAgentTask(
      validFinalTask({
        "Delivery, exact-SHA proof, and Linear closeout":
          'Start from current main on `codex/ove-999-weakened-proof`. Use a Conventional Commit if convenient, optionally push and open a PR, and run exact-head checks if available. Before merge, record `OVE999_IMPLEMENTATION_SHA=$(git rev-parse HEAD)` in the redacted receipt. Merge without bypass if convenient. After merge, run `git merge-base --is-ancestor "$OVE999_IMPLEMENTATION_SHA" origin/main` optionally and run `pnpm mainline:closeout:check` if available. Perform the final Linear read-back if available and compare SHA-256 optionally.',
      }),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(weakenedRepository).toContain("delivery_weakened_obligation");

    const weakenedNoRepository = validExternalOperatorTask().replace(
      /# Delivery, exact-SHA proof, and Linear closeout\n\n[\s\S]*?\n\n# Failure gates/,
      [
        "# Delivery, exact-SHA proof, and Linear closeout",
        "",
        "Declare no-repository-delta if convenient and create no branch, commit, or PR unless necessary. Record the environment class, immutable provider receipt, rollback result, cleanup result, and final Linear read-back if available. Compare SHA-256 optionally.",
        "",
        "# Failure gates",
      ].join("\n"),
    );
    expect(
      validateLinearAgentTask(weakenedNoRepository, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("delivery_weakened_obligation");

    const weakenedCoordination = validCoordinationContainerTask().replace(
      /# Delivery, exact-SHA proof, and Linear closeout\n\n[\s\S]*?\n\n# Failure gates/,
      [
        "# Delivery, exact-SHA proof, and Linear closeout",
        "",
        "Remain unassigned and outside In Progress. Create no branch, commit, PR, or provider effect. Perform the final Linear read-back of the child identifier if available, do not prove the DAG is acyclic, do not verify the child independently Done, optionally record the integration acceptance receipt, compare SHA-256, and skip terminal closeout.",
        "",
        "# Failure gates",
      ].join("\n"),
    );
    expect(
      validateLinearAgentTask(weakenedCoordination, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("delivery_weakened_obligation");
  });

  it("rejects section-level discretionary delivery scope for every path", () => {
    for (const task of [
      validFinalTask(),
      validExternalOperatorTask(),
      validCoordinationContainerTask(),
    ]) {
      const weakened = task.replace(
        "# Delivery, exact-SHA proof, and Linear closeout\n\n",
        "# Delivery, exact-SHA proof, and Linear closeout\n\nAll following delivery steps are discretionary. ",
      );
      expect(
        validateLinearAgentTask(weakened, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
      ).toContain("delivery_weakened_obligation");
    }
  });

  it("rejects negated branch/read-back and non-HEAD or premature SHA capture", () => {
    const baselineDelivery =
      validFinalTask().match(
        /# Delivery, exact-SHA proof, and Linear closeout\n\n([\s\S]*?)\n\n# Failure gates/,
      )?.[1] ?? "";

    const negatedBranch = validFinalTask({
      "Delivery, exact-SHA proof, and Linear closeout":
        baselineDelivery.replace(
          "Start from current main on `codex/ove-999-bounded-request`",
          "Never start or work on `codex/ove-999-bounded-request`",
        ),
    });
    expect(
      validateLinearAgentTask(negatedBranch, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("delivery_weakened_obligation");

    const staleCapture = validFinalTask({
      "Delivery, exact-SHA proof, and Linear closeout":
        baselineDelivery.replace(
          "$(git rev-parse HEAD)",
          "$(git rev-parse HEAD~1)",
        ),
    });
    expect(
      validateLinearAgentTask(staleCapture, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("delivery_sha_capture");

    const prematureCapture = validFinalTask({
      "Delivery, exact-SHA proof, and Linear closeout":
        'Record `OVE999_IMPLEMENTATION_SHA=$(git rev-parse HEAD)` first. Start from current main on `codex/ove-999-bounded-request`. Use a Conventional Commit, push, open a PR, and run exact-head checks. Merge without bypass. After merge, run `git merge-base --is-ancestor "$OVE999_IMPLEMENTATION_SHA" origin/main` and `cd apps/web && pnpm mainline:closeout:check`. Perform the final Linear read-back and compare the saved body SHA-256 before Done.',
    });
    expect(
      validateLinearAgentTask(prematureCapture, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("delivery_sha_capture");

    const negatedReadBack = validFinalTask({
      "Delivery, exact-SHA proof, and Linear closeout":
        baselineDelivery.replace(
          "Perform the final Linear read-back",
          "Fail to perform the final Linear read-back",
        ),
    });
    expect(
      validateLinearAgentTask(negatedReadBack, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("delivery_weakened_obligation");
  });

  it("requires zero repository artifacts and rejects mutation synonyms", () => {
    const missingZeroArtifacts = validExternalOperatorTask().replace(
      " and create no branch, commit, PR, deployment, or provider effect",
      "",
    );
    expect(
      validateLinearAgentTask(missingZeroArtifacts, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("delivery_contract");

    for (const mutation of [
      "Submit a pull request containing the receipt.",
      "Raise a PR containing the receipt.",
      "Land the receipt as a commit.",
      "Publish a feature branch.",
      "Cut a branch for the receipt.",
    ]) {
      const task = validExternalOperatorTask().replace(
        "Compare the saved-description SHA-256 before Done.",
        `Compare the saved-description SHA-256 before Done. ${mutation}`,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
      ).toContain("no_repository_delivery_mutation");
    }
  });

  it("requires the exact external-state no-delta delivery wording", () => {
    const task = validExternalOperatorTask().replace(
      "Declare no-repository-delta at baseline and create no branch, commit, PR, deployment, or provider effect. Record the exact environment class, official capability response class, immutable redacted receipt",
      "Record no-repository-delta at baseline and create no branch, commit, PR, deployment, or provider effect. Record the exact environment class, official capability response class, immutable redacted receipt",
    );
    expect(
      validateLinearAgentTask(task, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("delivery_exact_contract");
  });

  it("rejects a separately negated no-repository receipt obligation", () => {
    const task = validExternalOperatorTask().replace(
      "Compare the saved-description SHA-256 before Done.",
      "Compare the saved-description SHA-256 before Done. Do not retain the provider receipt after closeout.",
    );

    expect(
      validateLinearAgentTask(task, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("delivery_weakened_obligation");
  });

  it("rejects executable polarity in coordination delivery", () => {
    const task = validCoordinationContainerTask().replace(
      /# Delivery, exact-SHA proof, and Linear closeout\n\n[\s\S]*?\n\n# Failure gates/,
      [
        "# Delivery, exact-SHA proof, and Linear closeout",
        "",
        "Never remain unassigned and enter `In Progress`. No branch exists. Perform the final Linear read-back of the complete child identifier OVE-1000, prove the OVE-999 DAG is acyclic and the child independently Done, record the integration acceptance receipt, compare the saved-description SHA-256, and move OVE-999 through terminal closeout.",
        "",
        "# Failure gates",
      ].join("\n"),
    );
    const codes = validateLinearAgentTask(task, {
      checkRepositoryPathsAtBaseline: false,
    }).errors.map((error) => error.code);

    expect(codes).toContain("delivery_polarity_conflict");
  });

  it("validates approved authorization receipt fields, digest provenance, and non-future timestamp", () => {
    const digest = "a".repeat(64);
    const base = `${validFinalTask({
      "Execution metadata": metadataWith({
        "Authorization status": "approved",
      }),
    })}\n\n# Open maintainer authorization gates\n\n- Authorization status: approved\n- Gate: bounded production apply.\n- Required approval artifact: immutable reviewed plan sha256:${digest}.\n- Approval receipt: maintainer: Yehor; approved scope: apply plan OVE-999; timestamp: 2026-07-25T10:00:00Z; environment: production cluster db-123; provenance: Linear approval comment OVE-999; sha256:${digest}.\n- Work allowed before approval: read-only classification.\n- Work forbidden before approval: out-of-scope mutation.\n- Stop/read-back condition: drift or digest mismatch.`;
    const validCodes = validateLinearAgentTask(base, {
      checkRepositoryPathsAtBaseline: false,
    }).errors.map((error) => error.code);
    expect(validCodes).not.toEqual(
      expect.arrayContaining([
        "authorization_approved_receipt",
        "authorization_timestamp_invalid",
        "authorization_digest_missing",
        "authorization_artifact_digest_missing",
        "authorization_digest_mismatch",
      ]),
    );

    const invalidCodes = validateLinearAgentTask(
      base
        .replace("maintainer: Yehor", "maintainer: unknown")
        .replace("2026-07-25T10:00:00Z", "2999-01-01T00:00:00Z")
        .replace(`; sha256:${digest}`, ""),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(invalidCodes).toEqual(
      expect.arrayContaining([
        "authorization_approved_negative_receipt",
        "authorization_approved_receipt",
        "authorization_timestamp_invalid",
        "authorization_digest_missing",
      ]),
    );
    const mismatchedDigestCodes = validateLinearAgentTask(
      base.replace(
        `Required approval artifact: immutable reviewed plan sha256:${digest}.`,
        `Required approval artifact: immutable reviewed plan sha256:${"b".repeat(64)}.`,
      ),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(mismatchedDigestCodes).toContain("authorization_digest_mismatch");
    const invalidCalendarCodes = validateLinearAgentTask(
      base.replace("2026-07-25T10:00:00Z", "2026-02-30T10:00:00Z"),
      { checkRepositoryPathsAtBaseline: false },
    ).errors.map((error) => error.code);
    expect(invalidCalendarCodes).toContain("authorization_timestamp_invalid");
  });

  it("requires user-facing Product Thinking citations to equal and explain Required context", () => {
    const source = validVerticalExecutionTask();
    const variants = [
      source.replace(
        /`docs\/product-research\/overgarden-living-journals\.md` constrains[^.]+\. `docs\/product-research\/OverGarden_PAGE_ARCHITECTURE_v1\.md` constrains[^.]+\./,
        "The generic research corpus informs the interaction.",
      ),
      source.replace(
        / `docs\/product-research\/OverGarden_PAGE_ARCHITECTURE_v1\.md` constrains[^.]+\./,
        "",
      ),
      source.replace(
        "`docs/product-research/overgarden-living-journals.md` constrains the task to a durable journal-linked saved object rather than a detached engagement counter",
        "`docs/product-research/overgarden-living-journals.md` constrains nothing material in this task",
      ),
    ];

    for (const task of variants) {
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
      ).toContain("user_facing_product_research_resolution");
    }
  });

  it("rejects full-contract Product Thinking polarity contradictions", () => {
    for (const contradiction of [
      "This wishlist work has no direct product-research dependency.",
      "Every cited research constraint is invalid and ignored by implementation.",
      "The cited product-research constraints are nonbinding guidance.",
    ]) {
      const task = validVerticalExecutionTask().replace(
        "No schema migration or backfill is authorized",
        `${contradiction} No schema migration or backfill is authorized`,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        contradiction,
      ).toContain("user_facing_product_research_resolution");
    }
  });

  it("rejects vacuous research explanations and deferred no-direct conclusions", () => {
    const researchPath =
      "docs/product-research/OverGarden_B2_METRICS_INSTRUMENTATION_v1.md";
    const vacuous = validFinalTask({
      "Product thinking and falsification": `- Product-research branch: constrained\nProtected outcome: bounded journal access. \`${researchPath}\` constrains nothing material in this task. The load-bearing assumption is that the server boundary owns the failure. Falsification signal: counterevidence at current main stops implementation and reopens diagnosis.`,
      "Required context": `${
        validFinalTask().match(/# Required context\n\n([\s\S]*?)$/)?.[1] ?? ""
      }\n- \`${researchPath}\``,
    });
    expect(
      validateLinearAgentTask(vacuous, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("non_user_product_research_resolution");

    const baselineProductThinking =
      validFinalTask().match(
        /# Product thinking and falsification\n\n([\s\S]*?)\n\n# Pinned baseline/,
      )?.[1] ?? "";
    for (const deferral of [
      "However, the implementing agent must select research later.",
      "This conclusion applies only until discovery is completed.",
      "For now, a future research audit will decide applicability.",
      "Product-research applicability remains undecided.",
      "Applicable product-research must be cited by the assignee.",
      "Research must still be selected before implementation.",
      "A product-research audit is still required before work starts.",
      "It is false that this remediation has no direct product-research dependency.",
    ]) {
      const task = validFinalTask({
        "Product thinking and falsification": `${baselineProductThinking} ${deferral}`,
      });
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        deferral,
      ).toContain("non_user_product_research_resolution");
    }
  });

  it("requires structured UX contract fields to be real Markdown bullets outside code", () => {
    const ux =
      validFinalTask().match(
        /# UX, accessibility, localization, degraded states, performance, and observability\n\n([\s\S]*?)\n\n# Migration/,
      )?.[1] ?? "";
    const lines = ux.split("\n");
    const firstBullet = lines.findIndex((line) => line.startsWith("- "));
    const fenced = [
      ...lines.slice(0, firstBullet),
      "```text",
      ...lines.slice(firstBullet),
      "```",
    ].join("\n");
    const indented = lines
      .map((line) => (line.startsWith("- ") ? `    ${line}` : line))
      .join("\n");

    for (const structuredInCode of [fenced, indented]) {
      const codes = validateLinearAgentTask(
        validFinalTask({
          "UX, accessibility, localization, degraded states, performance, and observability":
            structuredInCode,
        }),
        { checkRepositoryPathsAtBaseline: false },
      ).errors.map((error) => error.code);
      expect(codes).toEqual(
        expect.arrayContaining([
          "performance_structured_fields",
          "no_wedge_contract",
        ]),
      );
    }
  });

  it("rejects non-operative whole sections, indented matrices, and raw HTML wrappers", () => {
    for (const heading of REQUIRED_LINEAR_TASK_HEADINGS) {
      const source = validFinalTask();
      const nextHeading =
        REQUIRED_LINEAR_TASK_HEADINGS[
          REQUIRED_LINEAR_TASK_HEADINGS.indexOf(heading) + 1
        ];
      const sectionPattern = nextHeading
        ? new RegExp(
            `(# ${heading.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\n\\n)([\\s\\S]*?)(\\n\\n# ${nextHeading.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")})`,
          )
        : new RegExp(
            `(# ${heading.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\n\\n)([\\s\\S]*)$`,
          );
      const quoted = source.replace(
        sectionPattern,
        (_match, prefix: string, body: string, suffix = "") =>
          `${prefix}${body
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n")}${suffix}`,
      );
      expect(
        validateLinearAgentTask(quoted, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        heading,
      ).toContain("section_operativity");
    }

    const indentedMatrix = validFinalTask().replace(
      /(# Required test and fault matrix\n\n)([\s\S]*?)(\n\n# Verification commands)/,
      (_match, prefix: string, body: string, suffix: string) =>
        `${prefix}${body
          .split("\n")
          .map((line) => `    ${line}`)
          .join("\n")}${suffix}`,
    );
    expect(
      validateLinearAgentTask(indentedMatrix, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toEqual(
      expect.arrayContaining([
        "section_operativity",
        "fault_matrix_table_missing",
      ]),
    );

    for (const [open, close] of [
      ["<script>", "</script>"],
      ["<style>", "</style>"],
      ["<textarea>", "</textarea>"],
      ["<div>", "</div>"],
      ["<!--", "-->"],
      ["<?hidden", "?>"],
      ["<![CDATA[", "]]>"],
      ["<!HIDDEN", ">"],
    ]) {
      const wrapped = `${open}\n${validFinalTask()}\n${close}`;
      expect(
        validateLinearAgentTask(wrapped, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        open,
      ).toContain("raw_html_block");
    }
  });

  it.each([
    ["<custom>", "</custom>"],
    ['<span data-note=\">\">', "</span>"],
    ['<svg viewBox="0 0 1 1">', "</svg>"],
    ['<template shadowrootmode="open">', "</template>"],
    ["<math>", "</math>"],
    ["<x-hidden data-contract=required>", "</x-hidden>"],
  ])(
    "rejects arbitrary CommonMark raw HTML block wrapper %s",
    (open, close) => {
      const report = validateLinearAgentTask(
        validFinalTask({
          "Root cause or proof gap": `${open}\nThe closest enforceable boundary is the server deadline; a failing proof stops implementation.\n${close}`,
        }),
        { checkRepositoryPathsAtBaseline: false },
      );
      const codes = report.errors.map((error) => error.code);

      expect(codes).toContain("raw_html_block");
      expect(codes).toContain("section_operativity");
      expect(codes).toContain("root_boundary_contract");
    },
  );

  it("rejects invisible link-reference definitions as section contracts", () => {
    for (const definition of [
      '[root-contract]: https://linear.app/docs/creating-issues "The closest boundary is verified and disagreement stops implementation."',
      '  [root\\]]: <https://linear.app/docs/creating-issues> "The closest boundary is verified and disagreement stops implementation."',
    ]) {
      const report = validateLinearAgentTask(
        validFinalTask({ "Root cause or proof gap": definition }),
        { checkRepositoryPathsAtBaseline: false },
      );
      const codes = report.errors.map((error) => error.code);

      expect(codes).toEqual(
        expect.arrayContaining([
          "link_reference_definition",
          "section_operativity",
          "root_boundary_contract",
          "root_stop_contract",
        ]),
      );
    }
  });

  it("rejects struck directives and removes them from structured semantics", () => {
    for (const struckDirective of [
      "~~- Blocking alerts: forbidden~~",
      "~~- Blocking alerts:\nforbidden~~",
    ]) {
      const report = validateLinearAgentTask(
        validFinalTask().replace(
          "- Blocking alerts: forbidden",
          struckDirective,
        ),
        { checkRepositoryPathsAtBaseline: false },
      );
      const codes = report.errors.map((error) => error.code);

      expect(codes).toEqual(
        expect.arrayContaining([
          "gfm_strikethrough",
          "section_operativity",
          "no_wedge_contract",
        ]),
      );
    }
  });

  it("allows literal tildes in inline code and escaped prose", () => {
    const report = validateLinearAgentTask(
      validFinalTask({
        "Root cause or proof gap":
          "The closest proved gap is the server deadline; the literal `~~fixture~~` token and escaped \\~~fixture\\~~ text do not alter the stop condition.",
      }),
      { checkRepositoryPathsAtBaseline: false },
    );

    expect(report.errors.map((error) => error.code)).not.toContain(
      "gfm_strikethrough",
    );
  });

  it("ignores hidden-Markdown syntax inside a fenced verification fixture", () => {
    const report = validateLinearAgentTask(
      validFinalTask().replace(
        "```bash\ncd apps/web\npnpm exec vitest run src/server/public-surface-indexing-policy.test.ts\n```",
        "```bash\ncd apps/web\npnpm exec vitest run src/server/public-surface-indexing-policy.test.ts\n```\n```text\n<span>\n[fixture]: https://example.test\n~~non-operative fixture~~\n</span>\n```",
      ),
      { checkRepositoryPathsAtBaseline: false },
    );
    const codes = report.errors.map((error) => error.code);

    expect(codes).not.toContain("raw_html_block");
    expect(codes).not.toContain("link_reference_definition");
    expect(codes).not.toContain("gfm_strikethrough");
  });

  it("enforces PERF metric, identifier, VER ownership, and proof referential integrity", () => {
    const variants: Array<[string, string]> = [
      [
        validFinalTask().replace(
          /^- Performance measurement:.*$/m,
          "- Performance measurement: PERF-01 (`memory`) — VER-02 uses the focused memory histogram test to measure `memory`.",
        ),
        "performance_measurement_missing",
      ],
      [
        validFinalTask().replace(
          /^- Performance measurement:.*$/m,
          "- Performance measurement: PERF-01 (`request_deadline`) — VER-99 uses the focused monotonic timer test to measure `request_deadline`.",
        ),
        "performance_measurement_missing",
      ],
      [
        validFinalTask().replace(
          /^- Performance measurement:.*$/m,
          "- Performance measurement: PERF-01 (`request_deadline`) — VER-03 uses the focused monotonic timer test to measure `request_deadline`.",
        ),
        "performance_measurement_missing",
      ],
      [
        validFinalTask().replace(/PERF-01/g, "PERF-99"),
        "performance_budget_missing",
      ],
      [
        validFinalTask().replace(
          "Slow/down proof: WAIT-01 — VER-02",
          "Slow/down proof: WAIT-01 — VER-99",
        ),
        "no_wedge_contract",
      ],
      [
        validFinalTask().replace(
          "Slow/down proof: WAIT-01 — VER-02",
          "Slow/down proof: WAIT-01 — VER-01",
        ),
        "no_wedge_contract",
      ],
    ];
    for (const [task, code] of variants) {
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
      ).toContain(code);
    }
  });

  it("rejects multiple, conditional, alternative, or weakened structured performance contracts", () => {
    for (const replacement of [
      "PERF-01 (`request_deadline`) — `request_deadline` is at most 2 seconds and `memory` is at most 512 MB.",
      "PERF-01 (`request_deadline`) — `request_deadline` is at most 2 seconds except during recovery.",
      "PERF-01 (`request_deadline`) — `request_deadline` is at most 2 seconds or 200 seconds.",
      "PERF-01 (`request_deadline`) — `request_deadline` is at most 2 seconds when convenient.",
    ]) {
      const task = validFinalTask().replace(
        /^- Performance budget:.*$/m,
        `- Performance budget: ${replacement}`,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
      ).toContain("performance_budget_missing");
    }

    for (const suffix of [
      " if available",
      " but the test is not run",
      " when convenient",
    ]) {
      const task = validFinalTask().replace(
        "to measure `request_deadline`.",
        `to measure \`request_deadline\`${suffix}.`,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
      ).toContain("performance_measurement_missing");
    }
  });

  it("rejects pseudo metrics, impossible budgets, fabricated instruments, unbound targets, and threshold drift", () => {
    for (const metricKey of [
      "fake_deadline",
      "optional_request_deadline",
      "ignored_request_deadline",
      "dummy_timeout",
    ]) {
      const task = validFinalTask().replaceAll("request_deadline", metricKey);
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        metricKey,
      ).toContain("performance_budget_missing");
    }

    for (const threshold of ["0", "99999999999999"]) {
      const task = validFinalTask().replaceAll(
        "2 seconds",
        `${threshold} seconds`,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        threshold,
      ).toContain("performance_budget_missing");
    }

    for (const instrument of [
      "dummy timer test",
      "nonexistent timer test",
      "imaginary benchmark test",
      "banana timer test",
      "fictional timer test",
      "sham latency probe",
      "pretend histogram test",
      "illusory benchmark test",
    ]) {
      const task = validFinalTask().replace(
        "focused monotonic timer test",
        instrument,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        instrument,
      ).toContain("performance_measurement_missing");
    }

    const unboundTarget = validFinalTask().replace(
      "pnpm exec vitest run scripts/check-linear-agent-task.test.ts",
      "pnpm exec vitest run scripts/check-mainline-closeout.test.ts",
    );
    expect(
      validateLinearAgentTask(unboundTarget, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toEqual(
      expect.arrayContaining([
        "performance_measurement_missing",
        "no_wedge_contract",
      ]),
    );

    const commentOnlyTarget = validFinalTask().replace(
      "pnpm exec vitest run scripts/check-linear-agent-task.test.ts",
      "# scripts/check-linear-agent-task.test.ts\npnpm exec vitest run scripts/check-mainline-closeout.test.ts",
    );
    expect(
      validateLinearAgentTask(commentOnlyTarget, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toEqual(
      expect.arrayContaining([
        "performance_measurement_missing",
        "no_wedge_contract",
      ]),
    );

    for (const nonEvidenceCommand of [
      "test -f scripts/check-linear-agent-task.test.ts",
      "rg request_deadline scripts/check-linear-agent-task.test.ts",
      "grep -n request_deadline scripts/check-linear-agent-task.test.ts",
      "cat scripts/check-linear-agent-task.test.ts",
      "scripts/check-linear-agent-task.test.ts",
    ]) {
      const task = validFinalTask().replace(
        "pnpm exec vitest run scripts/check-linear-agent-task.test.ts",
        nonEvidenceCommand,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        nonEvidenceCommand,
      ).toEqual(
        expect.arrayContaining([
          "performance_measurement_missing",
          "no_wedge_contract",
        ]),
      );
    }

    const thresholdDrift = validFinalTask().replace(
      "AC-01 — PERF-01 (`request_deadline`) — `request_deadline` is at most 2 seconds",
      "AC-01 — PERF-01 (`request_deadline`) — `request_deadline` is at most 200 seconds",
    );
    expect(
      validateLinearAgentTask(thresholdDrift, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("performance_measurement_missing");

    const maximumThresholdDrift = validFinalTask().replace(
      "the bounded happy path returns once.",
      "the bounded happy path returns once; `request_deadline` has a maximum of 200 seconds.",
    );
    expect(
      validateLinearAgentTask(maximumThresholdDrift, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("performance_measurement_missing");
  });

  it("rejects generic controls and weakened or fabricated WAIT receipts", () => {
    const generic = validFinalTask()
      .replaceAll("catalog navigation", "control one")
      .replaceAll("cancel control", "control two");
    expect(
      validateLinearAgentTask(generic, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).toContain("no_wedge_contract");

    for (const [from, to] of [
      ["catalog navigation", "control alpha"],
      ["cancel control", "control beta"],
      ["dependency timeout", "generic timeout"],
      ["dependency timeout", "test timeout"],
      ["`recovery` receipt", "`recovery state one` receipt"],
    ]) {
      const task = validFinalTask().replaceAll(from, to);
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        `${from} -> ${to}`,
      ).toContain("no_wedge_contract");
    }

    for (const pseudoControl of [
      "primary control",
      "secondary control",
      "foo button",
      "bar link",
      "left action",
      "right command",
      "phantom navigation",
      "imaginary control",
    ]) {
      const task = validFinalTask().replaceAll(
        "catalog navigation",
        pseudoControl,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        pseudoControl,
      ).toContain("no_wedge_contract");
    }

    for (const pseudoFault of [
      "sample dependency timeout",
      "mock dependency timeout",
      "placeholder dependency timeout",
      "fictional dependency timeout",
    ]) {
      const task = validFinalTask().replaceAll(
        "dependency timeout",
        pseudoFault,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        pseudoFault,
      ).toContain("no_wedge_contract");
    }

    for (const weakening of [
      " if possible",
      " and the receipt is unverified",
      " as best-effort proof",
      " and the receipt is optional",
      " and the receipt is not binding",
      " and the receipt is fabricated",
      " but the test does not run",
      " and cannot assert the controls",
    ]) {
      const task = validFinalTask().replace(
        "records a bounded `recovery` receipt.",
        `records a bounded \`recovery\` receipt${weakening}.`,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        weakening,
      ).toContain("no_wedge_contract");
    }
  });

  it("rejects every later performance, hazard, and wait-control contradiction", () => {
    const contradictions: Array<[string, string]> = [
      ["The deadline is advisory.", "performance_contract_conflict"],
      ["The deadline remains unenforced.", "performance_contract_conflict"],
      [
        "The deadline is a target, not a gate.",
        "performance_contract_conflict",
      ],
      ["The timer test never runs.", "performance_contract_conflict"],
      ["The request can run forever.", "performance_contract_conflict"],
      [
        "The threshold above is informational guidance and can be exceeded without failing verification.",
        "performance_contract_conflict",
      ],
      [
        "That request limit is non-mandatory and release proceeds after an overrun.",
        "performance_contract_conflict",
      ],
      [
        "The request_deadline permits 200 seconds.",
        "performance_measurement_missing",
      ],
      [
        "The canonical request is allowed 200 seconds.",
        "performance_measurement_missing",
      ],
      [
        "The request_deadline may consume 200 seconds.",
        "performance_measurement_missing",
      ],
      ["Window.alert is mandatory.", "no_wedge_positive_conflict"],
      ["The global wait overlay is permitted.", "no_wedge_positive_conflict"],
      [
        "The full-screen wait overlay is required.",
        "no_wedge_positive_conflict",
      ],
      ["A pointer trap is mandatory.", "no_wedge_positive_conflict"],
      ["Polling forever is allowed.", "no_wedge_positive_conflict"],
      ["Unlimited retries are allowed.", "no_wedge_positive_conflict"],
      ["Both controls stop accepting input.", "no_wedge_positive_conflict"],
      ["Both controls are hidden.", "no_wedge_positive_conflict"],
      ["Both controls lose clickability.", "no_wedge_positive_conflict"],
      ["Both controls cannot be activated.", "no_wedge_positive_conflict"],
      [
        "Catalog navigation may cease working during each wait.",
        "no_wedge_positive_conflict",
      ],
      [
        "All interaction may be captured by a page-wide veil until completion.",
        "no_wedge_positive_conflict",
      ],
      [
        "The two safeguards are merely illustrative and need not remain operable.",
        "no_wedge_positive_conflict",
      ],
      ["All buttons are disabled during wait.", "no_wedge_positive_conflict"],
      ["The entire page is inert during wait.", "no_wedge_positive_conflict"],
      ["User input is blocked during wait.", "no_wedge_positive_conflict"],
      [
        "The cancel button cannot be clicked during wait.",
        "no_wedge_positive_conflict",
      ],
      [
        "The platform may freeze during every wait.",
        "no_wedge_positive_conflict",
      ],
      [
        "A modal curtain swallows clicks during the request.",
        "no_wedge_positive_conflict",
      ],
      [
        "The interface becomes read-only during wait.",
        "no_wedge_positive_conflict",
      ],
      [
        "Both controls are allowed-to-fail during wait.",
        "no_wedge_positive_conflict",
      ],
      [
        "Both controls do not respond while loading.",
        "no_wedge_positive_conflict",
      ],
      [
        "A modal curtain absorbs user input until completion.",
        "no_wedge_positive_conflict",
      ],
      [
        "The interface cannot be used while pending.",
        "no_wedge_positive_conflict",
      ],
      [
        "The page stops responding during the request.",
        "no_wedge_positive_conflict",
      ],
      [
        "The screen cannot receive input while pending.",
        "no_wedge_positive_conflict",
      ],
      [
        "Users must wait and cannot navigate until completion.",
        "no_wedge_positive_conflict",
      ],
      [
        "The cancel control does not have to work during wait.",
        "no_wedge_positive_conflict",
      ],
      [
        "The interface can swallow every click until completion.",
        "no_wedge_positive_conflict",
      ],
      [
        "Both controls ignore clicks while loading.",
        "no_wedge_positive_conflict",
      ],
      ["The timer test is allowed to fail.", "performance_contract_conflict"],
    ];
    for (const [contradiction, expectedCode] of contradictions) {
      const task = validFinalTask().replace(
        "- Observability:",
        `${contradiction}\n- Observability:`,
      );
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        contradiction,
      ).toContain(expectedCode);
    }
  });

  it("does not treat lifecycle, authorization, or read-only policy clauses as wait contradictions", () => {
    const task = validFinalTask().replace(
      "The graph is acyclic. Non-goals are schema changes, provider changes, and feature redesign.",
      "The graph is acyclic. Destructive erasure action is disabled after authorization denial. Archived commands are unavailable by policy. The blocked action remains inert after denial. The provider inspection is read-only by policy. Non-goals are schema changes, provider changes, and feature redesign.",
    );
    expect(
      validateLinearAgentTask(task, {
        checkRepositoryPathsAtBaseline: false,
      }).errors.map((error) => error.code),
    ).not.toContain("no_wedge_positive_conflict");
  });

  it("rejects globally weakened delivery for every execution path", () => {
    for (const task of [
      validFinalTask(),
      validExternalOperatorTask(),
      validCoordinationContainerTask(),
    ]) {
      for (const weakening of [
        "All following delivery steps are nonbinding suggestions.",
        "All following delivery steps are advisory.",
        "All delivery steps are informational only.",
        "Every delivery obligation applies only when practicable.",
        "The delivery sequence is illustrative rather than enforceable.",
        "These requirements are guidance only.",
        "All following delivery steps are at the agent's discretion.",
        "All following delivery steps are subject to availability.",
        "All obligations are merely aspirational.",
        "These steps are examples, not requirements.",
        "Compliance is voluntary.",
        "Treat the sequence as a draft.",
        "Agents are free to disregard this section.",
        "Nothing here is compulsory.",
        "Use this section as reference material only.",
      ]) {
        const weakened = task.replace(
          "# Delivery, exact-SHA proof, and Linear closeout\n\n",
          `# Delivery, exact-SHA proof, and Linear closeout\n\n${weakening} `,
        );
        expect(
          validateLinearAgentTask(weakened, {
            checkRepositoryPathsAtBaseline: false,
          }).errors.map((error) => error.code),
        ).toContain("delivery_weakened_obligation");
      }
    }
  });

  it("rejects any added or paraphrased repository delivery prose outside the closed grammar", () => {
    const base = validFinalTask();
    for (const addition of [
      "Use an ops branch if the issue branch is unavailable.",
      "Capture a lowercase implementation_sha for convenience.",
      "Reassign the feature SHA with printf or read after review.",
      "Integrate, promote, or send the change to main before merge if needed.",
      "Use gh pr merge --admin when branch protection blocks progress.",
      "Enable auto-merge before the exact-head checks finish.",
      "Skip fetching origin/main when the local main appears current.",
      "Commit, push, or merge any closeout correction after mainline closeout.",
      "Keep task-specific containment files in this section.",
      "Review the Linear queue after the read-back.",
    ]) {
      const task = base.replace(
        "Perform the final Linear read-back",
        `${addition} Perform the final Linear read-back`,
      );
      expect(task, addition).not.toBe(base);
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        addition,
      ).toContain("delivery_exact_contract");
    }
  });

  it("enforces one issue branch, one issue SHA, current-main start, preservation, and no direct-main push", () => {
    const base = validFinalTask();
    const variants: Array<[string, string]> = [
      [
        base.replace("Start from current main", "Start from a stale branch"),
        "delivery_contract",
      ],
      [
        base.replace(
          "Preserve all unrelated and ignored local files and secrets. ",
          "",
        ),
        "delivery_contract",
      ],
      [
        base.replace(
          "Use a Conventional Commit",
          "Also create and work on `codex/ove-998-conflict`. Use a Conventional Commit",
        ),
        "delivery_issue_branch_mismatch",
      ],
      [
        base.replace(
          "Before merge, record",
          "Also capture `OVE998_IMPLEMENTATION_SHA=$(git rev-parse HEAD)`. Before merge, record",
        ),
        "delivery_sha_capture",
      ],
      [
        base.replace(
          "Merge without bypass only after every required check passes.",
          "Push directly to main after the PR. Merge without bypass only after every required check passes.",
        ),
        "delivery_repository_polarity_conflict",
      ],
      [
        base.replace(
          "Use a Conventional Commit",
          "Also create and work on `hotfix/auxiliary`. Use a Conventional Commit",
        ),
        "delivery_issue_branch_mismatch",
      ],
      [
        base.replace(
          "Use a Conventional Commit",
          "Also use `feature/auxiliary`. Use a Conventional Commit",
        ),
        "delivery_issue_branch_mismatch",
      ],
      [
        base.replace(
          "Before merge, record",
          "Set `SECOND_IMPLEMENTATION_SHA=$(git rev-parse HEAD)`. Before merge, record",
        ),
        "delivery_sha_capture",
      ],
      [
        base.replace(
          "After merge, fetch origin/main, run",
          "After merge, overwrite `OVE999_IMPLEMENTATION_SHA=$(git rev-parse HEAD)`, fetch origin/main, then run",
        ),
        "delivery_sha_capture",
      ],
      [
        base.replace(
          "After merge, fetch origin/main, run",
          "After merge, unset OVE999_IMPLEMENTATION_SHA, then set `OVE999_IMPLEMENTATION_SHA=$(git rev-parse HEAD)`, fetch origin/main, and run",
        ),
        "delivery_sha_capture",
      ],
      [
        base.replace(
          "Start from current main",
          "Start from current main, then reset the branch to staging before implementation",
        ),
        "delivery_repository_polarity_conflict",
      ],
      [
        base.replace(
          "Merge without bypass only after every required check passes.",
          "Force-update origin/main from the feature branch. Merge without bypass only after every required check passes.",
        ),
        "delivery_repository_polarity_conflict",
      ],
      [
        base.replace(
          "run exact-head checks.",
          "run exact-head checks and ignore every failure.",
        ),
        "delivery_repository_polarity_conflict",
      ],
      [
        base.replace(
          "compare the saved-description SHA-256",
          "compare the saved-description SHA-256 and disregard every mismatch",
        ),
        "delivery_repository_polarity_conflict",
      ],
      [
        base.replace(
          "Use a Conventional Commit",
          "Create and push `chore/auxiliary` first. Use a Conventional Commit",
        ),
        "delivery_issue_branch_mismatch",
      ],
      [
        base.replace(
          "Use a Conventional Commit",
          "Also switch to `refs/heads/auxiliary`. Use a Conventional Commit",
        ),
        "delivery_issue_branch_mismatch",
      ],
      [
        base.replace(
          "Before merge, record",
          "First set `SECOND_SHA=$(git rev-parse HEAD)`. Before merge, record",
        ),
        "delivery_sha_capture",
      ],
      [
        base.replace(
          "After merge, fetch origin/main, run",
          "After merge, unset OVE999_IMPLEMENTATION_SHA, fetch origin/main, then run",
        ),
        "delivery_sha_capture",
      ],
      [
        base.replace(
          "After merge, fetch origin/main, run",
          "After merge, set OVE999_IMPLEMENTATION_SHA=0000000000000000000000000000000000000000, fetch origin/main, then run",
        ),
        "delivery_sha_capture",
      ],
      [
        base.replace(
          "Merge without bypass only after every required check passes.",
          "Land the feature branch onto main before review. Merge without bypass only after every required check passes.",
        ),
        "delivery_repository_polarity_conflict",
      ],
      [
        base.replace(
          "Merge without bypass only after every required check passes.",
          "Fast-forward origin/main to the feature head. Merge without bypass only after every required check passes.",
        ),
        "delivery_repository_polarity_conflict",
      ],
      [
        base.replace(
          "Merge without bypass only after every required check passes.",
          "Write refs/heads/main with the feature commit. Merge without bypass only after every required check passes.",
        ),
        "delivery_repository_polarity_conflict",
      ],
      [
        base.replace(
          "run exact-head checks.",
          "run exact-head checks and accept failed gates.",
        ),
        "delivery_repository_polarity_conflict",
      ],
      [
        base.replace(
          "run exact-head checks.",
          "run exact-head checks and tolerate failures.",
        ),
        "delivery_repository_polarity_conflict",
      ],
    ];
    for (const [task, expectedCode] of variants) {
      expect(task).not.toBe(base);
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
        expectedCode,
      ).toContain("delivery_exact_contract");
    }
  });

  it("rejects repository prose whose imperative order contradicts the canonical delivery sequence", () => {
    const base = validFinalTask();
    const variants = [
      base.replace(
        "Use a Conventional Commit, push, open a PR, and run exact-head checks.",
        "Use a Conventional Commit, open a PR, then push and run exact-head checks.",
      ),
      base
        .replace(
          "Use a Conventional Commit, push, open a PR, and run exact-head checks. Before merge, record",
          "Use a Conventional Commit, push, and run exact-head checks. Before merge, record",
        )
        .replace(
          "Merge without bypass only after every required check passes.",
          "Open a PR. Merge without bypass only after every required check passes.",
        ),
      base.replace(
        'After merge, fetch origin/main, run `git merge-base --is-ancestor "$OVE999_IMPLEMENTATION_SHA" origin/main`, and then run `cd apps/web && pnpm mainline:closeout:check`.',
        'After merge, fetch origin/main, run `cd apps/web && pnpm mainline:closeout:check`, and then run `git merge-base --is-ancestor "$OVE999_IMPLEMENTATION_SHA" origin/main`.',
      ),
    ];

    for (const task of variants) {
      expect(task).not.toBe(base);
      expect(
        validateLinearAgentTask(task, {
          checkRepositoryPathsAtBaseline: false,
        }).errors.map((error) => error.code),
      ).toContain("delivery_exact_contract");
    }
  });

  it("accepts both file and stdin CLI contracts but never both", () => {
    expect(
      parseLinearTaskCliArgs([
        "--",
        "--file",
        "issue.md",
        "--phase",
        "final",
        "--expected-sha256",
        "b".repeat(64),
        "--json",
      ]),
    ).toEqual({
      file: "issue.md",
      stdin: false,
      phase: "final",
      json: true,
      expectedSha256: "b".repeat(64),
    });
    expect(parseLinearTaskCliArgs(["--stdin", "--phase", "template"])).toEqual({
      stdin: true,
      phase: "template",
      json: false,
    });
    expect(() =>
      parseLinearTaskCliArgs(["--file", "issue.md", "--stdin"]),
    ).toThrow("Provide exactly one");
  });
});

describe("Linear list-marker normalization", () => {
  function toAsteriskBullets(source: string): string {
    let insideFence = false;

    return source
      .split("\n")
      .map((line) => {
        if (/^\s{0,3}(?:```|~~~)/.test(line)) {
          insideFence = !insideFence;
          return line;
        }
        if (insideFence) return line;
        return line.replace(/^( {0,3})-(\s+)/, "$1*$2");
      })
      .join("\n");
  }

  it("validates a saved Linear description that uses `*` list markers", () => {
    const dashSource = validVerticalExecutionTask();
    const asteriskSource = toAsteriskBullets(dashSource);

    expect(asteriskSource).not.toBe(dashSource);
    expect(validateLinearAgentTask(dashSource).errors).toEqual([]);
    expect(validateLinearAgentTask(asteriskSource).errors).toEqual([]);
  });

  it("validates a saved description whose issue mentions are `<issue>` tags", () => {
    const issueTag =
      '<issue id="abc" href="https://linear.app/overgarden/issue/OVE-195/x">OVE-195</issue>';
    const tagged = validFinalTask({
      "Root cause or proof gap":
        `The proved closest failing boundary is a missing guard first shipped by ${issueTag}, and the regression entered with that refactor. ` +
        "Stop condition: stop before merge when the reproduction no longer fails. Decision branch: reopen with the exact call site named.",
    });

    expect(tagged).toContain("<issue ");
    expect(validateLinearAgentTask(tagged).errors).toEqual([]);
  });

  it("digests the untouched source rather than the normalized text", () => {
    const dashSource = validVerticalExecutionTask();
    const asteriskSource = toAsteriskBullets(dashSource);

    expect(validateLinearAgentTask(asteriskSource).sha256).not.toBe(
      validateLinearAgentTask(dashSource).sha256,
    );
  });

  it("leaves emphasis and fenced code untouched", () => {
    const report = validateLinearAgentTask(
      validFinalTask({
        "Root cause or proof gap":
          "**Bold lead** stays emphasis, not a list marker. The proved closest failing boundary is a missing guard, and the regression entered with the prior refactor. Stop condition: stop before merge when the reproduction no longer fails. Decision branch: reopen with the exact call site named.",
      }),
    );

    expect(report.errors).toEqual([]);
  });
});
