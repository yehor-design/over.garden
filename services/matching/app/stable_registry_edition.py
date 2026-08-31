"""Worker-owned edition diff build for the Stable Registry.

The queue payload supplies only a release UUID. The worker compares one draft
edition against the release it succeeds and writes grouped, aggregate-only diff
rows. It never selects a raw payload, a source-only field, a garden object id,
an owner id, a journal row, or a coordinate.

An edition is a comparison, not an import: this build creates no catalog
identity and moves no user object. It only tells the owner what changed, in
groups small enough to decide.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

STABLE_REGISTRY_EDITION_BUILD_KIND = "stable_registry_edition_build"
EDITION_POLICY_VERSION = "ove258.edition.v1"

# Classes this build derives from immutable release evidence alone.
#
# `alias` and `split` are deliberately absent. Neither is derivable here: the
# release layer versions membership and revisions, not name sets, and a split is
# an owner judgement recorded through `record_split` rather than a fact the
# comparison can observe. Emitting them from a guess would put decisions in
# front of the owner that no evidence supports.
DERIVED_DIFF_CLASSES = (
    "unchanged",
    "addition",
    "correction",
    "supersession",
    "rights_change",
)


def build_edition_release(conn: Any, release_id: str) -> None:
    """Build one edition's diff groups idempotently under the release lock."""
    with conn.transaction():
        release = _lock_edition_release(conn, release_id)
        if release is None:
            raise ValueError("edition_release_not_found")
        if release["state"] in {"review_ready", "approved", "active", "retired"}:
            return
        if release["state"] == "draft":
            started = conn.execute(
                """
                update catalog_registry_releases
                set state = 'building',
                    build_started_at = now(),
                    version = version + 1,
                    updated_at = now()
                where id = %s::uuid
                  and state = 'draft'
                returning id
                """,
                (release_id,),
            ).fetchone()
            if started is None:
                raise ValueError("edition_release_start_rejected")
        elif release["state"] != "building":
            raise ValueError("edition_release_not_building")

    # The `draft -> building` transition is committed before the comparison, so
    # a crash leaves a visibly resumable release rather than a stuck draft.
    with conn.transaction():
        release = _lock_edition_release(conn, release_id)
        if release is None:
            raise ValueError("edition_release_not_found")
        if release["state"] in {"review_ready", "approved", "active", "retired"}:
            return
        if release["state"] != "building":
            raise ValueError("edition_release_not_building")
        if release["policy_version"] != EDITION_POLICY_VERSION:
            raise ValueError("edition_policy_version_mismatch")

        prior_release_id = release["predecessor_release_id"]
        if prior_release_id is None:
            raise ValueError("edition_predecessor_missing")

        # An edition's candidate membership is the current product-owned catalog
        # measured against the release it succeeds. A captured source row never
        # mints an identity here, exactly as in the Foundation build.
        conn.execute(
            """
            insert into catalog_item_revisions (
              catalog_item_id,
              revision_number,
              canonical_name,
              normalized_name,
              catalog_kind,
              identity_relation,
              source_evidence_digest,
              revision_digest
            )
            select
              items.id,
              coalesce(
                (select max(existing.revision_number) + 1
                 from catalog_item_revisions as existing
                 where existing.catalog_item_id = items.id),
                1
              ),
              items.canonical_name,
              coalesce(items.normalized_name, lower(items.canonical_name)),
              items.catalog_kind,
              'canonical',
              encode(digest(convert_to(concat_ws('|', items.source, coalesce(items.source_id, '')), 'utf8'), 'sha256'), 'hex'),
              encode(digest(convert_to(concat_ws('|', items.id::text, items.canonical_name, coalesce(items.normalized_name, lower(items.canonical_name)), items.catalog_kind), 'utf8'), 'sha256'), 'hex')
            from catalog_items as items
            where items.status in ('seeded', 'confirmed')
              and not exists (
                select 1
                from catalog_item_revisions as current_revision
                where current_revision.catalog_item_id = items.id
                  and current_revision.revision_digest = encode(digest(convert_to(concat_ws('|', items.id::text, items.canonical_name, coalesce(items.normalized_name, lower(items.canonical_name)), items.catalog_kind), 'utf8'), 'sha256'), 'hex')
              )
            on conflict (catalog_item_id, revision_number) do nothing
            """
        )
        conn.execute(
            """
            insert into catalog_registry_release_members (
              release_id,
              catalog_item_id,
              catalog_item_revision_id,
              eligibility,
              membership_digest
            )
            select
              %s::uuid,
              items.id,
              revisions.id,
              'product_eligible',
              encode(digest(convert_to(concat_ws('|', %s::text, items.id::text, revisions.revision_digest, 'product_eligible'), 'utf8'), 'sha256'), 'hex')
            from catalog_items as items
            join lateral (
              select existing.id, existing.revision_digest
              from catalog_item_revisions as existing
              where existing.catalog_item_id = items.id
              order by existing.revision_number desc
              limit 1
            ) as revisions on true
            where items.status in ('seeded', 'confirmed')
            on conflict (release_id, catalog_item_id) do nothing
            """,
            (release_id, release_id),
        )

        counts = _classify(conn, release_id, prior_release_id)
        for diff_class, member_count in counts.items():
            if member_count <= 0:
                continue
            group_key = _group_key(release_id, diff_class)
            affected = _affected_object_count(
                conn, release_id, prior_release_id, diff_class
            )
            conn.execute(
                """
                insert into catalog_registry_edition_diffs (
                  release_id,
                  prior_release_id,
                  diff_class,
                  group_key,
                  member_count,
                  affected_object_count,
                  affected_object_digest,
                  state,
                  safe_summary
                ) values (
                  %s::uuid, %s::uuid, %s, %s, %s, %s, %s, 'open',
                  jsonb_build_object('memberCount', %s::int, 'affectedObjectCount', %s::int)
                )
                on conflict (release_id, group_key) do nothing
                """,
                (
                    release_id,
                    prior_release_id,
                    diff_class,
                    group_key,
                    member_count,
                    affected,
                    _affected_digest(release_id, diff_class, affected),
                    member_count,
                    affected,
                ),
            )

        # `build_digest` is the release's identity and the OVE-255 guard holds it
        # immutable; the comparison result belongs in the aggregate summary
        # instead. `returning id` makes a rejected completion loud rather than a
        # release that silently stays in `building`.
        completed = conn.execute(
            """
            update catalog_registry_releases
            set state = 'review_ready',
                safe_summary = %s::jsonb,
                review_ready_at = now(),
                version = version + 1,
                updated_at = now()
            where id = %s::uuid
              and state = 'building'
            returning id
            """,
            (_safe_summary(release_id, counts), release_id),
        ).fetchone()
        if completed is None:
            raise ValueError("edition_release_completion_rejected")


def _lock_edition_release(conn: Any, release_id: str) -> Any:
    return conn.execute(
        """
        select id, state, policy_version, predecessor_release_id
        from catalog_registry_releases
        where id = %s::uuid
          and release_kind = 'edition'
        for update
        """,
        (release_id,),
    ).fetchone()


def _classify(conn: Any, release_id: str, prior_release_id: str) -> dict[str, int]:
    """Return one aggregate count per derived diff class.

    Every class is decided by immutable release evidence: which identities each
    release admits, the revision digest each admits them at, and the eligibility
    it admits them under.
    """
    row = conn.execute(
        _CLASSIFY_SQL,
        (release_id, prior_release_id),
    ).fetchone()
    return {
        "unchanged": int(row["unchanged_count"]),
        "addition": int(row["addition_count"]),
        "correction": int(row["correction_count"]),
        "supersession": int(row["supersession_count"]),
        "rights_change": int(row["rights_change_count"]),
    }


_CLASSIFY_SQL = """
with edition as (
  select members.catalog_item_id, members.eligibility, revisions.revision_digest
  from catalog_registry_release_members as members
  join catalog_item_revisions as revisions
    on revisions.id = members.catalog_item_revision_id
  where members.release_id = %s::uuid
), prior as (
  select members.catalog_item_id, members.eligibility, revisions.revision_digest
  from catalog_registry_release_members as members
  join catalog_item_revisions as revisions
    on revisions.id = members.catalog_item_revision_id
  where members.release_id = %s::uuid
)
select
  count(*) filter (
    where prior.catalog_item_id is not null
      and edition.revision_digest = prior.revision_digest
      and edition.eligibility = prior.eligibility
  )::int as unchanged_count,
  count(*) filter (where prior.catalog_item_id is null)::int as addition_count,
  count(*) filter (
    where prior.catalog_item_id is not null
      and edition.revision_digest is distinct from prior.revision_digest
  )::int as correction_count,
  count(*) filter (
    where prior.catalog_item_id is not null
      and edition.revision_digest = prior.revision_digest
      and edition.eligibility is distinct from prior.eligibility
  )::int as rights_change_count,
  (
    select count(*)
    from prior as retired
    where not exists (
      select 1 from edition as kept
      where kept.catalog_item_id = retired.catalog_item_id
    )
  )::int as supersession_count
from edition
left join prior on prior.catalog_item_id = edition.catalog_item_id
"""


def _affected_object_count(
    conn: Any, release_id: str, prior_release_id: str, diff_class: str
) -> int:
    """Count existing garden objects referencing an identity in this group.

    Aggregate only. No object id, owner id, space, or journal content is read,
    and nothing about the objects is stored.
    """
    if diff_class == "supersession":
        sql = """
          select count(*)::int as count
          from plant_objects as objects
          where objects.catalog_item_id is not null
            and exists (
              select 1 from catalog_registry_release_members as prior
              where prior.release_id = %(prior)s::uuid
                and prior.catalog_item_id = objects.catalog_item_id
            )
            and not exists (
              select 1 from catalog_registry_release_members as edition
              where edition.release_id = %(edition)s::uuid
                and edition.catalog_item_id = objects.catalog_item_id
            )
        """
    elif diff_class == "addition":
        # A newly admitted identity cannot already be referenced by an object,
        # so this is always zero. It is computed rather than assumed.
        sql = """
          select count(*)::int as count
          from plant_objects as objects
          where objects.catalog_item_id is not null
            and exists (
              select 1 from catalog_registry_release_members as edition
              where edition.release_id = %(edition)s::uuid
                and edition.catalog_item_id = objects.catalog_item_id
            )
            and not exists (
              select 1 from catalog_registry_release_members as prior
              where prior.release_id = %(prior)s::uuid
                and prior.catalog_item_id = objects.catalog_item_id
            )
        """
    else:
        sql = f"""
          select count(*)::int as count
          from plant_objects as objects
          join catalog_registry_release_members as edition
            on edition.release_id = %(edition)s::uuid
           and edition.catalog_item_id = objects.catalog_item_id
          join catalog_item_revisions as edition_revision
            on edition_revision.id = edition.catalog_item_revision_id
          join catalog_registry_release_members as prior
            on prior.release_id = %(prior)s::uuid
           and prior.catalog_item_id = objects.catalog_item_id
          join catalog_item_revisions as prior_revision
            on prior_revision.id = prior.catalog_item_revision_id
          where objects.catalog_item_id is not null
            and {_MEMBER_PREDICATES[diff_class]}
        """
    row = conn.execute(
        sql, {"edition": release_id, "prior": prior_release_id}
    ).fetchone()
    return int(row["count"])


_MEMBER_PREDICATES = {
    "unchanged": (
        "edition_revision.revision_digest = prior_revision.revision_digest"
        " and edition.eligibility = prior.eligibility"
    ),
    "correction": (
        "edition_revision.revision_digest is distinct from"
        " prior_revision.revision_digest"
    ),
    "rights_change": (
        "edition_revision.revision_digest = prior_revision.revision_digest"
        " and edition.eligibility is distinct from prior.eligibility"
    ),
}


def _group_key(release_id: str, diff_class: str) -> str:
    return hashlib.sha256(f"{release_id}|{diff_class}".encode("utf-8")).hexdigest()


def _affected_digest(release_id: str, diff_class: str, affected: int) -> str:
    return hashlib.sha256(
        f"{release_id}|{diff_class}|{affected}".encode("utf-8")
    ).hexdigest()


def _diff_digest(release_id: str, counts: dict[str, int]) -> str:
    ordered = "|".join(
        f"{diff_class}={counts.get(diff_class, 0)}"
        for diff_class in DERIVED_DIFF_CLASSES
    )
    return hashlib.sha256(f"{release_id}|{ordered}".encode("utf-8")).hexdigest()


def _safe_summary(release_id: str, counts: dict[str, int]) -> str:
    """Aggregate-only comparison result stored on the release.

    Counts per derived class and one digest over them. No name, identifier, or
    user row appears here, and the owner's preview binds against this digest.
    """
    return json.dumps(
        {
            "policyVersion": EDITION_POLICY_VERSION,
            "diffDigest": _diff_digest(release_id, counts),
            "counts": {
                diff_class: counts.get(diff_class, 0)
                for diff_class in DERIVED_DIFF_CLASSES
            },
        },
        separators=(",", ":"),
        sort_keys=True,
    )
