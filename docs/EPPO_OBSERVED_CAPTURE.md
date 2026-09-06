# EPPO observed capture runbook

> Retained under `docs/adr/ADR-0025-stable-registry-retired.md` (2026-09-05):
> the EPPO observed capture, its tables, tooling and credential stay; the
> Stable Registry release model that once consumed them is retired. Read the
> capture and verify steps here as current; ignore any Foundation, edition,
> extension-pack or Release Center step.

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

`capture` creates a new UUID, inventories all ordered pages, queues one detail
unit per observed identifier for each class the run declares, hydrates
documented identifiers serially, re-reads the full ending inventory,
materializes quarantined source records, and completes only when every count
and digest closes.

## A capture that extends another (OVE-394, ADR-0026 D11)

The 2026-09-03 capture took overview, names and taxonomy. Hosts, distribution
and categorization are the three surfaces no taxonomic backbone carries, and
the reason EPPO is on the graph at all, so a second run takes them for the same
identifiers rather than asking the provider for all 129,214 a second time:

```bash
pnpm eppo:observed-capture -- --mode capture --environment local --confirm-environment local --concurrency 1 --request-timeout-ms 15000 --max-attempts 2 --endpoint-classes hosts,distribution,categorization --base-capture df3852ea-3233-4883-8886-92d9e68f5193
```

`--endpoint-classes` takes the short names above or the full class names
(`taxon_hosts`, `taxon_distribution`, `taxon_categorization`); both reach the
database as the full form. Omitted, a run declares the first capture's three.
Every class must be one the API documents, none may repeat, and the plan probes
only the classes the run will queue, so its storage projection describes the
run rather than the vocabulary.

`--base-capture` names the completed run this one extends. Before anything is
written the base capture must be complete, its inventory must still reproduce
the digest it recorded from its own stored pages, and its classes must be
disjoint from the new run's. This is deliberately narrower than `--mode verify`,
which also asserts that nothing in the database changed since that capture
ended: that is the right check the hour a capture finishes and the wrong one
months later, when other slices have legitimately added product rows.

Each capture declares its classes in its plan receipt, and everything that
counts units per identifier reads that declaration through the SQL function
`catalog_capture_declared_classes` rather than the vocabulary. That is what
lets the vocabulary hold six classes while each run holds three: the four
completeness checks that rebuild a source record's payload from its units keep
matching, and a resume queues exactly what the run it resumes declared, never
what a later command line says.

### The capture needs a database nobody else writes to

A capture takes a fingerprint of the product surface — `catalog_items`,
`catalog_item_names`, `catalog_source_links`, `plant_objects`,
`journal_entries`, `job_queue` — when it starts, and refuses to finalize unless
the same fingerprint comes back at the end. That is the zero-product
guarantee: a capture creates evidence and no product.

The check is database-wide, not capture-scoped. **Anything else that writes a
product row while a capture is open makes it impossible for that capture to
finish.** A failed run is immutable by trigger, so there is no recovery: the
units are retained for diagnosis and the run can never be completed.

That is not hypothetical. The first attempt at the second capture,
`19fc0b98-fe02-4c16-bab8-3af55a1e240e`, hydrated all 387,772 units over eight
and a half hours with zero failures and then refused to finalize with
`zero_product_effect_mismatch`, because reconciliation rehearsals on the same
scratch database had added 103,384 catalog items, 183,565 names and 116,213
source links while it ran. The capture had created none of them.

So a capture gets its own database, not the shared scratch one:

```bash
# once, from apps/web
node -e '…create overgarden_eppo_capture and apply every migration…'
pnpm exec tsx scripts/transfer-eppo-capture.ts --mode transfer   --env-file /abs/path/capture-db.env --allow-target-host-class loopback   --confirm-target production --capture-ids <the base capture>
# then point the pinned worktree's own .env.local at that database and run
```

The base capture has to be transferred in first, because `--base-capture`
verifies it where the new run will write. Rehearsals, browser proofs and
reconciliation runs keep using the shared database and cannot reach this one.

The second capture ran on 2026-09-07 as `03cb6ee2-0a87-4ea5-a151-627eaf2b260d`
with 387,772 projected provider requests, from a git worktree pinned at the
commit that carries this tooling, on its own database.

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

## From a capture to a card (OVE-394, ADR-0026 D11)

A capture is evidence, not product. Two jobs turn it into something a gardener
sees, and neither of them calls the provider.

### The transfer

The capture tool refuses a remote host, so a capture can only be taken on a
loopback database and has to be moved deliberately:

```bash
pnpm exec tsx scripts/transfer-eppo-capture.ts --mode inventory --env-file /abs/path/prod.env
pnpm exec tsx scripts/transfer-eppo-capture.ts --mode transfer --env-file /abs/path/prod.env --confirm-target production
```

It copies exactly the rows two capture ids reach — the snapshots, the runs, the
units, the source records, any source links and the two public archive tables —
in the order the foreign keys allow, one transaction per table, with every
insert idempotent and a before-and-after row count per table as its receipt. The
source comes from this checkout's own `.env.local` and must be loopback; the
target comes from the pulled production environment and must not be. Never a
blind `pg_restore`: production already holds source snapshots from earlier
imports whose unique keys would collide.

Rows travel as JSON and Postgres rebuilds them with `jsonb_populate_record`.
Half of what moves is a `jsonb` column that usually holds a JSON *array*, and a
driver that sees a JavaScript array in a parameter sends a Postgres array
literal instead — the insert would fail on the first names payload.

### The reconciliation

`services/matching/app/eppo_reconcile.py`, run by the worker on a
`catalog_source_refresh` job with `source_slug = 'eppo-codes'`, or by hand:

```bash
cd services/matching
.venv/bin/python -m scripts.reconcile_eppo --database-url "$DATABASE_URL"
```

Every active identifier climbs the deterministic ladder of ADR-0026 D4:

1. the `eppo` identifier the Wikidata crosswalk already wrote;
2. the scientific name with its authorship, inside one kingdom;
3. the canonical name with the rank, inside one kingdom;
4. the Catalogue of Life checklist itself — a single matching usage is
   materialized through `catalog_col_ensure_node`, so the node arrives with the
   backbone's classification and a `col` identifier;
5. a species the checklist does not have at all becomes a node from EPPO, with
   the kingdom EPPO gives and no `col` identifier. Viruses, viroids and the
   animal pests the scoped Catalogue of Life ingest leaves out have nowhere
   else to come from, and `pest_of` needs both ends.

Anything ambiguous, and any higher taxon nothing knows, becomes a `source_link`
item in the owner's queue ordered by how many EPPO hosts it touches. A node
that fails to link keeps working; curation never blocks a gardener (D5).

What a linked node gains: the `eppo` identifier, a source link, vernaculars in
the four languages the ledger accepts, `pest_of` relations to its hosts with
EPPO's host class on the closed set of migration 0054, `distribution_status`
facts carrying EPPO's wording beside a normalized presence, and `categorization`
facts recording the quarantine lists.

One identifier is the unit of work: its ladder decision, identifier, names and
facts land together or not at all. The worker hands its handlers an autocommit
connection, so a run interrupted halfway leaves whole taxa behind it, and every
write is idempotent, so the next run finishes what it started.

### What a card shows

A presence badge for Ukraine and Bulgaria at country level, with EPPO's verbatim
status and the observation date beside the word; the pest or disease label from
the kingdom and the host role; the hosts and pests sections; and the attribution
line the licence requires, dated by the day the data was downloaded rather than
the day it was last reconciled. Sub-national units stay in the source layer:
D11 stops the product at the country.

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

The 2026-09-04 completed capture observed 129,214 rows: 121,777 active
identifiers matching the current OpenAPI `[0-9A-Z]{5,6}` pattern, 6,329
inactive identifiers with that documented shape, and 1,108 inactive
legacy-shape identifiers. Of the legacy set, 1,048 are bounded alphanumeric
values with historical lengths outside the current constraint and 60 use only
the observed legacy separators `.`, `!`, `:`, or `/`. Against the 2026-08-25
shape read of 129,211 rows the corpus moved by exactly three active
identifiers in nine days; the inactive and legacy counts did not move. Treat
these as sizing inputs, not as expected membership: the receipt is
`docs/EPPO_OBSERVED_CAPTURE_PROOF_2026-09.md`.

One documented field is still unclassified. `infos` on the `overview` response
falls in neither the public nor the source-only list, so it stays `unknown`:
present in raw evidence, copied into no projection. It cannot pass
`rights_cleared_source_public` without an explicit decision.

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
