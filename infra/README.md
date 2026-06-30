# OverGarden Local Infra

Apple Container is the primary local runtime on supported Apple Silicon/macOS 26 machines. Docker Compose is retained only as a fallback for unsupported hosts or verified feature gaps.

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

| Service | Image | Host endpoint | Volume |
| --- | --- | --- | --- |
| Postgres | `docker.io/library/postgres:16-alpine` | `127.0.0.1:5432` | `overgarden-postgres-data` |
| Meilisearch | `docker.io/getmeili/meilisearch:v1.48.1` | `http://127.0.0.1:7700` | `overgarden-meili-data` |
| MinIO | `docker.io/minio/minio:latest` | `http://127.0.0.1:9000`, console `http://127.0.0.1:9001` | `overgarden-minio-data` |

Environment values are loaded from `infra/.env` when it exists. If it is missing, `infra/.env.example` provides local defaults. Keep `apps/web/.env.local` aligned with the same Postgres, Meilisearch, and MinIO values.

Postgres uses `PGDATA=/var/lib/postgresql/data/pgdata` inside the mounted volume. Apple Container named volumes are ext4 filesystems and may contain `lost+found` at the mount root, so the database cluster must live in a subdirectory.

## Docker Fallback

Use Docker Compose only when Apple Container is unavailable or lacks a required feature on the current machine:

```bash
cd infra
cp .env.example .env
docker compose up -d
```

When adding new runtime instructions, cite `docs/CONTAINER_RUNTIME_POLICY.md` and name the fallback reason.
