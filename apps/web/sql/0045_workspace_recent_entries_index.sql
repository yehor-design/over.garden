-- The garden workspace "recent entries" section had no index it could use.
--
-- `buildGardenWorkspaceRecentEntriesQuery` filters on
-- `owner_user_id` and `lifecycle_state = 'active'`, then orders by
-- `entry_date desc, created_at desc, id asc` and takes a small limit. Nothing
-- in the schema served that shape:
--
--   * `journal_entries_owner_object_date_idx` leads with `owner_user_id` but
--     places `plant_object_id` second, so a query that does not constrain the
--     object cannot use the index's ordering — only its leading column.
--   * `journal_entries_owner_space_date_idx` is partial on
--     `entry_scope = 'space'`, and the recent-entries query does not filter
--     `entry_scope` at all, so it covers the wrong subset.
--   * No index mentioned `lifecycle_state`.
--
-- The planner therefore read every active entry the owner had ever written and
-- sorted the whole set to return eight rows. The cost grew with the gardener's
-- own journal: the more they wrote, the slower their own workspace became.
--
-- Measured on Postgres 18 with one owner holding 40,000 entries, 39,200 of them
-- active:
--
--   before   7.038 ms   657 shared-buffer hits   seq scan + top-N heapsort
--   after    0.035 ms    13 shared-buffer hits   index scan, 8 rows read
--
-- The column order is not a preference. It matches the query exactly —
-- equality on `owner_user_id` first, then the three ordering columns in their
-- declared directions — because a b-tree can only eliminate the sort when the
-- index ordering is the requested ordering. The partial predicate matches the
-- query's own constant, which is what lets the planner choose it at all.
--
-- No column, constraint, or table is added, and no row is rewritten.

create index if not exists journal_entries_owner_recent_idx
  on journal_entries (owner_user_id, entry_date desc, created_at desc, id asc)
  where lifecycle_state = 'active';
