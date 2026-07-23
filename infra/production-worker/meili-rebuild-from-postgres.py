#!/usr/bin/env python3
"""OVE-198: rebuild derived Meilisearch indexes from Postgres into MEILISEARCH_HOST.

Rebuilds catalog_typeahead from Postgres and ensures journal_entries settings.
Journal documents are converged by the OVE-196 public-index parity apply path
(counts-only), not by a partial SQL candidate loop.

Writes counts-only summary JSON to OVERGARDEN_MEILI_REBUILD_SUMMARY.
Never prints document bodies, user IDs, or secrets.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from app import search


def main() -> int:
    summary_path = Path(
        os.environ.get(
            "OVERGARDEN_MEILI_REBUILD_SUMMARY",
            "/opt/overgarden/meili-upgrade-state/rebuild-summary.json",
        )
    )
    dsn = os.environ["DIRECT_URL"]
    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        catalog = search.reindex_catalog_typeahead(conn)
        client = search.client()
        journal_index = client.index(search.PUBLIC_JOURNAL_ENTRIES_INDEX)
        search._ensure_public_journal_entries_settings(client, journal_index)
        # Start journals empty on the new volume; OVE-196 parity apply is the
        # canonical eligibility-safe journal convergence path.
        delete_task = journal_index.delete_all_documents()
        search._wait_for_task(client, delete_task.task_uid)

    summary = {
        "catalogIndexed": int(catalog.get("indexed") or 0),
        "journalCandidates": 0,
        "journalIndexed": 0,
        "journalConvergence": "ove196_public_index_parity_apply",
    }
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary), encoding="utf-8")
    print(
        f"rebuild_summary catalogIndexed={summary['catalogIndexed']} "
        f"journalConvergence={summary['journalConvergence']}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001 - operator boundary
        print(f"rebuild_failed class={type(exc).__name__}", file=sys.stderr)
        raise
