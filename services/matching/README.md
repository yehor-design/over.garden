# matching-tier

Isolated, Cyrillic-aware matching/dedup worker for OverGarden. TypeScript owns
the product app; Python owns only the libraries that are materially better in
Python: RapidFuzz, Splink, PyICU, CyrTranslit, and Meilisearch tooling.

## Layout

- `app/main.py` — optional internal FastAPI health service; not a typeahead API.
- `app/worker.py` — Postgres-backed worker skeleton. It claims rows from
  `job_queue` and later runs matching/dedup/reindex work off the request path.
- `app/search.py` — Meilisearch helpers and the Cyrillic typo-tolerance proof.

## Develop

```bash
uv python install 3.12 && uv python pin 3.12
uv sync --frozen
uv run uvicorn app.main:app --reload   # http://localhost:8000/health
uv run python -m app.worker            # needs DIRECT_URL + job_queue table
```

PyICU compiles against system ICU. On macOS install `pkg-config` and `icu4c`; in
the Docker image this is handled by `libicu-dev`.

## Runtime

Run the FastAPI health service and the worker as separate processes from the
same image on the worker droplet. Meilisearch is a derived index; Postgres is the
source of truth.
