"""Run one WFO or GBIF crosswalk by hand (OVE-396).

The worker runs this on a `catalog_source_refresh` job with
`source_slug = 'world-flora-online'` or `'gbif-backbone'`; this entry point is
for the loopback rehearsal and for the production run the runbook describes.

    .venv/bin/python -m scripts.crosswalk_wfo_gbif --source world-flora-online
    .venv/bin/python -m scripts.crosswalk_wfo_gbif --source gbif-backbone \
        --release-path /abs/path/simple.txt.gz

`--release-path` reads a release already on disk instead of downloading it
again; it is checked against the same pinned digest, so it can only shorten a
run, never change what it reads. The receipt is printed as JSON and nothing
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

from app.wfo_gbif_crosswalk import SOURCES, crosswalk_source  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Corroborate canonical nodes through WFO and GBIF identifiers."
    )
    parser.add_argument("--source", choices=sorted(SOURCES), required=True)
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL"),
        help="Defaults to DATABASE_URL.",
    )
    parser.add_argument("--limit", type=int, default=500_000)
    parser.add_argument(
        "--release-path",
        default=None,
        help="A copy of the pinned release on disk; its digest is still checked.",
    )
    options = parser.parse_args()
    if not options.database_url:
        parser.error("--database-url or DATABASE_URL is required")

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    # A pulled Vercel environment writes values with escaped newlines; a shell
    # that exports them without unescaping hands psycopg a DSN ending in a
    # literal backslash-n, and Postgres refuses `sslmode=require\n`.
    database_url = options.database_url.strip().removesuffix("\\n").strip()
    with psycopg.connect(database_url, autocommit=True, row_factory=dict_row) as conn:
        receipt = crosswalk_source(
            conn,
            options.source,
            limit=options.limit,
            release_path=Path(options.release_path) if options.release_path else None,
        )
    print(json.dumps(receipt.as_dict(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
