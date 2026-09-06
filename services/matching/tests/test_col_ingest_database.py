"""The Catalogue of Life ingest, executed (OVE-392, ADR-0026 D2).

A ColDP archive is a zip of tab-separated files with 73 columns and a
vocabulary of its own; nothing about "it parses" can be trusted until the rows
are in Postgres under the real constraints. These tests build a disposable
database from every migration, write a ColDP fixture archive to disk, and run
the handler against both.

The fixture is 10 000 usages: enough that the COPY path, the generated
`normalized_name` and the vernacular de-duplication are exercised, small
enough to run in a second.
"""

from __future__ import annotations

import hashlib
import os
import uuid
import zipfile
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg
import pytest
from psycopg.rows import dict_row

from app import col_ingest

DATABASE_URL = os.environ.get("OVERGARDEN_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="OVERGARDEN_TEST_DATABASE_URL names no disposable Postgres",
)

SQL_DIRECTORY = Path(__file__).resolve().parents[3] / "apps" / "web" / "sql"
BETTER_AUTH_SCHEMA = (
    Path(__file__).resolve().parent / "test_runtime_database.py"
).read_text(encoding="utf-8").split('BETTER_AUTH_SCHEMA = """')[1].split('"""')[0]

USAGE_HEADER = [
    "col:ID",
    "col:parentID",
    "col:status",
    "col:scientificName",
    "col:authorship",
    "col:rank",
    "col:kingdom",
]
VERNACULAR_HEADER = ["col:taxonID", "col:name", "col:language"]


def database_url(name: str) -> str:
    assert DATABASE_URL
    parts = urlsplit(DATABASE_URL)
    return urlunsplit(parts._replace(path=f"/{name}"))


@pytest.fixture
def conn():
    name = f"overgarden_col_{uuid.uuid4().hex}"
    admin_url = database_url("postgres")
    url = database_url(name)
    with psycopg.connect(admin_url, autocommit=True) as admin:
        admin.execute(f'create database "{name}"')
    try:
        with psycopg.connect(url, autocommit=True) as setup:
            setup.execute(BETTER_AUTH_SCHEMA)
            for migration in sorted(SQL_DIRECTORY.glob("[0-9][0-9][0-9][0-9]_*.sql")):
                setup.execute(migration.read_text(encoding="utf-8"))
        with psycopg.connect(url, autocommit=True, row_factory=dict_row) as connection:
            yield connection
    finally:
        with psycopg.connect(admin_url, autocommit=True) as admin:
            admin.execute(f'drop database "{name}" with (force)')


def write_archive(
    directory: Path,
    *,
    name: str,
    usages: list[list[str]],
    vernaculars: list[list[str]],
) -> tuple[Path, str]:
    """Writes a ColDP archive and returns its path and sha256."""
    path = directory / name
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "NameUsage.tsv",
            "\n".join(
                ["\t".join(USAGE_HEADER)] + ["\t".join(row) for row in usages]
            )
            + "\n",
        )
        archive.writestr(
            "VernacularName.tsv",
            "\n".join(
                ["\t".join(VERNACULAR_HEADER)] + ["\t".join(row) for row in vernaculars]
            )
            + "\n",
        )
        archive.writestr("metadata.yaml", "title: Catalogue of Life fixture\n")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return path, digest


def fixture_rows(count: int = 10_000) -> tuple[list[list[str]], list[list[str]]]:
    """The tomato and its ancestors, then filler that exercises the vocabulary."""
    usages = [
        ["P", "", "accepted", "Plantae", "", "kingdom", "Plantae"],
        ["TRACH", "P", "accepted", "Tracheophyta", "", "phylum", "Plantae"],
        ["MAGNO", "TRACH", "accepted", "Magnoliopsida", "", "class", "Plantae"],
        ["SOLAN", "MAGNO", "accepted", "Solanales", "", "order", "Plantae"],
        ["SOLFA", "SOLAN", "accepted", "Solanaceae", "", "family", "Plantae"],
        ["SOLGE", "SOLFA", "accepted", "Solanum", "L.", "genus", "Plantae"],
        [
            "TOMAT",
            "SOLGE",
            "accepted",
            "Solanum lycopersicum",
            "L.",
            "species",
            "Plantae",
        ],
        [
            # A synonym as Catalogue of Life writes one: no classification of
            # its own, only the accepted usage it hangs under.
            "LYCES",
            "TOMAT",
            "synonym",
            "Lycopersicon esculentum",
            "Mill.",
            "species",
            "",
        ],
        ["A", "", "accepted", "Animalia", "", "kingdom", "Animalia"],
        ["RODEN", "A", "accepted", "Rodentia", "", "order", "Animalia"],
        ["CAVII", "RODEN", "accepted", "Caviidae", "", "family", "Animalia"],
        ["HYDRO", "CAVII", "accepted", "Hydrochoerus", "Brisson, 1762", "genus", "Animalia"],
        [
            "CAPYB",
            "HYDRO",
            "accepted",
            "Hydrochoerus hydrochaeris",
            "(Linnaeus, 1766)",
            "species",
            "Animalia",
        ],
        [
            "PROVI",
            "SOLGE",
            "provisionally accepted",
            "Solanum provisorium",
            "Anon.",
            "species",
            "Plantae",
        ],
        [
            "AMBIG",
            "SOLGE",
            "ambiguous synonym",
            "Solanum ambiguum",
            "Anon.",
            "species",
            "Plantae",
        ],
    ]
    for index in range(count - len(usages)):
        usages.append(
            [
                f"F{index:06d}",
                "SOLGE",
                "accepted",
                f"Solanum fictum{index}",
                "Anon.",
                "species",
                "Plantae",
            ]
        )
    vernaculars = [
        ["TOMAT", "помідор", "ukr"],
        ["TOMAT", "Помідор", "ukr"],  # the same name, different case: one row
        ["TOMAT", "домат", "bul"],
        ["CAPYB", "капібара", "ukr"],
        ["MISSING", "", "ukr"],  # no name: skipped
    ]
    return usages, vernaculars


def release(digest: str, version: str = "COL-FIXTURE-1") -> dict[str, str]:
    return {
        "version": version,
        "dataset_key": "fixture",
        "doi": "10.0000/fixture",
        "url": "https://example.test/coldp.zip",
        "sha256": digest,
    }


def test_ingest_writes_the_release_verbatim_under_one_snapshot(conn, tmp_path):
    usages, vernaculars = fixture_rows()
    path, digest = write_archive(
        tmp_path, name="coldp.zip", usages=usages, vernaculars=vernaculars
    )

    receipt = col_ingest.ingest_catalogue_of_life(
        conn, release=release(digest), archive_path=path
    )

    assert receipt.usages == 10_000
    assert receipt.skipped_usages == 0
    # Three names survive: the case duplicate and the empty one do not.
    assert receipt.vernaculars == 3
    assert receipt.reused_archive is True
    assert receipt.already_imported is False

    snapshot = conn.execute(
        """
        select source_slug, source_version, license, attribution_text, status,
               payload_sha256, allowed_usage
        from catalog_source_snapshots where id = %s::uuid
        """,
        (receipt.snapshot_id,),
    ).fetchone()
    assert snapshot["source_slug"] == "catalogue-of-life-checklistbank"
    assert "COL-FIXTURE-1" in snapshot["source_version"]
    assert "doi 10.0000/fixture" in snapshot["source_version"]
    assert snapshot["license"] == "CC BY 4.0"
    assert snapshot["attribution_text"].startswith("Catalogue of Life")
    assert snapshot["payload_sha256"] == digest
    assert snapshot["status"] == "imported"

    tomato = conn.execute(
        """
        select col_id, parent_col_id, rank, status, scientific_name, authorship,
               canonical_name, kingdom, normalized_name
        from catalog_source_col_usages
        where source_snapshot_id = %s::uuid and col_id = 'TOMAT'
        """,
        (receipt.snapshot_id,),
    ).fetchone()
    assert tomato["parent_col_id"] == "SOLGE"
    assert tomato["rank"] == "species"
    assert tomato["status"] == "accepted"
    # The authorship travels beside the name, and the canonical name is bare.
    assert tomato["scientific_name"] == "Solanum lycopersicum L."
    assert tomato["authorship"] == "L."
    assert tomato["canonical_name"] == "Solanum lycopersicum"
    # The generated column is the same normalizer the picker and ladder use.
    assert tomato["normalized_name"] == "solanum lycopersicum"

    # ColDP writes the two-word statuses with a space; the column holds them
    # with an underscore, and nothing is coerced into "accepted".
    statuses = {
        row["status"]: row["count"]
        for row in conn.execute(
            """
            select status, count(*)::int as count
            from catalog_source_col_usages
            where source_snapshot_id = %s::uuid group by 1
            """,
            (receipt.snapshot_id,),
        ).fetchall()
    }
    assert statuses["provisionally_accepted"] == 1
    assert statuses["ambiguous_synonym"] == 1
    assert statuses["synonym"] == 1


def test_a_second_run_of_the_same_release_writes_nothing_new(conn, tmp_path):
    usages, vernaculars = fixture_rows(count=100)
    path, digest = write_archive(
        tmp_path, name="coldp.zip", usages=usages, vernaculars=vernaculars
    )

    first = col_ingest.ingest_catalogue_of_life(
        conn, release=release(digest), archive_path=path
    )
    second = col_ingest.ingest_catalogue_of_life(
        conn, release=release(digest), archive_path=path
    )

    assert second.already_imported is True
    assert second.snapshot_id == first.snapshot_id
    assert second.usages == 100
    total = conn.execute(
        "select count(*)::int as count from catalog_source_col_usages"
    ).fetchone()["count"]
    assert total == 100


def test_only_the_two_newest_snapshots_survive(conn, tmp_path):
    usages, vernaculars = fixture_rows(count=50)
    snapshots: list[str] = []
    for index in range(3):
        changed = [row[:] for row in usages]
        changed[6][3] = f"Solanum lycopersicum {index}"
        path, digest = write_archive(
            tmp_path,
            name=f"coldp-{index}.zip",
            usages=changed,
            vernaculars=vernaculars,
        )
        receipt = col_ingest.ingest_catalogue_of_life(
            conn,
            release=release(digest, version=f"COL-FIXTURE-{index}"),
            archive_path=path,
        )
        snapshots.append(receipt.snapshot_id)

    remaining = [
        row["id"]
        for row in conn.execute(
            """
            select id::text as id from catalog_source_snapshots
            where source_slug = 'catalogue-of-life-checklistbank'
            order by fetched_at desc, id
            """
        ).fetchall()
    ]
    assert len(remaining) == 2
    assert snapshots[0] not in remaining
    # The usages went with their snapshot through the cascade.
    orphans = conn.execute(
        """
        select count(*)::int as count from catalog_source_col_usages
        where source_snapshot_id = %s::uuid
        """,
        (snapshots[0],),
    ).fetchone()["count"]
    assert orphans == 0
    assert (
        conn.execute("select catalog_col_current_snapshot()::text as id")
        .fetchone()["id"]
        == snapshots[2]
    )


def test_a_snapshot_another_table_points_at_is_never_pruned(conn, tmp_path):
    usages, vernaculars = fixture_rows(count=20)
    kept: list[str] = []
    for index in range(3):
        changed = [row[:] for row in usages]
        # A release is identified by its checksum, so each one must differ.
        changed[6][3] = f"Solanum lycopersicum {index}"
        path, digest = write_archive(
            tmp_path,
            name=f"coldp-{index}.zip",
            usages=changed,
            vernaculars=vernaculars,
        )
        receipt = col_ingest.ingest_catalogue_of_life(
            conn,
            release=release(digest, version=f"COL-KEEP-{index}"),
            archive_path=path,
        )
        kept.append(receipt.snapshot_id)
        if index == 0:
            # An assertion points at the oldest: it is evidence now.
            conn.execute(
                """
                insert into catalog_source_assertions (source_slug, source_snapshot_id)
                values ('catalogue-of-life-checklistbank', %s::uuid)
                """,
                (receipt.snapshot_id,),
            )

    remaining = {
        row["id"]
        for row in conn.execute(
            """
            select id::text as id from catalog_source_snapshots
            where source_slug = 'catalogue-of-life-checklistbank'
            """
        ).fetchall()
    }
    assert kept[0] in remaining
    assert len(remaining) == 3


def test_an_unknown_status_stops_the_ingest(conn, tmp_path):
    usages, vernaculars = fixture_rows(count=20)
    usages[0][2] = "invented status"
    path, digest = write_archive(
        tmp_path, name="coldp.zip", usages=usages, vernaculars=vernaculars
    )

    with pytest.raises(col_ingest.ColIngestError, match="unknown ColDP status"):
        col_ingest.ingest_catalogue_of_life(
            conn, release=release(digest), archive_path=path
        )


def test_a_wrong_checksum_is_refused_before_a_row_is_written(conn, tmp_path):
    usages, vernaculars = fixture_rows(count=20)
    path, _ = write_archive(
        tmp_path, name="coldp.zip", usages=usages, vernaculars=vernaculars
    )

    with pytest.raises(col_ingest.ColIngestError, match="checksum mismatch"):
        col_ingest.ingest_catalogue_of_life(
            conn, release=release("0" * 64), archive_path=path
        )
    assert (
        conn.execute(
            "select count(*)::int as count from catalog_source_col_usages"
        ).fetchone()["count"]
        == 0
    )


def test_a_scoped_run_keeps_one_kingdom_and_the_synonyms_under_it(conn, tmp_path):
    """Production runs scoped: a 10 GiB managed database cannot hold the whole
    release, and the readiness manifest says to scope to the plant catalog
    first. A synonym carries no kingdom of its own, so the scope must follow
    the accepted usage it hangs under."""
    usages, vernaculars = fixture_rows(count=40)
    path, digest = write_archive(
        tmp_path, name="coldp.zip", usages=usages, vernaculars=vernaculars
    )

    receipt = col_ingest.ingest_catalogue_of_life(
        conn,
        release=release(digest),
        archive_path=path,
        kingdoms=("Plantae",),
    )

    kingdoms = {
        row["kingdom"]
        for row in conn.execute(
            """
            select distinct kingdom from catalog_source_col_usages
            where source_snapshot_id = %s::uuid
            """,
            (receipt.snapshot_id,),
        ).fetchall()
    }
    assert kingdoms == {"Plantae", None}

    # The tomato's synonym has no kingdom on its own row and is kept.
    kept = {
        row["col_id"]
        for row in conn.execute(
            """
            select col_id from catalog_source_col_usages
            where source_snapshot_id = %s::uuid and col_id in ('LYCES', 'CAPYB', 'TOMAT')
            """,
            (receipt.snapshot_id,),
        ).fetchall()
    }
    assert kept == {"TOMAT", "LYCES"}

    # The scope is written into the snapshot, so a row can always say what it holds.
    version = conn.execute(
        "select source_version from catalog_source_snapshots where id = %s::uuid",
        (receipt.snapshot_id,),
    ).fetchone()["source_version"]
    assert "kingdoms Plantae" in version
    assert receipt.kingdoms == ("Plantae",)

    # A vernacular of a usage outside the scope is not carried either.
    capybara = conn.execute(
        """
        select count(*)::int as count from catalog_source_col_vernaculars
        where source_snapshot_id = %s::uuid and col_id = 'CAPYB'
        """,
        (receipt.snapshot_id,),
    ).fetchone()["count"]
    assert capybara == 0


def seed_gardener_object(conn, catalog_item_id: str) -> str:
    """One gardener object on a node, so a merge becomes a decision."""
    user_id = str(uuid.uuid4())
    space_id = str(uuid.uuid4())
    object_id = str(uuid.uuid4())
    conn.execute(
        'insert into "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")'
        " values (%s::uuid, %s, true, 'OverGarden', now(), now())",
        (user_id, f"col-{user_id}@example.test"),
    )
    conn.execute(
        "insert into spaces (id, owner_user_id, display_name) values (%s::uuid, %s::uuid, 'col')",
        (space_id, user_id),
    )
    conn.execute(
        """
        insert into plant_objects (
          id, owner_user_id, space_id, display_name, object_kind, catalog_item_id, variety_state
        )
        values (%s::uuid, %s::uuid, %s::uuid, 'tomato', 'plant', %s::uuid, 'selected')
        """,
        (object_id, user_id, space_id, catalog_item_id),
    )
    return object_id


def test_the_refresh_applies_the_change_classes_it_promises(conn, tmp_path):
    """ADR-0026 D4: a rename is automatic, an accepted name that became a
    synonym merges itself only when no gardener depends on it, and a usage
    that left the release supersedes its assertions without deleting a node."""
    usages, vernaculars = fixture_rows(count=30)
    first, first_digest = write_archive(
        tmp_path, name="coldp-1.zip", usages=usages, vernaculars=vernaculars
    )
    col_ingest.ingest_catalogue_of_life(
        conn, release=release(first_digest, version="COL-DIFF-1"), archive_path=first
    )

    # Two nodes from the checklist: one gardeners use, one nobody does.
    tomato = conn.execute("select catalog_col_materialize('TOMAT')::text as id").fetchone()["id"]
    provisional = conn.execute(
        "select catalog_col_materialize('PROVI')::text as id"
    ).fetchone()["id"]
    capybara = conn.execute(
        "select catalog_col_materialize('CAPYB')::text as id"
    ).fetchone()["id"]
    seed_gardener_object(conn, tomato)

    changed = [row[:] for row in usages]
    for row in changed:
        if row[0] == "CAPYB":
            # A rename: the same usage under a new canonical name.
            row[3] = "Hydrochoerus hydrochaeris capybara"
        if row[0] == "PROVI":
            # An accepted name that became a synonym of the tomato.
            row[2] = "synonym"
            row[1] = "TOMAT"
        if row[0] == "AMBIG":
            row[0] = "AMBIG2"  # the old usage disappears from the release
    second, second_digest = write_archive(
        tmp_path, name="coldp-2.zip", usages=changed, vernaculars=vernaculars
    )
    receipt = col_ingest.ingest_catalogue_of_life(
        conn, release=release(second_digest, version="COL-DIFF-2"), archive_path=second
    )

    assert receipt.refresh["status"] == "diffed"
    assert receipt.refresh["renamed"] == 1
    # Nobody gardens the provisional node, so the checklist decides on its own.
    assert receipt.refresh["merged"] == 1
    assert receipt.refresh["queued"] == 0

    renamed = conn.execute(
        "select canonical_name from catalog_items where id = %s::uuid", (capybara,)
    ).fetchone()["canonical_name"]
    assert renamed == "Hydrochoerus hydrochaeris capybara"
    # The old spelling stays reachable as a name on the same node.
    names = {
        row["display_name"]
        for row in conn.execute(
            "select display_name from catalog_item_names where catalog_item_id = %s::uuid",
            (capybara,),
        ).fetchall()
    }
    assert "Hydrochoerus hydrochaeris" in names

    merged = conn.execute(
        """
        select identity_state, merged_into_catalog_item_id::text as survivor
        from catalog_items where id = %s::uuid
        """,
        (provisional,),
    ).fetchone()
    assert merged["identity_state"] == "merged"
    assert merged["survivor"] == tomato

    # No node was deleted by any of it.
    assert (
        conn.execute(
            "select count(*)::int as count from catalog_items where id = %s::uuid",
            (provisional,),
        ).fetchone()["count"]
        == 1
    )

    event = conn.execute(
        """
        select summary from catalog_source_refresh_events
        where source_slug = 'catalogue-of-life-checklistbank'
        order by created_at desc limit 1
        """
    ).fetchone()
    assert event["summary"]["renamed"] == 1


def test_a_node_a_gardener_uses_becomes_a_decision_not_a_merge(conn, tmp_path):
    usages, vernaculars = fixture_rows(count=30)
    first, first_digest = write_archive(
        tmp_path, name="coldp-1.zip", usages=usages, vernaculars=vernaculars
    )
    col_ingest.ingest_catalogue_of_life(
        conn, release=release(first_digest, version="COL-DECIDE-1"), archive_path=first
    )
    provisional = conn.execute(
        "select catalog_col_materialize('PROVI')::text as id"
    ).fetchone()["id"]
    conn.execute("select catalog_col_materialize('TOMAT')")
    seed_gardener_object(conn, provisional)

    changed = [row[:] for row in usages]
    for row in changed:
        if row[0] == "PROVI":
            row[2] = "synonym"
            row[1] = "TOMAT"
    second, second_digest = write_archive(
        tmp_path, name="coldp-2.zip", usages=changed, vernaculars=vernaculars
    )
    receipt = col_ingest.ingest_catalogue_of_life(
        conn, release=release(second_digest, version="COL-DECIDE-2"), archive_path=second
    )

    assert receipt.refresh["merged"] == 0
    assert receipt.refresh["queued"] == 1
    item = conn.execute(
        """
        select item_type, state, reasons, impact_score
        from catalog_curation_queue
        where subject_catalog_item_id = %s::uuid
        """,
        (provisional,),
    ).fetchone()
    assert item["item_type"] == "node_merge"
    assert item["state"] == "open"
    assert "col_accepted_became_synonym" in item["reasons"]
    # The gardener's node is untouched until the owner decides.
    assert (
        conn.execute(
            "select identity_state from catalog_items where id = %s::uuid",
            (provisional,),
        ).fetchone()["identity_state"]
        == "active"
    )


def test_a_scoped_snapshot_stops_the_chain_where_the_scope_does(conn, tmp_path):
    """Production keeps the plant kingdoms, and their chain runs up into rows
    above kingdom that carry no kingdom of their own. Those rows are outside
    the scope; a node whose parent is missing is a root of what this snapshot
    holds, not a failed run."""
    usages, vernaculars = fixture_rows(count=40)
    # A row above kingdom, exactly as Catalogue of Life writes one: no kingdom.
    usages.insert(0, ["BIOTA", "", "accepted", "Biota", "", "unranked", ""])
    for row in usages:
        if row[0] == "P":
            row[1] = "BIOTA"
    path, digest = write_archive(
        tmp_path, name="coldp.zip", usages=usages, vernaculars=vernaculars
    )

    receipt = col_ingest.ingest_catalogue_of_life(
        conn,
        release=release(digest),
        archive_path=path,
        kingdoms=("Plantae",),
    )
    assert receipt.usages > 0
    assert (
        conn.execute(
            """
            select count(*)::int as count from catalog_source_col_usages
            where source_snapshot_id = %s::uuid and col_id = 'BIOTA'
            """,
            (receipt.snapshot_id,),
        ).fetchone()["count"]
        == 0
    )

    node = conn.execute("select catalog_col_materialize('TOMAT')::text as id").fetchone()["id"]
    chain = [
        row["canonical_name"]
        for row in conn.execute(
            """
            select item.canonical_name
            from catalog_items as item
            join unnest((select ancestor_ids from catalog_items where id = %s::uuid))
              with ordinality as ancestor(id, position) on ancestor.id = item.id
            order by ancestor.position
            """,
            (node,),
        ).fetchall()
    ]
    # The chain starts at the kingdom this snapshot holds, and Biota is absent.
    # Catalogue of Life leaves `kingdom` blank on the kingdom's own row, so the
    # scope keeps it by name; without that the chain would start one rank below.
    assert chain[0] == "Plantae"
    assert "Biota" not in chain
