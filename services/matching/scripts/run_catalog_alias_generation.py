"""Run the OVE-160 alias worker contract against a loopback Postgres database."""

from __future__ import annotations

import argparse
import json
import os
from urllib.parse import urlparse

import psycopg
from psycopg.rows import dict_row

from app.job_queue_contract import CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND
from app.worker import _handle


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog-item", action="append", required=True)
    args = parser.parse_args()

    dsn = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    _require_loopback_postgres(dsn)

    generated_counts: dict[str, int] = {}
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        for catalog_item_id in args.catalog_item:
            _handle(
                conn,
                {
                    "kind": CATALOG_ALIAS_SUGGESTIONS_REFRESH_KIND,
                    "catalogItemId": catalog_item_id,
                },
            )
            row = conn.execute(
                """
                select count(*)::integer as count
                from catalog_alias_projections
                where catalog_item_id = %s
                  and source_slug = 'overgarden-alias-generator'
                  and source_method = 'generated'
                  and status in ('generated', 'review_needed')
                """,
                (catalog_item_id,),
            ).fetchone()
            generated_counts[catalog_item_id] = int(row["count"])

    print(
        json.dumps(
            {
                "ok": True,
                "issue": "OVE-160",
                "workerContractExecuted": True,
                "generatedCounts": generated_counts,
            },
            sort_keys=True,
        )
    )


def _require_loopback_postgres(dsn: str | None) -> None:
    if not dsn:
        raise RuntimeError("DIRECT_URL or DATABASE_URL is required")

    parsed = urlparse(dsn)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise RuntimeError("OVE-160 generation requires the Postgres protocol")
    if (parsed.hostname or "").lower() not in {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
    }:
        raise RuntimeError("OVE-160 generation refuses non-loopback databases")
    if not parsed.path.strip("/"):
        raise RuntimeError("OVE-160 generation requires a named local database")


if __name__ == "__main__":
    main()
