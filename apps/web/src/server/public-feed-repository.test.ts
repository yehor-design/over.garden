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
  buildPublicFeedEntriesQuery,
  buildPublicFeedMediaQuery,
  buildPublicFeedTopicsForEntriesQuery,
  buildTrustedPublicFeedTopicsQuery,
  decodePublicFeedCursor,
  encodePublicFeedCursor,
  normalizePublicFeedRequest,
  serializePublicFeedPage,
} from "./public-feed-repository";

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

const firstRow = {
  entryId: "00000000-0000-4000-8000-000000000001",
  title: "Ранкове спостереження",
  body: "Після поливу листя тримає пружність і нових плям не видно.",
  entryDate: "2026-07-10",
  publishedAt: "2026-07-10T12:00:00.000Z",
  publicSlug: "morning-check",
  objectId: "00000000-0000-4000-8000-000000000101",
  objectDisplayName: "Томат Черрі",
  objectKind: "plant",
  objectLocationVisibility: "region",
  objectCoarseRegionCode: "UA-30",
  spaceLocationVisibility: "region",
  spaceCoarseRegionCode: "UA-30",
  authorHandle: "green_thumb",
  authorDisplayName: "Олена",
  authorAvatarUrl: null,
};

const secondRow = {
  ...firstRow,
  entryId: "00000000-0000-4000-8000-000000000002",
  title: "Стан після тижня",
  body: "Бджолина сім'я працює спокійно, рамки сухі, корму достатньо.",
  publishedAt: "2026-07-09T12:00:00.000Z",
  publicSlug: "week-check",
  objectId: "00000000-0000-4000-8000-000000000102",
  objectDisplayName: "Сім'я Карніка",
  objectKind: "animal",
  objectLocationVisibility: "hidden",
  objectCoarseRegionCode: "BG-23",
  spaceLocationVisibility: "region",
  spaceCoarseRegionCode: "BG-23",
  authorHandle: "apiary_notes",
  authorDisplayName: "Микола",
};

const thirdRow = {
  ...firstRow,
  entryId: "00000000-0000-4000-8000-000000000003",
  title: "Наступна сторінка",
  publishedAt: "2026-07-08T12:00:00.000Z",
  publicSlug: "next-page",
};

describe("public feed repository", () => {
  it("selects only canonical active public journal rows in stable recency order", () => {
    const compiled = buildPublicFeedEntriesQuery(testDb, {
      cursor: null,
      kind: "all",
      pageSize: 8,
      topic: null,
    }).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain(
      'left join "user_handle_registry" on "user_handle_registry"."user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain(
      '"user_handle_registry"."lifecycle_state" = $1',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."user_id" = "user_handle_registry"."user_id"',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."normalized_handle" = "user_handle_registry"."normalized_handle"',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."profile_visibility" = $2',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."profile_lifecycle_state" = $3',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."removed_at" is null',
    );
    expect(compiled.sql).toContain('"journal_entries"."visibility" = $4');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $5');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."published_at" is not null',
    );
    expect(compiled.sql).toContain(
      'order by "journal_entries"."published_at" desc, "journal_entries"."id" asc',
    );
    expect(compiled.sql).toMatch(/limit \$\d+/);
    expect(compiled.parameters).toEqual([
      "current",
      "public",
      "active",
      "public",
      "active",
      "object",
      9,
    ]);
    expect(compiled.sql).not.toMatch(
      /email|quarantine_key|client_mutation_id|first_publication|moderation|latitude|longitude|coordinates/i,
    );
  });

  it("applies explicit living-object and trusted-topic filters without popularity ranking", () => {
    const animal = buildPublicFeedEntriesQuery(testDb, {
      cursor: null,
      kind: "animal",
      pageSize: 8,
      topic: null,
    }).compile();
    const topic = buildPublicFeedEntriesQuery(testDb, {
      cursor: null,
      kind: "all",
      pageSize: 8,
      topic: "winter-care",
    }).compile();

    expect(animal.sql).toMatch(/"plant_objects"\."object_kind" = \$\d+/);
    expect(animal.parameters).toContain("animal");
    expect(topic.sql).toContain('from "journal_entry_topic_signals"');
    expect(topic.sql).toContain('inner join "journal_topics"');
    expect(topic.sql).toContain('"journal_topics"."trust_state" =');
    expect(topic.sql).toContain(
      '"journal_entry_topic_signals"."review_state" =',
    );
    expect(topic.sql).toContain(
      '"journal_entry_topic_signals"."public_membership_state" =',
    );
    expect(topic.parameters).toContain("winter-care");
    expect(topic.sql).not.toMatch(/like_count|comment_count|score|rank\(/i);
  });

  it("uses an opaque validated cursor and ignores malformed input", () => {
    const cursor = {
      id: secondRow.entryId,
      publishedAt: secondRow.publishedAt,
      version: 1 as const,
    };
    const encoded = encodePublicFeedCursor(cursor);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePublicFeedCursor(encoded)).toEqual(cursor);
    expect(decodePublicFeedCursor("not-a-valid-cursor")).toBeNull();

    const normalized = normalizePublicFeedRequest({
      cursor: [encoded, "ignored"],
      kind: "not-a-kind",
      topic: " WINTER-CARE ",
    });

    expect(normalized).toEqual({
      cursor,
      kind: "all",
      topic: "winter-care",
    });

    const compiled = buildPublicFeedEntriesQuery(testDb, {
      ...normalized,
      pageSize: 8,
    }).compile();

    expect(compiled.sql).toContain('"journal_entries"."published_at" <');
    expect(compiled.sql).toContain('"journal_entries"."id" >');
    expect(compiled.parameters).toContainEqual(new Date(secondRow.publishedAt));
    expect(compiled.parameters).toContain(secondRow.entryId);
  });

  it("bounds derivative-only media and accepted curated topics to the page entries", () => {
    const entryIds = [firstRow.entryId, secondRow.entryId];
    const media = buildPublicFeedMediaQuery(testDb, entryIds).compile();
    const topics = buildPublicFeedTopicsForEntriesQuery(
      testDb,
      entryIds,
    ).compile();
    const trusted = buildTrustedPublicFeedTopicsQuery(testDb, 6).compile();

    expect(media.sql).toContain('from "media_assets"');
    expect(media.sql).toContain('inner join "journal_entries"');
    expect(media.sql).toContain('"media_assets"."derivative_key" is not null');
    expect(media.sql).not.toContain('"media_assets"."status"');
    expect(media.sql).toContain("row_number() over");
    expect(media.sql).toContain('"media_rank" <=');
    expect(media.sql).not.toContain("quarantine_key");
    expect(media.sql).toContain('"media_assets"."revoked_at" is null');
    expect(media.sql).not.toMatch(
      /original_deleted_at|media_readiness_state|quality_policy_version|quality_class/,
    );
    expect(media.parameters).toEqual(
      expect.arrayContaining([
        ...entryIds,
        "public",
        "active",
        "object",
        "inline",
        3,
      ]),
    );

    for (const compiled of [topics, trusted]) {
      expect(compiled.sql).toContain('"journal_topics"."trust_state"');
      expect(compiled.sql).toContain(
        '"journal_entry_topic_signals"."review_state"',
      );
      expect(compiled.sql).toContain(
        '"journal_entry_topic_signals"."public_membership_state"',
      );
      expect(compiled.sql).toContain('"journal_entries"."visibility"');
      expect(compiled.sql).toContain('"journal_entries"."lifecycle_state"');
      expect(compiled.sql).toContain(
        '"journal_entries"."public_gone_at" is null',
      );
      expect(compiled.sql).toContain(
        '"journal_entries"."published_at" is not null',
      );
      expect(compiled.sql).toContain('"journal_entries"."entry_scope"');
    }
    expect(trusted.sql).toContain('left join "plant_objects"');
    expect(trusted.sql).toContain(
      '"plant_objects"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    expect(trusted.sql).toContain(
      'count(distinct case when "plant_objects"."id" is not null then "journal_entries"."id" end)',
    );
    expect(trusted.parameters).toContain(6);
  });

  it("serializes a minimized page with one-click paths, safe region behavior, and next cursor", () => {
    const page = serializePublicFeedPage({
      rows: [firstRow, secondRow, thirdRow],
      mediaRows: [
        {
          id: "00000000-0000-4000-8000-000000000201",
          entryId: firstRow.entryId,
          derivativeKey: "public/one.png",
          focalX: 0.5,
          focalY: 0.5,
          intrinsicWidth: 800,
          intrinsicHeight: 600,
        },
        {
          id: "00000000-0000-4000-8000-000000000202",
          entryId: firstRow.entryId,
          derivativeKey: "public/two.png",
          focalX: 0.5,
          focalY: 0.5,
          intrinsicWidth: 800,
          intrinsicHeight: 600,
        },
      ],
      topicRows: [
        {
          entryId: firstRow.entryId,
          label: "Зимовий догляд",
          slug: "winter-care",
        },
      ],
      locale: "bg",
      pageSize: 2,
      publicMediaUrl: (key) => `https://media.example/${key}`,
    });

    expect(page.entries).toHaveLength(2);
    expect(page.nextCursor).toBe(
      encodePublicFeedCursor({
        id: secondRow.entryId,
        publishedAt: secondRow.publishedAt,
        version: 1,
      }),
    );
    expect(page.entries[0]).toMatchObject({
      id: firstRow.entryId,
      publicPath: "/bg/journal/morning-check",
      object: {
        id: firstRow.objectId,
        kind: "plant",
        publicPath: `/lineage/objects/${firstRow.objectId}`,
        safeRegionCode: "UA-30",
      },
      author: {
        handle: "green_thumb",
        profilePath: "/bg/@green_thumb",
      },
      topics: [{ label: "Зимовий догляд", slug: "winter-care" }],
    });
    expect(page.entries[0].media).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000201",
        publicUrl: "https://media.example/public/one.png",
        focalX: 0.5,
        focalY: 0.5,
        intrinsicWidth: 800,
        intrinsicHeight: 600,
      },
      {
        id: "00000000-0000-4000-8000-000000000202",
        publicUrl: "https://media.example/public/two.png",
        focalX: 0.5,
        focalY: 0.5,
        intrinsicWidth: 800,
        intrinsicHeight: 600,
      },
    ]);
    expect(page.entries[1].object.safeRegionCode).toBeNull();

    const serialized = JSON.stringify(page);
    expect(serialized).not.toMatch(
      /owner|email|quarantine|derivativeKey|clientMutation|moderation|draft|coordinates|latitude|longitude|BG-23/i,
    );
  });
});
