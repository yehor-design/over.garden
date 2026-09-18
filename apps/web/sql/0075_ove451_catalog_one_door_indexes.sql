-- OVE-451: the indexes the catalogue's one door walks.
--
-- Five entrances became one listing, and that listing asks `catalog_items` a
-- wider question than `/species` ever did: the same rows, but ordered by name
-- with any combination of kingdom, rank, register, "a gardener has written
-- about it" and a letter — plus a facet count per option, which is the same
-- predicate set grouped rather than paged.
--
-- `catalog_items_browse_idx` (0072) answers exactly one of those shapes:
-- `(kingdom, initial, name)`. The unfiltered root — the address every reader
-- lands on — matches none of it, because it filters on no kingdom at all, and
-- Postgres cannot use a leading column it has no predicate for as an ordering
-- when the ordering column comes third. So the one view that matters most was
-- a sequential scan of ~101 600 rows plus a sort.
--
-- Two partial indexes over exactly the rows the catalogue can show — a slug
-- makes a row addressable, and a merged row is a redirect (ADR-0026 D8):
--
--   * `catalog_items_catalog_name_idx` orders the unfiltered listing and
--     every filter that is not a kingdom. `(canonical_name, id)` is the whole
--     `ORDER BY`, so a page is an index range scan with no sort, and the
--     remaining predicates are a recheck over 60 rows rather than a scan.
--   * `catalog_items_catalog_rank_idx` answers the rank facet's count, which
--     groups by `rank` over the same partial set.
--
-- The kingdom facet keeps 0072's index, which already leads with `kingdom`.
-- `registered_ua`/`registered_eu`/`first_hand_content_at` are not indexed: at
-- 15 177, 763 and 22 rows of 101 600 the planner is right to read the name
-- index and recheck, and three more indexes on a table that imports rewrite in
-- bulk costs more on the write side than it returns on the read.
--
-- Built without CONCURRENTLY: the migration runner applies one file in one
-- transaction, and a concurrent build cannot run inside one. On a table this
-- size the build takes a couple of seconds and holds a SHARE lock — reads
-- continue, writes to the catalogue wait. The catalogue is written by imports,
-- not by gardeners, so the window is nobody's request.

create index if not exists catalog_items_catalog_name_idx
  on catalog_items (canonical_name, id)
  where public_slug is not null and merged_into_catalog_item_id is null;

create index if not exists catalog_items_catalog_rank_idx
  on catalog_items (rank)
  where public_slug is not null and merged_into_catalog_item_id is null;

-- `reltuples` is what the planner reads, and a freshly built index leaves it
-- wrong until this runs — which is how a listing can report a count nobody
-- recognises the day a migration lands (`OVE-431`).
analyze catalog_items;
