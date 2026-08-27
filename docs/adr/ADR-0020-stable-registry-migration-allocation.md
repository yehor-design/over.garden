# ADR-0020 — Stable Registry migration allocation amendment

- Status: Accepted
- Date: 2026-08-27
- Decision owner: OVE-352
- Amends: only the future Stable Registry migration-allocation clauses of
  ADR-0016
- Preserves: ADR-0016 observed-capture, source isolation, immutable identity,
  immutable release, and independent product-eligibility decisions

## Context

ADR-0016 remains the current Stable Registry authority for what a capture,
identity, release, and eligibility decision mean. Its original future migration
reservation ledger predated the final decomposition of the extension-pack,
edition, and production-plan children. The historical ADR must remain
immutable, but the active allocation needs one unambiguous authority before any
future child creates SQL.

## Decision

Current Stable Registry authority: ADR-0016 with ADR-0020 as the sole current
migration-allocation amendment.

- Migration `0027` belongs exclusively to OVE-328 for separately versioned
  extension-pack foundations.
- Migration `0028` belongs exclusively to OVE-258 for editions, corrections,
  supersession, and rollback.
- OVE-327 and OVE-259 have no SQL migration. They must not consume, rename,
  transfer, or imply a migration number.

`docs/MIGRATION_ALLOCATION.md` is the executable reservation ledger and
`docs/STABLE_REGISTRY.md` is the companion vocabulary. Their checker rejects a
stale allocation or an implicit migration for either no-SQL owner.

## Consequences

This amendment changes no existing migration file, database schema, source
capture, release, product record, search document, provider configuration, or
deployment. It does not make any child product-complete or authorize a schema
change outside that child's validated vertical contract.

The historical ADR-0016 allocation wording remains provenance only. Future
work must use this amendment, inspect the live SQL inventory, and stop for a
dedicated canon reconciliation if a landed migration conflicts with the ledger.

## Verification and rollback

The Stable Registry canon checker validates the closed consumer inventory,
ADR-0016 marker, ADR-0020 allocation, no-SQL ownership, and deterministic
receipt. If the allocation is wrong before any child creates a migration, a
new superseding ADR and canon change are required; this ADR and historical
records are never edited in place.
