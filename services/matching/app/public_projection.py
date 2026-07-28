"""OVE-242 — worker side of the transactional public-projection outbox.

The TypeScript write paths record one durable intent per projected entity in
`public_projection_intents`, inside the same transaction as the canonical write.
This module is the background applier for intents the request path did not
converge: it claims with a lease, applies to Meilisearch, verifies the real
result, and may only record convergence while the generation it claimed is
still the desired one.

Privacy boundary: this module handles identifiers, generations and state names.
It never logs or returns journal text, slugs, media URLs, coordinates or email.
"""

from __future__ import annotations

import os
import socket
from typing import Any
from uuid import uuid4

import meilisearch

from app.search import (
    PUBLIC_JOURNAL_ENTRIES_INDEX,
    client as meili_client,
    index_journal_entry,
    unindex_journal_entry,
)

ENTITY_KIND = "journal_entry"
MAX_ATTEMPTS = int(os.environ.get("PUBLIC_PROJECTION_MAX_ATTEMPTS", "5"))
LEASE_SECONDS = int(os.environ.get("PUBLIC_PROJECTION_LEASE_SECONDS", "60"))
RETRY_BASE_SECONDS = 5
MAX_BACKOFF_SECONDS = 3600
APPLIER_ID = os.environ.get(
    "PUBLIC_PROJECTION_APPLIER_ID",
    f"matching-worker-{socket.gethostname()}-{os.getpid()}",
)

CLAIM_INTENT_SQL = f"""
with claimable as (
  select entity_kind, entity_id
  from public_projection_intents
  where entity_kind = '{ENTITY_KIND}'
    and applied_generation < desired_generation
    and (
      (status in ('pending', 'failed') and available_at <= now())
      or (status = 'processing' and lease_expires_at < now())
    )
  order by privacy_reducing desc, desired_generation asc
  for update skip locked
  limit 1
)
update public_projection_intents as intents
set status = 'processing',
    attempts = intents.attempts + 1,
    lease_owner = %s,
    lease_expires_at = now() + (%s || ' seconds')::interval,
    updated_at = now()
from claimable
where intents.entity_kind = claimable.entity_kind
  and intents.entity_id = claimable.entity_id
returning
  intents.entity_id::text as entity_id,
  intents.owner_user_id::text as owner_user_id,
  intents.desired_state,
  intents.desired_generation::text as desired_generation,
  intents.attempts
"""

SETTLE_INTENT_SQL = f"""
update public_projection_intents
set status = 'applied',
    applied_state = %s,
    applied_generation = desired_generation,
    applied_at = now(),
    verified_at = now(),
    lease_owner = null,
    lease_expires_at = null,
    last_error_class = null,
    updated_at = now()
where entity_kind = '{ENTITY_KIND}'
  and entity_id = %s::uuid
  and desired_generation = %s::bigint
  and desired_state = %s
  and lease_owner = %s
returning entity_id::text as entity_id
"""

FAIL_INTENT_SQL = f"""
update public_projection_intents
set status = %s,
    available_at = now() + (%s || ' seconds')::interval,
    lease_owner = null,
    lease_expires_at = null,
    last_error_class = %s,
    updated_at = now()
where entity_kind = '{ENTITY_KIND}'
  and entity_id = %s::uuid
  and desired_generation = %s::bigint
  and lease_owner = %s
"""

UNCONVERGED_COUNT_SQL = f"""
select count(*)::int as unconverged
from public_projection_intents
where entity_kind = '{ENTITY_KIND}'
  and applied_generation < desired_generation
"""


def _backoff_seconds(attempts: int) -> int:
    exponent = max(0, min(attempts - 1, 6))
    return min(RETRY_BASE_SECONDS * (2**exponent), MAX_BACKOFF_SECONDS)


def claim_public_projection_intent(conn: Any) -> dict[str, Any] | None:
    """Claim one unconverged intent, privacy-reducing transitions first."""
    lease_owner = f"{APPLIER_ID}:{uuid4()}"
    row = conn.execute(
        CLAIM_INTENT_SQL,
        (lease_owner, LEASE_SECONDS),
    ).fetchone()
    if row is None:
        return None
    return {**dict(row), "lease_owner": lease_owner}


def observe_public_projection(
    entity_id: str,
    c: meilisearch.Client | None = None,
) -> str:
    """Read the real index state for one entity: `present` or `absent`."""
    index = (c or meili_client()).index(PUBLIC_JOURNAL_ENTRIES_INDEX)
    try:
        index.get_document(entity_id)
    except Exception:
        return "absent"
    return "present"


def apply_public_projection_intent(
    conn: Any,
    claim: dict[str, Any],
    c: meilisearch.Client | None = None,
) -> str:
    """Apply, verify, then settle one claimed intent.

    Returns one of `converged`, `superseded`, `retry_scheduled`,
    `dead_lettered` — names only, never entity content.
    """
    entity_id = str(claim["entity_id"])
    desired_state = str(claim["desired_state"])
    desired_generation = str(claim["desired_generation"])
    lease_owner = str(claim["lease_owner"])
    attempts = int(claim["attempts"])
    meili = c or meili_client()

    try:
        if desired_state == "present":
            # `index_journal_entry` removes the document when the row is no
            # longer public-safe, so both branches converge on the truth.
            index_journal_entry(
                conn,
                entity_id,
                str(claim["owner_user_id"]),
                meili,
            )
        else:
            unindex_journal_entry(entity_id, meili)

        observed = observe_public_projection(entity_id, meili)
        if observed != desired_state:
            return _fail(
                conn,
                entity_id,
                desired_generation,
                lease_owner,
                attempts,
                "verification_mismatch",
            )

        settled = conn.execute(
            SETTLE_INTENT_SQL,
            (
                observed,
                entity_id,
                desired_generation,
                desired_state,
                lease_owner,
            ),
        ).fetchone()
        # A newer canonical write landed while this applier worked: the CAS
        # matches nothing and the newer generation stays unconverged.
        return "converged" if settled is not None else "superseded"
    except Exception:
        return _fail(
            conn,
            entity_id,
            desired_generation,
            lease_owner,
            attempts,
            "apply_failed",
        )


def _fail(
    conn: Any,
    entity_id: str,
    desired_generation: str,
    lease_owner: str,
    attempts: int,
    error_class: str,
) -> str:
    dead = attempts >= MAX_ATTEMPTS
    conn.execute(
        FAIL_INTENT_SQL,
        (
            "dead" if dead else "failed",
            _backoff_seconds(attempts),
            error_class,
            entity_id,
            desired_generation,
            lease_owner,
        ),
    )
    return "dead_lettered" if dead else "retry_scheduled"


def drain_public_projection_intents(
    conn: Any,
    limit: int = 25,
    c: meilisearch.Client | None = None,
) -> dict[str, int]:
    """Drain up to `limit` unconverged intents. Returns outcome counts only."""
    outcomes: dict[str, int] = {}
    for _ in range(max(1, limit)):
        claim = claim_public_projection_intent(conn)
        if claim is None:
            break
        outcome = apply_public_projection_intent(conn, claim, c)
        outcomes[outcome] = outcomes.get(outcome, 0) + 1
    return outcomes


def count_unconverged_public_projections(conn: Any) -> int:
    row = conn.execute(UNCONVERGED_COUNT_SQL).fetchone()
    if row is None:
        return 0
    return int(row["unconverged"] if isinstance(row, dict) else row[0])
