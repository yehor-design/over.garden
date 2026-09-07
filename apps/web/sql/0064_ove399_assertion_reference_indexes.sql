-- OVE-399: index the five columns the assertion cleanup reads.
--
-- The reconciliation deletes an assertion nothing points at — a row that says
-- a source claimed something and then names nothing it claimed. It asks that
-- question with five `not exists` subqueries, one per table that can reference
-- an assertion, once per source record.
--
-- Three of those columns had no index at all, and the two that appeared inside
-- a composite unique index carry `assertion_id` as the *last* key, which a
-- probe by `assertion_id` alone cannot use. The plan production ran:
--
--   Seq Scan on catalog_item_identifiers  (cost=0.00..4608.16)
--   Seq Scan on catalog_item_names        (cost=0.00..8137.33)
--   Index Scan using catalog_item_facts_uidx      (cost=0.29..292.69)
--   Index Scan using catalog_item_relations_uidx  (cost=0.29..258.41)
--   Seq Scan on catalog_source_links      (cost=0.00..4433.07)
--
-- About 470,000 rows scanned to delete one row, on a one-vCPU database, for
-- every one of 129,214 source records. Measured on 2026-09-07 the second EPPO
-- reconciliation was clearing roughly thirty-five assertions a minute and had
-- the box at full load — which is also why the public picker was answering
-- 503 under its own 400 ms deadline while the job ran.
--
-- Five btree indexes turn each subquery into a probe. They are small: one
-- uuid key per referencing row.

create index if not exists catalog_item_identifiers_assertion_idx
  on catalog_item_identifiers (assertion_id);

create index if not exists catalog_item_names_assertion_idx
  on catalog_item_names (assertion_id);

create index if not exists catalog_item_facts_assertion_idx
  on catalog_item_facts (assertion_id);

create index if not exists catalog_item_relations_assertion_idx
  on catalog_item_relations (assertion_id);

create index if not exists catalog_source_links_assertion_idx
  on catalog_source_links (assertion_id);

-- A fresh index is invisible to the planner's row estimates until the table is
-- analyzed, and this migration exists to change a plan.
analyze catalog_item_identifiers;
analyze catalog_item_names;
analyze catalog_item_facts;
analyze catalog_item_relations;
analyze catalog_source_links;
