# Public Living-Object Passport Implementation

Status: OVE-148 implementation note
Date: 2026-07-05
Source artifact: `docs/product-research/drive2/DRIVE2_TO_OVERGARDEN_BLUEPRINT_2026-07-05.md`
Code surfaces:

- `apps/web/src/app/lineage/objects/[objectId]/page.tsx`
- `apps/web/src/server/public-object-passport-repository.ts`
- `apps/web/src/server/public-surface-indexing-policy.ts`

## Drive2 Pattern Mapping

Drive2's car passport maps to an OverGarden living-object passport, not to a vehicle-style clone.

- Drive2 car identity -> OverGarden plant/animal-compatible object identity.
- Drive2 garage/owner context -> OverGarden public-safe caretaker profile and garden/workspace context only when public-safe.
- Drive2 logbook -> OverGarden public journal preview backed by active public entries.
- Drive2 car photo -> OverGarden stripped public media derivative URL only.
- Drive2 model/catalog links -> OverGarden catalog variety/species/breed link where the catalog item is selectable and source-safe.
- Drive2 owner/social proof -> OverGarden engagement, comments, bookmarks, and public profile handle where available.
- Drive2 lineage/modification history -> OverGarden confirmed provenance section for consented, public-entry-backed object links.

## Route Decision

OVE-148 ships the passport at the existing canonical public object route:

`/lineage/objects/[objectId]`

That route is now passport-first and lineage-second. A future `/objects/[slug]` route can still be introduced after a dedicated naming and migration slice, but this implementation avoids a premature public slug surface and reuses the existing engagement target `lineage_object`.

## Public Data Contract

The passport read model may expose only:

- object display name, object kind, catalog/variety label, catalog public slug, and public-safe status labels;
- allowed coarse region label or no location;
- public journal title, body preview, date, public slug, and public path;
- processed public derivative media URL;
- public profile handle/display name/avatar URL when the caretaker has a public profile;
- confirmed public provenance nodes and edges that already pass the lineage public-read contract.

It must not expose private entries, archived entries, public-gone entries, precise coordinates, raw media keys, quarantine keys, owner IDs, emails, tokens, invite links, source-only catalog fields, raw lineage pending identities, or exact space/place hints.

## Indexing

The passport uses the `object_passport` public surface policy:

- `robots`: `noindex, nofollow`
- `sitemapEligible`: `false`
- missing or empty object surfaces remain `missing` and `noindex`

This keeps the page shareable for trust and product loops without promoting thin or user-generated object pages into search before quality gates exist.
