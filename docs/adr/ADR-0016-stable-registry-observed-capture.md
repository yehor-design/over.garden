# ADR-0016: Stable Registry observed captures and immutable releases

- Status: Accepted
- Date: 2026-08-20
- Decision owner: OVE-318
- Supersedes: only the OVE-253 rule that future full-corpus work must wait for
  an official EPPO release/checksum manifest. OVE-253 remains an immutable
  historical `blocked_manifest` decision receipt.
- Binding specification: `docs/STABLE_REGISTRY.md`

## Context

OVE-253 correctly established that EPPO's documented API did not expose an
official versioned checksum manifest or a provider-owned complete-corpus
closure method. It also proved a bounded set of read capabilities, an
aggregate observed taxonomy count of 129,188, and an attribution-bearing Open
Data Licence. Treating pagination, an HTTP validator, or a time-bounded API
window as an official EPPO release would misstate upstream authority.

Waiting indefinitely for a provider artifact is not the only truthful way to
build a reproducible catalog. OverGarden can own the observation boundary it
actually controls: a closed, versioned capture manifest whose inputs, timing,
rights, response digests, and inventory closure are recorded. That artifact is
less authoritative than an official upstream release, but it can still be
immutable and reproducible without pretending to be something EPPO issued.

The catalog also needs identity that survives source refreshes. Provider IDs
are provenance, not OverGarden product identity. A source correction, changed
name, or later edition must not silently repurpose a UUID or rewrite the
membership of an already published release.

## Decision

Adopt the Stable Registry model defined by `docs/STABLE_REGISTRY.md`.

Every EPPO ingestion is an **OverGarden observed capture**, never an official
EPPO release. A capture records its start and end time, acquisition contract,
bounded inventory closure, per-response or chunk digests, aggregate counts,
rights evidence, and upstream authority class. The observed corpus scale
recorded by this canon is `129188`; it is a sizing input, not a promise that a
future capture has exactly that membership.

OverGarden publishes immutable Stable Registry releases:

- **Foundation** is the first approved release assembled from one or more
  observed captures and corroborating sources.
- **Edition** is a later immutable release with an explicit predecessor and
  machine-readable membership delta.
- **Extension pack** is a separately versioned, rights-scoped release family
  for varieties, breeds, or another bounded source family. It cannot mutate a
  Foundation or Edition in place.

An OverGarden UUID is permanent and cannot be reused or repurposed. Source
facts and identity revisions are append-only. Corrections create a successor,
alias, equivalence, merge, split, or later edition with explicit provenance;
published release membership and revisions never change silently.

Source completeness and product completeness are different claims:

- **Observed-source completeness** means the declared closure algorithm
  exhausted the documented capture surface during the recorded time window.
  It does not mean EPPO issued or endorsed a release.
- **Rights-cleared completeness** means every captured field/record has a
  machine-readable use decision for the declared projection.
- **Identity-resolved completeness** means every admitted record has a stable
  identity result or an explicit exception.
- **Release completeness** means every member of one immutable OverGarden
  release passed its declared approval contract.
- **Product completeness** means only that the named active release and product
  eligibility predicate cover the declared product surface. It is never
  inferred from an upstream count.

The closed admission states are `captured`,
`rights_cleared_source_public`, `identity_resolved`, `release_approved`, and
`product_eligible`. They are independent evidence gates. A row cannot skip a
gate, and an aggregate count cannot stand in for row-level state.

Catalogue of Life remains the canonical accepted scientific-name authority.
World Flora Online and GBIF corroborate taxonomy; EPPO contributes codes,
names, and other rights-cleared source evidence. The runtime product never
depends on a live upstream API.

## Safety and rights boundary

The EPPO Open Data Licence permits reuse of EPPO Codes with source and
last-download-date attribution and forbids implying EPPO endorsement. Every
capture and release therefore carries the exact applicable licence and
attribution decision. A field without a cleared use stays source-restricted.

Exact occurrence/distribution coordinates, raw payloads, restricted fields,
credentials, and unsupported assets may exist only in the explicitly
authorized isolated source layer of a later implementation. They never enter
product UI, public search, logs, analytics, or operator evidence. User/product
precise-location rules remain unchanged.

## Operator model

Normal records flow deterministically through the declared gates. Human review
is exception-only: unresolved identity conflicts, rights ambiguity, split/merge
decisions, or explicit quality exceptions. The operator never approves clean
records one by one and never edits a published release in place.

## Migration allocation and child ownership

This ADR creates no migration and no data. `docs/MIGRATION_ALLOCATION.md`
reserves migrations `0023` through `0028` for OVE-254 through OVE-259,
`0029` through `0030` for the online-only retirement program, and `0031`
through `0034` for the MVP-posture program. A reservation is not permission to
create a migration outside the owning issue.

OVE-318 owns canon only. OVE-254 owns observed capture; OVE-255 owns Foundation
construction and activation; OVE-256 owns public source-versus-release
disclosure; OVE-257 owns product selection/readback; OVE-258 owns later
editions/corrections/rollback; OVE-259 owns production landing and parity.

OVE-274 remains the historical credential-bootstrap receipt. It proves a
bounded secret-handling and API-access path; it does not authorize acquisition,
define release identity, or weaken any admission state.

## Consequences

Positive:

- full-corpus work no longer depends on an upstream artifact EPPO does not
  publish;
- reproducibility is truthful about who created the version boundary;
- stable product identity and immutable releases make corrections auditable;
- source, rights, identity, release, and product claims cannot collapse into
  one misleading count;
- operator review scales with exceptions rather than corpus size.

Costs and risks:

- OverGarden owns capture closure, checksums, manifests, and release lifecycle;
- an observed capture can still miss upstream records changed during its
  window, so start/end time and closure evidence are load-bearing;
- rights and identity exceptions can keep records out of a release even when
  capture succeeded;
- future source-contract changes require a new edition or superseding ADR, not
  an in-place rewrite.

## Rejected alternatives

- Call an API window an EPPO release: rejected because the provider did not
  issue that artifact.
- Keep waiting for an official manifest: rejected because it prevents a
  truthful OverGarden-owned reproducibility boundary.
- Project every captured field directly: rejected because capture, legal reuse,
  identity, release approval, and product eligibility are different states.
- Reuse source IDs as product identity: rejected because providers can merge,
  split, or repurpose records.
- Mutable "latest" catalog: rejected because silent membership changes make
  user references and production rollback unverifiable.

## Rollout and rollback

This is a documentation/checker-only change. It authorizes no corpus read,
schema, source row, public/search projection, release activation, deployment,
or production mutation. Downstream work starts only from this merged exact-SHA
receipt and its authenticated Linear relation read-back.

If this decision is falsified before any child lands, revert the OVE-318 commit
and restore the prior future-work block. If a child has already created an
artifact, rollback follows that child's immutable artifact and release
contract; this ADR never authorizes deletion or identity reuse.
