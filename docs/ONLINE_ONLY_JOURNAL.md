# Online-only journal save protocol

Status: server draft protocol implemented by OVE-321 and activated across all
four composer journeys by OVE-325. OVE-323 removed OVE-322's temporary content
bridge and the complete offline/PWA runtime; the reduced exact-name cleanup is
documented in `docs/LEGACY_DEVICE_DATA_RETIREMENT.md`.

ADR-0017 is the connectivity authority. A journal change is durable only after
the server returns an authoritative receipt. Browser memory may keep the text
visible in the current tab after a failed request, but it is not durable and is
never described as saved, queued, pending sync, or available offline.

## Persistence boundary

`journal_entry_drafts` stores one private JSON draft per authenticated owner and
exact composer context. The row carries:

- a bounded route key and one kind from `first_entry`, `follow_up`,
  `space_entry`, or `edit_entry`;
- only the context IDs legal for that kind;
- normalized `JournalEntryDraftPayloadV1` JSON at schema version `1`;
- a positive client generation, SHA-256 payload digest, positive server
  revision, and server timestamps.

The `(owner_user_id, draft_key)` uniqueness constraint and transaction-scoped
advisory lock serialize first-write races, including when no row exists yet.
The owner foreign key cascades on account deletion. Space, object, and entry
context foreign keys cascade when the target is deleted, so a draft cannot
survive physical target deletion. Archiving a journal entry explicitly deletes
its owner-scoped edit draft in the archive transaction. All repository queries
include `owner_user_id`; an unowned or missing target is never adopted.

Canonical keys are:

| Kind          | Key                               | Required context              |
| ------------- | --------------------------------- | ----------------------------- |
| `first_entry` | `first-entry`                     | optional owned `spaceId` only |
| `follow_up`   | `follow-up-entry:<plantObjectId>` | owned `plantObjectId`         |
| `space_entry` | `space-entry:<spaceId>`           | owned `spaceId`               |
| `edit_entry`  | `edit-entry:<journalEntryId>`     | owned active `journalEntryId` |

## HTTP contract

`GET`, `PUT`, and `DELETE /api/garden/drafts/[draftKey]` require the official
Better Auth session plus the signed document-mutation generation header. The
admission check runs before request content is parsed. Every response is
`Cache-Control: private, no-store`.

`PUT` accepts the draft kind, exact context, typed payload, positive generation,
payload SHA-256, and expected server revision. The route:

1. bounds transport bytes before JSON parsing;
2. rejects unknown protocol fields and invalid kind/context combinations;
3. normalizes a supplied `JournalDocumentV1`;
4. applies the precise-location text firewall to every draft string;
5. enforces the shared publication/draft payload budget;
6. independently recomputes and compares the SHA-256 digest;
7. delegates the owner-scoped CAS write.

CAS outcomes are deterministic:

- no row plus no expected revision inserts revision `1`;
- the same generation and hash replays the existing receipt;
- a lower generation returns the newer authoritative receipt without
  overwriting it;
- the same generation with a different hash returns `409`;
- a higher generation updates only when its expected revision equals the
  current server revision;
- missing or stale expected revision returns `409`.

`DELETE` consumes only the exact generation, hash, and server revision last
confirmed by the server. A missing owner-scoped row is a generic `404`.
Conflicts expose only bounded generation/hash/revision/timestamp metadata, not
the current private payload.

Stable response classes are `200`, generic `404`, `409` CAS/hash conflict,
`413` size refusal, safe `400`, `401`, `403`, and `500`. Precise-location
refusals use the existing localized safe copy and never echo rejected text.

## Client ownership and failure semantics

`online-journal-draft.ts` is the single request owner for one composer context.
It uses one `AbortController`, a maximum two-second draft deadline, signed
document-generation fencing, and late-response suppression. It performs no
automatic replay. A failed or timed-out request becomes a typed
`connection_required` state and may be repeated only by an explicit retry;
that retry reuses the exact serialized generation/hash request. Simultaneous
retry actions coalesce into one in-flight transport.

`online-journal-submit.ts` publishes through the existing create or aggregate
edit API with the stable `clientMutationId`. It never creates an offline queue.
After an idempotent publication response it deletes the exact confirmed draft
and reads generic absence back. If consumption cannot be confirmed, the result
stays explicitly retryable; repeating publication is safe because the same
mutation ID and request body are reused.

Neither module reads network-state hints or imports Dexie, IndexedDB,
`localStorage`, `sessionStorage`, or `src/lib/offline`. Media `File`/`Blob`
ownership remains transient in the active online tab; only processed media IDs
may appear in the JSON draft.

`use-online-journal-composer.ts` is the shared UI owner for first entry,
follow-up, space entry, and edit. It hydrates before enabling the editor,
debounces the first semantic change by 250 ms, renders the acknowledged server
timestamp, and makes a bounded keepalive attempt when the document is hidden or
unloaded. A request failure freezes only that composer, marks the tab title as
not saved, retains current-tab memory, and keeps retry, copy, cancel, and
navigation controls available. Retry is explicit and single-flight; online or
offline browser events never cause replay.

The authenticated workspace lists owner-scoped server drafts and resumes their
exact route contexts. The four composer callers, workspace panel, cover
controls, and photo selectors create no durable browser journal state. No
production module imports the historical offline runtime. New documents expose
no manifest, installable PWA shell, legacy worker registration, or retired
icons. The separate dependency-free exact-name cleanup reads no journal
content and is not an authoring owner.

Current final journal publication and both media mutation routes send the
positive `x-overgarden-online-journal-protocol` marker. An authenticated
request without the exact current value is rejected with private/no-store
`409 legacy_client_retired` before private payload parsing or any effect. The
journal request body has no connectivity or synchronization status contract.
This cutoff is a compatibility refusal, not a replay or synchronization path.

## Payload budget

`JOURNAL_ENTRY_PAYLOAD_MAX_BYTES` is the semantic JSON budget shared by draft
content and final create/edit publication. The draft transport envelope has a
small separate defensive allowance, so wrapper fields cannot make the draft
content budget smaller than the publication budget. The supported structured
document ceiling of 100 blocks and 10 inline image references is covered by the
route tests.

## Deployment and rollback

The additive migration is `apps/web/sql/0029_online_journal_drafts.sql` and the
same current shape is present in `0001_walking_skeleton.sql`. Normal bootstrap
is repeatable and generated Kysely types must match the live schema.

OVE-321 deployed the additive schema and route/client protocol. OVE-325
activated it atomically across all four composers. Rollback must preserve the
table and route until affected composer traffic has stopped; dropping the table
or bulk-deleting drafts requires separate maintainer sign-off.

No closeout may claim that legacy browser data was remotely removed. Devices
that never reconnect cannot be inspected or cleaned by the server. OVE-322's
temporary content-transfer bridge is historical after OVE-323. The surviving
localized boundary deletes only exact known physical names, retains unresolved
or unrelated state, and requires two physical absence reads. It does not
restore a bridge, runtime package, PWA surface, or service-worker asset.
