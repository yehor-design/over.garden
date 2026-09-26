-- Rollback of 0085 (OVE-519). The one value is gone for good: the drop took it.
-- This only re-adds the empty column in the shape `0054` gives it, so that a
-- code rollback to a release that still selects it finds a column rather than
-- an error. A rolled-back release reads every card as not marked, and the one
-- page that was marked is published by its entries anyway.
set local lock_timeout = '5s';
set local statement_timeout = '20s';

alter table catalog_items add column if not exists indexable_override boolean;
