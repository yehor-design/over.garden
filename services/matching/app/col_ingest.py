"""Catalogue of Life ingest (OVE-392, ADR-0026 D2 and D7).

Catalogue of Life is the classification and accepted-name backbone; OverGarden
authors no tree. This module downloads the pinned ColDP release, verifies its
checksum, streams ``NameUsage`` and ``VernacularName`` into
``catalog_source_col_usages`` and ``catalog_source_col_vernaculars`` under one
``catalog_source_snapshots`` row, and prunes everything but the two newest
snapshots: one to serve the picker's secondary path, one to diff against.

Three things this handler refuses to guess:

* **Disk.** The archive is about a gigabyte and the usages run to millions of
  rows, so the free space on the host is checked before the first byte is
  fetched. A host that cannot hold the archive fails loudly and immediately
  rather than half way through a download.
* **The release.** The version, the URL and the sha256 come from the caller
  (the payload) or from the pinned manifest default, never from "latest": a
  snapshot that cannot say which release it holds is not evidence.
* **The vocabulary.** ColDP writes ``provisionally accepted`` with a space;
  the column's CHECK spells it with an underscore. The mapping is explicit
  here, and a status outside the vocabulary raises rather than being coerced.

Nothing in this module runs on a gardener's request path.
"""

from __future__ import annotations

import csv
import hashlib
import io
import logging
import os
import shutil
import time
import urllib.request
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator, Sequence

from app.normalize_name import normalize_name

log = logging.getLogger("overgarden.col_ingest")

# ColDP carries free text — remarks, distribution notes — and one field in the
# July 2026 release is larger than Python's default 128 KiB csv limit. Reading
# the real archive is the only thing that shows it: a ten-thousand-row fixture
# never comes close.
csv.field_size_limit(2**31 - 1)

COL_SOURCE_SLUG = "catalogue-of-life-checklistbank"
COL_SOURCE_NAME = "Catalogue of Life"
COL_SOURCE_CATEGORY = "species_backbone"
COL_LICENSE = "CC BY 4.0"
COL_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
COL_ATTRIBUTION = (
    "Catalogue of Life (COL26.7 Base Release), CC BY 4.0, doi:10.48580/dgyhw"
)
COL_PARSER_VERSION = "col-ingest.v1"

# The release pinned in docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json.
DEFAULT_RELEASE = {
    "version": "COL26.7",
    "dataset_key": "315777",
    "doi": "10.48580/dgyhw",
    "url": "https://download.checklistbank.org/col/monthly/2026-07-14_coldp.zip",
    "sha256": "3fac0cd59be401fdd48df0e5b0dd6215cb87269ecfa066af6e9a6d9bfcd6de36",
}

# The archive plus room for the streaming decompression and Postgres' own
# temporary files. Measured against a 1.0 GB archive on 2026-09-06.
REQUIRED_FREE_BYTES = 6 * 1024**3

# What the host is willing to hold. The whole July 2026 release is 5,413,595
# usages and 3.3 GB with its indexes, which does not fit a 10 GiB managed
# database beside the application's own data; the plant kingdoms and their
# synonyms are 1,976,974 usages and about 1.2 GB. The readiness manifest says
# the same thing in words: "importer must scope to plant catalog needs first".
#
# Empty means the whole release, which is what a loopback database gets.
# `COL_INGEST_KINGDOMS=Plantae,Fungi,Chromista` is what production runs, and
# the snapshot row records the scope it was ingested under.
def configured_kingdoms() -> tuple[str, ...]:
    raw = os.environ.get("COL_INGEST_KINGDOMS", "").strip()
    if not raw:
        return ()
    return tuple(
        sorted({part.strip() for part in raw.split(",") if part.strip()})
    )

USAGE_COLUMNS: tuple[str, ...] = (
    "source_snapshot_id",
    "col_id",
    "parent_col_id",
    "rank",
    "status",
    "scientific_name",
    "authorship",
    "canonical_name",
    "kingdom",
)
VERNACULAR_COLUMNS: tuple[str, ...] = (
    "source_snapshot_id",
    "col_id",
    "name",
    "language",
)

# ColDP TaxonomicStatus as the archive writes it, mapped to the column's CHECK.
STATUS_VOCABULARY = {
    "accepted": "accepted",
    "provisionally accepted": "provisionally_accepted",
    "synonym": "synonym",
    "ambiguous synonym": "ambiguous_synonym",
    "misapplied": "misapplied",
    "bare name": "bare_name",
}

MAX_NAME_LENGTH = 500
MAX_COL_ID_LENGTH = 64
MAX_RANK_LENGTH = 40
MAX_KINGDOM_LENGTH = 80
MAX_VERNACULAR_LENGTH = 300
MAX_LANGUAGE_LENGTH = 12


class ColIngestError(RuntimeError):
    """A refusal the job should not retry blindly: disk, checksum, or shape."""


@dataclass
class ColIngestReceipt:
    source_slug: str = COL_SOURCE_SLUG
    release_version: str = ""
    snapshot_id: str = ""
    usages: int = 0
    vernaculars: int = 0
    skipped_usages: int = 0
    duration_seconds: float = 0.0
    downloaded_bytes: int = 0
    reused_archive: bool = False
    pruned_snapshots: int = 0
    already_imported: bool = False
    already_running: bool = False
    usages_seconds: float = 0.0
    vernaculars_seconds: float = 0.0
    kingdoms: tuple[str, ...] = ()
    refresh: dict[str, Any] = field(default_factory=dict)
    materialized: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "sourceSlug": self.source_slug,
            "releaseVersion": self.release_version,
            "snapshotId": self.snapshot_id,
            "usages": self.usages,
            "vernaculars": self.vernaculars,
            "skippedUsages": self.skipped_usages,
            "durationSeconds": round(self.duration_seconds, 3),
            "downloadedBytes": self.downloaded_bytes,
            "reusedArchive": self.reused_archive,
            "prunedSnapshots": self.pruned_snapshots,
            "alreadyImported": self.already_imported,
            "alreadyRunning": self.already_running,
            "usagesSeconds": round(self.usages_seconds, 3),
            "vernacularsSeconds": round(self.vernaculars_seconds, 3),
            "kingdoms": list(self.kingdoms) or ["*"],
            "refresh": self.refresh,
            "materialized": self.materialized,
        }


def ingest_catalogue_of_life(
    conn: Any,
    *,
    release: dict[str, str] | None = None,
    archive_path: str | os.PathLike[str] | None = None,
    work_dir: str | os.PathLike[str] | None = None,
    keep_snapshots: int = 2,
    kingdoms: tuple[str, ...] | None = None,
    materialize_limit: int = 20_000,
) -> ColIngestReceipt:
    """Ingests one ColDP release into the source layer and returns its receipt.

    ``archive_path`` skips the download for an archive already on disk (the
    executed tests, and a second run on the same host). The checksum is
    verified either way: a local file is evidence only once it matches.
    """
    started = time.monotonic()
    chosen = {**DEFAULT_RELEASE, **(release or {})}
    scope = configured_kingdoms() if kingdoms is None else tuple(sorted(kingdoms))
    receipt = ColIngestReceipt(release_version=str(chosen["version"]), kingdoms=scope)

    # One ingest at a time. The job's lease is measured in minutes and a full
    # release takes longer, so a second worker could otherwise claim the same
    # job and write a second copy of five million rows. The lock lives on this
    # connection and is released with it.
    if not _try_lock(conn):
        receipt.already_running = True
        receipt.duration_seconds = time.monotonic() - started
        log.info("col_ingest already running elsewhere %s", receipt.as_dict())
        return receipt

    existing = _existing_snapshot(conn, chosen["version"], chosen["sha256"], scope)
    if existing:
        receipt.snapshot_id = existing
        receipt.already_imported = True
        receipt.usages = _count_usages(conn, existing)
        receipt.vernaculars = _count_vernaculars(conn, existing)
        receipt.duration_seconds = time.monotonic() - started
        log.info("col_ingest already imported %s", receipt.as_dict())
        return receipt

    with _archive(chosen, archive_path, work_dir, receipt) as path:
        # One transaction: a release that fails half way through leaves no
        # snapshot row claiming to hold rows it does not have.
        with conn.transaction():
            snapshot_id = _insert_snapshot(conn, chosen, scope)
            receipt.snapshot_id = snapshot_id
            with zipfile.ZipFile(path) as archive:
                phase = time.monotonic()
                receipt.usages, receipt.skipped_usages = _copy_usages(
                    conn, archive, snapshot_id, scope
                )
                receipt.usages_seconds = time.monotonic() - phase
                phase = time.monotonic()
                receipt.vernaculars = _copy_vernaculars(
                    conn, archive, snapshot_id, scope
                )
                receipt.vernaculars_seconds = time.monotonic() - phase

    conn.execute("analyze catalog_source_col_usages")
    conn.execute("analyze catalog_source_col_vernaculars")

    # The release is in; now the graph. The diff runs before the prune, while
    # the release it replaces is still there to compare against.
    receipt.refresh = _refresh_diff(conn)
    receipt.materialized = _materialize(conn, materialize_limit)
    receipt.pruned_snapshots = _prune(conn, keep_snapshots)
    receipt.duration_seconds = time.monotonic() - started
    log.info("col_ingest %s", receipt.as_dict())
    return receipt


# ----------------------------------------------------------------------
# The archive
# ----------------------------------------------------------------------


@contextmanager
def _archive(
    release: dict[str, str],
    archive_path: str | os.PathLike[str] | None,
    work_dir: str | os.PathLike[str] | None,
    receipt: ColIngestReceipt,
) -> Iterator[Path]:
    if archive_path is not None:
        path = Path(archive_path)
        if not path.is_file():
            raise ColIngestError(f"col_ingest: archive not found at {path}")
        _assert_checksum(path, release["sha256"])
        receipt.reused_archive = True
        receipt.downloaded_bytes = path.stat().st_size
        yield path
        return

    directory = Path(work_dir or os.environ.get("COL_INGEST_WORK_DIR") or "/tmp")
    directory.mkdir(parents=True, exist_ok=True)
    assert_free_disk_space(directory)
    target = directory / f"coldp-{release['version']}.zip"
    try:
        receipt.downloaded_bytes = _download(release["url"], target)
        _assert_checksum(target, release["sha256"])
        yield target
    finally:
        target.unlink(missing_ok=True)


def assert_free_disk_space(
    directory: str | os.PathLike[str],
    required_bytes: int = REQUIRED_FREE_BYTES,
) -> int:
    """Refuses before the first byte rather than half way through a gigabyte."""
    usage = shutil.disk_usage(os.fspath(directory))
    if usage.free < required_bytes:
        raise ColIngestError(
            "col_ingest: "
            f"{usage.free // 1024**2} MiB free at {directory}, "
            f"{required_bytes // 1024**2} MiB required"
        )
    return usage.free


def _download(url: str, target: Path) -> int:
    log.info("col_ingest downloading %s", url)
    request = urllib.request.Request(url, headers={"user-agent": "OverGarden/col-ingest"})
    written = 0
    with urllib.request.urlopen(request, timeout=300) as response:  # noqa: S310
        with target.open("wb") as handle:
            while chunk := response.read(1024 * 1024):
                handle.write(chunk)
                written += len(chunk)
    return written


def _assert_checksum(path: Path, expected: str) -> None:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    actual = digest.hexdigest()
    if actual != expected:
        raise ColIngestError(
            f"col_ingest: checksum mismatch for {path.name} (expected {expected})"
        )


# ----------------------------------------------------------------------
# The rows
# ----------------------------------------------------------------------


def _copy_usages(
    conn: Any,
    archive: zipfile.ZipFile,
    snapshot_id: str,
    scope: tuple[str, ...] = (),
) -> tuple[int, int]:
    copied = 0
    skipped = 0
    # A synonym carries no kingdom of its own, so a scoped run first learns
    # which accepted usages are in scope and then keeps the synonyms hanging
    # under them. Two passes over the archive, one small set in memory.
    in_scope: set[str] | None = _accepted_in_scope(archive, scope) if scope else None
    statement = (
        f"copy catalog_source_col_usages ({', '.join(USAGE_COLUMNS)}) from stdin"
    )
    with _detached_indexes(conn, "catalog_source_col_usages"):
        with conn.cursor().copy(statement) as copy:
            for row in _read_usages(archive):
                if row is None:
                    skipped += 1
                    continue
                if in_scope is not None and not _row_in_scope(row, in_scope, scope):
                    skipped += 1
                    continue
                copy.write_row((snapshot_id, *row))
                copied += 1
    return copied, skipped


@contextmanager
def _detached_indexes(conn: Any, table: str) -> Iterator[None]:
    """Loads five million rows into a table without its search indexes.

    A trigram index maintained row by row dominates the load: measured on the
    July 2026 release, keeping it turns minutes into an hour. The definitions
    are read from the catalog rather than repeated here, so this cannot drift
    from the migration, and everything happens inside the ingest's
    transaction: a failed load leaves the indexes exactly as it found them.

    The cost is honest and bounded: `drop index` takes the table's lock, so
    the secondary "search the full catalogue" path waits for the length of one
    monthly ingest. The primary picker reads canonical nodes and is untouched.
    """
    rows = conn.execute(
        """
        select indexname, indexdef
        from pg_indexes
        where schemaname = 'public' and tablename = %s
          and indexname like %s
        """,
        (table, f"{table}_%_idx"),
    ).fetchall()
    definitions = [
        (str(_column(row, "indexname", 0)), str(_column(row, "indexdef", 1)))
        for row in rows
    ]
    for name, _definition in definitions:
        conn.execute(f'drop index if exists "{name}"')
    yield
    # Only on success: a failure rolls the whole transaction back, and DDL
    # rolls back with it, so the indexes return without anything running here.
    # Rebuilding them inside a failed transaction would replace the real error
    # with `InFailedSqlTransaction`.
    for _name, definition in definitions:
        conn.execute(definition)


def _copy_vernaculars(
    conn: Any,
    archive: zipfile.ZipFile,
    snapshot_id: str,
    scope: tuple[str, ...] = (),
) -> int:
    copied = 0
    statement = (
        "copy catalog_source_col_vernaculars "
        f"({', '.join(VERNACULAR_COLUMNS)}) from stdin"
    )
    # The same normalizer the unique index uses. Case folding is not enough:
    # the index normalizes punctuation too, and Catalogue of Life carries both
    # "lion's mane jellyfish" and "lion’s mane jellyfish" for one taxon.
    seen: set[tuple[str, str, str]] = set()
    with conn.cursor().copy(statement) as copy:
        for col_id, name, language in _read_vernaculars(archive):
            key = (col_id, (language or "").lower(), normalize_name(name))
            if key in seen:
                continue
            seen.add(key)
            copy.write_row((snapshot_id, col_id, name, language))
            copied += 1

    if scope:
        # A vernacular of a usage this scope left out is dropped in one
        # statement. Reading the kept ids back to the client first is the
        # obvious alternative and the wrong one: on a managed database it
        # meant pulling two million ids over the network, and it dominated
        # the whole ingest.
        removed = conn.execute(
            """
            delete from catalog_source_col_vernaculars as vernacular
            where vernacular.source_snapshot_id = %s::uuid
              and not exists (
                select 1 from catalog_source_col_usages as usage
                where usage.source_snapshot_id = vernacular.source_snapshot_id
                  and usage.col_id = vernacular.col_id
              )
            """,
            (snapshot_id,),
        ).rowcount
        copied -= max(removed or 0, 0)
    return copied


def _accepted_in_scope(archive: zipfile.ZipFile, scope: tuple[str, ...]) -> set[str]:
    """The accepted usages of the scoped kingdoms, by id.

    Catalogue of Life denormalizes the classification onto every accepted row
    and leaves it blank on synonyms, so this first pass is what lets the second
    keep a synonym whose own row says nothing about its kingdom.
    """
    wanted = {kingdom.casefold() for kingdom in scope}
    ids: set[str] = set()
    with archive.open("NameUsage.tsv") as raw:
        reader = _tsv(raw)
        header = next(reader)
        index = {name: position for position, name in enumerate(header)}
        for parts in reader:
            kingdom = (_cell(parts, index, "col:kingdom") or "").casefold()
            name = (_cell(parts, index, "col:scientificName") or "").casefold()
            if (kingdom and kingdom in wanted) or (name and name in wanted):
                col_id = _cell(parts, index, "col:ID")
                if col_id:
                    ids.add(col_id)
    return ids


def _row_in_scope(
    row: Sequence[str | None], in_scope: set[str], scope: tuple[str, ...]
) -> bool:
    """A row is in scope by its own kingdom, by its name, or by its parent.

    By its name because Catalogue of Life leaves `kingdom` blank on the
    kingdom's own row: without this the classification of a plant stops one
    rank below Plantae, which is where every ancestor walk expects to end.
    """
    wanted = {name.casefold() for name in scope}
    kingdom = row[7]
    if kingdom and kingdom.casefold() in wanted:
        return True
    canonical = row[6]
    if canonical and canonical.casefold() in wanted:
        return True
    parent = row[1]
    return bool(parent and parent in in_scope)


def _read_usages(archive: zipfile.ZipFile) -> Iterator[Sequence[str | None] | None]:
    """Yields one tuple per usage, or None for a row the schema cannot hold."""
    with archive.open("NameUsage.tsv") as raw:
        reader = _tsv(raw)
        header = next(reader)
        index = {name: position for position, name in enumerate(header)}
        for column in ("col:ID", "col:status", "col:scientificName"):
            if column not in index:
                raise ColIngestError(f"col_ingest: NameUsage.tsv has no {column}")
        for parts in reader:
            yield _usage_row(parts, index)


def _usage_row(
    parts: Sequence[str], index: dict[str, int]
) -> Sequence[str | None] | None:
    col_id = _cell(parts, index, "col:ID")
    canonical = _cell(parts, index, "col:scientificName")
    raw_status = (_cell(parts, index, "col:status") or "").strip().lower()
    if not col_id or not canonical or not raw_status:
        return None
    status = STATUS_VOCABULARY.get(raw_status)
    if status is None:
        raise ColIngestError(f"col_ingest: unknown ColDP status {raw_status!r}")
    if len(col_id) > MAX_COL_ID_LENGTH or len(canonical) > MAX_NAME_LENGTH:
        return None

    authorship = _cell(parts, index, "col:authorship")
    scientific = f"{canonical} {authorship}".strip() if authorship else canonical
    return (
        col_id,
        _bounded(_cell(parts, index, "col:parentID"), MAX_COL_ID_LENGTH),
        _bounded(_cell(parts, index, "col:rank"), MAX_RANK_LENGTH),
        status,
        scientific[:MAX_NAME_LENGTH],
        _bounded(authorship, MAX_NAME_LENGTH),
        canonical,
        _bounded(_cell(parts, index, "col:kingdom"), MAX_KINGDOM_LENGTH),
    )


def _read_vernaculars(
    archive: zipfile.ZipFile,
) -> Iterator[tuple[str, str, str | None]]:
    if "VernacularName.tsv" not in archive.namelist():
        return
    with archive.open("VernacularName.tsv") as raw:
        reader = _tsv(raw)
        header = next(reader)
        index = {name: position for position, name in enumerate(header)}
        id_column = "col:taxonID" if "col:taxonID" in index else "col:ID"
        for parts in reader:
            col_id = _cell(parts, index, id_column)
            name = _cell(parts, index, "col:name")
            if not col_id or not name or len(col_id) > MAX_COL_ID_LENGTH:
                continue
            if len(name) > MAX_VERNACULAR_LENGTH:
                continue
            yield (
                col_id,
                name,
                _bounded(_cell(parts, index, "col:language"), MAX_LANGUAGE_LENGTH),
            )


def _tsv(raw: Any) -> Iterator[list[str]]:
    stream = io.TextIOWrapper(raw, encoding="utf8", errors="replace", newline="")
    # ColDP is tab separated with no quoting: a quote is part of a name.
    return csv.reader(stream, delimiter="\t", quoting=csv.QUOTE_NONE)


def _cell(parts: Sequence[str], index: dict[str, int], column: str) -> str | None:
    position = index.get(column)
    if position is None or position >= len(parts):
        return None
    value = parts[position].strip()
    return value or None


def _bounded(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    return value[:limit]


# ----------------------------------------------------------------------
# The snapshot
# ----------------------------------------------------------------------


INSERT_SNAPSHOT_SQL = """
insert into catalog_source_snapshots (
  source_slug, source_name, source_category, source_version, source_url,
  license, license_url, attribution_required, attribution_text, allowed_usage,
  parser_version, payload_sha256, fetched_at, verified_at, status
)
values (
  %s, %s, %s, %s, %s,
  %s, %s, true, %s, %s::jsonb,
  %s, %s, now(), now(), 'imported'
)
returning id::text as id
"""

EXISTING_SNAPSHOT_SQL = """
select id::text as id
from catalog_source_snapshots
where source_slug = %s and source_version = %s and payload_sha256 = %s
limit 1
"""


def _insert_snapshot(
    conn: Any, release: dict[str, str], scope: tuple[str, ...] = ()
) -> str:
    row = conn.execute(
        INSERT_SNAPSHOT_SQL,
        (
            COL_SOURCE_SLUG,
            COL_SOURCE_NAME,
            COL_SOURCE_CATEGORY,
            _snapshot_version(release, scope),
            release["url"],
            COL_LICENSE,
            COL_LICENSE_URL,
            COL_ATTRIBUTION,
            '["raw_snapshot", "canonical_product_projection"]',
            COL_PARSER_VERSION,
            release["sha256"],
        ),
    ).fetchone()
    if row is None:
        raise ColIngestError("col_ingest: the snapshot row was not written")
    return str(_field(row, "id"))


def _snapshot_version(release: dict[str, str], scope: tuple[str, ...] = ()) -> str:
    """What this snapshot holds, in the row itself: release, key, doi, scope."""
    doi = release.get("doi")
    key = release.get("dataset_key")
    parts = [str(release["version"])]
    if key:
        parts.append(f"key {key}")
    if doi:
        parts.append(f"doi {doi}")
    if scope:
        parts.append("kingdoms " + "+".join(scope))
    return ", ".join(parts)[:120]


def _existing_snapshot(
    conn: Any, version: str, sha256: str, scope: tuple[str, ...] = ()
) -> str | None:
    row = conn.execute(
        EXISTING_SNAPSHOT_SQL,
        (COL_SOURCE_SLUG, _snapshot_version({"version": version}, scope), sha256),
    ).fetchone()
    if row is None:
        # The version string carries the key and the DOI; match on checksum too.
        row = conn.execute(
            """
            select id::text as id
            from catalog_source_snapshots
            where source_slug = %s and payload_sha256 = %s
              and source_version like %s
            order by fetched_at desc
            limit 1
            """,
            (
                COL_SOURCE_SLUG,
                sha256,
                f"%kingdoms {'+'.join(scope)}%" if scope else "%",
            ),
        ).fetchone()
    return str(_field(row, "id")) if row else None


# One arbitrary, stable key for the ingest's advisory lock.
COL_INGEST_LOCK_KEY = 0x0C012026


def _try_lock(conn: Any) -> bool:
    row = conn.execute(
        "select pg_try_advisory_lock(%s) as locked", (COL_INGEST_LOCK_KEY,)
    ).fetchone()
    return bool(_field(row, "locked")) if row else False


def _refresh_diff(conn: Any) -> dict[str, Any]:
    """The change classes of ADR-0026 D4, applied by the SQL of migration 0057."""
    row = conn.execute("select catalog_col_refresh_diff() as summary").fetchone()
    summary = _field(row, "summary") if row else None
    return dict(summary) if isinstance(summary, dict) else {}


def _materialize(conn: Any, limit: int) -> dict[str, Any]:
    """Places the nodes gardeners, registers and EPPO already touch on the tree."""
    row = conn.execute(
        "select catalog_col_materialize_existing(%s) as summary", (limit,)
    ).fetchone()
    summary = _field(row, "summary") if row else None
    return dict(summary) if isinstance(summary, dict) else {}


def _prune(conn: Any, keep: int) -> int:
    row = conn.execute(
        "select catalog_col_prune_snapshots(%s) as removed", (keep,)
    ).fetchone()
    return int(_field(row, "removed") or 0) if row else 0


def _count_usages(conn: Any, snapshot_id: str) -> int:
    row = conn.execute(
        "select count(*)::int as count from catalog_source_col_usages where source_snapshot_id = %s::uuid",
        (snapshot_id,),
    ).fetchone()
    return int(_field(row, "count") or 0) if row else 0


def _count_vernaculars(conn: Any, snapshot_id: str) -> int:
    row = conn.execute(
        "select count(*)::int as count from catalog_source_col_vernaculars where source_snapshot_id = %s::uuid",
        (snapshot_id,),
    ).fetchone()
    return int(_field(row, "count") or 0) if row else 0


def _field(row: Any, name: str) -> Any:
    if row is None:
        return None
    if isinstance(row, dict):
        return row.get(name)
    return row[0]


def _column(row: Any, name: str, position: int) -> Any:
    """A row from either row factory: named where possible, positional else."""
    if isinstance(row, dict):
        return row.get(name)
    return row[position]
