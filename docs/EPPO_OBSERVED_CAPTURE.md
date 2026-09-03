# EPPO observed capture runbook

Owner: OVE-254

Authority: ADR-0016 and `docs/STABLE_REGISTRY.md`

Runtime: local or another separately approved ingestion runtime; OVE-254
refuses production database mutation.

## Purpose and boundary

The command in this runbook creates one immutable, OverGarden-owned
observation of the documented EPPO API v2 list, overview, names, and taxonomy
surfaces. It does not create an official EPPO release. It writes only
`catalog_source_capture_*`, `catalog_source_snapshots`, and quarantined
`catalog_source_records` rows. It does not write catalog identities, active
release pointers, gardens, journals, queues, public routes, analytics, or
Meilisearch.

The official EPPO Open Data Licence requires attribution. Credentials, raw
responses, record names, occurrence/distribution location, request headers,
and restricted fields stay out of console output, Git, Linear, analytics, and
public/search projections.

## Preconditions

1. Start from the exact OVE-254 implementation revision on a clean checkout.
2. Use a dedicated local Postgres database with enough disposable headroom.
3. Load `EPPO_DATA_PORTAL_API_KEY` from the encrypted provider/runtime secret
   store. Never paste or echo it into a command, file, issue, or receipt.
4. Keep all database connection resolution on loopback. The command rejects a
   remote hostname even when both environment flags say `local`.
5. Use exactly concurrency `1`, request timeout `15000`, and maximum attempts
   `2`. These values are enforced, not advisory.

## Commands

Run from `apps/web`:

```bash
pnpm eppo:observed-capture -- --mode plan --environment local --confirm-environment local --concurrency 1 --request-timeout-ms 15000 --max-attempts 2
pnpm eppo:observed-capture -- --mode capture --environment local --confirm-environment local --concurrency 1 --request-timeout-ms 15000 --max-attempts 2
pnpm eppo:observed-capture -- --mode resume --environment local --confirm-environment local --concurrency 1 --request-timeout-ms 15000 --max-attempts 2 --capture-id <capture-uuid>
pnpm eppo:observed-capture -- --mode verify --environment local --confirm-environment local --concurrency 1 --request-timeout-ms 15000 --max-attempts 2 --capture-id <capture-uuid>
```

`plan` performs no database mutation. It revalidates the official OpenAPI and
licence digests, the four documented capability classes, the start and tail
list boundaries, one bounded detail sample, projected request volume, database
size, and filesystem headroom.

`capture` creates a new UUID, inventories all ordered pages, queues three
detail units per observed identifier, hydrates documented identifiers
serially, re-reads the full ending inventory, materializes quarantined source
records, and completes only when every count and digest closes.

Inventory requests pin the documented `orderBy=eppocode&orderAsc=true`
contract, and the capture preserves the returned sequence byte-for-byte. It
does not locally re-sort it: retired punctuated identifiers use an upstream
collation that differs from JavaScript collation. Duplicate detection, exact
page replay, and equal full start/end sequence digests remain the closure
controls.

`resume` accepts a checkpointed planned, inventorying, paused, hydrating, or
verifying run whose tool, OpenAPI, and licence digests still match. Inventory
pages replay by exact digest before hydration continues; completed endpoint
units are immutable and skipped. Entering hydration it returns transport-failed
units to the queue with a fresh attempt budget, once, before it claims anything.
A stale claim older than 300 seconds returns to pending only when it still has
an allowed attempt.

The advisory lock and every checkpoint, claim, and completion operation share
one pinned database executor. This remains live with a pool size of one and
prevents the writer from waiting on a second connection that it already owns.

`verify` performs an independent database read-back of both inventory digests,
normalized source-record count, terminal/rights vectors, manifest digest, and
the zero-product fingerprint.

During a long run, this read-only status command remains usable from another
terminal:

```bash
pnpm eppo:observed-capture -- --mode verify --environment local --confirm-environment local --concurrency 1 --request-timeout-ms 15000 --max-attempts 2 --capture-id <capture-uuid> --status-only
```

## State and recovery contract

Run states are `planned -> inventorying -> hydrating -> verifying -> completed`.
Hydration or verification can become `paused` on operator cancellation, on the
24-hour job deadline, or on an exhausted transport budget, and resume through
`hydrating`. Non-recoverable provider/schema drift, refused evidence, or work
that cannot be re-observed becomes `failed`. A completed run and all successful
terminal units are immutable.

Exact page replay is accepted only when the canonical response SHA-256 is
identical. A changed page digest fails the run; it never overwrites prior
evidence. Upstream start/end total or full-inventory digest drift also fails
closure. A later observation uses a new capture UUID and may supersede a prior
completed capture only through explicit successor linkage.

HTTP 429, 5xx, network failure, and timeout are retryable within the two-attempt
budget, and that budget belongs to one invocation rather than to the identifier
for the life of the capture. A unit that spends both attempts on those classes
was never observed: no documented response was refused and nothing was written.
The run therefore checkpoints as `paused` with `capture_transport_budget_exhausted`
instead of failing, and the next `--mode resume` returns exactly those units to
the queue with a fresh budget before it claims anything. Terminal units are out
of reach of that reclaim, so it can only ever re-observe what was never
observed.

Authentication, authorization, response schema, digest mismatch, and
environment errors are terminal and fail the capture closed; a unit refused on
its own evidence keeps that failure and is never returned to the queue. SIGINT
aborts the active request, fences late writes, and leaves completed checkpoints
intact.

The second attempt on a transport class waits before it is spent — two seconds
for a timeout, network failure, or 5xx, one second for a 429, and longer when
the provider declares a longer `Retry-After` — because the first failure of
those classes is usually a moment rather than a state.

## Rights and identifier classification

Each documented response field receives exactly one class:
`source_public`, `source_only`, `forbidden`, or `unknown`. Raw JSON stays only
in source tables. A separately stored `allowed_projection` contains only
`source_public` leaves; source-only values are split into
`source_only_fields`; unknown and forbidden values are not copied out of raw
evidence.

The latest 2026-08-25 full ordered-list shape read observed 129,211 rows:
121,774 active identifiers matching the current OpenAPI `[0-9A-Z]{5,6}`
pattern, 6,329 inactive identifiers with that documented shape, and 1,108
inactive legacy-shape identifiers. Of the legacy set, 1,048 are bounded
alphanumeric values with historical lengths outside the current constraint and
60 use only the observed legacy separators `.`, `!`, `:`, or `/`.

Every list row must carry a boolean `is_active`. Only a documented-shape active
identifier queues detail requests. A documented-shape inactive row becomes
`inactive_eppo_identifier`; a bounded 1-10 character inactive legacy row
becomes `legacy_schema_exception`. Both receive three terminal
`not_applicable`/`not_requested` units without a detail request. Any active
legacy, missing-state, lowercase, whitespace, oversized, or different-alphabet
exception fails closed. These source-only exceptions cannot become release
members or product identities without a later explicit identity/eligibility
decision.

## Safe receipts and completion

Console receipts may contain only capture UUID, authority/environment class,
phase/state, aggregate counts, request/storage budgets, UTC window, SHA-256
digests, rights vectors, and zero-effect classes. They never contain a
credential, raw payload, source name/record, precise location, header, URL
capability, user identity, or product content.

A completed receipt proves all of the following together:

- ordered list pages close to one unique start inventory;
- every expected detail unit has one immutable terminal classification;
- the ending total and full ordered-inventory digest equal the start values;
- one quarantined normalized source record exists per observed identifier;
- the before/after fingerprints of product, user, queue, and source-link
  owners are identical;
- product and search mutation counts are zero.

An HTTP success, provider total, last-page read, fixture, configured key, or
partial source row is not completion proof.

## Fixtures and rollback

The timeout fixture proves the 15-second instrument through a shorter injected
deadline, cancellation responsiveness, status responsiveness, and late-write
rejection. The complete fixture proves exact inventory replay after restart,
hydration interruption/resume, single-writer exclusion, normalized source
closure, and zero product effect. The drift fixture proves that changed
evidence is rejected rather than overwritten. The transport fixture proves the
boundary between an interruption and a refusal: an exhausted transport budget
pauses, reclaims exactly the unobserved unit, and still closes on the same
inventory digest, while a unit refused on its own evidence is retained as
failed and its capture stays closed against it.

```bash
pnpm eppo:observed-capture -- --mode capture --environment local --confirm-environment local --concurrency 1 --request-timeout-ms 15000 --max-attempts 2 --fixture timeout
pnpm eppo:observed-capture -- --mode capture --environment local --confirm-environment local --concurrency 1 --request-timeout-ms 15000 --max-attempts 2 --fixture complete
pnpm eppo:observed-capture -- --mode capture --environment local --confirm-environment local --concurrency 1 --request-timeout-ms 15000 --max-attempts 2 --fixture drift
pnpm eppo:observed-capture -- --mode capture --environment local --confirm-environment local --concurrency 1 --request-timeout-ms 15000 --max-attempts 2 --fixture transport
```

Rollback is fail-closed: stop the process, retain immutable evidence for
diagnosis, and leave the active catalog unchanged. Disposable local fixture
databases may be dropped only after their required receipt is retained. OVE-254
does not authorize production cleanup, destructive schema changes, or deletion
of a completed capture.
