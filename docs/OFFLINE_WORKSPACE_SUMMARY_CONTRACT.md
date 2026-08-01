# Offline workspace summary contract

## Purpose

The authenticated garden workspace may show that device-local drafts or queued
mutations exist. It must not load canonical IndexedDB records merely to render
that awareness UI: canonical records can contain journal prose, structured
documents, mention selections, photo intents, Blob data, and media references.

`apps/web/src/lib/offline/queue.ts` owns the payload-free summary projections.
`apps/web/src/lib/offline/drafts.ts` owns the bounded draft-summary reader. The
workspace owns presentation only; composers and sync continue to read canonical
records through their existing owner-scoped paths.

## Stored projections

Dexie schema version 5 adds `draftSummaries` and `mutationSummaries`. Each
canonical write, status update, or deletion updates its summary in the same
IndexedDB transaction. The version upgrade derives a summary locally from each
existing canonical row and writes only the fields below.

| Projection | Allowed fields                                                                                                                            | Prohibited fields                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Draft      | owner id, record id, kind, creation/update time, entry date, target object or space id                                                    | title, body, document, mentions, catalog query/name, photo intent, cover, Blob, media URL/key, coordinates |
| Mutation   | owner id, record id, kind, status, timestamps, target kind, target object or space id, derived numeric active flag for IndexedDB ordering | payload, sync result, error detail, photo intent, Blob, media URL/key, coordinates                         |

The numeric active flag is a non-content IndexedDB sort key. IndexedDB compound
keys do not support boolean values; `1` means a workspace-visible non-synced
status and `0` means synced. It is derived exclusively from `status` and is not
rendered or exposed as product data.

## Read and lifecycle rules

- Workspace readers receive at most 24 rows plus one sentinel per request, with
  an explicit page number capped at 100. They never query `drafts` or
  `mutations` for list rendering.
- Summary queries are owner-scoped. Invalid or missing owners return an empty
  page without opening a broad collection.
- Sync state transitions, draft deletion, and session-change purge delete or
  replace canonical and summary rows together in one transaction.
- On a new owner render, the previous owner’s in-memory workspace projection is
  hidden synchronously. A late IndexedDB result may only update the still
  mounted matching owner.
- Local change, focus, and connection events are debounced for 100 milliseconds.
  While a read is in flight, any event storm schedules at most one follow-up
  read; there is no polling or unbounded retry.

## Verification

Focused offline and workspace tests prove payload exclusion, the 24-row bound,
migration/write pairing, deletion and owner-purge pairing, event coalescing,
unmount fencing, and immediate cross-owner in-memory hiding. The server
workspace tests separately prove a 1,200-millisecond independent section
deadline, and activation analytics run after the response so they cannot delay
the workspace render.
