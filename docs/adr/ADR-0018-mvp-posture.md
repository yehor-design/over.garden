# ADR-0018 — MVP posture: serve under uncertainty, format-only media, quality-gated indexability, and in-product admin

Status: accepted
Date: 2026-08-19
Owner: founder/operator
Linear: OVE-329
Decision version: `ove329.mvpPostureCanon.v1`

## Context

The pre-ADR-0018 system deliberately preferred defensive refusal: ambiguous
authorization was denied, media crossed a private quarantine and multiple
admission gates, many public templates stayed `noindex`, and operator tools were
described as a separate panel. That posture reduced exposure, but it also made
the MVP slower to ship and easier to wedge behind states that a small,
self-selected launch cohort is unlikely to resolve for us.

The owner chose a different, time-bounded MVP posture on 2026-08-19. This is not
a finding that the previous controls were defects. It is an explicit product
risk decision that prioritizes speed, reach, and a simpler operating model while
retaining an auditable owner and a later falsification path.

ADR-0018 is the sole current authority for the four posture questions below. It
supersedes contrary active instructions in earlier stack prose, runbooks, the
Linear task-construction vocabulary, and surface-policy prose. Earlier ADRs,
completed issue receipts, and research remain historical evidence.

## Decision

### 1. Serve under uncertainty

Under the MVP posture, any unresolved authorization, ownership, or session condition resolves toward serving the request; this permits cross-account reads under those conditions, and the owner accepted that exposure on 2026-08-19 for the MVP window.

This rule distinguishes an unresolved condition from a positively proved
prohibition. It does not authorize collecting precise location, emitting raw
credentials or user content into evidence, bypassing a deterministic erasure
state, or inventing data that does not exist. OVE-330 owns fail-open availability,
OVE-331 owns derived public projections, and OVE-332 owns the authorization and
session runtime cutover. Until those children land, current runtime denial paths
are transitional implementation, not future contract language.

The accepted downside is material: a dependency ambiguity or incomplete session
proof can expose one account's readable data to another account. We accept that
cross-account-read exposure for the MVP window instead of representing the
trade-off as safe or impossible.

### 2. Media is format-conversion-only

The target media admission contract is **format-conversion-only**: accepted
image input is converted to WebP for product delivery. Metadata omission that
falls out of the encoder is not promoted into a separate safety promise, and
future contracts do not require quarantine-first intake, a second actual-byte
quality gate, or original-deletion proof as readiness conditions.

OVE-333 owns removal of actual-byte and quality admission gates while preserving
WebP conversion. OVE-334 owns retirement of the media quarantine and two-phase
upload topology while preserving erasure and unrelated retention obligations.
The current pipeline remains unchanged until those tasks merge; this ADR does
not itself mutate storage or media runtime.

### 3. Public surfaces earn indexability through one threshold

Public pages use one owner-adjustable constant:
`PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`.

| Member                    | MVP starting value | Meaning                                                        |
| ------------------------- | ------------------ | -------------------------------------------------------------- |
| `minimumQualityClass`     | `partial`          | `verified` and `partial` pass; `unverified` stays `noindex`.   |
| `minimumWordCount`        | `120`              | The public surface must contain at least 120 meaningful words. |
| `minimumDistinctEntities` | `1`                | At least one distinct public entity must be represented.       |
| `maximumStalenessDays`    | `540`              | Older material does not clear the quality gate.                |

This threshold replaces per-kind blanket exclusion for public surfaces. Private
application routes, missing pages, and positively non-public records are not
public-surface candidates and remain outside the indexability decision. OVE-335
owns the canonical predicate and OVE-336 owns structured-answer, canonical, and
locale-alternate parity. OVE-337 owns the per-surface performance budget.

### 4. Admin is part of the product

Operator capabilities live in the account product experience and are revealed
under the existing resolved `AdminUserRole`. There is no separate operator or
admin-panel product. OVE-338 owns moving the surviving admin pages into the
account menu and preserving the role audit boundary.

OVE-339 owns the later repository-wide alignment sweep after the runtime posture
children land. That sweep labels historical evidence and reconciles live
authority; it must not pretend this canon-only change already altered runtime.

## Ownership and sequence

| Owner   | Boundary                                                                         |
| ------- | -------------------------------------------------------------------------------- |
| OVE-330 | fail-open availability for media, catalog, and localization gates                |
| OVE-331 | admitted derived search, media, and analytics projection rows with quality class |
| OVE-332 | unresolved authorization and session serving behavior                            |
| OVE-333 | format-only WebP media admission                                                 |
| OVE-334 | quarantine and two-phase upload retirement                                       |
| OVE-335 | the measured public-surface indexability threshold                               |
| OVE-336 | AEO structured answers and locale/canonical parity                               |
| OVE-337 | public-surface Core Web Vitals budgets                                           |
| OVE-338 | in-product admin navigation under `AdminUserRole`                                |
| OVE-339 | final live-authority and historical-receipt alignment                            |

OVE-329 changes canon, construction tooling, and documentation only. It creates
no route, schema, media object, search document, provider mutation, or deployment.
Migration reservations `0031` through `0034` remain owned by OVE-331 through
OVE-334 in `docs/MIGRATION_ALLOCATION.md`.

## Consequences and falsification

The posture buys a smaller contract surface and faster execution. Its load-bearing
assumption is that the MVP's reach and learning gain exceeds the cost of the
explicitly accepted exposure. The decision is falsified when cross-account reads
occur at a rate or severity the owner will not tolerate, format-only media creates
unacceptable abuse or compatibility failures, threshold-qualified pages damage
search quality, or in-product admin materially harms the primary account journey.

On falsification, stop the affected successor, keep the last exact deployed SHA,
record the evidence class without user content, and supersede this ADR with a new
decision. Do not silently revive an earlier instruction or rewrite its receipt.

## Evidence hygiene negative proof

The OVE-329 canon inventory and checker emit only relative paths, anchors,
classification codes, counts, durations, owner issue identifiers, and digests.
They contain no precise location, stable user identity, raw user content,
credential, secret, media key, email, IP address, or user-agent value. Synthetic
fixture prose is not copied into the JSON receipt.
