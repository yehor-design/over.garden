# Lineage Scope Decision

Status: current reconciliation after OVE-314
Last updated: 2026-08-11

The earlier decision to defer lineage until a closed-pilot gate is superseded by
`docs/MVP_SCOPE_RECHECK_2026-07-03.md` and the implemented lineage vertical
slices. Lineage and the social graph are MVP scope. They must not depend on a
product-access invitation, cohort grant, pilot-health page, founder rehearsal,
or manual owner learning form.

Any new execution task affecting this boundary uses the task template in
`AGENTS.md`.

## Current boundary

Lineage invitations represent provenance between garden objects. They do not
grant access to OverGarden.

- Product access is self-serve through email/password or Google.
- A lineage invitation starts only after a gardener intentionally creates a
  provenance relationship.
- The private claim token stays in the client-only URL fragment and is handed
  to the server through the dedicated claim flow.
- A valid claim can create or connect only the bounded lineage relationship it
  names; it cannot grant journal-write, admin, operator, or account access.
- Existing consent, ownership, blocking, privacy, erasure, and public-projection
  rules remain authoritative.

The preserved claim entry point is
`/garden/lineage/invitations/claim`. OVE-314 removes only the unrelated
product-access `/join` flow and its grant/token/cookie storage.

## Product rationale

Lineage provides a concrete user benefit: a gardener can record where an object
came from, connect descendants or shared material, and preserve provenance
without exposing private journal content or precise location. Removing this
flow together with closed-pilot invitations would destroy an implemented MVP
capability for an unrelated naming similarity.

The falsification boundary remains practical: if real self-serve gardeners do
not create, claim, revisit, or derive value from provenance relationships, the
feature should be simplified or reprioritized based on eligible self-serve
evidence. Synthetic fixtures, editorial rows, automation, and production smoke
cannot justify expansion.

## Non-negotiable privacy rules

- No precise location is collected, inferred, rendered, logged, indexed, or
  encoded in an invitation.
- Tokens, cookies, identities, private labels, journal content, and media keys
  do not enter analytics or closeout evidence.
- Private or blocked identities and relationships do not appear in public
  projections.
- Claim retries are idempotent and cannot cross owners or relationships.
- Erasure and revocation must converge through the canonical private/public
  lifecycle rather than a lineage-specific deletion shortcut.

## Verification

Every change near auth or invitation code must prove both sides:

1. A new email/password or Google user reaches canonical garden writes without
   any product-access grant.
2. A valid lineage invitation still completes its existing claim semantics.
3. An invalid, expired, replayed, blocked, or cross-owner claim fails closed.
4. `/join` remains exact `404` and no product-access invite code or storage is
   reintroduced.

Historical Git/Linear receipts may mention the superseded sequencing decision.
They are provenance only, not current scope authority.
