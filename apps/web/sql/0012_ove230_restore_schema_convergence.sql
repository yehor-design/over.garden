-- OVE-230: make restored historical clusters converge to the current-main
-- schema instead of retaining history-dependent IF NOT EXISTS definitions.

alter table community_contributions
  drop constraint if exists community_contributions_removed_by_user_id_fkey;
alter table community_contributions
  add constraint community_contributions_removed_by_user_id_fkey
  foreign key (removed_by_user_id) references "user"(id) on delete restrict;

alter table community_contribution_reports
  drop constraint if exists community_reports_resolved_by_user_id_fkey;
alter table community_contribution_reports
  add constraint community_reports_resolved_by_user_id_fkey
  foreign key (resolved_by_user_id) references "user"(id) on delete restrict;

alter table erasure_requests
  drop constraint if exists erasure_requests_handled_status_check;
alter table erasure_requests
  add constraint erasure_requests_handled_status_check
  check (
    handled_status is null
    or handled_status in (
      'completed',
      'cleanup_pending',
      'declined',
      'duplicate',
      'needs_identity_verification'
    )
  );

drop index if exists journal_entry_catalog_mentions_owner_entry_idx;
create index journal_entry_catalog_mentions_owner_entry_idx
  on journal_entry_catalog_mentions (owner_user_id, space_id, journal_entry_id);

alter table matching_worker_heartbeats
  drop constraint if exists matching_worker_heartbeats_commit_sha_check,
  drop constraint if exists matching_worker_heartbeats_release_commit_sha_check,
  drop constraint if exists matching_worker_heartbeats_schema_compatibility_check,
  drop constraint if exists matching_worker_heartbeats_schema_compatibility_class_check,
  drop constraint if exists matching_worker_heartbeats_supported_handlers_check;
alter table matching_worker_heartbeats
  add constraint matching_worker_heartbeats_commit_sha_check
    check (release_commit_sha ~ '^[0-9a-f]{40}$'),
  add constraint matching_worker_heartbeats_schema_compatibility_check
    check (schema_compatibility_class = 'ove190.matching-schema.v1'),
  add constraint matching_worker_heartbeats_supported_handlers_check
    check (
      supported_handlers = array[
        'catalog_alias_suggestions_refresh',
        'catalog_fuzzy_duplicate_qa_refresh',
        'catalog_match_suggestions_refresh',
        'catalog_typeahead_reindex',
        'journal_entry_index',
        'journal_entry_unindex'
      ]::text[]
    );

alter table catalog_match_suggestions
  drop constraint if exists catalog_match_suggestions_source_matching_fingerprint_check,
  drop constraint if exists catalog_match_suggestions_target_matching_fingerprint_check,
  drop constraint if exists catalog_match_suggestions_decision_affected_object_count_check;
