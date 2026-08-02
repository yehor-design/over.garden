# AI execution directive

Deliver one secure operator journey in which a founder runs one prepared command, pastes one EPPO Data Portal API key into a masked terminal prompt, and receives a redacted verification receipt. Start only from current origin/main and the authenticated Linear relation read-back. This issue authorizes repository tooling, local fake-secret tests, documentation, a read-only official OpenAPI inspection, and a read-only provider-target classification. It does not authorize real key entry, any secret-store mutation, catalog import, database mutation, Meilisearch mutation, or production deployment before the explicit approval gate is satisfied.

# Execution metadata

* Contract: overgarden.linear-sdd.v1
* Issue identifier: <issue id="42f2d881-98aa-4fb7-9b5f-55fd8bd820bf" href="https://linear.app/overgarden/issue/OVE-274/eppo-secure-credential-bootstrap-founder-pastes-one-api-key-and-the">OVE-274</issue>
* Issue kind: operator_execution
* User-facing: no
* Locale scope: not-applicable
* Repository change: yes
* Live deployment required: no
* Direct production-state mutation: yes
* Authorization status: pending
* Baseline SHA: 50a8089a2516661f5dffe5a4232c3d3b831c4d8e
* Evidence captured: 2026-08-02
* Touches: server, auth, infrastructure, deployment, tests, docs
* Sensitive boundaries: secrets, external-effects
* External systems: EPPO Data Portal, EPPO Global Database API v2, Vercel, GitHub, Linear

# User or operator outcome and behavior

* Actor and precondition: an authenticated founder has generated an EPPO Data Portal API key and the merged command has already classified Vercel Production as the sole server-side ingestion secret target.
* Happy path: the founder runs the exact generated command, reads the zero-secret plan, pastes the key once into a masked standard-input prompt, and receives a redacted receipt after candidate validation, Vercel secret write, Vercel environment read-back, and official LYPES verification.
* Degraded path: empty input, invalid authentication, provider refusal, API timeout, OpenAPI drift, Vercel write failure, or runtime verification failure ends in one closed result class without replacing the previous configured secret.
* Recovery path: the operator fixes the non-secret provider condition, repeats the prepared command, and uses its bounded rollback result before any new candidate is accepted.
* Final read-back: the receipt records the current-main SHA, OpenAPI digest, documented operation identity, environment class, Vercel secret-name existence, HTTP result class, bounded latency, fingerprint prefix, and cleanup result; it excludes key material, passwords, authorization headers, request bodies, response bodies, user data, and provider capability URLs.
* Not sufficient as proof: a browser login, a visible command argument, a local environment file edit, a placeholder variable, an unchecked Vercel variable, or an unauthenticated EPPO request.

# Product thinking and falsification

* Product-research branch: no_direct
* Job or protected outcome: source-ingestion operators obtain repeatable, revocable machine access without leaking a founder credential into the product, source control, delivery evidence, or public runtime.
* Load-bearing assumption: an EPPO Data Portal API key can complete the official documented read-only API v2 LYPES operation and Vercel Production can store one server-side secret without exposing its value.
* Product Thinking Gate: this credential-only operator journey has no direct product-research dependency because it changes neither gardener behavior, public information architecture, pricing, market claims, nor product semantics.
* Falsification signal: an official API v2 inspection requires an account password or browser session for server access, the documented operation cannot validate LYPES, Vercel cannot provide value-redacted secret existence read-back, or the wizard cannot protect standard input and cleanup.
* Smallest reversible response: retain the existing four-species catalog behavior, write no EPPO secret, keep <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue> blocked, and publish a redacted decision receipt naming the failed capability.
* No product-research file directly constrains, governs, defines, requires, or applies to this operator-only credential handoff.

# Pinned baseline, reproduction, evidence, and counterevidence

Audit baseline: 50a8089a2516661f5dffe5a4232c3d3b831c4d8e, observed 2026-08-02.

Safe reproduction:

1. Fetch origin/main, inspect dirty state, and run pnpm mainline:closeout:check from apps/web.
2. Read <issue id="81d3af38-117e-4dda-93a1-6b12cd6f803a" href="https://linear.app/overgarden/issue/OVE-250/eppo-full-corpus-end-to-end-integration-import-every-official-record">OVE-250</issue>, <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue>, <issue id="42f2d881-98aa-4fb7-9b5f-55fd8bd820bf" href="https://linear.app/overgarden/issue/OVE-274/eppo-secure-credential-bootstrap-founder-pastes-one-api-key-and-the">OVE-274</issue>, the current Linear relations, AGENTS.md, docs/INFRASTRUCTURE_REGISTRY.md, .gitignore, apps/web/.env.example, and current Vercel account identity.
3. Fetch the official API v2 OpenAPI document without credentials, calculate its digest, classify only its declared security scheme and LYPES read-only operation, and fail before a secret prompt on any unsupported redirect, host, operation, or schema.

Confirmed evidence:

1. docs/INFRASTRUCTURE_REGISTRY.md — Vercel project environments are the documented server-side secret store for deployed application credentials.
2. apps/web/.env.example — production secrets are excluded from repository configuration and use server-side environment variables.
3. Authenticated Linear read-back on 2026-08-02 — <issue id="42f2d881-98aa-4fb7-9b5f-55fd8bd820bf" href="https://linear.app/overgarden/issue/OVE-274/eppo-secure-credential-bootstrap-founder-pastes-one-api-key-and-the">OVE-274</issue> blocks <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue>, and <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue> remains Backlog.
4. Authenticated Vercel CLI read-back on 2026-08-02 — the yehor-design account can read the project identity without displaying secret values.

Counterevidence: existing git-ignore policy preserves .env and .env.* exclusion while retaining only committed .env.example templates; this blocks a credential from entering source control.

* docs/INFRASTRUCTURE_REGISTRY.md forbids secrets in repository documents, logs, Linear, and chat.
* The existing application holds no EPPO credential loader, so a canonical server-only owner must be added before downstream source code can read a key.

Not proved: the read-only verifier captures the current official v2 security-scheme name, exact LYPES operation identifier, and response-schema digest before any key prompt; the hidden-input command later captures only its redacted candidate, Vercel write, and runtime-access receipt.

# Root cause or proof gap

The closest missing boundary is a repository-owned credential lifecycle that binds an official API v2 contract to one masked input and one Vercel Production secret target. Without that boundary, source work can split authorization headers, leak credentials through arguments or logs, or treat provider configuration as access proof. Stop and reopen the approach when the OpenAPI contract, Vercel target classification, or cleanup receipt drifts from this contract.

# Non-negotiable invariants

1. **INV-01 — API-key-only intake.** The helper accepts one generated EPPO API key from masked standard input and rejects account passwords, command arguments, query parameters, visible environment assignments, multiline input, and empty input before persistence.
2. **INV-02 — Canonical secret containment.** EPPO_DATA_PORTAL_API_KEY remains server-only, is absent from client imports, bundles, source maps, logs, Linear receipts, Git diffs, analytics, and command history, and has no duplicate active environment alias.
3. **INV-03 — Official contract binding.** Candidate validation uses only the current official EPPO API v2 OpenAPI declaration, an allowlisted EPPO HTTPS host, and a documented non-mutating LYPES operation; v1, HTML scraping, guessed headers, and alternate hosts are forbidden.
4. **INV-04 — Atomic target mutation.** A candidate validates before Vercel Production write; a failed write or runtime check restores the previous target state or removes the new candidate, with no partial secret replacement.
5. **INV-05 — Bounded, idempotent operation.** One local lock and one provider-target lock prevent competing writes; same-key replay returns already_configured_and_verified; all request and cleanup stages finish within the declared deadline.
6. **INV-06 — Safe operator evidence.** Every receipt is redacted, records only the allowed digest and status classes, supports key rotation with a bounded rollback, preserves session isolation, and keeps error enumeration indistinguishable to another-user observers.

# Exact data, state, protocol, and concurrency contract

* Data/schema: the canonical non-public configuration name is EPPO_DATA_PORTAL_API_KEY. Local development stores it only in gitignored apps/web/.env.local; Vercel Production is the one approved non-local server-side target. No database row, job payload, Meilisearch document, or browser configuration stores the value.
* Request/action/API: scripts/setup-eppo-credentials.ts rejects --key, positional credential values, password-labelled input, empty input, and embedded line breaks. It reads one hidden standard-input value, validates it through src/server/catalog-source/eppo-credentials.ts, and returns one JSON-safe redacted receipt class.
* State transitions: unconfigured -> plan_verified -> awaiting_secret_input -> validating_candidate -> candidate_valid -> writing_runtime_secret -> verifying_runtime -> cleaning_up -> completed. Failure states are missing_input, invalid_candidate, authentication_rejected, authorization_rejected, rate_limited, api_unavailable, openapi_drift, response_schema_mismatch, runtime_secret_write_failed, runtime_verification_failed, rollback_failed, cleanup_failed, and inconclusive.
* Idempotency: identity is fingerprint-prefix plus OpenAPI digest plus operation identity plus Vercel Production target plus bootstrap version. A matching completed identity produces already_configured_and_verified; a mismatching candidate begins a new candidate-validation cycle.
* Concurrency: an exclusive local file lock and a Vercel-target lock permit one writer. A concurrent command returns credential_setup_already_running, performs no provider write, and leaves the prior target state unchanged.
* Deadlines/retry: each official or provider request has a 15-second deadline, retryable 429 or 5xx responses have at most two attempts respecting Retry-After, deterministic 401, 403, schema, and security-scheme failures have zero retries, and cancellation fences all late writes.
* External effects: classify the Vercel environment and issue a read-only plan before apply; after exact approval, apply one Vercel Production secret write, verify a redacted target read-back and a LYPES operation, rollback the candidate on a failed verify, then cleanup buffers, lock files, and setup-session material.
* Enumeration and session protection: all rejected input and authentication outcomes use coarse result classes, no receipt distinguishes valid secret format details, no caller receives another-user secret state, and terminal sessions redact values before output.
* Rotation: a rotation validates the candidate before apply, records only a fingerprint prefix, verifies the replacement, and restores the prior Vercel target state on post-write failure.
* Official API capability: the official API declares the sole accepted authenticated LYPES read operation and the verifier records its digest before candidate validation.
* Provider capability: Vercel Production exposes a value-redacted secret-metadata read-back used to verify the target existence class.
* Idempotent capability: matching setup identity returns already_configured_and_verified without an additional secret mutation.

# Exact vertical scope, target files, and caller inventory

| Layer/surface | Exact existing owner or planned new path | Required change/read-back | Status |
| -- | -- | -- | -- |
| Canonical server credential owner | `apps/web/src/server/catalog-source/eppo-credentials.ts` | OpenAPI binding, loading, redaction, fingerprinting, result classes, and server-only fence | (new) |
| API verifier | `apps/web/scripts/verify-eppo-api-access.ts` | Fetch, digest, parse, host-check, and execute a bounded LYPES probe | (new) |
| Hidden-input operator command | `apps/web/scripts/setup-eppo-credentials.ts` | Masked input, plan, candidate validation, Vercel write/read-back, rollback, cleanup, and receipt | (new) |
| Package configuration | `apps/web/package.json` | Define eppo:credentials:setup and eppo:credentials:verify | existing |
| Environment template | `apps/web/.env.example` | Declare the canonical empty server-only name and prohibit public aliases | existing |
| Credential tests | `apps/web/src/server/catalog-source/eppo-credentials.test.ts`; `apps/web/scripts/verify-eppo-api-access.test.ts`; `apps/web/scripts/setup-eppo-credentials.test.ts` | Contract, redaction, authorization, race, recovery, and performance proof | (new) |
| Task validators | `apps/web/scripts/check-linear-agent-task.ts`; `apps/web/scripts/check-mainline-closeout.ts` | Final task and mainline closeout proof | existing |
| Operator runbook | `docs/EPPO_CREDENTIAL_BOOTSTRAP.md` | One command, provider classification, rotation, revocation, incident, and zero-secret evidence rules | (new) |
| Infrastructure authority | `docs/INFRASTRUCTURE_REGISTRY.md` | Record Vercel Production target class and redacted read-back procedure | existing |
| Linear mirror | `docs/linear/ove-274-eppo-secure-credential-bootstrap.md` | Saved description digest and final receipt ownership | (new) |

Caller/sibling/consumer inventory:

* `apps/web/scripts/verify-eppo-api-access.ts` (new) is the only code that forms an authenticated EPPO API request.
* `apps/web/scripts/setup-eppo-credentials.ts` (new) is the only founder-input owner and only Vercel mutation owner.
* `apps/web/src/server/catalog-source/eppo-credentials.ts` (new) is the only server-side runtime loader; all <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue> through <issue id="69496675-77b5-4ca0-aa40-da8c4bb8a16f" href="https://linear.app/overgarden/issue/OVE-259/eppo-full-production-landing-migrate-import-index-and-prove-the">OVE-259</issue> callers must import it rather than read process.env directly.
* `apps/web/.env.example` and `docs/INFRASTRUCTURE_REGISTRY.md` are the canonical non-secret configuration references; a repository search rejects EPPO_API_KEY and EPPO_DATA_SERVICES_TOKEN aliases after migration.
* `src/server/catalog-source/eppo-credentials.test.ts`, `scripts/verify-eppo-api-access.test.ts`, and `scripts/setup-eppo-credentials.test.ts` (new) are the apps/web working-directory test paths executed by VER-01 through VER-03.
* `../../docs/linear/ove-274-eppo-secure-credential-bootstrap.md` (new) is the apps/web working-directory task-contract path executed by VER-04.

# Ordered implementation plan

1. Re-read authenticated Linear relations, fetch origin/main, preserve unrelated local state, run mainline closeout, and stop if the target or predecessor graph drifts.
2. Classify the existing environment, Vercel project identity, current secret-name absence or presence class, and official OpenAPI URL without reading secret values; record the read-only plan.
3. Add failing contract tests for password rejection, argument rejection, redaction, official-host enforcement, API failures, Vercel failures, rotation, concurrent setup, timeout, cancellation, and cleanup.
4. Implement the server-only credential owner and the OpenAPI-bound verifier before any interactive intake path.
5. Implement the hidden-input command, Vercel adapter, scoped apply, target read-back, rollback, cleanup, and package scripts.
6. Add the operator runbook, environment-template declaration, infrastructure registry target class, and Linear mirror; run a repository-wide secret and browser-boundary audit.
7. Run focused contract, fault, race, recovery, lint, typecheck, test, build, task-validator, and diff checks; classify every failure before the branch advances.
8. Deliver the repository change through the exact repository delivery path. After main containment, generate the immutable zero-secret plan and wait for the founder action; apply only after the authorization receipt, verify, cleanup, post the receipt, and read Linear back.

# UX, accessibility, localization, degraded states, performance, and observability

* Locale matrix: Not applicable — this is an operator-only terminal journey with no gardener or public UI; the command provides English state labels and actionable text without locale routing.
* Accessibility: masked standard-input prompt, plain-text state messages, Ctrl+C cancellation, and non-color terminal output allow keyboard-only execution.
* Loading/error: finite state labels expose plan, validation, apply, verification, rollback, and cleanup; an error ends in a named result class with bounded re-attempt eligibility.
* Degraded behavior: API and provider failures leave the command in a named closed state and preserve the previous target state.
* Performance budget: PERF-01 (`eppo_credential_bootstrap_duration`) — `eppo_credential_bootstrap_duration` is at most 90000 milliseconds and cancellation prevents late writes.
* Performance measurement: PERF-01 (`eppo_credential_bootstrap_duration`) — VER-03 uses the integration timer at `scripts/setup-eppo-credentials.test.ts` to measure `eppo_credential_bootstrap_duration`.
* Blocking alerts: forbidden
* Global wait overlay: forbidden
* Pointer trap: forbidden
* Unbounded polling/retry: forbidden
* Wait-safe controls: `terminal cancellation command`; `terminal status command` — both remain usable and enabled during every wait.
* Slow/down proof: WAIT-01 — VER-03 at `scripts/setup-eppo-credentials.test.ts` — injected `EPPO API validation timeout` asserts `terminal cancellation command` and `terminal status command` remain responsive and records a bounded `timed out` receipt.
* Observability: allow setup state, elapsed milliseconds, attempt count, official digest, operation identity, Vercel environment class, secret-name existence class, fingerprint prefix, HTTP status class, rollback result, and cleanup result; redact keys, passwords, headers, payloads, account identifiers, user data, and capability URLs.

# Migration, compatibility, rollout, rollback, and cleanup

* Expand: add the canonical server-only helper, verifier, setup command, tests, package scripts, template declaration, runbook, and redacted Vercel target procedure.
* Legacy/backfill: classify EPPO_API_KEY and EPPO_DATA_SERVICES_TOKEN by name only; canonicalize to EPPO_DATA_PORTAL_API_KEY, fail closed on simultaneous conflicting aliases, and remove compatibility reads before <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue> begins.
* Compatibility: the verifier pins an OpenAPI digest for each run and rejects security-scheme, host, operation, media-type, or schema drift until a reviewed source contract updates it.
* Enforce: <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue> remains blocked until <issue id="42f2d881-98aa-4fb7-9b5f-55fd8bd820bf" href="https://linear.app/overgarden/issue/OVE-274/eppo-secure-credential-bootstrap-founder-pastes-one-api-key-and-the">OVE-274</issue> has a completed hidden-input receipt, current-main containment, and an authenticated Linear relation read-back.
* Rollout: local fake-secret suite -> merged main -> read-only Vercel plan -> founder one-paste approval -> candidate validation -> Vercel Production apply -> target verify -> redacted receipt.
* Rollback: a failed Vercel apply or verify restores the previous target secret state or removes the new candidate; it never imports catalog data, changes database data, or touches Meilisearch.
* Cleanup/retention: the setup command zeroes temporary buffers when supported, removes transient files and locks, closes its session, and retains only the redacted receipt and bounded fingerprint prefix.

# Dependencies, ownership boundaries, relations, and non-goals

* Blocked by: none — current-main and Linear definition-of-ready evidence are the start gate.
* Blocks: <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue> because complete-source contract work requires a completed authenticated API v2 receipt.
* Related: <issue id="81d3af38-117e-4dda-93a1-6b12cd6f803a" href="https://linear.app/overgarden/issue/OVE-250/eppo-full-corpus-end-to-end-integration-import-every-official-record">OVE-250</issue> because the parent owns program integration; no relation permits <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue> to start early.
* Duplicate/replaces: none.
* Acyclic execution order: <issue id="42f2d881-98aa-4fb7-9b5f-55fd8bd820bf" href="https://linear.app/overgarden/issue/OVE-274/eppo-secure-credential-bootstrap-founder-pastes-one-api-key-and-the">OVE-274</issue> -> <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue> -> <issue id="c1508ea6-66cc-4b3a-81fc-3bef0e24c478" href="https://linear.app/overgarden/issue/OVE-254/eppo-full-corpus-taxonomy-foundation-extend-schema-and-preserve-every">OVE-254</issue> -> <issue id="617d0e72-5000-45d0-aac6-731d8ec4e4d3" href="https://linear.app/overgarden/issue/OVE-255/eppo-complete-corpus-mirror-acquire-parse-and-ingest-every-official">OVE-255</issue> -> <issue id="be61408e-a75e-4d3a-a93b-141f0f4fa7f3" href="https://linear.app/overgarden/issue/OVE-256/eppo-canonical-reconciliation-build-the-full-hierarchy-crosswalk-every">OVE-256</issue> -> <issue id="61ba0f0e-00f5-4315-84fc-bf14c31e64db" href="https://linear.app/overgarden/issue/OVE-257/eppo-typed-product-integration-expose-every-active-species-through">OVE-257</issue> -> <issue id="2e5f326a-80a2-4bf9-921a-5fff26cd9886" href="https://linear.app/overgarden/issue/OVE-258/eppo-full-corpus-lifecycle-refresh-deactivate-attribute-observe-and">OVE-258</issue> -> <issue id="69496675-77b5-4ca0-aa40-da8c4bb8a16f" href="https://linear.app/overgarden/issue/OVE-259/eppo-full-production-landing-migrate-import-index-and-prove-the">OVE-259</issue> -> <issue id="81d3af38-117e-4dda-93a1-6b12cd6f803a" href="https://linear.app/overgarden/issue/OVE-250/eppo-full-corpus-end-to-end-integration-import-every-official-record">OVE-250</issue>; each edge has one forward direction and no node points to an earlier predecessor.
* Canonical owners: <issue id="42f2d881-98aa-4fb7-9b5f-55fd8bd820bf" href="https://linear.app/overgarden/issue/OVE-274/eppo-secure-credential-bootstrap-founder-pastes-one-api-key-and-the">OVE-274</issue> owns key input, Vercel target mutation, OpenAPI security binding, and credential receipt; <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue> owns licence and corpus policy; <issue id="69496675-77b5-4ca0-aa40-da8c4bb8a16f" href="https://linear.app/overgarden/issue/OVE-259/eppo-full-production-landing-migrate-import-index-and-prove-the">OVE-259</issue> owns full-production data apply and compensation.
* Staged handshake: Phase A emits the OpenAPI digest, operation identity, Vercel target class, secret-name existence receipt, and redacted access result. Phase B begins <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue> only after Phase A is Done, contained in main, and read back in Linear.

Non-goals:

* Creating an EPPO account, accepting a licence for the founder, changing a founder password, or managing keys in the EPPO dashboard.
* Importing records, modifying taxonomy, starting a worker, applying database migrations, rebuilding Meilisearch, or exposing an EPPO-backed product feature.
* Writing the key to GitHub Actions, preview environments, browser code, DigitalOcean worker files, documentation, Linear, logs, analytics, or chat.

# Measurable acceptance criteria

1. **AC-01 — one-paste intake completes a verified terminal state.**
   * Given: merged current-main tooling and a generated API key in the founder clipboard.
   * When: the founder runs the exact setup command and pastes once into its masked prompt.
   * Then: the command reaches completed or one closed failure state without a file edit, header selection, endpoint selection, or visible credential echo.
   * Protects: INV-01, INV-06.
   * Verified by: VER-01, VER-05.
2. **AC-02 — secret and another-user boundaries remain closed.**
   * Given/When/Then: sentinel keys, password-shaped input, argument input, direct browser imports, another-user reads, and failure paths are exercised; outputs have zero secret, password, header, payload, or target-value disclosure and return generic redacted classes.
   * Protects: INV-01, INV-02, INV-06.
   * Verified by: VER-01, VER-02.
3. **AC-03 — only the official API v2 contract authorizes LYPES validation.**
   * Given: a current OpenAPI document and a candidate key fixture.
   * When: the verifier selects the declared LYPES read-only operation.
   * Then: the EPPO allowlist, security scheme, 2xx media type, code identity, and response shape pass; redirect, v1, alternate host, mutation operation, or schema drift returns a closed result.
   * Protects: INV-03.
   * Verified by: VER-01.
4. **AC-04 — invalid and degraded attempts preserve the prior state.**
   * Given: empty input, 401, 403, 429, timeout, Vercel write failure, runtime verification failure, or cleanup error.
   * When: setup runs against a prior configured fixture.
   * Then: the result is closed, the prior target state remains readable by existence class, and no candidate becomes active.
   * Protects: INV-04, INV-06.
   * Verified by: VER-02, VER-03.
5. **AC-05 — replay, rotation, and concurrent setup are deterministic.**
   * Given: one valid configured fixture, two concurrent callers, and a rotated candidate.
   * When: setup replays, races, or performs rotation.
   * Then: same-key replay returns already_configured_and_verified, exactly one caller owns the lock, and a failed rotation restores the previous target state.
   * Protects: INV-04, INV-05.
   * Verified by: VER-03.
6. AC-06 — PERF-01 (`eppo_credential_bootstrap_duration`) — `eppo_credential_bootstrap_duration` is at most 90000 milliseconds; cancellation prevents late writes.
   * Protects: INV-05.
   * Verified by: VER-03.
7. **AC-07 — delivery and external receipt are complete.**
   * Given: every local verifier passes on the implementation SHA.
   * When: branch delivery, main containment, the authorized founder action, Vercel target verification, cleanup, and Linear read-back occur.
   * Then: exact-main containment, redacted Vercel/EPPO receipt, description-digest equality, and the <issue id="42f2d881-98aa-4fb7-9b5f-55fd8bd820bf" href="https://linear.app/overgarden/issue/OVE-274/eppo-secure-credential-bootstrap-founder-pastes-one-api-key-and-the">OVE-274</issue> -> <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue> blocker relation are all confirmed.
   * Protects: INV-02, INV-03, INV-04, INV-06.
   * Verified by: VER-04, VER-05.

# Required test and fault matrix

| Case | Protects | Proves | Verification | Level | Fault/input | Expected receipt |
| -- | -- | -- | -- | -- | -- | -- |
| Happy hidden intake | INV-01, INV-03, INV-06 | AC-01, AC-03 | VER-01 | integration | masked valid key fixture and documented LYPES contract | completed redacted receipt with matching LYPES class |
| Another-user secret read | INV-02, INV-06 | AC-02 | VER-02 | contract | another-user loader and client import attempt | generic denial, zero secret and zero browser emission |
| Invalid candidate | INV-01, INV-04 | AC-02, AC-04 | VER-02 | integration | password input, argument input, empty input, 401, and 403 | rejected class and preserved prior target |
| Duplicate replay | INV-04, INV-05 | AC-05 | VER-03 | integration | matching fingerprint and operation identity | already_configured_and_verified with zero duplicate write |
| Concurrent race | INV-04, INV-05 | AC-05 | VER-03 | integration | two setup workers at provider-target lock | one owner, one credential_setup_already_running, unchanged final target |
| Timeout recovery | INV-04, INV-05, INV-06 | AC-04, AC-06 | VER-03 | integration | EPPO API validation timeout and Vercel partial success | PERF-01 (`eppo_credential_bootstrap_duration`) — `eppo_credential_bootstrap_duration` is at most 90000 milliseconds; timed out receipt with rollback and cleanup |
| Rotation recovery | INV-04, INV-06 | AC-04, AC-05 | VER-03 | provider | valid replacement then runtime verification failure | restored prior target receipt without key value |
| Load and cleanup | INV-05 | AC-06 | VER-03 | benchmark | bounded re-attempt and cancellation profile | PERF-01 (`eppo_credential_bootstrap_duration`) — `eppo_credential_bootstrap_duration` is at most 90000 milliseconds; bounded cleanup receipt |
| Main and provider read-back | INV-01, INV-02, INV-03, INV-04, INV-06 | AC-01, AC-07 | VER-04, VER-05 | provider | contained implementation and approved founder command | current-main, Vercel existence class, LYPES class, cleanup, and Linear relation receipt |

# Verification commands and required evidence

## VER-01 — official API contract and intake proof

* Phase: local
* Proves: AC-01, AC-02, AC-03
* Command status: must_be_added
* Expected receipt: focused tests pass with a documented LYPES contract, masked input, and zero secret disclosure.

```bash
cd apps/web
pnpm exec vitest run src/server/catalog-source/eppo-credentials.test.ts scripts/verify-eppo-api-access.test.ts
```

## VER-02 — leak, another-user, and invalid-access proof

* Phase: local/build
* Proves: AC-02, AC-04
* Command status: must_be_added
* Expected receipt: sentinel values are absent from argv, output, errors, client bundles, and fixtures; invalid states preserve the prior target fixture.

```bash
cd apps/web
pnpm exec vitest run scripts/setup-eppo-credentials.test.ts --testNamePattern "redaction|password|argument|another-user|401|403|provider|cleanup"
```

## VER-03 — race, recovery, and performance proof

* Phase: local/integration
* Proves: AC-04, AC-05, AC-06
* Command status: must_be_added
* Expected receipt: every race, timeout, rotation, and cleanup path reaches a bounded state while preserving the prior target fixture.
* Performance proof: PERF-01 (`eppo_credential_bootstrap_duration`) — target `scripts/setup-eppo-credentials.test.ts` measures `eppo_credential_bootstrap_duration` at most 90000 milliseconds and records a bounded threshold receipt.
* No-wedge proof: WAIT-01 — target `scripts/setup-eppo-credentials.test.ts` injects `EPPO API validation timeout`, proves `terminal cancellation command` and `terminal status command` remain responsive, and records a bounded `timed out` receipt.

```bash
cd apps/web
pnpm exec vitest run scripts/setup-eppo-credentials.test.ts --testNamePattern "429|timeout|rotation|concurrent|rollback|performance"
```

## VER-04 — repository, exact-main, and task-contract proof

* Phase: local/CI
* Proves: AC-07
* Command status: existing
* Expected receipt: lint, types, all tests, build, task contract, and diff checks pass on the captured implementation SHA.

```bash
cd apps/web
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm linear:task:standard:check
pnpm mainline:closeout:check
git diff --check
```

## VER-05 — Vercel target and official API read-back

* Phase: main/provider/Linear
* Proves: AC-01, AC-07
* Command status: external_readback
* Expected receipt: a value-redacted Vercel Production secret existence class, an official LYPES result class, cleanup confirmation, and authenticated Linear relation read-back.

```bash
# Authenticated Vercel read-back: inspect Production environment secret metadata for EPPO_DATA_PORTAL_API_KEY and read its existence class.
# Authenticated Linear read-back: get OVE-274 and inspect its OVE-274 -> OVE-253 blocker relation, completed receipt, state, and saved-description SHA-256.
```

# Delivery, exact-SHA proof, and Linear closeout

* Delivery path: repository_change
* Delivery sequence: current_main -> preserve_local -> issue_branch -> conventional_commit -> branch_push -> pull_request -> exact_head_checks -> capture_feature_sha -> merge_without_bypass -> fetch_main -> containment -> mainline_closeout -> linear_readback -> done
* Issue branch: `codex/ove-274-eppo-secure-credential-bootstrap`
* Implementation SHA variable: `OVE274_IMPLEMENTATION_SHA`
* Direct main mutation: forbidden
* Local state preservation: required

Start from current main on `codex/ove-274-eppo-secure-credential-bootstrap`. Preserve all unrelated and ignored local files and secrets. Use a Conventional Commit, push, open a PR, and run exact-head checks. Before merge, record `OVE274_IMPLEMENTATION_SHA=$(git rev-parse HEAD)` exactly once in the redacted closeout receipt. Merge without bypass only after every required check passes. After merge, fetch origin/main, run `git merge-base --is-ancestor "$OVE274_IMPLEMENTATION_SHA" origin/main`, and then run `cd apps/web && pnpm mainline:closeout:check`. Perform the final Linear read-back and compare the saved-description SHA-256 before Done.

# Failure gates

* Stop before implementation start when current origin/main, <issue id="42f2d881-98aa-4fb7-9b5f-55fd8bd820bf" href="https://linear.app/overgarden/issue/OVE-274/eppo-secure-credential-bootstrap-founder-pastes-one-api-key-and-the">OVE-274</issue>, <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue>, the Vercel target classification, or the official API contract differs from this saved contract.
* Pending authorization blocks every real secret entry, Vercel Production secret apply, authenticated EPPO request, rotation, revocation, and Done transition.
* Stop if a password, argument value, browser import, log, output, receipt, source map, Linear body, or Git diff contains key material or an authorization header.
* Stop if OpenAPI parsing identifies a v1 path, non-EPPO host, mutation operation, undocumented LYPES structure, redirect, or schema drift.
* Stop and rollback when Vercel write/read-back, runtime verification, cleanup, lock release, redaction tests, task validation, exact-head CI, main containment, or Linear digest equality fails.
* Do not unblock <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue> or mark <issue id="42f2d881-98aa-4fb7-9b5f-55fd8bd820bf" href="https://linear.app/overgarden/issue/OVE-274/eppo-secure-credential-bootstrap-founder-pastes-one-api-key-and-the">OVE-274</issue> Done from configured-only state, fake-secret tests, local-only verification, an uncontained commit, or a receipt without Vercel and official API read-back.

# Required context

* AGENTS.md
* docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md
* docs/linear/AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md
* docs/SDD_VERTICAL_SLICE_ROADMAP.md
* docs/MAINLINE_CLOSEOUT.md
* docs/TECH_STACK_DECISIONS.md
* docs/adr/ADR-0014-agentic-stack-realignment.md
* docs/INFRASTRUCTURE_REGISTRY.md
* .gitignore
* apps/web/.env.example
* apps/web/package.json
* docs/linear/<issue id="42f2d881-98aa-4fb7-9b5f-55fd8bd820bf" href="https://linear.app/overgarden/issue/OVE-274/eppo-secure-credential-bootstrap-founder-pastes-one-api-key-and-the">OVE-274</issue>-eppo-secure-credential-bootstrap.md
* <issue id="81d3af38-117e-4dda-93a1-6b12cd6f803a" href="https://linear.app/overgarden/issue/OVE-250/eppo-full-corpus-end-to-end-integration-import-every-official-record">OVE-250</issue>
* <issue id="4e978071-c242-41e1-a58b-003eb7166e59" href="https://linear.app/overgarden/issue/OVE-253/eppo-complete-source-contract-and-corpus-inventory-prove-every">OVE-253</issue>
* [https://data.eppo.int/](<https://data.eppo.int/>)
* [https://api.eppo.int/gd/v2/eppo_api_gd_v2.yml](<https://api.eppo.int/gd/v2/eppo_api_gd_v2.yml>)

# Open maintainer authorization gates

* Authorization status: pending
* Gate: write or rotate EPPO_DATA_PORTAL_API_KEY in the Vercel Production server-side environment and perform the real authenticated documented LYPES read-only operation.
* Required approval artifact: the setup command's zero-secret plan containing current-main SHA, OpenAPI digest, operation identity, Vercel Production environment class, secret name, rollback method, and redaction statement.
* Approval receipt: pending
* Work allowed before approval: code, fake-secret tests, documentation, official public OpenAPI inspection, Vercel project identity read-back, and a no-value secret-name classification.
* Work forbidden before approval: real key entry, local or Vercel real secret write, authenticated EPPO request, provider key rotation or revocation, catalog import, database mutation, and Meilisearch mutation.
* Stop/read-back condition: target environment, OpenAPI digest, operation identity, secret name, rollback method, cleanup result, or provider read-back drift invalidates the plan and preserves the previous target state.
