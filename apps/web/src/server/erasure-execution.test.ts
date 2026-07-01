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
  buildDeletePendingJournalSearchJobsForErasureQuery,
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
    expect(compiled.sql).toContain("'erased:' || \"journal_entries\".\"id\"::text");
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
