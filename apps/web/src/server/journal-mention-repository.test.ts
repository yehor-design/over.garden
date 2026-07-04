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
  buildCatalogMentionSuggestionsQuery,
  buildInsertJournalEntryCatalogMentionsQuery,
  buildPublicHandleMentionSuggestionsQuery,
  buildPublicObjectMentionSuggestionsQuery,
  buildResolvePublicObjectMentionTargetsQuery,
  normalizeMentionQuery,
} from "./journal-mention-repository";

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
const scope = scopedToUser("00000000-0000-0000-0000-000000000001");
const privateFieldPattern =
  /journal_entries"\."title|journal_entries"\."body|media_assets|quarantine|derivative|email|phone|session|ip_address|user_agent|latitude|longitude|coordinates/i;

describe("journal mention repository query contracts", () => {
  it("suggests only cross-user objects with an active public entry", () => {
    const compiled = buildPublicObjectMentionSuggestionsQuery(
      testDb,
      scope,
      normalizeMentionQuery("tomato"),
      3,
    ).compile();

    expect(compiled.sql).toContain('"journal_entries"."visibility" = $1');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $2');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" !=');
    expect(compiled.sql).not.toMatch(privateFieldPattern);
  });

  it("revalidates public object mention targets at save time", () => {
    const compiled = buildResolvePublicObjectMentionTargetsQuery(
      testDb,
      scope,
      ["00000000-0000-0000-0000-000000000010"],
    ).compile();

    expect(compiled.sql).toContain('"journal_entries"."visibility" = $1');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $2');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" != $3');
    expect(compiled.sql).toContain('"plant_objects"."id" in ($4)');
    expect(compiled.sql).not.toMatch(privateFieldPattern);
  });

  it("suggests public handles without joining auth identity or private profile data", () => {
    const compiled = buildPublicHandleMentionSuggestionsQuery(
      testDb,
      scope,
      normalizeMentionQuery("green"),
      3,
    ).compile();

    expect(compiled.sql).toContain('from "user_public_profiles"');
    expect(compiled.sql).toContain('"user_id" != $1');
    expect(compiled.sql).toContain('"normalized_handle" like $2');
    expect(compiled.sql).not.toContain('from "user"');
    expect(compiled.sql).not.toMatch(privateFieldPattern);
  });

  it("suggests only selectable first-party catalog targets", () => {
    const compiled = buildCatalogMentionSuggestionsQuery(
      testDb,
      normalizeMentionQuery("cherry"),
      3,
    ).compile();

    expect(compiled.sql).toContain('"catalog_items"."status" in ($1, $2)');
    expect(compiled.sql).toContain(
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(compiled.sql).not.toMatch(privateFieldPattern);
  });

  it("stores catalog mentions idempotently by entry and catalog item", () => {
    const compiled = buildInsertJournalEntryCatalogMentionsQuery(testDb, {
      journalEntryId: "00000000-0000-0000-0000-000000000020",
      ownerUserId: "00000000-0000-0000-0000-000000000001",
      spaceId: "00000000-0000-0000-0000-000000000002",
      catalogItemIds: [
        "00000000-0000-0000-0000-000000000030",
        "00000000-0000-0000-0000-000000000031",
      ],
    }).compile();

    expect(compiled.sql).toContain(
      'insert into "journal_entry_catalog_mentions"',
    );
    expect(compiled.sql).toContain(
      'on conflict ("journal_entry_id", "catalog_item_id") do nothing',
    );
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000020",
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000030",
      "00000000-0000-0000-0000-000000000020",
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000031",
    ]);
  });
});
