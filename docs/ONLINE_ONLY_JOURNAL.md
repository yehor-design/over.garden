# Atomic Online-Only Journal

Status: current after OVE-349
Authority: ADR-0017 and ADR-0019

Journal authoring is transient in the current tab. Before the gardener presses
Publish, OverGarden stores no journal row, media row, server draft, durable
browser draft, or offline mutation. A confirmed atomic Publish is the only
durability boundary.

## Current protocol

1. The shared local composer owns text, `JournalDocumentV1`, media order,
   captions, focal points, cover selection, and browser-generated WebP bytes in
   memory.
2. Each accepted image is converted once in the browser. Those exact WebP bytes
   are previewed and uploaded directly to short-lived private edge staging;
   image bytes never cross a Vercel Function.
3. The create or edit request carries JSON plus bounded signed staging receipts.
   The server validates the entire request and commits the public journal entry,
   final media identities, document order, cover, projection intent, and staging
   finalization job in one Postgres transaction.
4. Any validation, network, database, or provider failure leaves the canonical
   entry unchanged. The local composer remains retryable; removing a failed
   image removes only transient state.
5. Abandon, tab close, locale discard, sign-out, or owner change never creates a
   recoverable draft. Edge staging expires and is cleaned independently.

Create routes accept only public final state. Edit routes update an already
public entry atomically. There is no private toggle or later publish action.
Deletion and erasure remain separate canonical transitions and revoke public
media through the retained lifecycle owner. Under ADR-0021 there is no archive:
an owner delete removes the entry from every product surface at once and leaves
only a scrubbed technical tombstone for at most seven days.

## Retired compatibility boundary

OVE-349 permanently removed the server-draft table/API/repository/hooks, legacy
media reserve/process routes, source-original quarantine, server image decode
and re-encode, admission/quality processing, and private-then-publish controls.
The old draft and media endpoints are terminal absent (`404`) or an explicitly
retained compatibility endpoint may answer `410`; neither may write.

Historical migrations and Done receipts remain provenance only. They are not
runtime authority and must never be copied into a new implementation.

## Current owners and verification

- Local composer: `apps/web/src/lib/garden/use-local-journal-composer.ts`
- Browser final encoder: `apps/web/src/lib/media/browser-journal-image-encoder.ts`
- Edge handoff: `apps/web/src/lib/media/ephemeral-staging-client.ts` and
  `apps/web/cloudflare/media-staging/`
- Atomic create/edit: `apps/web/src/app/api/garden/entries/`
- Persistence: `apps/web/src/server/journal-repository.ts` and
  `apps/web/src/server/journal-document-persistence.ts`

```bash
cd apps/web
pnpm smoke:atomic-journal-edit
pnpm test:media-staging-worker
pnpm media:staging:verify

```

Receipts may contain only closed classes, counts, durations, and digests. They
must not contain journal text, user identity, media/object keys, capabilities,
request metadata, or precise location.
