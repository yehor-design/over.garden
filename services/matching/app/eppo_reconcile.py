"""EPPO onto the graph (OVE-394, ADR-0026 D11).

EPPO is the one source in this slice that is different in kind. Catalogue of
Life gives classification and accepted names; Wikidata gives crosswalk
identifiers and the words gardeners use. Neither carries what a gardener
actually asks about a pest: what it attacks, and whether it is here. EPPO
carries both, plus a stable code per organism that the crosswalk already put on
many of our nodes.

This job is entirely local. Two observed captures already sit in the source
layer, immutable and digest-covered:

* the first (2026-09-03) holds overview, names and taxonomy;
* the second (OVE-394) holds hosts, distribution and categorization for the
  same identifiers.

Nothing here calls api.eppo.int. The captures are read, each identifier is put
through the deterministic ladder, and what matches becomes graph rows.

The ladder, in the order ADR-0026 D4 fixes:

1. the ``eppo`` identifier the Wikidata crosswalk already wrote — identifier
   equality, never a name comparison;
2. the scientific name with its authorship, within the same kingdom;
3. the canonical name within the same kingdom and rank.

A taxon EPPO has and Catalogue of Life lacks — viruses and viroids above all,
2,151 of them in the capture — becomes its own node built from the EPPO
taxonomy, with a kingdom and no ``col`` identifier. Everything ambiguous
becomes a ``source_link`` queue item ordered by impact. Curation never blocks a
gardener (D5): a node that fails to link keeps working, it simply carries no
EPPO facts yet.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Sequence

from app.normalize_name import normalize_name

log = logging.getLogger("overgarden.eppo_reconcile")

EPPO_SOURCE_SLUG = "eppo-codes"
# The wording the capture itself writes on its snapshot row.
EPPO_ATTRIBUTION = "EPPO Codes, EPPO Codes Open Data Licence."
EPPO_PARSER_VERSION = "eppo-reconcile.v1"

# What the graph calls each EPPO kingdom. EPPO names two of them differently;
# everything else is the same word. An EPPO kingdom outside this map leaves the
# node without one rather than guessing, and the ladder then refuses rung three.
KINGDOM_BY_EPPO_NAME: dict[str, str] = {
    "Plantae": "Plantae",
    "Animalia": "Animalia",
    "Fungi": "Fungi",
    "Bacteria": "Bacteria",
    "Chromista": "Chromista",
    "Archaea": "Archaea",
    "Protista": "Protozoa",
    "Viruses and viroids": "Viruses",
}

# EPPO's taxonomy levels, lower case, onto the closed rank set of migration
# 0054. EPPO publishes a handful of ranks the graph does not model; those
# become `unranked`, which is a rank the graph has.
RANK_BY_EPPO_TYPE: dict[str, str] = {
    "kingdom": "kingdom",
    "phylum": "phylum",
    "division": "phylum",
    "subphylum": "phylum",
    "class": "class",
    "subclass": "class",
    "order": "order",
    "suborder": "order",
    "family": "family",
    "subfamily": "subfamily",
    "tribe": "tribe",
    "genus": "genus",
    "subgenus": "subgenus",
    "section": "section",
    "species": "species",
    "subspecies": "subspecies",
    "variety": "variety",
    "form": "form",
}

# EPPO's host classes onto the closed set of migration 0054. The `class_id`
# integers are the stable half of the vocabulary; the labels are matched in
# lower case as a fallback, because EPPO has changed label wording before
# without changing an id.
HOST_CLASS_BY_ID: dict[str, str] = {
    "1": "major_host",
    "2": "host",
    "3": "wild_weed_host",
    "4": "incidental",
    "5": "experimental",
    "6": "artificial",
}
HOST_CLASS_BY_LABEL: dict[str, str] = {
    "major host": "major_host",
    "host": "host",
    "wild/weed": "wild_weed_host",
    "wild / weed": "wild_weed_host",
    "wild or weed": "wild_weed_host",
    "incidental": "incidental",
    "experimental": "experimental",
    "artificial": "artificial",
    "alternate": "host",
    "alternate host": "host",
}

# EPPO's pest status onto the four words a card may say. The verbatim status is
# kept next to it: `value` is what EPPO wrote, `value_normalized` is what the
# product is allowed to reason about (ADR-0026 D11).
PRESENCE_BY_STATUS_PREFIX: tuple[tuple[str, str], ...] = (
    ("present", "present"),
    ("absent", "absent"),
    ("transient", "transient"),
    ("intercepted", "absent"),
    ("eradicated", "absent"),
    ("no longer present", "absent"),
    ("unreliable", "unknown"),
    ("invalid", "unknown"),
    ("last reported", "unknown"),
)

# The languages the review ledger accepts from a source (ADR-0026 D2).
VERNACULAR_LANGUAGES: tuple[str, ...] = ("uk", "bg", "ru", "en")
SCRIPTS_BY_LANGUAGE = {
    "uk": "cyrillic",
    "bg": "cyrillic",
    "ru": "cyrillic",
    "en": "latin",
}
SCIENTIFIC_LANGUAGE = "la"

# The ranks a node may be created for. EPPO's 121,777 active identifiers are
# 98,081 species and 23,696 higher taxa; a genus or a family that the backbone
# does not already hold is the backbone's gap to fill, not EPPO's, and creating
# one here would duplicate a Catalogue of Life node under a second authority.
# A species EPPO names and the backbone lacks is different: viruses, viroids and
# the animal pests our scoped Catalogue of Life ingest deliberately leaves out
# have nowhere else to come from, and `pest_of` needs both ends.
CREATABLE_RANKS: frozenset[str] = frozenset(
    {"species", "subspecies", "variety", "subvariety", "form"}
)

MIN_NAME_LENGTH = 2
MAX_NAME_LENGTH = 200
MAX_RECORDS = 200_000
# How many identifiers one read holds in memory at a time.
READ_BATCH_CODES = 2_000
QUEUE_IMPACT_FLOOR = 1


class EppoReconcileError(RuntimeError):
    """A refusal that must stop the job rather than write a half-linked graph."""


@dataclass
class EppoReconcileReceipt:
    """What one run did, in the words the issue asks for."""

    captures: list[str] = field(default_factory=list)
    records_read: int = 0
    linked_by_identifier: int = 0
    linked_by_scientific_name: int = 0
    linked_by_canonical_name: int = 0
    linked_by_col_usage: int = 0
    nodes_created: int = 0
    queued_for_curation: int = 0
    identifiers_written: int = 0
    names_written: int = 0
    relations_written: int = 0
    distribution_facts_written: int = 0
    categorization_facts_written: int = 0
    unresolved_hosts: int = 0
    active_codes: int = 0
    active_codes_linked: int = 0
    observed_ended_at: str | None = None
    duration_ms: int = 0

    @property
    def linked(self) -> int:
        return (
            self.linked_by_identifier
            + self.linked_by_scientific_name
            + self.linked_by_canonical_name
            + self.linked_by_col_usage
            + self.nodes_created
        )

    @property
    def automatic_link_rate(self) -> float:
        if self.active_codes == 0:
            return 0.0
        return round(self.active_codes_linked / self.active_codes, 4)

    def as_dict(self) -> dict[str, Any]:
        return {
            "class": "eppo_reconcile",
            "captures": self.captures,
            "observedEndedAt": self.observed_ended_at,
            "recordsRead": self.records_read,
            "linkedByIdentifier": self.linked_by_identifier,
            "linkedByScientificName": self.linked_by_scientific_name,
            "linkedByCanonicalName": self.linked_by_canonical_name,
            "linkedByColUsage": self.linked_by_col_usage,
            "nodesCreated": self.nodes_created,
            "queuedForCuration": self.queued_for_curation,
            "identifiersWritten": self.identifiers_written,
            "namesWritten": self.names_written,
            "relationsWritten": self.relations_written,
            "distributionFactsWritten": self.distribution_facts_written,
            "categorizationFactsWritten": self.categorization_facts_written,
            "unresolvedHosts": self.unresolved_hosts,
            "activeCodes": self.active_codes,
            "activeCodesLinked": self.active_codes_linked,
            "automaticLinkRate": self.automatic_link_rate,
            "durationMs": self.duration_ms,
        }


# ----------------------------------------------------------------------
# Reading one identifier out of the captures
# ----------------------------------------------------------------------


@dataclass
class EppoTaxon:
    """Everything both captures hold about one EPPO code."""

    eppo_code: str
    source_record_id: str | None = None
    source_snapshot_id: str | None = None
    overview: dict[str, Any] = field(default_factory=dict)
    names: list[dict[str, Any]] = field(default_factory=list)
    taxonomy: list[dict[str, Any]] = field(default_factory=list)
    hosts: list[dict[str, Any]] = field(default_factory=list)
    distribution: list[dict[str, Any]] = field(default_factory=list)
    categorization: list[dict[str, Any]] = field(default_factory=list)

    @property
    def is_active(self) -> bool:
        return bool(self.overview.get("is_active"))

    @property
    def preferred_name(self) -> str | None:
        value = self.overview.get("prefname")
        if isinstance(value, str) and value.strip():
            return value.strip()
        for row in self.names:
            if row.get("preferred") and isinstance(row.get("fullname"), str):
                return str(row["fullname"]).strip()
        return None

    @property
    def authorship(self) -> str | None:
        for row in self.names:
            if row.get("preferred") and isinstance(row.get("author"), str):
                author = row["author"].strip()
                return author or None
        return None

    @property
    def kingdom(self) -> str | None:
        for row in self.taxonomy:
            if str(row.get("type", "")).lower() == "kingdom":
                return KINGDOM_BY_EPPO_NAME.get(str(row.get("prefname") or "").strip())
        return None

    @property
    def rank(self) -> str | None:
        """The rank of the deepest level EPPO gives, which is this taxon's own."""
        deepest: dict[str, Any] | None = None
        for row in self.taxonomy:
            level = row.get("level")
            if not isinstance(level, int):
                continue
            if deepest is None or level > int(deepest.get("level") or 0):
                deepest = row
        if deepest is None:
            return None
        if str(deepest.get("eppocode") or "") != self.eppo_code:
            # EPPO stops at the parent for some taxa; inferring our own rank
            # from a parent's would be a guess, and rung three compares ranks.
            return None
        return RANK_BY_EPPO_TYPE.get(str(deepest.get("type") or "").lower())

    def vernaculars(self) -> list[tuple[str, str]]:
        """(locale, display name) for the four languages the ledger accepts."""
        out: list[tuple[str, str]] = []
        seen: set[tuple[str, str]] = set()
        for row in self.names:
            language = str(row.get("lang_iso") or "").lower()
            if language not in VERNACULAR_LANGUAGES:
                continue
            value = row.get("fullname")
            if not isinstance(value, str):
                continue
            display = value.strip()
            if not (MIN_NAME_LENGTH <= len(display) <= MAX_NAME_LENGTH):
                continue
            key = (language, normalize_name(display))
            if key in seen:
                continue
            seen.add(key)
            out.append((language, display))
        return out


def canonical_name_of(scientific_name: str) -> str:
    """The binomial inside a scientific name, without its authorship.

    EPPO writes "Solanum lycopersicum"; a checklist stores the canonical name
    and the authored scientific name in different columns. Taking the first two
    tokens when the second is lower case is the shape of every binomial and of
    nothing else here, and what it produces is only ever compared for exact
    equality.
    """
    tokens = [token for token in scientific_name.split() if token]
    if len(tokens) < 2:
        return scientific_name.strip()
    genus, epithet = tokens[0], tokens[1]
    if not epithet.isalpha() or not epithet.islower():
        return genus
    return f"{genus} {epithet}"


def normalized_presence(status: Any) -> str:
    """EPPO's pest status as one of the four words a card may reason about."""
    text = str(status or "").strip().lower()
    if not text:
        return "unknown"
    for prefix, presence in PRESENCE_BY_STATUS_PREFIX:
        if text.startswith(prefix):
            return presence
    return "unknown"


def host_class(row: dict[str, Any]) -> str:
    """One EPPO host row's class, on the closed set migration 0054 fixed."""
    class_id = row.get("class_id")
    if class_id is not None:
        mapped = HOST_CLASS_BY_ID.get(str(class_id).strip())
        if mapped:
            return mapped
    label = str(row.get("class_label") or "").strip().lower()
    return HOST_CLASS_BY_LABEL.get(label, "unknown")


def region_code(row: dict[str, Any]) -> str | None:
    """ISO 3166-1, or 3166-2 where EPPO names a sub-national unit.

    ADR-0026 D11 keeps the product at country level; the source layer still
    records what EPPO published, because a constraint that pins an observation
    to policy stops recording reality.
    """
    country = str(row.get("country_iso") or "").strip().upper()
    if len(country) != 2 or not country.isalpha():
        return None
    state = str(row.get("state_id") or "").strip().upper()
    if state and state != country and 1 <= len(state) <= 3 and state.isalnum():
        return f"{country}-{state}"
    return country


def country_of(row: dict[str, Any]) -> str | None:
    country = str(row.get("country_iso") or "").strip().upper()
    if len(country) != 2 or not country.isalpha():
        return None
    return country


# ----------------------------------------------------------------------
# The graph
# ----------------------------------------------------------------------


COMPLETED_CAPTURES_SQL = """
select id::text as id,
       source_snapshot_id::text as source_snapshot_id,
       observed_ended_at
from catalog_source_capture_runs
where source_slug = %s
  and state = 'completed'
order by observed_ended_at
"""

CAPTURED_TAXA_SQL = """
select unit.eppo_code,
       unit.endpoint_class,
       unit.raw_payload
from catalog_source_capture_units as unit
where unit.capture_id = any(%s::uuid[])
  and unit.unit_kind = 'taxon_endpoint'
  and unit.state in ('captured', 'source_only')
  and unit.raw_payload is not null
  and unit.eppo_code = any(%s::text[])
order by unit.eppo_code, unit.endpoint_class
"""

# Across every selected capture, not one: which run holds the overview for an
# identifier is the captures' business, not this job's.
ACTIVE_CODES_SQL = """
select distinct unit.eppo_code
from catalog_source_capture_units as unit
where unit.capture_id = any(%s::uuid[])
  and unit.endpoint_class = 'taxon_overview'
  and jsonb_typeof(unit.raw_payload) = 'object'
  and (unit.raw_payload->>'is_active')::boolean is true
order by unit.eppo_code
limit %s
"""

SOURCE_RECORD_SQL = """
select record.id::text as id,
       record.source_snapshot_id::text as source_snapshot_id
from catalog_source_records as record
where record.source_snapshot_id = any(%s::uuid[])
  and record.source_record_id = %s
order by record.created_at desc
limit 1
"""

IDENTIFIER_OWNER_SQL = """
select catalog_item_id::text as id
from catalog_item_identifiers
where scheme = 'eppo' and value = %s
"""

SCIENTIFIC_NAME_MATCH_SQL = """
select distinct item.id::text as id
from catalog_item_names as name
join catalog_items as item on item.id = name.catalog_item_id
where name.normalized_name = catalog_normalize_name(%s)
  and name.name_type in ('scientific_accepted', 'scientific_synonym')
  and item.identity_state = 'active'
  and item.merged_into_catalog_item_id is null
  and item.node_kind = 'taxon'
  and (%s::text is null or item.kingdom is null or item.kingdom = %s::text)
  and (
    %s::text is null
    or name.authorship is null
    or catalog_normalize_name(name.authorship) = catalog_normalize_name(%s)
  )
limit 3
"""

# The backbone's own checklist, which holds millions of names the graph has no
# node for yet. Two lookups rather than one `or`: `normalized_scientific_name`
# has its own btree, and `normalized_name` is served by a prefix index whose
# `text_pattern_ops` class answers `like` but not `=`, so a wildcard-free
# `like` is that equality (OVE-392 built both).
COL_USAGE_BY_SCIENTIFIC_NAME_SQL = """
select usage.col_id
from catalog_source_col_usages as usage
where usage.source_snapshot_id = catalog_col_current_snapshot()
  and usage.status in ('accepted', 'provisionally_accepted')
  and usage.normalized_scientific_name = catalog_normalize_name(%s)
  and (%s::text is null or usage.kingdom is null or usage.kingdom = %s::text)
limit 3
"""

COL_USAGE_BY_CANONICAL_NAME_SQL = """
select usage.col_id
from catalog_source_col_usages as usage
where usage.source_snapshot_id = catalog_col_current_snapshot()
  and usage.status in ('accepted', 'provisionally_accepted')
  and usage.normalized_name like catalog_normalize_name(%s)
  and (%s::text is null or usage.kingdom is null or usage.kingdom = %s::text)
limit 3
"""

ENSURE_COL_NODE_SQL = """
select catalog_col_ensure_node(%s, %s::uuid)::text as id
"""

CANONICAL_NAME_MATCH_SQL = """
select item.id::text as id
from catalog_items as item
where item.normalized_name = catalog_normalize_name(%s)
  and item.identity_state = 'active'
  and item.merged_into_catalog_item_id is null
  and item.node_kind = 'taxon'
  and (%s::text is null or item.kingdom is null or item.kingdom = %s::text)
  and (%s::text is null or item.rank is null or item.rank = %s::text)
limit 3
"""

INSERT_ASSERTION_SQL = """
insert into catalog_source_assertions (
  source_slug, source_snapshot_id, source_record_id, rights_class, confidence,
  decision, reason_codes
)
values (%s, %s::uuid, %s::uuid, 'source_public', 1, 'automatic', %s::text[])
returning id::text as id
"""

INSERT_IDENTIFIER_SQL = """
insert into catalog_item_identifiers (catalog_item_id, scheme, value, assertion_id)
values (%s::uuid, 'eppo', %s, %s::uuid)
on conflict (scheme, value) do nothing
returning id::text as id
"""

INSERT_SOURCE_LINK_SQL = """
insert into catalog_source_links (
  catalog_item_id, source_record_id, source_slug, source_record_key,
  projection_kind, assertion_id
)
values (%s::uuid, %s::uuid, %s, %s, 'canonical_item', %s::uuid)
on conflict (catalog_item_id, source_record_id) do nothing
returning id::text as id
"""

INSERT_NAME_SQL = """
insert into catalog_item_names (
  catalog_item_id, display_name, normalized_name, locale, script, is_primary,
  name_type, assertion_id, weight
)
values (%s::uuid, %s, catalog_normalize_name(%s), %s, %s, false, %s, %s::uuid, 2)
on conflict do nothing
returning id::text as id
"""

INSERT_PRIMARY_NAME_SQL = """
insert into catalog_item_names (
  catalog_item_id, display_name, normalized_name, locale, script, is_primary,
  name_type, authorship, assertion_id, weight
)
values (
  %s::uuid, left(%s, 120), catalog_normalize_name(left(%s, 120)), 'la', 'latin',
  true, 'scientific_accepted', left(%s, 200), %s::uuid, 5
)
on conflict do nothing
returning id::text as id
"""

INSERT_RELATION_SQL = """
insert into catalog_item_relations (
  from_catalog_item_id, to_catalog_item_id, relation_type, host_class, assertion_id
)
values (%s::uuid, %s::uuid, 'pest_of', %s, %s::uuid)
on conflict (from_catalog_item_id, to_catalog_item_id, relation_type, assertion_id)
  do nothing
returning id::text as id
"""

DELETE_FACTS_SQL = """
delete from catalog_item_facts as fact
using catalog_source_assertions as assertion
where fact.assertion_id = assertion.id
  and fact.catalog_item_id = %s::uuid
  and fact.predicate = %s
  and assertion.source_slug = %s
"""

DELETE_RELATIONS_SQL = """
delete from catalog_item_relations as relation
using catalog_source_assertions as assertion
where relation.assertion_id = assertion.id
  and relation.from_catalog_item_id = %s::uuid
  and relation.relation_type = 'pest_of'
  and assertion.source_slug = %s
"""

INSERT_FACT_SQL = """
insert into catalog_item_facts (
  catalog_item_id, predicate, region_code, value, value_normalized, qualifiers,
  assertion_id
)
values (%s::uuid, %s, %s, %s, %s, %s::jsonb, %s::uuid)
returning id::text as id
"""

# The same shape `catalog_col_ensure_node` writes, so a node EPPO contributes
# is indistinguishable from a Catalogue of Life one everywhere downstream: the
# card, the picker and the ladder all read these columns. `source_id` names the
# capture that produced it, which is what makes the row traceable to bytes.
INSERT_NODE_SQL = """
insert into catalog_items (
  canonical_name, catalog_kind, normalized_name, public_slug, status, source,
  source_id, locale, node_kind, kingdom, rank, identity_state,
  content_updated_at
)
values (
  left(%s, 120), 'species', catalog_normalize_name(left(%s, 120)),
  case
    when %s in ('species', 'subspecies', 'variety', 'subvariety', 'form')
    then catalog_col_free_slug(catalog_col_slug(left(%s, 120)))
  end,
  'seeded', 'species_backbone', 'eppo-global-database:' || %s, 'la',
  'taxon', %s, %s, 'active', now()
)
returning id::text as id
"""

QUEUE_SOURCE_LINK_SQL = """
insert into catalog_curation_queue (
  item_type, subject_catalog_item_id, subject_label, proposal, confidence,
  reasons, impact_score, state
)
select 'source_link', %s::uuid, %s, %s::jsonb, %s, %s::text[], %s, 'open'
where not exists (
  select 1 from catalog_curation_queue as open_item
  where open_item.item_type = 'source_link'
    and open_item.state in ('open', 'auto_applied', 'accepted')
    and open_item.proposal->>'source_record_key' = %s
)
returning id::text as id
"""

RECOMPUTE_WEIGHT_SQL = "select catalog_recompute_search_weight()"

# An assertion nothing points at is a row that says a source claimed something
# and then names nothing it claimed. A second run over 121,777 identifiers
# whose identifiers and names are all already written would otherwise add a
# quarter of a million of them and never remove one.
DELETE_UNREFERENCED_ASSERTIONS_FOR_RECORD_SQL = """
delete from catalog_source_assertions as assertion
where assertion.source_slug = %s
  and assertion.source_record_id = %s::uuid
  and not exists (select 1 from catalog_item_identifiers as i where i.assertion_id = assertion.id)
  and not exists (select 1 from catalog_item_names as n where n.assertion_id = assertion.id)
  and not exists (select 1 from catalog_item_facts as f where f.assertion_id = assertion.id)
  and not exists (select 1 from catalog_item_relations as r where r.assertion_id = assertion.id)
  and not exists (select 1 from catalog_source_links as l where l.assertion_id = assertion.id)
"""

DELETE_UNREFERENCED_ASSERTION_SQL = """
delete from catalog_source_assertions as assertion
where assertion.id = %s::uuid
  and not exists (select 1 from catalog_item_identifiers as i where i.assertion_id = assertion.id)
  and not exists (select 1 from catalog_item_names as n where n.assertion_id = assertion.id)
  and not exists (select 1 from catalog_item_facts as f where f.assertion_id = assertion.id)
  and not exists (select 1 from catalog_item_relations as r where r.assertion_id = assertion.id)
  and not exists (select 1 from catalog_source_links as l where l.assertion_id = assertion.id)
"""


def _field(row: Any, name: str) -> Any:
    if row is None:
        return None
    if isinstance(row, dict):
        return row.get(name)
    return row[0]


def _rows(cursor: Any) -> list[Any]:
    return list(cursor.fetchall() or [])


def read_completed_captures(
    conn: Any, only: Sequence[str] | None = None
) -> list[dict[str, Any]]:
    """The completed EPPO captures, or exactly the ones the caller named.

    A scratch database accumulates fixture captures beside the real ones, and a
    fixture's three toy identifiers are not something to reconcile onto the
    graph. Naming the captures is how a rehearsal stays honest; production has
    only the two and needs no list.
    """
    rows = _rows(conn.execute(COMPLETED_CAPTURES_SQL, (EPPO_SOURCE_SLUG,)))
    captures: list[dict[str, Any]] = []
    wanted = set(only or ())
    for row in rows:
        capture_id = str(_field(row, "id"))
        if wanted and capture_id not in wanted:
            continue
        captures.append(
            {
                "id": capture_id,
                "source_snapshot_id": str(_field(row, "source_snapshot_id")),
                "observed_ended_at": _field(row, "observed_ended_at"),
            }
        )
    if not captures:
        raise EppoReconcileError(
            "no completed EPPO capture is present in this database"
        )
    missing = wanted - {capture["id"] for capture in captures}
    if missing:
        raise EppoReconcileError(f"capture not completed: {sorted(missing)}")
    return captures


def read_active_codes(conn: Any, capture_ids: Sequence[str], limit: int) -> list[str]:
    return [
        str(_field(row, "eppo_code"))
        for row in _rows(conn.execute(ACTIVE_CODES_SQL, (list(capture_ids), limit)))
    ]


def read_taxa(
    conn: Any, capture_ids: Sequence[str], codes: Sequence[str]
) -> dict[str, EppoTaxon]:
    """Both captures' units for the given identifiers, assembled per code."""
    taxa: dict[str, EppoTaxon] = {}
    rows = _rows(conn.execute(CAPTURED_TAXA_SQL, (list(capture_ids), list(codes))))
    for row in rows:
        code = str(_field(row, "eppo_code"))
        endpoint_class = str(_field(row, "endpoint_class"))
        payload = _field(row, "raw_payload")
        if isinstance(payload, str):
            payload = json.loads(payload)
        taxon = taxa.setdefault(code, EppoTaxon(eppo_code=code))
        objects = (
            [entry for entry in payload if isinstance(entry, dict)]
            if isinstance(payload, list)
            else []
        )
        if endpoint_class == "taxon_overview" and isinstance(payload, dict):
            taxon.overview = payload
        elif endpoint_class == "taxon_names":
            taxon.names = objects
        elif endpoint_class == "taxon_taxonomy":
            taxon.taxonomy = objects
        elif endpoint_class == "taxon_hosts":
            taxon.hosts = objects
        elif endpoint_class == "taxon_distribution":
            taxon.distribution = objects
        elif endpoint_class == "taxon_categorization":
            taxon.categorization = objects
    return taxa


@dataclass(frozen=True)
class LinkOutcome:
    """Where one EPPO identifier landed, and by which rung."""

    catalog_item_id: str | None
    rule: str | None
    ambiguous_ids: tuple[str, ...] = ()


def climb_eppo_ladder(
    conn: Any, taxon: EppoTaxon, assertion_id: str | None = None
) -> LinkOutcome:
    """The identifier, then the two names, then the checklist itself.

    A rung that finds more than one candidate does not fall through to a looser
    one: a looser comparison cannot resolve an ambiguity a stricter one found.
    It stops, and the identifier goes to the queue with both candidates named.

    The last rung reaches past the graph into `catalog_source_col_usages` and
    materializes what it finds, so a taxon Catalogue of Life knows arrives as a
    backbone node rather than as a question for the owner. It needs an
    assertion to attribute that node to, which is why one is passed in.
    """
    owner = _field(
        conn.execute(IDENTIFIER_OWNER_SQL, (taxon.eppo_code,)).fetchone(), "id"
    )
    if owner:
        return LinkOutcome(str(owner), "eppo_identifier")

    name = taxon.preferred_name
    if not name:
        return LinkOutcome(None, None)
    kingdom = taxon.kingdom
    authorship = taxon.authorship

    scientific = [
        str(_field(row, "id"))
        for row in _rows(
            conn.execute(
                SCIENTIFIC_NAME_MATCH_SQL,
                (name, kingdom, kingdom, authorship, authorship),
            )
        )
    ]
    if len(scientific) == 1:
        return LinkOutcome(scientific[0], "scientific_name")
    if len(scientific) > 1:
        return LinkOutcome(None, None, tuple(scientific))

    rank = taxon.rank
    canonical = [
        str(_field(row, "id"))
        for row in _rows(
            conn.execute(CANONICAL_NAME_MATCH_SQL, (name, kingdom, kingdom, rank, rank))
        )
    ]
    if len(canonical) == 1:
        return LinkOutcome(canonical[0], "canonical_name")
    if len(canonical) > 1:
        return LinkOutcome(None, None, tuple(canonical))

    # The backbone's checklist, not only the nodes built from it. Catalogue of
    # Life holds millions of names the graph has no node for yet, and 23,696 of
    # EPPO's 121,777 active identifiers are genera and families that no node
    # carries. Materializing one through `catalog_col_ensure_node` gives it the
    # backbone's classification and a `col` identifier — the right home for a
    # taxon Catalogue of Life knows, and far better than a node invented from
    # EPPO alone (ADR-0026 D2).
    if assertion_id:
        usages = [
            str(_field(row, "col_id"))
            for row in _rows(
                conn.execute(COL_USAGE_BY_SCIENTIFIC_NAME_SQL, (name, kingdom, kingdom))
            )
        ]
        if not usages:
            usages = [
                str(_field(row, "col_id"))
                for row in _rows(
                    conn.execute(
                        COL_USAGE_BY_CANONICAL_NAME_SQL,
                        (canonical_name_of(name), kingdom, kingdom),
                    )
                )
            ]
        if len(usages) > 1:
            return LinkOutcome(None, None)
        if len(usages) == 1:
            # Two statements: the function inserts rows the calling statement's
            # snapshot cannot see, so its result is read back.
            ensured = _field(
                conn.execute(ENSURE_COL_NODE_SQL, (usages[0], assertion_id)).fetchone(),
                "id",
            )
            if ensured:
                return LinkOutcome(str(ensured), "col_usage")

    return LinkOutcome(None, None)


def _drop_unreferenced_assertion(conn: Any, assertion_id: str) -> None:
    """Remove an assertion this run created and then found nothing to say."""
    conn.execute(DELETE_UNREFERENCED_ASSERTION_SQL, (assertion_id,))


def _drop_unreferenced_assertions_for_record(
    conn: Any, source_record_id: str | None
) -> None:
    """Remove this source's assertions for one record that now say nothing.

    Replacing a fact orphans the assertion the *previous* run wrote for it, so
    cleaning only this run's own assertion would still grow the table once per
    run. The scope is one source and one record, so nothing another source or
    a curator wrote is touched.
    """
    if not source_record_id:
        return
    conn.execute(
        DELETE_UNREFERENCED_ASSERTIONS_FOR_RECORD_SQL,
        (EPPO_SOURCE_SLUG, source_record_id),
    )


def _insert_assertion(
    conn: Any,
    *,
    snapshot_id: str,
    record_id: str | None,
    reasons: Sequence[str],
) -> str:
    row = conn.execute(
        INSERT_ASSERTION_SQL,
        (EPPO_SOURCE_SLUG, snapshot_id, record_id, list(reasons)),
    ).fetchone()
    if row is None:
        raise EppoReconcileError("the EPPO assertion row was not written")
    return str(_field(row, "id"))


def reconcile_eppo(
    conn: Any,
    *,
    limit: int = MAX_RECORDS,
    recompute_weights: bool = True,
    capture_ids: Sequence[str] | None = None,
) -> EppoReconcileReceipt:
    """Put both captures onto the graph and return what it did.

    One transaction per identifier, not one for the run. The worker hands its
    handlers an autocommit connection, so a run wrapped in a single transaction
    would be one the worker never actually opens — and on a one-gigabyte
    managed database a transaction holding 129,214 identifiers' worth of new
    rows is the wrong shape anyway. An identifier is the honest unit: its
    ladder decision, its identifier row, its names and its facts land together
    or not at all, and a run interrupted halfway leaves whole taxa behind it
    rather than half of one. Everything here is idempotent, so the next run
    finishes what this one started.
    """
    started_at = time.monotonic()
    receipt = EppoReconcileReceipt()
    captures = read_completed_captures(conn, capture_ids)
    receipt.captures = [capture["id"] for capture in captures]
    snapshot_ids = [capture["source_snapshot_id"] for capture in captures]
    ended = [
        capture["observed_ended_at"]
        for capture in captures
        if capture["observed_ended_at"]
    ]
    if ended:
        latest = max(ended)
        receipt.observed_ended_at = getattr(latest, "isoformat", lambda: str(latest))()

    codes = read_active_codes(conn, receipt.captures, limit)
    receipt.active_codes = len(codes)

    # Read in batches. All 129,214 identifiers at once would hold every
    # captured payload in memory — the names of one taxon alone can be sixty
    # rows — and the job would die on the worker long before it wrote a row.
    node_by_code: dict[str, str] = {}
    pending_facts: list[str] = []
    for start in range(0, len(codes), READ_BATCH_CODES):
        batch = codes[start : start + READ_BATCH_CODES]
        batch_taxa = read_taxa(conn, receipt.captures, batch)
        receipt.records_read += len(batch_taxa)

        # A code is only usable as a host target once its own node is known, so
        # linking is one pass and the facts that reference other nodes another.
        for code in batch:
            taxon = batch_taxa.get(code)
            if taxon is None:
                continue
            record = conn.execute(SOURCE_RECORD_SQL, (snapshot_ids, code)).fetchone()
            taxon.source_record_id = _field(record, "id") if record else None
            taxon.source_snapshot_id = (
                str(_field(record, "source_snapshot_id"))
                if record
                else snapshot_ids[-1]
            )

            with conn.transaction():
                # One assertion per identifier per pass, created before the
                # ladder because materializing a Catalogue of Life node needs
                # one, and removed at the end if it turns out to say nothing.
                assertion_id = _insert_assertion(
                    conn,
                    snapshot_id=taxon.source_snapshot_id or "",
                    record_id=taxon.source_record_id,
                    reasons=["eppo_ladder"],
                )
                outcome = climb_eppo_ladder(conn, taxon, assertion_id)
                if outcome.catalog_item_id is None and outcome.ambiguous_ids:
                    _queue_for_curation(conn, taxon, outcome, receipt)
                    _drop_unreferenced_assertion(conn, assertion_id)
                    continue
                if outcome.catalog_item_id is None:
                    created = _create_node_from_eppo(conn, taxon, receipt, assertion_id)
                    if created is None:
                        _drop_unreferenced_assertion(conn, assertion_id)
                        continue
                    node_by_code[code] = created
                    pending_facts.append(code)
                    continue

                node_by_code[code] = outcome.catalog_item_id
                pending_facts.append(code)
                if outcome.rule == "eppo_identifier":
                    receipt.linked_by_identifier += 1
                elif outcome.rule == "scientific_name":
                    receipt.linked_by_scientific_name += 1
                elif outcome.rule == "canonical_name":
                    receipt.linked_by_canonical_name += 1
                elif outcome.rule == "col_usage":
                    receipt.linked_by_col_usage += 1
                _write_identity(
                    conn,
                    taxon,
                    node_by_code[code],
                    outcome.rule or "eppo",
                    receipt,
                    assertion_id,
                )

    receipt.active_codes_linked = len(node_by_code)

    # Facts last, when every identifier this run could link has a node: a host
    # relation needs both ends, and the host may be alphabetically later. The
    # payloads are read a second time rather than held across the whole run.
    for start in range(0, len(pending_facts), READ_BATCH_CODES):
        batch = pending_facts[start : start + READ_BATCH_CODES]
        for code, taxon in read_taxa(conn, receipt.captures, batch).items():
            node_id = node_by_code.get(code)
            if node_id is None:
                continue
            record = conn.execute(SOURCE_RECORD_SQL, (snapshot_ids, code)).fetchone()
            taxon.source_record_id = _field(record, "id") if record else None
            taxon.source_snapshot_id = (
                str(_field(record, "source_snapshot_id"))
                if record
                else snapshot_ids[-1]
            )
            with conn.transaction():
                _write_facts(conn, taxon, node_id, node_by_code, receipt)

    if recompute_weights:
        conn.execute(RECOMPUTE_WEIGHT_SQL)
    receipt.duration_ms = int((time.monotonic() - started_at) * 1000)
    return receipt


def _write_identity(
    conn: Any,
    taxon: EppoTaxon,
    node_id: str,
    rule: str,
    receipt: EppoReconcileReceipt,
    assertion_id: str,
) -> None:
    """The identifier, the source link and the vernaculars for one linked node."""
    del rule
    written = conn.execute(
        INSERT_IDENTIFIER_SQL, (node_id, taxon.eppo_code, assertion_id)
    ).fetchone()
    if written is not None:
        receipt.identifiers_written += 1
    if taxon.source_record_id:
        conn.execute(
            INSERT_SOURCE_LINK_SQL,
            (
                node_id,
                taxon.source_record_id,
                EPPO_SOURCE_SLUG,
                taxon.eppo_code,
                assertion_id,
            ),
        )
    for locale, display in taxon.vernaculars():
        row = conn.execute(
            INSERT_NAME_SQL,
            (
                node_id,
                display,
                display,
                locale,
                SCRIPTS_BY_LANGUAGE.get(locale, "latin"),
                "vernacular",
                assertion_id,
            ),
        ).fetchone()
        if row is not None:
            receipt.names_written += 1
    _drop_unreferenced_assertion(conn, assertion_id)


def _create_node_from_eppo(
    conn: Any,
    taxon: EppoTaxon,
    receipt: EppoReconcileReceipt,
    assertion_id: str,
) -> str | None:
    """A node for a taxon EPPO has and Catalogue of Life does not.

    Only when EPPO is unambiguous about what it is: a scientific name and a
    kingdom the graph models. Anything less becomes a queue item, because a
    node without a kingdom cannot be told apart from a homonym in another one.
    """
    name = taxon.preferred_name
    kingdom = taxon.kingdom
    if not name or not kingdom or taxon.rank not in CREATABLE_RANKS:
        _queue_for_curation(conn, taxon, LinkOutcome(None, None), receipt)
        return None
    row = conn.execute(
        INSERT_NODE_SQL,
        (name, name, taxon.rank, name, taxon.eppo_code, kingdom, taxon.rank),
    ).fetchone()
    if row is None:
        return None
    node_id = str(_field(row, "id"))
    receipt.nodes_created += 1
    conn.execute(INSERT_IDENTIFIER_SQL, (node_id, taxon.eppo_code, assertion_id))
    receipt.identifiers_written += 1
    conn.execute(
        INSERT_PRIMARY_NAME_SQL,
        (node_id, name, name, taxon.authorship, assertion_id),
    )
    if taxon.source_record_id:
        conn.execute(
            INSERT_SOURCE_LINK_SQL,
            (
                node_id,
                taxon.source_record_id,
                EPPO_SOURCE_SLUG,
                taxon.eppo_code,
                assertion_id,
            ),
        )
    for locale, display in taxon.vernaculars():
        row = conn.execute(
            INSERT_NAME_SQL,
            (
                node_id,
                display,
                display,
                locale,
                SCRIPTS_BY_LANGUAGE.get(locale, "latin"),
                "vernacular",
                assertion_id,
            ),
        ).fetchone()
        if row is not None:
            receipt.names_written += 1
    return node_id


def _write_facts(
    conn: Any,
    taxon: EppoTaxon,
    node_id: str,
    node_by_code: dict[str, str],
    receipt: EppoReconcileReceipt,
) -> None:
    """Hosts, distribution and categorization for one linked node.

    EPPO's answer replaces EPPO's previous answer: a status that changed from
    present to absent must not leave both rows on the card. Only rows this
    source wrote are removed, so a curator's decision and another source's
    facts are untouched.
    """
    if not (taxon.hosts or taxon.distribution or taxon.categorization):
        return
    assertion_id = _insert_assertion(
        conn,
        snapshot_id=taxon.source_snapshot_id or "",
        record_id=taxon.source_record_id,
        reasons=["eppo_facts"],
    )

    if taxon.hosts:
        conn.execute(DELETE_RELATIONS_SQL, (node_id, EPPO_SOURCE_SLUG))
        for row in taxon.hosts:
            host_code = str(row.get("eppocode") or "").strip()
            host_id = node_by_code.get(host_code)
            if not host_id:
                host_id = _field(
                    conn.execute(IDENTIFIER_OWNER_SQL, (host_code,)).fetchone(), "id"
                )
            if not host_id or str(host_id) == node_id:
                receipt.unresolved_hosts += 1
                continue
            written = conn.execute(
                INSERT_RELATION_SQL,
                (node_id, str(host_id), host_class(row), assertion_id),
            ).fetchone()
            if written is not None:
                receipt.relations_written += 1

    if taxon.distribution:
        conn.execute(
            DELETE_FACTS_SQL, (node_id, "distribution_status", EPPO_SOURCE_SLUG)
        )
        for row in taxon.distribution:
            code = region_code(row)
            if not code:
                continue
            status = str(row.get("peststatus") or "").strip() or "unknown"
            qualifiers = {
                key: row[key]
                for key in ("yr_introd", "yr_erad", "yr_situation")
                if row.get(key) not in (None, "")
            }
            written = conn.execute(
                INSERT_FACT_SQL,
                (
                    node_id,
                    "distribution_status",
                    code,
                    status[:200],
                    normalized_presence(status),
                    json.dumps(qualifiers),
                    assertion_id,
                ),
            ).fetchone()
            if written is not None:
                receipt.distribution_facts_written += 1

    if taxon.categorization:
        conn.execute(DELETE_FACTS_SQL, (node_id, "categorization", EPPO_SOURCE_SLUG))
        for row in taxon.categorization:
            value = str(row.get("qlist_label") or row.get("qlist") or "").strip()
            if not value:
                continue
            qualifiers = {
                key: row[key]
                for key in (
                    "year_add",
                    "year_delete",
                    "year_transient",
                    "continent_name",
                )
                if row.get(key) not in (None, "")
            }
            written = conn.execute(
                INSERT_FACT_SQL,
                (
                    node_id,
                    "categorization",
                    country_of(row),
                    value[:200],
                    str(row.get("qlist") or "").strip()[:200] or None,
                    json.dumps(qualifiers),
                    assertion_id,
                ),
            ).fetchone()
            if written is not None:
                receipt.categorization_facts_written += 1

    _drop_unreferenced_assertions_for_record(conn, taxon.source_record_id)


def _queue_for_curation(
    conn: Any,
    taxon: EppoTaxon,
    outcome: LinkOutcome,
    receipt: EppoReconcileReceipt,
) -> None:
    """The residue, ordered by impact.

    Impact is how many EPPO hosts the identifier touches: an unlinked pest with
    six hundred hosts costs a card far more than one with none.
    """
    impact = max(QUEUE_IMPACT_FLOOR, len(taxon.hosts))
    reasons = ["eppo_ambiguous"] if outcome.ambiguous_ids else ["eppo_unmatched"]
    proposal = {
        "source_slug": EPPO_SOURCE_SLUG,
        "source_record_key": taxon.eppo_code,
        "scheme": "eppo",
        "value": taxon.eppo_code,
        "preferred_name": taxon.preferred_name,
        "kingdom": taxon.kingdom,
        "rank": taxon.rank,
        "candidates": list(outcome.ambiguous_ids),
        "host_count": len(taxon.hosts),
    }
    if taxon.source_record_id:
        proposal["source_record_id"] = taxon.source_record_id
    subject = outcome.ambiguous_ids[0] if outcome.ambiguous_ids else None
    row = conn.execute(
        QUEUE_SOURCE_LINK_SQL,
        (
            subject,
            (taxon.preferred_name or taxon.eppo_code)[:200],
            json.dumps(proposal),
            0.5 if outcome.ambiguous_ids else 0.2,
            reasons,
            impact,
            taxon.eppo_code,
        ),
    ).fetchone()
    if row is not None:
        receipt.queued_for_curation += 1
