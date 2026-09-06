"""The reconciliation ladder (ADR-0026 D4–D6), run by the matching worker.

A deterministic, explainable, kingdom-aware ladder reconciles gardener labels,
source records and candidate duplicates onto canonical nodes. Every proposal
carries a confidence and closed reason codes; proposals at or above the
rule's threshold in ``catalog_reconcile_thresholds`` apply themselves through
``catalog_apply_queue_item`` (migration 0056) and are logged with their
inverse; the rest become queue items ordered by impact. Nothing here runs on a
gardener's request path.

Rungs, in order, each yielding ``(confidence, reasons)``:

1. a shared external identifier (``shared_identifier:{scheme}``);
2. the same canonical scientific name and authorship after gnparser
   (``exact_scientific_authorship``);
3. the same canonical name within the same kingdom and rank
   (``canonical_same_kingdom_rank``);
4. RapidFuzz at 0.92 or better within the same genus
   (``fuzzy_same_genus:{score}``);
5. cultivar and breed denominations equal after the shared normalizer, or
   equivalent under transliteration, within the same species
   (``denomination_equal``, ``denomination_transliteration``);
6. co-usage by gardeners as a supporting signal only (``co_usage:{n}``).

A kingdom mismatch on an otherwise exact name records
``homonym_kingdom_conflict`` and never proposes.
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any, Iterable, Mapping, Sequence

from rapidfuzz import fuzz

from app.gnparser import GnParserUnavailable, ParsedName, parse_names
from app.normalize_name import normalize_name
from app.romanize import romanize_bulgarian, romanize_ukrainian, to_ascii_slug

log = logging.getLogger("overgarden.catalog_reconcile")

RULE_SHARED_IDENTIFIER = "shared_identifier"
RULE_EXACT_SCIENTIFIC_AUTHORSHIP = "exact_scientific_authorship"
RULE_CANONICAL_SAME_KINGDOM_RANK = "canonical_same_kingdom_rank"
RULE_FUZZY_SAME_GENUS = "fuzzy_same_genus"
RULE_DENOMINATION_EQUAL = "denomination_equal"
RULE_DENOMINATION_TRANSLITERATION = "denomination_transliteration"
REASON_CO_USAGE = "co_usage"
REASON_HOMONYM_KINGDOM_CONFLICT = "homonym_kingdom_conflict"

RULE_CODES: tuple[str, ...] = (
    RULE_SHARED_IDENTIFIER,
    RULE_EXACT_SCIENTIFIC_AUTHORSHIP,
    RULE_CANONICAL_SAME_KINGDOM_RANK,
    RULE_FUZZY_SAME_GENUS,
    RULE_DENOMINATION_EQUAL,
    RULE_DENOMINATION_TRANSLITERATION,
)

CONFIDENCE: Mapping[str, float] = {
    RULE_SHARED_IDENTIFIER: 0.99,
    RULE_EXACT_SCIENTIFIC_AUTHORSHIP: 0.98,
    RULE_CANONICAL_SAME_KINGDOM_RANK: 0.93,
    RULE_DENOMINATION_EQUAL: 0.96,
    RULE_DENOMINATION_TRANSLITERATION: 0.94,
}
FUZZY_MIN_SCORE = 0.92
CO_USAGE_BONUS = 0.01
CO_USAGE_MAX_BONUS = 0.03
DEFAULT_THRESHOLD = 0.95
THRESHOLD_MIN = 0.80
THRESHOLD_MAX = 0.99
RECALIBRATE_RAISE_RATE = 0.05
RECALIBRATE_RAISE_STEP = 0.02
RECALIBRATE_LOWER_STEP = 0.01
RECALIBRATE_MIN_DECISIONS = 50
MAX_NODES = 100_000
MAX_LABEL_CLUSTERS = 20_000
MAX_SOURCE_RECORDS = 20_000
SCOPES = ("labels", "source_records", "duplicates")
FORM_KIND_BY_OBJECT_KIND = {"plant": "cultivar", "animal": "breed"}

_SPACE_RUN = re.compile(r"\s+")
_CYRILLIC = re.compile(r"[Ѐ-ӿ]")


# ----------------------------------------------------------------------
# Data the ladder reasons about
# ----------------------------------------------------------------------


@dataclass(frozen=True)
class NodeName:
    display_name: str
    name_type: str
    locale: str


@dataclass(frozen=True)
class Node:
    """A canonical node as the ladder sees it; the subject of a rung or a candidate."""

    id: str
    canonical_name: str
    node_kind: str
    kingdom: str | None
    rank: str | None
    species_id: str | None
    identifiers: frozenset[tuple[str, str]] = frozenset()
    names: tuple[NodeName, ...] = ()
    gardener_ids: frozenset[str] = frozenset()
    usage: int = 0
    created_at: datetime | None = None
    parsed: ParsedName | None = None

    @property
    def denominations(self) -> tuple[str, ...]:
        values = [self.canonical_name]
        values.extend(
            name.display_name
            for name in self.names
            if name.name_type in {"denomination", "trade_designation"}
        )
        return tuple(dict.fromkeys(values))


@dataclass(frozen=True)
class LabelCluster:
    """Objects that carry the same own name, by the shared normalizer."""

    label: str
    label_normalized: str
    object_kind: str
    species_id: str | None
    objects: int
    entries: int
    search_misses: int
    gardener_ids: frozenset[str] = frozenset()

    @property
    def impact_score(self) -> int:
        return self.objects * 3 + self.entries + self.search_misses


@dataclass(frozen=True)
class Proposal:
    target_id: str
    confidence: float
    reasons: tuple[str, ...]

    @property
    def rule_code(self) -> str:
        return self.reasons[0].split(":", 1)[0]


@dataclass
class LadderOutcome:
    proposal: Proposal | None
    conflicts: tuple[str, ...] = ()
    skipped: tuple[str, ...] = ()


@dataclass
class ReconcileReceipt:
    scope: str
    subjects: int = 0
    proposals: int = 0
    auto_applied: int = 0
    queued: int = 0
    conflicts: int = 0
    skipped: int = 0
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "scope": self.scope,
            "subjects": self.subjects,
            "proposals": self.proposals,
            "autoApplied": self.auto_applied,
            "queued": self.queued,
            "conflicts": self.conflicts,
            "skipped": self.skipped,
            "notes": list(self.notes),
        }


# ----------------------------------------------------------------------
# Name helpers
# ----------------------------------------------------------------------


def transliteration_keys(value: str) -> frozenset[str]:
    """Every ASCII spelling a denomination takes under the official rules.

    The same romanization the form's address uses (ADR-0026 D8,
    `app/romanize.py`, one fixture with the TypeScript module), so a source
    that publishes a Ukrainian cultivar in Latin letters lands on the spelling
    OverGarden already assigned it.
    """
    normalized = normalize_name(value)
    if not normalized:
        return frozenset()
    keys = {to_ascii_slug(normalized)}
    if _CYRILLIC.search(normalized):
        keys.add(to_ascii_slug(romanize_ukrainian(normalized)))
        keys.add(to_ascii_slug(romanize_bulgarian(normalized)))
    return frozenset(key for key in keys if key)


def parse_nodes(nodes: Sequence[Node]) -> dict[str, ParsedName]:
    """gnparser over every taxon's canonical name, one process for the batch."""
    taxa = [node for node in nodes if node.node_kind == "taxon"]
    if not taxa:
        return {}
    parsed = parse_names([node.canonical_name for node in taxa])
    return {node.id: result for node, result in zip(taxa, parsed, strict=True)}


# ----------------------------------------------------------------------
# The rungs
# ----------------------------------------------------------------------


def rung_shared_identifier(subject: Node, candidates: Iterable[Node]) -> Proposal | None:
    """A scheme and value both carry.

    `catalog_item_identifiers` is unique on (scheme, value), so two live nodes
    can never share one: this rung decides the `source_records` scope, where
    the subject is a record that no node holds yet. In the `duplicates` scope
    it is structurally silent and rungs two to five decide.
    """
    if not subject.identifiers:
        return None
    for candidate in candidates:
        if candidate.id == subject.id:
            continue
        shared = sorted(scheme for scheme, _ in subject.identifiers & candidate.identifiers)
        if shared:
            return Proposal(
                candidate.id,
                CONFIDENCE[RULE_SHARED_IDENTIFIER],
                tuple(f"{RULE_SHARED_IDENTIFIER}:{scheme}" for scheme in shared),
            )
    return None


def rung_exact_scientific_authorship(
    subject: Node, candidates: Iterable[Node], conflicts: list[str]
) -> Proposal | None:
    parsed = subject.parsed
    if parsed is None or not parsed.parsed or not parsed.authorship:
        return None
    for candidate in candidates:
        if candidate.id == subject.id or candidate.parsed is None or not candidate.parsed.parsed:
            continue
        if (
            candidate.parsed.canonical_full.casefold() == parsed.canonical_full.casefold()
            and candidate.parsed.authorship.casefold() == parsed.authorship.casefold()
        ):
            if _kingdom_conflict(subject, candidate):
                conflicts.append(f"{REASON_HOMONYM_KINGDOM_CONFLICT}:{candidate.id}")
                continue
            return Proposal(
                candidate.id,
                CONFIDENCE[RULE_EXACT_SCIENTIFIC_AUTHORSHIP],
                (RULE_EXACT_SCIENTIFIC_AUTHORSHIP,),
            )
    return None


def rung_canonical_same_kingdom_rank(
    subject: Node, candidates: Iterable[Node], conflicts: list[str]
) -> Proposal | None:
    canonical = _canonical_simple(subject)
    if not canonical:
        return None
    for candidate in candidates:
        if candidate.id == subject.id:
            continue
        if _canonical_simple(candidate) != canonical:
            continue
        if _kingdom_conflict(subject, candidate):
            conflicts.append(f"{REASON_HOMONYM_KINGDOM_CONFLICT}:{candidate.id}")
            continue
        if subject.kingdom is None or candidate.kingdom is None:
            continue
        if (subject.rank or "") != (candidate.rank or ""):
            continue
        return Proposal(
            candidate.id,
            CONFIDENCE[RULE_CANONICAL_SAME_KINGDOM_RANK],
            (RULE_CANONICAL_SAME_KINGDOM_RANK,),
        )
    return None


def rung_fuzzy_same_genus(subject: Node, candidates: Iterable[Node]) -> Proposal | None:
    genus = _genus(subject)
    canonical = _canonical_simple(subject)
    if not genus or not canonical:
        return None
    best: tuple[float, Node] | None = None
    for candidate in candidates:
        if candidate.id == subject.id or _genus(candidate) != genus:
            continue
        if _kingdom_conflict(subject, candidate):
            continue
        other = _canonical_simple(candidate)
        if not other or other == canonical:
            continue
        score = fuzz.ratio(canonical, other) / 100
        if score >= FUZZY_MIN_SCORE and (best is None or score > best[0]):
            best = (score, candidate)
    if best is None:
        return None
    score, candidate = best
    return Proposal(candidate.id, round(score, 4), (f"{RULE_FUZZY_SAME_GENUS}:{score:.2f}",))


def rung_denomination(
    denominations: Sequence[str],
    species_id: str | None,
    candidates: Iterable[Node],
    exclude_id: str | None = None,
) -> Proposal | None:
    """Forms only: equal after the normalizer, else equivalent under transliteration."""
    normalized = {normalize_name(value) for value in denominations if normalize_name(value)}
    if not normalized:
        return None
    translit = frozenset().union(*(transliteration_keys(value) for value in denominations))
    equal: list[Node] = []
    transliterated: list[Node] = []
    for candidate in candidates:
        if candidate.id == exclude_id or candidate.node_kind not in {"cultivar", "breed"}:
            continue
        if species_id is not None and candidate.species_id not in (None, species_id):
            continue
        candidate_normalized = {normalize_name(value) for value in candidate.denominations}
        if normalized & candidate_normalized:
            equal.append(candidate)
            continue
        candidate_translit = frozenset().union(
            *(transliteration_keys(value) for value in candidate.denominations)
        )
        if translit & candidate_translit:
            transliterated.append(candidate)
    if len(equal) == 1:
        return Proposal(equal[0].id, CONFIDENCE[RULE_DENOMINATION_EQUAL], (RULE_DENOMINATION_EQUAL,))
    if not equal and len(transliterated) == 1:
        return Proposal(
            transliterated[0].id,
            CONFIDENCE[RULE_DENOMINATION_TRANSLITERATION],
            (RULE_DENOMINATION_TRANSLITERATION,),
        )
    return None


def with_co_usage(proposal: Proposal, subject_gardeners: frozenset[str], candidate: Node) -> Proposal:
    shared = len(subject_gardeners & candidate.gardener_ids)
    if shared == 0:
        return proposal
    bonus = min(shared * CO_USAGE_BONUS, CO_USAGE_MAX_BONUS)
    return Proposal(
        proposal.target_id,
        round(min(proposal.confidence + bonus, 0.9999), 4),
        proposal.reasons + (f"{REASON_CO_USAGE}:{shared}",),
    )


def climb_node_ladder(subject: Node, candidates: Sequence[Node]) -> LadderOutcome:
    """Rungs 1–4 for a taxon (duplicates and source records), 5 for a form."""
    conflicts: list[str] = []
    proposal: Proposal | None = None
    if subject.node_kind == "taxon":
        proposal = (
            rung_shared_identifier(subject, candidates)
            or rung_exact_scientific_authorship(subject, candidates, conflicts)
            or rung_canonical_same_kingdom_rank(subject, candidates, conflicts)
            or rung_fuzzy_same_genus(subject, candidates)
        )
    else:
        proposal = rung_shared_identifier(subject, candidates) or rung_denomination(
            subject.denominations, subject.species_id, candidates, exclude_id=subject.id
        )
    if proposal is not None:
        target = next(candidate for candidate in candidates if candidate.id == proposal.target_id)
        proposal = with_co_usage(proposal, subject.gardener_ids, target)
    return LadderOutcome(proposal=proposal, conflicts=tuple(dict.fromkeys(conflicts)))


def climb_label_ladder(cluster: LabelCluster, forms: Sequence[Node]) -> LadderOutcome:
    """A gardener label reaches a form of the matching kind by its denomination."""
    wanted_kind = FORM_KIND_BY_OBJECT_KIND.get(cluster.object_kind)
    candidates = [form for form in forms if form.node_kind == wanted_kind]
    proposal = rung_denomination([cluster.label], cluster.species_id, candidates)
    if proposal is not None:
        target = next(candidate for candidate in candidates if candidate.id == proposal.target_id)
        proposal = with_co_usage(proposal, cluster.gardener_ids, target)
    return LadderOutcome(proposal=proposal)


def _canonical_simple(node: Node) -> str:
    if node.parsed is not None and node.parsed.parsed and node.parsed.canonical_simple:
        return node.parsed.canonical_simple.casefold()
    return _SPACE_RUN.sub(" ", node.canonical_name).strip().casefold()


def _genus(node: Node) -> str | None:
    if node.parsed is not None and node.parsed.parsed:
        return node.parsed.genus
    parts = node.canonical_name.split()
    return parts[0].casefold() if len(parts) >= 2 else None


def _kingdom_conflict(left: Node, right: Node) -> bool:
    return (
        left.kingdom is not None
        and right.kingdom is not None
        and left.kingdom.casefold() != right.kingdom.casefold()
    )


# ----------------------------------------------------------------------
# Thresholds and recalibration
# ----------------------------------------------------------------------


THRESHOLDS_SQL = "select rule_code, threshold from catalog_reconcile_thresholds"

RECALIBRATION_SQL = """
select payload->>'rule_code' as rule_code,
       count(*)::int as decisions,
       count(*) filter (where reverted_by_action_id is not null)::int as reverts
from catalog_curation_actions
where automatic
  and action_type <> 'revert'
  and performed_at >= now() - interval '30 days'
  and payload->>'rule_code' is not null
group by 1
"""

UPDATE_THRESHOLD_SQL = """
update catalog_reconcile_thresholds
set threshold = %s, revert_rate_30d = %s, decisions_30d = %s, updated_at = now()
where rule_code = %s
"""


def read_thresholds(conn: Any) -> dict[str, float]:
    rows = conn.execute(THRESHOLDS_SQL).fetchall()
    thresholds = {rule: DEFAULT_THRESHOLD for rule in RULE_CODES}
    for row in rows:
        rule, threshold = _row_pair(row, "rule_code", "threshold")
        thresholds[str(rule)] = float(threshold)
    return thresholds


def recalibrated_threshold(current: float, decisions: int, reverts: int) -> float:
    """Raise by 0.02 above a 5 % revert rate; lower by 0.01 at 0 % over 50+ decisions; bounded."""
    rate = (reverts / decisions) if decisions else 0.0
    if decisions and rate > RECALIBRATE_RAISE_RATE:
        proposed = current + RECALIBRATE_RAISE_STEP
    elif decisions >= RECALIBRATE_MIN_DECISIONS and reverts == 0:
        proposed = current - RECALIBRATE_LOWER_STEP
    else:
        proposed = current
    return round(min(THRESHOLD_MAX, max(THRESHOLD_MIN, proposed)), 4)


def recalibrate_thresholds(conn: Any) -> dict[str, dict[str, float | int]]:
    thresholds = read_thresholds(conn)
    stats = {
        str(_field(row, "rule_code")): (int(_field(row, "decisions")), int(_field(row, "reverts")))
        for row in conn.execute(RECALIBRATION_SQL).fetchall()
    }
    receipt: dict[str, dict[str, float | int]] = {}
    for rule in RULE_CODES:
        decisions, reverts = stats.get(rule, (0, 0))
        current = thresholds.get(rule, DEFAULT_THRESHOLD)
        updated = recalibrated_threshold(current, decisions, reverts)
        rate = round((reverts / decisions) if decisions else 0.0, 4)
        conn.execute(UPDATE_THRESHOLD_SQL, (updated, rate, decisions, rule))
        receipt[rule] = {"before": current, "after": updated, "decisions": decisions, "reverts": reverts}
    log.info("catalog_threshold_recalibrate %s", receipt)
    return receipt


# ----------------------------------------------------------------------
# Reading the graph
# ----------------------------------------------------------------------


NODES_SQL = """
select item.id::text as id,
       item.canonical_name,
       item.node_kind,
       item.kingdom,
       item.rank,
       item.created_at,
       (
         select relation.to_catalog_item_id::text
         from catalog_item_relations as relation
         where relation.from_catalog_item_id = item.id and relation.relation_type = 'form_of'
         order by relation.created_at, relation.id
         limit 1
       ) as species_id,
       coalesce((
         select array_agg(identifier.scheme || ':' || identifier.value)
         from catalog_item_identifiers as identifier
         where identifier.catalog_item_id = item.id
       ), '{}'::text[]) as identifiers,
       coalesce((
         select array_agg(name.display_name || '|' || name.name_type || '|' || name.locale)
         from catalog_item_names as name
         where name.catalog_item_id = item.id
       ), '{}'::text[]) as names,
       coalesce((
         select array_agg(distinct object.owner_user_id::text)
         from plant_objects as object
         join journal_entries as entry on entry.plant_object_id = object.id
         where object.catalog_item_id = item.id
           and object.variety_state = 'selected'
           and entry.visibility = 'public'
           and entry.lifecycle_state = 'active'
           and entry.deleted_at is null
       ), '{}'::text[]) as gardener_ids,
       (
         select count(*)::int from plant_objects as object where object.catalog_item_id = item.id
       ) as usage
from catalog_items as item
where item.identity_state = 'active'
  and item.created_by_user_id is null
  and item.public_slug is not null
order by item.created_at, item.id
limit %s
"""

LABEL_CLUSTERS_SQL = """
with labelled as (
  select object.id,
         object.owner_user_id,
         object.object_kind,
         object.variety_text,
         catalog_normalize_name(object.variety_text) as label_normalized,
         (
           select count(*)::int from journal_entries as entry
           where entry.plant_object_id = object.id
             and entry.lifecycle_state = 'active'
             and entry.deleted_at is null
         ) as entries
  from plant_objects as object
  where object.variety_state = 'free_text'
    and object.catalog_item_id is null
    and object.variety_text is not null
)
select object_kind,
       label_normalized,
       min(variety_text) as label,
       count(*)::int as objects,
       coalesce(sum(entries), 0)::int as entries,
       array_agg(distinct owner_user_id::text) as gardener_ids,
       coalesce((
         select sum(miss.occurrences)::int
         from catalog_search_misses as miss
         where miss.query_normalized = labelled.label_normalized
           and miss.object_kind = labelled.object_kind
           and miss.resolved_catalog_item_id is null
       ), 0) as search_misses
from labelled
where label_normalized <> ''
group by object_kind, label_normalized
order by count(*) desc, label_normalized
limit %s
"""

SOURCE_RECORDS_SQL = """
select record.id::text as id,
       snapshot.source_slug,
       snapshot.id::text as source_snapshot_id,
       record.source_record_id as source_record_key,
       record.allowed_projection
from catalog_source_records as record
join catalog_source_snapshots as snapshot on snapshot.id = record.source_snapshot_id
where record.projection_status = 'projected'
  and not exists (
    select 1 from catalog_source_links as link where link.source_record_id = record.id
  )
  and (%s::text is null or snapshot.source_slug = %s::text)
  and (%s::timestamptz is null or record.updated_at >= %s::timestamptz)
order by record.created_at, record.id
limit %s
"""

OPEN_LABEL_ITEM_SQL = """
select 1 from catalog_curation_queue
where item_type = 'label_link'
  and state in ('open', 'auto_applied', 'accepted')
  and catalog_normalize_name(subject_label) = %s
  and (proposal->>'object_kind') is not distinct from %s
limit 1
"""

OPEN_NODE_ITEM_SQL = """
select 1 from catalog_curation_queue
where item_type = %s
  and state in ('open', 'auto_applied', 'accepted')
  and subject_catalog_item_id = %s::uuid
  and (proposal->>%s) = %s
limit 1
"""

INSERT_QUEUE_ITEM_SQL = """
insert into catalog_curation_queue (
  item_type, subject_catalog_item_id, subject_label, proposal, confidence, reasons, impact_score
)
values (%s, %s::uuid, %s, %s::jsonb, %s, %s::text[], %s)
returning id::text as id
"""

APPLY_SQL = "select catalog_apply_queue_item(%s::uuid, null, %s)::text as action_id"


def read_nodes(conn: Any, limit: int = MAX_NODES) -> list[Node]:
    nodes: list[Node] = []
    for row in conn.execute(NODES_SQL, (limit,)).fetchall():
        names = tuple(
            NodeName(*_split_name(value)) for value in (_field(row, "names") or [])
        )
        identifiers = frozenset(
            tuple(value.split(":", 1)) for value in (_field(row, "identifiers") or []) if ":" in value
        )
        nodes.append(
            Node(
                id=str(_field(row, "id")),
                canonical_name=str(_field(row, "canonical_name")),
                node_kind=str(_field(row, "node_kind")),
                kingdom=_optional_text(_field(row, "kingdom")),
                rank=_optional_text(_field(row, "rank")),
                species_id=_optional_text(_field(row, "species_id")),
                identifiers=identifiers,
                names=names,
                gardener_ids=frozenset(str(value) for value in (_field(row, "gardener_ids") or [])),
                usage=int(_field(row, "usage") or 0),
                created_at=_field(row, "created_at"),
            )
        )
    return nodes


def with_parsed_names(nodes: Sequence[Node], notes: list[str]) -> list[Node]:
    try:
        parsed = parse_nodes(nodes)
    except GnParserUnavailable as error:
        notes.append(f"gnparser_unavailable:{error}")
        return list(nodes)
    return [
        Node(**{**node.__dict__, "parsed": parsed.get(node.id)}) for node in nodes
    ]


def read_label_clusters(conn: Any, limit: int = MAX_LABEL_CLUSTERS) -> list[LabelCluster]:
    clusters: list[LabelCluster] = []
    for row in conn.execute(LABEL_CLUSTERS_SQL, (limit,)).fetchall():
        clusters.append(
            LabelCluster(
                label=str(_field(row, "label")),
                label_normalized=str(_field(row, "label_normalized")),
                object_kind=str(_field(row, "object_kind")),
                species_id=None,
                objects=int(_field(row, "objects") or 0),
                entries=int(_field(row, "entries") or 0),
                search_misses=int(_field(row, "search_misses") or 0),
                gardener_ids=frozenset(str(value) for value in (_field(row, "gardener_ids") or [])),
            )
        )
    return clusters


# ----------------------------------------------------------------------
# The three scopes
# ----------------------------------------------------------------------


def reconcile(
    conn: Any,
    scope: str,
    source_slug: str | None = None,
    since: str | None = None,
) -> dict[str, Any]:
    if scope not in SCOPES:
        raise ValueError(f"unsupported reconcile scope {scope!r}")
    receipt = ReconcileReceipt(scope=scope)
    thresholds = read_thresholds(conn)
    nodes = with_parsed_names(read_nodes(conn), receipt.notes)
    if scope == "labels":
        _reconcile_labels(conn, nodes, thresholds, receipt)
    elif scope == "duplicates":
        _reconcile_duplicates(conn, nodes, thresholds, receipt)
    else:
        _reconcile_source_records(conn, nodes, thresholds, receipt, source_slug, since)
    log.info("catalog_reconcile %s", receipt.as_dict())
    return receipt.as_dict()


def _reconcile_labels(
    conn: Any, nodes: Sequence[Node], thresholds: Mapping[str, float], receipt: ReconcileReceipt
) -> None:
    forms = [node for node in nodes if node.node_kind in {"cultivar", "breed"}]
    for cluster in read_label_clusters(conn):
        receipt.subjects += 1
        outcome = climb_label_ladder(cluster, forms)
        if outcome.proposal is None:
            receipt.skipped += 1
            continue
        if _exists(conn, OPEN_LABEL_ITEM_SQL, (cluster.label_normalized, cluster.object_kind)):
            receipt.skipped += 1
            continue
        item_id = _insert_item(
            conn,
            item_type="label_link",
            subject_catalog_item_id=outcome.proposal.target_id,
            subject_label=cluster.label[:120],
            proposal={
                "catalog_item_id": outcome.proposal.target_id,
                "object_kind": cluster.object_kind,
                "label_normalized": cluster.label_normalized,
            },
            proposal_obj=outcome.proposal,
            impact_score=cluster.impact_score,
        )
        receipt.proposals += 1
        _maybe_auto_apply(conn, item_id, outcome.proposal, thresholds, receipt)


def _reconcile_duplicates(
    conn: Any, nodes: Sequence[Node], thresholds: Mapping[str, float], receipt: ReconcileReceipt
) -> None:
    by_kind: dict[str, list[Node]] = defaultdict(list)
    for node in nodes:
        by_kind[node.node_kind].append(node)
    seen_pairs: set[tuple[str, str]] = set()
    for node in nodes:
        receipt.subjects += 1
        candidates = by_kind[node.node_kind]
        outcome = climb_node_ladder(node, candidates)
        receipt.conflicts += len(outcome.conflicts)
        if outcome.proposal is None:
            continue
        pair = tuple(sorted((node.id, outcome.proposal.target_id)))
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        target = next(candidate for candidate in candidates if candidate.id == outcome.proposal.target_id)
        survivor, loser = _survivor_and_loser(node, target)
        if _exists(conn, OPEN_NODE_ITEM_SQL, ("node_merge", loser.id, "survivor_id", survivor.id)):
            receipt.skipped += 1
            continue
        item_id = _insert_item(
            conn,
            item_type="node_merge",
            subject_catalog_item_id=loser.id,
            subject_label=None,
            proposal={"survivor_id": survivor.id, "loser_id": loser.id},
            proposal_obj=outcome.proposal,
            impact_score=loser.usage * 3 + survivor.usage,
        )
        receipt.proposals += 1
        _maybe_auto_apply(conn, item_id, outcome.proposal, thresholds, receipt)


def _reconcile_source_records(
    conn: Any,
    nodes: Sequence[Node],
    thresholds: Mapping[str, float],
    receipt: ReconcileReceipt,
    source_slug: str | None,
    since: str | None,
) -> None:
    """Unlinked source records whose allowed projection names an organism.

    A source task hands the ladder a record through its ``allowed_projection``:
    ``scientificName`` (or ``canonicalName``/``name``) for a taxon,
    ``denomination`` with ``speciesCatalogItemId`` for a form, ``kingdom`` and
    ``rank`` when known, and ``identifiers`` as ``[{scheme, value}]``.
    """
    taxa = [node for node in nodes if node.node_kind == "taxon"]
    forms = [node for node in nodes if node.node_kind != "taxon"]
    rows = conn.execute(
        SOURCE_RECORDS_SQL, (source_slug, source_slug, since, since, MAX_SOURCE_RECORDS)
    ).fetchall()
    subjects: list[tuple[Any, Node]] = []
    for row in rows:
        projection = _field(row, "allowed_projection") or {}
        if not isinstance(projection, dict):
            continue
        scientific = _first_text(projection, ("scientificName", "canonicalName", "name"))
        denomination = _first_text(projection, ("denomination",))
        identifiers = frozenset(
            (str(item.get("scheme")), str(item.get("value")))
            for item in (projection.get("identifiers") or [])
            if isinstance(item, dict) and item.get("scheme") and item.get("value")
        )
        if denomination:
            subject = Node(
                id=f"record:{_field(row, 'id')}",
                canonical_name=denomination,
                node_kind="cultivar",
                kingdom=_optional_text(projection.get("kingdom")),
                rank=None,
                species_id=_optional_text(projection.get("speciesCatalogItemId")),
                identifiers=identifiers,
            )
        elif scientific:
            subject = Node(
                id=f"record:{_field(row, 'id')}",
                canonical_name=scientific,
                node_kind="taxon",
                kingdom=_optional_text(projection.get("kingdom")),
                rank=_optional_text(projection.get("rank")),
                species_id=None,
                identifiers=identifiers,
            )
        else:
            receipt.skipped += 1
            continue
        subjects.append((row, subject))
    receipt.subjects += len(subjects)
    parsed_subjects = with_parsed_names([subject for _, subject in subjects], receipt.notes)
    for (row, _), subject in zip(subjects, parsed_subjects, strict=True):
        candidates = taxa if subject.node_kind == "taxon" else forms
        outcome = climb_node_ladder(subject, candidates)
        receipt.conflicts += len(outcome.conflicts)
        if outcome.proposal is None:
            continue
        record_id = str(_field(row, "id"))
        if _exists(conn, OPEN_NODE_ITEM_SQL, ("source_link", outcome.proposal.target_id, "source_record_id", record_id)):
            receipt.skipped += 1
            continue
        projection = _field(row, "allowed_projection") or {}
        item_id = _insert_item(
            conn,
            item_type="source_link",
            subject_catalog_item_id=outcome.proposal.target_id,
            subject_label=None,
            proposal={
                "source_slug": str(_field(row, "source_slug")),
                "source_snapshot_id": str(_field(row, "source_snapshot_id")),
                "source_record_id": record_id,
                "source_record_key": str(_field(row, "source_record_key")),
                "identifiers": [
                    {"scheme": scheme, "value": value} for scheme, value in sorted(subject.identifiers)
                ],
                "rights_class": str(projection.get("rightsClass") or "source_public"),
            },
            proposal_obj=outcome.proposal,
            impact_score=1,
        )
        receipt.proposals += 1
        _maybe_auto_apply(conn, item_id, outcome.proposal, thresholds, receipt)


def apply_queue_item(conn: Any, queue_item_id: str) -> str | None:
    """The `catalog_curation_apply` kind: an owner-accepted item applied off the request path."""
    try:
        row = conn.execute(APPLY_SQL, (queue_item_id, False)).fetchone()
    except Exception as error:  # noqa: BLE001 - psycopg raises its own hierarchy
        if _is_already_decided(error):
            log.info("catalog_curation_apply %s already decided", queue_item_id)
            return None
        raise
    return str(_field(row, "action_id")) if row else None


def record_source_refresh(source_slug: str) -> dict[str, str]:
    """`catalog_source_refresh` is a contract until a source task implements it."""
    receipt = {"sourceSlug": source_slug, "status": "recorded_no_ingest"}
    log.info("catalog_source_refresh %s", receipt)
    return receipt


# ----------------------------------------------------------------------
# Plumbing
# ----------------------------------------------------------------------


def _maybe_auto_apply(
    conn: Any,
    item_id: str,
    proposal: Proposal,
    thresholds: Mapping[str, float],
    receipt: ReconcileReceipt,
) -> None:
    threshold = thresholds.get(proposal.rule_code, DEFAULT_THRESHOLD)
    if proposal.confidence >= threshold:
        conn.execute(APPLY_SQL, (item_id, True))
        receipt.auto_applied += 1
    else:
        receipt.queued += 1


def _survivor_and_loser(left: Node, right: Node) -> tuple[Node, Node]:
    """More gardener usage survives; then the older node; then the smaller id."""
    def key(node: Node) -> tuple[int, float, str]:
        created = node.created_at.timestamp() if node.created_at else float("inf")
        return (-node.usage, created, node.id)
    ordered = sorted((left, right), key=key)
    return ordered[0], ordered[1]


def _insert_item(
    conn: Any,
    *,
    item_type: str,
    subject_catalog_item_id: str | None,
    subject_label: str | None,
    proposal: dict[str, Any],
    proposal_obj: Proposal,
    impact_score: int,
) -> str:
    import json

    row = conn.execute(
        INSERT_QUEUE_ITEM_SQL,
        (
            item_type,
            subject_catalog_item_id,
            subject_label,
            json.dumps(proposal),
            Decimal(str(proposal_obj.confidence)),
            list(proposal_obj.reasons),
            max(0, impact_score),
        ),
    ).fetchone()
    return str(_field(row, "id"))


def _exists(conn: Any, statement: str, parameters: tuple[Any, ...]) -> bool:
    return conn.execute(statement, parameters).fetchone() is not None


def _is_already_decided(error: BaseException) -> bool:
    sqlstate = getattr(error, "sqlstate", None) or getattr(getattr(error, "diag", None), "sqlstate", None)
    return sqlstate == "22023" and "is " in str(error)


def _split_name(value: str) -> tuple[str, str, str]:
    display, _, rest = value.rpartition("|")
    display_name, _, name_type = display.rpartition("|")
    return display_name, name_type, rest


def _first_text(projection: Mapping[str, Any], keys: Sequence[str]) -> str | None:
    for key in keys:
        value = projection.get(key)
        if isinstance(value, str) and value.strip():
            return " ".join(value.split())
    return None


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _field(row: Any, key: str) -> Any:
    if isinstance(row, Mapping):
        return row.get(key)
    return getattr(row, key)


def _row_pair(row: Any, left: str, right: str) -> tuple[Any, Any]:
    return _field(row, left), _field(row, right)
