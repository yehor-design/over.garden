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
import type {
  NotificationCandidateRow,
  NotificationEventKind,
} from "@/server/social-return-repository";

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
const scope = scopedToUser("00000000-0000-4000-8000-000000000001");
const forbiddenPrivatePattern =
  /quarantine|derivative_key|email|phone|ip_address|user_agent|coordinates|latitude|longitude|source_reference_label|question_text|comment_body|engagement_comments"\."body|client_mutation_id/i;

describe("OVE-183 social return read models", () => {
  it("projects one chronological public-only feed across profile, object, topic, and lineage follows", async () => {
    const repository = await loadRepository();
    expect(repository.buildFollowedFeedCandidatesQuery).toBeTypeOf("function");

    const compiled = repository
      .buildFollowedFeedCandidatesQuery(testDb, scope, {
        limit: 13,
        source: "all",
        objectKind: "all",
        cursor: null,
      })
      .compile();

    expect(compiled.sql).toContain('from "journal_entries" as "entries"');
    expect(compiled.sql).toContain('"entries"."visibility" =');
    expect(compiled.sql).toContain('"entries"."lifecycle_state" =');
    expect(compiled.sql).toContain('"entries"."public_gone_at" is null');
    expect(compiled.sql).toContain('from "profile_follows"');
    expect(compiled.sql).toContain('from "engagement_follows"');
    expect(compiled.sql).toContain('join "journal_entry_topic_signals"');
    expect(compiled.sql).toContain('from "lineage_node_follows"');
    expect(compiled.sql).toContain('from "profile_blocks"');
    expect(compiled.parameters).toContain(scope.userId);
    expect(compiled.sql).not.toMatch(forbiddenPrivatePattern);
  });

  it("derives comment and reply notifications without selecting comment or journal bodies", async () => {
    const repository = await loadRepository();
    expect(repository.buildNotificationCommentEventsQuery).toBeTypeOf(
      "function",
    );

    const compiled = repository
      .buildNotificationCommentEventsQuery(testDb, scope, 40)
      .compile();

    expect(compiled.sql).toContain('from "engagement_comments" as "comments"');
    expect(compiled.sql).toContain(
      'left join "engagement_comments" as "parent_comments"',
    );
    expect(compiled.sql).toContain('inner join "journal_entries" as "entries"');
    expect(compiled.sql).toContain('from "profile_blocks"');
    expect(compiled.sql).toContain('"comments"."comment_state" =');
    expect(compiled.parameters).toContain(scope.userId);
    expect(compiled.sql).not.toMatch(forbiddenPrivatePattern);
    expect(compiled.sql).not.toMatch(/"comments"\."body"|"entries"\."body"/i);
  });

  it("derives follow events with public-only actor handles and active public targets", async () => {
    const repository = await loadRepository();
    expect(repository.buildNotificationProfileFollowEventsQuery).toBeTypeOf(
      "function",
    );
    expect(repository.buildNotificationObjectFollowEventsQuery).toBeTypeOf(
      "function",
    );
    expect(repository.buildNotificationLineageFollowEventsQuery).toBeTypeOf(
      "function",
    );

    const profile = repository
      .buildNotificationProfileFollowEventsQuery(testDb, scope, 40)
      .compile();
    const object = repository
      .buildNotificationObjectFollowEventsQuery(testDb, scope, 40)
      .compile();
    const lineage = repository
      .buildNotificationLineageFollowEventsQuery(testDb, scope, 40)
      .compile();

    expect(profile.sql).toContain('from "profile_follows" as "follows"');
    expect(profile.sql).toContain('"follows"."target_user_id" =');
    expect(profile.sql).toContain(
      'left join "user_public_profiles" as "profiles"',
    );
    expect(profile.sql).toContain('"profiles"."profile_visibility" =');
    expect(profile.sql).toContain('from "profile_blocks"');
    expect(object.sql).toContain('from "engagement_follows" as "follows"');
    expect(object.sql).toContain('"follows"."target_kind" =');
    expect(object.sql).toContain('inner join "plant_objects" as "objects"');
    expect(object.sql).toContain('inner join "journal_entries" as "entries"');
    expect(object.sql).toContain('"profiles"."profile_visibility" =');
    expect(object.sql).toContain('from "profile_blocks"');
    expect(lineage.sql).toContain('from "lineage_node_follows" as "follows"');
    expect(lineage.sql).toContain('"profiles"."profile_visibility" =');
    expect(lineage.sql).toContain('from "profile_blocks"');
    expect(profile.sql).not.toMatch(forbiddenPrivatePattern);
    expect(object.sql).not.toMatch(forbiddenPrivatePattern);
    expect(lineage.sql).not.toMatch(forbiddenPrivatePattern);
  });

  it("persists idempotent actor-scoped receipts and explicit preferences only", async () => {
    const repository = await loadRepository();
    expect(repository.buildUpsertNotificationReceiptQuery).toBeTypeOf(
      "function",
    );
    expect(repository.buildUpsertNotificationPreferencesQuery).toBeTypeOf(
      "function",
    );

    const receipt = repository
      .buildUpsertNotificationReceiptQuery(testDb, scope, {
        eventKey: "a".repeat(32),
        state: "read",
        now: new Date("2026-07-13T10:00:00.000Z"),
      })
      .compile();
    const preferences = repository
      .buildUpsertNotificationPreferencesQuery(testDb, scope, {
        comments: true,
        replies: false,
        follows: true,
        mentions: true,
        claims: false,
        system: true,
        now: new Date("2026-07-13T10:00:00.000Z"),
      })
      .compile();

    expect(receipt.sql).toContain('insert into "notification_receipts"');
    expect(receipt.sql).toContain(
      'on conflict ("owner_user_id", "event_key") do update',
    );
    expect(receipt.parameters).toContain(scope.userId);
    expect(preferences.sql).toContain('insert into "notification_preferences"');
    expect(preferences.sql).toContain(
      'on conflict ("owner_user_id") do update',
    );
    expect(preferences.parameters).toContain(scope.userId);
    expect(receipt.sql).not.toMatch(forbiddenPrivatePattern);
    expect(preferences.sql).not.toMatch(forbiddenPrivatePattern);
  });

  it("serializes allowlisted summaries, opaque keys, pagination, and grouping", async () => {
    const repository = await loadRepository();
    expect(repository.serializeNotificationPage).toBeTypeOf("function");
    expect(repository.groupNotificationEvents).toBeTypeOf("function");

    const rawCommentId = "00000000-0000-4000-8000-000000000201";
    const page = repository.serializeNotificationPage(
      [
        notificationRow(rawCommentId, "comment", "2026-07-13T11:00:00Z"),
        notificationRow(
          "00000000-0000-4000-8000-000000000202",
          "comment",
          "2026-07-13T10:00:00Z",
        ),
      ],
      new Map([
        [repository.notificationEventKey("comment", rawCommentId), "read"],
      ]),
      { pageSize: 1, cursor: null, filter: "all", unreadOnly: false },
    );

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeTruthy();
    expect(page.items[0]).toMatchObject({
      kind: "comment",
      read: true,
      summaryKey: "comment_on_journal",
      href: "/journal/public-entry",
    });
    expect(JSON.stringify(page)).not.toContain(rawCommentId);
    expect(JSON.stringify(page)).not.toContain("private comment body");

    const grouped = repository.groupNotificationEvents([
      ...page.items,
      { ...page.items[0], key: "b".repeat(32), read: false },
    ]);
    expect(grouped).toMatchObject([
      {
        count: 2,
        read: false,
        eventKeys: [page.items[0].key, "b".repeat(32)],
      },
    ]);
  });
});

async function loadRepository() {
  return import("./social-return-repository");
}

function notificationRow(
  id: string,
  kind: NotificationEventKind,
  createdAt: string,
): NotificationCandidateRow {
  return {
    sourceId: id,
    kind,
    createdAt,
    actorHandle: "demo_reader",
    targetRef: "public-entry",
    targetLabel: null,
    href: "/journal/public-entry",
    summaryKey: "comment_on_journal",
    groupRef: "journal:public-entry",
  };
}
