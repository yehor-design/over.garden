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
});
