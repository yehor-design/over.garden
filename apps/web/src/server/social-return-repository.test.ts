import { postgresRejection } from "@test/postgres-rejection";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
  type QueryResult,
} from "kysely";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import { buildPublicFeedMediaQuery } from "@/server/public-feed-repository";
import { scopedToUser } from "@/server/request-scope";
import type {
  NotificationCandidateRow,
  NotificationEvent,
  NotificationEventKind,
  NotificationObjectSubject,
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

function expectCurrentEligibleIdentity(
  compiled: { sql: string; parameters: readonly unknown[] },
  handlesAlias: string,
  profilesAlias: string,
) {
  expect(compiled.sql).toContain(
    `join "user_handle_registry" as "${handlesAlias}"`,
  );
  expect(compiled.sql).toContain(`"${handlesAlias}"."lifecycle_state" =`);
  expect(compiled.sql).toContain(
    `"${profilesAlias}"."user_id" = "${handlesAlias}"."user_id"`,
  );
  expect(compiled.sql).toContain(
    `"${profilesAlias}"."normalized_handle" = "${handlesAlias}"."normalized_handle"`,
  );
  expect(compiled.sql).toContain(
    `"${profilesAlias}"."profile_lifecycle_state" =`,
  );
  expect(compiled.sql).toContain(`"${profilesAlias}"."removed_at" is null`);
  expect(compiled.parameters).toEqual(
    expect.arrayContaining(["current", "active"]),
  );
}

function expectMutualBlockExclusion(sql: string, actorRef: string) {
  expect(sql).toContain('from "profile_blocks"');
  expect(sql).toContain(`profile_blocks.blocked_user_id = ${actorRef}`);
  expect(sql).toContain(`profile_blocks.blocker_user_id = ${actorRef}`);
}

describe("OVE-183 social return read models", () => {
  it("keeps followed journal evidence in the selected locale", async () => {
    const repository = await loadRepository();
    const page = repository.serializeFollowedFeedPage(
      [
        {
          entryId: "00000000-0000-4000-8000-000000000201",
          publicSlug: "late-summer-check",
          entryNumber: 14,
          title: "Late summer check",
          body: "The leaves stayed firm after a hot day.",
          entryDate: "2026-07-30",
          publishedAt: "2026-07-30T08:00:00.000Z",
          ownerHandle: "green_thumb",
          addressHandle: "green_thumb",
          ownerDisplayName: "Green Thumb",
          objectId: "00000000-0000-4000-8000-000000000202",
          objectPublicSlug: "balcony-tomato",
          objectDisplayName: "Balcony tomato",
          objectKind: "plant",
          varietyText: "Red Cherry",
          catalogKind: "plant_variety",
          followedByProfile: true,
          followedByObject: false,
          followedByTopic: false,
          followedByLineage: false,
        },
      ],
      12,
      "ru",
    );

    expect(page.items[0]).toMatchObject({
      // Under the author (ADR-0029 D9), not the legacy address that 308s.
      href: "/@green_thumb/post/14",
      author: { href: "/ru/@green_thumb" },
      object: { href: "/@green_thumb/objects/balcony-tomato" },
    });
  });

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
    expectCurrentEligibleIdentity(compiled, "owner_handles", "profiles");
    expectMutualBlockExclusion(compiled.sql, '"entries"."owner_user_id"');
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
    expectCurrentEligibleIdentity(compiled, "actor_handles", "profiles");
    expectMutualBlockExclusion(compiled.sql, '"comments"."author_user_id"');
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
    expectCurrentEligibleIdentity(profile, "actor_handles", "profiles");
    expectCurrentEligibleIdentity(profile, "target_handles", "target_profiles");
    expectMutualBlockExclusion(profile.sql, '"follows"."follower_user_id"');
    expect(object.sql).toContain('from "engagement_follows" as "follows"');
    expect(object.sql).toContain('"follows"."target_kind" =');
    expect(object.sql).toContain('inner join "plant_objects" as "objects"');
    expect(object.sql).toContain('inner join "journal_entries" as "entries"');
    expectCurrentEligibleIdentity(object, "actor_handles", "profiles");
    expectMutualBlockExclusion(object.sql, '"follows"."follower_user_id"');
    expect(lineage.sql).toContain('from "lineage_node_follows" as "follows"');
    expectCurrentEligibleIdentity(lineage, "actor_handles", "profiles");
    expectMutualBlockExclusion(lineage.sql, '"follows"."follower_user_id"');
    expect(profile.sql).not.toMatch(forbiddenPrivatePattern);
    expect(object.sql).not.toMatch(forbiddenPrivatePattern);
    expect(lineage.sql).not.toMatch(forbiddenPrivatePattern);
  });

  it("derives lineage interaction events through current eligible actor identities and mutual blocks", async () => {
    const repository = await loadRepository();
    const mention = repository
      .buildNotificationMentionEventsQuery(testDb, scope, 40)
      .compile();
    const claim = repository
      .buildNotificationClaimDecisionEventsQuery(testDb, scope, 40)
      .compile();
    const question = repository
      .buildNotificationQuestionEventsQuery(testDb, scope, 40)
      .compile();

    for (const compiled of [mention, claim, question]) {
      expectCurrentEligibleIdentity(compiled, "actor_handles", "profiles");
      expect(compiled.sql).not.toMatch(forbiddenPrivatePattern);
    }
    expectMutualBlockExclusion(mention.sql, '"edges"."owner_user_id"');
    expectMutualBlockExclusion(claim.sql, '"edges"."source_owner_user_id"');
    expectMutualBlockExclusion(question.sql, '"questions"."asker_user_id"');
  });

  it("persists idempotent actor-scoped receipts and explicit preferences only", async () => {
    const repository = await loadRepository();
    expect(repository.buildUpsertNotificationReceiptsQuery).toBeTypeOf(
      "function",
    );
    expect(repository.buildUpsertNotificationPreferencesQuery).toBeTypeOf(
      "function",
    );
    // One statement per row since `OVE-501`: the per-event writers that could
    // leave a grouped row half read are gone.
    expect(repository).not.toHaveProperty(
      "buildUpsertNotificationReceiptQuery",
    );
    expect(repository).not.toHaveProperty("setNotificationReceipt");
    expect(repository).not.toHaveProperty("markNotificationEventsRead");

    const now = new Date("2026-07-13T10:00:00.000Z");
    const receipts = repository
      .buildUpsertNotificationReceiptsQuery(testDb, scope, {
        // A key is stored as the page renders it: lowercase hex.
        eventKeys: ["a".repeat(32), "B".repeat(32)],
        state: "read",
        now,
      })
      .compile();
    const unread = repository
      .buildUpsertNotificationReceiptsQuery(testDb, scope, {
        eventKeys: ["a".repeat(32), "b".repeat(32)],
        state: "unread",
        now,
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
        now,
      })
      .compile();

    expect(receipts.sql).toContain('insert into "notification_receipts"');
    // Every key of the row in one multi-row statement.
    expect(receipts.sql).toContain(
      '("owner_user_id", "event_key", "receipt_state", "read_at", "created_at", "updated_at") values ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12)',
    );
    expect(receipts.sql).toContain(
      'on conflict ("owner_user_id", "event_key") do update set',
    );
    expect(receipts.parameters.slice(0, 12)).toEqual([
      scope.userId,
      "a".repeat(32),
      "read",
      now,
      now,
      now,
      scope.userId,
      "b".repeat(32),
      "read",
      now,
      now,
      now,
    ]);
    // Unread clears the read time, on insert and on conflict alike.
    expect(unread.parameters[3]).toBeNull();
    expect(unread.parameters[9]).toBeNull();
    expect(unread.parameters.slice(12)).toEqual(["unread", null, now]);
    expect(() =>
      repository.buildUpsertNotificationReceiptsQuery(testDb, scope, {
        eventKeys: ["a".repeat(32), "not-an-event-key"],
        state: "read",
      }),
    ).toThrow("Notification event is not available.");
    expect(() =>
      repository.buildUpsertNotificationReceiptsQuery(testDb, scope, {
        eventKeys: ["a".repeat(32)],
        state: "archived" as never,
      }),
    ).toThrow("Notification receipt state is not available.");
    expect(preferences.sql).toContain('insert into "notification_preferences"');
    expect(preferences.sql).toContain(
      'on conflict ("owner_user_id") do update',
    );
    expect(preferences.parameters).toContain(scope.userId);
    expect(receipts.sql).not.toMatch(forbiddenPrivatePattern);
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

describe("OVE-501 activity that names the exact next action", () => {
  it("names the entry a comment is on, and its object only when the entry is the reader's", async () => {
    const repository = await loadRepository();
    const compiled = repository
      .buildNotificationCommentEventsQuery(testDb, scope, 40)
      .compile();
    const statement = foldWhitespace(compiled.sql);

    expect(statement).toContain('"entries"."title" as "entryTitle"');
    // A reply can sit under somebody else's entry, whose object is not the
    // reader's to name.
    expect(statement).toMatch(
      /case when "entries"\."owner_user_id" = \$\d+::uuid then "entries"\."plant_object_id" end as "ownObjectId"/u,
    );
    expect(boundValue(compiled, 'case when "entries"."owner_user_id" = ')).toBe(
      scope.userId,
    );
    expect(statement).not.toMatch(/"entries"\."body"|"comments"\."body"/u);
    expect(statement).not.toMatch(forbiddenPrivatePattern);
  });

  it("dates a reminder two weeks after the newest entry, names its object, and lists the most recently due first", async () => {
    const repository = await loadRepository();
    const compiled = repository
      .buildStaleJournalPromptEventsQuery(
        testDb,
        scope,
        new Date("2026-07-30T09:00:00.000Z"),
        40,
      )
      .compile();
    const statement = foldWhitespace(compiled.sql);

    expect(statement).toContain('"objects"."display_name" as "targetLabel"');
    // When the reminder began to hold, or when an object with no entry was
    // added — never its `updated_at`, which a rename moved to today.
    const createdAt =
      /coalesce\( \(\( select max\(last_entries\.entry_date\) from "journal_entries" as last_entries where last_entries\.owner_user_id = \$(\d+) and last_entries\.plant_object_id = "objects"\."id" and last_entries\.lifecycle_state = 'active' \) \+ \$(\d+)::int\)::timestamptz, "objects"\."created_at" \) as "createdAt"/u.exec(
        statement,
      );
    expect(createdAt).not.toBeNull();
    expect(compiled.parameters[Number(createdAt![1]) - 1]).toBe(scope.userId);
    expect(compiled.parameters[Number(createdAt![2]) - 1]).toBe(14);
    expect(statement).not.toContain("updated_at");
    expect(statement).toContain(
      'order by "createdAt" desc, "objects"."id" asc',
    );
    // Only the reader's own objects with nothing written in fourteen days.
    expect(boundValue(compiled, '"objects"."owner_user_id" = ')).toBe(
      scope.userId,
    );
    expect(boundValue(compiled, "and recent_entries.entry_date >= ")).toBe(
      "2026-07-16",
    );
    expect(statement).not.toMatch(/\bbody\b/u);
    expect(statement).not.toMatch(forbiddenPrivatePattern);
  });

  it("resolves the identity of the reader's own objects, as the garden list does, and never an entry's words", async () => {
    const repository = await loadRepository();
    const objectIds = [
      "00000000-0000-4000-8000-000000000301",
      "00000000-0000-4000-8000-000000000302",
    ];
    const compiled = repository
      .buildNotificationObjectSubjectsQuery(testDb, scope, objectIds)
      .compile();
    const statement = foldWhitespace(compiled.sql);

    expect(statement).toContain('from "plant_objects" as "objects"');
    // The space is the object owner's own.
    expect(statement).toContain(
      'inner join "spaces" on "spaces"."id" = "objects"."space_id" and "spaces"."owner_user_id" = "objects"."owner_user_id"',
    );
    // Only an active, public catalogue identity names the organism.
    expect(statement).toMatch(
      /left join "catalog_items" as "catalog" on "catalog"\."id" = "objects"\."catalog_item_id" and "catalog"\."identity_state" = \$\d+ and "catalog"\."created_by_user_id" is null/u,
    );
    expect(boundValue(compiled, '"catalog"."identity_state" = ')).toBe(
      "active",
    );
    expect(statement).toContain('"catalog"."canonical_name" as "species"');
    expect(statement).toContain('"objects"."variety_text" as "variety"');
    expect(statement).toContain(
      `to_char("objects"."created_at" at time zone 'UTC', 'YYYY-MM-DD') as "addedOn"`,
    );
    expect(statement).toContain(
      `to_char("objects"."created_at" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') as "addedAt"`,
    );
    const lastEntry =
      /\( select to_char\(max\(last_entries\.entry_date\), 'YYYY-MM-DD'\) from "journal_entries" as last_entries where last_entries\.owner_user_id = \$(\d+) and last_entries\.plant_object_id = "objects"\."id" and last_entries\.lifecycle_state = 'active' \) as "lastEntryDate"/u.exec(
        statement,
      );
    expect(lastEntry).not.toBeNull();
    expect(compiled.parameters[Number(lastEntry![1]) - 1]).toBe(scope.userId);
    // Somebody else's object is never resolved, whatever id a row carried.
    expect(boundValue(compiled, 'where "objects"."owner_user_id" = ')).toBe(
      scope.userId,
    );
    expect(statement).toMatch(/and "objects"\."id" in \(\$\d+, \$\d+\)$/u);
    expect(compiled.parameters.slice(-2)).toEqual(objectIds);
    expect(statement).not.toMatch(/\bbody\b|"title"/u);
    expect(statement).not.toMatch(forbiddenPrivatePattern);
  });

  it("attaches the reader's object and the category to every event", async () => {
    const repository = await loadRepository();
    const reminderObject = subject("00000000-0000-4000-8000-000000000301");
    const rows: NotificationCandidateRow[] = [
      {
        sourceId: reminderObject.id,
        kind: "system",
        createdAt: "2026-07-13T12:00:00Z",
        actorHandle: null,
        targetRef: reminderObject.id,
        targetLabel: "  Томат  ",
        href: `/garden/objects/${reminderObject.id}`,
        summaryKey: "stale_journal_prompt",
        groupRef: `stale:${reminderObject.id}`,
        actionKind: "continue_journal",
        objectRef: reminderObject.id,
      },
      {
        ...notificationRow(
          "00000000-0000-4000-8000-000000000202",
          "comment",
          "2026-07-13T11:00:00Z",
        ),
        targetLabel: "Полив",
        // The entry's object, but no identity was resolved for it.
        objectRef: "00000000-0000-4000-8000-000000000399",
      },
      {
        ...notificationRow(
          "00000000-0000-4000-8000-000000000203",
          "profile_follow",
          "2026-07-13T10:00:00Z",
        ),
        summaryKey: "profile_followed",
        groupRef: "profile-follows",
      },
    ];
    const subjects = new Map([[reminderObject.id, reminderObject]]);

    const page = repository.serializeNotificationPage(
      rows,
      new Map(),
      {},
      subjects,
    );

    expect(page.items).toMatchObject([
      {
        kind: "system",
        category: "reminder",
        targetLabel: "Томат",
        object: reminderObject,
      },
      {
        kind: "comment",
        category: "social",
        targetLabel: "Полив",
        object: null,
      },
      { kind: "profile_follow", category: "social", object: null },
    ]);
    expect(page.unreadCount).toBe(3);

    // The reminders' filter holds the reminders, and the count in the header
    // stays the count of everything unread.
    const reminders = repository.serializeNotificationPage(
      rows,
      new Map(),
      { filter: "reminders" },
      subjects,
    );
    expect(reminders.items.map((item) => item.category)).toEqual(["reminder"]);
    expect(reminders.unreadCount).toBe(3);

    // A dismissed reminder is gone from the rows and from the count.
    const dismissed = repository.serializeNotificationPage(
      rows,
      new Map([
        [
          repository.notificationEventKey("system", reminderObject.id),
          "dismissed",
        ],
      ]),
      {},
      subjects,
    );
    expect(dismissed.items.map((item) => item.kind)).toEqual([
      "comment",
      "profile_follow",
    ]);
    expect(dismissed.unreadCount).toBe(2);
  });

  it("groups rows that say the same about the same target, keeping everyone who acted and the unread part", async () => {
    const repository = await loadRepository();
    const events = activityEvents();

    const grouped = repository.groupNotificationEvents(events);

    expect(grouped).toHaveLength(3);
    expect(grouped[0]).toMatchObject({
      key: "1".repeat(32),
      createdAt: "2026-07-13T12:00:00.000Z",
      actorMention: "@anna",
      count: 3,
      unreadCount: 2,
      read: false,
      eventKeys: ["1".repeat(32), "2".repeat(32), "3".repeat(32)],
      // Newest first, each once.
      actors: ["@anna", "@bohdan"],
    });
    expect(grouped[1]).toMatchObject({
      eventKeys: ["4".repeat(32)],
      count: 1,
      unreadCount: 1,
      actors: ["@vira"],
    });
    // A reminder is about one object: it never shares a row, and nobody acted.
    expect(grouped[2]).toMatchObject({
      category: "reminder",
      eventKeys: ["5".repeat(32)],
      count: 1,
      unreadCount: 0,
      read: true,
      actors: [],
    });
    // Grouping copies; the page's events are left as they were.
    expect(events[0]).not.toHaveProperty("count");
  });

  it("keeps one row per event in the individual view, in the same shape", async () => {
    const repository = await loadRepository();

    const individual = repository.groupNotificationEvents(
      activityEvents(),
      false,
    );

    expect(individual.map((row) => row.eventKeys)).toEqual([
      ["1".repeat(32)],
      ["2".repeat(32)],
      ["3".repeat(32)],
      ["4".repeat(32)],
      ["5".repeat(32)],
    ]);
    expect(individual.map((row) => row.count)).toEqual([1, 1, 1, 1, 1]);
    expect(individual.map((row) => row.unreadCount)).toEqual([1, 0, 1, 1, 0]);
    expect(individual.map((row) => row.actors)).toEqual([
      ["@anna"],
      ["@bohdan"],
      ["@anna"],
      ["@vira"],
      [],
    ]);
  });

  it("lands an old `?filter=system` link on the reminders", async () => {
    const { normalizeNotificationFilter } = await loadRepository();

    expect(normalizeNotificationFilter("system")).toBe("reminders");
    for (const filter of [
      "comments",
      "follows",
      "mentions",
      "claims",
      "reminders",
    ] as const) {
      expect(normalizeNotificationFilter(filter)).toBe(filter);
    }
    for (const value of ["", "replies", "SYSTEM", "all", null, undefined]) {
      expect(normalizeNotificationFilter(value)).toBe("all");
    }
  });

  it("calls the journaling reminder a reminder and everything another gardener did social", async () => {
    const { notificationCategory } = await loadRepository();
    const social: NotificationEventKind[] = [
      "comment",
      "reply",
      "profile_follow",
      "object_follow",
      "lineage_follow",
      "mention",
      "claim",
      "question",
    ];

    expect(notificationCategory("system")).toBe("reminder");
    for (const kind of social) {
      expect(notificationCategory(kind), kind).toBe("social");
    }
  });

  it("reads the preferences with the eight sources, then the receipts with the objects, and counts what the page shows", async () => {
    const repository = await loadRepository();
    const commentId = "00000000-0000-4000-8000-000000000211";
    const hiveId = "00000000-0000-4000-8000-000000000301";
    const tomatoId = "00000000-0000-4000-8000-000000000302";
    const answers: Record<string, readonly unknown[]> = {
      comments: [
        {
          sourceId: commentId,
          parentCommentId: null,
          createdAt: "2026-07-13T12:00:00.000Z",
          actorHandle: "anna",
          targetRef: "00000000-0000-4000-8000-000000000201",
          entryPublicSlug: "poliv",
          entryNumber: 3,
          addressHandle: "olena",
          entryTitle: "Полив",
          ownObjectId: tomatoId,
        },
      ],
      reminders: [
        {
          sourceId: hiveId,
          createdAt: "2026-07-10T00:00:00.000Z",
          targetRef: hiveId,
          targetLabel: "Кошер",
        },
      ],
      receipts: [
        {
          eventKey: repository.notificationEventKey("comment", commentId),
          state: "read",
        },
      ],
      subjects: [
        {
          id: hiveId,
          name: "Кошер",
          objectKind: "animal",
          spaceName: "Пасіка",
          species: "Apis mellifera",
          variety: "  ",
          addedOn: "2026-03-01",
          addedAt: "2026-03-01T08:15Z",
          lastEntryDate: null,
        },
        {
          id: tomatoId,
          name: "Томат",
          objectKind: "plant",
          spaceName: "Балкон",
          species: null,
          variety: " Черрі ",
          addedOn: "2026-04-01",
          addedAt: "2026-04-01T09:00Z",
          lastEntryDate: "2026-06-26",
        },
      ],
    };
    const activity = activityDb(answers);

    const page = await repository.listNotificationCenterPage(
      scope,
      "uk",
      {},
      activity.database,
    );

    expect(page.items).toMatchObject([
      {
        kind: "comment",
        category: "social",
        targetLabel: "Полив",
        href: "/@olena/post/3",
        read: true,
        object: {
          id: tomatoId,
          name: "Томат",
          objectKind: "plant",
          spaceName: "Балкон",
          species: null,
          variety: "Черрі",
          addedOn: "2026-04-01",
          addedAt: "2026-04-01T09:00Z",
          lastEntryDate: "2026-06-26",
        },
      },
      {
        kind: "system",
        category: "reminder",
        targetLabel: "Кошер",
        href: `/garden/objects/${hiveId}`,
        read: false,
        object: { id: hiveId, objectKind: "animal", variety: null },
      },
    ]);
    expect(page.unreadCount).toBe(1);
    // Two round trips: the nine reads in flight together, then these two.
    expect(activity.rounds()).toEqual([
      ACTIVITY_SOURCES,
      ["receipts", "subjects"],
    ]);
    // Only the objects the rows name are resolved.
    expect(activity.parametersOf("subjects")).toEqual(
      expect.arrayContaining([hiveId, tomatoId]),
    );

    // The garden's rail counts the same events against the same receipts,
    // and resolves no object to do it.
    const rail = activityDb(answers);
    await expect(
      repository.countUnreadNotifications(scope, rail.database),
    ).resolves.toBe(page.unreadCount);
    expect(rail.rounds()).toEqual([ACTIVITY_SOURCES, ["receipts"]]);
  });

  it("writes nothing, and opens no transaction, for a row with no keys", async () => {
    const { updateNotificationReceipts } = await loadRepository();
    const recorded = recordingDb();

    await expect(
      updateNotificationReceipts(
        scope,
        { eventKeys: [], state: "read" },
        recorded.database,
      ),
    ).resolves.toBe(0);
    expect(recorded.events).toEqual([]);
  });

  it("writes one row's receipts as one statement in one transaction, under a statement timeout", async () => {
    const { updateNotificationReceipts } = await loadRepository();
    const recorded = recordingDb();
    const now = new Date("2026-07-13T10:00:00.000Z");

    const written = await updateNotificationReceipts(
      scope,
      {
        // The same key twice, once as the address spelled it.
        eventKeys: ["A".repeat(32), "b".repeat(32), "a".repeat(32)],
        state: "dismissed",
        now,
      },
      recorded.database,
    );

    expect(written).toBe(2);
    expect(recorded.events).toHaveLength(4);
    expect(recorded.events[0]).toBe("begin");
    expect(recorded.events[1]).toBe("set local statement_timeout = '3s'");
    expect(recorded.events[2]).toMatch(
      /^insert into "notification_receipts" \([^)]*\) values \([^)]*\), \([^)]*\) on conflict \("owner_user_id", "event_key"\) do update set/u,
    );
    expect(recorded.events[3]).toBe("commit");
    expect(recorded.statements[1]?.parameters.slice(0, 12)).toEqual([
      scope.userId,
      "a".repeat(32),
      "dismissed",
      null,
      now,
      now,
      scope.userId,
      "b".repeat(32),
      "dismissed",
      null,
      now,
      now,
    ]);
  });

  it("bounds one write at sixty events", async () => {
    const { updateNotificationReceipts } = await loadRepository();
    const recorded = recordingDb();
    const eventKeys = Array.from({ length: 75 }, (_, index) =>
      index.toString(16).padStart(32, "0"),
    );

    await expect(
      updateNotificationReceipts(
        scope,
        { eventKeys, state: "read" },
        recorded.database,
      ),
    ).resolves.toBe(60);
    // Six values per row, and the three the conflict sets.
    expect(recorded.statements[1]?.parameters).toHaveLength(60 * 6 + 3);
    expect(recorded.statements[1]?.parameters).toContain(eventKeys[59]);
    expect(recorded.statements[1]?.parameters).not.toContain(eventKeys[60]);
  });

  it("rolls the whole row back when its write fails, so a group is never half read", async () => {
    const { updateNotificationReceipts } = await loadRepository();
    const recorded = recordingDb({
      refuse: /^insert into "notification_receipts"/u,
    });

    await expect(
      updateNotificationReceipts(
        scope,
        { eventKeys: ["a".repeat(32), "b".repeat(32)], state: "read" },
        recorded.database,
      ),
    ).rejects.toMatchObject({ code: "57014" });
    expect(recorded.events.at(0)).toBe("begin");
    expect(recorded.events.at(-1)).toBe("rollback");
    expect(recorded.events).not.toContain("commit");
  });

  it("refuses the whole row when one key is malformed, before a transaction opens", async () => {
    const { updateNotificationReceipts } = await loadRepository();
    const recorded = recordingDb();

    await expect(
      updateNotificationReceipts(
        scope,
        { eventKeys: ["a".repeat(32), "not-an-event-key"], state: "read" },
        recorded.database,
      ),
    ).rejects.toThrow("Notification event is not available.");
    expect(recorded.events).toEqual([]);
  });
});

describe("OVE-502 saved entries drawn as the feed draws them", () => {
  const SAVED = "00000000-0000-4000-8000-000000000201";
  const WITHDRAWN = "00000000-0000-4000-8000-000000000203";
  const savedRow = {
    entryId: SAVED,
    publicSlug: "late-summer-check",
    entryNumber: 14,
    title: "Late summer check",
    body: "The leaves stayed firm after a hot day.",
    entryDate: "2026-07-30",
    publishedAt: "2026-07-30T08:00:00.000Z",
    sourceLanguage: "uk",
    ownerHandle: "green_thumb",
    addressHandle: "green_thumb",
    ownerDisplayName: "Green Thumb",
    objectId: "00000000-0000-4000-8000-000000000202",
    objectPublicSlug: "balcony-tomato",
    objectDisplayName: "Balcony tomato",
    objectKind: "plant",
    varietyText: "Red Cherry",
    catalogKind: "plant_variety",
  };

  it("reads only entries still public, by a current author, and not behind a block either way", async () => {
    const repository = await loadRepository();
    const compiled = repository
      .buildSavedEntryCardsQuery(testDb, scope, [SAVED, WITHDRAWN])
      .compile();

    expect(compiled.sql).toContain('from "journal_entries" as "entries"');
    expect(compiled.sql).toContain('"entries"."id" in (');
    expect(compiled.sql).toContain('"entries"."visibility" =');
    expect(compiled.sql).toContain('"entries"."lifecycle_state" =');
    expect(compiled.sql).toContain('"entries"."public_gone_at" is null');
    expect(compiled.sql).toContain('"entries"."public_slug" is not null');
    expect(compiled.sql).toContain('"entries"."published_at" is not null');
    expectCurrentEligibleIdentity(compiled, "owner_handles", "profiles");
    expectMutualBlockExclusion(compiled.sql, '"entries"."owner_user_id"');
    expect(compiled.parameters).toEqual(
      expect.arrayContaining([SAVED, WITHDRAWN, scope.userId, "public"]),
    );
    expect(compiled.sql).not.toMatch(forbiddenPrivatePattern);
  });

  it("asks nothing for a shelf with no saved entries", async () => {
    const repository = await loadRepository();
    const recorded = recordingDb();

    const cards = await repository.listSavedEntryCards(
      scope,
      [],
      "uk",
      recorded.database,
    );

    expect(cards.size).toBe(0);
    expect(recorded.events).toEqual([]);
  });

  it("keys each public entry's card by its id, as the feed draws it, with its first photograph", async () => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://media.over.garden");
    const repository = await loadRepository();
    const entries = foldWhitespace(
      repository
        .buildSavedEntryCardsQuery(testDb, scope, [SAVED, WITHDRAWN])
        .compile().sql,
    );
    const media = foldWhitespace(
      buildPublicFeedMediaQuery(testDb, [SAVED]).compile().sql,
    );
    // The withdrawn entry is not in the answer: the statement filtered it.
    const database = activityDb({
      [entries]: [savedRow],
      [media]: [
        {
          entryId: SAVED,
          derivativeKey: "public/entries/one-640.webp",
          caption: "  Жовті плями на нижньому листі ",
        },
        {
          entryId: SAVED,
          derivativeKey: "public/entries/two-640.webp",
          caption: "Другий кадр",
        },
      ],
    });

    try {
      const cards = await repository.listSavedEntryCards(
        scope,
        [SAVED, WITHDRAWN],
        "bg",
        database.database,
      );

      expect([...cards.keys()]).toEqual([SAVED]);
      const card = cards.get(SAVED);
      expect(card).toMatchObject({
        href: "/@green_thumb/post/14",
        title: "Late summer check",
        author: { label: "Green Thumb", href: "/bg/@green_thumb" },
        object: { href: "/@green_thumb/objects/balcony-tomato" },
        reasons: [],
        mediaUrl: "https://media.over.garden/public/entries/one-640.webp",
        // The first photograph's own description is its `alt` on the card;
        // it once always rendered `alt=""`, captioned or not (OG-UX-029).
        mediaCaption: "Жовті плями на нижньому листі",
      });
      // The same card the followed feed draws for the same entry, reasons
      // and photograph aside.
      const [feedCard] = repository.serializeFollowedFeedPage(
        [
          {
            ...savedRow,
            followedByProfile: true,
            followedByObject: false,
            followedByTopic: false,
            followedByLineage: false,
          },
        ],
        12,
        "bg",
      ).items;
      expect({
        ...card,
        reasons: [],
        mediaUrl: null,
        mediaCaption: null,
      }).toEqual({
        ...feedCard,
        reasons: [],
        mediaUrl: null,
        mediaCaption: null,
      });
      // The entries, then their photographs: two round trips, no more.
      expect(database.rounds()).toHaveLength(2);
      expect(database.parametersOf(entries)).toEqual(
        expect.arrayContaining([SAVED, WITHDRAWN, scope.userId]),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

async function loadRepository() {
  return import("./social-return-repository");
}

function foldWhitespace(statement: string) {
  return statement.replace(/\s+/gu, " ").trim();
}

/**
 * The value bound to the placeholder that follows `fragment`, so a test can
 * say "the owner is bound to the reader" without counting `$n` by hand.
 */
function boundValue(
  compiled: { sql: string; parameters: readonly unknown[] },
  fragment: string,
) {
  const statement = foldWhitespace(compiled.sql);
  const at = statement.indexOf(`${fragment}$`);
  if (at === -1) return undefined;
  const placeholder = /^\$(\d+)/u.exec(statement.slice(at + fragment.length));
  return placeholder
    ? compiled.parameters[Number(placeholder[1]) - 1]
    : undefined;
}

/**
 * A database that records what reaches the driver — a transaction's begin,
 * commit and rollback, and every statement with its whitespace folded — and
 * refuses the statements `refuse` matches, the way a statement timeout would,
 * so a write's atomicity is observed rather than assumed.
 */
function recordingDb(options: { refuse?: RegExp } = {}) {
  const events: string[] = [];
  const statements: Array<{ sql: string; parameters: readonly unknown[] }> = [];
  class RecordingConnection implements DatabaseConnection {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      const statement = foldWhitespace(compiled.sql);
      events.push(statement);
      statements.push({ sql: statement, parameters: compiled.parameters });
      if (options.refuse?.test(statement)) throw postgresRejection("57014");
      return { rows: [] };
    }
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error("streaming is not recorded");
    }
  }
  class RecordingDriver implements Driver {
    async init() {}
    async acquireConnection() {
      return new RecordingConnection();
    }
    async beginTransaction() {
      events.push("begin");
    }
    async commitTransaction() {
      events.push("commit");
    }
    async rollbackTransaction() {
      events.push("rollback");
    }
    async releaseConnection() {}
    async destroy() {}
  }
  const database = new Kysely<Database>({
    dialect: {
      createDriver: () => new RecordingDriver(),
      createQueryCompiler: () => new PostgresQueryCompiler(),
      createAdapter: () => new PostgresAdapter(),
      createIntrospector: (db) => new PostgresIntrospector(db),
    },
  });
  return { database, events, statements };
}

/** Each Activity statement, named by what only its SQL contains. */
const ACTIVITY_STATEMENTS: ReadonlyArray<readonly [string, string]> = [
  ["preferences", 'from "notification_preferences"'],
  ["receipts", 'from "notification_receipts"'],
  ["subjects", 'as "addedOn"'],
  ["reminders", "recent_entries"],
  ["comments", 'from "engagement_comments" as "comments"'],
  ["profileFollows", 'from "profile_follows" as "follows"'],
  ["objectFollows", 'from "engagement_follows" as "follows"'],
  ["mentions", 'from "lineage_provenance_edges" as "edges"'],
  ["claims", 'from "lineage_provenance_edge_audit_events" as "audit_events"'],
  ["questions", 'from "lineage_questions" as "questions"'],
  ["lineageFollows", 'from "lineage_node_follows" as "follows"'],
];

/** The preferences and the eight event sources, sorted by name. */
const ACTIVITY_SOURCES = [
  "claims",
  "comments",
  "lineageFollows",
  "mentions",
  "objectFollows",
  "preferences",
  "profileFollows",
  "questions",
  "reminders",
];

/**
 * A database that answers each Activity statement from `answers` one
 * macrotask later, so every statement issued together is in flight before the
 * first answer arrives. `rounds()` groups the statements by what was in flight
 * at once: a read issued only after another finished starts a new round,
 * which is what a round trip costs.
 */
function activityDb(answers: Record<string, readonly unknown[]>) {
  const events: Array<{ at: "start" | "end"; name: string }> = [];
  const statements: Array<{ name: string; parameters: readonly unknown[] }> =
    [];
  class ActivityConnection implements DatabaseConnection {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      const name =
        ACTIVITY_STATEMENTS.find(([, marker]) =>
          compiled.sql.includes(marker),
        )?.[0] ?? foldWhitespace(compiled.sql);
      events.push({ at: "start", name });
      statements.push({ name, parameters: compiled.parameters });
      await new Promise((resolve) => setTimeout(resolve, 0));
      events.push({ at: "end", name });
      return { rows: [...(answers[name] ?? [])] as R[] };
    }
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error("streaming is not scripted");
    }
  }
  class ActivityDriver implements Driver {
    async init() {}
    async acquireConnection() {
      return new ActivityConnection();
    }
    async beginTransaction() {}
    async commitTransaction() {}
    async rollbackTransaction() {}
    async releaseConnection() {}
    async destroy() {}
  }
  const database = new Kysely<Database>({
    dialect: {
      createDriver: () => new ActivityDriver(),
      createQueryCompiler: () => new PostgresQueryCompiler(),
      createAdapter: () => new PostgresAdapter(),
      createIntrospector: (db) => new PostgresIntrospector(db),
    },
  });

  return {
    database,
    rounds() {
      const rounds: string[][] = [];
      let inFlight = 0;
      for (const event of events) {
        if (event.at === "end") {
          inFlight -= 1;
          continue;
        }
        if (inFlight === 0) rounds.push([]);
        rounds.at(-1)!.push(event.name);
        inFlight += 1;
      }
      return rounds.map((round) => round.sort());
    },
    parametersOf(name: string) {
      return statements.find((statement) => statement.name === name)
        ?.parameters;
    },
  };
}

function subject(
  id: string,
  overrides: Partial<NotificationObjectSubject> = {},
): NotificationObjectSubject {
  return {
    id,
    name: "Томат",
    objectKind: "plant",
    spaceName: "Балкон",
    species: "Solanum lycopersicum",
    variety: null,
    addedOn: "2026-04-01",
    addedAt: `${overrides.addedOn ?? "2026-04-01"}T09:00Z`,
    lastEntryDate: "2026-06-20",
    ...overrides,
  };
}

/**
 * Three comments on one entry (two by the same gardener), one on another
 * entry, and a reminder — newest first, as the page receives them.
 */
function activityEvents(): NotificationEvent[] {
  const comment = {
    kind: "comment",
    category: "social",
    summaryKey: "comment_on_journal",
    targetLabel: "Полив",
    object: null,
    href: "/@olena/post/3",
    actionKind: "open_journal",
    groupKey: "journal-3",
  } as const;
  return [
    {
      ...comment,
      key: "1".repeat(32),
      createdAt: "2026-07-13T12:00:00.000Z",
      actorMention: "@anna",
      read: false,
    },
    {
      ...comment,
      key: "2".repeat(32),
      createdAt: "2026-07-13T11:00:00.000Z",
      actorMention: "@bohdan",
      read: true,
    },
    {
      ...comment,
      key: "3".repeat(32),
      createdAt: "2026-07-13T10:00:00.000Z",
      actorMention: "@anna",
      read: false,
    },
    {
      ...comment,
      key: "4".repeat(32),
      createdAt: "2026-07-13T09:00:00.000Z",
      actorMention: "@vira",
      href: "/@olena/post/4",
      groupKey: "journal-4",
      read: false,
    },
    {
      key: "5".repeat(32),
      kind: "system",
      category: "reminder",
      summaryKey: "stale_journal_prompt",
      createdAt: "2026-07-13T08:00:00.000Z",
      actorMention: null,
      targetLabel: "Томат",
      object: subject("00000000-0000-4000-8000-000000000301"),
      href: "/garden/objects/00000000-0000-4000-8000-000000000301",
      actionKind: "continue_journal",
      groupKey: "stale-301",
      read: true,
    },
  ];
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
