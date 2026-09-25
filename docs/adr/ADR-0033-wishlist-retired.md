# ADR-0033 — The wishlist is retired

- **Status:** Accepted (decision 2026-09-25, SDD Slice 29 piece 7). Recorded by
  `OVE-511` (29.01); implemented by `OVE-512` (29.02): the page, the
  organism-page button, the account-menu entry, the garden home's
  pending-wishlist panel, the copy, the route policy entries, the erasure
  dry-run counts, the illustration and the repository are removed, and
  `/wishlist` answers a real 404 in every language. Migration `0080` drops the
  table, and is applied to production after the release that no longer reads
  it.
- **Date:** 2026-09-25
- **Decision owner:** founder/owner
- **Supersedes:** `DESIGN.md` §5.23 as written for OVE-502 ("two shelves, each
  with one name"). Bookmarks is now the one shelf. In the research corpus,
  `OverGarden_MVP_PRD_v0.md` S12 / US-S12 / AC-S12 and the "D. WISHLIST" block of
  `OverGarden_PAGE_ARCHITECTURE_v1.md` are superseded; the ledger records it
  as J3. Older ADRs are immutable history and are not edited.
- **Relates to:** ADR-0025 and ADR-0027, which removed the Release Center and
  the `/health` page for the same reason: surfaces the owner never asked for.
  ADR-0034, which hides the catalogue the wishlist was filled from.

## Context

The wishlist was a private shelf of organisms a gardener wanted to grow
("save a variety to try next season"). It came from the pre-code research
PRD (S12, June 2026), was built on 2026-07-04 (`49d9e95c`, "feat: add wishlist
shelf") and reworked in the redesign (OVE-502, 2026-09-23). It was filled
only by a button on organism pages and read at `/wishlist` from the account
menu.

On 2026-09-25, while discussing hiding the organism catalogue from gardeners,
the owner said they never approved the wishlist and did not understand what it
was for. Once the catalogue is hidden (ADR-0034), its only way in — an organism
page — is almost unreachable. After the explanation, the owner's answer was:
"це нам не потрібно. Видалити повністю з проєкту!"

A research PRD is not the owner's approval. This is the third surface to leave
for the same reason, after the Release Center (ADR-0025) and `/health`
(ADR-0027).

## Decision

### D1. Retired

Removed from the product:
- the `/wishlist` page and its `[...missing]` catch-all, in both route trees;
- `addCatalogPublicSlugToWishlistAction`, `removeWishlistItemAction`,
  `restoreWishlistItemAction` and their repository `wishlist-repository.ts`;
- the "Зберегти до списку бажань" form and its receipt on variety pages
  (`catalog-evidence-route.tsx`);
- the garden home's pending-wishlist panel («Зберегти на потім») and its guest
  sign-in prompt;
- the `wishlist` account-menu item with its uk/bg/ru labels, and the shell
  section key and its `globals.css` selector;
- the social-surface copy block and the `wishlist` shelf name;
- `/wishlist` in the proxy's no-store list, in the interface route policy,
  in `ROOT_ROUTE_SEGMENTS`, `LOCALE_ROUTE_SEGMENTS` and `SECTION_SUBPATHS`, and
  in the sign-in return contract;
- the `wishlist_items` counts in the erasure dry run and its entry in
  `erasure-schema-coverage.ts`;
- the `empty-wishlist` illustration and its asset-manifest entry.

`/wishlist`, `/bg/wishlist`, `/ru/wishlist` and every path below them join
`RETIRED_PATH_PREFIXES` in `src/lib/retired-control-plane-routes.ts`, and so
answer the proxy's real 404. Deleting the route directories alone would leave
`/bg/wishlist` to `[locale]/[handle]` and a not-found shell streamed at HTTP
200. That is the soft 404 ADR-0027 found for `/bg/health`.

### D2. The table goes, rows included

Migration `0080_retire_wishlist.sql` runs `drop table if exists
wishlist_items`. This is a destructive schema change, and the owner signed it
off explicitly ("Видалити повністю з проєкту!"; piece 7: "The table is dropped
after checking its row count, with sign-off given"), which is what `AGENTS.md`
hard rule 10 requires.

The table held only an owner id, a catalogue item id, a source-surface label
and two timestamps. The row count is read and recorded before the apply.

Order matters. The migration is applied after the release that no longer reads
the table is live, because the previous release's page and button query it.

`0001` still creates the table, so a replay creates and drops it again. That is
harmless, because nothing else reads it — the pattern `0014` set.

### D3. Bookmarks is the one shelf

The shelf component, its row, its removal, its Undo and its return-to-view
behaviour all stay as OVE-502 built them. They now serve one shelf:
«Закладки», saved reading.

## Consequences

- An organism page offers nothing to save for later.
- A gardener's personal pages are the followed feed, Activity and Bookmarks.
- Nothing in the product reads `wishlist_items` once `0080` is applied.
  `docs/PRODUCTION_SCHEMA_STATE.md` records the apply.
