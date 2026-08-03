# AI execution directive

Deliver one time-bounded, evidence-backed source-contract decision that lets the
catalog team determine whether EPPO may supply the full official taxonomy corpus
without treating the current bounded four-species proof as a corpus mirror.
Start from current `main` and current Linear read-back only after OVE-274 is
`Done`, its redacted credential receipt is contained in `origin/main`, and the
OVE-274 -> OVE-253 relation is present. This issue authorizes a read-only
official capability and licence decision, a safe aggregate-only verifier, tests,
and canon updates. It does not authorize full raw acquisition, parsing, durable
source snapshots, database writes, search writes, product projection, or a
production behavior change. This task owns no production behavior. The decision must complete within a six-hour
time-bounded window as either `contract_approved` or a named blocked terminal
state; a blocked terminal state reopens the program at OVE-253 and prevents
OVE-254 and OVE-255 from starting.

# Execution metadata

- Contract: `overgarden.linear-sdd.v1`
- Issue identifier: `OVE-253`
- Issue kind: `decision_spike`
- User-facing: `no`
- Locale scope: `not-applicable`
- Repository change: `yes`
- Live deployment required: `no`
- Direct production-state mutation: `no`
- Authorization status: `not_required`
- Baseline SHA: `534e8d18ef402095ae1e77880e03749536066f6f`
- Evidence captured: `2026-08-03`
- Touches: `server, infrastructure, tests, docs`
- Sensitive boundaries: `secrets, precise-location, external-effects`
- External systems: `EPPO Data Portal, EPPO Global Database API v2, Linear, GitHub`

# User or operator outcome and behavior

- Actor and precondition: a catalog operator starts from OVE-274 `Done`, the
  redacted API-v2 receipt, Node 22-24, clean current `main`, and no local EPPO
  credential material.
- Happy path: the operator runs the new source-contract verifier once; it reads
  only official licence, OpenAPI and bounded capability metadata, records a
  count-only decision receipt, and writes `contract_approved` only when every
  required source class, rights, release identity, and closure method is proved.
- Degraded path: an official capability refusal, unavailable closure manifest,
  licence ambiguity, schema drift, timeout, or rate limit returns one named
  blocked state with zero corpus acquisition and zero canonical mutation.
- Recovery path: the operator corrects only the documented provider condition,
  reruns the bounded verifier from its checkpoint, and obtains a new redacted
  receipt; no HTML scraping, browser session, guessed endpoint, or full-download
  fallback is allowed.
- Final read-back: the canon records one decision, evidence digest, source
  class matrix, and terminal state; it contains no credential, header, raw
  payload, source record, occurrence/distribution coordinate, user data, or
  product/search projection.
- Not sufficient as proof: OVE-274 access alone, a 2xx known-code probe, the
  historical four-species seed, an undocumented portal page, a configured secret,
  a local fixture, or a successful full-corpus request.

# Product thinking and falsification

- Product-research branch: constrained
- Job or protected outcome: protect gardeners from an incorrect or unsafe
  catalog while preserving a truthful, attributable source provenance boundary
  for later catalog completeness work.
- Load-bearing assumption: EPPO exposes an official, licensed, versioned and
  closed method to identify every required taxon/name/taxonomy/lifecycle record
  class without importing source-only locations or depending on portal scraping.
- Product Thinking Gate: `docs/product-research/DB_SEED_AND_DATA-MODEL_SPEC_v1_2.md` constrains source-scoped identity, source isolation, non-destructive lifecycle, and the prohibition on a live vendor dependency; `docs/product-research/CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md` constrains privacy-by-default handling so source-only location or distribution values never reach gardeners, analytics, search, or evidence; `docs/product-research/CATALOG_SOURCE_READINESS.md` constrains the distinction between bounded historical evidence and a full-corpus authority; `docs/product-research/SPECIES_BACKBONE_POLICY.md` constrains retention of the current bounded seed while a full contract is undecided; `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json` constrains the canonical machine-readable decision fields consumed by downstream work.
- Falsification signal: within six hours no official licence revision plus
  attributable right-to-store/right-to-project decision, release/checksum
  identity, or authoritative corpus closure method can be read back for all
  required classes.
- Smallest reversible response: record `blocked_manifest`, `blocked_rights`,
  `blocked_capability`, `blocked_schema`, `blocked_rate_limit`, or
  `blocked_timeout`; retain the bounded seed and leave all downstream issues
  blocked.

# Pinned baseline, reproduction, evidence, and counterevidence

Audit baseline: `534e8d18ef402095ae1e77880e03749536066f6f`, observed 2026-08-03.

Safe reproduction:

1. Fetch `origin/main`, inspect dirty state, read OVE-274 and OVE-253 with
   relations, and run `cd apps/web && pnpm mainline:closeout:check`.
2. Read the official EPPO OpenAPI v2 document and Open Data Licence without a
   credential; run only the existing value-redacted OVE-274 verifier when its
   receipt must be classified, never to repeat its one-shot witness.
3. Confirm that `catalog:sources:verify` proves a bounded code/name backbone
   but does not prove a complete EPPO corpus closure, full-class rights, or a
   durable mirror.

Confirmed evidence:

1. `apps/web/scripts/verify-eppo-api-access.ts` — the official OpenAPI v2
   digest is `c76c883dfc251ffcc026f85ae18b65f0dacd0e0f844c6f92ee19199f0dd42d13`
   and its documented `getGDTaxon` operation has a value-redacted OVE-274 2xx
   receipt on current-main predecessor `42b2893a4a023edd4a01380b7341c78806f20dc9`.
2. `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json` — existing
   EPPO evidence is explicitly a bounded code/name backbone subset, not a full
   external mirror.
3. Authenticated Linear read-back on 2026-08-03 — OVE-274 is `Done`, blocks
   OVE-253, and OVE-253 is `Backlog` with OVE-254 and OVE-250 as forward edges.

Counterevidence: `apps/web/src/lib/catalog/species-backbone-seed.ts` and the
source-readiness canon preserve the historical four-species behavior; this
decision must not relabel it as complete-corpus proof.

- The public EPPO portal describes multiple services and a legacy transition;
  that narrows the diagnosis to an official capability matrix rather than an
  assumed REST export entitlement.

Not proved: the exact official closure manifest, complete record-class coverage,
field-family rights, release/checksum semantics, and documented service limit
must be read during this decision; the verifier stops at the first missing
authority rather than infer it.

# Root cause or proof gap

The closest proof gap is that current source readiness proves selected species
and OVE-274 proves one authenticated read, but neither authority proves a
licensed, versioned closure of every official record class. The decision branch
is `contract_approved` only with all listed authorities; otherwise stop with a
named blocked receipt, reopen OVE-253 when EPPO publishes the missing authority,
and keep every downstream corpus implementation blocked.

# Non-negotiable invariants

1. **INV-01 — Official-authority decision.** Only an official EPPO licence,
   documented API/service capability, and read-back release/closure evidence may
   establish the corpus contract; inferred, scraped, legacy, or guessed evidence
   is forbidden.
2. **INV-02 — Secret and privacy containment.** Credentials, authorization
   headers, raw authenticated payloads, user data, precise location, and
   source-only occurrence/distribution values are forbidden from Git, Linear,
   logs, reports, analytics, product UI, and search; evidence is redacted and
   aggregate-only. Credential enumeration returns one generic class, rotation
   remains owned by OVE-274, session cleanup removes local verifier buffers, and
   a negative proof confirms no precise location crosses the decision boundary.
3. **INV-03 — Bounded decision scope.** OVE-253 creates no full download,
   parser, raw snapshot, source row, database/search/product mutation, or
   production behavior; OVE-255 exclusively owns durable acquisition and
   storage after `contract_approved`.
4. **INV-04 — Deterministic terminal receipt.** One decision identity combines
   official document digests, release identity, capability matrix, and baseline;
   matching replay returns the same idempotent terminal result and mismatching evidence
   opens a new bounded decision cycle.
5. **INV-05 — Bounded operability.** The verifier is serial until a documented
   EPPO limit is read, has one six-hour deadline, at most two retryable attempts,
   cancellation fencing, and a responsive timeout receipt.
6. **INV-06 — Canonical downstream gate.**
   `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json` is the
   decision record consumed by OVE-254 and OVE-255; no parallel source-contract
   owner is allowed.

# Exact data, state, protocol, and concurrency contract

- Data/schema: add only a versioned, redacted decision record in
  `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json` plus its
  Markdown explanation; fields are baseline SHA, official document digests,
  source-class matrix, release identity, closure method, terminal state,
  timestamp, and evidence digest. Raw content, credentials, coordinates, user
  data, and record-level identifiers are Not applicable — excluded by INV-02.
- Request/action/API: `scripts/verify-eppo-source-contract.ts` accepts only
  `--mode fixture|live-contract`, `--timeout-ms 21600000`, `--max-attempts 2`, and
  `--concurrency 1`; it permits the official API host and documented
  read-only metadata/capability operations, emits JSON-safe count/status/digest
  classes, and rejects unknown hosts, paths, methods, modes, or arguments.
- State transitions: `unstarted -> collecting_authority -> classifying -> contract_approved|blocked_manifest|blocked_rights|blocked_capability|blocked_schema|blocked_rate_limit|blocked_timeout`; every blocked state is
  terminal, writes no corpus state, and names the missing authority.
- Idempotency: the decision is idempotent for baseline SHA plus licence/OpenAPI/release digests plus
  source-class matrix; identical replay returns the prior terminal decision,
  while a digest mismatch creates a new decision receipt without overwriting the
  prior canon entry.
- Concurrency: one local exclusive decision lock permits one writer; a second
  caller returns `decision_already_running`, makes no provider or canon write,
  and stale completion cannot replace a newer identity.
- Deadlines/retry: serial calls have a six-hour total deadline, each request has
  a documented bounded sub-deadline, only 429/5xx uses at most two attempts with
  Retry-After, and cancellation prevents late receipt admission.
- External effects: prepare the redacted official plan, perform bounded
  read-only calls, read back the decision inputs, write only the repository
  canon on a branch, verify the receipt, and clean locks/buffers; rollback
  removes only the unmerged decision change and never performs a provider write.

# Exact vertical scope, target files, and caller inventory

| Layer/surface | Exact existing owner or planned new path | Required change/read-back | Status |
| -- | -- | -- | -- |
| Data/types | Not applicable — OVE-253 persists no database or source rows. | Prove zero database mutation. | required decision boundary |
| Scoped repository | Not applicable — OVE-255 owns source snapshot/repository writes. | Prove zero repository data access. | required decision boundary |
| Route/action/API | `apps/web/scripts/verify-eppo-source-contract.ts` (new) | Strict official capability matrix, serial bounded read-only receipt. | (new) |
| Server decision owner | `apps/web/src/server/catalog-source/eppo-source-contract.ts` (new) | Fixed-host capability classifier, cancellation fence, terminal-state mapping, and no-corpus boundary. | (new) |
| UI/operator path | `apps/web/package.json` (existing) | Add one operator-only verifier command; no product UI change. | required |
| Worker/search/media/offline/provider | `apps/web/src/server/catalog-source/eppo-credentials.ts` (existing) | Reuse server-only credential loader; no worker, search, media, offline, or provider mutation. | required |
| Tests | `apps/web/scripts/verify-eppo-source-contract.test.ts`, `apps/web/src/server/catalog-source/eppo-source-contract.test.ts` (new) | Fixture decision, leak, replay, timeout, and lock proof. | (new) |
| Docs/runbook | `docs/linear/ove-253-eppo-source-contract-decision.md` (new) | Mirror the validated task contract. | (new) |
| Canon consumers | `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json`, `docs/product-research/CATALOG_SOURCE_READINESS.md`, `docs/product-research/SPECIES_BACKBONE_POLICY.md`, `docs/SCAFFOLD_STATUS.md` | Record the decision while preserving bounded historical evidence. | existing |

Caller/sibling/consumer inventory:

- `apps/web/src/server/catalog-source/eppo-credentials.ts` remains the single
  credential owner; no caller reads `process.env` directly.
- `apps/web/scripts/verify-catalog-sources.ts` remains bounded-source proof and
  must not gain full-corpus semantics.
- `apps/web/src/server/catalog-source/species-backbone-import.ts` and
  `apps/web/src/lib/catalog/species-backbone-seed.ts` retain the existing seed
  path until OVE-257 owns product integration.
- `apps/web/scripts/verify-eppo-source-contract.ts` (new) is the single OVE-253
  decision owner; OVE-255 cannot use it to download, parse, or persist raw rows.

# Ordered implementation plan

1. Re-read required context, fetch current `main`, inspect dirty state, read
   OVE-274/OVE-253 relations, rerun the safe reproduction, and stop on baseline,
   receipt, relation, Node, or provider-authority drift.
2. Add fixture-only regression tests for the capability matrix, redaction,
   terminal state, duplicate replay, serial lock, cancellation, and no-write
   boundary before adding live reads.
3. Implement the canonical server-owned source-contract classifier and operator
   verifier with a six-hour time-bounded decision, stop/go matrix, count-only
   receipt, and `contract_approved` versus named blocked terminal states.
4. Perform only documented official read-only licence/OpenAPI/capability and
   closure metadata reads; start serially, record no raw payload, and stop before
   corpus acquisition when a required authority is absent.
5. Update the four canon consumers to distinguish bounded historical EPPO proof
   from the new decision; there is no user surface, locale copy, or production
   behavior change.
6. Prove zero database, search, product, analytics, and provider mutation;
   preserve OVE-255 ownership of full acquisition, parser, checksum artifacts,
   resumability, and source-row storage.
7. Run focused, fault, replay, performance, lint, typecheck, test, build,
   validator, exact-SHA, and read-only official evidence gates.
8. Deliver the PR, contain the implementation SHA in `origin/main`, rerun
   mainline closeout, save and read back this exact Linear description, then mark
   OVE-253 `Done` for its completed decision receipt whether it is
   `contract_approved` or a named blocked terminal state. A blocked receipt leaves
   OVE-254 and OVE-255 blocked and reopens OVE-253 only when the provider evidence changes.

# UX, accessibility, localization, degraded states, performance, and observability

- Locale matrix: Not applicable — this operator-only decision changes no
  gardener route, localized string, or language selection; the no-UI proof is
  the target inventory and zero UI diff.
- Accessibility: Not applicable — the operator command emits machine-readable
  receipt classes and creates no browser control.
- Loading/error/retry: the terminal prints finite `collecting_authority`,
  `classifying`, or a named degraded terminal receipt.
- Performance budget: PERF-01 (`eppo_source_contract_decision_duration`) — `eppo_source_contract_decision_duration` is at most 21600000 ms and cancellation prevents late evidence admission.
- Performance measurement: PERF-01 (`eppo_source_contract_decision_duration`) — VER-03 uses the monotonic wall-clock timer at `scripts/verify-eppo-source-contract.ts` to measure `eppo_source_contract_decision_duration`.
- Blocking alerts: forbidden
- Global wait overlay: forbidden
- Pointer trap: forbidden
- Unbounded polling/retry: forbidden
- Wait-safe controls: `terminal SIGINT cancellation command`; `credential-free fixture command` — both remain usable and enabled during every wait.
- Slow/down proof: WAIT-01 — VER-03 at `scripts/verify-eppo-source-contract.ts` — injected `EPPO API capability timeout` asserts `terminal SIGINT cancellation command` and `credential-free fixture command` remain responsive and records a bounded `timed out` receipt.
- Observability: allow only terminal state, source-class counts, elapsed duration,
  document/release digests, attempt total, and lock outcome; retain no content,
  credential, raw payload, coordinate, user identity, or provider capability URL.

# Migration, compatibility, rollout, rollback, and cleanup

- Expand: add the classifier, fixture suite, operator command, and additive
  canon decision fields; no schema migration is authorized.
- Legacy/backfill: classify the existing bounded EPPO entries as historical
  four-species evidence and retain them; do not backfill a corpus or rewrite
  prior source records.
- Compatibility: existing seed readers continue unchanged; OVE-254 and OVE-255
  read only `contract_approved` plus the named release/closure receipt.
- Enforce: a missing or changed evidence digest forces a blocked terminal state
  and prevents a full mirror start.
- Rollout: run fixture proof, then one serial read-only official decision after
  OVE-274 receipt read-back; no deployment or provider configuration change.
- Rollback: revert the unmerged classifier/canon change or restore the prior
  decision entry; never resurrect a rejected corpus, credential, raw payload,
  or source-only location value.
- Cleanup/retention: the verifier removes locks and buffers on every terminal
  state; the canon retains only redacted decision metadata and an orphan-lock
  scan proves cleanup.

# Dependencies, ownership boundaries, relations, and non-goals

- Blocked by: `OVE-274` — consume its `Done` state, current-main containment,
  redacted 2xx receipt, saved-description digest, and OVE-274 -> OVE-253 edge;
  do not rerun the predecessor witness to reconfirm it.
- Blocks: `OVE-254` — taxonomy foundation requires the approved source-class
  contract; `OVE-250` — program integration requires the downstream chain.
- Related: none.
- Duplicate/replaces: none.
- Acyclic execution order: OVE-274 -> OVE-253 -> OVE-254 -> OVE-255 -> OVE-256
  -> OVE-257 -> OVE-258 -> OVE-259 -> OVE-250 -> OVE-186; authenticated Linear
  read-back must show each relation in this forward direction and no reverse edge.
- Canonical owners: OVE-253 owns rights/capability/release/closure decision;
  OVE-254 owns schema; OVE-255 owns raw acquisition/parser/mirror/source rows;
  OVE-256 owns reconciliation; OVE-257 owns product exposure; OVE-258 owns
  lifecycle refresh; OVE-259 owns approved production apply; OVE-250 owns final
  integration.
- Staged handshake: Phase A consumes OVE-274 only through a redacted terminal
  receipt; Phase B emits `contract_approved` or a named blocked receipt; OVE-254
  and OVE-255 start only after authenticated Linear read-back of Phase B.

Non-goals:

- Full raw corpus download, pagination, parser, checksum artifact, source-row
  persistence, database migration, or resumable mirror work.
- Any catalog UI, search index, analytics, media, product projection, or
  production deployment/provider mutation.

# Measurable acceptance criteria

1. **AC-01 — official source decision is closed.**

- Given: OVE-274 `Done` receipt and official EPPO documents.
- When: the serial source-contract verifier classifies rights, source classes, release identity, and closure method.
- Then: it emits exactly one `contract_approved` or named blocked terminal state with document/release digests and no inferred authority.
- Protects: `INV-01`, `INV-06`.
- Verified by: `VER-01`, `VER-03`.

2. **AC-02 — evidence remains redacted and out of product data.**

- Given/When/Then: a credential, raw response, source-only location, unknown host, or undocumented endpoint is supplied; the verifier rejects it, emits a generic redacted class, negative proof of no precise location, and makes zero canon/database/search/product writes.
- Protects: `INV-01`, `INV-02`, `INV-03`.
- Verified by: `VER-01`, `VER-02`.

3. **AC-03 — replay, lock, and timeout are deterministic.**

- Given: identical evidence, two concurrent commands, or an API capability timeout.
- When: the verifier runs or is cancelled.
- Then: replay returns the same terminal result, exactly one caller owns the lock, no late evidence is admitted, and timeout returns `blocked_timeout`.
- Protects: `INV-04`, `INV-05`.
- Verified by: `VER-02`, `VER-03`.

4. **AC-04 — bounded decision deadline.** PERF-01 (`eppo_source_contract_decision_duration`) — `eppo_source_contract_decision_duration` is at most 21600000 ms; the terminal decision releases the lock and preserves the downstream block.

- Protects: `INV-05`, `INV-06`.
- Verified by: `VER-03`, `VER-04`.

# Required test and fault matrix

| Case | Protects | Proves | Verification | Level | Fault/input | Expected receipt |
| -- | -- | -- | -- | -- | -- | -- |
| Happy official decision | INV-01, INV-06 | AC-01 | VER-01, VER-03 | contract/provider | official fixture matrix with all required authorities | `contract_approved` with digests, release identity, and closure method |
| Another-user or secret leak | INV-01, INV-02, INV-03 | AC-02 | VER-01, VER-02 | unit/contract | foreign credential, raw payload sentinel, source-only location, unknown host | generic redacted denial and zero corpus/canon/database/search/product write |
| Invalid capability boundary | INV-01, INV-02 | AC-02 | VER-01 | contract | undocumented path, HTML page, legacy endpoint, guessed header | `blocked_capability` or `blocked_schema` with preserved prior canon |
| Duplicate replay | INV-04 | AC-03 | VER-02 | integration | matching decision identity then digest mismatch | same receipt for replay; new bounded decision identity for mismatch |
| Concurrent race | INV-04, INV-05 | AC-03 | VER-02 | integration | two callers at the exclusive decision lock | one owner, one `decision_already_running`, zero duplicate write |
| Timeout recovery and load budget | INV-05, INV-06 | AC-03, AC-04 | VER-03 | integration/provider | EPPO API capability timeout at serial load | PERF-01 (`eppo_source_contract_decision_duration`) — `eppo_source_contract_decision_duration` is at most 21600000 ms; `blocked_timeout`, responsive controls, released lock |
| Archive, erasure, or revocation | INV-02, INV-03 | AC-02 | VER-02 | contract | stale source-only value or revoked authority | absence from receipt and no persisted corpus/projection |
| Locale, a11y, degraded operator flow | INV-05 | AC-03 | VER-03 | operator | terminal timeout with cancel and status commands | `timed out` receipt and no browser UI |
| Mainline decision receipt | INV-05, INV-06 | AC-04 | VER-04 | CI/main | implementation SHA and saved Linear body | contained SHA, passing gates, matching serialized description digest |

# Verification commands and required evidence

## VER-01 — Source matrix and redaction contract

- Phase: local
- Proves: `AC-01`, `AC-02`
- Command status: `must_be_added`
- Expected receipt: focused tests prove only official authority, safe terminal
  classes, and zero secret/location/raw-payload disclosure.

```bash
cd apps/web
pnpm exec vitest run scripts/verify-eppo-source-contract.test.ts src/server/catalog-source/eppo-source-contract.test.ts
```

## VER-02 — Replay, lock, and no-write fault proof

- Phase: local/integration
- Proves: `AC-02`, `AC-03`
- Command status: `must_be_added`
- Expected receipt: duplicate, concurrent, malformed, and source-only-location
  fixtures produce one redacted terminal receipt and zero durable corpus writes.

```bash
cd apps/web
pnpm exec vitest run scripts/verify-eppo-source-contract.test.ts --testNamePattern "replay|lock|timeout|redaction|location|no write"
```

## VER-03 — Bounded official capability decision

- Phase: local/provider
- Proves: `AC-01`, `AC-03`, `AC-04`
- Command status: `must_be_added`
- Expected receipt: one serial, read-only official decision uses count-only
  evidence and ends with `contract_approved` or a named blocked state.
- Performance proof: PERF-01 (`eppo_source_contract_decision_duration`) — target `scripts/verify-eppo-source-contract.ts` measures `eppo_source_contract_decision_duration` at most 21600000 ms and records a bounded threshold receipt.
- No-wedge proof: WAIT-01 — target `scripts/verify-eppo-source-contract.ts` injects `EPPO API capability timeout`, proves `terminal SIGINT cancellation command` and `credential-free fixture command` remain responsive, and records a bounded `timed out` receipt.

```bash
cd apps/web
NODE_OPTIONS=--conditions=react-server tsx scripts/verify-eppo-source-contract.ts --mode live-contract --timeout-ms 21600000 --max-attempts 2 --concurrency 1
```

## VER-04 — Repository and final Linear proof

- Phase: local/CI/main
- Proves: `AC-04`
- Command status: `existing`
- Expected receipt: lint, types, tests, build, task validation, diff check,
  main containment, mainline closeout, and serialized Linear description digest
  pass on the implementation SHA.

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

# Delivery, exact-SHA proof, and Linear closeout

- Delivery path: repository_change
- Delivery sequence: current_main -> preserve_local -> issue_branch -> conventional_commit -> branch_push -> pull_request -> exact_head_checks -> capture_feature_sha -> merge_without_bypass -> fetch_main -> containment -> mainline_closeout -> linear_readback -> done
- Issue branch: `codex/ove-253-eppo-source-contract-decision`
- Implementation SHA variable: `OVE253_IMPLEMENTATION_SHA`
- Direct main mutation: forbidden
- Local state preservation: required

Start from current main on `codex/ove-253-eppo-source-contract-decision`. Preserve all unrelated and ignored local files and secrets. Use a Conventional Commit, push, open a PR, and run exact-head checks. Before merge, record `OVE253_IMPLEMENTATION_SHA=$(git rev-parse HEAD)` exactly once in the redacted closeout receipt. Merge without bypass only after every required check passes. After merge, fetch origin/main, run `git merge-base --is-ancestor "$OVE253_IMPLEMENTATION_SHA" origin/main`, and then run `cd apps/web && pnpm mainline:closeout:check`. Perform the final Linear read-back and compare the saved-description SHA-256 before Done.

# Failure gates

Do not start implementation, classify `contract_approved`, merge, deploy, or
mark `Done` when:

- OVE-274 is not `Done`, its redacted receipt/main containment/digest is absent,
  or the OVE-274 -> OVE-253 relation differs from Linear read-back.
- Node is outside 22-24, official licence/OpenAPI/release/closure authority is
  missing, or a capability requires HTML scraping, a browser session, a guessed
  endpoint, or raw corpus acquisition.
- A credential, authorization header, raw payload, user data, precise location,
  source-only occurrence/distribution value, or provider capability URL appears
  in evidence, logs, Linear, canon, tests, or a diff.
- A negative, lock, replay, cancellation, timeout, performance, or zero-write
  proof fails, or a terminal receipt is not deterministic.
- The description contains a placeholder or depends on hidden knowledge.
- Only local/branch/configured proof exists where current-main/CI/provider
  read-back is required.
- The blocker graph is cyclic or saved relations differ from the intended DAG.
- Linear saved-description SHA-256 differs from the validated serialized payload.
- Evidence contains secrets, precise location, raw user content, media keys or
  capabilities, email, IP/user-agent, or stable user identity.

# Required context

Repository authority:

- `AGENTS.md`
- `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`
- `docs/SDD_VERTICAL_SLICE_ROADMAP.md`
- `docs/MAINLINE_CLOSEOUT.md`
- `docs/TECH_STACK_DECISIONS.md`
- `docs/adr/ADR-0014-agentic-stack-realignment.md`
- `docs/INFRASTRUCTURE_REGISTRY.md`
- `docs/EPPO_CREDENTIAL_BOOTSTRAP.md`
- `docs/product-research/CATALOG_SOURCE_READINESS.md`
- `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json`
- `docs/product-research/SPECIES_BACKBONE_POLICY.md`
- `apps/web/src/server/catalog-source/eppo-credentials.ts`
- `apps/web/scripts/verify-eppo-api-access.ts`
- `apps/web/scripts/verify-catalog-sources.ts`

Product research:

- `docs/product-research/README.md`
- `docs/product-research/DB_SEED_AND_DATA-MODEL_SPEC_v1_2.md`
- `docs/product-research/CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md`
- `docs/product-research/CATALOG_SOURCE_READINESS.md`
- `docs/product-research/SPECIES_BACKBONE_POLICY.md`
- `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json`

Linear and external context:

- OVE-274, OVE-253, OVE-254, OVE-255, OVE-250 — read status, title, team,
  project, milestone, priority, labels, full body, and every relation before
  changing OVE-253 state.
- [EPPO Codes](<https://www.eppo.int/RESOURCES/eppo_databases/eppo_codes>)
- [EPPO Global Database](<https://www.eppo.int/RESOURCES/eppo_databases/global_database>)
- [EPPO Data Portal](<https://data.eppo.int/>)
- [EPPO Open Data Licence](<https://data.eppo.int/data/Open_Licence.pdf>)
- [EPPO API v2 OpenAPI](<https://api.eppo.int/gd/v2/eppo_api_gd_v2.yml>)
