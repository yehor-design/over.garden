import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "@/db/schema";
import {
  buildAnonymizeErasureRequestSubjectsQuery,
  buildAnonymizeJournalEntriesForErasureQuery,
  buildAnonymizeLineageClaimAuditEventsForErasureQuery,
  buildAnonymizeLineageNodeFollowsForErasureQuery,
  buildAnonymizeLineagePendingSourceIdentitiesForErasureQuery,
  buildAnonymizeLineageProvenanceEdgesForErasureQuery,
  buildAnonymizeLineageQuestionsForErasureQuery,
  buildCountUnconvergedErasureMediaCleanupJobsQuery,
  buildDeletePendingJournalSearchJobsForErasureQuery,
  buildDeleteOwnedJournalEntryCatalogMentionsForErasureQuery,
  buildDeleteOwnedJournalEntryObjectMentionsForErasureQuery,
  buildDeleteOwnedJournalMutationReceiptsForErasureQuery,
  buildEnqueueErasureMediaDeleteJobQuery,
  buildExecutableErasureRequestQuery,
  buildMarkErasureCleanupPendingQuery,
  expectedErasureMaintainerApprovalText,
} from "./erasure-execution";

class TestPostgresDialect implements Dialect {
  createDriver(): Driver {
    return new DummyDriver();
  }

  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new PostgresAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new PostgresIntrospector(db);
  }
}

const testDb = new Kysely<Database>({ dialect: new TestPostgresDialect() });
const requestId = "00000000-0000-4000-8000-00000000abcd";
const requesterUserId = "00000000-0000-4000-8000-000000000001";
const erasedSubjectUserId = "00000000-0000-4000-8000-00000000eeee";

describe("approved erasure execution SQL contracts", () => {
  it("uses a request-specific maintainer approval phrase", () => {
    expect(expectedErasureMaintainerApprovalText(requestId)).toBe(
      "APPROVE request-0000abcd IRREVERSIBLE ERASURE",
    );
  });

  it("requires an open request with a reviewed dry-run before execution", () => {
    const compiled = buildExecutableErasureRequestQuery(
      testDb,
      requestId,
    ).compile();

    expect(compiled.sql).toContain('from "erasure_requests"');
    expect(compiled.sql).toContain('"status" in ($2, $3)');
    expect(compiled.sql).toContain('"dry_run_reviewed_at" is not null');
    expect(compiled.parameters).toEqual([
      requestId,
      "submitted",
      "reviewing",
      1,
    ]);
  });

  it("anonymizes journal content while preserving public 410 tombstones", () => {
    const now = new Date("2026-07-01T08:00:00.000Z");
    const compiled = buildAnonymizeJournalEntriesForErasureQuery(testDb, {
      requesterUserId,
      erasedSubjectUserId,
      now,
    }).compile();

    expect(compiled.sql).toContain('update "journal_entries"');
    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('"title" = $2');
    expect(compiled.sql).toContain('"body" = $3');
    expect(compiled.sql).toContain('"content_document" = $4');
    expect(compiled.sql).toContain('"content_schema_version" = $5');
    expect(compiled.sql).toContain('"cover_media_asset_id" = $6');
    expect(compiled.sql).toContain('"journal_revision" = journal_revision + 1');
    expect(compiled.sql).toContain('"visibility" = $8');
    expect(compiled.sql).toContain('"lifecycle_state" = $9');
    expect(compiled.sql).toContain('"public_noindex" = $10');
    expect(compiled.sql).toContain("coalesce(public_gone_at");
    expect(compiled.sql).toContain(
      '\'erased:\' || "journal_entries"."id"::text',
    );
    expect(compiled.parameters).toContain(erasedSubjectUserId);
    expect(compiled.parameters).toContain("Erased journal entry");
    expect(compiled.parameters).toContain("This entry was erased by request.");
    expect(compiled.parameters).toContain(requesterUserId);
  });

  it("scrubs all queue statuses that still carry the subject user id", () => {
    const compiled = buildDeletePendingJournalSearchJobsForErasureQuery(
      testDb,
      requesterUserId,
    ).compile();

    expect(compiled.sql).toContain('delete from "job_queue"');
    expect(compiled.sql).toContain("payload->>'userId'");
    expect(compiled.sql).toContain("payload::text");
    expect(compiled.parameters).toContain(requesterUserId);
  });

  it("clears explicit cover references before media deletion", () => {
    const now = new Date("2026-07-01T08:00:00.000Z");
    const compiled = buildAnonymizeJournalEntriesForErasureQuery(testDb, {
      requesterUserId,
      erasedSubjectUserId,
      now,
    }).compile();

    expect(compiled.sql).toContain('"cover_media_asset_id"');
  });

  it("deletes owner-scoped journal mention join rows before owner anonymization", () => {
    const objectMentions =
      buildDeleteOwnedJournalEntryObjectMentionsForErasureQuery(
        testDb,
        requesterUserId,
      ).compile();
    const catalogMentions =
      buildDeleteOwnedJournalEntryCatalogMentionsForErasureQuery(
        testDb,
        requesterUserId,
      ).compile();

    expect(objectMentions.sql).toContain(
      'delete from "journal_entry_object_mentions"',
    );
    expect(catalogMentions.sql).toContain(
      'delete from "journal_entry_catalog_mentions"',
    );

    for (const compiled of [objectMentions, catalogMentions]) {
      expect(compiled.sql).toContain('"owner_user_id" = $1');
      expect(compiled.sql).not.toMatch(
        /journal_entries|plant_objects|catalog_items|title|body|display_name|canonical_name|media_assets|quarantine|derivative|email|phone|coarse_region|location_visibility|ip|user_agent/i,
      );
      expect(compiled.parameters).toEqual([requesterUserId]);
    }
  });

  it("deletes owner-scoped mutation receipts before journal ownership is rekeyed", () => {
    const compiled = buildDeleteOwnedJournalMutationReceiptsForErasureQuery(
      testDb,
      requesterUserId,
    ).compile();

    expect(compiled.sql).toContain(
      'delete from "journal_entry_mutation_receipts"',
    );
    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.parameters).toEqual([requesterUserId]);
  });

  it("anonymizes lineage provenance edges without deleting structural tombstones", () => {
    const now = new Date("2026-07-01T08:00:00.000Z");
    const compiled = buildAnonymizeLineageProvenanceEdgesForErasureQuery(
      testDb,
      {
        requesterUserId,
        now,
      },
    ).compile();

    expect(compiled.sql).toContain('update "lineage_provenance_edges"');
    expect(compiled.sql).toContain('"consent_state" = $1');
    expect(compiled.sql).toContain('"erasure_state" = $2');
    expect(compiled.sql).toContain("Erased source");
    expect(compiled.sql).toContain(
      '\'erased:\' || "lineage_provenance_edges"."id"::text',
    );
    expect(compiled.sql).toMatch(/"owner_user_id" = \$\d+/);
    expect(compiled.sql).toMatch(/"source_owner_user_id" = \$\d+/);
    expect(compiled.sql).toMatch(/source_owner_user_id <> \$\d+/);
    expect(compiled.sql).toContain('"lineage_pending_source_identities"');
    expect(compiled.sql).toMatch(/"created_by_user_id" = \$\d+/);
    expect(compiled.sql).toMatch(/"claimed_by_user_id" = \$\d+/);
    expect(compiled.sql).not.toMatch(
      /journal_entries|media_assets|body|quarantine|derivative|email|phone|coarse_region|location_visibility|ip|user_agent/i,
    );
    expect(compiled.parameters).toEqual([
      "anonymized",
      "anonymized",
      requesterUserId,
      requesterUserId,
      now,
      requesterUserId,
      requesterUserId,
      requesterUserId,
      requesterUserId,
    ]);
  });

  it("anonymizes lineage pending source identities without selecting invite tokens", () => {
    const now = new Date("2026-07-01T08:00:00.000Z");
    const compiled =
      buildAnonymizeLineagePendingSourceIdentitiesForErasureQuery(
        testDb,
        requesterUserId,
        now,
      ).compile();

    expect(compiled.sql).toContain(
      'update "lineage_pending_source_identities"',
    );
    expect(compiled.sql).toContain('"display_label" = $1');
    expect(compiled.sql).toContain('"invite_state" = $2');
    expect(compiled.sql).toContain('"created_by_user_id" = case');
    expect(compiled.sql).toContain('"claimed_by_user_id" = case');
    expect(compiled.sql).toContain('"created_by_user_id" = $6');
    expect(compiled.sql).toContain('"claimed_by_user_id" = $7');
    expect(compiled.sql).not.toMatch(
      /token|journal_entries|media_assets|body|quarantine|derivative|email|phone|coarse_region|location_visibility|ip|user_agent|referrer/i,
    );
    expect(compiled.parameters).toEqual([
      "Erased pending source",
      "anonymized",
      requesterUserId,
      requesterUserId,
      now,
      requesterUserId,
      requesterUserId,
    ]);
  });

  it("anonymizes lineage claim audit actor and target ids without selecting edge payloads", () => {
    const compiled = buildAnonymizeLineageClaimAuditEventsForErasureQuery(
      testDb,
      requesterUserId,
    ).compile();

    expect(compiled.sql).toContain(
      'update "lineage_provenance_edge_audit_events"',
    );
    expect(compiled.sql).toContain('"actor_user_id" = case');
    expect(compiled.sql).toContain('"target_user_id" = case');
    expect(compiled.sql).toContain('"actor_user_id" = $3');
    expect(compiled.sql).toContain('"target_user_id" = $4');
    expect(compiled.sql).not.toMatch(
      /lineage_provenance_edges|source_reference_label|journal_entries|media_assets|body|quarantine|derivative|email|phone|coarse_region|location_visibility|ip|user_agent/i,
    );
    expect(compiled.parameters).toEqual([
      requesterUserId,
      requesterUserId,
      requesterUserId,
      requesterUserId,
    ]);
  });

  it("anonymizes lineage follows without selecting object labels", () => {
    const now = new Date("2026-07-01T08:00:00.000Z");
    const compiled = buildAnonymizeLineageNodeFollowsForErasureQuery(testDb, {
      requesterUserId,
      erasedSubjectUserId,
      now,
    }).compile();

    expect(compiled.sql).toContain('update "lineage_node_follows"');
    expect(compiled.sql).toContain('"follower_user_id" = case');
    expect(compiled.sql).toContain('"target_owner_user_id" = case');
    expect(compiled.sql).toContain('"follow_state" =');
    expect(compiled.sql).toContain('"updated_at" =');
    expect(compiled.sql).not.toMatch(
      /plant_objects|journal_entries|display_name|question_text|source_reference_label|media_assets|body|quarantine|derivative|email|phone|coarse_region|location_visibility|ip_address|user_agent/i,
    );
    expect(compiled.parameters).toContain(requesterUserId);
    expect(compiled.parameters).toContain(erasedSubjectUserId);
    expect(compiled.parameters).toContain("anonymized");
    expect(compiled.parameters).toContain(now);
  });

  it("anonymizes lineage questions including question text and client mutation ids", () => {
    const now = new Date("2026-07-01T08:00:00.000Z");
    const compiled = buildAnonymizeLineageQuestionsForErasureQuery(testDb, {
      requesterUserId,
      erasedSubjectUserId,
      now,
    }).compile();

    expect(compiled.sql).toContain('update "lineage_questions"');
    expect(compiled.sql).toContain('"asker_user_id" = case');
    expect(compiled.sql).toContain('"recipient_user_id" = case');
    expect(compiled.sql).toContain('"question_text" =');
    expect(compiled.sql).toContain('"question_state" =');
    expect(compiled.sql).toContain(
      '\'erased:\' || "lineage_questions"."id"::text',
    );
    expect(compiled.sql).not.toMatch(
      /plant_objects|journal_entries|display_name|source_reference_label|media_assets|body|quarantine|derivative|email|phone|coarse_region|location_visibility|ip_address|user_agent/i,
    );
    expect(compiled.parameters).toContain(requesterUserId);
    expect(compiled.parameters).toContain(erasedSubjectUserId);
    expect(compiled.parameters).toContain(
      "This lineage question was erased by request.",
    );
    expect(compiled.parameters).toContain("anonymized");
    expect(compiled.parameters).toContain(now);
  });

  it("enqueues durable erasure_media_object_delete jobs before claiming cleanup_pending", () => {
    const compiled = buildEnqueueErasureMediaDeleteJobQuery(testDb, {
      requestId,
      mediaObject: {
        bucket: "quarantine",
        objectKey: "media/erasure-proof.webp",
      },
    }).compile();
    const pending = buildMarkErasureCleanupPendingQuery(
      testDb,
      { userId: "00000000-0000-4000-8000-0000000000aa" },
      { requestId, now: new Date("2026-07-01T08:00:00.000Z") },
    ).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.parameters).toContain("erasure");
    expect(compiled.parameters).toContainEqual({
      kind: "erasure_media_object_delete",
      requestId,
      bucket: "quarantine",
      objectKey: "media/erasure-proof.webp",
    });
    expect(compiled.parameters).toContain(
      `erasure_media_delete:${requestId}:quarantine:media/erasure-proof.webp`,
    );
    expect(pending.sql).toContain('"handled_status" = $3');
    expect(pending.parameters).toContain("cleanup_pending");
  });

  it("treats every non-done media cleanup state as unconverged", () => {
    const compiled = buildCountUnconvergedErasureMediaCleanupJobsQuery(
      testDb,
      requestId,
    ).compile();

    expect(compiled.sql).toContain('from "job_queue"');
    expect(compiled.sql).toContain('"status" != $4');
    expect(compiled.parameters).toEqual([
      "erasure",
      "erasure_media_object_delete",
      requestId,
      "done",
    ]);
  });

  it("rekeys erasure request subjects away from the original requester id", () => {
    const now = new Date("2026-07-01T08:00:00.000Z");
    const compiled = buildAnonymizeErasureRequestSubjectsQuery(testDb, {
      requesterUserId,
      erasedSubjectUserId,
      now,
    }).compile();

    expect(compiled.sql).toContain('update "erasure_requests"');
    expect(compiled.sql).toContain('"requester_user_id" = $1');
    expect(compiled.sql).toContain('"requester_user_id" = $3');
    expect(compiled.parameters).toEqual([
      erasedSubjectUserId,
      now,
      requesterUserId,
    ]);
  });
});
