-- Rollback of 0064: drop the five assertion-reference indexes.
--
-- Dropping them restores the plan that made the second EPPO reconciliation
-- clear about thirty-five assertions a minute. Nothing depends on them for
-- correctness, so this is safe — it is only slow.

drop index if exists catalog_item_identifiers_assertion_idx;
drop index if exists catalog_item_names_assertion_idx;
drop index if exists catalog_item_facts_assertion_idx;
drop index if exists catalog_item_relations_assertion_idx;
drop index if exists catalog_source_links_assertion_idx;
