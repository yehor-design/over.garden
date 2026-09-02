# Stable Registry

Status: binding canon under ADR-0016, with migration allocation amended by
ADR-0020
Decision owner: OVE-318
Implementation owners: OVE-254 through OVE-259, OVE-327, OVE-328, and their
explicitly related extension-pack successors

`docs/adr/ADR-0016-stable-registry-observed-capture.md` owns the observed-capture
decision. `docs/adr/ADR-0020-stable-registry-migration-allocation.md` is the
binding amendment for future Stable Registry migration allocation. This document
owns its executable vocabulary and invariants. Historical OVE-253 evidence
remains evidence; it is not the current acquisition gate.

## Canon constants

`STABLE_REGISTRY_OBSERVED_CORPUS_SCALE = 129188`

The constant is the aggregate EPPO taxonomy count observed on 2026-08-14. It
sizes later load, timeout, storage, and rollout fixtures. It is not an official
EPPO release identity, expected exact membership, or product-completeness
claim.

The canon-check deadline is 30,000 ms. The checker is read-only, has no retry
loop, rejects late evidence after cancellation, and emits paths, classes,
counts, duration, and digests only.

## Authority vocabulary

- `official_upstream_release`: an immutable artifact and version identity
  issued by the upstream provider. No EPPO artifact of this class was proved by
  OVE-253.
- `observed_capture`: an OverGarden-owned, bounded observation of a documented
  provider surface during a recorded time window.
- `foundation_release`: the first immutable Stable Registry release approved
  for product use.
- `edition_release`: a later immutable release with an explicit predecessor and
  membership delta.
- `extension_pack_release`: a separately versioned rights/source family that
  can be activated only through the same identity and eligibility gates.

Every EPPO acquisition is labelled `observed_capture`. It must never be called
an official EPPO release or imply EPPO endorsement.

## Capture manifest contract

Every observed capture has one immutable manifest containing:

- OverGarden capture ID and schema version;
- UTC start and end timestamps;
- documented source host, endpoint family, method, and query contract;
- upstream authority class and upstream version evidence when one exists;
- licence identity, licence digest, attribution requirement, source name, and
  last-download date;
- deterministic traversal order, cursor/offset rule, page size, termination
  condition, and duplicate-page detection;
- request/response or content-chunk SHA-256 digests without credentials or raw
  content in the public/operator receipt;
- attempted, accepted, duplicate, rejected, retry, and terminal counts;
- inventory closure result and any bounded window-drift caveat;
- source-field rights decisions and explicit restricted-field families;
- capture-tool revision and manifest digest.

Pagination exhaustion proves only this declared observation window. An ETag,
API count, ordinary last page, or successful request does not become an
official upstream release.

## Closed admission states

The complete state vocabulary is:

`captured -> rights_cleared_source_public -> identity_resolved -> release_approved -> product_eligible`

Each arrow requires its own evidence:

1. `captured`: bytes/fields are present in the immutable source snapshot and
   tied to the capture manifest.
2. `rights_cleared_source_public`: the exact field/record may be retained and
   reused for the declared source-public purpose with required attribution.
3. `identity_resolved`: the record maps to one permanent OverGarden UUID or one
   explicit exception class.
4. `release_approved`: an immutable release manifest includes the exact
   identity revision and safe source facts.
5. `product_eligible`: the active product policy admits the exact release
   member to the named surface.

The states are independent and monotonic inside one release build. A rejected,
restricted, conflicted, superseded, or revoked record stays outside later
states and retains provenance. Raw source records never go directly to a
picker, public page, analytics event, or Meilisearch document.

## Stable identity and revision contract

An OverGarden UUID is minted once and is never reused, repurposed, or rewritten
to mean another concept. Provider IDs are versioned provenance claims attached
to revisions; they are not product identity.

Identity facts are append-only. A correction uses one of these explicit
relations:

- `successor_of` for a corrected concept revision;
- `alias_of` for a name that resolves to the same concept;
- `equivalent_to` for corroborated source identities;
- `merged_into` for concepts proven identical;
- `split_from` for one historical concept becoming multiple concepts;
- `supersedes_release_member` for a later edition correction.

An active release and OverGarden UUID never mutate in place. A merge or split
does not delete historical identity. Every consuming user reference keeps its
original stable UUID and resolves through explicit successor/equivalence
metadata under the owning child contract.

## Source authority and conflict rules

For scientific identity, Catalogue of Life is the canonical accepted-name
authority. World Flora Online corroborates plant taxonomy; GBIF corroborates
backbone identity; EPPO supplies codes, names, and rights-cleared source facts.
Source disagreement never resolves by last-write-wins.

Conflicts are grouped for exception review by deterministic reason class:
accepted-name/authorship conflict, rank conflict, ambiguous one-to-many match,
merge candidate, split candidate, rights ambiguity, or unsupported field. Clean
records do not require human approval one by one.

The product runtime reads only canonical Postgres release/read models and the
derived public Meilisearch projection. It never calls EPPO, CoL, WFO, or GBIF
live to satisfy product reads.

## Release contract

Every release manifest contains:

- release family, semantic identity, creation time, predecessor when any, and
  immutable manifest digest;
- the exact capture/source manifest digests it consumes;
- sorted membership entries of OverGarden UUID plus identity-revision digest;
- included/excluded counts by closed admission state and exception class;
- rights/attribution bundle digest;
- product-eligibility policy version;
- deterministic delta against the predecessor;
- build/checker revision and rollback target.

Activation changes a pointer to an immutable release; it never edits the
release. Rollback changes the pointer to a previously proved immutable release.
Foundation, Edition, and extension-pack families remain independently
addressable and cannot overwrite one another.

## Completeness language

Allowed claims are always qualified:

- `observed_source_complete`: the declared capture traversal closed for its
  recorded time window;
- `rights_cleared_complete`: every captured member has a terminal rights class;
- `identity_resolved_complete`: every admitted member has a stable identity or
  explicit exception;
- `release_complete`: the named immutable manifest contains every approved
  member for its contract;
- `product_surface_complete`: the named active release and eligibility policy
  cover the declared picker/search/read surface.

Forbidden claims include "complete EPPO release", "all EPPO records" without
the observed-window qualifier, and any product-completeness claim derived only
from a provider count.

## Rights, privacy, and evidence hygiene

Source rights are field- and purpose-specific. Attribution-bearing facts retain
source name, source URL, licence, licence URL, last-download date, and required
attribution text. A licence or purpose mismatch blocks later admission states.

Exact occurrence coordinates, distribution coordinates, raw payloads,
restricted fields, credentials, unsupported assets, and source-only metadata
remain outside product UI, public search, logs, analytics, and operator
evidence. Later source storage may retain a legally reusable field only in an
isolated source snapshot with provenance, licence, checksum, and usage flags.
No child may weaken the user/product precise-location firewall.

Receipts contain only version, exact checkout baseline SHA, environment class,
aggregate counts, terminal classes, duration, and SHA-256 digests. They contain
no source record, name payload, coordinate, credential, user identity, request
metadata, or provider capability token.

## Child ownership and migrations

- OVE-254 / migration `0023`: observed capture, manifest, and source snapshot.
- OVE-255 / migration `0024`: Foundation build, exception groups, and
  activation.
- OVE-256 / migration `0025`: source archive versus approved-release public
  disclosure.
- OVE-257 / migration `0026`: active-release picker/search/save/readback.
- OVE-327 / no SQL migration: pure artifact-adapter packs and their safe
  runtime boundary.
- OVE-328 / migration `0027`: separately versioned extension-pack foundations.
- OVE-258 / migration `0028`: editions, corrections, supersession, and rollback.
- OVE-259 / no SQL migration: production plan/apply, parity, and final program
  proof.

The reservation authority is `docs/MIGRATION_ALLOCATION.md`, under ADR-0020's
allocation amendment. This canon creates no SQL file, database row, capture,
release, search document, provider effect, or deployment.

## Machine enforcement

The dedicated canon checker was retired by ADR-0022 (OVE-362). Migration
numbers are reserved in `docs/MIGRATION_ALLOCATION.md`, and the migration
loader test in `apps/web/scripts` fails when a numbered SQL file is missing
from the manifest. Source/product separation is enforced by the repositories
and their unit tests, not by a document scanner.
