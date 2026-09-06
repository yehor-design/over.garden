"""Run one Wikidata crosswalk by hand (OVE-393).

The worker runs this on a `catalog_source_refresh` job with
`source_slug = 'wikidata'`; this entry point is for the loopback rehearsal and
for the production run the runbook describes.

    .venv/bin/python -m scripts.crosswalk_wikidata --database-url "$DATABASE_URL"

`WIKIDATA_CONTACT` adds a contact address to the User-Agent, as Wikimedia's
policy asks. The receipt is printed as JSON and nothing else is.
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

from app.wikidata_crosswalk import crosswalk_wikidata  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Crosswalk canonical nodes through Wikidata.")
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL"),
        help="Defaults to DATABASE_URL.",
    )
    parser.add_argument("--limit", type=int, default=5_000)
    options = parser.parse_args()
    if not options.database_url:
        parser.error("--database-url or DATABASE_URL is required")

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    # A pulled Vercel environment writes values with escaped newlines; a shell
    # that exports them without unescaping hands psycopg a DSN ending in a
    # literal backslash-n, and Postgres refuses `sslmode=require\n`.
    database_url = options.database_url.strip().removesuffix("\\n").strip()
    with psycopg.connect(database_url, autocommit=True, row_factory=dict_row) as conn:
        receipt = crosswalk_wikidata(conn, limit=options.limit)
    print(json.dumps(receipt.as_dict(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
