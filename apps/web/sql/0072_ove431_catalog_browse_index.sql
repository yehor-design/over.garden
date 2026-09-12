-- OVE-431: the index the catalog's front door walks.
--
-- `/species` lists kingdoms, then initials, then organisms, and every one of
-- those views asks the same question of `catalog_items`: rows in one kingdom
-- whose name starts with one letter, ordered by name, with a public slug. The
-- table holds 114 669 rows and had no index that answers it — the existing
-- ones are on `(identity_state, node_kind)`, the parent, the unique slug, and
-- the ancestors GIN — so every browse page was a sequential scan plus a sort.
--
-- This is a partial index over exactly the rows the browse can show: a slug
-- makes a row addressable, and a merged row is a redirect rather than a page
-- (ADR-0026 D8). About 101 600 rows of the 114 669, and the ordering column is
-- in the index, so a page is an index range scan with no sort.
--
-- The leading expression matches the one the queries group and filter by,
-- `lower(left(canonical_name, 1))`, so the initial filter is a range on the
-- same index rather than a second predicate the planner has to recheck row by
-- row.
--
-- Built without CONCURRENTLY: the migration runner applies one file in one
-- transaction, and a concurrent build cannot run inside one. On a table this
-- size the build takes a couple of seconds and holds a SHARE lock — reads
-- continue, writes to the catalog wait. The catalog is written by imports, not
-- by gardeners, so the window is nobody's request.

create index if not exists catalog_items_browse_idx
  on catalog_items (kingdom, lower(left(canonical_name, 1)), canonical_name, id)
  where public_slug is not null and merged_into_catalog_item_id is null;

analyze catalog_items;
