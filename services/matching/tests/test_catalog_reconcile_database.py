"""The reconciliation SQL, executed (ADR-0026 D4).

`catalog_apply_queue_item` and `catalog_revert_action` (migration 0056) are
the only implementation of an apply and a revert: the worker calls them above
a rule's threshold, the owner's page calls them on a decision. A compile-only
test cannot see a wrong column, a refused constraint or an inverse that does
not restore what it claims to, so these build a disposable database from every
versioned migration and run the functions against it, then compare a
fingerprint of the affected rows before and after a revert.
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

from app import catalog_reconcile as ladder

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
    name = f"overgarden_reconcile_{uuid.uuid4().hex}"
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
# Seeding
# ----------------------------------------------------------------------


def seed_item(
    conn: psycopg.Connection,
    name: str,
    *,
    node_kind: str = "taxon",
    catalog_kind: str = "species",
    kingdom: str = "Plantae",
    slug: str | None = None,
) -> str:
    item_id = str(uuid.uuid4())
    conn.execute(
        """
        insert into catalog_items (
          id, canonical_name, catalog_kind, normalized_name, public_slug, status, source,
          source_id, locale, node_kind, kingdom, identity_state
        )
        values (%s, %s, %s, catalog_normalize_name(%s), %s, 'seeded', 'species_backbone',
                %s, 'la', %s, %s, 'active')
        """,
        (
            item_id,
            name,
            catalog_kind,
            name,
            slug or f"ove390-{item_id[:8]}",
            f"species_backbone:ove390:{item_id}",
            node_kind,
            kingdom,
        ),
    )
    return item_id


def seed_gardener(conn: psycopg.Connection) -> tuple[str, str]:
    user_id = str(uuid.uuid4())
    space_id = str(uuid.uuid4())
    conn.execute(
        'insert into "user" (id, name, email, "emailVerified") values (%s, %s, %s, true)',
        (user_id, "ove390 gardener", f"ove390-{user_id[:8]}@example.test"),
    )
    conn.execute(
        "insert into spaces (id, owner_user_id, display_name) values (%s, %s, 'ove390 garden')",
        (space_id, user_id),
    )
    return user_id, space_id


def seed_object(
    conn: psycopg.Connection,
    owner: tuple[str, str],
    *,
    label: str | None = None,
    catalog_item_id: str | None = None,
    object_kind: str = "plant",
    entries: int = 0,
) -> str:
    user_id, space_id = owner
    object_id = str(uuid.uuid4())
    conn.execute(
        """
        insert into plant_objects (
          id, owner_user_id, space_id, display_name, object_kind, catalog_item_id,
          variety_state, variety_text
        )
        values (%s, %s, %s, 'Об''єкт', %s, %s, %s, %s)
        """,
        (
            object_id,
            user_id,
            space_id,
            object_kind,
            catalog_item_id,
            "selected" if catalog_item_id else "free_text",
            label,
        ),
    )
    for index in range(entries):
        conn.execute(
            """
            insert into journal_entries (
              owner_user_id, space_id, plant_object_id, title, body, entry_scope,
              visibility, lifecycle_state, published_at, public_slug, client_mutation_id
            )
            values (%s, %s, %s, 'Запис', 'Текст.', 'object', 'public', 'active',
                    now() - interval '1 day', %s, %s)
            """,
            (
                user_id,
                space_id,
                object_id,
                f"ove390-{object_id[:8]}-{index}",
                f"ove390-{object_id[:8]}-{index}",
            ),
        )
    return object_id


def seed_assertion(conn: psycopg.Connection) -> tuple[str, str]:
    snapshot_id = str(uuid.uuid4())
    assertion_id = str(uuid.uuid4())
    conn.execute(
        """
        insert into catalog_source_snapshots (
          id, source_slug, source_name, source_category, source_version, source_url,
          license, parser_version, payload_sha256, fetched_at, verified_at, status
        )
        values (%s, 'ua-state-register', 'Register', 'taxonomy', %s, 'https://example.test/',
                'CC BY 4.0', %s, %s, now(), now(), 'imported')
        """,
        (snapshot_id, f"ove390-{snapshot_id[:8]}", "v1", "0" * 64),
    )
    conn.execute(
        "insert into catalog_source_assertions (id, source_slug, source_snapshot_id) values (%s, 'ua-state-register', %s)",
        (assertion_id, snapshot_id),
    )
    return snapshot_id, assertion_id


def queue_item(
    conn: psycopg.Connection,
    *,
    item_type: str,
    subject_catalog_item_id: str | None = None,
    subject_label: str | None = None,
    proposal: dict | None = None,
    confidence: float = 0.96,
    reasons: list[str] | None = None,
) -> str:
    row = conn.execute(
        """
        insert into catalog_curation_queue (
          item_type, subject_catalog_item_id, subject_label, proposal, confidence, reasons, impact_score
        )
        values (%s, %s, %s, %s::jsonb, %s, %s::text[], 10)
        returning id::text as id
        """,
        (
            item_type,
            subject_catalog_item_id,
            subject_label,
            json.dumps(proposal or {}),
            confidence,
            reasons or ["denomination_equal"],
        ),
    ).fetchone()
    return row["id"]


def objects_fingerprint(conn: psycopg.Connection) -> list[tuple]:
    return [
        tuple(row.values())
        for row in conn.execute(
            """
            select id::text, coalesce(catalog_item_id::text, ''), variety_state, coalesce(variety_text, '')
            from plant_objects order by id
            """
        ).fetchall()
    ]


def graph_fingerprint(conn: psycopg.Connection) -> dict[str, list[tuple]]:
    def rows(statement: str) -> list[tuple]:
        return [tuple(row.values()) for row in conn.execute(statement).fetchall()]

    return {
        "items": rows(
            """
            select id::text, identity_state, coalesce(merged_into_catalog_item_id::text, '')
            from catalog_items order by id
            """
        ),
        "objects": rows(
            "select id::text, coalesce(catalog_item_id::text, ''), variety_state from plant_objects order by id"
        ),
        "names": rows(
            "select id::text, catalog_item_id::text, name_type, is_primary from catalog_item_names order by id"
        ),
        "identifiers": rows(
            "select id::text, catalog_item_id::text, scheme, value from catalog_item_identifiers order by id"
        ),
        "relations": rows(
            "select id::text, from_catalog_item_id::text, to_catalog_item_id::text, relation_type from catalog_item_relations order by id"
        ),
        "facts": rows("select id::text, catalog_item_id::text, predicate, value from catalog_item_facts order by id"),
        "slugs": rows(
            "select id::text, catalog_item_id::text, slug, namespace from catalog_item_slug_history order by id"
        ),
        "mentions": rows(
            "select journal_entry_id::text, catalog_item_id::text from journal_entry_catalog_mentions order by journal_entry_id, catalog_item_id"
        ),
    }


def apply_item(conn: psycopg.Connection, item_id: str, *, automatic: bool = True) -> str:
    row = conn.execute(
        "select catalog_apply_queue_item(%s::uuid, null, %s)::text as action_id",
        (item_id, automatic),
    ).fetchone()
    return row["action_id"]


# ----------------------------------------------------------------------
# label_link
# ----------------------------------------------------------------------


def test_a_label_link_moves_every_object_with_that_label_and_keeps_the_gardener_name(conn):
    cultivar = seed_item(conn, "Бичаче серце", node_kind="cultivar", catalog_kind="plant_variety")
    owner = seed_gardener(conn)
    mine = seed_object(conn, owner, label="Бичаче  серце", entries=2)
    spaced = seed_object(conn, owner, label="бичаче серце")
    other = seed_object(conn, owner, label="Зовсім інша")
    animal = seed_object(conn, owner, label="Бичаче серце", object_kind="animal")
    before = graph_fingerprint(conn)

    item = queue_item(
        conn,
        item_type="label_link",
        subject_catalog_item_id=cultivar,
        subject_label="Бичаче серце",
        proposal={"catalog_item_id": cultivar, "object_kind": "plant"},
    )
    action_id = apply_item(conn, item)

    linked = {
        row["id"]: row
        for row in conn.execute(
            "select id::text as id, catalog_item_id::text as catalog_item_id, variety_state, variety_text from plant_objects"
        ).fetchall()
    }
    assert linked[mine]["catalog_item_id"] == cultivar
    assert linked[mine]["variety_state"] == "selected"
    # ADR-0026 D6: the gardener's own spelling stays on the object.
    assert linked[mine]["variety_text"] == "Бичаче  серце"
    assert linked[spaced]["catalog_item_id"] == cultivar
    assert linked[other]["catalog_item_id"] is None
    assert linked[animal]["catalog_item_id"] is None, "another object kind is not this cluster"

    # The card learns it now carries first-hand content, and asks to re-render.
    item_row = conn.execute(
        "select first_hand_content_at from catalog_items where id = %s", (cultivar,)
    ).fetchone()
    assert item_row["first_hand_content_at"] is not None
    intents = conn.execute(
        "select entity_id::text as id, desired_reason from public_projection_intents where entity_kind = 'catalog_item'"
    ).fetchall()
    assert [(row["id"], row["desired_reason"]) for row in intents] == [(cultivar, "catalog_card")]

    queue_state = conn.execute(
        "select state from catalog_curation_queue where id = %s", (item,)
    ).fetchone()
    assert queue_state["state"] == "auto_applied"

    conn.execute("select catalog_revert_action(%s::uuid, null)", (action_id,))
    assert graph_fingerprint(conn)["objects"] == before["objects"]
    reverted = conn.execute(
        "select state from catalog_curation_queue where id = %s", (item,)
    ).fetchone()
    assert reverted["state"] == "reverted"
    action = conn.execute(
        "select reverted_by_action_id from catalog_curation_actions where id = %s", (action_id,)
    ).fetchone()
    assert action["reverted_by_action_id"] is not None


def test_a_decided_item_is_never_applied_twice(conn):
    cultivar = seed_item(conn, "Слава", node_kind="cultivar", catalog_kind="plant_variety")
    owner = seed_gardener(conn)
    seed_object(conn, owner, label="Слава")
    item = queue_item(
        conn,
        item_type="label_link",
        subject_catalog_item_id=cultivar,
        subject_label="Слава",
        proposal={"catalog_item_id": cultivar, "object_kind": "plant"},
    )
    apply_item(conn, item)

    with pytest.raises(psycopg.errors.InvalidParameterValue):
        apply_item(conn, item)


def test_an_action_is_reverted_at_most_once(conn):
    cultivar = seed_item(conn, "Слава", node_kind="cultivar", catalog_kind="plant_variety")
    owner = seed_gardener(conn)
    seed_object(conn, owner, label="Слава")
    item = queue_item(
        conn,
        item_type="label_link",
        subject_catalog_item_id=cultivar,
        subject_label="Слава",
        proposal={"catalog_item_id": cultivar, "object_kind": "plant"},
    )
    action_id = apply_item(conn, item)
    conn.execute("select catalog_revert_action(%s::uuid, null)", (action_id,))

    with pytest.raises(psycopg.errors.InvalidParameterValue):
        conn.execute("select catalog_revert_action(%s::uuid, null)", (action_id,))


def test_a_retired_target_is_refused(conn):
    cultivar = seed_item(conn, "Слава", node_kind="cultivar", catalog_kind="plant_variety")
    conn.execute("update catalog_items set identity_state = 'retired' where id = %s", (cultivar,))
    item = queue_item(
        conn,
        item_type="label_link",
        subject_catalog_item_id=cultivar,
        subject_label="Слава",
        proposal={"catalog_item_id": cultivar, "object_kind": "plant"},
    )

    with pytest.raises(psycopg.errors.InvalidParameterValue):
        apply_item(conn, item)


# ----------------------------------------------------------------------
# node_merge
# ----------------------------------------------------------------------


def test_a_merge_moves_everything_to_the_survivor_and_the_inverse_restores_it(conn):
    survivor = seed_item(conn, "Solanum lycopersicum", slug="ove390-solanum")
    loser = seed_item(conn, "Lycopersicon esculentum", slug="ove390-lycopersicon")
    form = seed_item(conn, "Де Барао", node_kind="cultivar", catalog_kind="plant_variety", slug="ove390-de-barao")
    _, assertion = seed_assertion(conn)
    owner = seed_gardener(conn)
    obj = seed_object(conn, owner, catalog_item_id=loser, entries=1)
    entry = conn.execute(
        "select id::text as id, owner_user_id::text as owner, space_id::text as space from journal_entries limit 1"
    ).fetchone()
    conn.execute(
        """
        insert into journal_entry_catalog_mentions (journal_entry_id, owner_user_id, space_id, catalog_item_id)
        values (%s::uuid, %s::uuid, %s::uuid, %s::uuid)
        """,
        (entry["id"], entry["owner"], entry["space"], loser),
    )
    conn.execute(
        """
        insert into catalog_item_names (catalog_item_id, display_name, normalized_name, locale, is_primary, name_type, assertion_id)
        values (%s, 'Lycopersicon esculentum', catalog_normalize_name('Lycopersicon esculentum'), 'la', true, 'scientific_accepted', %s)
        """,
        (loser, assertion),
    )
    conn.execute(
        "insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id) values (%s, 'eppo', 'LYPES', %s)",
        (loser, assertion),
    )
    conn.execute(
        "insert into catalog_item_relations (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id) values (%s, %s, 'form_of', %s)",
        (form, loser, assertion),
    )
    conn.execute(
        "insert into catalog_item_facts (catalog_item_id, predicate, region_code, value, assertion_id) values (%s, 'distribution_status', 'UA', 'Present', %s)",
        (loser, assertion),
    )
    before = graph_fingerprint(conn)

    item = queue_item(
        conn,
        item_type="node_merge",
        subject_catalog_item_id=loser,
        proposal={"survivor_id": survivor, "loser_id": loser},
        confidence=0.99,
        reasons=["shared_identifier:eppo"],
    )
    action_id = apply_item(conn, item)

    after = {
        "item": conn.execute(
            "select identity_state, merged_into_catalog_item_id::text as merged_into from catalog_items where id = %s",
            (loser,),
        ).fetchone(),
        "object": conn.execute(
            "select catalog_item_id::text as catalog_item_id from plant_objects where id = %s", (obj,)
        ).fetchone(),
        "identifier": conn.execute(
            "select catalog_item_id::text as catalog_item_id from catalog_item_identifiers where value = 'LYPES'"
        ).fetchone(),
        "name": conn.execute(
            "select catalog_item_id::text as catalog_item_id, name_type, is_primary from catalog_item_names where display_name = 'Lycopersicon esculentum'"
        ).fetchone(),
        "relation": conn.execute(
            "select to_catalog_item_id::text as to_id from catalog_item_relations where from_catalog_item_id = %s", (form,)
        ).fetchone(),
        "fact": conn.execute(
            "select catalog_item_id::text as catalog_item_id from catalog_item_facts where value = 'Present'"
        ).fetchone(),
        "slug": conn.execute(
            "select catalog_item_id::text as catalog_item_id from catalog_item_slug_history where slug = 'ove390-lycopersicon'"
        ).fetchone(),
        "mention": conn.execute(
            "select catalog_item_id::text as catalog_item_id from journal_entry_catalog_mentions"
        ).fetchone(),
    }
    assert after["item"]["identity_state"] == "merged"
    assert after["item"]["merged_into"] == survivor
    assert after["object"]["catalog_item_id"] == survivor
    assert after["identifier"]["catalog_item_id"] == survivor
    # The loser's accepted name survives as a synonym of the survivor.
    assert after["name"]["catalog_item_id"] == survivor
    assert after["name"]["name_type"] == "scientific_synonym"
    assert after["name"]["is_primary"] is False
    assert after["relation"]["to_id"] == survivor
    assert after["fact"]["catalog_item_id"] == survivor
    assert after["slug"]["catalog_item_id"] == survivor, "the old slug redirects to the survivor"
    assert after["mention"]["catalog_item_id"] == survivor

    conn.execute("select catalog_revert_action(%s::uuid, null)", (action_id,))
    assert graph_fingerprint(conn) == before


def test_a_merge_of_a_node_with_itself_is_refused(conn):
    node = seed_item(conn, "Solanum lycopersicum")
    item = queue_item(
        conn,
        item_type="node_merge",
        subject_catalog_item_id=node,
        proposal={"survivor_id": node, "loser_id": node},
    )

    with pytest.raises(psycopg.errors.InvalidParameterValue):
        apply_item(conn, item)


# ----------------------------------------------------------------------
# source_link and split_review
# ----------------------------------------------------------------------


def test_a_source_link_writes_an_assertion_and_its_identifiers_and_the_revert_supersedes_it(conn):
    node = seed_item(conn, "Solanum lycopersicum")
    snapshot, _ = seed_assertion(conn)
    item = queue_item(
        conn,
        item_type="source_link",
        subject_catalog_item_id=node,
        proposal={
            "source_slug": "ua-state-register",
            "source_snapshot_id": snapshot,
            "identifiers": [{"scheme": "ua_register", "value": "ove390-1"}],
        },
        confidence=0.99,
        reasons=["shared_identifier:ua_register"],
    )

    action_id = apply_item(conn, item, automatic=False)

    identifier = conn.execute(
        "select catalog_item_id::text as catalog_item_id, assertion_id::text as assertion_id from catalog_item_identifiers where value = 'ove390-1'"
    ).fetchone()
    assert identifier["catalog_item_id"] == node
    decision = conn.execute(
        "select decision from catalog_source_assertions where id = %s", (identifier["assertion_id"],)
    ).fetchone()
    assert decision["decision"] == "curator_accepted"
    assert conn.execute(
        "select state from catalog_curation_queue where id = %s", (item,)
    ).fetchone()["state"] == "accepted"

    conn.execute("select catalog_revert_action(%s::uuid, null)", (action_id,))
    assert conn.execute("select count(*)::int as n from catalog_item_identifiers where value = 'ove390-1'").fetchone()["n"] == 0
    assert conn.execute(
        "select decision from catalog_source_assertions where id = %s", (identifier["assertion_id"],)
    ).fetchone()["decision"] == "superseded"


def test_a_split_review_is_never_applied_by_the_function(conn):
    node = seed_item(conn, "Solanum lycopersicum")
    item = queue_item(conn, item_type="split_review", subject_catalog_item_id=node)

    with pytest.raises(psycopg.errors.FeatureNotSupported):
        apply_item(conn, item)


# ----------------------------------------------------------------------
# Thresholds, recalibration and the ladder end to end
# ----------------------------------------------------------------------


def test_thresholds_are_seeded_for_every_rule_and_recalibrate_within_bounds(conn):
    thresholds = ladder.read_thresholds(conn)
    assert set(thresholds) == set(ladder.RULE_CODES)
    assert all(value == 0.95 for value in thresholds.values())

    # A rule with a 10 % revert rate over ten automatic decisions.
    node = seed_item(conn, "Solanum lycopersicum")
    for index in range(10):
        conn.execute(
            """
            insert into catalog_curation_actions (
              action_type, subject_catalog_item_ids, payload, inverse, automatic, performed_at
            )
            values ('link', array[%s::uuid], %s::jsonb, '{}'::jsonb, true, now())
            returning id
            """,
            (node, json.dumps({"rule_code": "denomination_equal"})),
        )
    reverted = conn.execute(
        "select id from catalog_curation_actions order by performed_at limit 1"
    ).fetchone()["id"]
    revert = conn.execute(
        """
        insert into catalog_curation_actions (action_type, subject_catalog_item_ids, payload, inverse, automatic)
        values ('revert', array[%s::uuid], '{}'::jsonb, '{}'::jsonb, false)
        returning id
        """,
        (node,),
    ).fetchone()["id"]
    conn.execute(
        "update catalog_curation_actions set reverted_by_action_id = %s where id = %s", (revert, reverted)
    )

    receipt = ladder.recalibrate_thresholds(conn)

    assert receipt["denomination_equal"]["after"] == pytest.approx(0.97)
    assert receipt["shared_identifier"]["after"] == pytest.approx(0.95)
    stored = ladder.read_thresholds(conn)
    assert stored["denomination_equal"] == pytest.approx(0.97)
    assert all(0.80 <= value <= 0.99 for value in stored.values())


def test_the_labels_scope_auto_applies_above_the_threshold_and_queues_below_it(conn):
    cultivar = seed_item(conn, "Бичаче серце", node_kind="cultivar", catalog_kind="plant_variety")
    owner = seed_gardener(conn)
    seed_object(conn, owner, label="Бичаче серце", entries=1)
    seed_object(conn, owner, label="Моя рідкісна ягода")

    receipt = ladder.reconcile(conn, "labels")

    assert receipt["proposals"] == 1
    assert receipt["autoApplied"] == 1
    assert receipt["queued"] == 0
    linked = conn.execute(
        "select count(*)::int as n from plant_objects where catalog_item_id = %s", (cultivar,)
    ).fetchone()
    assert linked["n"] == 1

    # A second run proposes nothing: the label is linked and the item decided.
    assert ladder.reconcile(conn, "labels")["proposals"] == 0

    # Raise the rule's threshold above the rung's confidence: the next label
    # becomes a queue item for the owner instead of applying itself.
    conn.execute(
        "update catalog_reconcile_thresholds set threshold = 0.99 where rule_code = 'denomination_equal'"
    )
    seed_item(conn, "Моя рідкісна ягода", node_kind="cultivar", catalog_kind="plant_variety")
    second = ladder.reconcile(conn, "labels")
    assert second["proposals"] == 1
    assert second["autoApplied"] == 0
    assert second["queued"] == 1
    open_items = conn.execute(
        "select count(*)::int as n from catalog_curation_queue where state = 'open'"
    ).fetchone()
    assert open_items["n"] == 1


def test_the_duplicates_scope_queues_a_same_name_pair_and_never_crosses_a_kingdom(conn):
    # `catalog_item_identifiers` is unique on (scheme, value), so two live
    # nodes cannot share one: in this scope rung three decides. Its confidence
    # (0.93) sits below the seeded threshold, so the pair becomes an owner
    # decision rather than an automatic merge.
    first = seed_item(conn, "Solanum nigrum", slug="ove390-solanum-nigrum-a")
    second = seed_item(conn, "Solanum nigrum", slug="ove390-solanum-nigrum-b")
    shrub = seed_item(conn, "Pieris japonica", slug="ove390-pieris-plant")
    butterfly = seed_item(conn, "Pieris japonica", kingdom="Animalia", slug="ove390-pieris-animal")

    receipt = ladder.reconcile(conn, "duplicates")

    assert receipt["conflicts"] >= 1, "the Pieris homonym is recorded"
    assert receipt["autoApplied"] == 0
    assert receipt["queued"] == 1
    states = {
        row["id"]: row["identity_state"]
        for row in conn.execute("select id::text as id, identity_state from catalog_items").fetchall()
    }
    assert states[shrub] == "active" and states[butterfly] == "active"
    assert states[first] == "active" and states[second] == "active"

    item = conn.execute(
        """
        select subject_catalog_item_id::text as loser, proposal->>'survivor_id' as survivor,
               confidence, reasons, state
        from catalog_curation_queue where item_type = 'node_merge'
        """
    ).fetchall()
    assert len(item) == 1
    assert {item[0]["loser"], item[0]["survivor"]} == {first, second}
    assert item[0]["reasons"] == ["canonical_same_kingdom_rank"]
    assert item[0]["state"] == "open"

    # Accepting it applies through the same function the worker uses.
    queued_id = conn.execute(
        "select id::text as id from catalog_curation_queue where item_type = 'node_merge'"
    ).fetchone()["id"]
    action_id = apply_item(conn, queued_id, automatic=False)
    merged = conn.execute(
        "select identity_state from catalog_items where id = %s", (item[0]["loser"],)
    ).fetchone()
    assert merged["identity_state"] == "merged"
    conn.execute("select catalog_revert_action(%s::uuid, null)", (action_id,))
    assert conn.execute(
        "select identity_state from catalog_items where id = %s", (item[0]["loser"],)
    ).fetchone()["identity_state"] == "active"


def test_a_source_record_reaches_its_node_by_a_shared_identifier(conn):
    node = seed_item(conn, "Solanum lycopersicum", slug="ove390-solanum-3")
    snapshot, assertion = seed_assertion(conn)
    conn.execute(
        "insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id) values (%s, 'eppo', 'LYPES', %s)",
        (node, assertion),
    )
    conn.execute(
        """
        insert into catalog_source_records (
          source_snapshot_id, source_record_id, raw_payload, raw_payload_sha256, allowed_projection
        )
        values (%s, 'record-1', '{}'::jsonb, %s, %s::jsonb)
        """,
        (
            snapshot,
            "1" * 64,
            json.dumps(
                {
                    "scientificName": "Solanum lycopersicum",
                    "kingdom": "Plantae",
                    "rank": "species",
                    "identifiers": [{"scheme": "eppo", "value": "LYPES"}],
                }
            ),
        ),
    )

    receipt = ladder.reconcile(conn, "source_records")

    assert receipt["proposals"] == 1
    assert receipt["autoApplied"] == 1, "0.99 clears the seeded 0.95 threshold"
    link = conn.execute(
        "select catalog_item_id::text as catalog_item_id from catalog_source_links"
    ).fetchone()
    assert link["catalog_item_id"] == node
    # A second run sees the record linked and proposes nothing.
    assert ladder.reconcile(conn, "source_records")["proposals"] == 0
