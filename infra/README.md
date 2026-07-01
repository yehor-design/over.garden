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

| Service     | Image                                    | Host endpoint                                            | Volume                        |
| ----------- | ---------------------------------------- | -------------------------------------------------------- | ----------------------------- |
| Postgres    | `docker.io/library/postgres:18-alpine`   | `127.0.0.1:5432`                                         | `overgarden-postgres-18-data` |
| Meilisearch | `docker.io/getmeili/meilisearch:v1.48.1` | `http://127.0.0.1:7700`                                  | `overgarden-meili-data`       |
| MinIO       | `docker.io/minio/minio:latest`           | `http://127.0.0.1:9000`, console `http://127.0.0.1:9001` | `overgarden-minio-data`       |

Environment values are loaded from `infra/.env` when it exists. If it is missing, `infra/.env.example` provides local defaults. Keep `apps/web/.env.local` aligned with the same Postgres, Meilisearch, and MinIO values.

Postgres uses `PGDATA=/var/lib/postgresql/data/pgdata` inside the mounted volume. Apple Container named volumes are ext4 filesystems and may contain `lost+found` at the mount root, so the database cluster must live in a subdirectory.

Postgres local and CI defaults intentionally track the production major version: DigitalOcean Managed PostgreSQL is recorded as pg 18 in `docs/INFRASTRUCTURE_REGISTRY.md`, so local Apple Container, Docker fallback, and GitHub Actions use `postgres:18-alpine`. The local volume is version-specific to avoid starting Postgres 18 on an old Postgres 16 data directory. If an older `overgarden-postgres` container exists, run `infra/container-up --recreate`; this replaces the container while preserving existing named volumes such as `overgarden-postgres-data`.

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
