-- Rollback of 0074: the two label-to-taxon rules leave the thresholds table
-- and its closed set goes back to the six rules of `0056`.
--
-- Safe at any time for the schema. Links the rung already made stay: they
-- are ordinary `label_link` decisions in `catalog_curation_actions`, each
-- with its inverse, and are reverted one by one with `catalog_revert_action`
-- if the owner wants them undone — a rollback of a constraint is not a
-- rollback of a decision. A worker built with the rung keeps proposing under
-- these rule codes and falls back to the default threshold for them
-- (`read_thresholds`), so deploy the previous worker image with this file.

delete from catalog_reconcile_thresholds
where rule_code in ('label_scientific_name', 'label_scientific_synonym');

alter table catalog_reconcile_thresholds
  drop constraint if exists catalog_reconcile_thresholds_rule_code_check;

alter table catalog_reconcile_thresholds
  add constraint catalog_reconcile_thresholds_rule_code_check
  check (rule_code in (
    'shared_identifier',
    'exact_scientific_authorship',
    'canonical_same_kingdom_rank',
    'fuzzy_same_genus',
    'denomination_equal',
    'denomination_transliteration'
  ));
