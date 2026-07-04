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
  buildPublicTopicAggregationEntriesQuery,
  buildPublicTopicAggregationStatsQuery,
  buildPublicTopicLookupQuery,
} from "./public-topic-repository";

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

describe("public topic repository query contracts", () => {
  it("looks up only curated topic surfaces", () => {
    const compiled = buildPublicTopicLookupQuery(testDb, "plants").compile();

    expect(compiled.sql).toContain('from "journal_topics"');
    expect(compiled.sql).toContain('"slug" = $1');
    expect(compiled.sql).toContain('"trust_state" = $2');
    expect(compiled.parameters).toEqual(["plants", "curated"]);
  });

  it("counts only accepted eligible active public entries for topic promotion", () => {
    const compiled = buildPublicTopicAggregationStatsQuery(
      testDb,
      "plants",
    ).compile();

    expect(compiled.sql).toContain('from "journal_entry_topic_signals"');
    expect(compiled.sql).toContain('inner join "journal_topics"');
    expect(compiled.sql).toContain('inner join "journal_entries"');
    expect(compiled.sql).toContain(
      'coalesce(sum(char_length("journal_entries"."body")), 0)',
    );
    expect(compiled.sql).toContain('"journal_topics"."slug" = $1');
    expect(compiled.sql).toContain('"journal_topics"."trust_state" = $2');
    expect(compiled.sql).toContain(
      '"journal_entry_topic_signals"."review_state" = $3',
    );
    expect(compiled.sql).toContain(
      '"journal_entry_topic_signals"."public_membership_state" = $4',
    );
    expect(compiled.sql).toContain('"journal_entries"."visibility" = $5');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $6');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).not.toContain('as "body"');
    expect(compiled.sql).not.toContain("owner_user_id");
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.sql).not.toContain("coordinates");
    expect(compiled.sql).not.toContain("latitude");
    expect(compiled.sql).not.toContain("longitude");
    expect(compiled.parameters).toEqual([
      "plants",
      "curated",
      "accepted",
      "eligible",
      "public",
      "active",
    ]);
  });

  it("projects only bounded entry cards for public topic pages", () => {
    const compiled = buildPublicTopicAggregationEntriesQuery(
      testDb,
      "plants",
    ).compile();

    expect(compiled.sql).toContain('"journal_entries"."id" as "id"');
    expect(compiled.sql).toContain('"journal_entries"."title" as "title"');
    expect(compiled.sql).toContain(
      '"journal_entries"."entry_date" as "entryDate"',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" as "publicSlug"',
    );
    expect(compiled.sql).toContain('"journal_entries"."visibility" = $5');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $6');
    expect(compiled.sql).not.toContain('"journal_entries"."body"');
    expect(compiled.sql).not.toContain("owner_user_id");
    expect(compiled.sql).not.toContain("media_assets");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.sql).not.toContain("coordinates");
    expect(compiled.parameters).toEqual([
      "plants",
      "curated",
      "accepted",
      "eligible",
      "public",
      "active",
      12,
    ]);
  });
});
