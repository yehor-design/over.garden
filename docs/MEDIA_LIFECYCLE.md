# Final Journal Media Lifecycle

Status: current after OVE-349
Authority: ADR-0019, OVE-346 through OVE-349

The browser-generated WebP is the only final artifact. OverGarden does not
retain a source original, decode or re-encode journal images on the server, or
admit a second derivative.

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
The isolated legacy provider resource is not an application capability and is
owned only by OVE-350 for gated deletion after its rollback window.

## Verification

```bash
cd apps/web
pnpm test:media-staging-worker
pnpm media:staging:verify
pnpm smoke:inline-media-integrity
pnpm smoke:journal-cover-selection
pnpm smoke:erasure-workflow
pnpm exec tsx scripts/verify-retired-journal-media-runtime.ts
```

Media evidence is identifier-minimal and redacted. Never log source bytes,
object keys, capabilities, journal content, account data, request metadata, or
precise location.
