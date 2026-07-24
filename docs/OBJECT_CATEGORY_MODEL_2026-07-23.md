# Object Category Model — Decision (2026-07-23)

Status: adopted · Owner: founder · Supersedes: three-kind (`plant|bee_colony|animal`) model

## Decision

OverGarden exposes exactly two `object_kind` values: `plant` and `animal`.

- `bee_colony` is removed (hard-remove; founder choice 2026-07-23).
- A beehive is an `animal` whose catalog identity is a bee breed (content, not a kind). Bee breeds stay in the catalog; `/breed/*` pages preserve bee recognition.
- Vertical-agnostic invariant (INV-VAG): bees, pets, poultry, and livestock get no dedicated kind, fields, forms, dashboards, onboarding, navigation, or funnels.
- The `plant_objects` table and `PlantObject*` / `plant_object_id` identifiers are retained for now (naming tech-debt). Renaming them is deferred to a separate future slice.
- Wine, rakia, and DIY are not object kinds.
- MODEL ≠ GTM: plant remains the seed/SEO/acquisition beachhead; animal is supported but is not separately seeded or marketed.

## Rationale

Bees are a high journal-priority segment, but recognition belongs in the catalog (bee breeds plus `/breed/*`), not as a top-level object category. No bee-, pet-, or livestock-specific product verticals exist today, so collapsing to two kinds is a simplification, not a feature loss.

## Implementation

The code/schema/UI collapse ships in [OVE-211](https://linear.app/overgarden/issue/OVE-211/collapse-object-kinds-to-plant-animal-remove-bee-colony-a-hive-is-an). Until that slice lands, production may still carry the historical three-kind schema; this document is the authoritative product decision for agents and planning.

**[NOTE 2026-07-23]** OVE-211 has landed on `main` (behavior SHA `752b527b51dfd9263598d1367c8c6a33e3aa0920`). Production is the two-kind model; do not treat three-kind production as current. Historical three-kind shipping prose elsewhere (e.g. SCAFFOLD) remains untouched provenance.

Invariant: no future object kind and no per-vertical feature may be added without a superseding dated decision document in `docs/`.

## Non-goals

- Renaming `plant_objects` / `PlantObject*` / `plant_object_id` (deferred).
- New kinds such as fungi or ferment.
- Dedicated bee, pet, poultry, or livestock features, forms, dashboards, onboarding, navigation, or funnels.

## References

- [OVE-209](https://linear.app/overgarden/issue/OVE-209/object-category-canon-record-the-two-kind-plant-animal-decision-as) (this decision anchor)
- OVE-210 (related sequencing in Slice 19)
- [OVE-211](https://linear.app/overgarden/issue/OVE-211/collapse-object-kinds-to-plant-animal-remove-bee-colony-a-hive-is-an) (collapse implementation)
- [OVE-212](https://linear.app/overgarden/issue/OVE-212/reconcile-product-research-corpus-with-code-object-categories-and) (product-research corpus reconciliation)
- `apps/web/src/db/types.ts` (`PlantObjectKind`)
- `apps/web/sql/0001_walking_skeleton.sql`
