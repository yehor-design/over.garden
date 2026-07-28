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
    ]);
    expect(migrations.every(({ sql }) => sql.trim().length > 0)).toBe(true);
  });
});
