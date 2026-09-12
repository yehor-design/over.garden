-- Rollback of 0072: drop the index the catalog's front door walks.
--
-- Safe at any time. Without it `/species` still answers correctly and every
-- browse page becomes a sequential scan of 114 669 rows plus a sort, which is
-- the state the page shipped from. Nothing reads the index by name.

drop index if exists catalog_items_browse_idx;
