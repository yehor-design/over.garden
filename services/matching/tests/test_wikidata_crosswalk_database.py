"""The Wikidata crosswalk, executed (OVE-393, ADR-0026 D2, D4, D7).

Identifiers and vernaculars only mean something once they are rows: an
identifier that silently overwrote another node's would break the ladder's
first rung, and an alias accepted for two organisms would put one gardener's
word on the wrong card. These tests run the projection against a disposable
database built from every migration, with the upstream replaced by a fixture
so the rules — not the network — are what is under test.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg
import pytest
from psycopg.rows import dict_row

from app import wikidata_crosswalk as crosswalk

DATABASE_URL = os.environ.get("OVERGARDEN_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="OVERGARDEN_TEST_DATABASE_URL names no disposable Postgres",
)

SQL_DIRECTORY = Path(__file__).resolve().parents[3] / "apps" / "web" / "sql"
BETTER_AUTH_SCHEMA = (
    Path(__file__).resolve().parent / "test_runtime_database.py"
).read_text(encoding="utf-8").split('BETTER_AUTH_SCHEMA = """')[1].split('"""')[0]


def database_url(name: str) -> str:
    assert DATABASE_URL
    parts = urlsplit(DATABASE_URL)
    return urlunsplit(parts._replace(path=f"/{name}"))


@pytest.fixture
def conn():
    name = f"overgarden_wikidata_{uuid.uuid4().hex}"
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
    col_id: str | None = None,
    kingdom: str = "Plantae",
) -> str:
    item_id = str(uuid.uuid4())
    conn.execute(
        """
        insert into catalog_items (
          id, canonical_name, catalog_kind, normalized_name, public_slug, status,
          source, source_id, locale, node_kind, kingdom, rank, identity_state
        )
        values (%s, %s, 'species', catalog_normalize_name(%s), %s, 'seeded',
                'species_backbone', %s, 'la', 'taxon', %s, 'species', 'active')
        """,
        (item_id, name, name, f"ove393-{item_id[:8]}", f"ove393:{item_id}", kingdom),
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
    if col_id:
        snapshot = conn.execute(
            """
            insert into catalog_source_snapshots (
              source_slug, source_name, source_category, source_version, source_url,
              license, parser_version, payload_sha256, fetched_at, verified_at, status
            )
            values ('catalogue-of-life-checklistbank', 'Catalogue of Life', 'species_backbone',
                    %s, 'https://example.test/', 'CC BY 4.0', 'test', %s, now(), now(), 'imported')
            on conflict (source_slug, source_version, payload_sha256) do update set verified_at = now()
            returning id::text as id
            """,
            (f"fixture-{col_id}", "0" * 64),
        ).fetchone()["id"]
        assertion = conn.execute(
            """
            insert into catalog_source_assertions (source_slug, source_snapshot_id)
            values ('catalogue-of-life-checklistbank', %s::uuid)
            returning id::text as id
            """,
            (snapshot,),
        ).fetchone()["id"]
        conn.execute(
            """
            insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id)
            values (%s::uuid, 'col', %s, %s::uuid)
            """,
            (item_id, col_id, assertion),
        )
    return item_id


def tomato_item() -> crosswalk.WikidataItem:
    return crosswalk.WikidataItem(
        qid="Q23501",
        col_id="4Y369",
        gbif_id="2930137",
        wfo_id="wfo-0001029216",
        eppo_code="LYPES",
        taxon_name="Solanum lycopersicum",
        labels={"uk": "помідор", "bg": "домат", "ru": "томат", "en": "tomato"},
        aliases={
            "uk": ["томат (рослина)", "помідори"],
            "ru": ["помидор", "помидоры"],
            "en": ["garden tomato", "Solanum lycopersicum"],
            "de": ["Tomate"],
        },
    )


def test_the_crosswalk_writes_identifiers_and_local_names(conn):
    node = seed_node(conn, "Solanum lycopersicum L.", col_id="4Y369")

    receipt = crosswalk.crosswalk_wikidata(conn, items=[tomato_item()])

    assert receipt.items_matched == 1
    assert receipt.identifier_conflicts == 0
    identifiers = {
        row["scheme"]: row["value"]
        for row in conn.execute(
            "select scheme, value from catalog_item_identifiers where catalog_item_id = %s::uuid",
            (node,),
        ).fetchall()
    }
    assert identifiers == {
        "col": "4Y369",
        "wikidata": "Q23501",
        "gbif": "2930137",
        "wfo": "wfo-0001029216",
        "eppo": "LYPES",
    }

    names = {
        (row["locale"], row["display_name"])
        for row in conn.execute(
            """
            select locale, display_name from catalog_item_names
            where catalog_item_id = %s::uuid and name_type = 'vernacular'
            """,
            (node,),
        ).fetchall()
    }
    # The label and the alias in each language a gardener reads, with
    # Wikidata's parenthetical disambiguator dropped.
    assert ("uk", "помідор") in names
    assert ("uk", "томат") in names
    assert ("bg", "домат") in names
    assert ("ru", "томат") in names
    assert ("ru", "помидор") in names
    assert ("en", "tomato") in names
    # A language this product does not read is recorded, never projected.
    assert not any(locale == "de" for locale, _ in names)
    # An alias that restates the scientific name is not a gardener's word.
    assert not any(name == "Solanum lycopersicum" for _, name in names)

    projections = {
        (row["locale"], row["display_name"]): row
        for row in conn.execute(
            "select locale, display_name, status, decision_reason_code,"
            " projection_notes, source_slug, license"
            " from catalog_alias_projections where catalog_item_id = %s::uuid",
            (node,),
        ).fetchall()
    }
    # `reason_codes` on this table belongs to the alias generator's own closed
    # vocabulary, so a source-backed decision records itself in
    # `decision_reason_code` and keeps the whole trail in the notes.
    assert projections[("de", "Tomate")]["status"] == "review_needed"
    assert (
        projections[("de", "Tomate")]["decision_reason_code"]
        == "alias_language_outside_product"
    )
    assert (
        projections[("en", "Solanum lycopersicum")]["decision_reason_code"]
        == "alias_equals_scientific_name"
    )
    assert projections[("uk", "томат")]["decision_reason_code"] == "alias_source_backed"
    assert (
        "alias_disambiguator_stripped" in projections[("uk", "томат")]["projection_notes"]
    )
    # The name as Wikidata wrote it stays readable beside the decision.
    assert "томат (рослина)" in projections[("uk", "томат")]["projection_notes"]
    assert projections[("uk", "помідор")]["license"] == "CC0 1.0"

    # The card is stale the moment its names change, so the run asks the
    # outbox to re-render it.
    intent = conn.execute(
        """
        select desired_state, desired_reason from public_projection_intents
        where entity_kind = 'catalog_item' and entity_id = %s::uuid
        """,
        (node,),
    ).fetchone()
    assert intent["desired_state"] == "present"
    assert intent["desired_reason"] == "catalog_card"

    snapshot = conn.execute(
        "select source_slug, license, attribution_text from catalog_source_snapshots"
        " where source_slug = 'wikidata'"
    ).fetchone()
    assert snapshot["license"] == "CC0 1.0"
    assert snapshot["attribution_text"].startswith("Wikidata")
    record = conn.execute(
        "select source_record_id, allowed_projection from catalog_source_records"
        " where source_record_id = 'Q23501'"
    ).fetchone()
    assert record["allowed_projection"]["identifiers"]["eppo"] == "LYPES"


def test_an_identifier_another_node_holds_becomes_a_decision(conn):
    first = seed_node(conn, "Solanum lycopersicum L.", col_id="4Y369")
    # A name the seeded database does not already carry, so the match is the
    # one this test makes rather than one the fixtures left behind.
    second = seed_node(conn, "Solanum ove393 Mill.")
    crosswalk.crosswalk_wikidata(conn, items=[tomato_item()])

    # The same Wikidata item now claims the second node by its taxon name.
    claim = crosswalk.WikidataItem(
        qid="Q23501",
        taxon_name="Solanum ove393 Mill.",
        eppo_code="LYPES",
        labels={"uk": "помідор"},
    )
    receipt = crosswalk.crosswalk_wikidata(conn, items=[claim])

    assert receipt.identifier_conflicts >= 1
    held = conn.execute(
        "select catalog_item_id::text as id from catalog_item_identifiers"
        " where scheme = 'wikidata' and value = 'Q23501'"
    ).fetchone()
    assert held["id"] == first  # never an overwrite
    queued = conn.execute(
        """
        select item_type, state, reasons, proposal
        from catalog_curation_queue where subject_catalog_item_id = %s::uuid
        """,
        (second,),
    ).fetchone()
    assert queued["item_type"] == "source_link"
    assert queued["state"] == "open"
    assert "wikidata_identifier_conflict" in queued["reasons"]
    assert queued["proposal"]["scheme"] in {"wikidata", "eppo"}


def test_a_word_two_organisms_share_waits_for_the_owner(conn):
    first = seed_node(conn, "Solanum lycopersicum L.", col_id="4Y369")
    second = seed_node(conn, "Physalis philadelphica Lam.", col_id="7ZZZZ")

    crosswalk.crosswalk_wikidata(
        conn,
        items=[
            crosswalk.WikidataItem(
                qid="Q23501", col_id="4Y369", labels={"uk": "помідор"}
            ),
            crosswalk.WikidataItem(
                qid="Q157241", col_id="7ZZZZ", labels={"uk": "помідор"}
            ),
        ],
    )

    statuses = [
        row["status"]
        for row in conn.execute(
            """
            select status from catalog_alias_projections
            where locale = 'uk' and source_slug = 'wikidata'
              and catalog_item_id = any(array[%s::uuid, %s::uuid])
            order by created_at
            """,
            (first, second),
        ).fetchall()
    ]
    assert statuses == ["accepted", "review_needed"]
    names = conn.execute(
        """
        select count(*)::int as count from catalog_item_names
        where name_type = 'vernacular'
          and catalog_item_id = any(array[%s::uuid, %s::uuid])
        """,
        (first, second),
    ).fetchone()["count"]
    # Only the first projection became a name; the ambiguous one did not.
    assert names == 1


def test_a_second_run_writes_no_duplicate_names(conn):
    node = seed_node(conn, "Solanum lycopersicum L.", col_id="4Y369")
    crosswalk.crosswalk_wikidata(conn, items=[tomato_item()])
    first = conn.execute(
        "select count(*)::int as count from catalog_item_names where catalog_item_id = %s::uuid",
        (node,),
    ).fetchone()["count"]

    crosswalk.crosswalk_wikidata(conn, items=[tomato_item()])
    second = conn.execute(
        "select count(*)::int as count from catalog_item_names where catalog_item_id = %s::uuid",
        (node,),
    ).fetchone()["count"]
    assert second == first


def test_a_taxon_name_two_nodes_answer_to_is_never_guessed(conn):
    seed_node(conn, "Solanum lycopersicum L.")
    seed_node(conn, "Solanum lycopersicum L.", kingdom="Plantae")

    receipt = crosswalk.crosswalk_wikidata(
        conn,
        items=[
            crosswalk.WikidataItem(
                qid="Q23501", taxon_name="Solanum lycopersicum L.", labels={"uk": "помідор"}
            )
        ],
    )

    assert receipt.ambiguous_names == 1
    assert receipt.items_matched == 0
    assert (
        conn.execute(
            "select count(*)::int as count from catalog_item_identifiers where scheme = 'wikidata'"
        ).fetchone()["count"]
        == 0
    )
