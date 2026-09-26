import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
import { scopedToUser } from "@/server/request-scope";
import {
  buildCountEngagementLikesQuery,
  buildActionableEngagementCommentQuery,
  buildDeleteEngagementCommentQuery,
  buildEngagementBlockStateQuery,
  buildEngagementFollowStateQuery,
  buildEngagementReplyTargetQuery,
  buildDeleteEngagementLikeQuery,
  buildEngagementCommentModerationQueueQuery,
  buildGetEngagementLikeQuery,
  buildInsertEngagementLikeQuery,
  buildInsertEngagementCommentQuery,
  buildListEngagementCommentRepliesQuery,
  buildListEngagementBookmarksQuery,
  buildListEngagementCommentsQuery,
  buildPublicTopicTargetQuery,
  buildPublicJournalEntryTargetQuery,
  buildPublicLineageObjectTargetQuery,
  buildPublicVarietyTargetQuery,
  buildPublicCommunityContributionCommentTargetQuery,
  buildReportEngagementCommentQuery,
  buildUpsertEngagementBookmarkQuery,
  buildUpsertEngagementFollowQuery,
  listEngagementBookmarks,
  listEngagementCommentModerationQueue,
  normalizeEngagementCommentTarget,
  normalizeEngagementTarget,
  readEngagementCommentModerationReport,
  setEngagementBookmark,
} from "./engagement-repository";

const adminAccess = vi.hoisted(() => ({
  assertAdminCapabilityForScope: vi.fn(),
}));

// The owner's comment queue asks for `operator:mutate` before it reads a row.
// These tests are about what it shows once that is granted — and that it
// reads nothing when it is not — so the grant is scripted here.
vi.mock("@/server/admin-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/admin-access")>()),
  assertAdminCapabilityForScope: adminAccess.assertAdminCapabilityForScope,
}));

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
// The entry's id, since migration `0073` moved the ref off the slug.
const journalTarget = {
  kind: "journal_entry" as const,
  ref: "00000000-0000-4000-8000-0000000000e1",
};
const privateLeakPattern =
  /quarantine|media_assets|derivative_key|ip_address|user_agent|email|phone|invite|token|coarse_region|location_visibility|latitude|longitude|coordinates/i;
const promotionCouplingPattern =
  /meilisearch|search_index|sitemap|ranking|rank|notification|analytics_events|public_surface/i;

/**
 * The value bound to the placeholder that follows `fragment`, so a test can
 * say "visibility is bound to public" without counting `$n` by hand.
 */
function boundValue(
  compiled: { sql: string; parameters: readonly unknown[] },
  fragment: string,
) {
  const at = compiled.sql.indexOf(`${fragment}$`);
  if (at === -1) return undefined;
  const placeholder = /^\$(\d+)/.exec(
    compiled.sql.slice(at + fragment.length),
  );
  return placeholder
    ? compiled.parameters[Number(placeholder[1]) - 1]
    : undefined;
}

/**
 * A database that names each statement by the builder that compiles to it and
 * answers from a script; a statement no builder makes is logged by its table.
 * `bound` receives each statement's parameters, in the order of `log`.
 */
function scriptedDb(
  statements: Record<string, string>,
  answers: Record<string, readonly unknown[]>,
  log: string[],
  bound: Array<readonly unknown[]> = [],
) {
  class ScriptedConnection implements DatabaseConnection {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      const name =
        Object.entries(statements).find(([, sql]) => sql === compiled.sql)?.[0] ??
        `other:${/from "(\w+)"/.exec(compiled.sql)?.[1] ?? compiled.sql}`;
      log.push(name);
      bound.push(compiled.parameters);
      return { rows: [...(answers[name] ?? [])] as R[] };
    }
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error("streaming is not scripted");
    }
  }
  class ScriptedDriver implements Driver {
    async init() {}
    async acquireConnection() {
      return new ScriptedConnection();
    }
    async beginTransaction() {}
    async commitTransaction() {}
    async rollbackTransaction() {}
    async releaseConnection() {}
    async destroy() {}
  }
  return new Kysely<Database>({
    dialect: {
      createDriver: () => new ScriptedDriver(),
      createQueryCompiler: () => new PostgresQueryCompiler(),
      createAdapter: () => new PostgresAdapter(),
      createIntrospector: (db) => new PostgresIntrospector(db),
    },
  });
}

function expectCurrentEligibleCommentIdentity(
  compiled: ReturnType<
    ReturnType<typeof buildListEngagementCommentsQuery>["compile"]
  >,
) {
  expect(compiled.sql).toContain(
    'left join "user_handle_registry" as "comment_author_handles"',
  );
  expect(compiled.sql).toContain(
    '"comment_author_handles"."lifecycle_state" =',
  );
  expect(compiled.sql).toContain(
    '"user_public_profiles"."user_id" = "comment_author_handles"."user_id"',
  );
  expect(compiled.sql).toContain(
    '"user_public_profiles"."normalized_handle" = "comment_author_handles"."normalized_handle"',
  );
  expect(compiled.sql).toContain(
    '"user_public_profiles"."profile_lifecycle_state" =',
  );
  expect(compiled.sql).toContain('"user_public_profiles"."removed_at" is null');
  expect(compiled.parameters).toEqual(
    expect.arrayContaining(["current", "active"]),
  );
}

describe("engagement repository contracts", () => {
  it("keeps a contribution discussion comment-only and resolves it through the public block boundary", () => {
    const target = normalizeEngagementCommentTarget(
      "community_contribution",
      "00000000-0000-4000-8000-000000000201",
    );
    expect(target).toEqual({
      kind: "community_contribution",
      ref: "00000000-0000-4000-8000-000000000201",
    });
    expect(() => normalizeEngagementTarget(target.kind, target.ref)).toThrow();

    const compiled = buildPublicCommunityContributionCommentTargetQuery(
      testDb,
      target.ref,
      scopedToUser("00000000-0000-4000-8000-000000000002"),
    ).compile();
    expect(compiled.sql).toContain('from "community_contributions"');
    expect(compiled.sql).toContain('from "profile_blocks"');
    expect(compiled.sql).toContain('"discussion_state"');
    expect(compiled.parameters).toContain(target.ref);
    // The discussion opens with the entry it is about (`OVE-500`): its text
    // is read through the same inner join that admits only a public, active,
    // published entry, so it is the text the entry's own page already shows.
    expect(compiled.sql).toContain('"journal_entries"."body" as "entryBody"');
    expect(compiled.sql).toContain('inner join "journal_entries"');
    expect(boundValue(compiled, '"journal_entries"."visibility" = ')).toBe(
      "public",
    );
    expect(boundValue(compiled, '"journal_entries"."lifecycle_state" = ')).toBe(
      "active",
    );
    expect(compiled.sql).toContain('"journal_entries"."public_gone_at" is null');
    expect(compiled.sql).toContain(
      '"journal_entries"."published_at" is not null',
    );
    expect(compiled.sql).not.toMatch(privateLeakPattern);
  });

  it("gives the owner's comment review the text only while the comment is shown, and never the reporter (OVE-500)", () => {
    const reportId = "00000000-0000-4000-8000-000000000301";
    const open = buildEngagementCommentModerationQueueQuery(testDb).compile();
    const resolved = buildEngagementCommentModerationQueueQuery(testDb, {
      view: "resolved",
    }).compile();
    const one = buildEngagementCommentModerationQueueQuery(testDb, {
      reportId,
    }).compile();

    for (const compiled of [open, resolved, one]) {
      // A removed comment is not the public's any more, and the queue does
      // not keep its words: the text is a bounded prefix, and only while the
      // comment is shown.
      expect(compiled.sql).toContain(
        `case when "engagement_comments"."comment_state" = 'active' then left("engagement_comments"."body", 400) end as "commentBody"`,
      );
      expect(compiled.sql.split('"engagement_comments"."body"')).toHaveLength(
        2,
      );
      // The author as the public knows them: the current handle's active,
      // unremoved profile, never the account behind it.
      expect(compiled.sql).toContain(
        'left join "user_handle_registry" as "author_handles"',
      );
      expect(compiled.sql).toContain(
        '"user_public_profiles"."normalized_handle" = "author_handles"."normalized_handle"',
      );
      expect(
        boundValue(compiled, '"user_public_profiles"."profile_lifecycle_state" = '),
      ).toBe("active");
      expect(compiled.sql).toContain(
        '"user_public_profiles"."removed_at" is null',
      );
      expect(compiled.sql).not.toMatch(/"author_user_id" as/);
      // A decision is about the comment, not about who reported it.
      expect(compiled.sql).not.toContain("reporter_user_id");
      expect(compiled.sql).not.toMatch(privateLeakPattern);
    }

    // The work: reports on comments still shown, oldest first.
    expect(open.parameters).toEqual(
      expect.arrayContaining(["submitted", "reviewed"]),
    );
    expect(open.parameters).not.toContain("dismissed");
    expect(boundValue(open, '"engagement_comments"."comment_state" = ')).toBe(
      "active",
    );
    expect(open.sql).toContain(
      'order by "engagement_comment_reports"."created_at" asc, "engagement_comment_reports"."id" asc limit $',
    );

    // What was decided, newest decision first — a removed comment included,
    // which is exactly when its text is gone.
    expect(resolved.parameters).toEqual(
      expect.arrayContaining(["dismissed", "actioned"]),
    );
    expect(resolved.parameters).not.toContain("submitted");
    expect(resolved.sql).not.toContain('"engagement_comments"."comment_state" = $');
    expect(resolved.sql).toContain(
      'order by "engagement_comment_reports"."resolved_at" desc, "engagement_comment_reports"."id" desc limit $',
    );
    for (const compiled of [open, resolved]) {
      expect(compiled.parameters.at(-1)).toBe(100);
    }

    // One report as it stands now, in any state, for an action's outcome.
    expect(boundValue(one, '"engagement_comment_reports"."id" = ')).toBe(
      reportId,
    );
    expect(one.sql).not.toContain('"report_state" in');
    expect(one.sql).not.toContain("order by");
    expect(one.parameters.at(-1)).toBe(1);
    expect(() =>
      buildEngagementCommentModerationQueueQuery(testDb, {
        reportId: "not-a-report",
      }),
    ).toThrow();
  });

  it("inserts signed-in comments against a public target handle only", () => {
    const compiled = buildInsertEngagementCommentQuery(testDb, scope, {
      target: journalTarget,
      body: "This survived the July heat.",
      clientMutationId: "comment-submit-000000000001",
      now: new Date("2026-07-04T08:00:00.000Z"),
    }).compile();

    expect(compiled.sql).toContain('insert into "engagement_comments"');
    expect(compiled.sql).toContain('"author_user_id"');
    expect(compiled.sql).toContain('"client_mutation_id"');
    expect(compiled.sql).toContain(
      'on conflict ("author_user_id", "client_mutation_id") do update',
    );
    expect(compiled.sql).not.toMatch(privateLeakPattern);
    expect(compiled.sql).not.toMatch(promotionCouplingPattern);
    expect(compiled.parameters).toContain(scope.userId);
    expect(compiled.parameters).toContain("journal_entry");
    expect(compiled.parameters).toContain(journalTarget.ref);
    expect(compiled.parameters).toContain("comment-submit-000000000001");
  });

  it("lists public comments through public profile handles without auth identity", () => {
    const compiled = buildListEngagementCommentsQuery(
      testDb,
      journalTarget,
    ).compile();

    expect(compiled.sql).toContain('from "engagement_comments"');
    expect(compiled.sql).toContain('left join "user_public_profiles"');
    expect(compiled.sql).toContain('"profile_lifecycle_state"');
    expect(compiled.sql).toContain('"removed_at"');
    expect(compiled.sql).toContain('"user_public_profiles"."handle"');
    expect(compiled.sql).toContain('"user_public_profiles"."display_name"');
    expect(compiled.sql).toContain('"engagement_comments"."comment_state" in');
    expectCurrentEligibleCommentIdentity(compiled);
    expect(compiled.sql).not.toMatch(privateLeakPattern);
    expect(compiled.sql).not.toMatch(promotionCouplingPattern);
    expect(compiled.parameters).toContain("active");
  });

  it("paginates roots, fetches one reply depth, and excludes active blocks", () => {
    const viewer = scopedToUser("00000000-0000-4000-8000-000000000002");
    const roots = buildListEngagementCommentsQuery(
      testDb,
      journalTarget,
      9,
      viewer,
    ).compile();
    const replies = buildListEngagementCommentRepliesQuery(
      testDb,
      journalTarget,
      ["00000000-0000-4000-8000-000000000201"],
      viewer,
    ).compile();

    expect(roots.sql).toContain('"parent_comment_id" is null');
    expect(roots.sql).toContain('from "profile_blocks"');
    expect(roots.sql).toContain('"comment_state" in');
    expect(replies.sql).toContain('"parent_comment_id" in');
    expect(replies.sql).toContain('from "profile_blocks"');
    expect(replies.sql).not.toContain('"parent_comment_id" is null');
    expectCurrentEligibleCommentIdentity(roots);
    expectCurrentEligibleCommentIdentity(replies);
    expect(roots.parameters).toContain(viewer.userId);
  });

  it("reauthorizes reply and moderation targets against blocks and exact public handles", () => {
    const viewer = scopedToUser("00000000-0000-4000-8000-000000000002");
    const commentId = "00000000-0000-4000-8000-000000000201";
    const reply = buildEngagementReplyTargetQuery(
      testDb,
      viewer,
      journalTarget,
      commentId,
    ).compile();
    const moderation = buildActionableEngagementCommentQuery(
      testDb,
      viewer,
      commentId,
      journalTarget,
    ).compile();

    for (const compiled of [reply, moderation]) {
      expect(compiled.sql).toContain('from "profile_blocks"');
      expect(compiled.sql).toContain('"target_kind" =');
      expect(compiled.sql).toContain('"target_ref" =');
      expect(compiled.parameters).toContain(viewer.userId);
      expect(compiled.parameters).toContain(journalTarget.ref);
    }
  });

  it("uses actor-scoped final-state follows and validates curated public topics", () => {
    const objectTarget = {
      kind: "lineage_object" as const,
      ref: "00000000-0000-4000-8000-000000000101",
    };
    const upsert = buildUpsertEngagementFollowQuery(testDb, scope, {
      target: objectTarget,
      followState: "active",
      now: new Date("2026-07-13T10:00:00.000Z"),
    }).compile();
    const state = buildEngagementFollowStateQuery(
      testDb,
      scope,
      objectTarget,
    ).compile();
    const topic = buildPublicTopicTargetQuery(testDb, "harvest").compile();

    expect(upsert.sql).toContain('insert into "engagement_follows"');
    expect(upsert.sql).toContain(
      'on conflict ("follower_user_id", "target_kind", "target_ref") do update',
    );
    expect(state.sql).toContain('"follower_user_id" =');
    expect(topic.sql).toContain('from "journal_topics"');
    expect(topic.sql).toContain('"trust_state" =');
    expect(topic.sql).toContain('"public_membership_state" =');
    expect(upsert.sql).not.toMatch(privateLeakPattern);
  });

  it("deletes only an author's comment and idempotently reports a visible comment", () => {
    const commentId = "00000000-0000-4000-8000-000000000201";
    const deleted = buildDeleteEngagementCommentQuery(
      testDb,
      scope,
      commentId,
      journalTarget,
      new Date("2026-07-13T10:00:00.000Z"),
    ).compile();
    const report = buildReportEngagementCommentQuery(testDb, scope, {
      commentId,
      reason: "privacy",
      now: new Date("2026-07-13T10:00:00.000Z"),
    }).compile();

    expect(deleted.sql).toContain('update "engagement_comments"');
    expect(deleted.sql).toContain('"author_user_id" =');
    expect(deleted.sql).toContain('"comment_state" =');
    expect(report.sql).toContain('insert into "engagement_comment_reports"');
    expect(report.sql).toContain(
      'on conflict ("reporter_user_id", "comment_id") do update',
    );
    expect(report.parameters).toContain(scope.userId);
  });

  it("upserts bookmarks only inside the signed-in owner scope", () => {
    const compiled = buildUpsertEngagementBookmarkQuery(testDb, scope, {
      target: { kind: "variety", ref: "pomidor-cheri-0000000101" },
      bookmarkState: "active",
      now: new Date("2026-07-04T08:00:00.000Z"),
    }).compile();

    expect(compiled.sql).toContain('insert into "engagement_bookmarks"');
    expect(compiled.sql).toContain(
      'on conflict ("owner_user_id", "target_kind", "target_ref") do update',
    );
    expect(compiled.sql).not.toMatch(privateLeakPattern);
    expect(compiled.sql).not.toMatch(promotionCouplingPattern);
    expect(compiled.parameters).toContain(scope.userId);
    expect(compiled.parameters).toContain("active");
  });

  it("lists bookmarks as target handles without joining private journal content", () => {
    const compiled = buildListEngagementBookmarksQuery(testDb, scope).compile();

    expect(compiled.sql).toContain('from "engagement_bookmarks"');
    expect(compiled.sql).toContain('"owner_user_id" =');
    expect(compiled.sql).toContain('"bookmark_state" =');
    expect(compiled.sql).not.toMatch(
      /journal_entries|plant_objects|body|title/i,
    );
    expect(compiled.sql).not.toMatch(privateLeakPattern);
    expect(compiled.sql).not.toMatch(promotionCouplingPattern);
  });

  it("checks bookmark target owners against two-way active profile blocks", () => {
    const actorUserId = "00000000-0000-4000-8000-000000000002";
    const compiled = buildEngagementBlockStateQuery(
      testDb,
      scope,
      actorUserId,
    ).compile();

    expect(compiled.sql).toContain('from "profile_blocks"');
    expect(compiled.sql).toContain('"blocker_user_id" =');
    expect(compiled.sql).toContain('"blocked_user_id" =');
    expect(compiled.parameters).toContain(scope.userId);
    expect(compiled.parameters).toContain(actorUserId);
    expect(compiled.parameters).toContain("active");
  });

  it("records an account like against the account and nothing else", () => {
    const compiled = buildInsertEngagementLikeQuery(testDb, journalTarget, {
      kind: "user",
      userId: "00000000-0000-4000-8000-00000000000a",
    }).compile();

    expect(compiled.sql).toContain('insert into "engagement_likes"');
    expect(compiled.sql).toContain('"user_id"');
    expect(compiled.parameters).toContain(
      "00000000-0000-4000-8000-00000000000a",
    );
    // The retired shape: a device hash, an expiry, and a toggle-rate window.
    expect(compiled.sql).not.toMatch(
      /anonymous_device_hash|capability_expires_at|toggle_count|like_state/i,
    );
    expect(compiled.sql).not.toMatch(/ip_address|user_agent/i);
    expect(compiled.sql).not.toMatch(promotionCouplingPattern);
  });

  it("records a signed-out like against the browser, never the account", () => {
    const compiled = buildInsertEngagementLikeQuery(testDb, journalTarget, {
      kind: "visitor",
      visitorId: "00000000-0000-4000-8000-00000000000b",
    }).compile();

    expect(compiled.sql).toContain('"visitor_id"');
    expect(compiled.sql).not.toContain('"user_id"');
    expect(compiled.parameters).toContain(
      "00000000-0000-4000-8000-00000000000b",
    );
  });

  it("withdraws a like by deleting the row rather than flagging it", () => {
    const compiled = buildDeleteEngagementLikeQuery(testDb, journalTarget, {
      kind: "visitor",
      visitorId: "00000000-0000-4000-8000-00000000000b",
    }).compile();

    expect(compiled.sql).toContain('delete from "engagement_likes"');
    expect(compiled.sql).toContain('"visitor_id" =');
    expect(compiled.sql).not.toMatch(/like_state|set /i);
  });

  it("reads one owner's like without scanning the target", () => {
    const compiled = buildGetEngagementLikeQuery(testDb, journalTarget, {
      kind: "user",
      userId: "00000000-0000-4000-8000-00000000000a",
    }).compile();

    expect(compiled.sql).toContain('from "engagement_likes"');
    expect(compiled.sql).toContain('"target_kind" =');
    expect(compiled.sql).toContain('"target_ref" =');
    expect(compiled.sql).toContain('"user_id" =');
  });

  it("counts every like on a target, with no expiry and no ceiling", () => {
    const compiled = buildCountEngagementLikesQuery(
      testDb,
      journalTarget,
    ).compile();

    expect(compiled.sql).toContain('from "engagement_likes"');
    expect(compiled.sql).toContain('"target_kind" =');
    expect(compiled.sql).toContain('"target_ref" =');
    // A like used to stop counting 24 hours after it was cast, and the target
    // used to refuse a 65th. Neither predicate may come back.
    expect(compiled.sql).not.toMatch(/capability_expires_at|like_state/i);
    expect(compiled.sql).not.toMatch(promotionCouplingPattern);
  });

  it("validates public targets with existing public-safe page predicates", () => {
    const journal = buildPublicJournalEntryTargetQuery(
      testDb,
      journalTarget.ref,
    ).compile();
    const lineage = buildPublicLineageObjectTargetQuery(
      testDb,
      "00000000-0000-4000-8000-000000000101",
    ).compile();
    const variety = buildPublicVarietyTargetQuery(
      testDb,
      "pomidor-cheri-0000000101",
    ).compile();

    expect(journal.sql).toContain('"visibility" =');
    expect(journal.sql).toContain('"lifecycle_state" =');
    expect(journal.sql).toContain('"public_gone_at" is null');
    expect(journal.sql).not.toContain('"body"');
    expect(journal.sql).toContain('"owner_user_id" as "ownerUserId"');

    expect(lineage.sql).toContain(
      'inner join "journal_entries" as "public_entries"',
    );
    expect(lineage.sql).toContain('"public_entries"."visibility" =');
    expect(lineage.sql).toContain(
      '"public_entries"."owner_user_id" = "plant_objects"."owner_user_id"',
    );
    expect(lineage.sql).toContain(
      '"plant_objects"."owner_user_id" as "ownerUserId"',
    );

    expect(variety.sql).toContain('from "catalog_items"');
    expect(variety.sql).toContain(
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(variety.sql).toContain('"journal_entries"."visibility" =');
    expect(variety.sql).not.toContain('"journal_entries"."body"');
  });

  it("models engagement tables without promotion, search, notification, or raw request columns", () => {
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const schemaSql = readFileSync(
      join(webRoot, "sql/0001_walking_skeleton.sql"),
      "utf8",
    );
    const tableBodies = [
      "engagement_comments",
      "engagement_bookmarks",
      "engagement_likes",
    ].map((table) => {
      const match = schemaSql.match(
        new RegExp(`create table if not exists ${table} \\(([\\s\\S]*?)\\);`),
      );
      expect(match?.[1]).toBeTruthy();
      return match?.[1] ?? "";
    });

    for (const tableBody of tableBodies) {
      expect(tableBody).not.toMatch(privateLeakPattern);
      expect(tableBody).not.toMatch(promotionCouplingPattern);
    }
    expect(schemaSql).toContain("engagement_likes_device_target_uidx");
    expect(schemaSql).toContain("engagement_comments_author_mutation_uidx");
  });

  it("normalizes target types while keeping topic unavailable for current public pages", () => {
    // Since `0073` an entry is identified by its id: a slug moved under the
    // author with OVE-428 and left every stored like pointing at a name.
    expect(
      normalizeEngagementTarget(
        "journal_entry",
        "00000000-0000-4000-8000-0000000000E1",
      ),
    ).toEqual({
      kind: "journal_entry",
      ref: "00000000-0000-4000-8000-0000000000e1",
    });
    expect(() =>
      normalizeEngagementTarget("journal_entry", "врожай-томату-2026"),
    ).toThrow("Engagement target is not available.");
    expect(() =>
      normalizeEngagementTarget("lineage_object", "not-a-uuid"),
    ).toThrow("Engagement target is not available.");
  });

  it("shows the owner each reported comment as it stands, and one broken row costs only that row (OVE-500)", async () => {
    const discussionRef = "00000000-0000-4000-8000-000000000201";
    const statements = {
      "queue:open": buildEngagementCommentModerationQueueQuery(testDb, {
        view: "open",
      }).compile().sql,
      "queue:resolved": buildEngagementCommentModerationQueueQuery(testDb, {
        view: "resolved",
      }).compile().sql,
      discussion: buildPublicCommunityContributionCommentTargetQuery(
        testDb,
        discussionRef,
        null,
      ).compile().sql,
      entry: buildPublicJournalEntryTargetQuery(testDb, journalTarget.ref)
        .compile().sql,
    };
    const shown = {
      reportId: "00000000-0000-4000-8000-000000000301",
      commentId: "00000000-0000-4000-8000-000000000401",
      reason: "privacy",
      reportState: "submitted",
      createdAt: new Date("2026-09-20T10:00:00.000Z"),
      resolvedAt: null,
      targetKind: "community_contribution",
      targetRef: discussionRef,
      commentState: "active",
      commentBody: `Мій   номер\n\nтут ${"слово ".repeat(80)}`,
      authorHandle: "demo_olena",
      authorDisplayName: "Олена",
    };
    const removed = {
      ...shown,
      reportId: "00000000-0000-4000-8000-000000000302",
      commentId: "00000000-0000-4000-8000-000000000402",
      reportState: "actioned",
      resolvedAt: new Date("2026-09-21T10:00:00.000Z"),
      targetKind: "journal_entry",
      targetRef: journalTarget.ref,
      commentState: "removed",
      // The statement keeps no words of a removed comment.
      commentBody: null,
    };
    const answers = {
      "queue:open": [
        shown,
        // A reason the page cannot word is one row it cannot describe; the
        // rest of the queue still opens.
        { ...shown, reportId: "00000000-0000-4000-8000-000000000303", reason: "retired" },
      ],
      "queue:resolved": [removed],
      discussion: [
        { entryTitle: "Томати після спеки", communitySlug: "observation-and-care" },
      ],
      // The entry the removed comment was on is no longer public.
      entry: [],
      "other:engagement_comment_reports": [{ open: "2", resolved: "7" }],
    };
    adminAccess.assertAdminCapabilityForScope.mockResolvedValue({
      mode: "sealed_owner_credential_only",
      role: "owner",
      capabilities: ["operator:mutate"],
    });

    const open = await listEngagementCommentModerationQueue(
      scope,
      {},
      scriptedDb(statements, answers, []),
    );
    expect(open.view).toBe("open");
    // Postgres counts arrive as strings; the view filters need numbers.
    expect(open.counts).toEqual({ open: 2, resolved: 7 });
    expect(open.items.map((item) => item.reportId)).toEqual([shown.reportId]);
    const [item] = open.items;
    // Whitespace collapsed and the length bounded, as a public excerpt is.
    expect(item?.commentExcerpt?.startsWith("Мій номер тут слово")).toBe(true);
    expect(item?.commentExcerpt?.length).toBeLessThanOrEqual(320);
    expect(item?.commentExcerpt?.endsWith("…")).toBe(true);
    // Where the comment is, while that page is public.
    expect(item?.place).toEqual({
      label: "Томати після спеки",
      href: `/communities/observation-and-care/discussions/${discussionRef}`,
    });
    expect(item).toMatchObject({
      targetKind: "community_contribution",
      reason: "privacy",
      reportState: "submitted",
      authorHandle: "demo_olena",
    });

    const resolved = await listEngagementCommentModerationQueue(
      scope,
      { view: "resolved" },
      scriptedDb(statements, answers, []),
    );
    expect(resolved.view).toBe("resolved");
    expect(resolved.items).toEqual([
      expect.objectContaining({
        reportId: removed.reportId,
        reportState: "actioned",
        commentState: "removed",
        commentExcerpt: null,
        place: null,
      }),
    ]);

    // Without the operator grant nothing is read — not a count, not a row.
    adminAccess.assertAdminCapabilityForScope.mockRejectedValueOnce(
      new Error("Admin access denied."),
    );
    const deniedLog: string[] = [];
    await expect(
      listEngagementCommentModerationQueue(
        scope,
        {},
        scriptedDb(statements, answers, deniedLog),
      ),
    ).rejects.toThrow("Admin access denied.");
    expect(deniedLog).toEqual([]);

    // A report id that could not be one is answered without a statement.
    const reportLog: string[] = [];
    await expect(
      readEngagementCommentModerationReport(
        scope,
        "not-a-report",
        scriptedDb(statements, answers, reportLog),
      ),
    ).resolves.toBeNull();
    expect(reportLog).toEqual([]);
  });
});

describe("the bookmark shelf's read and write (OVE-502)", () => {
  const authorUserId = "00000000-0000-4000-8000-000000000002";
  const objectRef = "00000000-0000-4000-8000-0000000000f1";
  const statements = {
    bookmarks: buildListEngagementBookmarksQuery(testDb, scope).compile().sql,
    entry: buildPublicJournalEntryTargetQuery(
      testDb,
      journalTarget.ref,
    ).compile().sql,
    variety: buildPublicVarietyTargetQuery(
      testDb,
      "pomidor-cheri-0000000101",
    ).compile().sql,
    topic: buildPublicTopicTargetQuery(testDb, "tomaty").compile().sql,
    object: buildPublicLineageObjectTargetQuery(testDb, objectRef).compile()
      .sql,
    block: buildEngagementBlockStateQuery(testDb, scope, authorUserId).compile()
      .sql,
    upsert: buildUpsertEngagementBookmarkQuery(testDb, scope, {
      target: journalTarget,
      bookmarkState: "removed",
    }).compile().sql,
  };
  const publicEntry = {
    id: journalTarget.ref,
    publicSlug: "late-summer-check",
    entryNumber: 14,
    title: "Late summer check",
    ownerUserId: authorUserId,
    addressHandle: "green_thumb",
  };

  function bookmarkRow(
    bookmarkId: string,
    targetKind: string,
    targetRef: string,
  ) {
    return {
      bookmarkId,
      targetKind,
      targetRef,
      bookmarkState: "active",
      addedAt: "2026-07-04T08:00:00.000Z",
      updatedAt: "2026-07-04T08:00:00.000Z",
    };
  }

  it("keeps a saved thing that is not public any more, without its name or address, in its place on the shelf", async () => {
    const rows = [
      bookmarkRow(
        "00000000-0000-4000-8000-0000000000b1",
        "journal_entry",
        journalTarget.ref,
      ),
      bookmarkRow(
        "00000000-0000-4000-8000-0000000000b2",
        "variety",
        "old-heirloom-0000000102",
      ),
      bookmarkRow("00000000-0000-4000-8000-0000000000b3", "topic", "tomaty"),
      bookmarkRow(
        "00000000-0000-4000-8000-0000000000b4",
        "lineage_object",
        objectRef,
      ),
      // The fifth crosses into the second batch of lookups.
      bookmarkRow(
        "00000000-0000-4000-8000-0000000000b5",
        "variety",
        "retired-pepper-0000000103",
      ),
    ];
    const log: string[] = [];

    const { items } = await listEngagementBookmarks(
      scope,
      scriptedDb(
        statements,
        {
          bookmarks: rows,
          entry: [publicEntry],
          topic: [{ slug: "tomaty", label: "Томати" }],
          // The variety pages and the passport answer nothing: gone.
          variety: [],
          object: [],
          block: [],
        },
        log,
      ),
    );

    expect(
      items.map(({ target, available }) => ({ target, available })),
    ).toEqual([
      {
        target: {
          kind: "journal_entry",
          ref: journalTarget.ref,
          label: "Late summer check",
          href: "/@green_thumb/post/14",
        },
        available: true,
      },
      {
        target: {
          kind: "variety",
          ref: "old-heirloom-0000000102",
          label: null,
          href: null,
        },
        available: false,
      },
      {
        target: {
          kind: "topic",
          ref: "tomaty",
          label: "Томати",
          href: "/topics/tomaty",
        },
        available: true,
      },
      {
        target: {
          kind: "lineage_object",
          ref: objectRef,
          label: null,
          href: null,
        },
        available: false,
      },
      {
        target: {
          kind: "variety",
          ref: "retired-pepper-0000000103",
          label: null,
          href: null,
        },
        available: false,
      },
    ]);
    // Every row keeps an opaque key of its own, never the bookmark's id.
    expect(new Set(items.map((item) => item.key)).size).toBe(rows.length);
    for (const item of items) {
      expect(item.key).toMatch(/^bookmark:[0-9a-f]{16}$/u);
    }
    for (const row of rows) {
      expect(JSON.stringify(items)).not.toContain(row.bookmarkId);
    }
    // Four lookups at a time: the fifth starts only once the first four —
    // the entry's block check included — have answered.
    expect(log).toEqual([
      "bookmarks",
      "entry",
      "variety",
      "topic",
      "object",
      "block",
      "variety",
    ]);
  });

  it("marks a saved entry behind a block as unavailable, not as gone from the shelf", async () => {
    const { items } = await listEngagementBookmarks(
      scope,
      scriptedDb(
        statements,
        {
          bookmarks: [
            bookmarkRow(
              "00000000-0000-4000-8000-0000000000b1",
              "journal_entry",
              journalTarget.ref,
            ),
          ],
          entry: [publicEntry],
          block: [{ id: "00000000-0000-4000-8000-0000000000c1" }],
        },
        [],
      ),
    );

    expect(items).toEqual([
      expect.objectContaining({
        target: { ...journalTarget, label: null, href: null },
        available: false,
      }),
    ]);
  });

  it("takes one's own bookmark off a target that is not public any more, without asking whether it is", async () => {
    const log: string[] = [];
    const bound: Array<readonly unknown[]> = [];

    const result = await setEngagementBookmark(
      scope,
      { target: journalTarget, bookmarkState: "removed" },
      scriptedDb(
        statements,
        { entry: [], upsert: [{ bookmark_state: "removed" }] },
        log,
        bound,
      ),
    );

    expect(result.active).toBe(false);
    // An entry its author withdrew could never be taken off the shelf: the
    // removal asked for the same public entry the shelf said was gone.
    expect(log).toEqual(["upsert"]);
    expect(bound[0]).toEqual(
      expect.arrayContaining([
        scope.userId,
        "journal_entry",
        journalTarget.ref,
        "removed",
      ]),
    );
  });

  it("still asks before saving one, and saves nothing the public cannot see", async () => {
    const refusedLog: string[] = [];
    await expect(
      setEngagementBookmark(
        scope,
        { target: journalTarget, bookmarkState: "active" },
        scriptedDb(
          statements,
          { entry: [], upsert: [{ bookmark_state: "active" }] },
          refusedLog,
        ),
      ),
    ).rejects.toThrow("Engagement target is not public.");
    expect(refusedLog).toEqual(["entry"]);

    const savedLog: string[] = [];
    const saved = await setEngagementBookmark(
      scope,
      { target: journalTarget, bookmarkState: "active" },
      scriptedDb(
        statements,
        {
          entry: [publicEntry],
          block: [],
          upsert: [{ bookmark_state: "active" }],
        },
        savedLog,
      ),
    );
    expect(saved.active).toBe(true);
    expect(savedLog).toEqual(["entry", "block", "upsert"]);
  });
});
