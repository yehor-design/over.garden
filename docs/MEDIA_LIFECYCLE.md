# Final Journal Media Lifecycle

Status: current after OVE-371
Authority: ADR-0019, ADR-0022 (D2), OVE-346 through OVE-349, OVE-371

The browser-generated WebP is the only final artifact. OverGarden does not
retain a source original, decode or re-encode journal images on the server, or
admit a derivative it did not stage. Since OVE-371 one photo is up to three
browser-encoded objects (the 2560 primary and its 1280 and 480 variants) plus
an inline 16 px placeholder; the server still never decodes an image.

## One photo, three objects (OVE-371)

| Object | Long edge | Staging path | Public key |
| -- | -- | -- | -- |
| primary | 2560 (or the source, never upscaled) | `/v1/staging/{session}/{asset}/{generation}` | `derivatives/{asset}/{generation}.webp` |
| variant | 1280 | `…/{generation}/v1280` | `derivatives/{asset}/{generation}-1280.webp` |
| variant | 480 | `…/{generation}/v480` | `derivatives/{asset}/{generation}-480.webp` |

The browser encodes natively first (`createImageBitmap` downscales while it
decodes, `OffscreenCanvas.convertToBlob` writes WebP at quality 85), shows a
480 px preview from the decoded bitmap before the final encode finishes, and
falls back to jsquash/libheif only for lossless plans (alpha), HEIC the
browser cannot decode, or browsers without native WebP encoding. The fallback
decoder is bounded at 64 MP; native decoding admits up to 500 MP and 50 MB.
Variants are only cut when the primary is larger than their long edge.

Every object has its own reservation (`variant` in the request, `0` or absent
for the primary), its own capability bound to its own path, and its own signed
receipt carrying `variant`. Receipts travel grouped per photo, each primary
followed by its variants, and `verifyEphemeralPublicationReceipts` refuses a
variant without its primary, a duplicate variant, or a "variant" larger than
its primary. The Durable Object keys rows by `<asset>` for the primary and
`<asset>#<variant>` for variants (rows written before OVE-371 keep the bare id
and `variant = 0`); the ten-photo session limit counts primaries, and deleting
a primary deletes its variants. Claim promotes each object to its own public
key, the commit-status read-back names every object (variants carry
`variant`), and finalize makes all of them immutable together.

`media_assets` records only which variants exist (`variant_long_edges`) and
the placeholder (`placeholder_data_uri`), both added by migration 0047. Every
consumer derives the variant keys from `derivative_key` through
`expandDerivativeObjectKeys`, so revoke, orphan cleanup, edit replacement, and
erasure delete the variants with the primary. The web deploy probes for the
0047 columns (`mediaVariantColumnsAvailable`) and leaves them out until the
migration is applied by hand, so the deploy is safe in either order; until
then the variants still exist in R2 but are not recorded, and the primary row
stands for them in the commit-status read-back.

Delivery is a plain `<img srcset sizes>` (`buildPublicMediaSourceSet`) with
the placeholder painted as a background until the image loads; there is no
image optimizer hop.

## The session contract (OVE-372)

`apps/web/src/lib/media/ephemeral-staging-contract.ts` declares the session
contract once, and the sessions route, the browser stager, and the Worker
import that declaration. Neither side restates it.

| Piece | Shape |
| -- | -- |
| `POST /api/media/staging/sessions` | body `{ stagingSessionId }` (a UUID the composer minted); answers `{ stagingSessionId, sessionCapability, expiresAt }` with `expiresAt` an **integer count of epoch seconds**, private and no-store |
| session capability | a signed `staging_session` token bound to the owner hash and the session, 15 min TTL; renewed by the same call when less than three minutes remain |
| upload | `PUT {stagingOrigin}/v1/staging/{session}/{asset}/{generation}[/v{longEdge}]` with `authorization: Bearer <session capability>`, `content-type: image/webp`, `content-length`, `content-sha256`, `x-media-width`, `x-media-height`; the Worker validates type, size, dimensions, checksum, and the per-session photo count in the Durable Object and answers the staging receipt and a per-object delete capability |
| touch | `POST {stagingOrigin}/v1/staging/{session}/touch` with the session capability; extends the session's and its objects' lease to now + 2 h |
| lease | `EPHEMERAL_MEDIA_LEASE_SECONDS` = 2 h; the composer touches every 5 min (`EPHEMERAL_MEDIA_TOUCH_INTERVAL_MS`) while it is mounted and holds media; the Durable Object abandons a session only after its lease expires with no touch |

Adding a photo makes no call to Vercel: the composer fetches the session
capability once when it opens (the coordinator calls `stager.prepare`) and
every upload and touch goes straight to the Worker. A receipt's expiry is the
Durable Object's lease, not arithmetic on the receipt: the claim answers
`receipt_expired` from the row, so a composer left open for an hour still
publishes every photo.

A refused handoff records its bounded `EphemeralStagingClientError` code through
`ephemeralStagingFailureCode`, and the composer surfaces it as the image block's
`failureCode`. No boundary discards the reason.

The per-photo reservation route (`/api/media/staging/reservations`), the
per-photo upload capability, and `scripts/prove-staging-reservation-contract.ts`
were retired with OVE-372.

## Publication lifecycle

1. The browser converts a selected image into the bounded final WebP.
2. The browser uploads those exact bytes directly to private edge staging using
   one short-lived, object-specific capability.
3. Atomic journal publication claims the signed staging receipts and commits
   public journal/media rows in one database transaction.
4. `media_staging_finalize` promotes the claimed bytes to their final public
   identity, four objects at a time (`PROMOTION_CONCURRENCY`). The Durable
   Object lease and alarm recover interrupted finalize or abandonment
   idempotently.
5. A journal card is visible only after the atomic contract has final media;
   there is no durable pending-media state.

Normal abandoned staging is reclaimed two hours after the last touch. The
one-day staging bucket lifecycle is catastrophic fallback, not product state.

## Public removal lifecycle

Archive, orphan cleanup, and erasure enqueue `media_derivative_revoke`. The
consumer deletes the exact final object and settles only after provider
`HeadObject` confirms absence. Uncertainty remains retryable and never claims
success. Canonical rows retain `revoked_at` and `public_unreachable_at` evidence
needed by archive/erasure convergence.

The only app-owned media lifecycle job kinds are:

- `media_staging_finalize`
- `media_derivative_revoke`
- `erasure_media_object_delete` in the erasure consumer

`GET /api/cron/media-orphans` (weekly, Monday 05:00 UTC, `CRON_SECRET`) lists
`derivatives/` objects older than seven days and deletes those no
`media_assets` row names, as its `derivative_key` or as one of that key's
recorded variants (OVE-372). Its receipt carries counts only.

The former quarantine expiry, processing claim, quality receipt, and failed
source-original retention states no longer exist in active schema or runtime.
OVE-350 deleted the exact empty legacy provider resource. It is not an
application capability and must not be recreated.

## Verification

```bash
cd apps/web
pnpm test:media-staging-worker
pnpm media:staging:verify
pnpm smoke:journal-cover-selection
pnpm smoke:erasure-workflow

```

Media evidence is identifier-minimal and redacted. Never log source bytes,
object keys, capabilities, journal content, account data, request metadata, or
precise location.
