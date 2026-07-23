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
  buildOwnerJournalEntryControlQuery,
  serializeOwnerJournalEntryControl,
} from "./owner-journal-entry-control";

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

describe("owner journal entry control", () => {
  it("selects only the active public entry owned by the current user", () => {
    const compiled = buildOwnerJournalEntryControlQuery(
      testDb,
      scopedToUser("00000000-0000-4000-8000-000000000001"),
      "first-harvest",
    ).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('"journal_entries"."public_slug" = $1');
    expect(compiled.sql).toContain('"journal_entries"."owner_user_id" = $2');
    expect(compiled.sql).toContain('"journal_entries"."visibility" = $3');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $4');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).not.toMatch(
      /body|client_mutation_id|email|quarantine|coordinates|latitude|longitude/i,
    );
  });

  it("maps object and space entries to their owner workspace controls", () => {
    expect(
      serializeOwnerJournalEntryControl({
        entryId: "00000000-0000-4000-8000-000000000020",
        entryScope: "object",
        plantObjectId: "00000000-0000-4000-8000-000000000003",
        spaceId: "00000000-0000-4000-8000-000000000002",
      }),
    ).toEqual({
      entryId: "00000000-0000-4000-8000-000000000020",
      managePath: "/garden/entries/00000000-0000-4000-8000-000000000020/edit",
    });

    expect(
      serializeOwnerJournalEntryControl({
        entryId: "00000000-0000-4000-8000-000000000021",
        entryScope: "space",
        plantObjectId: null,
        spaceId: "00000000-0000-4000-8000-000000000002",
      }).managePath,
    ).toBe("/garden/entries/00000000-0000-4000-8000-000000000021/edit");
  });
});
