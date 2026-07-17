# OverGarden Local Infra

Apple Container is the primary local runtime on supported Apple Silicon/macOS 26 machines. Docker Desktop is not required on those machines after the OVE-77 closeout proof. Docker Compose is retained only as a fallback for unsupported hosts or verified feature gaps.

## Apple Container

Prerequisite: install Apple Container from the official release package for the runtime version you intend to use. OVE-72 was written against Apple Container 1.0.0 command semantics: `container run --detach --name --publish --env --volume`, `container volume create`, `container stop/delete/list`, and `container system status`.

Start the local service trio:

```bash
infra/container-up
```

Check readiness:

```bash
infra/container-status
```

Stop containers while preserving local data:

```bash
infra/container-down
```

Delete local service data only when you intentionally want a clean slate:

```bash
infra/container-down --volumes
```

`container-up` starts:

| Service     | Image                                    | Host endpoint                                            | Volume                                                                                  |
| ----------- | ---------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Postgres    | `docker.io/library/postgres:18-alpine`   | `127.0.0.1:5432`                                         | `overgarden-postgres-18-data`                                                           |
| Meilisearch | `docker.io/getmeili/meilisearch:v1.48.1` | `http://127.0.0.1:7700`                                  | `overgarden-meili-data`                                                                 |
| MinIO       | `docker.io/minio/minio:latest`           | `http://127.0.0.1:9000`, console `http://127.0.0.1:9001` | Active pointer in `infra/.runtime/minio-volume`; legacy default `overgarden-minio-data` |

Environment values are loaded from `infra/.env` when it exists. If it is missing, `infra/.env.example` provides local defaults. Keep `apps/web/.env.local` aligned with the same Postgres, Meilisearch, and MinIO values.

Postgres uses `PGDATA=/var/lib/postgresql/data/pgdata` inside the mounted volume. Apple Container named volumes are ext4 filesystems and may contain `lost+found` at the mount root, so the database cluster must live in a subdirectory.

Postgres local and CI defaults intentionally track the production major version: DigitalOcean Managed PostgreSQL is recorded as pg 18 in `docs/INFRASTRUCTURE_REGISTRY.md`, so local Apple Container, Docker fallback, and GitHub Actions use `postgres:18-alpine`. The local volume is version-specific to avoid starting Postgres 18 on an old Postgres 16 data directory. If an older `overgarden-postgres` container exists, run `infra/container-up --recreate`; this replaces the container while preserving existing named volumes such as `overgarden-postgres-data`.

## Loopback-only app commands

An existing `apps/web/.env.local` may intentionally point at managed Postgres or Cloudflare R2. Do not trust it for local bootstrap, fixtures, or media proof. Run storage-mutating local commands through the checked-in wrapper, which replaces every database, object-store, public-media, auth/app, and search endpoint with loopback values before the process creates a client:

```bash
cd apps/web
../../infra/run-with-local-infra-env pnpm local:bootstrap
../../infra/run-with-local-infra-env pnpm visual:fixtures:verify
```

`bootstrap-local.ts` independently enforces the same loopback contract. It refuses Vercel Production, a remote database host, a remote S3 endpoint, a remote public-media base, a remote app/auth origin, or a remote Meilisearch host.

## MinIO corruption recovery

If `infra/container-status` reports `MinIO: corrupt-volume`, do not delete, repair in place, reuse an ambiguous candidate, or run `container-down --volumes`. First produce a read-only bounded plan:

```bash
infra/container-recover-minio --plan --source <exact-source-volume>
```

Multiple MinIO-like volumes intentionally make that command exit non-zero. Choose an explicit brand-new target and rerun the plan:

```bash
infra/container-recover-minio --plan \
  --source <exact-source-volume> \
  --target <exact-new-target-volume>
```

Execute only after the plan reports a complete user-bucket inventory, zero user-bucket traversal errors, zero running source references, and `target_resolution=exact-new`:

```bash
infra/container-recover-minio --execute \
  --source <exact-source-volume> \
  --target <exact-new-target-volume> \
  --confirm "PRESERVE <exact-source-volume> AND RECOVER INTO <exact-new-target-volume>"

infra/container-up --recreate
infra/container-status
```

The execute path mounts the source read-only, excludes only rebuildable `.minio.sys` and `lost+found`, copies into a newly created target, compares the complete user-bucket tree without emitting object names or bytes, proves isolated MinIO readiness, and only then records the target as active. The source volume is recorded separately as preserved and is never deleted by recovery. Source retirement requires a different exact-target maintainer decision.

Health alone is not closeout. Follow the seed/restart/verify phases in `docs/LOCAL_MEDIA_RUNTIME_RECOVERY.md` to prove an actual upload, server-created metadata-free WebP, quarantine deletion, owner/public readback, visual fixture media, and Postgres/Meilisearch/MinIO persistence across a full container stop/start cycle.

## Docker Fallback

Use Docker Compose only when one of these named gaps applies:

- the developer machine is not an Apple Silicon/macOS 26 host supported by Apple Container;
- Apple Container is not installed or `container system status` cannot be made healthy on that machine;
- a specific Apple Container feature gap blocks the local service trio or matching-image smoke, and the gap is recorded in the issue/docs before using Docker.

Fallback command:

```bash
cd infra
cp .env.example .env
docker compose up -d
```

The Docker fallback also uses `postgres:18-alpine` with the `overgarden-postgres-18-data` named volume so fallback hosts exercise the same Postgres major-version contract as production and CI.

When adding new runtime instructions, cite `docs/CONTAINER_RUNTIME_POLICY.md` and name the fallback reason.
