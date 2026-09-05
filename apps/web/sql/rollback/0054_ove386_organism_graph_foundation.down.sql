-- Rollback of 0054: removes every object the organism graph foundation added
-- and restores the projection reason list 0039 left behind.
--
-- 0054 is additive, so this rollback loses only what 0054 itself derived: the
-- backfilled node kinds, ranks, kingdoms, identity states, first-hand dates,
-- name types, scripts, accepted names, the legacy-link assertions, the
-- identifiers read from the source projections and the slug history rows. No
-- gardener row is touched: `catalog_items`, `catalog_item_names`,
-- `plant_objects`, `journal_entries` and the source layer keep every row they
-- had before 0054. `scripts/prove-organism-graph-foundation.ts` executes this
-- file between two applications of 0054 on a fresh bootstrap.

drop trigger if exists catalog_item_slug_history_sync_trg on catalog_items;
drop function if exists catalog_item_slug_history_sync();

drop trigger if exists catalog_item_facts_touch_content_trg on catalog_item_facts;
drop trigger if exists catalog_item_relations_touch_content_trg on catalog_item_relations;
drop trigger if exists catalog_item_identifiers_touch_content_trg on catalog_item_identifiers;
drop trigger if exists catalog_item_names_touch_content_trg on catalog_item_names;
drop function if exists catalog_touch_item_content();

drop trigger if exists catalog_item_relations_enforce_kinds_trg on catalog_item_relations;
drop function if exists catalog_item_relations_enforce_kinds();

drop trigger if exists catalog_curation_actions_append_only_trg on catalog_curation_actions;
drop function if exists catalog_curation_actions_append_only();

drop function if exists catalog_normalize_name(text);

drop table if exists catalog_search_misses;
drop table if exists catalog_curation_actions;
drop table if exists catalog_curation_queue;
drop table if exists catalog_item_slug_history;
drop table if exists catalog_item_facts;
drop table if exists catalog_item_relations;
drop table if exists catalog_item_identifiers;

alter table catalog_source_links
  drop constraint if exists catalog_source_links_assertion_fkey;
alter table catalog_source_links
  drop column if exists assertion_id;

alter table catalog_item_names
  drop constraint if exists catalog_item_names_assertion_fkey;

drop table if exists catalog_source_assertions;

drop index if exists catalog_item_names_normalized_prefix_idx;

alter table catalog_item_names
  drop constraint if exists catalog_item_names_name_type_check,
  drop constraint if exists catalog_item_names_script_check,
  drop constraint if exists catalog_item_names_authorship_check,
  drop constraint if exists catalog_item_names_weight_check;

alter table catalog_item_names
  drop column if exists name_type,
  drop column if exists script,
  drop column if exists authorship,
  drop column if exists assertion_id,
  drop column if exists weight;

drop index if exists catalog_items_parent_idx;
drop index if exists catalog_items_ancestors_gin_idx;
drop index if exists catalog_items_identity_kind_idx;

alter table catalog_items
  drop constraint if exists catalog_items_accepted_name_fkey,
  drop constraint if exists catalog_items_parent_not_self_check,
  drop constraint if exists catalog_items_parent_fkey,
  drop constraint if exists catalog_items_search_weight_check,
  drop constraint if exists catalog_items_identity_state_check,
  drop constraint if exists catalog_items_kingdom_check,
  drop constraint if exists catalog_items_rank_check,
  drop constraint if exists catalog_items_node_kind_check;

alter table catalog_items
  drop column if exists node_kind,
  drop column if exists rank,
  drop column if exists kingdom,
  drop column if exists parent_catalog_item_id,
  drop column if exists ancestor_ids,
  drop column if exists identity_state,
  drop column if exists accepted_name_id,
  drop column if exists search_weight,
  drop column if exists registered_ua,
  drop column if exists registered_eu,
  drop column if exists has_registered_forms,
  drop column if exists is_host,
  drop column if exists indexable_override,
  drop column if exists first_hand_content_at,
  drop column if exists content_updated_at;

-- from 0039_ove353_journal_delete_retention.sql (verbatim reason list)
alter table public_projection_intents
  drop constraint if exists public_projection_intents_reason_check;

alter table public_projection_intents
  add constraint public_projection_intents_reason_check
  check (
    desired_reason in (
      'publish',
      'edit',
      'journal_delete',
      'archive',
      'erasure',
      'moderation',
      'location_change',
      'catalog_identity',
      'media_presentation',
      'profile_visibility',
      'repair'
    )
  );
