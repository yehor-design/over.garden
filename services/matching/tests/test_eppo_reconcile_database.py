"""EPPO onto the graph, executed (OVE-394, ADR-0026 D11).

The interesting failures here are all row-shaped. A host class that falls
outside the closed set of migration 0054 is a constraint violation, not a
lint error. A pest status that normalizes to nothing puts "unknown" on a card
that should say "present in Ukraine". An identifier written onto a node that
already belongs to another organism breaks the ladder's first rung for every
later source. None of that is visible to a test that only imports the module,
so these run against a disposable database built from every migration, with
the captures seeded as the real ones are shaped.

The two fixtures are the ones the issue names: Leptinotarsa decemlineata with
Solanum tuberosum and Solanum lycopersicum as hosts, and Tuta absoluta present
in Ukraine.
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg
import pytest
from psycopg.rows import dict_row

from app import eppo_reconcile as reconcile

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

DIGEST = "a" * 64


def database_url(name: str) -> str:
    assert DATABASE_URL
    parts = urlsplit(DATABASE_URL)
    return urlunsplit(parts._replace(path=f"/{name}"))


@pytest.fixture
def conn():
    name = f"overgarden_eppo_{uuid.uuid4().hex}"
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


# ----------------------------------------------------------------------
# Seeding a capture the way the real one is shaped
# ----------------------------------------------------------------------


def seed_snapshot(conn: psycopg.Connection, version: str, digest: str) -> str:
    return conn.execute(
        """
        insert into catalog_source_snapshots (
          source_slug, source_name, source_category, source_version, source_url,
          license, license_url, attribution_required, attribution_text,
          parser_version, payload_sha256, fetched_at, verified_at, status
        )
        values ('eppo-codes', 'EPPO Global Database', 'pest_registry', %s,
                'https://api.eppo.int/gd/v2', 'EPPO Open Data Licence',
                'https://data.eppo.int/', true, %s, 'test', %s, now(), now(),
                'imported')
        returning id::text as id
        """,
        (version, reconcile.EPPO_ATTRIBUTION, digest),
    ).fetchone()["id"]


def seed_capture(
    conn: psycopg.Connection,
    *,
    snapshot_id: str,
    codes: int,
    pages: int = 1,
    digest: str = DIGEST,
) -> str:
    """A completed capture run, with every column its terminal shape needs."""
    return conn.execute(
        """
        insert into catalog_source_capture_runs (
          source_slug, capture_schema_version, capture_tool_revision,
          upstream_authority_class, state, source_host, endpoint_family,
          request_schema_version, openapi_sha256, license_sha256,
          observed_started_at, observed_ended_at, source_snapshot_id,
          inventory_start_total, inventory_end_total, inventory_unique_codes,
          inventory_page_count, inventory_start_sha256, inventory_end_sha256,
          manifest_sha256, zero_product_receipt, preflight_receipt
        )
        values (
          'eppo-codes', 'ove254.capture.v1', %s, 'observed_capture', 'completed',
          'api.eppo.int', 'gd/v2', 'ove254.request.v1', %s, %s,
          now() - interval '1 hour', now(), %s::uuid,
          %s, %s, %s, %s, %s, %s, %s,
          '{"status": "verified"}'::jsonb, %s::jsonb
        )
        returning id::text as id
        """,
        (
            "b" * 40,
            "c" * 64,
            "d" * 64,
            snapshot_id,
            codes,
            codes,
            codes,
            pages,
            digest,
            digest,
            digest,
            json.dumps({"class": "observed_capture_plan"}),
        ),
    ).fetchone()["id"]


def seed_unit(
    conn: psycopg.Connection,
    *,
    capture_id: str,
    code: str,
    endpoint_class: str,
    payload: object,
    ordinal: int = 0,
) -> None:
    conn.execute(
        """
        insert into catalog_source_capture_units (
          capture_id, unit_kind, unit_key, eppo_code, identifier_class,
          endpoint_class, inventory_ordinal, state, request_schema_version,
          observed_at, http_status_class, response_sha256, raw_payload,
          allowed_projection, source_only_fields, field_rights, rights_counts
        )
        values (
          %s::uuid, 'taxon_endpoint', %s, %s, 'documented_eppo_code', %s, %s,
          'captured', 'ove254.request.v1', now(), '2xx', %s, %s::jsonb,
          '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
        )
        """,
        (
            capture_id,
            code,
            code,
            endpoint_class,
            ordinal,
            uuid.uuid4().hex + uuid.uuid4().hex[:32],
            json.dumps(payload),
        ),
    )


def seed_record(conn: psycopg.Connection, snapshot_id: str, code: str) -> str:
    return conn.execute(
        """
        insert into catalog_source_records (
          source_snapshot_id, source_record_id, raw_payload_home,
          raw_payload_sha256, source_only_fields, allowed_projection,
          projection_status
        )
        values (%s::uuid, %s, 'capture_units', %s, '{}'::jsonb, '{}'::jsonb,
                'quarantined')
        returning id::text as id
        """,
        (snapshot_id, code, uuid.uuid4().hex + uuid.uuid4().hex[:32]),
    ).fetchone()["id"]


def seed_node(
    conn: psycopg.Connection,
    name: str,
    *,
    kingdom: str = "Plantae",
    rank: str = "species",
    eppo_code: str | None = None,
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
            f"ove394-{item_id[:8]}",
            f"ove394:{item_id}",
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
    if eppo_code:
        snapshot = seed_snapshot(conn, f"identifier-{eppo_code}", uuid.uuid4().hex * 2)
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
            values (%s::uuid, 'eppo', %s, %s::uuid)
            """,
            (item_id, eppo_code, assertion),
        )
    return item_id


def overview(code: str, name: str, *, active: bool = True) -> dict[str, object]:
    return {
        "eppocode": code,
        "prefname": name,
        "datatype": "PFL",
        "is_active": active,
        "replacedby": None,
    }


def taxonomy(code: str, name: str, kingdom: str) -> list[dict[str, object]]:
    return [
        {"type": "Kingdom", "level": 1, "eppocode": "1KING", "prefname": kingdom},
        {"type": "Species", "level": 7, "eppocode": code, "prefname": name},
    ]


def seed_two_captures(conn: psycopg.Connection) -> tuple[str, str, str, str]:
    first_snapshot = seed_snapshot(conn, "capture 2026-09-03", DIGEST)
    second_snapshot = seed_snapshot(conn, "capture 2026-09-06", "e" * 64)
    first = seed_capture(conn, snapshot_id=first_snapshot, codes=4)
    second = seed_capture(conn, snapshot_id=second_snapshot, codes=4, digest="f" * 64)
    return first, second, first_snapshot, second_snapshot


# ----------------------------------------------------------------------
# The mappings, without a database
# ----------------------------------------------------------------------


def test_pest_status_normalizes_onto_the_four_words_a_card_may_say():
    assert reconcile.normalized_presence("Present, widespread") == "present"
    assert reconcile.normalized_presence("Absent, pest eradicated") == "absent"
    assert reconcile.normalized_presence("Transient, actionable") == "transient"
    assert reconcile.normalized_presence("Present, no details") == "present"
    # An EPPO status nobody mapped is "unknown", never silently "present".
    assert reconcile.normalized_presence("Something EPPO adds in 2027") == "unknown"
    assert reconcile.normalized_presence(None) == "unknown"


def test_host_class_prefers_the_stable_id_over_the_label():
    assert (
        reconcile.host_class({"class_id": 1, "class_label": "Anything"}) == "major_host"
    )
    assert (
        reconcile.host_class({"class_id": None, "class_label": "Wild/Weed"})
        == "wild_weed_host"
    )
    # A class the closed set does not have becomes `unknown`, which it has.
    assert reconcile.host_class({"class_label": "Brand new class"}) == "unknown"


def test_region_code_keeps_the_sub_national_unit_eppo_publishes():
    assert reconcile.region_code({"country_iso": "ua"}) == "UA"
    assert reconcile.region_code({"country_iso": "US", "state_id": "CA"}) == "US-CA"
    assert reconcile.region_code({"country_iso": "US", "state_id": "US"}) == "US"
    assert reconcile.region_code({"country_iso": ""}) is None


# ----------------------------------------------------------------------
# The graph
# ----------------------------------------------------------------------


def test_the_colorado_potato_beetle_gets_its_hosts_with_classes(conn):
    first, second, first_snapshot, _ = seed_two_captures(conn)
    potato = seed_node(conn, "Solanum tuberosum")
    tomato = seed_node(conn, "Solanum lycopersicum", eppo_code="LYPES")
    beetle = seed_node(conn, "Leptinotarsa decemlineata", kingdom="Animalia")

    for code, name, kingdom in (
        ("LPTNDE", "Leptinotarsa decemlineata", "Animalia"),
        ("SOLTU", "Solanum tuberosum", "Plantae"),
        ("LYPES", "Solanum lycopersicum", "Plantae"),
    ):
        seed_unit(
            conn,
            capture_id=first,
            code=code,
            endpoint_class="taxon_overview",
            payload=overview(code, name),
        )
        seed_unit(
            conn,
            capture_id=first,
            code=code,
            endpoint_class="taxon_taxonomy",
            payload=taxonomy(code, name, kingdom),
        )
        seed_record(conn, first_snapshot, code)

    seed_unit(
        conn,
        capture_id=second,
        code="LPTNDE",
        endpoint_class="taxon_hosts",
        payload=[
            {
                "eppocode": "SOLTU",
                "prefname": "Solanum tuberosum",
                "class_id": 1,
                "class_label": "Major host",
                "bibref": "EPPO A1 list",
            },
            {
                "eppocode": "LYPES",
                "prefname": "Solanum lycopersicum",
                "class_id": 2,
                "class_label": "Host",
                "bibref": None,
            },
        ],
    )

    receipt = reconcile.reconcile_eppo(conn)

    assert receipt.relations_written == 2
    rows = conn.execute(
        """
        select relation.host_class, target.canonical_name
        from catalog_item_relations as relation
        join catalog_items as target on target.id = relation.to_catalog_item_id
        where relation.from_catalog_item_id = %s::uuid
          and relation.relation_type = 'pest_of'
        order by target.canonical_name
        """,
        (beetle,),
    ).fetchall()
    assert [(row["canonical_name"], row["host_class"]) for row in rows] == [
        ("Solanum lycopersicum", "host"),
        ("Solanum tuberosum", "major_host"),
    ]
    # The ranking input the weight recompute reads is now true for both hosts.
    hosts = conn.execute(
        "select id::text as id, is_host from catalog_items where id = any(%s::uuid[])",
        ([potato, tomato],),
    ).fetchall()
    assert all(row["is_host"] for row in hosts)


def test_tuta_absoluta_is_present_in_ukraine_with_the_status_eppo_wrote(conn):
    first, second, first_snapshot, _ = seed_two_captures(conn)
    moth = seed_node(conn, "Phthorimaea absoluta", kingdom="Animalia")
    conn.execute(
        """
        insert into catalog_item_names (
          catalog_item_id, display_name, normalized_name, locale, script,
          is_primary, name_type
        )
        values (%s::uuid, 'Tuta absoluta', catalog_normalize_name('Tuta absoluta'),
                'la', 'latin', false, 'scientific_synonym')
        """,
        (moth,),
    )
    seed_unit(
        conn,
        capture_id=first,
        code="GNORAB",
        endpoint_class="taxon_overview",
        payload=overview("GNORAB", "Tuta absoluta"),
    )
    seed_unit(
        conn,
        capture_id=first,
        code="GNORAB",
        endpoint_class="taxon_taxonomy",
        payload=taxonomy("GNORAB", "Tuta absoluta", "Animalia"),
    )
    seed_record(conn, first_snapshot, "GNORAB")
    seed_unit(
        conn,
        capture_id=second,
        code="GNORAB",
        endpoint_class="taxon_distribution",
        payload=[
            {
                "country_iso": "UA",
                "peststatus": "Present, restricted distribution",
                "state_id": None,
                "yr_introd": 2010,
                "yr_erad": None,
                "yr_situation": 2021,
            },
            {
                "country_iso": "BG",
                "peststatus": "Present, widespread",
                "state_id": None,
                "yr_introd": 2012,
                "yr_erad": None,
                "yr_situation": None,
            },
            {
                "country_iso": "US",
                "peststatus": "Absent, confirmed by survey",
                "state_id": "CA",
                "yr_introd": None,
                "yr_erad": None,
                "yr_situation": None,
            },
        ],
    )
    seed_unit(
        conn,
        capture_id=second,
        code="GNORAB",
        endpoint_class="taxon_categorization",
        payload=[
            {
                "continent_id": 1,
                "continent_name": "Europe",
                "country_iso": "UA",
                "country_name": "Ukraine",
                "qlist": "A2",
                "qlist_label": "A2 List",
                "year_add": 2004,
                "year_delete": None,
                "year_transient": None,
            },
        ],
    )

    receipt = reconcile.reconcile_eppo(conn)

    assert receipt.linked_by_scientific_name == 1
    assert receipt.distribution_facts_written == 3
    assert receipt.categorization_facts_written == 1
    facts = conn.execute(
        """
        select region_code, value, value_normalized, qualifiers
        from catalog_item_facts
        where catalog_item_id = %s::uuid and predicate = 'distribution_status'
        order by region_code
        """,
        (moth,),
    ).fetchall()
    by_region = {row["region_code"]: row for row in facts}
    assert by_region["UA"]["value"] == "Present, restricted distribution"
    assert by_region["UA"]["value_normalized"] == "present"
    assert by_region["UA"]["qualifiers"] == {"yr_introd": 2010, "yr_situation": 2021}
    assert by_region["BG"]["value_normalized"] == "present"
    # EPPO's sub-national unit is recorded as EPPO published it; what a card
    # may show is the projection's decision, not the source layer's.
    assert by_region["US-CA"]["value_normalized"] == "absent"
    categorization = conn.execute(
        """
        select region_code, value, value_normalized
        from catalog_item_facts
        where catalog_item_id = %s::uuid and predicate = 'categorization'
        """,
        (moth,),
    ).fetchone()
    assert categorization["region_code"] == "UA"
    assert categorization["value"] == "A2 List"
    assert categorization["value_normalized"] == "A2"


def test_a_second_run_replaces_its_own_facts_and_writes_no_duplicate(conn):
    first, second, first_snapshot, second_snapshot = seed_two_captures(conn)
    seed_node(conn, "Phthorimaea absoluta", kingdom="Animalia", eppo_code="GNORAB")
    seed_unit(
        conn,
        capture_id=first,
        code="GNORAB",
        endpoint_class="taxon_overview",
        payload=overview("GNORAB", "Tuta absoluta"),
    )
    seed_record(conn, first_snapshot, "GNORAB")
    seed_unit(
        conn,
        capture_id=second,
        code="GNORAB",
        endpoint_class="taxon_distribution",
        payload=[{"country_iso": "UA", "peststatus": "Present, widespread"}],
    )

    reconcile.reconcile_eppo(conn)
    reconcile.reconcile_eppo(conn)

    facts = conn.execute(
        "select count(*)::int as count from catalog_item_facts where predicate = 'distribution_status'"
    ).fetchone()
    assert facts["count"] == 1
    identifiers = conn.execute(
        "select count(*)::int as count from catalog_item_identifiers where scheme = 'eppo'"
    ).fetchone()
    assert identifiers["count"] == 1


def test_a_second_run_leaves_no_assertion_behind(conn):
    """A run that finds everything already written must write nothing at all."""
    first, second, first_snapshot, _ = seed_two_captures(conn)
    seed_node(conn, "Phthorimaea absoluta", kingdom="Animalia", eppo_code="GNORAB")
    seed_unit(
        conn,
        capture_id=first,
        code="GNORAB",
        endpoint_class="taxon_overview",
        payload=overview("GNORAB", "Tuta absoluta"),
    )
    seed_record(conn, first_snapshot, "GNORAB")
    seed_unit(
        conn,
        capture_id=second,
        code="GNORAB",
        endpoint_class="taxon_distribution",
        payload=[{"country_iso": "UA", "peststatus": "Present, widespread"}],
    )

    reconcile.reconcile_eppo(conn)
    after_first = conn.execute(
        "select count(*)::int as count from catalog_source_assertions where source_slug = 'eppo-codes'"
    ).fetchone()["count"]
    reconcile.reconcile_eppo(conn)
    after_second = conn.execute(
        "select count(*)::int as count from catalog_source_assertions where source_slug = 'eppo-codes'"
    ).fetchone()["count"]

    # 121,777 identifiers whose names and identifiers are already written would
    # otherwise add a quarter of a million assertions that name nothing.
    assert after_second == after_first


def test_a_genus_the_checklist_knows_is_built_from_the_checklist(conn):
    """The backbone owns the taxon; EPPO only says which one it means."""
    first, _second, first_snapshot, _ = seed_two_captures(conn)
    snapshot = conn.execute(
        """
        insert into catalog_source_snapshots (
          source_slug, source_name, source_category, source_version, source_url,
          license, parser_version, payload_sha256, fetched_at, verified_at, status
        )
        values ('catalogue-of-life-checklistbank', 'Catalogue of Life',
                'species_backbone', 'ove395-proof', 'https://example.test/',
                'CC BY 4.0', 'test', %s, now(), now(), 'imported')
        returning id::text as id
        """,
        ("c" * 64,),
    ).fetchone()["id"]
    for col_id, canonical, scientific, rank, parent in (
        ("PLANT", "Plantae", "Plantae", "kingdom", None),
        ("ABIES", "Abies", "Abies Mill.", "genus", "PLANT"),
    ):
        conn.execute(
            """
            insert into catalog_source_col_usages (
              source_snapshot_id, col_id, parent_col_id, canonical_name,
              scientific_name, authorship, rank, status, kingdom
            )
            values (%s::uuid, %s, %s, %s, %s, null, %s, 'accepted', 'Plantae')
            """,
            (snapshot, col_id, parent, canonical, scientific, rank),
        )

    seed_unit(
        conn,
        capture_id=first,
        code="1ABIG",
        endpoint_class="taxon_overview",
        payload=overview("1ABIG", "Abies"),
    )
    seed_unit(
        conn,
        capture_id=first,
        code="1ABIG",
        endpoint_class="taxon_taxonomy",
        payload=[
            {"type": "Kingdom", "level": 1, "eppocode": "1PLAK", "prefname": "Plantae"},
            {"type": "Genus", "level": 6, "eppocode": "1ABIG", "prefname": "Abies"},
        ],
    )
    seed_record(conn, first_snapshot, "1ABIG")

    receipt = reconcile.reconcile_eppo(conn)

    # 17,630 of EPPO's active identifiers are genera. One the checklist knows
    # becomes a Catalogue of Life node with its classification and a `col`
    # identifier, not a node invented from EPPO and not a queue item.
    assert receipt.linked_by_col_usage == 1
    assert receipt.nodes_created == 0
    assert receipt.queued_for_curation == 0
    node = conn.execute(
        """
        select item.canonical_name, item.rank, item.kingdom,
               (select count(*)::int from catalog_item_identifiers as i
                 where i.catalog_item_id = item.id and i.scheme = 'col') as col_ids,
               (select count(*)::int from catalog_item_identifiers as i
                 where i.catalog_item_id = item.id and i.scheme = 'eppo') as eppo_ids
        from catalog_items as item
        join catalog_item_identifiers as identifier
          on identifier.catalog_item_id = item.id
        where identifier.scheme = 'eppo' and identifier.value = '1ABIG'
        """
    ).fetchone()
    assert node["canonical_name"] == "Abies"
    assert node["rank"] == "genus"
    assert node["col_ids"] == 1
    assert node["eppo_ids"] == 1


def test_a_virus_eppo_has_and_the_backbone_lacks_becomes_its_own_node(conn):
    first, _second, first_snapshot, _ = seed_two_captures(conn)
    seed_unit(
        conn,
        capture_id=first,
        code="TSWV00",
        endpoint_class="taxon_overview",
        payload=overview("TSWV00", "Tomato spotted wilt orthotospovirus"),
    )
    seed_unit(
        conn,
        capture_id=first,
        code="TSWV00",
        endpoint_class="taxon_taxonomy",
        payload=taxonomy(
            "TSWV00", "Tomato spotted wilt orthotospovirus", "Viruses and viroids"
        ),
    )
    seed_record(conn, first_snapshot, "TSWV00")

    receipt = reconcile.reconcile_eppo(conn)

    assert receipt.nodes_created == 1
    node = conn.execute(
        """
        select item.canonical_name, item.kingdom, item.rank, item.public_slug,
               item.source_id
        from catalog_items as item
        join catalog_item_identifiers as identifier
          on identifier.catalog_item_id = item.id
        where identifier.scheme = 'eppo' and identifier.value = 'TSWV00'
        """
    ).fetchone()
    assert node["kingdom"] == "Viruses"
    assert node["rank"] == "species"
    assert node["public_slug"]
    assert node["source_id"] == "eppo-global-database:TSWV00"
    # No `col` identifier is invented for a taxon Catalogue of Life does not
    # carry; the node stands on EPPO alone.
    assert (
        conn.execute(
            "select count(*)::int as count from catalog_item_identifiers where scheme = 'col'"
        ).fetchone()["count"]
        == 0
    )


def test_a_genus_the_backbone_lacks_is_queued_rather_than_invented(conn):
    first, _second, first_snapshot, _ = seed_two_captures(conn)
    seed_unit(
        conn,
        capture_id=first,
        code="1ABIG",
        endpoint_class="taxon_overview",
        payload=overview("1ABIG", "Abies"),
    )
    seed_unit(
        conn,
        capture_id=first,
        code="1ABIG",
        endpoint_class="taxon_taxonomy",
        payload=[
            {"type": "Kingdom", "level": 1, "eppocode": "1PLAK", "prefname": "Plantae"},
            {"type": "Genus", "level": 6, "eppocode": "1ABIG", "prefname": "Abies"},
        ],
    )
    seed_record(conn, first_snapshot, "1ABIG")

    receipt = reconcile.reconcile_eppo(conn)

    # 17,630 of EPPO's active identifiers are genera. Creating a node for each
    # would put a second authority's copy of the backbone beside it.
    assert receipt.nodes_created == 0
    assert receipt.queued_for_curation == 1


def test_an_ambiguous_name_goes_to_the_queue_and_links_nothing(conn):
    first, _second, first_snapshot, _ = seed_two_captures(conn)
    seed_node(conn, "Prunus domestica", kingdom="Plantae")
    seed_node(conn, "Prunus domestica", kingdom="Plantae")
    seed_unit(
        conn,
        capture_id=first,
        code="PRNDO",
        endpoint_class="taxon_overview",
        payload=overview("PRNDO", "Prunus domestica"),
    )
    seed_unit(
        conn,
        capture_id=first,
        code="PRNDO",
        endpoint_class="taxon_taxonomy",
        payload=taxonomy("PRNDO", "Prunus domestica", "Plantae"),
    )
    seed_record(conn, first_snapshot, "PRNDO")

    receipt = reconcile.reconcile_eppo(conn)

    assert receipt.queued_for_curation == 1
    assert receipt.identifiers_written == 0
    item = conn.execute(
        """
        select item_type, state, impact_score, reasons, proposal
        from catalog_curation_queue
        where proposal->>'source_record_key' = 'PRNDO'
        """
    ).fetchone()
    assert item["item_type"] == "source_link"
    assert item["state"] == "open"
    assert item["reasons"] == ["eppo_ambiguous"]
    assert len(item["proposal"]["candidates"]) == 2


def test_one_identifier_is_the_unit_of_work(conn, monkeypatch):
    """A run that dies halfway leaves whole taxa behind it, never half of one."""
    first, _second, first_snapshot, _ = seed_two_captures(conn)
    for code, name in (("AAAA01", "Alpha alpha"), ("ZZZZ99", "Omega omega")):
        seed_unit(
            conn,
            capture_id=first,
            code=code,
            endpoint_class="taxon_overview",
            payload=overview(code, name),
        )
        seed_unit(
            conn,
            capture_id=first,
            code=code,
            endpoint_class="taxon_taxonomy",
            payload=taxonomy(code, name, "Animalia"),
        )
        seed_record(conn, first_snapshot, code)

    original = reconcile._create_node_from_eppo
    calls: list[str] = []

    def fail_on_the_second(conn_, taxon, receipt, assertion_id):
        calls.append(taxon.eppo_code)
        if len(calls) == 2:
            raise RuntimeError("the provider's database blinked")
        return original(conn_, taxon, receipt, assertion_id)

    monkeypatch.setattr(reconcile, "_create_node_from_eppo", fail_on_the_second)

    with pytest.raises(RuntimeError, match="blinked"):
        reconcile.reconcile_eppo(conn)

    # The first identifier is whole; the second left nothing at all.
    rows = conn.execute(
        """
        select identifier.value
        from catalog_item_identifiers as identifier
        where identifier.scheme = 'eppo'
        order by identifier.value
        """
    ).fetchall()
    assert [row["value"] for row in rows] == ["AAAA01"]
    names = conn.execute(
        """
        select count(*)::int as count
        from catalog_items
        where source_id like 'eppo-global-database:%'
        """
    ).fetchone()
    assert names["count"] == 1


def test_an_inactive_eppo_code_is_never_linked(conn):
    first, _second, first_snapshot, _ = seed_two_captures(conn)
    seed_node(conn, "Lycopersicon esculentum", kingdom="Plantae")
    seed_unit(
        conn,
        capture_id=first,
        code="LYPES9",
        endpoint_class="taxon_overview",
        payload=overview("LYPES9", "Lycopersicon esculentum", active=False),
    )
    seed_record(conn, first_snapshot, "LYPES9")

    receipt = reconcile.reconcile_eppo(conn)

    assert receipt.active_codes == 0
    assert receipt.identifiers_written == 0
