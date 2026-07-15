"""Rebuild the catalog typeahead index once for a loopback smoke environment."""

from __future__ import annotations

import json
import os
from urllib.parse import urlparse

import psycopg
from psycopg.rows import dict_row

from app.search import reindex_catalog_typeahead


def main() -> None:
    dsn = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    meili_host = os.environ.get("MEILISEARCH_HOST")
    _require_loopback_url(dsn, {"postgres", "postgresql"}, "Postgres")
    _require_loopback_url(meili_host, {"http", "https"}, "Meilisearch")

    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        result = reindex_catalog_typeahead(conn)

    print(
        json.dumps(
            {
                "ok": True,
                "issue": "OVE-161",
                "indexed": int(result["indexed"]),
                "workerIndexerExecuted": True,
            },
            sort_keys=True,
        )
    )


def _require_loopback_url(
    value: str | None,
    protocols: set[str],
    label: str,
) -> None:
    if not value:
        raise RuntimeError(f"{label} URL is required")

    parsed = urlparse(value)
    if parsed.scheme not in protocols:
        raise RuntimeError(f"OVE-161 reindex requires a supported {label} protocol")
    if (parsed.hostname or "").lower() not in {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
    }:
        raise RuntimeError(f"OVE-161 reindex refuses non-loopback {label}")


if __name__ == "__main__":
    main()
