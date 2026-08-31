# Stable Registry Edition Lifecycle

Status: implemented by OVE-258
Migration: `apps/web/sql/0028_ove258_stable_registry_editions.sql`
Flag: `STABLE_REGISTRY_EDITIONS` (ships off; only OVE-259 may enable it)
Production effect: none — OVE-259 owns that

## What an edition is

An edition is a **new immutable release** compared against the currently active
one. Preparing it never edits the active release; approving it never edits
history; activating it moves one pointer and appends one receipt.

Refresh is deliberately manual. No cron, source webhook, worker, or AI event can
create, approve, activate, or roll back an edition. A source capture can supply
the input for a draft; it can never supply the decision.

## The owner reviews change, not corpus

Diffs are grouped by class, and `unchanged` is never shown as work:

| Class           | Blocks approval | Meaning                                         |
| --------------- | --------------- | ----------------------------------------------- |
| `unchanged`     | no              | Identical to the active release. No review.     |
| `addition`      | no              | New identity; additive.                         |
| `alias`         | no              | New name on an existing identity; additive.     |
| `correction`    | **yes**         | An existing identity's canonical facts changed. |
| `supersession`  | **yes**         | An identity is replaced by another.             |
| `split`         | **yes**         | One identity becomes several.                   |
| `rights_change` | **yes**         | Source rights moved for existing rows.          |

A 129k-record corpus with four changed groups is four decisions, not 129k.

## Impact is shown before approval

Every group carries an `affected_object_count`: how many existing garden objects
reference an identity in that group. It is an aggregate — no object id, owner
id, or journal content is stored or displayed. The owner submits the count they
saw; a changed count returns `stale` rather than letting an approval widen the
blast radius silently.

## Identity relations

Four decisions record an explicit, append-only relation; the rest are owner
judgements that record none:

| Decision                                                                | Relation        |
| ----------------------------------------------------------------------- | --------------- |
| `same_concept`                                                          | `same_concept`  |
| `record_equivalence`                                                    | `equivalent_to` |
| `create_successor`                                                      | `replaced_by`   |
| `record_split`                                                          | `split_into`    |
| `keep_current`, `add_alias`, `different_concept`, `defer`, `block_rule` | none            |

`catalog_items.merged_into_catalog_item_id` could express only one relation and
could not say which release decided it. These rows are the versioned
replacement; the legacy column stays readable as compatibility evidence and is
never rewritten. A one-time backfill derives a historical `same_concept`
relation for existing merged rows — it reassigns no garden object and changes no
existing OverGarden UUID.

**A relation never migrates a user's object.** It affects what a later edition
may recommend and what the UI displays. The `catalog_item_id` stored on a garden
object is untouched by every decision, activation, and rollback.

## Activation, rollback, forward

All three append one row to `catalog_registry_activation_sequence`, ordered by
`sequence_number` and unique by `receipt_digest`. Rollback is a **new receipt
naming the prior immutable release**, never a deletion or an edit of the
activation it reverses. Receipts are append-only; only a non-terminal receipt's
verification outcome may advance.

### The one admitted transition

The OVE-255 guard forbids `retired -> active`, deliberately: nothing may
silently resurrect a superseded release. But rollback must genuinely re-activate
the prior release, because every product read — the OVE-257 projection included
— filters on `state = 'active'`. Leaving the pointer on a `retired` row would
empty the picker instead of restoring it.

Migration 0028 therefore admits `retired -> active` **only** while the
transaction-local `overgarden.registry_rollback` guard is on, which the edition
repository enables solely for a receipted rollback or forward move, and only
when every identity, digest, and approval column is byte-identical. This was
found by the executed-SQL proof, not by a compile-only test.

## Verification

```bash
cd apps/web
pnpm exec vitest run \
  src/server/stable-registry/edition-repository.test.ts \
  src/app/garden/catalog/registry/editions/page.test.tsx
pnpm exec tsx scripts/smoke-stable-registry-edition-lifecycle.ts \
  --fixture diff-worker-timeout --records 129188
pnpm exec tsx scripts/smoke-stable-registry-edition-lifecycle.ts --database
```

`--database` runs in one always-rolled-back transaction. It seeds a prior
Foundation, a later edition, and one real garden object attached to the identity
under review, then performs `activate → rollback → forward` and proves:

- the garden object still carries its original catalog UUID;
- the prior release kept every membership row;
- three ordered receipts exist and none was rewritten;
- an activation receipt and an identity relation both refuse mutation;
- recording a `replaced_by` relation did not move the object.

`edition_lifecycle_interaction_delay` measured 15.6 ms against a 1000 ms budget.

`--fixture diff-worker-timeout` proves the no-wedge contract: a stalled diff
worker leaves the prior release active, both recovery controls stay usable, and
the class is `degraded` rather than a half-applied edition.

## Rollback of the feature itself

Disable `STABLE_REGISTRY_EDITIONS`. The prior active pointer stays where it is.
Never delete a failed edition, its diffs, its decisions, its relations, or a
source capture, and never restore an unsafe public or search state.
