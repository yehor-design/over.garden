-- OVE-385 — the Stable Registry release model leaves the schema
-- (ADR-0025, D4 part 2).
--
-- The release model — Foundation releases, editions, extension packs, their
-- product and public catalog projections, the exception groups, decisions,
-- activations, outboxes, and the append-only item revisions they were built
-- on — was retired from every plan on 2026-09-05 and from the code the same
-- day (part 1). Every table this file drops is empty in every database: no
-- Foundation release was ever built, so nothing was ever activated, projected,
-- decided, or queued. Production is inventoried read-only before this runs,
-- the owner approves the run in writing, and the loopback proof asserts that
-- the row count of every retained table is identical before and after.
--
-- Retained by construction (ADR-0025, D2) and absent from this file on
-- purpose: catalog_source_capture_runs, catalog_source_capture_units,
-- catalog_source_records, catalog_source_snapshots, catalog_source_links,
-- catalog_source_refresh_events, catalog_source_refresh_records,
-- stable_registry_public_eppo_records, stable_registry_public_eppo_search_terms
-- and their indexes, stable_registry_public_safe_label,
-- materialize_stable_registry_public_eppo_capture, and the
-- catalog_registry_public_eppo_materialize trigger on capture runs. The
-- gardener catalog — catalog_items, catalog_item_names, and their trigram index
-- from 0043 — is untouched.
--
-- Order: the shared read-model trigger function loses its catalog branch first;
-- then the tables go children-first, so every foreign key is released by the
-- statement before it — no CASCADE, so an unexpected dependent would stop the
-- transaction instead of being dropped silently; then the trigger and helper
-- functions the tables kept alive; then the three payload CHECK constraints on
-- job_queue for the retired kinds. `sql/rollback/0053_*.down.sql` recreates
-- every object in the order the original migrations created them.

-- 1. The public read-model trigger function keeps only its EPPO branch. The
--    trigger on catalog_source_capture_runs that calls it is retained.
create or replace function materialize_stable_registry_public_read_models()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'catalog_source_capture_runs'
    and new.state = 'completed'
    and old.state is distinct from 'completed' then
    perform materialize_stable_registry_public_eppo_capture(new.id);
  end if;
  return new;
end;
$$;

-- 2. Tables, children first. Their indexes and triggers go with them,
--    including stable_registry_product_catalog_names_trgm_idx from 0043.
drop table if exists catalog_registry_extension_pack_user_names;
drop table if exists catalog_registry_extension_pack_names;
drop table if exists catalog_registry_extension_pack_rows;
drop table if exists catalog_registry_extension_packs;
drop table if exists catalog_registry_edition_diffs;
drop table if exists catalog_registry_item_relations;
drop table if exists catalog_registry_activation_sequence;
drop table if exists stable_registry_product_projection_outbox;
drop table if exists stable_registry_product_catalog_names;
drop table if exists stable_registry_product_catalog_records;
drop table if exists stable_registry_public_catalog_search_terms;
drop table if exists stable_registry_public_catalog_records;
drop table if exists catalog_registry_search_outbox;
drop table if exists catalog_registry_activations;
drop table if exists catalog_registry_active_pointers;
drop table if exists catalog_registry_decisions;
drop table if exists catalog_registry_exception_groups;
drop table if exists catalog_registry_release_members;
drop table if exists catalog_registry_releases;
drop table if exists catalog_item_revisions;

-- 3. The functions the dropped tables and their triggers kept alive.
drop function if exists prevent_catalog_item_revision_mutation();
drop function if exists prevent_catalog_registry_release_member_mutation();
drop function if exists prevent_catalog_registry_decision_mutation();
drop function if exists prevent_catalog_registry_activation_mutation();
drop function if exists enforce_catalog_registry_release_transition();
drop function if exists enforce_catalog_registry_exception_group_mutation();
drop function if exists enforce_catalog_registry_release_rollback_transition();
drop function if exists materialize_stable_registry_public_catalog_release(uuid);
drop function if exists stable_registry_product_public_slug(uuid, text);
drop function if exists materialize_stable_registry_product_release(uuid);
drop function if exists materialize_stable_registry_product_projection();
drop function if exists enforce_catalog_registry_extension_pack_transition();
drop function if exists prevent_approved_extension_pack_row_mutation();
drop function if exists materialize_stable_registry_extension_pack(uuid);
drop function if exists prevent_catalog_registry_item_relation_mutation();
drop function if exists prevent_catalog_registry_activation_sequence_mutation();
drop function if exists prevent_approved_edition_diff_mutation();
drop function if exists stable_registry_edition_affected_objects(uuid[]);

-- 4. The payload contracts of the three retired kinds. The worker terminalises
--    any such job as unsupported_kind; the database no longer describes a
--    payload shape for a kind nothing produces.
alter table job_queue
  drop constraint if exists job_queue_stable_registry_foundation_build_payload_check;

alter table job_queue
  drop constraint if exists job_queue_stable_registry_extension_pack_build_payload_check;

alter table job_queue
  drop constraint if exists job_queue_stable_registry_edition_build_payload_check;
