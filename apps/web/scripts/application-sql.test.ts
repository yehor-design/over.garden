import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadVersionedApplicationSql } from "./application-sql";

describe("versioned application SQL bootstrap", () => {
  it("loads every tracked migration in deterministic order", async () => {
    const migrations = await loadVersionedApplicationSql(path.resolve("sql"));
    expect(migrations.map(({ name }) => name)).toEqual([
      "0001_walking_skeleton.sql",
      "0005_ove202_ove207_journal_document_cover.sql",
      "0006_ove197_media_focal_presentation.sql",
      "0007_ove211_object_kind_collapse.sql",
      "0008_ove199_launch_corpus_provenance.sql",
      "0009_ove200_learning_actor_attributions.sql",
      "0010_ove225_job_queue_payload_contract.sql",
      "0011_ove242_public_projection_outbox.sql",
      "0012_ove230_restore_schema_convergence.sql",
      "0013_ove244_safe_media_admission.sql",
      "0014_ove231_launch_media_quality.sql",
      "0015_ove241_auth_email_outbox.sql",
      "0016_ove235_comment_moderation.sql",
      "0017_ove237_interaction_admission.sql",
      "0018_ove219_learning_attribution_outbox.sql",
      "0019_learning_attribution_outbox_compatibility.sql",
      "0020_ove299_remove_manual_pilot_learning.sql",
      "0021_ove314_retire_obsolete_control_plane.sql",
      "0022_ove295_google_account_uniqueness.sql",
      "0023_ove254_eppo_observed_capture.sql",
      "0024_ove255_stable_registry_foundation.sql",
      "0025_ove256_stable_registry_public_reads.sql",
      "0026_ove257_stable_registry_product_projection.sql",
      "0027_ove328_stable_registry_extension_packs.sql",
      "0028_ove258_stable_registry_editions.sql",
      "0029_online_journal_drafts.sql",
      "0035_online_only_retirement.sql",
      "0036_ove347_atomic_journal_create.sql",
      "0037_ove351_retire_external_photo_identification.sql",
      "0038_ove349_retire_legacy_journal_media.sql",
      "0039_ove353_journal_delete_retention.sql",
      "0040_ove256_public_catalog_object_kind_evidence.sql",
      "0041_ove328_extension_pack_product_projection.sql",
      "0042_ove354_source_payload_single_home.sql",
      "0043_ove355_catalog_trigram_typeahead.sql",
      "0044_ove356_worker_idle_contract.sql",
      "0045_workspace_recent_entries_index.sql",
      "0046_ove368_index_every_live_page.sql",
    ]);
    expect(migrations.every(({ sql }) => sql.trim().length > 0)).toBe(true);
  });

  it("converges history-dependent restore objects to one current-main shape", async () => {
    const migrations = await loadVersionedApplicationSql(path.resolve("sql"));
    const convergence = migrations.find(
      ({ name }) => name === "0012_ove230_restore_schema_convergence.sql",
    )?.sql;

    expect(convergence).toContain(
      "drop constraint if exists community_contributions_removed_by_user_id_fkey",
    );
    expect(convergence).toContain(
      'foreign key (removed_by_user_id) references "user"(id) on delete restrict',
    );
    expect(convergence).toContain(
      "drop constraint if exists erasure_requests_handled_status_check",
    );
    expect(convergence).toContain("'cleanup_pending'");
    expect(convergence).toContain(
      "drop index if exists journal_entry_catalog_mentions_owner_entry_idx",
    );
    expect(convergence).toContain(
      "on journal_entry_catalog_mentions (owner_user_id, space_id, journal_entry_id)",
    );
    expect(convergence).toContain(
      "drop constraint if exists matching_worker_heartbeats_supported_handlers_check",
    );
    expect(convergence).toContain(
      "drop constraint if exists catalog_match_suggestions_source_matching_fingerprint_check",
    );
  });

  it("preflights and enforces both Google account identity dimensions", async () => {
    const migrations = await loadVersionedApplicationSql(path.resolve("sql"));
    const googleUniqueness = migrations.find(
      ({ name }) => name === "0022_ove295_google_account_uniqueness.sql",
    )?.sql;

    expect(googleUniqueness).toContain('group by "providerId", "accountId"');
    expect(googleUniqueness).toContain('group by "userId", "providerId"');
    expect(googleUniqueness).toContain(
      "account_google_provider_subject_unique_idx",
    );
    expect(googleUniqueness).toContain(
      'on public.account ("providerId", "accountId")',
    );
    expect(googleUniqueness).toContain(
      "account_google_user_provider_unique_idx",
    );
    expect(googleUniqueness).toContain(
      'on public.account ("userId", "providerId")',
    );
    expect(
      googleUniqueness?.match(/where "providerId" = 'google'/g),
    ).toHaveLength(4);
  });

  it("retires the historical server-draft table after a guarded zero-state gate", async () => {
    const migrations = await loadVersionedApplicationSql(path.resolve("sql"));
    const retirement = migrations.find(
      ({ name }) => name === "0038_ove349_retire_legacy_journal_media.sql",
    )?.sql;

    expect(retirement).toContain("select count(*) from journal_entry_drafts");
    expect(retirement).toContain("where visibility <> 'public'");
    expect(retirement).toContain("drop table if exists journal_entry_drafts");
    expect(retirement).toContain("alter column derivative_key set not null");
  });
});
