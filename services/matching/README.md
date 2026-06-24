# matching-tier

Isolated, Cyrillic-aware matching/dedup service for OverGarden (Variant A,
ADR-0001). TypeScript owns the app; this Python service owns ONLY the matching
pipeline, where the irreplaceable libraries live (RapidFuzz · Splink · PyICU ·
CyrTranslit · Meilisearch client). Deployed on Railway (EU region).

## Layout

- `app/main.py` — FastAPI service; `/health` reports loaded library versions
  (incl. `icu.ICU_VERSION`, which proves system libicu is present).
- `app/worker.py` — queue worker **skeleton** (no matching logic yet). Consumes
  the `pgmq` queue the TS app produces to, via plain SQL (psycopg v3, DIRECT
  Postgres connection). No Procrastinate (Python-only; forbidden by §2.9).
- `app/search.py` — Meilisearch helpers + the Cyrillic typo-tolerance proof.

## Develop (uv)

```bash
uv python install 3.12 && uv python pin 3.12
uv lock                 # resolve + write uv.lock (commit it)
uv sync --frozen        # reproducible install into .venv

# PyICU compiles from source against system libicu. On macOS:
#   brew install pkg-config icu4c
#   export PKG_CONFIG_PATH="$(brew --prefix icu4c)/lib/pkgconfig"
# On Debian/the Docker image: libicu-dev + pkg-config + build-essential.

uv run uvicorn app.main:app --reload   # http://localhost:8000/health
uv run python -m app.worker            # the worker (needs DATABASE_URL)
```

## Container

`Dockerfile` is the source of truth for the runtime env (installs libicu-dev so
PyICU builds + links correctly). The worker runs as a SEPARATE Railway service
from the same image with `CMD python -m app.worker`.
