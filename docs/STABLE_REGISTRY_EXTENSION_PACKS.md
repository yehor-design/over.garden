# Stable Registry Extension Packs

Status: implemented by OVE-328
Migration: `apps/web/sql/0027_ove328_stable_registry_extension_packs.sql`
Artifact contract: `docs/STABLE_REGISTRY_PACK_ARTIFACT.md` (OVE-327)
Flag: `STABLE_REGISTRY_EXTENSION_PACKS` (ships off; only OVE-259 may enable it)

## What a pack is

A pack is one immutable, source-identified batch of OVE-327 artifact rows —
official plant varieties or animal breeds. Pack identity is the artifact, not
the run: re-importing the same bytes returns the same pack, and changed bytes
open a new pack that can never mutate the old one.

Packs reuse the OVE-255 release, exception, decision, and activation model and
the OVE-257 product projection. There is no second release model and no second
search or picker owner.

## Why grouping, not per-row approval

The founder approves clean rows in one action and only resolves grouped
exceptions, so the workload scales with the number of ambiguities rather than
with corpus size. Exactly one class is batch-approvable — `clean`, which becomes
`product_eligible` on approval. Everything else is an exception the owner
decides.

| Class              | Owner sees it as                  |
| ------------------ | --------------------------------- |
| `clean`            | approved in one batch             |
| `needs_parent`     | exception group                   |
| `collision`        | exception group                   |
| `duplicate`        | exception group                   |
| `rights_blocked`   | exception group, never promotable |
| `review_needed`    | exception group                   |
| `rejected`         | terminal, retained as evidence    |
| `product_eligible` | approved outcome                  |

## Parent identity

Every variety and breed binds to exactly one parent species that is a **member
of the active Foundation product projection**. `bind_parent` resolves the parent
through that projection, so an inactive, source-only, or retired catalog row
cannot be bound. The database backstops this: a row cannot be
`product_eligible` while `parent_catalog_item_id` is null.

Kind is checked against the parent's `object_kind_scope`:

- a `breed` pack binds only to an `animal` or `either` parent;
- a `plant_variety` pack binds only to a `plant` or `either` parent.

A `species` parent is deliberately `either` and is usable by both, which is why
the plant-only variety parent is what actually proves the rule in the smoke.

## Name truth

The artifact's single `official_denomination` is stored as the canonical name.
Trade, local, romanized, generated, and user-added names are alias rows and
never become an independent canonical identity. `name_class` is part of the
names primary key for the same reason as the OVE-257 projection: one spelling
can legitimately be both the official denomination and a transliteration, and
keying without the class would silently drop the second row.

User-added names are candidates with their own closed state
(`provisional | grouped | alias_approved | new_item_approved | deferred |
rejected`). Nothing publishes one automatically.

## Immutability

- An approved, active, or retired pack's rows are immutable evidence.
- Pack state may only advance through
  `draft → parsing → classified → review_ready → approved → active → retired`;
  `failed` and `abandoned` are the only sideways exits.
- Pack identity columns, the approved preview digest, and the approval receipt
  can never be rewritten.
- Nothing is hard-deleted. Rejecting or abandoning retains the pack, its rows,
  its names, and its decisions.

## Activation

Activation requires an active Foundation — an extension has no meaning without
one to extend. It sets the pack active against that release, calls
`materialize_stable_registry_extension_pack`, and enqueues the existing catalog
typeahead rebuild. Blocked and held rows are not projected.

A variety and a breed become **their own selectable catalog identities**: a
gardener records that they planted `San Marzano`, not merely
`Solanum lycopersicum`. Activation therefore appends, per product-eligible row,
one `catalog_items` identity keyed on the pack row id, its revision 1, a release
member, a projection record carrying the pack's resolved kind
(`plant_variety -> plant`, `breed -> animal`), a canonical name, its alias
names, and one outbox row for the index rebuild. Keying the identity on the pack
row id makes re-activation idempotent.

Appending is legitimate: release membership is append-only rather than frozen —
its guard fires on update and delete, never on insert — and extending an active
Foundation is what a pack is for. Nothing existing is rewritten.

`0027` did none of this. Its materialization joined each pack row to its
_parent_ release member and inserted that parent, which is already projected —
that is why the join could succeed — so every row hit `on conflict do nothing`
and the function was a guaranteed no-op that never wrote a single name.
Activating a pack published nothing. `0041_ove328_extension_pack_product_projection.sql`
is the correction, and it re-runs every already-active pack.

Because `official_denomination` allows 240 characters while a catalog identity's
canonical name allows 120, a row that cannot become an identity can no longer be
classified `product_eligible`. An over-long denomination stays an exception the
owner can see rather than a variety that silently vanishes at activation.

## Verification

```bash
cd apps/web
pnpm exec vitest run \
  src/server/stable-registry/extension-pack-repository.test.ts \
  src/app/garden/catalog/registry/extensions/page.test.tsx
pnpm exec tsx scripts/smoke-stable-registry-extension-pack.ts \
  --fixture worker-timeout --rows 129188
pnpm exec tsx scripts/smoke-stable-registry-extension-pack.ts --database
```

`--database` runs inside one transaction that always rolls back. It seeds an
active Foundation, imports one variety pack and one breed pack, proves a
plant-only parent is refused for a breed, proves a rights-blocked row survives
an approval unpromoted, activates both packs into the product projection, and
proves approved rows are immutable and pack state cannot move backward.

It then reads the projection back the way the picker does: every eligible row
became one selectable identity with the right resolved kind, each is findable by
its own canonical name, and no held row became an identity. `publishedIdentityCount`
carries that number in the receipt, because a row class proves classification
and not publication. Against the pre-correction function the proof fails with
`activated_pack_rows_never_reached_the_picker`.

`--fixture worker-timeout` proves the no-wedge contract: a stalled pack worker
holds only its own pack, both recovery controls stay usable, and the reported
class is `degraded` rather than a silent partial activation.

Observability is aggregate only: source-family class, pack kind, row and
classification counts, parent status, phase, duration, and leak booleans. No
denomination, source row identifier, user name, raw payload, coordinate, or
credential is recorded.

## Boundary

OVE-328 performs no production activation. Real production rollout, parity, and
rollback belong to OVE-259.
