# Final Journal Media Lifecycle

Status: current after OVE-349
Authority: ADR-0019, OVE-346 through OVE-349

The browser-generated WebP is the only final artifact. OverGarden does not
retain a source original, decode or re-encode journal images on the server, or
admit a second derivative.

## The reservation wire contract (OVE-359)

`apps/web/src/lib/media/ephemeral-staging-contract.ts` declares the upload
reservation once, and both the reservation route and the browser stager import
that declaration. Neither side restates it.

| Field | Shape |
| -- | -- |
| `uploadUrl` | the exact staging origin plus `/v1/staging/{session}/{asset}/{generation}`, with no query, fragment, or credentials |
| `uploadCapability` | the signed capability, matching the shared token shape |
| `expiresAt` | an **integer count of epoch seconds**, inside the declared capability lifetime |

`expiresAt` is a number and never an ISO-8601 string. Between 2026-08-23 and
2026-09-01 the route serialized it as a string while the browser required a safe
integer, so every reservation was refused and no photo could be uploaded at all.
Both suites were green throughout, because each tested only its own side of a
contract that existed in neither file. `buildEphemeralMediaUploadReservation`
now refuses to emit anything `parseEphemeralMediaUploadReservation` would
reject, so a producer-side drift fails at the source.

`EPHEMERAL_MEDIA_EXPIRY_CLOCK_SKEW_SECONDS` exists only to absorb ordinary clock
drift between the issuing server and the reading browser. It is not a lifetime
extension: the staging origin verifies the signed claims itself.

A refused handoff records its bounded `EphemeralStagingClientError` code through
`ephemeralStagingFailureCode`, and the composer surfaces it as the image block's
`failureCode`. No boundary discards the reason any more.

Proof: `cd apps/web && pnpm exec tsx scripts/prove-staging-reservation-contract.ts --mode verify --inject-staging-upload-timeout`.

## Publication lifecycle

1. The browser converts a selected image into the bounded final WebP.
2. The browser uploads those exact bytes directly to private edge staging using
   one short-lived, object-specific capability.
3. Atomic journal publication claims the signed staging receipts and commits
   public journal/media rows in one database transaction.
4. `media_staging_finalize` promotes the claimed bytes to their final public
   identity. The Durable Object lease and alarm recover interrupted finalize or
   abandonment idempotently.
5. A journal card is visible only after the atomic contract has final media;
   there is no durable pending-media state.

Normal abandoned staging is reclaimed after 15 minutes. The one-day staging
bucket lifecycle is catastrophic fallback, not product state.

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

The former quarantine expiry, processing claim, quality receipt, and failed
source-original retention states no longer exist in active schema or runtime.
OVE-350 deleted the exact empty legacy provider resource. It is not an
application capability and must not be recreated.

## Verification

```bash
cd apps/web
pnpm test:media-staging-worker
pnpm media:staging:verify
pnpm smoke:inline-media-integrity
pnpm smoke:journal-cover-selection
pnpm smoke:erasure-workflow

```

Media evidence is identifier-minimal and redacted. Never log source bytes,
object keys, capabilities, journal content, account data, request metadata, or
precise location.
