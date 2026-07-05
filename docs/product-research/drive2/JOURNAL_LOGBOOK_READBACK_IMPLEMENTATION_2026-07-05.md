# Journal Logbook Readback Implementation

Status: OVE-149 implementation note
Date: 2026-07-05
Scope: `/journal/[slug]` public readback and signed-in `/garden/objects/[objectId]` journal readback

## Product Gate

Files reviewed before implementation:

- `docs/product-research/README.md`
- `docs/product-research/drive2/DRIVE2_TO_OVERGARDEN_BLUEPRINT_2026-07-05.md`
- `docs/product-research/ENTRY_DATA_AND_RANKABILITY_SPEC_v0.md`
- `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md`
- `docs/SDD_VERTICAL_SLICE_ROADMAP.md`

The adopted Drive2 mechanic is not visual cloning. The transfer is that an entry becomes valuable when it is attached to a durable object history. OverGarden's public journal readback therefore presents a journal entry as a logbook update with object or space context, safe media, a path back to the living-object passport, related public entries, and read-open/write-gated engagement.

## Public Readback Contract

`/journal/[slug]` now treats a public entry as the central readback page for an object update:

- Title, body, date, and processed public derivative media stay first-class content.
- Object entries link back to `/lineage/objects/[objectId]` when a safe public object passport exists.
- Space entries remain valid logbook pages without inventing a fake object passport.
- Public profile context is limited to the public handle/display name/avatar already allowed by `user_public_profiles`.
- Related entries are limited to active public entries on the same object, excluding the current entry.
- Catalog links use selectable public catalog items only.
- Guest conversion goes to `/garden?source=public-journal&entry=<slug>`.

The renderer must not expose owner ids, emails, client mutation ids, quarantine media keys, raw upload keys, precise coordinates, latitude/longitude, or exact private place hints. Public location output remains either an allowed coarse region label or hidden.

## Signed-In Readback Contract

The signed-in object page keeps the user's journal as the canonical private workspace, but each entry now reads as a logbook item rather than a generic note card:

- Each card labels the entry as a logbook entry.
- Privacy state, direct-object versus space-mention relation, and server-cleaned photo state are visible before publication actions.
- Public entries link to both the public journal page and the public living-object passport.
- Archived entries keep the existing private archive/tombstone wording.

This preserves the MVP behavior: publishing remains explicit and disclosure-gated; readback does not create a new publication path.

## Verification Expectations

OVE-149 should be considered complete only when focused journal renderer, route, repository, and signed-in object readback tests pass, privacy/media invariant checks stay green, and browser smoke proves the public journal entry route plus signed-in object readback route render against the local app.
