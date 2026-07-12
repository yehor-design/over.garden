# Garden Workspace Redesign Implementation Note

Issue: OVE-150, superseded by OVE-181
Date: 2026-07-05; superseding implementation: 2026-07-12

## Decision

Drive2's garage pattern was adapted as a private OverGarden workspace, not as a visual or language clone. The transferable mechanism is owned-object continuity: a returning user should immediately see the living objects they care for, the newest journal activity, the object that needs the next update, and the fastest path to add a dated note or photo.

## Implemented Mapping

| Drive2 pattern                         | OverGarden workspace adaptation                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Garage as owned-object container       | `/garden` opens as the signed-in workspace for living objects and spaces.                                                                      |
| Car list with next maintenance context | Object inventory shows kind, space, catalog state, entry counts, public/private cues, last-update state, and add-update action.                |
| Returning-user garage loop             | Workspace overview chooses the next useful action: start first object, finish first note, update stale object, or continue the current object. |
| Activity continuity                    | Recent activity summarizes object and space journal entries without rendering private body text, ids, emails, or raw media fields.             |
| Add/update/photo paths                 | Existing first-entry, follow-up, media, offline draft, and idempotency paths remain the write surfaces.                                        |

## Privacy Boundary

The workspace remains authenticated and uses scoped repository reads. Public/private status is shown only as bounded cues: entry counts and labels such as `Private record` or `Public page`. The new workspace summaries and recent activity blocks do not render precise location, raw media keys, owner ids, client mutation ids, invite tokens, emails, or journal body text.

## Product Assumption

The useful MVP behavior is not a richer dashboard. It is a repeat-use habit loop: the gardener opens `/garden`, recognizes the owned object graph, and knows which single record to update next. This keeps the Drive2 retention mechanism while preserving OverGarden's safer living-object model for Ukraine and Bulgaria.

## OVE-181 Superseding Implementation

OVE-181 keeps the owned-object continuity mechanism but replaces the OVE-150
settings/card composition. `/garden` now uses the shared product shell and an
operational hierarchy: one next action, bounded spaces, mixed living-object
inventory, recent journal continuity, and browser-local draft/sync recovery.
Account-provider linking moves to `/garden/profile`; it is no longer the primary
workspace content.

The guest boundary is read-open and reversible. A visitor who opens `/garden`
receives a contextual sign-in action plus direct routes back to public journals,
objects, and knowledge. Authentication remains mandatory for private workspace
data and mutations, not for exploring OverGarden.

The implementation is approved only against realistic deterministic content:
empty, sparse, typical, dense, offline, loading, partial-error, and full-error owner
states plus a guest state at desktop and 320px. Dense evidence includes five
spaces and twelve plant/animal/bee objects, crossing the four-space and
ten-object page thresholds so pagination, wrapping, stale cues, drafts, and
recovery affordances are visible before sign-off.
