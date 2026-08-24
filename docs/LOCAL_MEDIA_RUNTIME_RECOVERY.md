# Local Atomic Journal-Media Recovery

Status: current after OVE-349
Authority: `docs/CONTAINER_RUNTIME_POLICY.md`, ADR-0019

Local recovery proves the current final-WebP architecture. It must not recreate
the retired source-original quarantine or server conversion path.

## Start and bootstrap

On supported Apple Silicon/macOS 26 hosts, Apple Container is the default. The
same commands use the documented Docker fallback only when required.

```bash
cd apps/web
../../infra/container-up
../../infra/run-with-local-infra-env pnpm local:bootstrap
```

The app database, Meilisearch, and public-object-compatible MinIO surface must
be loopback-only. Secrets stay in ignored environment files and never enter
receipts.

## Recovery proof

```bash
cd apps/web
../../infra/run-with-local-infra-env pnpm verify:retired-journal-media-migration
pnpm test:media-staging-worker
pnpm media:staging:verify
pnpm smoke:atomic-journal-codecs
pnpm smoke:inline-media-integrity
pnpm smoke:journal-cover-selection
pnpm exec tsx scripts/verify-retired-journal-media-runtime.ts
```

The disposable migration verifier creates one exact temporary loopback
database, bootstraps the complete schema, inserts one public final-media
fixture, proves `up -> down -> up -> replay`, verifies byte-identity fields and
schema digests, and drops only that generated database in `finally`.

The worker proof covers reservation, direct upload, signed receipt, claim,
finalize, alarm recovery, abandonment, and cleanup. The codec proof covers
browser WebP conversion and rejects unsupported/oversized input without server
fallback. Visual fixtures are already-final synthetic WebPs and are never
evidence of a real gardener or upload conversion.

## Failure boundary

- A database, worker, MinIO, or Meilisearch failure is not a successful save.
- An interrupted Publish must leave no visible journal or durable pending card.
- A failed image stays removable/retryable only in the current tab.
- Never restore deleted draft/process routes, app-owned Sharp, original-image
  retention, private publication, or legacy media schema to repair local data.
- Preserve named volumes unless the exact disposable target is explicitly
  selected. Do not delete or reset a shared local volume as a recovery shortcut.

Receipts contain only counts, closed state classes, durations, and digests.
