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
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import { scopedToUser } from "@/server/request-scope";

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
const member = scopedToUser("00000000-0000-4000-8000-000000000001");
const moderator = scopedToUser("00000000-0000-4000-8000-000000000002");
const communityId = "00000000-0000-4000-8000-000000000184";
const contributionId = "00000000-0000-4000-8000-000000000284";
const entryId = "00000000-0000-4000-8000-000000000384";
const forbiddenPrivatePattern =
  /quarantine_key|email|phone|ip_address|user_agent|coordinates|latitude|longitude|session|token|client_mutation_id|spaces\.coarse_region|plant_objects\.coarse_region/i;

describe("OVE-184 community repository contracts", () => {
  it("keeps archived communities publicly readable while drafts collapse to the missing lifecycle", async () => {
    const repository = await import("./community-repository");
    const publicLookup = repository
      .buildCommunityLookupQuery(testDb, "observation-and-care")
      .compile();
    const lifecycleLookup = repository
      .buildCommunityLifecycleLookupQuery(testDb, "observation-and-care")
      .compile();

    for (const compiled of [publicLookup, lifecycleLookup]) {
      expect(compiled.sql).toContain('"lifecycle_state" in');
      expect(compiled.parameters.slice(-4)).toEqual([
        "observation-and-care",
        "active",
        "archived",
        1,
      ]);
      expect(compiled.parameters).not.toContain("draft");
    }
  });

  it("derives navigation readiness from active moderation, rules, and canonical public journals", async () => {
    const repository = await import("./community-repository");
    const compiled = repository
      .buildCommunityReadinessQuery(testDb, "observation-and-care")
      .compile();

    expect(compiled.sql).toContain('from "communities"');
    expect(compiled.sql).toContain('inner join "journal_topics"');
    expect(compiled.sql).toContain("from community_rules");
    expect(compiled.sql).toContain("from community_moderators");
    expect(compiled.sql).toContain("from community_contributions");
    expect(compiled.sql).toContain("join journal_entries");
    expect(compiled.sql).toContain("join user_handle_registry");
    expect(compiled.sql).toContain(
      "user_handle_registry.lifecycle_state = 'current'",
    );
    expect(compiled.sql).toContain("join user_public_profiles");
    expect(compiled.sql).toContain(
      "user_public_profiles.user_id = user_handle_registry.user_id",
    );
    expect(compiled.sql).toContain(
      "user_public_profiles.normalized_handle = user_handle_registry.normalized_handle",
    );
    expect(compiled.sql).toContain(
      "user_public_profiles.profile_lifecycle_state = 'active'",
    );
    expect(compiled.sql).toContain("user_public_profiles.removed_at is null");
    expect(compiled.sql).toContain("community_moderators.revoked_at is null");
    expect(compiled.sql).toContain("journal_entries.visibility = 'public'");
    expect(compiled.sql).toContain(
      "journal_entries.lifecycle_state = 'active'",
    );
    expect(compiled.sql).toContain("journal_entries.public_gone_at is null");
    expect(compiled.sql).toContain("journal_entries.public_slug is not null");
    expect(compiled.sql).toContain('"journal_topics"."trust_state" =');
    expect(compiled.sql).not.toMatch(forbiddenPrivatePattern);
    expect(compiled.parameters).toEqual(
      expect.arrayContaining([
        "observation-and-care",
        "active",
        "open",
        "curated",
      ]),
    );

    expect(
      repository.communityIsNavigationReady({
        lifecycleState: "active",
        participationState: "open",
        topicTrustState: "curated",
        activeRuleCount: 3,
        activeModeratorCount: 1,
        activeContributionCount: 1,
        minimumReadyContributions: 1,
      }),
    ).toBe(true);
    expect(
      repository.communityIsNavigationReady({
        lifecycleState: "active",
        participationState: "open",
        topicTrustState: "curated",
        activeRuleCount: 3,
        activeModeratorCount: 1,
        activeContributionCount: 0,
        minimumReadyContributions: 1,
      }),
    ).toBe(false);
  });

  it("derives global navigation readiness with one public-only aggregate statement", async () => {
    const repository = await import("./community-repository");
    const compiled = repository
      .buildReadyCommunityNavigationQuery(testDb)
      .compile();

    expect(compiled.sql).toContain("select exists");
    expect(compiled.sql).toContain("from communities");
    expect(compiled.sql).toContain("join journal_topics");
    expect(compiled.sql).toContain("from community_rules");
    expect(compiled.sql).toContain("from community_moderators");
    expect(compiled.sql).toContain("from community_contributions");
    expect(compiled.sql).toContain("join journal_entries");
    expect(compiled.sql).toContain("join user_handle_registry");
    expect(compiled.sql).toContain("join user_public_profiles");
    expect(compiled.sql).toContain("join community_memberships");
    expect(compiled.sql).toContain(
      "community_memberships.membership_state != 'banned'",
    );
    expect(compiled.sql).toContain("journal_entries.visibility = 'public'");
    expect(compiled.sql).toContain("journal_entries.public_gone_at is null");
    expect(compiled.sql).toContain(
      ">= communities.minimum_ready_contributions",
    );
    expect(compiled.sql).not.toMatch(forbiddenPrivatePattern);
    expect(compiled.parameters).toEqual([]);
  });

  it("fails closed at the readiness deadline and fences late completion", async () => {
    vi.useFakeTimers();
    try {
      const repository = await import("./community-repository");
      let complete: ((row: { hasReadyCommunity: boolean }) => void) | undefined;
      const load = vi.fn(
        () =>
          new Promise<{ hasReadyCommunity: boolean }>((resolve) => {
            complete = resolve;
          }),
      );

      const pending = repository.resolveCommunityNavigationReadiness(load, 250);
      await vi.advanceTimersByTimeAsync(249);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual({
        value: false,
        cacheable: false,
      });
      complete?.({ hasReadyCommunity: true });
      await Promise.resolve();
      await expect(pending).resolves.toEqual({
        value: false,
        cacheable: false,
      });
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns successful readiness values as cacheable and rejects fail closed", async () => {
    const repository = await import("./community-repository");

    await expect(
      repository.resolveCommunityNavigationReadiness(async () => ({
        hasReadyCommunity: true,
      })),
    ).resolves.toEqual({ value: true, cacheable: true });
    await expect(
      repository.resolveCommunityNavigationReadiness(async () => {
        throw new Error("dependency unavailable");
      }),
    ).resolves.toEqual({ value: false, cacheable: false });
  });

  it("projects a bounded canonical journal stream and applies two-way blocks", async () => {
    const repository = await import("./community-repository");
    const compiled = repository
      .buildPublicCommunityContributionsQuery(testDb, {
        communityId,
        viewerScope: member,
        query: "волога",
        kind: "plant",
        limit: 13,
        cursor: null,
      })
      .compile();

    expect(compiled.sql).toContain('from "community_contributions"');
    expect(compiled.sql).toContain('inner join "journal_entries"');
    expect(compiled.sql).toContain('inner join "plant_objects"');
    expect(compiled.sql).toContain('inner join "user_handle_registry"');
    expect(compiled.sql).toContain('inner join "user_public_profiles"');
    expect(compiled.sql).toContain(
      '"user_handle_registry"."user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."normalized_handle" = "user_handle_registry"."normalized_handle"',
    );
    expect(compiled.sql).toContain(
      '"user_handle_registry"."lifecycle_state" =',
    );
    expect(compiled.sql).toContain('inner join "communities"');
    expect(compiled.sql).toContain("from profile_blocks");
    expect(compiled.sql).toContain("profile_blocks.block_state = 'active'");
    expect(
      compiled.sql.match(/profile_blocks\.blocker_user_id/g) ?? [],
    ).toHaveLength(2);
    expect(
      compiled.sql.match(/profile_blocks\.blocked_user_id/g) ?? [],
    ).toHaveLength(2);
    expect(compiled.sql).toContain('"contribution_state" =');
    expect(compiled.sql).toContain('"membership_state" !=');
    expect(compiled.sql).toContain('"profile_lifecycle_state" =');
    expect(compiled.sql).toContain(
      '"user_public_profiles"."removed_at" is null',
    );
    expect(compiled.sql).toContain('"journal_entries"."visibility" =');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).not.toMatch(forbiddenPrivatePattern);
    expect(compiled.parameters).toEqual(
      expect.arrayContaining([communityId, member.userId, "active", "public"]),
    );
  });

  it("restricts hybrid text work to UUID hints and bounds fallback candidates before ILIKE", async () => {
    const repository = await import("./community-repository");
    const hybrid = repository
      .buildPublicCommunityContributionsQuery(testDb, {
        communityId,
        viewerScope: null,
        query: "tomato",
        restrictToEntryIds: [entryId],
        applyTextSearch: false,
      })
      .compile();
    const fallbackCandidates = repository
      .buildPublicCommunityFallbackCandidateQuery(testDb, {
        communityId,
        viewerScope: null,
        kind: "plant",
      })
      .compile();

    expect(hybrid.sql).toContain('"journal_entries"."id" in');
    expect(hybrid.sql).not.toContain("ilike");
    expect(hybrid.parameters).toContain(entryId);
    expect(fallbackCandidates.sql).not.toContain("ilike");
    expect(fallbackCandidates.sql).toContain(
      '"community_contributions"."community_id" =',
    );
    expect(fallbackCandidates.sql).toContain(
      '"community_contributions"."added_at" desc',
    );
    expect(fallbackCandidates.sql).toContain("limit");
    expect(fallbackCandidates.parameters).toContain(256);
    expect(fallbackCandidates.sql).not.toMatch(forbiddenPrivatePattern);
  });

  it("keeps follow and leave actor-scoped and refuses self-unban semantics", async () => {
    const repository = await import("./community-repository");
    const state = repository
      .buildCommunityMembershipStateQuery(testDb, member, communityId)
      .compile();
    const follow = repository
      .buildUpsertCommunityMembershipQuery(testDb, member, {
        communityId,
        state: "active",
        now: new Date("2026-07-13T12:00:00.000Z"),
      })
      .compile();

    expect(state.sql).toContain('"community_id" =');
    expect(state.sql).toContain('"user_id" =');
    for (const compiled of [state, follow]) {
      expect(compiled.parameters).toContain(communityId);
      expect(compiled.parameters).toContain(member.userId);
    }
    expect(follow.sql).toContain('insert into "community_memberships"');
    expect(follow.sql).toContain(
      'on conflict ("community_id", "user_id") do update',
    );
    expect(follow.sql).toContain('"membership_state" !=');
  });

  it("offers only the actor's eligible public journals and stores a canonical reference", async () => {
    const repository = await import("./community-repository");
    const candidates = repository
      .buildEligibleCommunityContributionCandidatesQuery(
        testDb,
        member,
        communityId,
      )
      .compile();
    const insert = repository
      .buildInsertCommunityContributionQuery(testDb, member, {
        communityId,
        journalEntryId: entryId,
        now: new Date("2026-07-13T12:00:00.000Z"),
      })
      .compile();

    expect(candidates.sql).toContain('from "journal_entries"');
    expect(candidates.sql).toContain('inner join "user_public_profiles"');
    expect(candidates.sql).not.toContain('"user_handle_registry"');
    expect(candidates.sql).toContain('"owner_user_id" =');
    expect(candidates.sql).toContain('"visibility" =');
    expect(candidates.sql).toContain('"public_gone_at" is null');
    expect(candidates.sql).toContain('from "community_contributions"');
    expect(candidates.parameters).toContain(member.userId);
    expect(insert.sql).toContain('insert into "community_contributions"');
    expect(insert.sql).toContain('"journal_entry_id"');
    expect(insert.sql).not.toMatch(/\btitle\b|\bbody\b|public_slug/i);
    expect(insert.parameters).toEqual(
      expect.arrayContaining([communityId, entryId, member.userId]),
    );
  });

  it("records actor-scoped report intake without changing contribution visibility", async () => {
    const repository = await import("./community-repository");
    const report = repository
      .buildReportCommunityContributionQuery(testDb, member, {
        contributionId,
        reason: "privacy",
        now: new Date("2026-07-13T12:00:00.000Z"),
      })
      .compile();

    expect(report.sql).toContain(
      'insert into "community_contribution_reports"',
    );
    expect(report.sql).toContain(
      'on conflict ("reporter_user_id", "contribution_id") do update',
    );
    expect(report.parameters).toEqual(
      expect.arrayContaining([member.userId, contributionId, "privacy"]),
    );
    expect(report.sql).not.toContain('update "community_contributions"');
  });

  it("scopes moderator access and pairs state changes with append-only audit inserts", async () => {
    const repository = await import("./community-repository");
    const access = repository
      .buildCommunityModeratorAccessQuery(testDb, moderator, communityId)
      .compile();
    const remove = repository
      .buildModerateCommunityContributionQuery(testDb, moderator, {
        communityId,
        contributionId,
        state: "removed",
        reason: "off_topic",
        now: new Date("2026-07-13T12:00:00.000Z"),
      })
      .compile();
    const audit = repository
      .buildInsertCommunityModerationAuditQuery(testDb, moderator, {
        communityId,
        targetKind: "contribution",
        targetId: contributionId,
        action: "remove_contribution",
        reason: "off_topic",
        previousState: "active",
        newState: "removed",
        now: new Date("2026-07-13T12:00:00.000Z"),
      })
      .compile();

    expect(access.sql).toContain('from "community_moderators"');
    expect(access.sql).toContain('"assignment_state" =');
    expect(access.parameters).toEqual(
      expect.arrayContaining([communityId, moderator.userId, "active"]),
    );
    expect(remove.sql).toContain('update "community_contributions"');
    expect(remove.sql).toContain('"community_id" =');
    expect(remove.sql).toContain('"id" =');
    expect(audit.sql).toContain('insert into "community_moderation_audit_log"');
    expect(audit.sql).not.toMatch(forbiddenPrivatePattern);
  });

  it("builds public metadata, rules, and aggregate counts without a public member list", async () => {
    const repository = await import("./community-repository");
    const lookup = repository
      .buildCommunityLookupQuery(testDb, "observation-and-care", member)
      .compile();
    const lifecycle = repository
      .buildCommunityLifecycleLookupQuery(testDb, "observation-and-care")
      .compile();
    const rules = repository
      .buildCommunityRulesQuery(testDb, communityId)
      .compile();
    const stats = repository
      .buildCommunityStatsQuery(testDb, communityId, member)
      .compile();

    expect(lookup.sql).toContain('from "communities"');
    expect(lookup.sql).toContain('inner join "journal_topics"');
    expect(lookup.sql).toContain("join user_handle_registry as cover_handles");
    expect(lookup.sql).toContain(
      "cover_profiles.normalized_handle = cover_handles.normalized_handle",
    );
    expect(lookup.sql).toContain(
      "cover_profiles.profile_lifecycle_state = 'active'",
    );
    expect(lookup.sql).toContain("cover_profiles.removed_at is null");
    expect(lookup.sql).toContain("profile_blocks.block_state = 'active'");
    expect(lifecycle.sql).toContain('select "id" from "communities"');
    expect(lifecycle.sql).not.toMatch(
      /member|contribution|profile|journal|location/i,
    );
    expect(rules.sql).toContain('from "community_rules"');
    expect(rules.sql).toContain('"rule_state" =');
    expect(stats.sql).toContain('from "community_memberships"');
    expect(stats.sql).toContain("count(*)");
    expect(stats.sql.match(/join user_handle_registry/g) ?? []).toHaveLength(2);
    expect(
      stats.sql.match(
        /user_public_profiles\.normalized_handle = user_handle_registry\.normalized_handle/g,
      ) ?? [],
    ).toHaveLength(2);
    expect(
      stats.sql.match(
        /user_public_profiles\.profile_lifecycle_state = 'active'/g,
      ) ?? [],
    ).toHaveLength(2);
    expect(
      stats.sql.match(/user_public_profiles\.removed_at is null/g) ?? [],
    ).toHaveLength(2);
    expect(stats.sql).toContain("profile_blocks.block_state = 'active'");
    expect(
      stats.sql.match(/profile_blocks\.blocker_user_id/g) ?? [],
    ).toHaveLength(6);
    expect(
      stats.sql.match(/profile_blocks\.blocked_user_id/g) ?? [],
    ).toHaveLength(6);
    expect(stats.sql).not.toContain('"community_memberships"."user_id" as');
    expect(stats.sql).not.toMatch(forbiddenPrivatePattern);
  });

  it("reauthorizes report targets and keeps private or removed journals out of moderation presentation", async () => {
    const repository = await import("./community-repository");
    const target = repository
      .buildCommunityReportTargetQuery(
        testDb,
        member,
        communityId,
        contributionId,
      )
      .compile();
    const queue = repository
      .buildCommunityModerationQueueQuery(testDb, communityId)
      .compile();

    expect(target.sql).toContain('from "community_contributions"');
    expect(target.sql).toContain('inner join "journal_entries"');
    expect(target.sql).toContain('inner join "communities"');
    expect(target.sql).toContain('inner join "community_memberships"');
    expect(target.sql).toContain('inner join "user_public_profiles"');
    expect(target.sql).not.toContain('"user_handle_registry"');
    expect(target.sql).toContain('"contribution_state" =');
    expect(target.sql).toContain('"community_contributions"."community_id" =');
    expect(target.sql).toContain('"owner_user_id" !=');
    expect(target.sql).toContain("from profile_blocks");
    expect(queue.sql).toContain('from "community_contribution_reports"');
    expect(queue.sql).toContain('inner join "community_memberships"');
    expect(queue.sql).toContain('left join "journal_entries"');
    expect(queue.sql).toContain(
      'left join "user_handle_registry" as "contributor_handles"',
    );
    expect(queue.sql).toContain('"contributor_handles"."lifecycle_state" =');
    expect(queue.sql).toContain(
      '"user_public_profiles"."user_id" = "contributor_handles"."user_id"',
    );
    expect(queue.sql).toContain(
      '"user_public_profiles"."normalized_handle" = "contributor_handles"."normalized_handle"',
    );
    expect(queue.sql).toContain(
      '"user_public_profiles"."profile_lifecycle_state" =',
    );
    expect(queue.sql).toContain('"user_public_profiles"."removed_at" is null');
    expect(queue.sql).toContain('"journal_entries"."visibility" =');
    expect(queue.sql).toContain('"report_state" in');
    expect(queue.sql).not.toContain("from profile_blocks");
    expect(queue.sql).not.toContain('"journal_entries"."body"');
    expect(queue.sql).not.toMatch(forbiddenPrivatePattern);
  });

  it("supports bounded rule enforcement transitions for discussions, members, reports, and participation", async () => {
    const repository = await import("./community-repository");
    const now = new Date("2026-07-13T12:00:00.000Z");
    const discussion = repository
      .buildModerateCommunityDiscussionQuery(testDb, {
        communityId,
        contributionId,
        state: "closed",
        now,
      })
      .compile();
    const membership = repository
      .buildModerateCommunityMembershipQuery(testDb, {
        communityId,
        membershipId: "00000000-0000-4000-8000-000000000484",
        state: "banned",
        now,
      })
      .compile();
    const report = repository
      .buildResolveCommunityReportQuery(testDb, moderator, {
        communityId,
        reportId: "00000000-0000-4000-8000-000000000584",
        state: "actioned",
        now,
      })
      .compile();
    const community = repository
      .buildSetCommunityParticipationQuery(testDb, {
        communityId,
        state: "closed",
        now,
      })
      .compile();

    expect(discussion.sql).toContain('update "community_contributions"');
    expect(discussion.sql).toContain('"discussion_state" =');
    expect(membership.sql).toContain('update "community_memberships"');
    expect(membership.sql).toContain('"membership_state" =');
    expect(report.sql).toContain('update "community_contribution_reports"');
    expect(report.sql).toContain('"resolved_by_user_id" =');
    expect(community.sql).toContain('update "communities"');
    expect(community.sql).toContain('"participation_state" =');
  });

  it("serializes canonical cards with stable pagination and localized public paths", async () => {
    const repository = await import("./community-repository");
    const rows = Array.from({ length: 13 }, (_, index) => ({
      contributionId: `00000000-0000-4000-8000-${String(700 + index).padStart(12, "0")}`,
      addedAt: new Date(Date.UTC(2026, 6, 13, 12, 0, 13 - index)),
      discussionState: index === 1 ? "closed" : "open",
      entryId: `00000000-0000-4000-8000-${String(800 + index).padStart(12, "0")}`,
      publicSlug: `public-observation-${index}`,
      title: `Спостереження ${index}`,
      body: "Щоденникове спостереження з перевіреним контекстом. ".repeat(10),
      entryDate: "2026-07-13",
      publishedAt: new Date(Date.UTC(2026, 6, 13, 11, 0, index)),
      ownerUserId: `00000000-0000-4000-8000-${String(900 + index).padStart(12, "0")}`,
      objectId: `00000000-0000-4000-8000-${String(1000 + index).padStart(12, "0")}`,
      objectDisplayName: `Об'єкт ${index}`,
      objectKind: index % 2 === 0 ? "plant" : "animal",
      authorHandle: `keeper_${index}`,
      authorDisplayName: `Keeper ${index}`,
      coverDerivativeKey: index === 0 ? "covers/cover.png" : null,
      coverFocalX: index === 0 ? 0.5 : null,
      coverFocalY: index === 0 ? 0.5 : null,
      coverIntrinsicWidth: index === 0 ? 800 : null,
      coverIntrinsicHeight: index === 0 ? 600 : null,
      viewerReportState: index === 1 ? "submitted" : null,
    }));

    const page = repository.serializePublicCommunityContributionPage(
      rows,
      "bg",
      12,
      (key: string) => `https://media.over.garden/${key}`,
    );

    expect(page.items).toHaveLength(12);
    expect(page.items[0]).toMatchObject({
      href: "/bg/journal/public-observation-0",
      discussionState: "open",
      author: {
        handle: "keeper_0",
        href: "/bg/@keeper_0",
      },
      coverUrl: "https://media.over.garden/covers/cover.png",
      viewerReportState: null,
    });
    expect(page.items[0]?.excerpt.length).toBeLessThanOrEqual(320);
    expect(page.nextCursor).toBeTruthy();
    expect(
      repository.decodeCommunityContributionCursor(page.nextCursor!),
    ).toEqual({
      addedAt: rows[11]?.addedAt.toISOString(),
      id: rows[11]?.contributionId,
    });
  });

  it("exposes the complete guest, member, safety, and moderator service boundary", async () => {
    const repository = await import("./community-repository");
    for (const operation of [
      repository.listPublicCommunities,
      repository.getPublicCommunityPage,
      repository.hasReadyCommunityNavigation,
      repository.setCommunityMembership,
      repository.contributePublicJournalToCommunity,
      repository.reportCommunityContribution,
      repository.blockCommunityContributionAuthor,
      repository.listCommunityModerationQueue,
      repository.moderateCommunityContribution,
      repository.moderateCommunityDiscussion,
      repository.moderateCommunityMembership,
      repository.resolveCommunityReport,
      repository.setCommunityParticipation,
    ]) {
      expect(operation).toBeTypeOf("function");
    }
  });
});
