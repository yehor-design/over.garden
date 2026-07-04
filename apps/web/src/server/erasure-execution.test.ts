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
  buildDeletePendingJournalSearchJobsForErasureQuery,
  buildDeleteOwnedJournalEntryCatalogMentionsForErasureQuery,
  buildDeleteOwnedJournalEntryObjectMentionsForErasureQuery,
  buildEnqueueErasureJournalUnindexJobQuery,
  buildExecutableErasureRequestQuery,
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
    expect(compiled.sql).toContain('"visibility" = $5');
    expect(compiled.sql).toContain('"lifecycle_state" = $6');
    expect(compiled.sql).toContain('"public_noindex" = $7');
    expect(compiled.sql).toContain("coalesce(public_gone_at");
    expect(compiled.sql).toContain(
      '\'erased:\' || "journal_entries"."id"::text',
    );
    expect(compiled.parameters).toContain(erasedSubjectUserId);
    expect(compiled.parameters).toContain("Erased journal entry");
    expect(compiled.parameters).toContain("This entry was erased by request.");
    expect(compiled.parameters).toContain(requesterUserId);
  });

  it("removes stale requester-owned journal search jobs", () => {
    const compiled = buildDeletePendingJournalSearchJobsForErasureQuery(
      testDb,
      requesterUserId,
    ).compile();

    expect(compiled.sql).toContain('delete from "job_queue"');
    expect(compiled.sql).toContain("payload->>'userId'");
    expect(compiled.sql).toContain("payload->>'kind'");
    expect(compiled.parameters).toEqual([
      "pending",
      "processing",
      "failed",
      requesterUserId,
      "journal_entry_index",
      "journal_entry_unindex",
    ]);
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
    expect(compiled.sql).toContain('"owner_user_id" = $4');
    expect(compiled.sql).toContain('"source_owner_user_id" = $5');
    expect(compiled.sql).toContain('"lineage_pending_source_identities"');
    expect(compiled.sql).toContain('"created_by_user_id" = $6');
    expect(compiled.sql).toContain('"claimed_by_user_id" = $7');
    expect(compiled.sql).not.toMatch(
      /journal_entries|media_assets|body|quarantine|derivative|email|phone|coarse_region|location_visibility|ip|user_agent/i,
    );
    expect(compiled.parameters).toEqual([
      "anonymized",
      "anonymized",
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

  it("enqueues erasure unindex jobs against the synthetic erased owner id", () => {
    const compiled = buildEnqueueErasureJournalUnindexJobQuery(testDb, {
      requestId,
      journalEntryId: "00000000-0000-4000-8000-000000000777",
      erasedSubjectUserId,
    }).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.sql).toContain(
      'on conflict ("idempotency_key") where "idempotency_key" is not null do update',
    );
    expect(compiled.parameters).toEqual([
      "matching",
      {
        kind: "journal_entry_unindex",
        journalEntryId: "00000000-0000-4000-8000-000000000777",
        userId: erasedSubjectUserId,
      },
      `journal_entry_unindex:00000000-0000-4000-8000-000000000777:erasure:${requestId}`,
      {
        kind: "journal_entry_unindex",
        journalEntryId: "00000000-0000-4000-8000-000000000777",
        userId: erasedSubjectUserId,
      },
      "pending",
      0,
      null,
      null,
      null,
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
