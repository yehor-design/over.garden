# Offline owner vault

> **Authority status (2026-08-21):** historical and non-operative for new
> product behavior. ADR-0017 supersedes this contract. OVE-322 reuses only its
> exact-owner mechanisms in the temporary read-only bridge documented by
> `docs/LEGACY_DEVICE_DATA_RETIREMENT.md`; OVE-323 removes the remaining runtime
> after cutover. This document preserves implementation provenance and must not
> authorize a new durable browser write.

Status: historical contract superseded by ADR-0017
Authority: Linear OVE-288 plus the modules named below

## Product boundary

Offline drafts, queued mutations, payload-free summaries, composer-durability
records, owner-activity fences, and local photo `Blob`s are physically isolated
per authenticated owner. Ordinary product code can use only the vault activated
for the current authoritative browser session. It cannot accept a database name
or binding from UI input, enumerate origin databases, or probe another owner's
vault.

The physical boundary is defense in depth. Owner predicates remain on every
row and query, but a missed predicate must not turn the former shared browser
database into a cross-account disclosure.

## Binding and names

`apps/web/src/server/offline-owner-vault-binding.ts` derives the stable opaque
binding. The protocol is exactly `ove288.owner-vault-binding.v1`: SHA-256
base64url over a versioned domain separator and the canonical high-entropy
Better Auth user UUID. The 43-character result is a namespace pseudonym, not
an authorization capability. It is stable across session and credential-secret
rotation without depending on an application secret.

`GET /api/offline/owner-vault-binding` is authenticated and returns only the
protocol, binding, and a digest of the current session generation. It is
`private, no-store`. The browser accepts a receipt only when its generation
matches the immediately preceding authoritative session read.

The canonical resolver maps a validated binding to
`overgarden-offline-owner-v1-<binding>`. Raw user ids, session ids, email,
provider identity, tokens, and private content never appear in the physical
name or control database. Binding failure closes the document-local handle and
disables only the dependent offline capability; server-backed authenticated UI,
public navigation, and safe session exit remain available.

## Physical data and control planes

`apps/web/src/lib/offline/owner-vault.ts` owns two separate planes:

- One owner data vault with the v6 logical tables: `drafts`, `mutations`,
  `draftSummaries`, `mutationSummaries`, `composerDurability`, and
  `ownerActivity`.
- The content-free `overgarden-control-v1` database with vault state and writer
  leases only.

Control states are exactly `migration_unstarted`, `copying`,
`conflict_blocked`, `active`, `cleanup_deferred`, `erasure_unconfirmed`, and
`erased_confirmed`. A control record may contain the validated binding,
protocol, bounded state, table counts, SHA-256 digest, timestamps, operation id,
lease expiry, and source-cleanup confirmation. It must not contain an owner or
session id, record key, product payload, `Blob`, error detail, token, cookie,
secret, or precise location.

Current-version data writers take a shared, binding-scoped control lease before
their IndexedDB write transaction and release it in `finally`. Migration and
explicit erasure atomically publish an exclusive intent, reject every new
writer, and then wait within the operation deadline for already admitted writer
leases to settle. The production runtime never falls back to the legacy shared
database. A guarded `NODE_ENV=test` seam exists only to retain historical
logical-isolation regression fixtures.

The service worker remains storage-free. It does not own a Dexie handle, queue,
binding, migration, cleanup, or erasure path.

## Legacy migration

The only recognized source is the known `overgarden-offline` database. The
migrator never enumerates IndexedDB databases and never treats an unknown
database as source material.

For the current owner it:

1. Acquires the exclusive writer fence.
2. Reads a bounded snapshot of at most 10,000 rows across every legacy table.
3. Canonically fingerprints keys and structured-clone values, including exact
   `Blob` bytes and types, outside the IndexedDB transaction.
4. Compares an existing target. A same-key or non-empty divergent target becomes
   `conflict_blocked`; both copies remain.
5. Copies only missing, non-conflicting rows in one target transaction.
6. Commits and closes the target, independently reopens the exact target, reads
   it back, and requires complete source containment with no same-key conflict;
   an exact target has matching per-table counts and aggregate digest.
7. Activates the verified target.
8. Re-reads the source. Cleanup proceeds only when its fresh digest still equals
   the copied snapshot, then repeats that digest comparison inside the exact
   read-write transaction that deletes those keys. A writer committed before
   the transaction is detected; a writer queued after it recreates its row. Any
   mismatch becomes `cleanup_deferred` and both copies remain.

Large cleanup is deferred so initial activation is bounded. A background retry
uses the same exclusive fence and fresh-source comparison. Browser termination,
quota failure, cancellation, late source writes, or a blocked delete therefore
cannot delete the only verified copy. Migration is idempotent: an equal active
target resumes source verification/cleanup, while divergence never becomes
last-write-wins.

The operation deadline is 3,000 milliseconds. Cancellation is checked between
every asynchronous stage; a late completion cannot be promoted to an active or
confirmed receipt.

## Session lifecycle and degradation

The session convergence boundary performs one authoritative session read, then
obtains the matching binding receipt, then hydrates the physical vault. All
queue, draft, summary, durability, activity, inspection, sync, and owner-purge
production paths resolve through the active owner handle.

Ordinary sign-out and account switching never delete a target vault or legacy
rows. They fence the departing generation, retain local work, and close or
deactivate the old document handle. A missing binding, blocked or timed-out
IndexedDB open, or uncertain migration is not an empty-work receipt. The
bounded hydration is cancelled, any late handle is deactivated, and public
navigation, server-backed authenticated UI, and safe session exit remain
available while offline capability is unavailable.

OVE-287 makes ordinary sign-out a synchronous retain-only boundary. Before the
private tree is removed, `sealActiveOwnerVaultsForLocalExit` clears the active
handle map, aborts every captured lifetime, and closes each Dexie handle. It
does not read, count, drain, migrate, upload, publish, or delete a row. A later
authoritative same-owner session may activate the same physical vault; another
owner still resolves only its own opaque database.

## Explicit current-device erasure

The signed-in `/erasure` page has two separate actions:

- The existing non-destructive server erasure request.
- An explicit two-step current-browser cleanup control.

The local control reads a fresh authoritative session and matching binding
before it starts. It persists `erasure_unconfirmed`, acquires the exclusive
fence, closes the exact owner handle, deletes only the resolved target database,
deletes that exact owner's rows from every known legacy table, and then proves
both target nonexistence and zero exact-owner legacy rows independently. Only
that two-surface proof yields `erased_confirmed`. Failure, cancellation, an
unknown schema, a blocked delete, or the 3,000-millisecond deadline remains
`erasure_unconfirmed` and the UI never reports success.

The localized Ukrainian, Bulgarian, and Russian copy names this browser/device
scope explicitly. A server-side account erasure, or an erasure performed on one
browser, cannot claim that another or absent browser's IndexedDB was deleted.
Another owner's target and legacy rows are outside the operation.

## Rollback and recovery

Rollback disables new physical-vault activation in application code; it does
not delete either storage plane. Verified targets and any uncertain legacy
source remain recoverable. Do not clear all IndexedDB, use
`indexedDB.databases()`, delete by a user-provided name, or mark a control record
active/erased manually. A `conflict_blocked`, `cleanup_deferred`, or
`erasure_unconfirmed` state requires a later bounded retry or a separately
reviewed recovery change.

## Verification

```bash
cd apps/web
pnpm exec vitest run \
  src/server/offline-owner-vault-binding.test.ts \
  src/app/api/offline/owner-vault-binding/route.test.ts \
  src/lib/offline/owner-vault.test.ts
pnpm exec vitest run \
  src/lib/offline/owner-session-lifecycle.test.ts \
  src/components/auth/session-convergence-boundary.test.tsx \
  src/app/erasure/page.test.tsx
pnpm exec vitest run src/lib/offline/owner-vault-migration.test.ts
pnpm test:owner-vault-performance
pnpm exec playwright test tests/owner-vault-isolation.spec.ts
pnpm exec playwright test tests/account-sign-out.spec.ts
```

The tests cover stable same-owner binding, session-generation rejection,
physical A/B isolation, content-free control state, writer/exclusive fencing,
exact structured-clone and `Blob` migration, conflict retention, late-writer and
cancellation recovery, 10,000-row bounded performance, ordinary-sign-out
retention, degraded UI availability, exact current-device erasure, another-owner
preservation, and `uk`/`bg`/`ru` scope copy. The full `pnpm test` gate runs the
timing-sensitive 10,000-row proof first with one worker, then skips only its
duplicate inside the massively parallel regression corpus.
