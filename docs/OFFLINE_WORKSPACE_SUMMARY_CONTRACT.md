# Offline workspace summary contract

> **Authority status (2026-08-21):** historical and non-operative for new
> product behavior. ADR-0017 supersedes this local-summary contract. The
> temporary OVE-322 banner follows `docs/LEGACY_DEVICE_DATA_RETIREMENT.md`, not
> this former workspace UI contract. OVE-323 owns removal and fixture
> repinning; the text below remains implementation provenance, not an
> instruction to create or extend offline capture.

## Purpose

The authenticated garden workspace may show that device-local drafts or queued
mutations exist. It must not load canonical IndexedDB records merely to render
that awareness UI: canonical records can contain journal prose, structured
documents, mention selections, photo intents, Blob data, and media references.

`apps/web/src/lib/offline/queue.ts` owns the payload-free summary projections
and the internal composer-durability metadata. `apps/web/src/lib/offline/drafts.ts`
owns the bounded draft-summary reader and the exact composer write/read-back
protocol. `apps/web/src/lib/offline/owner-vault.ts` owns the authenticated
physical owner resolver and writer fence. The workspace owns presentation only;
composers and sync continue to read canonical records through owner-scoped paths
inside the currently active physical vault.

## Stored projections

The historical shared Dexie schema version 5 added `draftSummaries` and
`mutationSummaries`. Each canonical write, status update, or deletion updates
its summary in the same IndexedDB transaction. The legacy version upgrade
derives a summary locally from each existing canonical row and writes only the
fields below.

Legacy Dexie schema version 6 added `composerDurability`. OVE-288 preserves the
same six-table logical schema inside each opaque owner-only physical vault. On
first authoritative bootstrap it copies and independently fingerprints exact
owner rows from only the known shared legacy database before activation; see
`docs/OFFLINE_OWNER_VAULT.md`. Version 6 does not infer durability for existing
drafts: a legacy draft without an exact receipt makes a later owner-work
inspection unavailable with `flush_unconfirmed`. This is intentional; absence
of evidence is never translated into an empty or safe inventory.

| Projection                     | Allowed fields                                                                                                                                                          | Prohibited fields                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Draft                          | owner id, record id, kind, creation/update time, entry date, target object or space id                                                                                  | title, body, document, mentions, catalog query/name, photo intent, cover, Blob, media URL/key, coordinates |
| Mutation                       | owner id, record id, kind, status, timestamps, target kind, target object or space id, derived numeric active flag for IndexedDB ordering                               | payload, sync result, error detail, photo intent, Blob, media URL/key, coordinates                         |
| Composer durability (internal) | exact owner/draft compound key, opaque participant nonce, generation, disposition, framed stored-byte length and SHA-256 digest, vault/protocol generation, update time | draft payload, content, Blob bytes, media key/URL, filename, route, session identity, coordinates          |

The numeric active flag is a non-content IndexedDB sort key. IndexedDB compound
keys do not support boolean values; `1` means a workspace-visible non-synced
status and `0` means synced. It is derived exclusively from `status` and is not
rendered or exposed as product data.

The owner/draft compound key is an internal storage boundary needed to prove an
exact read-back; it is never copied into an emitted inspection receipt. Emitted
receipts contain only bounded enums, opaque revisions/generations, byte counts,
and digests. They contain no owner or session identity, draft id, content,
filename, route, media key, Blob bytes, or precise location.

## Exact composer durability

- Each mounted production journal composer uses the durable persistence
  controller and owns one opaque participant nonce plus a monotonically
  increasing snapshot generation.
- A non-empty write fingerprints the exact structured-clone graph (including
  Blob bytes) with deterministic type/length framing. One IndexedDB transaction
  commits the canonical draft, its workspace summary, and its internal
  durability metadata.
- Callback completion alone is not durability. A separate read transaction must
  retrieve the exact owner/draft record and the matching participant/generation
  metadata, then recompute and match the stored payload fingerprint. Only then
  may the controller advance its persisted generation.
- An empty composer deletes the canonical draft and summary while atomically
  writing a matching deletion tombstone. A separate read verifies both draft
  absence and the exact tombstone.
- Any ordinary write or deletion that cannot supply exact generation evidence
  invalidates older durability metadata in the same transaction. Stale metadata
  can therefore never attest to newer work.
- Schema drift, owner/draft drift, a stale generation, failed post-commit
  read-back, unavailable Blob bytes, or contact with the traversal bound is
  unconfirmed. The latest generation stays retryable.

## Background owner-work inspection

`OwnerWorkInspectionV2` is a total union:

- `complete` contains an exact-owner, exhaustive, cycle-safe inventory of
  drafts, queued/syncing/failed mutations, media, privacy-blocked rows, and
  redacted composer receipts.
- `unavailable` contains only one bounded reason. It carries no counts, clean,
  empty, or destructive authority.

Synced mutation rows are no longer owner work, but their retained canonical
payloads remain privacy-sensitive. Inspection deliberately does not traverse
them; it increments `privacyBlocked` once per withheld row. Drafts and active
mutations are traversed until the pending graph is empty. Contact with the hard
graph or row bound returns `inventory_bounded`, never a partial count marked
complete. Production table reads are capped with a sentinel, and the combined
draft/mutation/durability-row budget is bounded before any receipt is admitted.

The canonical drafts, mutations, and durability records are captured for one
owner in one read transaction. Participant mount/dispose, a new composer
generation, explicit abort, schema/owner drift, or any late completion
invalidates the result. Inspection settles once and is capped at 5,000
milliseconds.

Inspection is evidence-only background work. Sign-out never awaits or consumes
its result, always retains local work, and provides no inspection modal,
warning, retry, analytics event, payload log, sync-first choice, or purge path.

## Read and lifecycle rules

- Ordinary production reads and writes resolve only the physical vault activated
  by the current authoritative session plus same-generation server binding.
  They never enumerate databases or fall back to the shared legacy database.
- Current-version write transactions take a binding-scoped writer lease. An
  exclusive migration/erasure fence rejects new writers until it settles.
- Workspace readers receive at most 24 rows plus one sentinel per request, with
  an explicit page number capped at 100. They never query `drafts` or
  `mutations` for list rendering.
- Summary queries are owner-scoped. Invalid or missing owners return an empty
  page without opening a broad collection.
- Sync state transitions, draft deletion, and session-change purge delete or
  replace canonical, summary, and applicable durability rows together in one
  transaction.
- On a new owner render, the previous owner’s in-memory workspace projection is
  hidden synchronously. A late IndexedDB result may only update the still
  mounted matching owner.
- Local change, focus, and connection events are debounced for 100 milliseconds.
  While a read is in flight, any event storm schedules at most one follow-up
  read; there is no polling or unbounded retry.
- Ordinary sign-out retains the owner vault. Only the separate explicit
  current-device erasure control can delete it, and only a two-surface absence
  read-back may report confirmation.

## Verification

Focused offline and workspace tests prove physical A/B isolation, payload
exclusion, the 24-row bound, migration/write pairing, exact composer commit plus independent read-back,
stale-receipt invalidation, complete-or-unavailable inspection, traversal-bound
contact, explicit cancellation, late-result rejection, deletion and owner-purge
pairing, event coalescing, unmount fencing, and immediate cross-owner in-memory
hiding. Sign-out tests prove all inspection outcomes remain invisible and
non-blocking in `uk`, `bg`, and `ru`. The server workspace tests separately
prove a 1,200-millisecond independent section deadline, and activation analytics
run after the response so they cannot delay the workspace render.
