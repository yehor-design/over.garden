-- Rollback for 0060 (OVE-398).
--
-- The table holds measurements, not gardener content: dropping it loses the
-- last ninety days of pick outcomes and nothing a gardener wrote. Forward
-- again recreates an empty table, which is the honest state — the events it
-- would have held were never observed.

drop function if exists catalog_purge_pick_events(integer);

drop index if exists catalog_pick_events_owner_idx;
drop index if exists catalog_pick_events_occurred_at_idx;

drop table if exists catalog_pick_events;
