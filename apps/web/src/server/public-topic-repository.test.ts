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
  buildPublicTopicKindsQuery,
  buildPublicTopicListQuery,
  buildPublicTopicLookupQuery,
  buildPublicTopicStatsListQuery,
  serializePublicTopicEntries,
  serializePublicKnowledgeTopics,
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
  it("serializes public topic evidence in the selected locale only", () => {
    expect(
      serializePublicTopicEntries(
        [
          {
            id: "00000000-0000-4000-8000-000000000101",
            objectId: "00000000-0000-4000-8000-000000000201",
            title: "Care check",
            body: "Visible care evidence",
            entryDate: "2026-07-30",
            publishedAt: "2026-07-30T12:00:00.000Z",
            publicSlug: "care-check",
          },
          {
            id: "00000000-0000-4000-8000-000000000102",
            objectId: "00000000-0000-4000-8000-000000000202",
            title: "Unavailable",
            body: "Unavailable",
            entryDate: "2026-07-30",
            publishedAt: null,
            publicSlug: null,
          },
        ],
        "bg",
      ),
    ).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000101",
        objectId: "00000000-0000-4000-8000-000000000201",
        title: "Care check",
        bodyPreview: "Visible care evidence",
        entryDate: "2026-07-30",
        publishedAt: "2026-07-30T12:00:00.000Z",
        publicPath: "/bg/journal/care-check",
      },
    ]);
  });

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
    expect(compiled.sql).toContain('inner join "plant_objects"');
    expect(compiled.sql).toContain('inner join "spaces"');
    expect(compiled.sql).toContain(
      '"journal_entries"."published_at" is not null',
    );
    expect(compiled.sql).toContain('"journal_entries"."entry_scope" =');
    expect(compiled.sql).toContain(
      'coalesce(sum(char_length("journal_entries"."body")), 0)',
    );
    expect(compiled.sql).toContain('"journal_topics"."slug" =');
    expect(compiled.sql).toContain('"journal_topics"."trust_state" =');
    expect(compiled.sql).toContain(
      '"journal_entry_topic_signals"."review_state" =',
    );
    expect(compiled.sql).toContain(
      '"journal_entry_topic_signals"."public_membership_state" =',
    );
    expect(compiled.sql).toContain('"journal_entries"."visibility" =');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" =');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).not.toContain('as "body"');
    expect(compiled.sql).toContain(
      '"plant_objects"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.sql).not.toContain("coordinates");
    expect(compiled.sql).not.toContain("latitude");
    expect(compiled.sql).not.toContain("longitude");
    expect(compiled.parameters).toEqual(
      expect.arrayContaining([
        "plants",
        "curated",
        "accepted",
        "eligible",
        "public",
        "active",
        "object",
      ]),
    );
  });

  it("projects bounded visible evidence needed by the measured topic adapter", () => {
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
    expect(compiled.sql).toContain('"journal_entries"."visibility" =');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" =');
    expect(compiled.sql).toContain('"journal_entries"."body" as "body"');
    expect(compiled.sql).toContain('"plant_objects"."id" as "objectId"');
    expect(compiled.sql).toContain(
      '"journal_entries"."published_at" as "publishedAt"',
    );
    expect(compiled.sql).toContain(
      '"plant_objects"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).not.toContain("media_assets");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.sql).not.toContain("coordinates");
    expect(compiled.parameters).toEqual(
      expect.arrayContaining([
        "plants",
        "curated",
        "accepted",
        "eligible",
        "public",
        "active",
        "object",
        12,
      ]),
    );
  });

  it("lists curated zero/one/dense topics with safe stats and object kinds", () => {
    const topicSql = buildPublicTopicListQuery(testDb, [
      "quiet-evidence",
      "single-observation",
      "care-checks",
      "not safe",
    ]).compile();
    const statsSql = buildPublicTopicStatsListQuery(testDb, [
      "00000000-0000-4000-8000-000000000001",
    ]).compile();
    const kindsSql = buildPublicTopicKindsQuery(testDb, [
      "00000000-0000-4000-8000-000000000001",
    ]).compile();

    expect(topicSql.sql).toContain('"trust_state" =');
    expect(topicSql.sql).toContain('"slug" in');
    expect(topicSql.parameters).toEqual(
      expect.arrayContaining([
        "curated",
        "quiet-evidence",
        "single-observation",
        "care-checks",
      ]),
    );
    expect(topicSql.parameters).not.toContain("not safe");
    expect(statsSql.sql).toContain('max("journal_entries"."published_at")');
    expect(statsSql.sql).toContain('"journal_entries"."id" in');
    expect(kindsSql.sql).toContain('"plant_objects"."object_kind" as "kind"');

    const topics = serializePublicKnowledgeTopics(
      [
        { slug: "quiet-evidence", label: "Тиха тема" },
        { slug: "single-observation", label: "Один запис" },
        { slug: "care-checks", label: "Регулярні спостереження" },
      ],
      [
        {
          slug: "single-observation",
          entryCount: 1,
          aggregateBodyLength: 180,
          latestPublishedAt: "2026-07-08T10:00:00.000Z",
        },
        {
          slug: "care-checks",
          entryCount: 11,
          aggregateBodyLength: 2400,
          latestPublishedAt: "2026-07-10T10:00:00.000Z",
        },
      ],
      [
        { slug: "single-observation", kind: "plant", count: 1 },
        { slug: "care-checks", kind: "plant", count: 4 },
        { slug: "care-checks", kind: "animal", count: 4 },
        { slug: "care-checks", kind: "animal", count: 3 },
      ],
    );

    expect(topics.map((topic) => topic.entryCount)).toEqual([0, 1, 11]);
    expect(topics[0]?.indexState.isIndexable).toBe(false);
    expect(topics[0]?.indexState.reasons).toEqual(["empty_listing"]);
    expect(topics[1]?.indexState.isIndexable).toBe(true);
    expect(topics[2]).toMatchObject({
      objectKinds: ["plant", "animal"],
      indexState: {
        isIndexable: true,
        sitemapEligible: true,
        reasons: [],
      },
    });
  });
});
