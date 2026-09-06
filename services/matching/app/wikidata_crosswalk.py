"""Wikidata crosswalk and vernaculars (OVE-393, ADR-0026 D2, D4, D7).

Wikidata already holds the identifiers of Catalogue of Life, GBIF, World Flora
Online and EPPO side by side. Reading them turns most cross-source
reconciliation into identifier equality instead of name comparison, and the
same items carry the words gardeners actually use in Ukrainian, Bulgarian,
Russian and English.

This is an offline job. Nothing on a gardener's request path calls Wikidata:
the worker runs it, the results land in the source layer, and the graph is
enriched from there.

Two upstreams, both polite and serial, as Wikimedia's policy asks:

* the Query Service for identifiers, matched on the Catalogue of Life id our
  nodes already carry — exact and unambiguous, and far better than comparing
  names — with a taxon-name query for nodes that have no such id;
* the `wbgetentities` action API for labels and aliases, fifty items a call.

The User-Agent names OverGarden and its site; `WIKIDATA_CONTACT` adds a
contact address when the operator sets one, and nothing personal is sent
without it.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Iterable, Iterator, Sequence

from app.normalize_name import normalize_name

log = logging.getLogger("overgarden.wikidata_crosswalk")

WIKIDATA_SOURCE_SLUG = "wikidata"
WIKIDATA_SOURCE_NAME = "Wikidata"
WIKIDATA_SOURCE_CATEGORY = "crosswalk"
WIKIDATA_LICENSE = "CC0 1.0"
WIKIDATA_LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"
WIKIDATA_ATTRIBUTION = "Wikidata contributors, CC0 1.0"
WIKIDATA_PARSER_VERSION = "wikidata-crosswalk.v1"

SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
ENTITY_ENDPOINT = "https://www.wikidata.org/w/api.php"
SITE_URL = "https://over.garden"

# Verified against the live service on 2026-09-06 with Solanum lycopersicum
# (Q23501): col 4Y369, gbif 2930137, wfo wfo-0001029216, eppo LYPES.
PROPERTY_TAXON_NAME = "P225"
PROPERTY_COL_ID = "P10585"
PROPERTY_GBIF_ID = "P846"
PROPERTY_WFO_ID = "P7715"
PROPERTY_EPPO_CODE = "P3031"

VERNACULAR_LANGUAGES: tuple[str, ...] = ("uk", "bg", "ru", "en")
IDENTIFIER_SCHEMES: tuple[str, ...] = ("col", "gbif", "wfo", "eppo")

SPARQL_BATCH = 500
ENTITY_BATCH = 50
MIN_ALIAS_LENGTH = 3
MAX_ALIAS_LENGTH = 120
REQUEST_TIMEOUT_SECONDS = 60
# Wikimedia asks for serial requests from a single agent; this is the pause
# between them, not a retry backoff.
REQUEST_PAUSE_SECONDS = float(os.environ.get("WIKIDATA_REQUEST_PAUSE", "1"))


class WikidataCrosswalkError(RuntimeError):
    """A refusal worth stopping for: a malformed answer, or a refused query."""


@dataclass
class WikidataCrosswalkReceipt:
    source_slug: str = WIKIDATA_SOURCE_SLUG
    snapshot_id: str = ""
    nodes_considered: int = 0
    items_matched: int = 0
    identifiers_written: int = 0
    identifier_conflicts: int = 0
    aliases_accepted: int = 0
    aliases_review_needed: int = 0
    names_written: int = 0
    ambiguous_names: int = 0
    duration_seconds: float = 0.0
    requests: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "sourceSlug": self.source_slug,
            "snapshotId": self.snapshot_id,
            "nodesConsidered": self.nodes_considered,
            "itemsMatched": self.items_matched,
            "identifiersWritten": self.identifiers_written,
            "identifierConflicts": self.identifier_conflicts,
            "aliasesAccepted": self.aliases_accepted,
            "aliasesReviewNeeded": self.aliases_review_needed,
            "namesWritten": self.names_written,
            "ambiguousNames": self.ambiguous_names,
            "durationSeconds": round(self.duration_seconds, 3),
            "requests": self.requests,
        }


@dataclass
class WikidataItem:
    """One Wikidata item as this job uses it: identifiers and local names."""

    qid: str
    col_id: str | None = None
    gbif_id: str | None = None
    wfo_id: str | None = None
    eppo_code: str | None = None
    taxon_name: str | None = None
    labels: dict[str, str] = field(default_factory=dict)
    aliases: dict[str, list[str]] = field(default_factory=dict)

    def identifiers(self) -> dict[str, str | None]:
        return {
            "col": self.col_id,
            "gbif": self.gbif_id,
            "wfo": self.wfo_id,
            "eppo": self.eppo_code,
        }

    def payload(self) -> dict[str, Any]:
        return {
            "qid": self.qid,
            "taxonName": self.taxon_name,
            "identifiers": {k: v for k, v in self.identifiers().items() if v},
            "labels": self.labels,
            "aliases": self.aliases,
        }


def user_agent() -> str:
    """What Wikimedia's policy asks for: a product, a URL, and a contact."""
    contact = os.environ.get("WIKIDATA_CONTACT", "").strip()
    suffix = f"; {contact}" if contact else ""
    return f"OverGarden/1.0 (+{SITE_URL}{suffix})"


# ----------------------------------------------------------------------
# The upstream
# ----------------------------------------------------------------------


def fetch_json(url: str, *, receipt: WikidataCrosswalkReceipt) -> Any:
    request = urllib.request.Request(
        url,
        headers={"user-agent": user_agent(), "accept": "application/json"},
    )
    receipt.requests += 1
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:  # noqa: S310
        payload = response.read().decode("utf8")
    time.sleep(REQUEST_PAUSE_SECONDS)
    try:
        return json.loads(payload)
    except json.JSONDecodeError as error:
        raise WikidataCrosswalkError("wikidata answered something that is not JSON") from error


def build_identifier_query(*, col_ids: Sequence[str], names: Sequence[str]) -> str:
    """Identifiers for a batch, matched by Catalogue of Life id or taxon name."""
    if col_ids:
        values = " ".join(f'"{_escape(value)}"' for value in col_ids)
        subject = f"VALUES ?col {{ {values} }} ?item wdt:{PROPERTY_COL_ID} ?col ."
    elif names:
        values = " ".join(f'"{_escape(value)}"' for value in names)
        subject = (
            f"VALUES ?name {{ {values} }} ?item wdt:{PROPERTY_TAXON_NAME} ?name ."
        )
    else:
        raise WikidataCrosswalkError("a batch must carry ids or names")
    return (
        "SELECT ?item ?col ?gbif ?wfo ?eppo ?name WHERE { "
        f"{subject} "
        f"OPTIONAL {{ ?item wdt:{PROPERTY_COL_ID} ?col }} "
        f"OPTIONAL {{ ?item wdt:{PROPERTY_GBIF_ID} ?gbif }} "
        f"OPTIONAL {{ ?item wdt:{PROPERTY_WFO_ID} ?wfo }} "
        f"OPTIONAL {{ ?item wdt:{PROPERTY_EPPO_CODE} ?eppo }} "
        f"OPTIONAL {{ ?item wdt:{PROPERTY_TAXON_NAME} ?name }} "
        "}"
    )


def read_identifiers(
    query: str, *, receipt: WikidataCrosswalkReceipt, endpoint: str = SPARQL_ENDPOINT
) -> list[WikidataItem]:
    url = f"{endpoint}?{urllib.parse.urlencode({'query': query, 'format': 'json'})}"
    payload = fetch_json(url, receipt=receipt)
    bindings = (payload or {}).get("results", {}).get("bindings", [])
    items: dict[str, WikidataItem] = {}
    for binding in bindings:
        qid = _qid(_binding(binding, "item"))
        if not qid:
            continue
        item = items.setdefault(qid, WikidataItem(qid=qid))
        item.col_id = item.col_id or _binding(binding, "col")
        item.gbif_id = item.gbif_id or _binding(binding, "gbif")
        item.wfo_id = item.wfo_id or _binding(binding, "wfo")
        item.eppo_code = item.eppo_code or _binding(binding, "eppo")
        item.taxon_name = item.taxon_name or _binding(binding, "name")
    return list(items.values())


def read_labels(
    qids: Sequence[str],
    *,
    receipt: WikidataCrosswalkReceipt,
    endpoint: str = ENTITY_ENDPOINT,
) -> dict[str, tuple[dict[str, str], dict[str, list[str]]]]:
    """Labels and aliases in the four languages, fifty items a call."""
    found: dict[str, tuple[dict[str, str], dict[str, list[str]]]] = {}
    for batch in _chunks(qids, ENTITY_BATCH):
        url = f"{endpoint}?" + urllib.parse.urlencode(
            {
                "action": "wbgetentities",
                "ids": "|".join(batch),
                "props": "labels|aliases",
                "languages": "|".join(VERNACULAR_LANGUAGES),
                "format": "json",
            }
        )
        payload = fetch_json(url, receipt=receipt)
        for qid, entity in ((payload or {}).get("entities") or {}).items():
            labels = {
                language: str(value.get("value", ""))
                for language, value in (entity.get("labels") or {}).items()
                if value.get("value")
            }
            aliases = {
                language: [
                    str(alias.get("value", ""))
                    for alias in values
                    if alias.get("value")
                ]
                for language, values in (entity.get("aliases") or {}).items()
            }
            found[qid] = (labels, aliases)
    return found


# ----------------------------------------------------------------------
# The projection rules
# ----------------------------------------------------------------------


@dataclass
class AliasDecision:
    display_name: str
    locale: str
    status: str
    reason_codes: list[str]
    original: str


def decide_alias(
    value: str,
    *,
    language: str,
    scientific_names: Iterable[str],
    occurrences: int = 1,
) -> AliasDecision | None:
    """The automatic filters of ADR-0026 D7, applied to one Wikidata name.

    Accepted when the language is one this product speaks, the name is not a
    restatement of a scientific name, it is long enough to be a name at all,
    and it belongs to exactly one node. Anything else waits for the owner.

    Wikidata disambiguates with a trailing parenthetical — "томат (рослина)"
    is the plant, not a gardener's word — so that qualifier is dropped and the
    remainder judged on its own, under its own reason code.
    """
    original = value.strip()
    if not original:
        return None
    reason_codes: list[str] = []

    display_name = original
    if display_name.endswith(")") and "(" in display_name:
        display_name = display_name[: display_name.rindex("(")].strip()
        reason_codes.append("alias_disambiguator_stripped")
    if not display_name or len(display_name) > MAX_ALIAS_LENGTH:
        return None

    if language not in VERNACULAR_LANGUAGES:
        return AliasDecision(
            display_name, language, "review_needed", ["alias_language_outside_product"], original
        )
    if len(display_name) < MIN_ALIAS_LENGTH:
        return AliasDecision(
            display_name, language, "review_needed", [*reason_codes, "alias_too_short"], original
        )
    normalized = normalize_name(display_name)
    # A scientific name a node carries is written with its authority
    # ("Solanum lycopersicum L."), and Wikidata lists the bare binomial as an
    # English alias. The bare form is the same name without its authority, not
    # a word a gardener would say.
    scientific = {normalize_name(name) for name in scientific_names}
    if normalized in scientific or any(
        name.startswith(f"{normalized} ") for name in scientific
    ):
        return AliasDecision(
            display_name,
            language,
            "review_needed",
            [*reason_codes, "alias_equals_scientific_name"],
            original,
        )
    if occurrences != 1:
        return AliasDecision(
            display_name,
            language,
            "review_needed",
            [*reason_codes, "alias_on_several_nodes"],
            original,
        )
    return AliasDecision(
        display_name, language, "accepted", [*reason_codes, "alias_source_backed"], original
    )


# ----------------------------------------------------------------------
# Plumbing
# ----------------------------------------------------------------------


def _binding(binding: Any, key: str) -> str | None:
    value = (binding or {}).get(key)
    if not isinstance(value, dict):
        return None
    text = value.get("value")
    return str(text) if text else None


def _qid(uri: str | None) -> str | None:
    if not uri:
        return None
    return uri.rsplit("/", 1)[-1] or None


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _chunks(values: Sequence[str], size: int) -> Iterator[Sequence[str]]:
    for start in range(0, len(values), size):
        yield values[start : start + size]


def payload_digest(items: Sequence[WikidataItem]) -> str:
    """A snapshot's checksum: what this run actually read, in order."""
    digest = hashlib.sha256()
    for item in sorted(items, key=lambda entry: entry.qid):
        digest.update(json.dumps(item.payload(), sort_keys=True, ensure_ascii=False).encode("utf8"))
    return digest.hexdigest()


# ----------------------------------------------------------------------
# The graph
# ----------------------------------------------------------------------


SELECT_NODES_SQL = """
select
  item.id::text as id,
  item.canonical_name,
  (
    select identifier.value from catalog_item_identifiers as identifier
    where identifier.catalog_item_id = item.id and identifier.scheme = 'col'
    limit 1
  ) as col_id,
  exists (
    select 1 from catalog_item_identifiers as identifier
    where identifier.catalog_item_id = item.id and identifier.scheme = 'wikidata'
  ) as has_wikidata,
  coalesce((
    select array_agg(name.display_name)
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
  %s, %s, true, %s, %s::jsonb,
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

# `reason_codes` on this table is a closed set belonging to the alias
# *generator* (`cyrtranslit_forward` and its four siblings), so a source-backed
# decision cannot borrow it without a migration this task does not have. The
# decision goes where it belongs: `decision_reason_code` for the code the owner
# filters on, `projection_notes` for the whole trail including the name as
# Wikidata wrote it.
INSERT_ALIAS_SQL = """
insert into catalog_alias_projections (
  catalog_item_id, display_name, normalized_name, locale, script, alias_kind,
  status, source_slug, source_method, source_record_id, source_record_key,
  confidence, license, attribution_required, decision_reason_code,
  projection_notes
)
values (
  %s::uuid, %s, catalog_normalize_name(%s), %s, %s, 'vernacular_alias',
  %s, %s, 'source_backed', %s::uuid, %s,
  %s, %s, true, %s, %s
)
on conflict (catalog_item_id, normalized_name, locale, source_slug, source_method)
  do update set status = excluded.status,
                display_name = excluded.display_name,
                confidence = excluded.confidence,
                decision_reason_code = excluded.decision_reason_code,
                projection_notes = excluded.projection_notes,
                source_record_id = excluded.source_record_id,
                updated_at = now()
returning id::text as id
"""

INSERT_NAME_SQL = """
insert into catalog_item_names (
  catalog_item_id, display_name, normalized_name, locale, script, is_primary,
  name_type, assertion_id, weight
)
values (%s::uuid, %s, catalog_normalize_name(%s), %s, %s, false, 'vernacular', %s::uuid, 2)
on conflict do nothing
returning id::text as id
"""

ALIAS_OCCURRENCE_SQL = """
select count(distinct catalog_item_id)::int as nodes
from catalog_alias_projections
where normalized_name = catalog_normalize_name(%s) and locale = %s
"""

SCRIPTS_BY_LANGUAGE = {"uk": "cyrillic", "bg": "cyrillic", "ru": "cyrillic", "en": "latin"}


def crosswalk_wikidata(
    conn: Any,
    *,
    limit: int = 5_000,
    items: Sequence[WikidataItem] | None = None,
    sparql_endpoint: str = SPARQL_ENDPOINT,
    entity_endpoint: str = ENTITY_ENDPOINT,
) -> WikidataCrosswalkReceipt:
    """Enriches canonical nodes from Wikidata and returns the receipt.

    `items` replaces both upstreams for a test: everything below it is the
    same code the production run takes.
    """
    started = time.monotonic()
    receipt = WikidataCrosswalkReceipt()

    nodes = [dict(row) for row in conn.execute(SELECT_NODES_SQL, (limit,)).fetchall()]
    receipt.nodes_considered = len(nodes)
    if not nodes:
        receipt.duration_seconds = time.monotonic() - started
        return receipt

    fetched = (
        list(items)
        if items is not None
        else _read_upstream(nodes, receipt, sparql_endpoint, entity_endpoint)
    )
    if not fetched:
        receipt.duration_seconds = time.monotonic() - started
        log.info("wikidata_crosswalk %s", receipt.as_dict())
        return receipt

    snapshot_id = _insert_snapshot(conn, payload_digest(fetched))
    receipt.snapshot_id = snapshot_id

    by_col = {node["col_id"]: node for node in nodes if node.get("col_id")}
    by_name = _index_by_name(nodes)
    touched: list[str] = []

    for item in fetched:
        node = None
        if item.col_id and item.col_id in by_col:
            node = by_col[item.col_id]
        elif item.taxon_name:
            candidates = by_name.get(normalize_name(item.taxon_name), [])
            if len(candidates) == 1:
                node = candidates[0]
            elif len(candidates) > 1:
                receipt.ambiguous_names += 1
                continue
        if node is None:
            continue
        receipt.items_matched += 1
        _project_item(conn, node, item, snapshot_id, receipt)
        touched.append(node["id"])

    if touched:
        # A card whose names and identifiers changed is stale until the outbox
        # drains it; without this the page keeps the version it had for hours
        # (`readPublicVarietyPageByCatalogItemId` is `use cache`). The ids are
        # deduplicated first: one node can be matched by its identifier and by
        # its name in the same run, and the intent upsert refuses to touch one
        # row twice in a statement.
        conn.execute(
            "select catalog_record_card_intents(%s::uuid[])",
            (list(dict.fromkeys(touched)),),
        )

    receipt.duration_seconds = time.monotonic() - started
    log.info("wikidata_crosswalk %s", receipt.as_dict())
    return receipt


def _read_upstream(
    nodes: Sequence[dict[str, Any]],
    receipt: WikidataCrosswalkReceipt,
    sparql_endpoint: str,
    entity_endpoint: str,
) -> list[WikidataItem]:
    col_ids = [node["col_id"] for node in nodes if node.get("col_id")]
    found: list[WikidataItem] = []
    for batch in _chunks(col_ids, SPARQL_BATCH):
        found.extend(
            read_identifiers(
                build_identifier_query(col_ids=list(batch), names=[]),
                receipt=receipt,
                endpoint=sparql_endpoint,
            )
        )
    # Wikidata carries the Catalogue of Life id mostly on species, so a
    # higher taxon — Cucurbitales, Theria, Eukaryota — is found by its name or
    # not at all. Nodes the identifier pass missed are asked for by name, with
    # the nodes that never had a Catalogue of Life id.
    matched_col_ids = {item.col_id for item in found if item.col_id}
    names = [
        node["canonical_name"]
        for node in nodes
        if node.get("canonical_name")
        and (not node.get("col_id") or node["col_id"] not in matched_col_ids)
    ]
    for batch in _chunks(names, SPARQL_BATCH):
        found.extend(
            read_identifiers(
                build_identifier_query(col_ids=[], names=list(batch)),
                receipt=receipt,
                endpoint=sparql_endpoint,
            )
        )
    labels = read_labels(
        [item.qid for item in found], receipt=receipt, endpoint=entity_endpoint
    )
    for item in found:
        item.labels, item.aliases = labels.get(item.qid, ({}, {}))
    return found


def _index_by_name(nodes: Sequence[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Nodes by every scientific spelling they answer to, each node once.

    A node's `catalog_item_names` row usually repeats its canonical name, so
    counting appearances rather than nodes would make every node look like a
    homonym of itself and nothing would ever match by name.
    """
    index: dict[str, dict[str, dict[str, Any]]] = {}
    for node in nodes:
        for name in [node.get("canonical_name"), *(node.get("scientific_names") or [])]:
            if not name:
                continue
            index.setdefault(normalize_name(name), {})[str(node["id"])] = node
    return {key: list(nodes_by_id.values()) for key, nodes_by_id in index.items()}


def _project_item(
    conn: Any,
    node: dict[str, Any],
    item: WikidataItem,
    snapshot_id: str,
    receipt: WikidataCrosswalkReceipt,
) -> None:
    payload = item.payload()
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    record_id = _field(
        conn.execute(
            INSERT_RECORD_SQL,
            (
                snapshot_id,
                item.qid,
                encoded,
                hashlib.sha256(encoded.encode("utf8")).hexdigest(),
                json.dumps(
                    {
                        "identifiers": payload["identifiers"],
                        "labels": payload["labels"],
                        "aliases": payload["aliases"],
                    },
                    sort_keys=True,
                    ensure_ascii=False,
                ),
            ),
        ).fetchone(),
        "id",
    )
    assertion_id = _field(
        conn.execute(
            INSERT_ASSERTION_SQL,
            (WIKIDATA_SOURCE_SLUG, snapshot_id, record_id, ["wikidata_crosswalk"]),
        ).fetchone(),
        "id",
    )

    _write_identifiers(conn, node, item, assertion_id, receipt)
    _write_aliases(conn, node, item, record_id, assertion_id, receipt)


def _write_identifiers(
    conn: Any,
    node: dict[str, Any],
    item: WikidataItem,
    assertion_id: str,
    receipt: WikidataCrosswalkReceipt,
) -> None:
    wanted: list[tuple[str, str]] = [("wikidata", item.qid)]
    wanted.extend(
        (scheme, value)
        for scheme, value in item.identifiers().items()
        if value and scheme in IDENTIFIER_SCHEMES
    )
    for scheme, value in wanted:
        owner = _field(
            conn.execute(IDENTIFIER_OWNER_SQL, (scheme, value)).fetchone(), "id"
        )
        if owner and owner != node["id"]:
            # An identifier already on another node is a decision, never an
            # overwrite: the graph's uniqueness is what makes rung one work.
            queued = conn.execute(
                QUEUE_SOURCE_LINK_SQL,
                (
                    node["id"],
                    json.dumps(
                        {
                            "source_slug": WIKIDATA_SOURCE_SLUG,
                            "scheme": scheme,
                            "value": value,
                            "held_by_catalog_item_id": owner,
                        }
                    ),
                    ["wikidata_identifier_conflict"],
                    node["id"],
                ),
            ).fetchone()
            if queued is not None:
                receipt.identifier_conflicts += 1
            continue
        if owner == node["id"]:
            continue
        written = conn.execute(
            INSERT_IDENTIFIER_SQL, (node["id"], scheme, value, assertion_id)
        ).fetchone()
        if written is not None:
            receipt.identifiers_written += 1


def _write_aliases(
    conn: Any,
    node: dict[str, Any],
    item: WikidataItem,
    record_id: str,
    assertion_id: str,
    receipt: WikidataCrosswalkReceipt,
) -> None:
    scientific = list(node.get("scientific_names") or [])
    if node.get("canonical_name"):
        scientific.append(node["canonical_name"])

    candidates: list[tuple[str, str]] = []
    for language, label in (item.labels or {}).items():
        candidates.append((language, label))
    for language, values in (item.aliases or {}).items():
        candidates.extend((language, value) for value in values)

    seen: set[tuple[str, str]] = set()
    for language, value in candidates:
        decision = decide_alias(value, language=language, scientific_names=scientific)
        if decision is None:
            continue
        key = (decision.locale, normalize_name(decision.display_name))
        if key in seen:
            continue
        seen.add(key)

        if decision.status == "accepted":
            occurrences = _field(
                conn.execute(
                    ALIAS_OCCURRENCE_SQL, (decision.display_name, decision.locale)
                ).fetchone(),
                "nodes",
            )
            if occurrences and int(occurrences) > 0:
                # The same word already projects onto another node: two
                # organisms one gardener's word could mean is a decision.
                held = conn.execute(
                    """
                    select count(*)::int as other
                    from catalog_alias_projections
                    where normalized_name = catalog_normalize_name(%s)
                      and locale = %s and catalog_item_id <> %s::uuid
                    """,
                    (decision.display_name, decision.locale, node["id"]),
                ).fetchone()
                if held and int(_field(held, "other") or 0) > 0:
                    decision = AliasDecision(
                        decision.display_name,
                        decision.locale,
                        "review_needed",
                        [*decision.reason_codes, "alias_on_several_nodes"],
                        decision.original,
                    )

        script = SCRIPTS_BY_LANGUAGE.get(decision.locale, "und")
        conn.execute(
            INSERT_ALIAS_SQL,
            (
                node["id"],
                decision.display_name,
                decision.display_name,
                decision.locale,
                script,
                decision.status,
                WIKIDATA_SOURCE_SLUG,
                record_id,
                f"{item.qid}:{decision.locale}:{decision.original}"[:200],
                1 if decision.status == "accepted" else 0.5,
                WIKIDATA_LICENSE,
                decision.reason_codes[-1],
                f"{','.join(decision.reason_codes)} · wikidata {item.qid} · {decision.original}"[:500],
            ),
        )
        if decision.status == "accepted":
            receipt.aliases_accepted += 1
            written = conn.execute(
                INSERT_NAME_SQL,
                (
                    node["id"],
                    decision.display_name,
                    decision.display_name,
                    decision.locale,
                    script,
                    assertion_id,
                ),
            ).fetchone()
            if written is not None:
                receipt.names_written += 1
        else:
            receipt.aliases_review_needed += 1


def _insert_snapshot(conn: Any, digest: str) -> str:
    version = f"crosswalk {time.strftime('%Y-%m-%d')}"
    row = conn.execute(
        INSERT_SNAPSHOT_SQL,
        (
            WIKIDATA_SOURCE_SLUG,
            WIKIDATA_SOURCE_NAME,
            WIKIDATA_SOURCE_CATEGORY,
            version,
            "https://query.wikidata.org/sparql",
            WIKIDATA_LICENSE,
            WIKIDATA_LICENSE_URL,
            WIKIDATA_ATTRIBUTION,
            '["raw_snapshot", "canonical_product_projection"]',
            WIKIDATA_PARSER_VERSION,
            digest,
        ),
    ).fetchone()
    if row is None:
        raise WikidataCrosswalkError("the wikidata snapshot row was not written")
    return str(_field(row, "id"))


def _field(row: Any, name: str) -> Any:
    if row is None:
        return None
    if isinstance(row, dict):
        return row.get(name)
    return row[0]
