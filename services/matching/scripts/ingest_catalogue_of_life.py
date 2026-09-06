"""Run one Catalogue of Life ingest by hand (OVE-392).

The worker runs this on a `catalog_source_refresh` job; this entry point is
for a local proof and for the production run the runbook describes, where the
archive is already on disk and nobody wants to wait for a queue.

    .venv/bin/python -m scripts.ingest_catalogue_of_life \
      --archive /tmp/coldp.zip --database-url "$DATABASE_URL"

`COL_INGEST_KINGDOMS` scopes it (`Plantae,Fungi,Chromista` is what production
runs); without it the whole release is ingested. The receipt is printed as
JSON and nothing else is: no connection string, no environment value.
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

from app.col_ingest import ingest_catalogue_of_life  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest one Catalogue of Life release.")
    parser.add_argument("--archive", help="A ColDP zip already on disk.")
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL"),
        help="Defaults to DATABASE_URL.",
    )
    parser.add_argument("--keep-snapshots", type=int, default=2)
    parser.add_argument(
        "--materialize-limit",
        type=int,
        default=20_000,
        help="How many existing nodes to place on the tree in this run.",
    )
    options = parser.parse_args()
    if not options.database_url:
        parser.error("--database-url or DATABASE_URL is required")

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    # A pulled Vercel environment writes values with escaped newlines, and a
    # shell that exports them without unescaping hands psycopg a DSN ending in
    # a literal backslash-n. Postgres then refuses `sslmode=require\n`, which
    # reads like a certificate problem and is not one.
    database_url = options.database_url.strip().removesuffix("\\n").strip()
    with psycopg.connect(
        database_url, autocommit=True, row_factory=dict_row
    ) as conn:
        receipt = ingest_catalogue_of_life(
            conn,
            archive_path=options.archive,
            keep_snapshots=options.keep_snapshots,
            materialize_limit=options.materialize_limit,
        )
    print(json.dumps(receipt.as_dict(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
