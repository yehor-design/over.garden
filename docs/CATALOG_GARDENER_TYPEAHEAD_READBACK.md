# Catalog Gardener Typeahead And Readback

Status: implemented by OVE-161; extended by OVE-257 (active Stable Registry
product selection)
Owner surfaces: `/garden`, `/garden/objects/[objectId]`
API: `/api/garden/catalog/typeahead`
Derived index: `catalog_typeahead`

## Product Boundary

A gardener should be able to find one reviewed plant, animal, or bee identity
using a familiar spelling even when the input contains one typo, an accepted
transliteration, a synonym, or a reviewed name from another supported locale.
The flow must help without silently deciding identity: the gardener still
selects a trust-labelled result or explicitly keeps the object Unknown or uses
their own name.

The Product Thinking Gate uses:

- `docs/product-research/DB_SEED_AND_DATA-MODEL_SPEC_v1_2.md` for one canonical
  identity with multiple reviewed names;
- `docs/product-research/MATCHING-ENGINE_STACK_SPEC.md` for Meilisearch typo
  tolerance and Cyrillic/transliteration matching;
- `docs/product-research/B3_INFORMATION_ARCHITECTURE_AND_FLOWS_v0.md` for a
  non-blocking journal capture and later object-resolution path;
- `docs/product-research/CROSS_LOCALE_BG_UA.md` for the Ukrainian/Bulgarian
  cross-locale job.

The tested product assumption is that reviewed names reduce catalog dead ends
without increasing false identity attachment. The trust concern is the cost of
an incorrect canonical match: the result must expose OVE-129 trust metadata,
require an explicit selection, and preserve both escape hatches.

## Search Contract

1. The API accepts a normalized, bounded query and returns at most eight
   selectable `seeded` or `confirmed` global identities.
2. Meilisearch is derived state. It searches with `matchingStrategy: all` and
   ranking details enabled. Exact display/canonical/normalized-name matches are
   accepted; a fuzzy hit is accepted only when current Meilisearch evidence
   reports at least one ranked word and exactly one typo. Missing, malformed, or
   multi-typo evidence fails closed.
3. PostgreSQL is queried on every request and remains the canonical fallback
   when Meilisearch is empty or unavailable. Accepted aliases in
   `catalog_item_names` therefore remain discoverable without the derived
   index. PostgreSQL fallback is exact/substring matching; typo tolerance is a
   bounded Meilisearch capability.
4. Results dedupe alias documents to one catalog identity while preserving
   genuinely ambiguous identities whose type or source differs.
5. The HTTP response is rebuilt through one shared allowlist parser. It contains
   only catalog UUID, display/canonical names, kind, locale, selectable status,
   source, and recomputed OVE-129 trust/disambiguation fields. Meilisearch
   ranking internals are never returned to the browser.

## Active Stable Registry Product Selection (OVE-257)

Migration `0026` adds `stable_registry_product_catalog_records`, its
`stable_registry_product_catalog_names` name set, and a per-identity projection
outbox. Only an **active** Foundation release whose immutable membership marks
an identity `product_eligible` can produce a projection row; the activation
trigger is the sole writer, and a retired release disappears from product reads
the moment the `foundation` active pointer moves, without deleting membership,
revisions, or source evidence.

Two independent predicates therefore exist, selected by the reversible
`STABLE_REGISTRY_PRODUCT_SELECTION` flag:

- **compatibility** (flag off, the current default): the pre-registry
  `catalog_items.status in ('seeded','confirmed')` predicate, unchanged.
- **stable_registry** (flag on): the active-release projection only. A
  Meilisearch hit is additionally re-validated against the canonical projection
  before it can be offered, so a stale derived document cannot promote an
  inactive, source-only, or superseded identity.

Object kind is a three-valued **scope**, not a guess:

| `catalog_kind`  | `object_kind_scope` | selectable by                      |
| --------------- | ------------------- | ---------------------------------- |
| `plant_variety` | `plant`             | a plant object                     |
| `breed`         | `animal`            | an animal object                   |
| `species`       | `either`            | a plant object or an animal object |

`species` stays selectable by both kinds because a seeded bee species and a
seeded plant species are both legitimate identities. Collapsing it to one kind
would make animal species unselectable and would regress the compatibility
behavior the picker has today.

The name set always carries the Latin scientific name as its own
`name_class = 'scientific'` row beside the localized `uk`, `bg`, and `ru` names,
so typing a Latin binomial resolves the same concept in every locale. The names
primary key includes `name_class` precisely so a spelling that is both the
canonical release name and the scientific name keeps both rows instead of one
silently displacing the other.

`GET /api/garden/catalog/typeahead` requires `kind=plant|animal`. A missing or
malformed kind returns a bounded `400` with `{ suggestions: [], state: "empty" }`
and never reaches search. The response carries an explicit
`state` of `ready`, `empty`, or `degraded`: the picker must not infer
availability from an empty list, because an empty result and an unavailable
derived index look identical there.

Save validation passes the object's kind into the same predicate. An inactive,
source-only, superseded, or wrong-kind selection resolves to null and fails with
the existing generic message, so a stale suggestion can never attach an
identity the active release does not own.

## Selection And Readback Contract

The first-entry composer and existing-object resolver use the same response
parser and canonical-ID selector. A selected result sends only its catalog UUID;
the server independently validates that the identity remains global and
selectable.

- First-entry save stores `catalog_item_id`, `variety_state = selected`, and the
  canonical display text. Searching an approved alias does not create a second
  provisional catalog identity.
- Existing-object resolution permits only an owner-scoped Unknown or
  user-added object to move to the selected identity. The object UUID, journal
  rows, chronology, entry count, and journal text remain unchanged.
- `Keep without match` stores Unknown without a catalog UUID.
- `Use this name` creates or reuses an owner-scoped provisional identity and
  keeps the journal save independent of later curation.

## Deterministic Fixture And Privacy

`pnpm smoke:catalog-gardener-readback` creates a loopback-only confirmed tomato
identity with primary Ukrainian, accepted Latin transliteration, English
synonym, and Bulgarian vernacular names. It executes the real Python typeahead
reindex, calls the real HTTP typeahead, saves and reads back one first entry per
search class, forces a Meilisearch outage to prove PostgreSQL fallback, resolves
an existing object, and proves Unknown and own-name paths. It then removes only
OVE-161 fixture users and identities and rebuilds the local index.

The smoke refuses non-loopback app, PostgreSQL, or Meilisearch endpoints.
Evidence contains no account credentials, cookies, owner IDs, journal body,
precise location, media fields, or ranking details. Each normal proof uses a
new in-memory password. `--seed-ui` requires the private local-only
`OVE161_SMOKE_UI_PASSWORD` environment value and leaves one bounded local visual
account and realistic objects for browser QA;
`--reset-ui` removes them. Neither mode is production proof.

## Verification

```bash
cd apps/web
pnpm test -- catalog-repository catalog-documents first-entry-composer \
  catalog-resolve-control catalog-typeahead-contract \
  api/garden/catalog/typeahead/route \
  stable-registry/product-projection-repository
pnpm smoke:catalog-gardener-readback

# OVE-257 no-wedge and budget proof, then the executed-SQL projection proof.
pnpm exec tsx scripts/smoke-stable-registry-product-selection.ts \
  --fixture meilisearch-timeout --records 129188 --locales uk,bg,ru
pnpm exec tsx scripts/smoke-stable-registry-product-selection.ts --database
pnpm lint
pnpm typecheck
pnpm test
pnpm build

cd ../../services/matching
uv run --frozen pytest
uv run --frozen ruff check app tests scripts
```

For local browser evidence:

```bash
cd apps/web
export OVE161_SMOKE_UI_PASSWORD="<private local password>"
pnpm smoke:catalog-gardener-readback:seed-ui
# sign in at /garden with the local OVE-161 fixture account
pnpm smoke:catalog-gardener-readback:reset-ui
unset OVE161_SMOKE_UI_PASSWORD
```

`--database` runs inside one transaction that always rolls back. It exists
because the repository's Kysely tests compile queries without executing them, so
a CHECK constraint or trigger defect stays invisible until the first real
activation; that mode inserts real rows, activates a real release, and reads the
materialized projection back.

OVE-259 owns enabling `STABLE_REGISTRY_PRODUCT_SELECTION` in production, after
an activated release, zero-gap parity, and a rehearsed rollback.

OVE-163 owns the later non-local matching rollout gate. OVE-167 and OVE-168 may
localize this final picker/readback contract; they must not fork its selection,
trust, fallback, or privacy behavior.
