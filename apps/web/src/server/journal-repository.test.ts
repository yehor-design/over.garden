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
import { scopedToUser } from "@/server/request-scope";
import {
  buildFindExistingEntryByClientMutationQuery,
  buildInsertJournalEntryQuery,
  buildPlantObjectPageObjectQuery,
  buildProcessedMediaForEntriesQuery,
} from "./journal-repository";
import { buildAttachProcessedMediaAssetToEntryQuery } from "./media/media-repository";

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

describe("journal repository query contracts", () => {
  it("binds entry idempotency to owner_user_id and client_mutation_id", () => {
    const compiled = buildInsertJournalEntryQuery(testDb, {
      owner_user_id: "00000000-0000-0000-0000-000000000001",
      space_id: "00000000-0000-0000-0000-000000000002",
      plant_object_id: "00000000-0000-0000-0000-000000000003",
      title: "First flowers",
      body: "Two new flower clusters.",
      entry_scope: "object",
      entry_date: "2026-06-26",
      visibility: "private",
      client_mutation_id: "mutation-1",
    }).compile();

    expect(compiled.sql).toContain(
      'on conflict ("owner_user_id", "client_mutation_id") do nothing',
    );
    expect(compiled.sql).toContain("returning *");
  });

  it("looks up existing idempotent entries only inside the request scope", () => {
    const compiled = buildFindExistingEntryByClientMutationQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      "mutation-1",
    ).compile();

    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('"client_mutation_id" = $2');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "mutation-1",
    ]);
  });

  it("requires owner scope on object and space readback", () => {
    const compiled = buildPlantObjectPageObjectQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      "00000000-0000-0000-0000-000000000003",
    ).compile();

    expect(compiled.sql).toContain('"plant_objects"."id" = $1');
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" = $2');
    expect(compiled.sql).toContain('"spaces"."owner_user_id" = $3');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000001",
    ]);
  });

  it("attaches only owner-scoped processed media to an entry", () => {
    const compiled = buildAttachProcessedMediaAssetToEntryQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      {
        mediaAssetId: "00000000-0000-0000-0000-000000000010",
        journalEntryId: "00000000-0000-0000-0000-000000000020",
      },
    ).compile();

    expect(compiled.sql).toContain('update "media_assets"');
    expect(compiled.sql).toContain('"id" = $3');
    expect(compiled.sql).toContain('"owner_user_id" = $4');
    expect(compiled.sql).toContain('"status" = $5');
    expect(compiled.sql).toContain('"journal_entry_id" is null');
    expect(compiled.sql).toContain('"journal_entry_id" = $6');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000020",
      expect.any(Date),
      "00000000-0000-0000-0000-000000000010",
      "00000000-0000-0000-0000-000000000001",
      "processed",
      "00000000-0000-0000-0000-000000000020",
    ]);
  });

  it("selects derivative-only media readback inside owner scope", () => {
    const compiled = buildProcessedMediaForEntriesQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      [
        "00000000-0000-0000-0000-000000000020",
        "00000000-0000-0000-0000-000000000021",
      ],
    ).compile();

    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('"journal_entry_id" in ($2, $3)');
    expect(compiled.sql).toContain('"status" = $4');
    expect(compiled.sql).toContain('"derivative_key" is not null');
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000020",
      "00000000-0000-0000-0000-000000000021",
      "processed",
    ]);
  });
});
