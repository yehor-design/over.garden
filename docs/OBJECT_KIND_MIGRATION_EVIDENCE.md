# Object Kind Migration Evidence (OVE-210)

Status: production go/no-go recorded for the OVE-211 `bee_colony → animal` collapse.
Related decision: `docs/OBJECT_CATEGORY_MODEL_2026-07-23.md`.

## How to run (read-only)

```bash
# Local / Apple Container Postgres
cd apps/web && pnpm catalog:inventory-object-kinds

# Production (operator-only; never embed DATABASE_URL in git or CI)
# Prefer a read-only role when available:
DATABASE_URL=<prod-readonly> pnpm --filter web catalog:inventory-object-kinds
# Or inject Vercel production env without printing secrets:
vercel env run --environment production -- pnpm --dir apps/web catalog:inventory-object-kinds
```

Redaction rules: record object ids, catalog identities (`catalog_item_id`, `catalog_kind`, `catalog_source`), counts, and the verdict only. Never record `display_name`, journal text, coordinates, emails, media keys, or user ids.

## Evidence record

| Field | Value |
| --- | --- |
| Date | 2026-07-23 |
| Commit SHA | `cebef59d8900032f5600d929b55da1ad2a76a0a9` |
| Environment | production (`vercel env run --environment production`) |
| Operator initials | YD (agent-executed operator inventory via Vercel env; no secrets recorded) |
| Counts per `object_kind` | animal: 14; bee_colony: 16; plant: 229 |
| `bee_colony` catalog identities | 14× `catalog_kind=breed` / `ua_official_bee_breed`; 1× `breed` / `visual_fixture`; 1× `species` / `visual_fixture` (`18700003-…028`); 1× unidentified `unknown`; 1× `user_added` null catalog (`18700003-…030`) |
| Dependents check | journal_entries: 20; mentions: 0; lineage subject/source: 0/0; media via journal: 4; public_slug journals: 8 |
| Script verdict `SAFE TO COLLAPSE` | no |
| Operator go/no-go | **go** |
| Notes | Script flags two rows only: deterministic OVE-187 visual fixtures `18700003-0000-4000-8000-000000000028` (bee_colony + species) and `…000030` (bee_colony + user_added). All non-fixture bee_colony rows are breed-backed (`ua_official_bee_breed`). OVE-211 must remediate those two fixture rows in the same collapse migration (rebind/reseed) so post-migration inventory is fully SAFE. No orphaned dependents beyond normal FK counts on object ids. |

## Production run (redacted output)

```
OVE-210 object-kind inventory (redacted)

## Counts by object_kind
- animal: 14
- bee_colony: 16
- plant: 229

## bee_colony rows
- id=082c3616-2d64-4250-aef8-1055a12fd7f9 catalog_item_id=940ae039-a384-4d9d-a37f-43ef7ad39fa3 variety_state=selected catalog_kind=breed catalog_source=ua_official_bee_breed catalog_has_public_slug=true classification=safe_breed
- id=114dd0e4-9e48-4478-801e-697236c0f502 catalog_item_id=940ae039-a384-4d9d-a37f-43ef7ad39fa3 variety_state=selected catalog_kind=breed catalog_source=ua_official_bee_breed catalog_has_public_slug=true classification=safe_breed
- id=18700003-0000-4000-8000-000000000027 catalog_item_id=18700009-0000-4000-8000-000000000017 variety_state=selected catalog_kind=breed catalog_source=visual_fixture catalog_has_public_slug=true classification=safe_breed
- id=18700003-0000-4000-8000-000000000028 catalog_item_id=18700009-0000-4000-8000-000000000018 variety_state=selected catalog_kind=species catalog_source=visual_fixture catalog_has_public_slug=true classification=manual_check
- id=18700003-0000-4000-8000-000000000029 catalog_item_id=null variety_state=unknown catalog_kind=null catalog_source=null catalog_has_public_slug=false classification=safe_unidentified
- id=18700003-0000-4000-8000-000000000030 catalog_item_id=null variety_state=user_added catalog_kind=null catalog_source=null catalog_has_public_slug=false classification=manual_check
- id=2a37211f-11ff-4878-9bd4-07f0cc9ae092 catalog_item_id=940ae039-a384-4d9d-a37f-43ef7ad39fa3 variety_state=selected catalog_kind=breed catalog_source=ua_official_bee_breed catalog_has_public_slug=true classification=safe_breed
- id=3b64ef59-d8f8-40a8-b4f0-b2474d42e76a catalog_item_id=940ae039-a384-4d9d-a37f-43ef7ad39fa3 variety_state=selected catalog_kind=breed catalog_source=ua_official_bee_breed catalog_has_public_slug=true classification=safe_breed
- id=4c72e625-c29f-4848-ab3f-898ca82741ea catalog_item_id=940ae039-a384-4d9d-a37f-43ef7ad39fa3 variety_state=selected catalog_kind=breed catalog_source=ua_official_bee_breed catalog_has_public_slug=true classification=safe_breed
- id=5e1903e8-da6f-4413-b105-63b8f0aba0e6 catalog_item_id=940ae039-a384-4d9d-a37f-43ef7ad39fa3 variety_state=selected catalog_kind=breed catalog_source=ua_official_bee_breed catalog_has_public_slug=true classification=safe_breed
- id=79b7dfba-d7af-45e2-a836-fbb899071666 catalog_item_id=940ae039-a384-4d9d-a37f-43ef7ad39fa3 variety_state=selected catalog_kind=breed catalog_source=ua_official_bee_breed catalog_has_public_slug=true classification=safe_breed
- id=848cb621-e419-428a-9dcd-7ec2ae118b04 catalog_item_id=940ae039-a384-4d9d-a37f-43ef7ad39fa3 variety_state=selected catalog_kind=breed catalog_source=ua_official_bee_breed catalog_has_public_slug=true classification=safe_breed
- id=a2b190ae-fda9-40d2-8c88-45283953daa3 catalog_item_id=940ae039-a384-4d9d-a37f-43ef7ad39fa3 variety_state=selected catalog_kind=breed catalog_source=ua_official_bee_breed catalog_has_public_slug=true classification=safe_breed
- id=d4e95e91-4f02-447f-8ad7-3d75dd1a3aee catalog_item_id=940ae039-a384-4d9d-a37f-43ef7ad39fa3 variety_state=selected catalog_kind=breed catalog_source=ua_official_bee_breed catalog_has_public_slug=true classification=safe_breed
- id=e2e70ab1-66d8-460b-9746-62140186569f catalog_item_id=940ae039-a384-4d9d-a37f-43ef7ad39fa3 variety_state=selected catalog_kind=breed catalog_source=ua_official_bee_breed catalog_has_public_slug=true classification=safe_breed
- id=fc9c2ff2-614a-49d2-96a9-c76beaeb69c6 catalog_item_id=940ae039-a384-4d9d-a37f-43ef7ad39fa3 variety_state=selected catalog_kind=breed catalog_source=ua_official_bee_breed catalog_has_public_slug=true classification=safe_breed

## Dependents of bee_colony objects (counts only)
- journal_entries.plant_object_id: 20
- journal_entry_object_mentions.plant_object_id: 0
- lineage_provenance_edges.subject_plant_object_id: 0
- lineage_provenance_edges.source_plant_object_id: 0
- media_assets via journal_entries: 4
- journal_entries with public_slug: 8

SAFE TO COLLAPSE: no
manual_check_ids: 18700003-0000-4000-8000-000000000028,18700003-0000-4000-8000-000000000030
```
