"""Worker-owned Foundation build for the Stable Registry.

The queue payload supplies only a release UUID. The worker reads aggregate,
rights-cleared source facts from Postgres and intentionally never selects raw
payloads, source-only fields, user records, or coordinates.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

FOUNDATION_POLICY_VERSION = "ove255.foundation.v1"


def build_foundation_release(conn: Any, release_id: str) -> None:
    """Build one release idempotently under the release-row lock.

    Source-only and authority-unresolved rows become grouped exceptions. They
    are not catalog identities, release members, or search documents.
    """
    with conn.transaction():
        release = _lock_foundation_release(conn, release_id)
        if release is None:
            raise ValueError("foundation_release_not_found")
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
                raise ValueError("foundation_release_start_rejected")
        elif release["state"] != "building":
            raise ValueError("foundation_release_not_building")

    # Persist the `draft -> building` transition before the potentially long
    # build. A crash is therefore visibly resumable, while the second lock
    # keeps an accidental duplicate worker from publishing a second result.
    with conn.transaction():
        release = _lock_foundation_release(conn, release_id)
        if release is None:
            raise ValueError("foundation_release_not_found")
        if release["state"] in {"review_ready", "approved", "active", "retired"}:
            return
        if release["state"] != "building":
            raise ValueError("foundation_release_not_building")
        if release["policy_version"] != FOUNDATION_POLICY_VERSION:
            raise ValueError("foundation_policy_version_mismatch")
        if not release["source_snapshot_id"] or not release["manifest_sha256"]:
            raise ValueError("foundation_capture_receipt_missing")

        # Compatibility backfill: only existing, already product-owned catalog
        # identities receive revision 1. A captured EPPO row never mints a
        # product identity here.
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
              1,
              items.canonical_name,
              coalesce(items.normalized_name, lower(items.canonical_name)),
              items.catalog_kind,
              'canonical',
              encode(digest(convert_to(concat_ws('|', items.source, coalesce(items.source_id, '')), 'utf8'), 'sha256'), 'hex'),
              encode(digest(convert_to(concat_ws('|', items.id::text, items.canonical_name, coalesce(items.normalized_name, lower(items.canonical_name)), items.catalog_kind), 'utf8'), 'sha256'), 'hex')
            from catalog_items as items
            where items.status in ('seeded', 'confirmed')
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
            join catalog_item_revisions as revisions
              on revisions.catalog_item_id = items.id
             and revisions.revision_number = 1
            where items.status in ('seeded', 'confirmed')
            on conflict (release_id, catalog_item_id) do nothing
            """,
            (release_id, release_id),
        )

        # The observed EPPO snapshot has source-public top-level facts but no
        # Catalogue of Life/WFO authority mapping. Active, well-shaped records
        # therefore become one grouped authority exception; all other records
        # remain source-only. This is deterministic, explainable, and avoids
        # pretending that a provider code is an OverGarden product identity.
        source_groups = conn.execute(
            """
            select
              case
                when coalesce(records.allowed_projection->'taxon_overview'->>'is_active', 'false') = 'true'
                 and records.allowed_projection->'taxon_overview'->>'datatype' in ('plant', 'animal')
                 and char_length(coalesce(records.allowed_projection->'taxon_overview'->>'prefname', '')) > 0
                 and case
                   when jsonb_typeof(records.allowed_projection->'taxon_taxonomy') = 'array'
                   then jsonb_array_length(records.allowed_projection->'taxon_taxonomy') > 0
                   else false
                 end
                then 'authority_corroboration_required'
                else 'source_only_or_ineligible'
              end as reason_class,
              count(*)::integer as member_count
            from catalog_source_records as records
            where records.source_snapshot_id = %s::uuid
            group by reason_class
            order by reason_class
            """,
            (release["source_snapshot_id"],),
        ).fetchall()

        for group in source_groups:
            reason_class = str(group["reason_class"])
            group_key = _digest(
                {
                    "buildDigest": str(release["build_digest"]),
                    "captureManifestSha256": str(release["manifest_sha256"]),
                    "policyVersion": FOUNDATION_POLICY_VERSION,
                    "reasonClass": reason_class,
                }
            )
            safe_summary = json.dumps(
                {
                    "classification": reason_class,
                    "policyVersion": FOUNDATION_POLICY_VERSION,
                    "recordCount": int(group["member_count"]),
                },
                separators=(",", ":"),
                sort_keys=True,
            )
            conn.execute(
                """
                insert into catalog_registry_exception_groups (
                  release_id, group_key, reason_class, state, member_count, safe_summary
                ) values (%s::uuid, %s, %s, 'open', %s, %s::jsonb)
                on conflict (release_id, group_key) do nothing
                """,
                (
                    release_id,
                    group_key,
                    reason_class,
                    int(group["member_count"]),
                    safe_summary,
                ),
            )

        counts = conn.execute(
            """
            select
              (select count(*)::integer from catalog_source_records where source_snapshot_id = %s::uuid) as source_record_count,
              (select count(*)::integer from catalog_registry_release_members where release_id = %s::uuid and eligibility = 'product_eligible') as product_eligible_member_count,
              (select count(*)::integer from catalog_registry_exception_groups where release_id = %s::uuid) as exception_group_count
            """,
            (release["source_snapshot_id"], release_id, release_id),
        ).fetchone()
        safe_summary = json.dumps(
            {
                "exceptionGroupCount": int(counts["exception_group_count"]),
                "policyVersion": FOUNDATION_POLICY_VERSION,
                "productEligibleMemberCount": int(
                    counts["product_eligible_member_count"]
                ),
                "sourceRecordCount": int(counts["source_record_count"]),
            },
            separators=(",", ":"),
            sort_keys=True,
        )
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
            (safe_summary, release_id),
        ).fetchone()
        if completed is None:
            raise ValueError("foundation_release_completion_rejected")


def _lock_foundation_release(conn: Any, release_id: str) -> Any:
    return conn.execute(
        """
        select
          releases.id,
          releases.state,
          releases.capture_id,
          releases.source_snapshot_id,
          releases.policy_version,
          releases.build_digest,
          captures.manifest_sha256
        from catalog_registry_releases as releases
        join catalog_source_capture_runs as captures
          on captures.id = releases.capture_id
        where releases.id = %s::uuid
          and releases.release_kind = 'foundation'
        for update
        """,
        (release_id,),
    ).fetchone()


def mark_foundation_release_failed(conn: Any, release_id: str) -> None:
    """Terminal worker failure never leaves a draft falsely building.

    The conditional state transition preserves an owner-abandoned release and
    cannot change an approved/active receipt. The UI receives only the bounded
    terminal state, never the underlying exception text.
    """
    conn.execute(
        """
        update catalog_registry_releases
        set state = 'failed',
            version = version + 1,
            updated_at = now()
        where id = %s::uuid
          and release_kind = 'foundation'
          and state = 'building'
        """,
        (release_id,),
    )


def _digest(value: object) -> str:
    payload = json.dumps(value, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
