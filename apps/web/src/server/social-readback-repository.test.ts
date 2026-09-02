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
  buildFollowedFeedStoriesQuery,
  buildNotificationClaimDecisionEventsQuery,
  buildNotificationClaimRequestEventsQuery,
  buildNotificationFollowEventsQuery,
  buildNotificationQuestionEventsQuery,
  serializeFollowedFeedStories,
  serializeNotificationCenterRows,
} from "./social-readback-repository";

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
const forbiddenPrivateReadbackPattern =
  /journal_entries"\."title|journal_entries"\."body|media_assets|quarantine|derivative_key|email|phone|ip_address|user_agent|invite|token|source_reference_label|source_pending_identity_id|client_mutation_id|coarse_region|location_visibility/i;

function expectMutualBlockExclusion(sql: string, actorRef: string) {
  expect(sql).toContain("from profile_blocks");
  expect(sql).toContain("profile_blocks.block_state = 'active'");
  expect(sql).toContain(`profile_blocks.blocked_user_id = ${actorRef}`);
  expect(sql).toContain(`profile_blocks.blocker_user_id = ${actorRef}`);
}

describe("social readback repository contracts", () => {
  it("builds followed feed from active follows and active public journal entries only", () => {
    const compiled = buildFollowedFeedStoriesQuery(testDb, scope).compile();

    expect(compiled.sql).toContain('from "lineage_node_follows"');
    expect(compiled.sql).toContain(
      'inner join "lineage_provenance_edges" as "followed_edges"',
    );
    expect(compiled.sql).toContain(
      'inner join "journal_entries" as "target_public_entries"',
    );
    expect(compiled.sql).toContain(
      '"lineage_node_follows"."follower_user_id" =',
    );
    expect(compiled.sql).toContain('"lineage_node_follows"."follow_state" =');
    expect(compiled.sql).toContain('"followed_edges"."consent_state" =');
    expect(compiled.sql).toContain('"followed_edges"."erasure_state" =');
    expect(compiled.sql).toContain('"target_public_entries"."visibility" =');
    expect(compiled.sql).toContain(
      '"target_public_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"target_public_entries"."public_slug" is not null',
    );
    expect(compiled.sql).toContain(
      'left join "user_handle_registry" as "target_owner_handles"',
    );
    expect(compiled.sql).toContain(
      '"target_owner_handles"."lifecycle_state" =',
    );
    expect(compiled.sql).toContain(
      '"target_owner_profiles"."normalized_handle" = "target_owner_handles"."normalized_handle"',
    );
    expect(compiled.sql).toContain(
      '"target_owner_profiles"."profile_lifecycle_state" =',
    );
    expect(compiled.sql).toContain(
      '"target_owner_profiles"."removed_at" is null',
    );
    expect(compiled.parameters).toEqual(
      expect.arrayContaining(["current", "public", "active"]),
    );
    expectMutualBlockExclusion(
      compiled.sql,
      '"lineage_node_follows"."target_owner_user_id"',
    );
    expect(compiled.sql).not.toMatch(forbiddenPrivateReadbackPattern);
  });

  it("builds notification claim requests without private transport or invite fields", () => {
    const compiled = buildNotificationClaimRequestEventsQuery(
      testDb,
      scope,
    ).compile();

    expect(compiled.sql).toContain('from "lineage_provenance_edges"');
    expect(compiled.sql).toContain('"source_owner_user_id" =');
    expect(compiled.sql).toContain('"consent_state" =');
    expect(compiled.sql).toContain('"visibility_policy" =');
    expect(compiled.sql).toContain('"erasure_state" =');
    expectMutualBlockExclusion(
      compiled.sql,
      '"lineage_provenance_edges"."owner_user_id"',
    );
    expect(compiled.sql).not.toMatch(forbiddenPrivateReadbackPattern);
  });

  it("builds claim decision notifications from bounded audit metadata", () => {
    const compiled = buildNotificationClaimDecisionEventsQuery(
      testDb,
      scope,
    ).compile();

    expect(compiled.sql).toContain(
      'from "lineage_provenance_edge_audit_events" as "audit_events"',
    );
    expect(compiled.sql).toContain('"edges"."owner_user_id" =');
    expect(compiled.sql).toContain('"audit_events"."new_consent_state" in');
    expectMutualBlockExclusion(compiled.sql, '"edges"."source_owner_user_id"');
    expect(compiled.sql).not.toMatch(forbiddenPrivateReadbackPattern);
    expect(compiled.sql).not.toMatch(
      /actor_user_id as|target_user_id as|owner_user_id as|source_owner_user_id as/i,
    );
  });

  it("builds question notifications only for delivered recipient-scoped questions", () => {
    const compiled = buildNotificationQuestionEventsQuery(
      testDb,
      scope,
    ).compile();

    expect(compiled.sql).toContain('from "lineage_questions"');
    expect(compiled.sql).toContain('"lineage_questions"."recipient_user_id" =');
    expect(compiled.sql).toContain('"lineage_questions"."question_state" =');
    expect(compiled.sql).toContain('"lineage_questions"."question_text"');
    expectMutualBlockExclusion(
      compiled.sql,
      '"lineage_questions"."asker_user_id"',
    );
    expect(compiled.sql).not.toMatch(forbiddenPrivateReadbackPattern);
    expect(compiled.sql).not.toMatch(/asker_user_id as|recipient_user_id as/i);
  });

  it("builds follow notifications only for public-safe followed targets", () => {
    const compiled = buildNotificationFollowEventsQuery(
      testDb,
      scope,
    ).compile();

    expect(compiled.sql).toContain('from "lineage_node_follows"');
    expect(compiled.sql).toContain(
      'inner join "journal_entries" as "target_public_entries"',
    );
    expect(compiled.sql).toContain(
      '"lineage_node_follows"."target_owner_user_id" =',
    );
    expect(compiled.sql).toContain('"target_public_entries"."visibility" =');
    expect(compiled.sql).toContain('"followed_edges"."consent_state" =');
    expect(compiled.sql).toContain(
      'left join "user_handle_registry" as "follower_handles"',
    );
    expect(compiled.sql).toContain('"follower_handles"."lifecycle_state" =');
    expect(compiled.sql).toContain(
      '"follower_profiles"."normalized_handle" = "follower_handles"."normalized_handle"',
    );
    expect(compiled.sql).toContain(
      '"follower_profiles"."profile_lifecycle_state" =',
    );
    expect(compiled.sql).toContain('"follower_profiles"."removed_at" is null');
    expect(compiled.parameters).toEqual(
      expect.arrayContaining(["current", "public", "active"]),
    );
    expectMutualBlockExclusion(
      compiled.sql,
      '"lineage_node_follows"."follower_user_id"',
    );
    expect(compiled.sql).not.toMatch(forbiddenPrivateReadbackPattern);
    expect(compiled.sql).not.toMatch(
      /follower_user_id as|target_owner_user_id as|owner_user_id as/i,
    );
  });

  it("serializes followed feed stories without raw ids", () => {
    const followId = "00000000-0000-4000-8000-000000000301";
    const stories = serializeFollowedFeedStories([
      {
        followId,
        publicSlug: "public-story",
        entryDate: "2026-07-04",
        publishedAt: "2026-07-04T08:00:00.000Z",
        ownerHandle: "green_thumb",
        targetObjectDisplayName: "Balcony tomato",
        targetObjectKind: "plant",
        targetCatalogKind: "plant_variety",
        targetVarietyText: "Red Cherry",
        targetVarietyState: "selected",
      },
    ], "bg");

    expect(stories).toMatchObject([
      {
        href: "/bg/journal/public-story",
        ownerMention: "@green_thumb",
        targetObject: {
          displayName: "Balcony tomato",
          varietyText: "Red Cherry",
        },
      },
    ]);
    expect(JSON.stringify(stories)).not.toContain(followId);
    expect(JSON.stringify(stories)).not.toMatch(
      /owner_user_id|target_owner_user_id|email|quarantine|derivative/i,
    );
  });

  it("serializes notification events without raw ids and keeps newest first", () => {
    const edgeId = "00000000-0000-4000-8000-000000000201";
    const auditId = "00000000-0000-4000-8000-000000000202";
    const questionId = "00000000-0000-4000-8000-000000000203";
    const followId = "00000000-0000-4000-8000-000000000204";

    const events = serializeNotificationCenterRows({
      claimRequests: [
        {
          edgeId,
          createdAt: "2026-07-04T08:00:00.000Z",
          subjectObjectDisplayName: "Balcony tomato",
          subjectObjectKind: "plant",
          subjectCatalogKind: "plant_variety",
          subjectVarietyText: "Red Cherry",
          subjectVarietyState: "selected",
          sourceObjectDisplayName: "Seed mother",
          sourceObjectKind: "plant",
          sourceCatalogKind: "plant_variety",
          sourceVarietyText: "Red Cherry",
          sourceVarietyState: "selected",
        },
      ],
      claimDecisions: [
        {
          auditId,
          action: "confirm",
          newConsentState: "confirmed",
          createdAt: "2026-07-04T09:00:00.000Z",
          subjectObjectDisplayName: "Pepper child",
          subjectObjectKind: "plant",
          subjectCatalogKind: "plant_variety",
          subjectVarietyText: "Kapia",
          subjectVarietyState: "selected",
          sourceObjectDisplayName: "Pepper mother",
          sourceObjectKind: "plant",
          sourceCatalogKind: "plant_variety",
          sourceVarietyText: "Kapia",
          sourceVarietyState: "selected",
        },
      ],
      questions: [
        {
          questionId,
          questionText: "How did this line handle balcony heat?",
          createdAt: "2026-07-04T10:00:00.000Z",
          targetObjectDisplayName: "Balcony basil",
          targetObjectKind: "plant",
          targetCatalogKind: "plant_variety",
          targetVarietyText: "Genovese",
          targetVarietyState: "selected",
        },
      ],
      follows: [
        {
          followId,
          createdAt: "2026-07-04T11:00:00.000Z",
          followerHandle: "green_thumb",
          targetObjectDisplayName: "Seed mother",
          targetObjectKind: "plant",
          targetCatalogKind: "plant_variety",
          targetVarietyText: "Red Cherry",
          targetVarietyState: "selected",
        },
      ],
    });

    expect(events.map((event) => event.kind)).toEqual([
      "lineage_follow",
      "lineage_question",
      "lineage_claim_decision",
      "lineage_claim_request",
    ]);
    expect(events[0]).toMatchObject({
      actorMention: "@green_thumb",
      actionKind: "open_followed_feed",
    });
    expect(events[1]).toMatchObject({
      detail: "How did this line handle balcony heat?",
      actionKind: "open_lineage_questions",
    });
    expect(events[3]).toMatchObject({
      actionKind: "review_claims",
    });

    const serialized = JSON.stringify(events);
    for (const rawId of [edgeId, auditId, questionId, followId]) {
      expect(serialized).not.toContain(rawId);
    }
    expect(serialized).not.toMatch(
      /owner_user_id|source_owner_user_id|follower_user_id|recipient_user_id|client_mutation|email|phone|quarantine|derivative/i,
    );
  });
});
