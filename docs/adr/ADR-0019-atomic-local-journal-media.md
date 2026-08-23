# ADR-0019 — Atomic local journal authoring and client-final WebP publication

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision owner:** OVE-345
- **Decision version:** `ove345.atomicJournalMediaCanon.v1`
- **Supersedes:** the target-state server-draft clauses of ADR-0017; the
  consolidated claim that client image processing cannot establish the final
  media artifact; ADR-0014's quarantine-first/worker-derivative target; and
  ADR-0015 clauses that assign future upload processing to the legacy media
  boundary. Historical implementation receipts remain readable facts.
- **Preserves:** ADR-0017's network-required success semantics and ban on
  durable browser journal storage; ADR-0018's format-conversion-only posture,
  serve-under-uncertainty decision, measured public indexability threshold,
  and in-product admin boundary; `JournalDocumentV1`; the precise-location
  firewall; scoped server data access; erasure, archive, revocation, and public
  projection convergence.

## Context

ADR-0017 removed the durable browser write plane by moving draft persistence to
the server. ADR-0018 subsequently selected format-conversion-only media but did
not decide which side owned the final WebP or how a journal entry and its images
became visible together. The transitional runtime therefore has two pieces of
durable pre-publication state: server journal drafts and quarantine-backed media
rows. It also re-encodes images on the server before a later publish operation.

That topology creates product and operational states the current MVP no longer
wants: a durable record exists before the gardener chooses Publish, media can be
ready independently of the exact document snapshot, and a later agent can read
the online-only decision as a requirement to preserve server drafts forever.
It also tempts a single-request design in which large image bytes cross a Vercel
Function, despite the app's existing direct object-storage transport and the
platform's bounded Function request body.

The selected behavior is one transient composer and one terminal publication
moment. The gardener may write and arrange media while the tab remains alive,
but only Publish is a durable product mutation. The browser produces the exact
final WebP early, stages it privately outside Vercel, and publishes text plus
ordered ready media as one final public record.

## Decision

Journal authoring is **local-only and non-durable before Publish**. Local means
ephemeral in-memory state owned by the currently open tab: Lexical editor state,
the current `JournalDocumentV1` snapshot, source `File`/`Blob` objects, preview
URLs, encode/upload progress, ordering, and retry state. It does not mean
IndexedDB, Cache Storage, localStorage, OPFS, a service worker, a local mutation
queue, a server draft, or another recoverable write plane.

The **browser-generated WebP is the sole final artifact**. A dedicated lazy
Web Worker decodes, orients, bounds, and converts each accepted source into one
WebP under the OVE-347 codec policy. The exact resulting Blob is previewed,
hashed, staged, promoted, stored, and served. Neither the staging Worker nor the
Vercel application decodes or re-encodes it. Metadata omission may be an encoder
property, but it is not a separate admission promise. Source/original image
bytes are never retained by the target product.

Publish is one user-visible action and one atomic product result, not one HTTP
request. Small authenticated JSON may cross Vercel; image bytes never traverse
a Vercel Function. The browser uploads each final WebP directly to private
Cloudflare staging through one narrow, object-specific capability. A later
bounded publish protocol claims those exact receipts, promotes the exact bytes,
commits the canonical database state, and finalizes staging reconciliation.

Every successfully created journal entry is a final public record. There is no
product content-privacy toggle, pending-media card, private-then-public entry,
or durable draft state in the target. Public discoverability remains separate:
the entry is a public candidate, while indexing still depends on
`PUBLIC_SURFACE_INDEXABILITY_THRESHOLD` and canonical projection state.

## Product behavior

1. Opening a create composer allocates only tab-memory identifiers and an
   authenticated staging session; it creates no journal, draft, or media row.
2. Typing changes only the in-memory `JournalDocumentV1` snapshot.
3. Selecting, pasting, or dropping a supported image inserts an ordered image
   skeleton immediately. A dedicated Worker produces the final WebP. Reorder
   changes document position only and never re-encodes or re-uploads ready bytes.
4. The final WebP preview replaces the skeleton and is staged directly through
   the OVE-346 capability. Replacement increments that media identity's
   generation; remove requests deletion of the current staged generation.
5. Publish remains available while work is pending. Activating it freezes one
   exact document/media snapshot, displays one bounded progress state, and
   waits for every current generation. Retry, remove, and cancel remain usable.
6. Success creates or edits exactly one public journal record whose ordered
   image references are all final-ready. The gardener returns to the validated
   same-origin location and can read the complete result there.
7. A codec, staging, claim, promotion, database, projection-intent, or finalize
   failure removes the progress state and leaves no new visible record or
   partial edit. The gardener can retry, replace/remove a failed image, cancel
   Publish, or close the composer and lose the transient text.
8. Navigation, reload, tab closure, browser loss, device loss, and network loss
   may discard unpublished text. This is an accepted consequence, not an
   offline-recovery promise. Abandoned staged WebPs are reclaimed separately.

## Canonical document and identity contract

`JournalDocumentV1` remains the sole persistence, API, owner-read, public-read,
privacy-traversal, and search-input document. Lexical state, node keys, DOM,
selection, history, preview URLs, source files, and staging capabilities never
cross that durable boundary.

An image block continues to contain only its stable `mediaAssetId`. Before
Publish that UUID is a tab/staging protocol identity, not a Postgres row. The
current generation, digest, dimensions, size, and receipt live in transient
composer or Cloudflare staging state. At a successful commit, the same UUID is
materialized as the final media row and bound to the ordered image block.

The frozen publication snapshot is identified by one `publishId`. A publish
request binds the actor, operation kind, target where applicable, canonical
document hash, ordered media identities and generations, and expected entry
revision. An identical replay returns or resumes the same terminal result. A
payload, generation, target, owner, or revision mismatch is a closed conflict.

## Ephemeral Cloudflare staging contract

OVE-346 owns exactly these production identities:

- private R2 Standard bucket `overgarden-media-staging`;
- Worker `overgarden-media-staging` on `media-stage.over.garden`;
- SQLite-backed Durable Object namespace `MEDIA_STAGING_SESSIONS`.

The Vercel reservation endpoint authenticates the current request and returns a
short-lived, single-purpose capability bound to owner, `stagingSessionId`,
`mediaAssetId`, generation, SHA-256, byte count, dimensions, and operation. The
Worker accepts only `image/webp`, exact declared length/checksum, the current
generation, and the closed per-session image bound. It streams the body to R2
with provider checksum verification and records only bounded protocol state in
the Durable Object; it never stores journal text or image bytes in SQLite.

Each media generation progresses through
`reserved -> uploading -> staged -> claimed -> finalized`, or through an
idempotent delete path to `deleted`. A session progresses through
`open -> publishing -> committed` or `open|publishing -> abandoned`.
Durable Object serialization and generation comparison fence stale completion.

Explicit remove is the primary immediate cleanup. An alarm targets abandoned
uncommitted state at 15 minutes. When commit status is unavailable or
indeterminate, reconciliation retains the object and reschedules instead of
deleting a possibly committed public artifact. A one-day bucket lifecycle is a
catastrophic fallback, not the normal lease implementation. Terminal protocol
rows may be removed only after their bounded receipt-retention window.

## Atomic create and edit boundary

OVE-347 owns create and OVE-348 owns edit. Both use the same staged-receipt and
frozen-snapshot protocol.

Create claims every current staged generation, promotes the exact WebP bytes to
their immutable public identities, then commits the journal entry, final media
rows, ordered relations, entity/topic/mention relationships, cover identity,
learning attribution, and public projection intent in one database
transaction. A crash before canonical commit is reconciled as uncommitted and
compensated. A crash after commit is reconciled from signed commit status and
must never delete committed public media.

Edit uses optimistic revision control. Existing final media remain readable
until the replacement transaction succeeds. New generations are claimed and
promoted before the transaction; the transaction atomically swaps the document,
ordering, final media relations, cover, revision, and projection/revocation
intents. Superseded media become unreachable through the existing lifecycle
owner only after the new revision commits. Conflict or failure preserves the
entire previous public revision.

No published card, owner read, SSR route, search document, or analytics receipt
may observe a pending image. Promotion without a database commit is an orphan
to reconcile; a database commit without every exact promoted object is not an
admissible success.

## Concurrency, retry, and crash rules

- Stable media identity plus monotonic generation fences replacement races.
- One staging session serializes its control transitions in the Durable Object.
- Reorder mutates only the frozen document order and does not change a ready
  generation or its digest.
- Reservations, upload replay, delete, claim, publish, finalize, and commit
  status are idempotent within their declared keys and retention windows.
- Every client, Vercel, Worker, R2, Durable Object, and database operation has a
  finite deadline and bounded retry count. Cancellation fences late results.
- A stale Worker result, capability, receipt, entry revision, owner/session, or
  document generation cannot attach, overwrite, publish, or delete the current
  result.
- Distributed uncertainty is reconciled from canonical database commit status
  plus the signed staging receipt. It is not guessed from a timeout or browser
  connectivity hint.

## Preserved safety and lifecycle owners

This decision changes neither the accepted ADR-0018 cross-account-read exposure
for unresolved authorization nor any positively resolved prohibition. The
following owners remain binding:

- `apps/web/src/lib/garden/journal-document.ts` for durable content shape and
  the maximum ten inline image identities;
- `apps/web/src/lib/privacy/precise-location-text.ts` and its shared corpus for
  precise-location refusal across all text and link fields;
- scoped server repositories and document-mutation admission for canonical
  writes;
- `apps/web/src/server/media/lifecycle-revoke.ts` for archive, erasure,
  superseded-media, provider-absence, and public-unreachability convergence;
- `apps/web/src/server/search/public-projection-outbox.ts` for transactional
  public projection intent and verified convergence;
- `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md` for
  `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`;
- `docs/CURRENT_SCHEMA_ERASURE.md` for data-subject erasure and retained audit
  obligations;
- caption, alt text, focal point, explicit cover identity, public-media URL,
  immutable delivery, and current archive/410 behavior.

Client-final bytes do not authorize broad browser database access, public
staging, long-lived upload credentials, logging a key/capability, weakening
erasure, or reflecting precise location. Provider and operator receipts remain
class/count/digest only and exclude journal text, image bytes, object keys,
capabilities, account identity, request metadata, and precise location.

## Transition ownership and order

The complete dependency chain is:

`OVE-333 -> OVE-345 -> OVE-346 -> OVE-347 -> OVE-348 -> OVE-349 -> OVE-350`

- OVE-333 is a non-executable coordination container and closes last.
- OVE-345 owns this decision and synchronized active authority only.
- OVE-346 owns staging code, provider resources, deployment, and live protocol
  proof. It creates no Postgres draft, media, or journal row.
- OVE-347 owns all new-entry callers, client codec/coordinator, and atomic
  create/public read-back.
- OVE-348 owns published-entry editing, revision conflict, replacement, and
  lifecycle handoff.
- OVE-349 owns removal of server draft, legacy media runtime, Sharp, old routes,
  packages, schema, jobs, tests, and active documentation after a zero-use
  production classification and its approved migration plan.
- OVE-350 alone owns legacy quarantine provider/env/credential retirement after
  the full seven-day rollback/retention horizon and two zero-state read-backs.

Current runtime remains transitional until its owning child lands. ADR-0019 is
the target architecture and does not claim that a provider resource, codec,
route, migration, deployment, or cleanup already exists. Active docs must label
legacy server drafts, quarantine, Sharp processing, and original-cleanup
behavior as transitional rather than future requirements.

## Alternatives rejected

### Keep server drafts

Rejected because they preserve durable pre-Publish product state, require draft
lifecycle/identity/conflict/cleanup semantics, and contradict the selected one
terminal publication moment. In-memory loss on tab closure is accepted.

### Upload source originals and convert on the server

Rejected because it retains the legacy processing surface and gives the browser
preview no byte identity with the published artifact. Server conversion is not
the fallback when the client codec fails; the image remains failed/removable.

### Send the full multipart publication through Vercel

Rejected because the user-visible action may include large media while Vercel
Functions have a bounded body. Direct Cloudflare staging separates one product
action from one HTTP request without adding durable draft state.

### Publish a card before media settles

Rejected because a visible pending/broken card makes the user result non-atomic
and moves distributed recovery into every public/owner/search consumer.

### Background upload after tab closure

Rejected because it implies durable browser state or an unreliable lifecycle
promise. Cleanup is server/provider-owned; unpublished text is not recoverable.

## Consequences and falsification

The design removes an entire durable draft plane and the server image-processing
runtime after the staged cutover. It also makes Publish wait for all current
media and accepts loss of unpublished work when the tab dies. Client codec
compatibility, output quality, memory, and mobile performance become release
gates rather than server concerns. Cloudflare staging adds a bounded distributed
protocol whose cleanup and commit-status behavior must be live-proved.

The decision is falsified when the pinned client codec cannot produce acceptable
and deterministic WebP output on supported browsers/devices, ordinary supported
phone images cannot meet the OVE-347 budget, Cloudflare cannot support the
declared streaming/SQLite/alarm protocol in the current account, or distributed
reconciliation cannot avoid both leaked abandoned objects and deletion of
committed media. On falsification, stop the responsible child and supersede this
ADR explicitly. Do not silently restore server drafts, server conversion, or a
Vercel byte-ingress path.

## Rollout and rollback

OVE-345 changes canon and its verifier only. OVE-346 expands staging first.
OVE-347 and OVE-348 cut create and edit callers over while the legacy runtime is
still available for deployment rollback. Only after both journeys are exact-main
and live-proved may OVE-349 contract application/schema/package ownership. OVE-350
waits the declared seven-day horizon before deleting the isolated legacy provider
surface. OVE-333 closes only after the integrated exact-main journey and every
child receipt agree.

Before OVE-349, rollback promotes the preceding exact safe deployment and uses
the untouched legacy runtime for old code. After schema contraction, rollback is
roll-forward unless the approved migration's empty legacy-shape recreation is
safe and independently proved. Provider deletion never precedes that horizon;
public/staging buckets and shared credentials are outside OVE-350's delete scope.
