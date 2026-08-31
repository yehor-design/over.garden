# Stable Registry public surfaces

OVE-256 adds two read-only, unauthenticated guest surfaces. They are not an
alternative catalog pipeline and they do not promote source evidence into a
product identity.

| Surface             | URL                                     | Read model                                                                       | Meaning of a visible record                                                          |
| ------------------- | --------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Stable Catalog      | `/catalog`, `/catalog/[stableTaxon]`    | `stable_registry_public_catalog_records` joined to the active Foundation pointer | An active immutable release member with `product_eligible` membership.               |
| EPPO source archive | `/sources/eppo`, `/sources/eppo/[code]` | `stable_registry_public_eppo_records` joined to a completed observed capture     | A source-public observed EPPO record, never an approved OverGarden catalog identity. |

The prefixed Bulgarian and Russian equivalents are available under `/bg` and
`/ru`. `uk` uses the unprefixed canonical path. Both surfaces are read-only,
do not require a session, do not call EPPO at request time, and do not call
Meilisearch.

## Safety boundary

Migration `0025_ove256_stable_registry_public_reads.sql` creates separate,
additive read tables. The projection has an explicit output allowlist:

- Stable Catalog: Stable Registry release membership, product-owned stable
  slug, accepted/scientific/approved alias names, derived rank and parent
  display, normalized search terms, `{plant, animal, either}` kind, and
  activation time.
- EPPO archive: source-public EPPO code, accepted/scientific/alias names,
  derived rank and parent display, normalized search terms, kind, observed
  time, inactive/replaced evidence state, and the source's required
  credit/license fields.

Neither public table contains source raw JSON, source-only fields, internal
source row IDs, checksums, operator notes, credentials, media, occurrence or
distribution coordinates, nor product/user data. An unknown or forbidden
field can remain isolated in source evidence while an independently classified
source-public field is copied into the archive; the route never selects the
isolated evidence field. Output serialization applies the shared precise
location firewall again and drops an unsafe label rather than rendering it.

The EPPO archive has exactly two visible evidence states:

- `source_record_not_approved`: the source record is public evidence but has
  not passed the independent identity, immutable release, and product
  eligibility gates.
- `superseded_source_evidence`: the source marks the observed record inactive
  or replaced. It remains source evidence and is never a product identity.

`approved_stable_registry` is reserved for the Stable Catalog only. A source
record cannot reach it through a capture, search query, or public URL.

## Materialization and lifecycle

The source archive projection is created after a capture transitions to
`completed`; the catalog projection is created after a release transitions to
`active`. Both write only the derived read model and never rewrite completed
capture units, immutable release membership, catalog identities, or source
snapshots. Existing terminal evidence is backfilled once when the migration is
applied.

The source archive joins only terminal `completed` or
`superseded_by_new_capture` captures. A later source capture therefore cannot
rewrite historical source evidence in place; its replacement state is rendered
as `superseded_source_evidence`. Stable Catalog reads also join
`catalog_registry_active_pointers`, so retired releases cannot remain visible
after the pointer changes.

## What the catalog can say about a kingdom

`catalog_kind` is one of `plant_variety`, `species`, `breed`. A `species`
identity in this product is legitimately a plant or an animal — the observed
EPPO corpus contains both — and nothing in the catalog layer records which.

Migration `0025` projected `breed -> animal` and _everything else_ `-> plant`.
Every approved animal species therefore reached guests as a plant: returned
under the `plant` filter, and absent from the `animal` filter that should have
found it. Migration `0026` had already established the honest three-valued
vocabulary for the same release members, so the two projections of one release
contradicted each other and the public one was the wrong half.

`0040_ove256_public_catalog_object_kind_evidence.sql` adopts the landed
vocabulary: `breed -> animal`, `plant_variety -> plant`, `species -> either`.
`either` is a stored value and a rendered label, never a request value: the
filter tabs stay `all`/`plant`/`animal`, and a record of unresolved kingdom is
admitted under both, because dropping it from one would hide an approved
identity from the guest who asked for exactly the kingdom it may belong to.

The source archive is untouched and stays two-valued. Its kind comes from the
observed `datatype` field, which is evidence rather than inference.

`pnpm smoke:stable-registry-public-catalog -- --database` executes this against
a loopback Postgres in a transaction that always rolls back: it activates a
release holding one identity of each kind, asserts the three projected kinds
and the search-term vocabulary, checks both guest filters, proves no forbidden
marker reaches a public column, and proves retiring the release removes the
whole projection from guest reads while immutable membership survives. Against
the pre-correction function it fails with `ove256-species:plant`.

## Request contract

The list pages and `/api/public/catalog/suggestions` plus
`/api/public/sources/eppo/suggestions` accept only:

- `q`: blank for browse pages, otherwise 2–120 normalized characters;
- `kind`: `all`, `plant`, or `animal` — `either` is never a request value;
- opaque base64url keyset `cursor`.

The public API requires a non-empty two-character query and returns `400` for
invalid query, filter, or cursor data. It returns a localized, retryable `503`
response when the derived query cannot complete. Every request uses a local
Postgres statement timeout of 750 ms, fetches at most 20 records plus one
keyset sentinel, and has no automatic upstream retry. Responses are
`private, no-store` and expose only the display fields, badge state, and public
href.

## Discovery and rollout

The routes are protected by `STABLE_REGISTRY_PUBLIC_DISCOVERY=true`, separate
from the operator-only `STABLE_REGISTRY_RELEASE_CENTER` flag. The flag remains
off until production proof is ready. Release Center stays unavailable on Vercel
under its existing local-only safeguard.

All four public routes use `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD` through the
shared public discovery inventory. A route whose visible candidate does not
meet the threshold is `noindex` and emits no canonical/JSON-LD public facts.
There is intentionally no Stable Registry sitemap producer in OVE-256; one may
be added only by a later slice that proves the same shared predicate for every
listed detail record.
