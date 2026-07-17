# Local Media Runtime Recovery

Status: binding OVE-189 runbook

Purpose: let an agent recover a corrupt local Apple Container MinIO named volume without deleting or overwriting the source, then prove that the complete local journal-media path and all three persisted services survive restart.

This runbook is local-only. It must never point a smoke command at production Postgres, Cloudflare R2, production Meilisearch, or a Vercel Production environment.

## Safety invariants

1. The exact source volume is preserved. Recovery never repairs it in place, mounts it writable, deletes it, prunes it, or silently adopts another candidate.
   Once recorded as preserved, normal `container-up` rejects even an ambient `OVERGARDEN_MINIO_VOLUME` override that tries to reactivate it.
2. The target is a brand-new explicit exact identifier. Source and target cannot match, and an existing target fails closed.
3. Only `.minio.sys` and `lost+found` are excluded. They are rebuildable filesystem/service state, not user-bucket data.
4. A source with any user-bucket traversal error is not auto-recoverable. Stop and obtain a bounded loss decision; do not mark OVE-189 complete.
5. Evidence contains counts and result classes only. Never paste raw `container inspect`, logs, credentials, bucket/object names, object bytes, synthetic account handles, or readback identifiers into docs, Linear, or chat.
6. MinIO readiness is necessary but insufficient. Closeout requires a real quarantine upload, server processing, stripped derivative readback, original deletion, fixture-media proof, and restart persistence for Postgres, Meilisearch, and MinIO.
7. Docker is not the default or recovery path on a supported host. Apple Container remains canonical; Docker is only the documented unsupported-host/CI/Linux fallback.

## 1. Classify and plan without source mutation

Stop the canonical MinIO container if it is still running, then inspect only through the bounded commands:

```bash
infra/container-status
infra/container-recover-minio --plan --source <exact-source-volume>
```

An ambiguous target set must return non-zero with `source_mutation=none`. Select a unique new name and repeat:

```bash
infra/container-recover-minio --plan \
  --source <exact-source-volume> \
  --target <exact-new-target-volume>
```

Proceed only when all of these are true:

- `source_inventory_class=complete`;
- `source_bucket_traversal_errors=0`;
- `source_running_reference_count=0`;
- `source_reference_count` is at most one;
- `canonical_minio_state` is `stopped` or `absent`;
- `preserved_source_record` is `absent` or `matching`, never `conflict`;
- `target_state=absent`;
- `target_resolution=exact-new`;
- `source_mutation=none`;
- `source_retirement=not-authorized`.

System-state traversal errors may be recoverable only when they are confined to `.minio.sys`; user-bucket traversal errors are a hard stop.

## 2. Recover into the explicit new target

```bash
infra/container-recover-minio --execute \
  --source <exact-source-volume> \
  --target <exact-new-target-volume> \
  --confirm "PRESERVE <exact-source-volume> AND RECOVER INTO <exact-new-target-volume>"
```

The command must report:

- `source_mount=readonly`;
- `copy_class=complete`;
- `inventory_comparison=match`;
- `target_minio_readiness=ready`;
- `source_preserved=yes`.

If copy, comparison, or readiness fails, both source and failed target remain for investigation. Do not reuse or delete the failed target automatically.

Activate the recorded target by replacing container objects only:

```bash
infra/container-up --recreate
infra/container-status
```

`container-status` must show the active target ready and the recorded recovery source present with retirement not authorized.

## 3. Bootstrap only against loopback services

Do not copy or edit remote credentials into the proof. The wrapper overrides an existing `.env.local` with loopback-only runtime values, and the app bootstrap validates the boundary before constructing any client:

```bash
cd apps/web
../../infra/run-with-local-infra-env pnpm local:bootstrap
../../infra/run-with-local-infra-env pnpm visual:fixtures:verify
```

The first fixture verifier establishes the real fixture-media canary before the restart proof.

## 4. Seed one actual media path

Start the app through the same wrapper:

```bash
../../infra/run-with-local-infra-env pnpm dev
```

In a second terminal:

```bash
cd apps/web
../../infra/run-with-local-infra-env pnpm smoke:local-media-runtime -- --phase seed
```

The seed phase proves:

- a synthetic local account is authenticated and write-eligible;
- a metadata-bearing JPEG is uploaded through the real presigned quarantine URL;
- the quarantine object exists before processing;
- server `sharp` processing creates a WebP with no EXIF or ICC metadata;
- the database reaches processed state before quarantine deletion is recorded;
- the quarantine original is absent afterward;
- the derivative is readable through S3 and public HTTP;
- authenticated owner and public journal readbacks use the public copy and expose no quarantine/GPS markers;
- a separate Meilisearch persistence canary is written;
- an existing visual-fixture media object is readable;
- only a mode-`0600`, git-ignored local state file holds the synthetic handles needed after restart.

## 5. Prove persistence before any reseed

Stop the app, then restart all three container objects without deleting volumes:

```bash
cd ../..
infra/container-down
infra/container-up
infra/container-status
```

Confirm the Postgres, Meilisearch, active MinIO target, and preserved MinIO source volumes are still present. Restart the app through the loopback wrapper, then run:

```bash
cd apps/web
../../infra/run-with-local-infra-env pnpm smoke:local-media-runtime -- --phase verify
```

Before sign-in or any write, `verify` reads the prior Postgres entry/media state, public derivative, quarantine absence, visual fixture, Meilisearch document, and public readback. Only after those read-only checks pass does it create a fresh authentication session for owner readback. This ordering prevents a rerun from masquerading as restart persistence.

After the read-only restart proof, rerun the complete fixture verifier:

```bash
../../infra/run-with-local-infra-env pnpm visual:fixtures:verify
```

## 6. Remove only synthetic proof data

```bash
../../infra/run-with-local-infra-env pnpm smoke:local-media-runtime -- --phase cleanup
```

Cleanup deletes only the exact synthetic database rows, derivative/quarantine handles, isolated Meilisearch proof index, and ignored state file. It does not touch either MinIO volume or visual fixtures.

## 7. Code and closeout gates

```bash
cd apps/web
pnpm exec vitest run \
  scripts/container-recovery-contract.test.ts \
  src/lib/local-runtime-safety.test.ts \
  src/server/media/derivatives.test.ts \
  src/server/media/processor.test.ts
pnpm db:types:check
pnpm lint
pnpm typecheck
pnpm test
BETTER_AUTH_SECRET="$(openssl rand -base64 32)" pnpm build
pnpm mainline:closeout:check
cd ../..
git diff --check
```

Do not move OVE-189 to `Done` until the exact behavior commit is contained in `main`, the exact-main CI passes, the old source still exists, and the Linear closeout comment contains only bounded/redacted evidence.

## OVE-189 proof snapshot (2026-07-17)

- Source: `overgarden-minio-data`, preserved; retirement not authorized.
- Target: `overgarden-minio-recovered-20260717-ove189`, active on the proof host.
- Readable source user-bucket inventory: two bucket namespaces, 164 regular files, 82 `xl.meta` files, zero user-bucket traversal errors. Four traversal errors were confined to excluded `.minio.sys` state.
- Copy and content comparison: complete/match.
- Actual media path: pass for quarantine upload, WebP processing, EXIF/ICC absence, original deletion, authenticated readback, and public readback.
- Full restart: pass for prior Postgres, Meilisearch, MinIO media, quarantine-absence, and visual-fixture canaries before reseed.
- Full fixture verification after restart: 16 of 16 media objects reachable; manifest rerun/reset/sentinel checks passed.
- Synthetic proof cleanup: pass; recovery volumes and visual fixtures untouched.
