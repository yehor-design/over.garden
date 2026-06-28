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
