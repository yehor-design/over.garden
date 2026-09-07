"""The WFO and GBIF crosswalks, executed (OVE-396, ADR-0026 D2, D13).

An identifier is only worth something if it is the right one and it is unique.
Both properties live in rows, not in types: an identifier silently moved off
another node breaks the ladder's first rung, and a homonym resolved by guessing
puts a wrong `sameAs` on a card nobody can question. So these tests run the
real projection against a disposable database built from every migration, with
the release replaced by fixture rows shaped exactly as the two files are.

The release readers and the matching rules that need no database live beside
this file, in `test_wfo_gbif_crosswalk.py`.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg
import pytest
from psycopg.rows import dict_row

from app import wfo_gbif_crosswalk as crosswalk

DATABASE_URL = os.environ.get("OVERGARDEN_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="OVERGARDEN_TEST_DATABASE_URL names no disposable Postgres",
)

SQL_DIRECTORY = Path(__file__).resolve().parents[3] / "apps" / "web" / "sql"
BETTER_AUTH_SCHEMA = (
    (Path(__file__).resolve().parent / "test_runtime_database.py")
    .read_text(encoding="utf-8")
    .split('BETTER_AUTH_SCHEMA = """')[1]
    .split('"""')[0]
)


def database_url(name: str) -> str:
    assert DATABASE_URL
    parts = urlsplit(DATABASE_URL)
    return urlunsplit(parts._replace(path=f"/{name}"))


@pytest.fixture
def conn():
    name = f"overgarden_wfogbif_{uuid.uuid4().hex}"
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


def seed_node(
    conn: psycopg.Connection,
    name: str,
    *,
    kingdom: str | None = "Plantae",
    rank: str = "species",
    identifier: tuple[str, str] | None = None,
) -> str:
    item_id = str(uuid.uuid4())
    conn.execute(
        """
        insert into catalog_items (
          id, canonical_name, catalog_kind, normalized_name, public_slug, status,
          source, source_id, locale, node_kind, kingdom, rank, identity_state
        )
        values (%s, %s, 'species', catalog_normalize_name(%s), %s, 'seeded',
                'species_backbone', %s, 'la', 'taxon', %s, %s, 'active')
        """,
        (
            item_id,
            name,
            name,
            f"ove396-{item_id[:8]}",
            f"ove396:{item_id}",
            kingdom,
            rank,
        ),
    )
    conn.execute(
        """
        insert into catalog_item_names (
          catalog_item_id, display_name, normalized_name, locale, script,
          is_primary, name_type
        )
        values (%s::uuid, %s, catalog_normalize_name(%s), 'la', 'latin', true,
                'scientific_accepted')
        """,
        (item_id, name, name),
    )
    if identifier is not None:
        scheme, value = identifier
        snapshot = conn.execute(
            """
            insert into catalog_source_snapshots (
              source_slug, source_name, source_category, source_version, source_url,
              license, parser_version, payload_sha256, fetched_at, verified_at, status
            )
            values ('wikidata', 'Wikidata', 'crosswalk', %s, 'https://example.test/',
                    'CC0 1.0', 'test', %s, now(), now(), 'imported')
            on conflict (source_slug, source_version, payload_sha256)
              do update set verified_at = now()
            returning id::text as id
            """,
            (f"fixture-{value}", "0" * 64),
        ).fetchone()["id"]
        assertion = conn.execute(
            """
            insert into catalog_source_assertions (source_slug, source_snapshot_id)
            values ('wikidata', %s::uuid)
            returning id::text as id
            """,
            (snapshot,),
        ).fetchone()["id"]
        conn.execute(
            """
            insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id)
            values (%s::uuid, %s, %s, %s::uuid)
            """,
            (item_id, scheme, value, assertion),
        )
    return item_id


def wfo_row(
    identifier: str,
    name: str,
    *,
    status: str = "accepted",
    rank: str = "species",
    authorship: str | None = "L.",
) -> crosswalk.ReleaseRow:
    return crosswalk.ReleaseRow(
        identifier=identifier,
        scientific_name=name,
        authorship=authorship,
        status=status,
        rank=rank,
        kingdom="Plantae",
    )


def gbif_row(
    identifier: str,
    name: str,
    *,
    status: str = "accepted",
    rank: str = "species",
    kingdom: str | None = "Plantae",
) -> crosswalk.ReleaseRow:
    return crosswalk.ReleaseRow(
        identifier=identifier,
        scientific_name=name,
        authorship="L.",
        status=status,
        rank=rank,
        kingdom=kingdom,
    )


def identifier_of(conn: psycopg.Connection, item_id: str, scheme: str) -> str | None:
    row = conn.execute(
        "select value from catalog_item_identifiers where catalog_item_id = %s::uuid and scheme = %s",
        (item_id, scheme),
    ).fetchone()
    return row["value"] if row else None


def open_queue_items(conn: psycopg.Connection, item_id: str) -> list[dict]:
    return conn.execute(
        """
        select item_type, proposal, reasons from catalog_curation_queue
        where subject_catalog_item_id = %s::uuid and state = 'open'
        """,
        (item_id,),
    ).fetchall()


def test_a_plant_name_gets_its_wfo_identifier_and_a_snapshot_that_says_which_release(conn):
    tomato = seed_node(conn, "Solanum lycopersicum")

    receipt = crosswalk.crosswalk_world_flora_online(
        conn, rows=[wfo_row("wfo-0001029216", "Solanum lycopersicum")]
    )

    assert identifier_of(conn, tomato, "wfo") == "wfo-0001029216"
    assert receipt.matched_by_name == 1
    assert receipt.identifiers_written == 1
    snapshot = conn.execute(
        """
        select source_slug, source_version, license, attribution_required, attribution_text
        from catalog_source_snapshots where id = %s::uuid
        """,
        (receipt.snapshot_id,),
    ).fetchone()
    assert snapshot["source_slug"] == "world-flora-online"
    assert snapshot["source_version"] == "2026-06"
    assert snapshot["license"] == "CC0 1.0"
    # CC0 asks for nothing, and the snapshot must say so rather than claim a
    # requirement the licence does not impose.
    assert snapshot["attribution_required"] is False
    assert "10.5281/zenodo.20782718" in snapshot["attribution_text"]

    # Only what reached a node is stored. A checklist of 1.66 million names in
    # a 10 GiB database is the thing this design exists to avoid.
    records = conn.execute(
        "select count(*)::int as n from catalog_source_records where source_snapshot_id = %s::uuid",
        (receipt.snapshot_id,),
    ).fetchone()["n"]
    assert records == 1


def test_the_release_only_corroborates_an_identifier_the_node_already_carries(conn):
    tomato = seed_node(
        conn, "Solanum lycopersicum", identifier=("wfo", "wfo-0001029216")
    )

    receipt = crosswalk.crosswalk_world_flora_online(
        conn, rows=[wfo_row("wfo-0001029216", "Solanum lycopersicum")]
    )

    assert receipt.matched_by_identifier == 1
    assert receipt.identifiers_corroborated == 1
    assert receipt.identifiers_written == 0
    assert receipt.identifier_conflicts == 0
    assert open_queue_items(conn, tomato) == []
    # One identifier, still, and still the Wikidata one.
    assert (
        conn.execute(
            "select count(*)::int as n from catalog_item_identifiers where catalog_item_id = %s::uuid and scheme = 'wfo'",
            (tomato,),
        ).fetchone()["n"]
        == 1
    )


def test_an_identifier_another_node_holds_becomes_a_decision_and_never_a_move(conn):
    # Two nodes answer to one scientific name — a duplicate the merge queue
    # exists for — and one of them already carries the WFO id from Wikidata.
    incumbent = seed_node(
        conn, "Solanum lycopersicum", identifier=("wfo", "wfo-0001029216")
    )
    duplicate = seed_node(conn, "Solanum lycopersicum")

    receipt = crosswalk.crosswalk_world_flora_online(
        conn, rows=[wfo_row("wfo-0001029216", "Solanum lycopersicum")]
    )

    assert identifier_of(conn, incumbent, "wfo") == "wfo-0001029216"
    assert identifier_of(conn, duplicate, "wfo") is None
    assert receipt.identifiers_corroborated == 1
    assert receipt.identifier_conflicts == 1
    queued = open_queue_items(conn, duplicate)
    assert len(queued) == 1
    assert queued[0]["item_type"] == "source_link"
    assert queued[0]["proposal"]["held_by_catalog_item_id"] == incumbent
    assert queued[0]["reasons"] == ["wfo_identifier_conflict"]
    # And the node that already had it keeps a clean queue.
    assert open_queue_items(conn, incumbent) == []


def test_one_release_row_two_nodes_of_one_name_gives_the_identifier_to_exactly_one(conn):
    left = seed_node(conn, "Beta vulgaris")
    right = seed_node(conn, "Beta vulgaris")

    receipt = crosswalk.crosswalk_world_flora_online(
        conn, rows=[wfo_row("wfo-0000564998", "Beta vulgaris")]
    )

    holders = [
        node
        for node in (left, right)
        if identifier_of(conn, node, "wfo") == "wfo-0000564998"
    ]
    assert len(holders) == 1
    other = right if holders[0] == left else left
    assert receipt.identifiers_written == 1
    assert receipt.identifier_conflicts == 1
    assert len(open_queue_items(conn, other)) == 1


def test_two_release_rows_of_equal_standing_under_one_name_are_a_homonym_not_a_match(conn):
    ambiguous = seed_node(conn, "Ficus indica")

    receipt = crosswalk.crosswalk_world_flora_online(
        conn,
        rows=[
            wfo_row("wfo-1000000001", "Ficus indica"),
            wfo_row("wfo-1000000002", "Ficus indica"),
        ],
    )

    assert identifier_of(conn, ambiguous, "wfo") is None
    assert receipt.ambiguous_names == 1
    assert receipt.identifiers_written == 0
    # Nothing to decide: a curator cannot pick between two names they cannot
    # see, and the node keeps working without an identifier (D5).
    assert open_queue_items(conn, ambiguous) == []


def test_an_accepted_row_outranks_a_synonym_under_the_same_name(conn):
    node = seed_node(conn, "Beta vulgaris")

    crosswalk.crosswalk_world_flora_online(
        conn,
        rows=[
            wfo_row("wfo-2000000001", "Beta vulgaris", status="synonym"),
            wfo_row("wfo-2000000002", "Beta vulgaris", status="accepted"),
        ],
    )

    assert identifier_of(conn, node, "wfo") == "wfo-2000000002"


def test_a_flora_never_answers_for_an_animal(conn):
    bee = seed_node(conn, "Apis mellifera", kingdom="Animalia")

    receipt = crosswalk.crosswalk_world_flora_online(
        conn, rows=[wfo_row("wfo-3000000001", "Apis mellifera")]
    )

    assert identifier_of(conn, bee, "wfo") is None
    assert receipt.nodes_considered == 0


def test_gbif_uses_the_kingdom_to_tell_two_organisms_of_one_name_apart(conn):
    orchid = seed_node(conn, "Aa", kingdom="Plantae", rank="genus")
    virus = seed_node(conn, "Aa", kingdom="Viruses", rank="genus")

    crosswalk.crosswalk_gbif_backbone(
        conn,
        rows=[
            gbif_row("3244181", "Aa", rank="genus", kingdom="Plantae"),
            gbif_row("9995154", "Aa", rank="genus", kingdom="Viruses"),
        ],
    )

    assert identifier_of(conn, orchid, "gbif") == "3244181"
    assert identifier_of(conn, virus, "gbif") == "9995154"


def test_gbif_matches_an_animal_because_the_backbone_is_every_kingdom(conn):
    bee = seed_node(conn, "Apis mellifera", kingdom="Animalia")

    crosswalk.crosswalk_gbif_backbone(
        conn, rows=[gbif_row("1341976", "Apis mellifera", kingdom="Animalia")]
    )

    assert identifier_of(conn, bee, "gbif") == "1341976"


def test_a_second_run_writes_nothing_new(conn):
    seed_node(conn, "Solanum lycopersicum")
    rows = [wfo_row("wfo-0001029216", "Solanum lycopersicum")]

    first = crosswalk.crosswalk_world_flora_online(conn, rows=rows)
    second = crosswalk.crosswalk_world_flora_online(conn, rows=rows)

    assert first.identifiers_written == 1
    assert second.identifiers_written == 0
    assert second.identifiers_corroborated == 1
    assert second.identifier_conflicts == 0


def test_a_matched_node_is_queued_for_its_card_to_be_rebuilt(conn):
    tomato = seed_node(conn, "Solanum lycopersicum")

    crosswalk.crosswalk_world_flora_online(
        conn, rows=[wfo_row("wfo-0001029216", "Solanum lycopersicum")]
    )

    # Without this the card keeps the `sameAs` set it had, for as long as the
    # cache lives. `catalog_record_card_intents` writes the outbox row the
    # worker drains, keyed by entity kind and id.
    intent = conn.execute(
        """
        select desired_state, desired_reason, status
        from public_projection_intents
        where entity_kind = 'catalog_item' and entity_id = %s::uuid
        """,
        (tomato,),
    ).fetchone()
    assert intent is not None
    assert intent["desired_state"] == "present"
    assert intent["desired_reason"] == "catalog_card"
