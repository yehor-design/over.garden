# matching-tier

Isolated, Cyrillic-aware matching/dedup worker for OverGarden. TypeScript owns
the product app; Python owns only the libraries that are materially better in
Python: RapidFuzz, Splink, PyICU, CyrTranslit, and Meilisearch tooling.

## Layout

- `app/main.py` — optional internal FastAPI health service; not a typeahead API.
- `app/worker.py` — Postgres-backed worker. It claims rows from `job_queue`
  and runs matching/dedup/reindex work off the request path.
- `app/search.py` — Meilisearch helpers, catalog typeahead reindexing, public
  journal index/unindex jobs, and the Cyrillic typo-tolerance proofs.

## Develop

```bash
uv python install 3.12 && uv python pin 3.12
uv sync --frozen
uv run uvicorn app.main:app --reload   # http://localhost:8000/health
uv run python -m app.worker            # needs DIRECT_URL + job_queue table
uv run python -m app.search            # needs MEILISEARCH_HOST/API key
```

PyICU compiles against system ICU. On macOS install `pkg-config` and `icu4c`; in
the Docker image this is handled by `libicu-dev`.

## Container runtime

For supported local Macs, build and smoke the matching image with Apple
Container first under `docs/CONTAINER_RUNTIME_POLICY.md`. OVE-74 proves this
path without Docker Desktop:

```bash
cd services/matching
container build -t overgarden/matching:local .
container run --detach \
  --name overgarden-matching-local \
  --publish 127.0.0.1:8000:8000 \
  overgarden/matching:local
curl -fsS http://127.0.0.1:8000/health
container stop overgarden-matching-local
container delete overgarden-matching-local
```

The Dockerfile remains a portable OCI image recipe. Use Docker only as a named
fallback when Apple Container is unavailable on the host or a verified Apple
Container feature gap blocks the local smoke.

## Runtime

Run the FastAPI health service and the worker as separate processes from the
same image on the worker droplet. Meilisearch is a derived index; Postgres is the
source of truth. The worker keeps the long-lived Postgres connection in
autocommit mode and uses explicit transactions for claim/done/failed state
changes, so per-job read queries cannot trap status updates in an uncommitted
outer transaction. It also reclaims stale `processing` rows after
`WORKER_VT_SECONDS`; job handlers must remain idempotent.

The catalog typeahead rebuild job uses payload `{ "kind":
"catalog_typeahead_reindex" }` on the `matching` queue. The worker rebuilds the
`catalog_typeahead` index only from `seeded`/`confirmed` catalog rows with no
`created_by_user_id`, so provisional user-added names stay out of global search
until a later curation slice promotes them.

Public journal publishing uses `{ "kind": "journal_entry_index",
"journalEntryId": "...", "userId": "..." }` and archiving uses `{ "kind":
"journal_entry_unindex", "journalEntryId": "...", "userId": "..." }`. The
worker scopes both jobs to the payload owner, indexes only active public non-gone
rows into `journal_entries`, writes a public-safe document shape, and deletes any
stale document when the source row is no longer indexable. Unknown job kinds fail
with `last_error`; they must not be marked done silently.

## Restart / recovery

`tests/test_worker_recovery.py` is the durability proof for the pilot journal
search path (OVE-39). It runs with `uv run --frozen pytest` and needs no live
services. It proves that a `processing` row is reclaimed only after the
visibility timeout, that `journal_entry_index`/`journal_entry_unindex` reach
`done` after a simulated worker restart, that the public-safe document contract
holds, that at-least-once re-delivery is idempotent, and that a transient
Meilisearch outage fails-then-recovers. Run the worker droplet containers with a
Docker restart policy so the process returns automatically after a crash or
reboot.

## Local Apple Container smoke

With `infra/container-up` running the local Postgres and Meilisearch services,
the matching-tier regression smoke is:

```bash
cd services/matching
container build -t overgarden/matching:local .
uv run python -m py_compile app/main.py app/search.py app/worker.py
uv run --frozen pytest
MEILISEARCH_HOST='http://localhost:7700' \
  MEILISEARCH_API_KEY='local_dev_meili_master_key_change_me_1234567890' \
  uv run python -m app.search
```

The Meilisearch proof indexes only tracer and catalog typeahead proof documents.
Catalog typeahead document ids are Meilisearch-safe ASCII keys derived from the
catalog item id plus a hash of the alias locale and normalized alias; the
searchable Cyrillic alias stays in `displayName`, `canonicalName`, and
`normalizedName`.
