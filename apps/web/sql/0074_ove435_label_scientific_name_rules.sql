-- OVE-435: a gardener label that is a scientific name reaches its taxon.
--
-- The reconciliation ladder (`0056`) reaches cultivars and breeds by their
-- denomination and nothing else from a gardener's label: every candidate of
-- the label ladder was a form. So an object whose own name was exactly
-- `Solanum lycopersicum` stayed `variety_state = 'free_text'` beside the card
-- for Solanum lycopersicum — measured on production 2026-09-12, all four
-- public objects sat that way (two `Solanum lycopersicum`, two `Apis
-- mellifera`), every entry's graph had no `about`, both cards no `subjectOf`,
-- and both cards stayed `noindex` with `first_hand_content_at` null although a
-- gardener had written about them (ADR-0026 D9).
--
-- The worker gains the rung (`app/catalog_reconcile.py`, rung 7): a label equal
-- after the shared normalizer to the accepted name of exactly one active taxon
-- the object's kind can be proposes `label_scientific_name` (0.97, above the
-- seeded threshold, so it applies itself through `catalog_apply_queue_item`
-- like a denomination match); a label equal to a synonym of exactly one
-- proposes `label_scientific_synonym` (0.90, queued for the owner). Each rule
-- code needs its row in the per-rule thresholds table, whose rule code is a
-- closed set in a CHECK constraint, so this migration widens the set and seeds
-- the two rows at the same 0.95 every other rule started from. Nothing else
-- changes: the queue item type stays `label_link`, the apply and revert
-- functions are untouched, and the recalibration job updates rows by rule
-- code and simply finds two more.
--
-- Replay-safe: the constraint is dropped by name and recreated, the rows are
-- inserted `on conflict do nothing`. `0056` replays over it unchanged — its
-- `create table if not exists` is a no-op and its seed skips existing rows.

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
    'denomination_transliteration',
    'label_scientific_name',
    'label_scientific_synonym'
  ));

insert into catalog_reconcile_thresholds (rule_code, threshold)
values
  ('label_scientific_name', 0.95),
  ('label_scientific_synonym', 0.95)
on conflict (rule_code) do nothing;
