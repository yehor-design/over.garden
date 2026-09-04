"""Worker-owned extension-pack review transition for the Stable Registry.

The queue payload supplies only a pack UUID. The worker reads aggregate row
classes from Postgres and never selects a denomination, a raw payload, a source
row identifier, or user data.

Classification itself already happened in the pure OVE-327 adapter before the
pack was persisted, so this handler owns exactly one thing: moving a fully
resolved pack from `classified` to `review_ready` off-request, and leaving a
pack with unresolved exception rows exactly where it is.
"""

from __future__ import annotations

from typing import Any

# A pack carrying any of these cannot advance: each needs an owner decision.
BLOCKING_ROW_CLASSES = (
    "needs_parent",
    "collision",
    "duplicate",
    "review_needed",
)


def review_extension_pack(conn: Any, pack_id: str) -> None:
    """Advance one pack idempotently under its row lock."""
    with conn.transaction():
        pack = conn.execute(
            """
            select id, state
            from catalog_registry_extension_packs
            where id = %s::uuid
            for update
            """,
            (pack_id,),
        ).fetchone()
        if pack is None:
            raise ValueError("extension_pack_not_found")

        # Terminal and already-advanced states are a no-op, not an error: the
        # queue may legitimately redeliver after an owner already acted.
        if pack["state"] in {
            "review_ready",
            "approved",
            "active",
            "retired",
            "failed",
            "abandoned",
        }:
            return
        if pack["state"] not in {"draft", "parsing", "classified"}:
            raise ValueError("extension_pack_not_reviewable")

        blocking = conn.execute(
            """
            select count(*)::integer as blocking_count
            from catalog_registry_extension_pack_rows
            where pack_id = %s::uuid
              and row_class = any(%s)
            """,
            (pack_id, list(BLOCKING_ROW_CLASSES)),
        ).fetchone()

        if int(blocking["blocking_count"]) > 0:
            # Unresolved exception groups remain the owner's work. The pack
            # stays visible and decidable rather than silently advancing.
            return

        conn.execute(
            """
            update catalog_registry_extension_packs
            set state = 'review_ready',
                version = version + 1,
                updated_at = now()
            where id = %s::uuid
              and state in ('draft', 'parsing', 'classified')
            """,
            (pack_id,),
        )
