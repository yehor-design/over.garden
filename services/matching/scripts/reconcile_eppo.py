"""Put both EPPO captures onto the graph by hand (OVE-394).

The worker runs this on a `catalog_source_refresh` job with
`source_slug = 'eppo-codes'`; this entry point is for the loopback rehearsal
and for the production run the runbook describes.

    .venv/bin/python -m scripts.reconcile_eppo --database-url "$DATABASE_URL"

Nothing here calls api.eppo.int: the captures already sit in the source layer
of the database this connects to. The receipt is printed as JSON and nothing
else is.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.eppo_reconcile import MAX_RECORDS, reconcile_eppo  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Reconcile the EPPO captures onto the graph."
    )
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL"),
        help="Defaults to DATABASE_URL.",
    )
    parser.add_argument("--limit", type=int, default=MAX_RECORDS)
    parser.add_argument(
        "--capture-ids",
        default="",
        help="Comma-separated capture ids; empty means every completed EPPO capture.",
    )
    parser.add_argument(
        "--skip-weight-recompute",
        action="store_true",
        help="Leave search weights alone; `is_host` then stays stale until the next recompute.",
    )
    options = parser.parse_args()
    if not options.database_url:
        parser.error("--database-url or DATABASE_URL is required")

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    # A pulled Vercel environment writes values with escaped newlines; a shell
    # that exports them without unescaping hands psycopg a DSN ending in a
    # literal backslash-n, and Postgres refuses `sslmode=require\n`.
    database_url = options.database_url.strip().removesuffix("\\n").strip()
    # One transaction for the whole run: a half-linked EPPO taxon — an
    # identifier with no facts, or hosts with no relation — is worse than none.
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        capture_ids = [
            value.strip() for value in options.capture_ids.split(",") if value.strip()
        ]
        receipt = reconcile_eppo(
            conn,
            limit=options.limit,
            recompute_weights=not options.skip_weight_recompute,
            capture_ids=capture_ids or None,
        )
        conn.commit()
    print(json.dumps(receipt.as_dict(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
