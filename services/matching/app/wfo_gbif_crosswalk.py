"""World Flora Online and GBIF identifiers (OVE-396, ADR-0026 D2, D13).

Catalogue of Life stays the backbone. This job does not reclassify anything:
it puts two more identifiers on the nodes that already exist, so the ladder's
first rung has more to match on and a card's ``sameAs`` carries the full set a
search engine recognises.

Two releases, both pinned and both read exactly once per run:

* the **World Flora Online Plant List**, a Zenodo release under CC0 — one
  Darwin Core ``classification.csv`` of 1.66 million plant names inside a
  122 MB zip;
* the **GBIF Backbone Taxonomy**, a dated hosted export under CC BY 4.0 — one
  gzipped ``simple.txt`` of 5.9 million usages across every kingdom, streamed
  rather than unpacked.

Neither is stored whole. A 10 GiB managed database already holds the Catalogue
of Life at 1.4 GB, and a checklist nobody queries is not worth its disk: the
snapshot records only the rows that reached a node, as ``identifier``,
``scientific name``, ``authorship`` and ``status``. That is what the ladder
reads back, and it is what the readiness manifest allows.

Matching is two rungs and nothing else:

1. **The identifier the node already carries.** Wikidata wrote ``wfo`` and
   ``gbif`` ids for the nodes it could reach (OVE-393). A release row with that
   identifier corroborates it — the evidence is recorded, no identifier is
   rewritten.
2. **The scientific name, kingdom-aware.** A name that resolves to exactly one
   release row wins. Two rows of equal standing under one name is a homonym,
   not a match, and it is counted and left alone. GBIF spans every kingdom, so
   the node's kingdom decides between ``Aa`` the orchid and ``Aa`` the virus
   before anything else does.

An identifier another node already holds is never moved. It becomes one
``source_link`` item in the owner's queue, exactly as the Wikidata crosswalk
does, because a graph whose identifiers are unique is the only reason rung one
works at all.

Nothing here runs on a gardener's request path: the worker runs it on a
``catalog_source_refresh`` job, and ``wfo-gbif-offline.test.ts`` fails if a
file the web app ships ever names one of these hosts.
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import logging
import os
import shutil
import tempfile
import time
import urllib.request
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator, Mapping, Sequence

from app.normalize_name import normalize_name

log = logging.getLogger("overgarden.wfo_gbif_crosswalk")

# The WFO classification carries free text in `taxonRemarks`; the default csv
# field cap is 128 KiB and the real release passes it.
csv.field_size_limit(2**31 - 1)

WFO_SOURCE_SLUG = "world-flora-online"
WFO_SOURCE_NAME = "World Flora Online Plant List"
WFO_SOURCE_CATEGORY = "species_backbone"
WFO_LICENSE = "CC0 1.0"
WFO_LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"
WFO_ATTRIBUTION = (
    "World Flora Online Plant List (June 2026), CC0 1.0, doi:10.5281/zenodo.20782718"
)
# CC0 asks for nothing; the line is kept because a card that says where a fact
# came from is worth more than the licence minimum.
WFO_ATTRIBUTION_REQUIRED = False

GBIF_SOURCE_SLUG = "gbif-backbone"
GBIF_SOURCE_NAME = "GBIF Backbone Taxonomy"
GBIF_SOURCE_CATEGORY = "species_backbone"
GBIF_LICENSE = "CC BY 4.0"
GBIF_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
GBIF_ATTRIBUTION = "GBIF Backbone Taxonomy, CC BY 4.0, doi:10.15468/39omei"
GBIF_ATTRIBUTION_REQUIRED = True

PARSER_VERSION = "wfo-gbif-crosswalk.v1"

# Both releases come from `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json`,
# pinned by version and digest. "Latest" is not a release: a snapshot that
# cannot say which one it holds is not evidence, and the ladder would have no
# way to explain a match it made last month.
WFO_RELEASE: Mapping[str, str] = {
    "version": "2026-06",
    "doi": "10.5281/zenodo.20782718",
    "url": "https://zenodo.org/api/records/20782718/files/_DwC_backbone_R.zip/content",
    "sha256": "ccfc7e3ca85c8b80aa96eb52d4e50e07e1811d28916b544280d8a4f1a043ba72",
    "member": "classification.csv",
}
GBIF_RELEASE: Mapping[str, str] = {
    "version": "2023-08-28",
    "doi": "10.15468/39omei",
    "url": "https://hosted-datasets.gbif.org/datasets/backbone/2023-08-28/simple.txt.gz",
    "sha256": "fde017e1315b4ae6fc1e1bae79f9cfd234b8ba40f6f4fb5ac031084a3b1763f0",
}

# The WFO zip and room to read it; GBIF is decompressed in flight and needs
# only the file it downloads.
WFO_REQUIRED_FREE_BYTES = 1024**3
GBIF_REQUIRED_FREE_BYTES = 2 * 1024**3

DOWNLOAD_TIMEOUT_SECONDS = 900
DOWNLOAD_CHUNK_BYTES = 1 << 20
SITE_URL = "https://over.garden"

# How many nodes one transaction writes. Small enough that a failure loses
# little, large enough that a production run is not one round trip per row.
WRITE_BATCH_NODES = 500

MAX_NAME_LENGTH = 500

# GBIF's kingdom keys are stable and documented; they are what lets a name that
# exists in three kingdoms reach the right node.
GBIF_KINGDOM_BY_KEY: Mapping[str, str] = {
    "1": "Animalia",
    "2": "Archaea",
    "3": "Bacteria",
    "4": "Chromista",
    "5": "Fungi",
    "6": "Plantae",
    "7": "Protozoa",
    "8": "Viruses",
}

# WFO is a flora: a plant node, or a node whose kingdom nobody has decided yet,
# may match it. An animal node may not, however its name reads.
WFO_KINGDOMS: frozenset[str] = frozenset({"Plantae"})

# Standing, best first. A name our nodes carry is usually the accepted one, so
# an accepted release row is the match; a synonym row still identifies the same
# name and is taken when nothing better answers.
WFO_STATUS_SCORE: Mapping[str, int] = {"accepted": 3, "unchecked": 2, "synonym": 1}
GBIF_STATUS_SCORE: Mapping[str, int] = {
    "accepted": 3,
    "doubtful": 2,
    "synonym": 1,
    "heterotypic_synonym": 1,
    "homotypic_synonym": 1,
    "proparte_synonym": 1,
    "misapplied": 1,
}

# GBIF publishes what a checklist gave it and, beside it, names it derived
# itself — an autonym it had to invent, a placeholder for a basionym nobody
# recorded. Both kinds carry a real usage key that `gbif.org/species/<key>`
# resolves, so neither is dropped; a derived name simply loses to a published
# one when both answer to the same name, which is what `origin` in the score
# is for. In the 2023-08-28 release 7,574,191 of 7,746,724 rows are `SOURCE`.
GBIF_PUBLISHED_ORIGINS: frozenset[str] = frozenset({"source", "verbatim_accepted"})


class WfoGbifCrosswalkError(RuntimeError):
    """A refusal worth stopping for: a bad digest, a missing member, no disk."""


@dataclass
class CrosswalkReceipt:
    source_slug: str
    source_version: str = ""
    snapshot_id: str = ""
    nodes_considered: int = 0
    release_rows: int = 0
    matched_by_identifier: int = 0
    matched_by_name: int = 0
    ambiguous_names: int = 0
    identifiers_written: int = 0
    identifiers_corroborated: int = 0
    identifier_conflicts: int = 0
    records_written: int = 0
    duration_seconds: float = 0.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "sourceSlug": self.source_slug,
            "sourceVersion": self.source_version,
            "snapshotId": self.snapshot_id,
            "nodesConsidered": self.nodes_considered,
            "releaseRows": self.release_rows,
            "matchedByIdentifier": self.matched_by_identifier,
            "matchedByName": self.matched_by_name,
            "ambiguousNames": self.ambiguous_names,
            "identifiersWritten": self.identifiers_written,
            "identifiersCorroborated": self.identifiers_corroborated,
            "identifierConflicts": self.identifier_conflicts,
            "recordsWritten": self.records_written,
            "durationSeconds": round(self.duration_seconds, 3),
        }


@dataclass
class ReleaseRow:
    """One release row, reduced to what matching and the projection need."""

    identifier: str
    scientific_name: str
    authorship: str | None
    status: str
    rank: str | None
    kingdom: str | None
    accepted_identifier: str | None = None
    #: How the release came by this row. WFO publishes every name it holds;
    #: GBIF marks the ones it derived, and those lose a tie.
    origin: str = "source"

    def projection(self) -> dict[str, Any]:
        return {
            "identifier": self.identifier,
            "scientificName": self.scientific_name,
            "authorship": self.authorship,
            "status": self.status,
            "rank": self.rank,
            "kingdom": self.kingdom,
            "acceptedIdentifier": self.accepted_identifier,
            "origin": self.origin,
        }


@dataclass
class Match:
    """The release row a node ended up with, and how it was reached."""

    row: ReleaseRow
    rung: str
    score: tuple[int, ...]
    ambiguous: bool = False


@dataclass
class SourceDefinition:
    slug: str
    name: str
    category: str
    license: str
    license_url: str
    attribution: str
    attribution_required: bool
    scheme: str
    release: Mapping[str, str]
    kingdoms: frozenset[str] | None
    reason_code: str


WFO = SourceDefinition(
    slug=WFO_SOURCE_SLUG,
    name=WFO_SOURCE_NAME,
    category=WFO_SOURCE_CATEGORY,
    license=WFO_LICENSE,
    license_url=WFO_LICENSE_URL,
    attribution=WFO_ATTRIBUTION,
    attribution_required=WFO_ATTRIBUTION_REQUIRED,
    scheme="wfo",
    release=WFO_RELEASE,
    kingdoms=WFO_KINGDOMS,
    reason_code="wfo_crosswalk",
)

GBIF = SourceDefinition(
    slug=GBIF_SOURCE_SLUG,
    name=GBIF_SOURCE_NAME,
    category=GBIF_SOURCE_CATEGORY,
    license=GBIF_LICENSE,
    license_url=GBIF_LICENSE_URL,
    attribution=GBIF_ATTRIBUTION,
    attribution_required=GBIF_ATTRIBUTION_REQUIRED,
    scheme="gbif",
    release=GBIF_RELEASE,
    kingdoms=None,
    reason_code="gbif_crosswalk",
)

SOURCES: Mapping[str, SourceDefinition] = {WFO.slug: WFO, GBIF.slug: GBIF}


# ----------------------------------------------------------------------
# Reading a release
# ----------------------------------------------------------------------


def _user_agent() -> str:
    contact = os.environ.get("SOURCE_CONTACT", "").strip()
    tail = f" ({contact})" if contact else ""
    return f"OverGarden/1.0 (+{SITE_URL}){tail}"


def _assert_free_space(directory: Path, required: int) -> None:
    free = shutil.disk_usage(directory).free
    if free < required:
        raise WfoGbifCrosswalkError(
            f"insufficient_disk: {free} bytes free, {required} needed"
        )


def _file_digest(path: Path) -> str:
    """The sha256 of a file, read in chunks.

    A release is hundreds of megabytes and the worker droplet has under a
    gigabyte of memory, so reading the whole file to hash it would be the one
    place this job could run out of it.
    """
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(DOWNLOAD_CHUNK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _download(url: str, destination: Path) -> str:
    """Downloads to `destination` and returns the sha256 of what arrived."""
    request = urllib.request.Request(url, headers={"User-Agent": _user_agent()})
    digest = hashlib.sha256()
    with urllib.request.urlopen(  # noqa: S310 - pinned https release URLs
        request, timeout=DOWNLOAD_TIMEOUT_SECONDS
    ) as response, destination.open("wb") as handle:
        while True:
            chunk = response.read(DOWNLOAD_CHUNK_BYTES)
            if not chunk:
                break
            digest.update(chunk)
            handle.write(chunk)
    return digest.hexdigest()


@contextmanager
def _released_file(
    release: Mapping[str, str], required_free_bytes: int, path: Path | None
) -> Iterator[Path]:
    """The pinned release on disk, verified, and removed again afterwards.

    `path` is the escape hatch a rehearsal and a test use: a file already on
    disk is checked against the same digest and left where it was.
    """
    if path is not None:
        actual = _file_digest(path)
        if actual != release["sha256"]:
            raise WfoGbifCrosswalkError(f"release_digest_mismatch: {actual}")
        yield path
        return
    directory = Path(tempfile.mkdtemp(prefix="overgarden-crosswalk-"))
    try:
        _assert_free_space(directory, required_free_bytes)
        destination = directory / "release"
        actual = _download(release["url"], destination)
        if actual != release["sha256"]:
            raise WfoGbifCrosswalkError(f"release_digest_mismatch: {actual}")
        yield destination
    finally:
        shutil.rmtree(directory, ignore_errors=True)


def read_wfo_rows(path: Path, member: str) -> Iterator[ReleaseRow]:
    """The WFO Darwin Core classification, one row at a time."""
    with zipfile.ZipFile(path) as archive:
        if member not in archive.namelist():
            raise WfoGbifCrosswalkError(f"release_member_missing: {member}")
        with archive.open(member) as raw:
            # A handful of authorship fields in the June 2026 release are not
            # valid UTF-8. Replacing those bytes costs an accent in a citation;
            # failing the run would cost the whole release.
            text = io.TextIOWrapper(raw, encoding="utf8", errors="replace", newline="")
            for row in csv.DictReader(text, delimiter="\t"):
                identifier = (row.get("taxonID") or "").strip()
                name = (row.get("scientificName") or "").strip()
                if not identifier or not name:
                    continue
                yield ReleaseRow(
                    identifier=identifier,
                    scientific_name=name[:MAX_NAME_LENGTH],
                    authorship=_optional(row.get("scientificNameAuthorship")),
                    status=(row.get("taxonomicStatus") or "").strip().lower(),
                    rank=_optional(row.get("taxonRank")),
                    kingdom="Plantae",
                    accepted_identifier=_optional(row.get("acceptedNameUsageID")),
                )


# `simple.txt` has no header; these are the columns this job reads, by index,
# from the GBIF backbone export documentation.
GBIF_COLUMN_ID = 0
GBIF_COLUMN_STATUS = 4
GBIF_COLUMN_RANK = 5
GBIF_COLUMN_ORIGIN = 8
GBIF_COLUMN_KINGDOM_KEY = 10
GBIF_COLUMN_SCIENTIFIC_NAME = 18
GBIF_COLUMN_CANONICAL_NAME = 19
GBIF_COLUMN_AUTHORSHIP = 24
GBIF_COLUMN_COUNT = 30


def read_gbif_rows(path: Path) -> Iterator[ReleaseRow]:
    """The GBIF backbone export, decompressed in flight, one usage at a time."""
    with gzip.open(path, mode="rt", encoding="utf8", errors="replace", newline="") as text:
        for line in text:
            fields = line.rstrip("\n").split("\t")
            if len(fields) < GBIF_COLUMN_COUNT:
                continue
            identifier = fields[GBIF_COLUMN_ID].strip()
            canonical = _null(fields[GBIF_COLUMN_CANONICAL_NAME])
            if not identifier or not canonical:
                continue
            yield ReleaseRow(
                identifier=identifier,
                scientific_name=canonical[:MAX_NAME_LENGTH],
                authorship=_null(fields[GBIF_COLUMN_AUTHORSHIP]),
                status=(fields[GBIF_COLUMN_STATUS] or "").strip().lower(),
                rank=(_null(fields[GBIF_COLUMN_RANK]) or "").lower() or None,
                kingdom=GBIF_KINGDOM_BY_KEY.get(
                    (fields[GBIF_COLUMN_KINGDOM_KEY] or "").strip()
                ),
                accepted_identifier=None,
                origin=(fields[GBIF_COLUMN_ORIGIN] or "").strip().lower(),
            )


def _optional(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _null(value: Any) -> str | None:
    """`simple.txt` writes an unset field as the two characters `\\N`."""
    text = _optional(value)
    return None if text is None or text == "\\N" else text


# ----------------------------------------------------------------------
# The graph
# ----------------------------------------------------------------------


SELECT_NODES_SQL = """
select
  item.id::text as id,
  item.canonical_name,
  item.kingdom,
  item.rank,
  (
    select identifier.value from catalog_item_identifiers as identifier
    where identifier.catalog_item_id = item.id and identifier.scheme = %s
    limit 1
  ) as current_value,
  coalesce((
    select array_agg(distinct name.display_name)
    from catalog_item_names as name
    where name.catalog_item_id = item.id
      and name.name_type in ('scientific_accepted', 'scientific_synonym')
  ), array[]::text[]) as scientific_names
from catalog_items as item
where item.identity_state = 'active'
  and item.node_kind = 'taxon'
  and item.merged_into_catalog_item_id is null
order by item.search_weight desc, item.created_at
limit %s
"""

INSERT_SNAPSHOT_SQL = """
insert into catalog_source_snapshots (
  source_slug, source_name, source_category, source_version, source_url,
  license, license_url, attribution_required, attribution_text, allowed_usage,
  parser_version, payload_sha256, fetched_at, verified_at, status
)
values (
  %s, %s, %s, %s, %s,
  %s, %s, %s, %s, %s::jsonb,
  %s, %s, now(), now(), 'imported'
)
on conflict (source_slug, source_version, payload_sha256) do update
  set verified_at = now()
returning id::text as id
"""

INSERT_RECORD_SQL = """
insert into catalog_source_records (
  source_snapshot_id, source_record_id, raw_payload, raw_payload_sha256,
  source_only_fields, allowed_projection, projection_status
)
values (%s::uuid, %s, %s::jsonb, %s, '{}'::jsonb, %s::jsonb, 'projected')
on conflict (source_snapshot_id, source_record_id) do update
  set raw_payload = excluded.raw_payload,
      raw_payload_sha256 = excluded.raw_payload_sha256,
      allowed_projection = excluded.allowed_projection,
      updated_at = now()
returning id::text as id
"""

INSERT_ASSERTION_SQL = """
insert into catalog_source_assertions (
  source_slug, source_snapshot_id, source_record_id, rights_class, confidence,
  decision, reason_codes
)
values (%s, %s::uuid, %s::uuid, 'source_public', 1, 'automatic', %s)
returning id::text as id
"""

IDENTIFIER_OWNER_SQL = """
select catalog_item_id::text as id from catalog_item_identifiers
where scheme = %s and value = %s
"""

INSERT_IDENTIFIER_SQL = """
insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id)
values (%s::uuid, %s, %s, %s::uuid)
on conflict (scheme, value) do nothing
returning id::text as id
"""

QUEUE_SOURCE_LINK_SQL = """
insert into catalog_curation_queue (
  item_type, subject_catalog_item_id, proposal, reasons, impact_score, state
)
select 'source_link', %s::uuid, %s::jsonb, %s, 1, 'open'
where not exists (
  select 1 from catalog_curation_queue as open_item
  where open_item.subject_catalog_item_id = %s::uuid
    and open_item.item_type = 'source_link'
    and open_item.state = 'open'
)
returning id::text as id
"""


def crosswalk_world_flora_online(
    conn: Any,
    *,
    limit: int = 500_000,
    release_path: Path | None = None,
    rows: Sequence[ReleaseRow] | None = None,
) -> CrosswalkReceipt:
    """Puts a World Flora Online identifier on every plant node it can reach."""
    return _crosswalk(conn, WFO, limit=limit, release_path=release_path, rows=rows)


def crosswalk_gbif_backbone(
    conn: Any,
    *,
    limit: int = 500_000,
    release_path: Path | None = None,
    rows: Sequence[ReleaseRow] | None = None,
) -> CrosswalkReceipt:
    """Puts a GBIF backbone key on every node the backbone knows by name."""
    return _crosswalk(conn, GBIF, limit=limit, release_path=release_path, rows=rows)


def crosswalk_source(
    conn: Any, source_slug: str, **kwargs: Any
) -> CrosswalkReceipt:
    """Dispatch by slug, so the worker names a source once."""
    source = SOURCES.get(source_slug)
    if source is None:
        raise WfoGbifCrosswalkError(f"unknown_source: {source_slug}")
    return _crosswalk(conn, source, **kwargs)


def _crosswalk(
    conn: Any,
    source: SourceDefinition,
    *,
    limit: int = 500_000,
    release_path: Path | None = None,
    rows: Sequence[ReleaseRow] | None = None,
) -> CrosswalkReceipt:
    """One pass. `rows` replaces the release for a test; everything after is shared."""
    started = time.monotonic()
    receipt = CrosswalkReceipt(
        source_slug=source.slug, source_version=str(source.release["version"])
    )

    nodes = [
        dict(row)
        for row in conn.execute(SELECT_NODES_SQL, (source.scheme, limit)).fetchall()
    ]
    candidates = [node for node in nodes if _node_is_in_scope(node, source)]
    receipt.nodes_considered = len(candidates)
    if not candidates:
        receipt.duration_seconds = time.monotonic() - started
        log.info("%s %s", source.slug, receipt.as_dict())
        return receipt

    by_name = _index_by_name(candidates)
    by_identifier = {
        str(node["current_value"]): node
        for node in candidates
        if node.get("current_value")
    }

    matches: dict[str, Match] = {}
    if rows is not None:
        _absorb(rows, source, by_name, by_identifier, matches, receipt)
    else:
        with _released_file(
            source.release,
            WFO_REQUIRED_FREE_BYTES if source is WFO else GBIF_REQUIRED_FREE_BYTES,
            release_path,
        ) as path:
            reader = (
                read_wfo_rows(path, str(source.release["member"]))
                if source is WFO
                else read_gbif_rows(path)
            )
            _absorb(reader, source, by_name, by_identifier, matches, receipt)

    resolved = {
        node_id: match for node_id, match in matches.items() if not match.ambiguous
    }
    receipt.ambiguous_names = sum(
        1 for match in matches.values() if match.ambiguous
    )
    receipt.matched_by_identifier = sum(
        1 for match in resolved.values() if match.rung == "identifier"
    )
    receipt.matched_by_name = sum(
        1 for match in resolved.values() if match.rung == "name"
    )
    if not resolved:
        receipt.duration_seconds = time.monotonic() - started
        log.info("%s %s", source.slug, receipt.as_dict())
        return receipt

    snapshot_id = _insert_snapshot(conn, source, _payload_digest(source, resolved))
    receipt.snapshot_id = snapshot_id

    by_id = {str(node["id"]): node for node in candidates}
    touched: list[str] = []
    ordered = sorted(resolved.items())
    for start in range(0, len(ordered), WRITE_BATCH_NODES):
        batch = ordered[start : start + WRITE_BATCH_NODES]
        with conn.transaction():
            for node_id, match in batch:
                _project(conn, source, by_id[node_id], match, snapshot_id, receipt)
                touched.append(node_id)

    if touched:
        # A card whose identifiers changed is stale until the outbox drains it:
        # the public read is `use cache`, and without this the page keeps the
        # `sameAs` set it had for hours.
        for start in range(0, len(touched), WRITE_BATCH_NODES):
            conn.execute(
                "select catalog_record_card_intents(%s::uuid[])",
                (touched[start : start + WRITE_BATCH_NODES],),
            )

    receipt.duration_seconds = time.monotonic() - started
    log.info("%s %s", source.slug, receipt.as_dict())
    return receipt


def _node_is_in_scope(node: Mapping[str, Any], source: SourceDefinition) -> bool:
    """A flora may not answer for an animal; a backbone of everything may."""
    if source.kingdoms is None:
        return True
    kingdom = node.get("kingdom")
    return kingdom is None or str(kingdom) in source.kingdoms


def _index_by_name(
    nodes: Sequence[Mapping[str, Any]],
) -> dict[str, list[Mapping[str, Any]]]:
    """Nodes by every scientific spelling they answer to, each node once.

    A node's `catalog_item_names` rows usually repeat its canonical name, so
    counting appearances rather than nodes would make every node a homonym of
    itself and nothing would match.
    """
    index: dict[str, dict[str, Mapping[str, Any]]] = {}
    for node in nodes:
        names = [node.get("canonical_name"), *(node.get("scientific_names") or [])]
        for name in names:
            if not name:
                continue
            index.setdefault(normalize_name(str(name)), {})[str(node["id"])] = node
    return {key: list(found.values()) for key, found in index.items()}


def _absorb(
    rows: Any,
    source: SourceDefinition,
    by_name: Mapping[str, Sequence[Mapping[str, Any]]],
    by_identifier: Mapping[str, Mapping[str, Any]],
    matches: dict[str, Match],
    receipt: CrosswalkReceipt,
) -> None:
    """Keeps, for every node, the best release row that named it."""
    for row in rows:
        receipt.release_rows += 1
        held = by_identifier.get(row.identifier)
        if held is not None:
            _offer(matches, str(held["id"]), Match(row, "identifier", (9,)))
            continue
        for node in by_name.get(normalize_name(row.scientific_name), ()):
            if not _kingdoms_agree(node, row, source):
                continue
            _offer(matches, str(node["id"]), Match(row, "name", _score(node, row, source)))


def _kingdoms_agree(
    node: Mapping[str, Any], row: ReleaseRow, source: SourceDefinition
) -> bool:
    """A kingdom both sides state and disagree on is not a match, ever.

    This is what stops `Aa` the orchid genus from taking the GBIF key of `Aa`
    the virus group. When either side is silent the name still has to earn the
    match on standing and rank.
    """
    if source.kingdoms is not None:
        return True
    node_kingdom = node.get("kingdom")
    if not node_kingdom or not row.kingdom:
        return True
    return str(node_kingdom) == row.kingdom


def _score(
    node: Mapping[str, Any], row: ReleaseRow, source: SourceDefinition
) -> tuple[int, ...]:
    table = WFO_STATUS_SCORE if source is WFO else GBIF_STATUS_SCORE
    standing = table.get(row.status, 0)
    kingdom_agrees = int(
        bool(node.get("kingdom")) and bool(row.kingdom) and str(node["kingdom"]) == row.kingdom
    )
    rank_agrees = int(
        bool(node.get("rank")) and bool(row.rank) and str(node["rank"]).lower() == row.rank
    )
    published = int(row.origin in GBIF_PUBLISHED_ORIGINS)
    return (kingdom_agrees, standing, published, rank_agrees)


def _offer(matches: dict[str, Match], node_id: str, candidate: Match) -> None:
    """Best score wins; an exact tie between two identifiers is a homonym.

    A tie is not resolved by taking the smaller identifier. Two release rows of
    equal standing under one name are two different organisms as far as this
    job can tell, and guessing between them would put a wrong `sameAs` on a
    card that a reader has no way to question.
    """
    held = matches.get(node_id)
    if held is None:
        matches[node_id] = candidate
        return
    if candidate.row.identifier == held.row.identifier:
        return
    if candidate.score > held.score:
        matches[node_id] = candidate
        return
    if candidate.score == held.score:
        held.ambiguous = True


def _payload_digest(
    source: SourceDefinition, matches: Mapping[str, Match]
) -> str:
    """What this run of this release actually projected, as one digest.

    The snapshot's `payload_sha256` is the release digest for the whole file
    everywhere else; here the snapshot holds a scoped projection, so it says so:
    the release digest and the rows that reached a node, together.
    """
    digest = hashlib.sha256()
    digest.update(str(source.release["sha256"]).encode("utf8"))
    for node_id, match in sorted(matches.items()):
        digest.update(node_id.encode("utf8"))
        digest.update(
            json.dumps(
                match.row.projection(), sort_keys=True, ensure_ascii=False
            ).encode("utf8")
        )
    return digest.hexdigest()


def _insert_snapshot(conn: Any, source: SourceDefinition, digest: str) -> str:
    row = conn.execute(
        INSERT_SNAPSHOT_SQL,
        (
            source.slug,
            source.name,
            source.category,
            str(source.release["version"]),
            str(source.release["url"]),
            source.license,
            source.license_url,
            source.attribution_required,
            source.attribution,
            '["raw_snapshot", "canonical_product_projection"]',
            PARSER_VERSION,
            digest,
        ),
    ).fetchone()
    return str(_field(row, "id"))


def _project(
    conn: Any,
    source: SourceDefinition,
    node: Mapping[str, Any],
    match: Match,
    snapshot_id: str,
    receipt: CrosswalkReceipt,
) -> None:
    projection = match.row.projection()
    encoded = json.dumps(projection, sort_keys=True, ensure_ascii=False)
    record_id = str(
        _field(
            conn.execute(
                INSERT_RECORD_SQL,
                (
                    snapshot_id,
                    match.row.identifier,
                    encoded,
                    hashlib.sha256(encoded.encode("utf8")).hexdigest(),
                    encoded,
                ),
            ).fetchone(),
            "id",
        )
    )
    receipt.records_written += 1
    assertion_id = str(
        _field(
            conn.execute(
                INSERT_ASSERTION_SQL,
                (source.slug, snapshot_id, record_id, [source.reason_code, f"rung_{match.rung}"]),
            ).fetchone(),
            "id",
        )
    )
    _write_identifier(conn, source, node, match, assertion_id, receipt)


def _write_identifier(
    conn: Any,
    source: SourceDefinition,
    node: Mapping[str, Any],
    match: Match,
    assertion_id: str,
    receipt: CrosswalkReceipt,
) -> None:
    value = match.row.identifier
    owner = _field(
        conn.execute(IDENTIFIER_OWNER_SQL, (source.scheme, value)).fetchone(), "id"
    )
    if owner is not None and str(owner) == str(node["id"]):
        receipt.identifiers_corroborated += 1
        return
    held = node.get("current_value")
    if owner is not None or (held and str(held) != value):
        # Either another node already answers to this identifier, or this node
        # already answers to a different one. Both are decisions, never an
        # overwrite: the graph's uniqueness is the whole reason rung one works.
        queued = conn.execute(
            QUEUE_SOURCE_LINK_SQL,
            (
                node["id"],
                json.dumps(
                    {
                        "source_slug": source.slug,
                        "scheme": source.scheme,
                        "value": value,
                        "held_by_catalog_item_id": str(owner) if owner else None,
                        "node_holds": str(held) if held else None,
                    }
                ),
                [f"{source.scheme}_identifier_conflict"],
                node["id"],
            ),
        ).fetchone()
        if queued is not None:
            receipt.identifier_conflicts += 1
        return
    written = conn.execute(
        INSERT_IDENTIFIER_SQL, (node["id"], source.scheme, value, assertion_id)
    ).fetchone()
    if written is not None:
        receipt.identifiers_written += 1


def _field(row: Any, key: str) -> Any:
    if isinstance(row, Mapping):
        return row.get(key)
    return getattr(row, key)
