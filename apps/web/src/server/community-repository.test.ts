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
import type { PublicCommunityContributionRow } from "./community-repository";

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
const reportId = "00000000-0000-4000-8000-000000000584";
const communitySlug = "observation-and-care";
const forbiddenPrivatePattern =
  /quarantine_key|email|phone|ip_address|user_agent|coordinates|latitude|longitude|session|token|client_mutation_id|spaces\.coarse_region|plant_objects\.coarse_region/i;

type Compiled = { sql: string; parameters: readonly unknown[] };

/**
 * The value bound to the placeholder that follows `fragment`, so a test can
 * say "visibility is bound to public" without counting `$n` by hand.
 */
function boundValue(compiled: Compiled, fragment: string) {
  const at = compiled.sql.indexOf(`${fragment}$`);
  if (at === -1) return undefined;
  const placeholder = /^\$(\d+)/.exec(compiled.sql.slice(at + fragment.length));
  return placeholder
    ? compiled.parameters[Number(placeholder[1]) - 1]
    : undefined;
}

/** The ON clause of one join: what a row must be to be joined at all. */
function joinClause(sql: string, join: string) {
  const at = sql.indexOf(join);
  if (at === -1) return "";
  const rest = sql.slice(at + join.length);
  const end = rest.search(/ (?:inner join|left join|where|order by|limit) /);
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * A database that names each statement by the builder that compiles to it and
 * answers from a script. A mutation here runs several statements in one
 * transaction and refuses between them; a compile test sees one statement at
 * a time, and only a run shows which ones ran before a refusal. A statement
 * no builder makes is logged by its table, so the log says what it was, and
 * an `Error` as its answer fails it the way a timeout would.
 */
function scriptedDb(
  statements: Record<string, string>,
  answers: Record<string, readonly unknown[] | Error>,
  log: string[],
) {
  class ScriptedConnection implements DatabaseConnection {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      const name =
        Object.entries(statements).find(
          ([, sql]) => sql === compiled.sql,
        )?.[0] ??
        `other:${/from "(\w+)"/.exec(compiled.sql)?.[1] ?? compiled.sql}`;
      log.push(name);
      const answer = answers[name];
      if (answer instanceof Error) throw answer;
      return { rows: [...(answer ?? [])] as R[] };
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

/** The community lookup's row, open and active unless a case says otherwise. */
function communityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: communityId,
    slug: communitySlug,
    contentKey: "observation-and-care",
    lifecycleState: "active",
    participationState: "open",
    topicSlug: "observation",
    topicLabel: "Спостереження",
    ...overrides,
  };
}

/** How a refusal reads to the action: its code, or what else happened. */
async function refusalOf(pending: Promise<unknown>) {
  const repository = await import("./community-repository");
  try {
    await pending;
    return "resolved";
  } catch (error) {
    return repository.communityMutationRefusal(error) ?? "plain error";
  }
}

function contributionRow(index: number): PublicCommunityContributionRow {
  return {
    contributionId: `00000000-0000-4000-8000-${String(700 + index).padStart(12, "0")}`,
    addedAt: new Date(Date.UTC(2026, 6, 13, 12, 0, 13 - index)),
    discussionState: "open",
    entryId: `00000000-0000-4000-8000-${String(800 + index).padStart(12, "0")}`,
    publicSlug: `public-observation-${index}`,
    entryNumber: index + 1,
    title: `Спостереження ${index}`,
    body: "Щоденникове спостереження з перевіреним контекстом.",
    sourceLanguage: "uk",
    entryDate: "2026-07-13",
    publishedAt: new Date(Date.UTC(2026, 6, 13, 11, 0, index)),
    ownerUserId: `00000000-0000-4000-8000-${String(900 + index).padStart(12, "0")}`,
    objectId: `00000000-0000-4000-8000-${String(1000 + index).padStart(12, "0")}`,
    objectPublicSlug: null,
    objectDisplayName: `Об'єкт ${index}`,
    objectKind: "plant",
    authorHandle: `keeper_${index}`,
    addressHandle: `keeper_${index}`,
    authorDisplayName: `Keeper ${index}`,
    coverDerivativeKey: null,
    coverFocalX: null,
    coverFocalY: null,
    coverIntrinsicWidth: null,
    coverIntrinsicHeight: null,
    viewerReportState: null,
  };
}

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
    // A card marks the gardener's words with their language (ADR-0029 D11).
    expect(compiled.sql).toContain(
      '"journal_entries"."source_language" as "sourceLanguage"',
    );
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
    // A moderator decides on the entry's text (`OVE-500`), so the review
    // reads the start of it — never more than a reader of the community
    // already has: one bounded prefix, read through the LEFT JOIN whose ON
    // clause admits only a public entry. A private or withdrawn entry leaves
    // the row with no title and no text, and the review says so.
    expect(queue.sql).toContain(
      'left("journal_entries"."body", 400) as "journalExcerpt"',
    );
    expect(queue.sql.split('"journal_entries"."body"')).toHaveLength(2);
    const entriesJoin = joinClause(queue.sql, 'left join "journal_entries" on');
    expect(boundValue(queue, '"journal_entries"."visibility" = ')).toBe(
      "public",
    );
    for (const predicate of [
      '"journal_entries"."visibility" = $',
      '"journal_entries"."lifecycle_state" = $',
      '"journal_entries"."public_gone_at" is null',
      '"journal_entries"."public_slug" is not null',
      '"journal_entries"."published_at" is not null',
    ]) {
      expect(entriesJoin).toContain(predicate);
    }
    // Who pointed at it is not part of the decision: the reporter is never
    // selected, not even as an id.
    expect(queue.sql).not.toContain("reporter_user_id");
    expect(queue.sql).not.toMatch(forbiddenPrivatePattern);
  });

  it("reviews open reports oldest first and decided ones newest decision first (OVE-500)", async () => {
    const repository = await import("./community-repository");
    const open = repository
      .buildCommunityModerationQueueQuery(testDb, communityId)
      .compile();
    const resolved = repository
      .buildCommunityModerationQueueQuery(testDb, communityId, {
        view: "resolved",
      })
      .compile();

    // The work waits in the order it arrived.
    expect(open.sql).toContain(
      'order by "community_contribution_reports"."created_at" asc, "community_contribution_reports"."id" asc limit $',
    );
    expect(open.parameters).toEqual(
      expect.arrayContaining(["submitted", "reviewed"]),
    );
    expect(open.parameters).not.toContain("dismissed");
    expect(open.parameters).not.toContain("actioned");
    // What was decided reads as a history: the latest decision on top.
    expect(resolved.sql).toContain(
      'order by "community_contribution_reports"."resolved_at" desc, "community_contribution_reports"."id" desc limit $',
    );
    expect(resolved.parameters).toEqual(
      expect.arrayContaining(["dismissed", "actioned"]),
    );
    expect(resolved.parameters).not.toContain("submitted");
    expect(resolved.parameters).not.toContain("reviewed");

    for (const compiled of [open, resolved]) {
      expect(
        boundValue(compiled, '"community_contributions"."community_id" = '),
      ).toBe(communityId);
      expect(compiled.sql).not.toContain("reporter_user_id");
      expect(compiled.parameters.at(-1)).toBe(40);
    }
    // Either view stays a bounded page, however large the request.
    expect(
      repository
        .buildCommunityModerationQueueQuery(testDb, communityId, {
          view: "resolved",
          limit: 500,
        })
        .compile()
        .parameters.at(-1),
    ).toBe(100);
  });

  it("reads one report back in any state, and only inside its community (OVE-500)", async () => {
    const repository = await import("./community-repository");
    const one = repository
      .buildCommunityModerationQueueQuery(testDb, communityId, { reportId })
      .compile();

    // An action's outcome is worded from the record as it stands now, so the
    // read admits a resolved report as readily as an open one.
    expect(boundValue(one, '"community_contribution_reports"."id" = ')).toBe(
      reportId,
    );
    expect(one.sql).not.toContain('"report_state" in');
    expect(one.sql).not.toContain("order by");
    expect(one.parameters.at(-1)).toBe(1);
    // A report id from another community names nothing here.
    expect(boundValue(one, '"community_contributions"."community_id" = ')).toBe(
      communityId,
    );
    // The same presentation as the queue: public text only, never the reporter.
    expect(one.sql).toContain(
      'left("journal_entries"."body", 400) as "journalExcerpt"',
    );
    expect(one.sql).not.toContain("reporter_user_id");
    expect(() =>
      repository.buildCommunityModerationQueueQuery(testDb, communityId, {
        reportId: "not-a-report",
      }),
    ).toThrow();
  });

  it("counts both views in one statement without reading what was reported (OVE-500)", async () => {
    const repository = await import("./community-repository");
    const counts = repository
      .buildCommunityModerationCountsQuery(testDb, communityId)
      .compile();

    expect(counts.sql).toContain(
      `count(*) filter (where "community_contribution_reports"."report_state" in ('submitted', 'reviewed')) as "open"`,
    );
    expect(counts.sql).toContain(
      `count(*) filter (where "community_contribution_reports"."report_state" in ('dismissed', 'actioned')) as "resolved"`,
    );
    expect(counts.sql).toContain('from "community_contribution_reports"');
    expect(counts.sql).toContain('inner join "community_contributions"');
    expect(counts.parameters).toEqual([communityId]);
    // A number needs no text and no people.
    expect(counts.sql).not.toContain("journal_entries");
    expect(counts.sql).not.toContain("reporter_user_id");
    expect(counts.sql).not.toContain("user_public_profiles");
  });

  it("finds the reader's own contribution of an entry in any state (OVE-500)", async () => {
    const repository = await import("./community-repository");
    const owned = repository
      .buildOwnedCommunityContributionQuery(
        testDb,
        member,
        communityId,
        entryId,
      )
      .compile();

    // A second press of Add, or a second tab, meets the first one's row;
    // this read tells "already here" from "not eligible" after a refusal.
    expect(owned.sql).toContain('from "community_contributions"');
    expect(boundValue(owned, '"community_id" = ')).toBe(communityId);
    expect(boundValue(owned, '"journal_entry_id" = ')).toBe(entryId);
    // Only the reader's own row answers: nobody learns from it what anybody
    // else added.
    expect(boundValue(owned, '"contributor_user_id" = ')).toBe(member.userId);
    // In any state: a removed contribution still holds the entry's place.
    expect(owned.sql).not.toContain('"contribution_state" =');
    expect(owned.parameters.at(-1)).toBe(1);
    expect(() =>
      repository.buildOwnedCommunityContributionQuery(
        testDb,
        member,
        communityId,
        "not-an-entry",
      ),
    ).toThrow();
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
      entryNumber: index + 1,
      title: `Спостереження ${index}`,
      body: "Щоденникове спостереження з перевіреним контекстом. ".repeat(10),
      // A row written before the column existed reads as the default.
      sourceLanguage: index === 0 ? "bg" : null,
      entryDate: "2026-07-13",
      publishedAt: new Date(Date.UTC(2026, 6, 13, 11, 0, index)),
      ownerUserId: `00000000-0000-4000-8000-${String(900 + index).padStart(12, "0")}`,
      objectId: `00000000-0000-4000-8000-${String(1000 + index).padStart(12, "0")}`,
      objectPublicSlug: index === 0 ? "обєкт-0" : null,
      objectDisplayName: `Об'єкт ${index}`,
      objectKind: index % 2 === 0 ? "plant" : "animal",
      authorHandle: `keeper_${index}`,
      addressHandle: `keeper_${index}`,
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
      // Under its author, at its number (ADR-0029 D9), not a name that 308s.
      href: "/@keeper_0/post/1",
      object: {
        // Under the author, as the passport's canonical is (ADR-0029 D9).
        href: `/@keeper_0/objects/${encodeURIComponent("обєкт-0")}`,
      },
      discussionState: "open",
      author: {
        handle: "keeper_0",
        href: "/bg/@keeper_0",
      },
      coverUrl: "https://media.over.garden/covers/cover.png",
      viewerReportState: null,
      sourceLanguage: "bg",
    });
    expect(page.items[2]?.sourceLanguage).toBe("uk");
    expect(page.items[0]?.excerpt.length).toBeLessThanOrEqual(320);
    expect(page.nextCursor).toBeTruthy();
    expect(
      repository.decodeCommunityContributionCursor(page.nextCursor!),
    ).toEqual({
      addedAt: rows[11]?.addedAt.toISOString(),
      id: rows[11]?.contributionId,
    });
  });

  it("marks only the reader's own entries as theirs (OVE-500)", async () => {
    const repository = await import("./community-repository");
    const rows = [0, 1, 2].map((index) => contributionRow(index));
    const media = (key: string) => `https://media.over.garden/${key}`;
    const reader = rows[1]!.ownerUserId;

    // The server refuses a report or a block of your own entry, so the card
    // must know which entries are yours to leave those controls off.
    const signedIn = repository.serializePublicCommunityContributionPage(
      rows,
      "uk",
      12,
      media,
      reader,
    );
    expect(signedIn.items.map((item) => item.viewerIsAuthor)).toEqual([
      false,
      true,
      false,
    ]);

    // A guest wrote nothing here, whatever a row's owner is.
    for (const guest of [
      repository.serializePublicCommunityContributionPage(
        rows,
        "uk",
        12,
        media,
      ),
      repository.serializePublicCommunityContributionPage(
        rows,
        "uk",
        12,
        media,
        null,
      ),
    ]) {
      expect(guest.items.map((item) => item.viewerIsAuthor)).toEqual([
        false,
        false,
        false,
      ]);
    }
  });

  it("names the rule that refused a contribution, after only the statements it needed (OVE-500)", async () => {
    const repository = await import("./community-repository");
    const statements = {
      community: repository
        .buildCommunityLookupQuery(testDb, communitySlug)
        .compile().sql,
      membership: repository
        .buildCommunityMembershipStateQuery(testDb, member, communityId)
        .compile().sql,
      eligible: repository
        .buildEligibleCommunityContributionCandidatesQuery(
          testDb,
          member,
          communityId,
          entryId,
        )
        .compile().sql,
      owned: repository
        .buildOwnedCommunityContributionQuery(
          testDb,
          member,
          communityId,
          entryId,
        )
        .compile().sql,
      insert: repository
        .buildInsertCommunityContributionQuery(testDb, member, {
          communityId,
          journalEntryId: entryId,
        })
        .compile().sql,
    };
    const admitted = {
      community: [communityRow()],
      membership: [{ id: "membership", membership_state: "active" }],
      eligible: [{ id: entryId }],
      owned: [],
      insert: [{ id: contributionId, contribution_state: "active" }],
    };
    const cases: {
      case: string;
      answers: Record<string, readonly unknown[] | Error>;
      journalEntryId?: string;
      refusal: string;
      ran: string[];
    }[] = [
      {
        case: "a community that takes no entries now",
        answers: {
          ...admitted,
          community: [communityRow({ participationState: "closed" })],
        },
        refusal: "participation_closed",
        ran: ["community"],
      },
      {
        case: "an archived community",
        answers: {
          ...admitted,
          community: [communityRow({ lifecycleState: "archived" })],
        },
        refusal: "community_unavailable",
        ran: ["community"],
      },
      {
        case: "no such community",
        answers: { ...admitted, community: [] },
        refusal: "community_unavailable",
        ran: ["community"],
      },
      {
        case: "a banned member",
        answers: {
          ...admitted,
          membership: [{ id: "membership", membership_state: "banned" }],
        },
        refusal: "membership_banned",
        ran: ["community", "membership"],
      },
      {
        case: "a reader who left",
        answers: {
          ...admitted,
          membership: [{ id: "membership", membership_state: "left" }],
        },
        refusal: "membership_required",
        ran: ["community", "membership"],
      },
      {
        case: "a reader who never joined",
        answers: { ...admitted, membership: [] },
        refusal: "membership_required",
        ran: ["community", "membership"],
      },
      {
        // Refused by name before any entry is read, not by a query that
        // throws on a malformed id and reads as "unavailable".
        case: "an entry id that names no entry",
        answers: admitted,
        journalEntryId: "not-an-entry",
        refusal: "entry_not_eligible",
        ran: ["community", "membership"],
      },
      {
        case: "an entry that is not the reader's public entry",
        answers: { ...admitted, eligible: [] },
        refusal: "entry_not_eligible",
        ran: ["community", "membership", "eligible", "owned"],
      },
      {
        case: "an entry the reader already added",
        answers: {
          ...admitted,
          eligible: [],
          owned: [{ id: contributionId, contributionState: "active" }],
        },
        refusal: "entry_already_added",
        ran: ["community", "membership", "eligible", "owned"],
      },
      {
        // A moderator's removal stands, and the reader is told so: "it is
        // already here" would send them looking for an entry nobody sees.
        case: "an entry a moderator removed from this community",
        answers: {
          ...admitted,
          eligible: [],
          owned: [{ id: contributionId, contributionState: "removed" }],
        },
        refusal: "entry_removed",
        ran: ["community", "membership", "eligible", "owned"],
      },
      {
        // The unique index decided between two presses: the insert returned
        // nothing, and the second press is told the entry is there.
        case: "an entry another press added first",
        answers: { ...admitted, insert: [] },
        refusal: "entry_already_added",
        ran: ["community", "membership", "eligible", "insert"],
      },
    ];

    for (const item of cases) {
      const log: string[] = [];
      const database = scriptedDb(statements, item.answers, log);
      await expect(
        refusalOf(
          repository.contributePublicJournalToCommunity(
            member,
            {
              slug: communitySlug,
              journalEntryId: item.journalEntryId ?? entryId,
            },
            database,
          ),
        ),
        item.case,
      ).resolves.toBe(item.refusal);
      expect(log, item.case).toEqual(item.ran);
    }

    const log: string[] = [];
    await expect(
      repository.contributePublicJournalToCommunity(
        member,
        { slug: communitySlug, journalEntryId: entryId },
        scriptedDb(statements, admitted, log),
      ),
    ).resolves.toMatchObject({
      contributionId,
      community: { id: communityId },
    });
    expect(log).toEqual(["community", "membership", "eligible", "insert"]);
  });

  it("tells a refusal from any other failure by its class alone (OVE-500)", async () => {
    const repository = await import("./community-repository");
    const refusal = new repository.CommunityMutationError(
      "entry_already_added",
    );

    expect(refusal).toBeInstanceOf(Error);
    expect(repository.communityMutationRefusal(refusal)).toBe(
      "entry_already_added",
    );
    // A database error is not a rule, whatever it says: the reader is told
    // "unavailable" and may retry, never that a rule refused them.
    expect(
      repository.communityMutationRefusal(
        new Error("Community mutation refused: membership_required."),
      ),
    ).toBeNull();
    expect(
      repository.communityMutationRefusal({ refusal: "membership_banned" }),
    ).toBeNull();
    expect(repository.communityMutationRefusal(undefined)).toBeNull();
  });

  it("says whether a community takes entries now and where the writer stands (OVE-500)", async () => {
    const repository = await import("./community-repository");
    const statements = {
      community: repository
        .buildCommunityLookupQuery(testDb, communitySlug)
        .compile().sql,
      membership: repository
        .buildCommunityMembershipStateQuery(testDb, member, communityId)
        .compile().sql,
    };
    const read = (answers: Record<string, readonly unknown[] | Error>) =>
      repository.readCommunityWritingContext(
        member,
        communitySlug,
        scriptedDb(statements, answers, []),
      );

    await expect(
      read({
        community: [communityRow()],
        membership: [{ id: "membership", membership_state: "active" }],
      }),
    ).resolves.toEqual({
      slug: communitySlug,
      contentKey: "observation-and-care",
      accepting: true,
      membershipState: "active",
    });
    // Closed or archived, the composer still writes the entry; it only stops
    // promising that the community will take it.
    for (const community of [
      communityRow({ participationState: "closed" }),
      communityRow({ lifecycleState: "archived" }),
    ]) {
      await expect(
        read({ community: [community], membership: [] }),
      ).resolves.toMatchObject({ accepting: false, membershipState: null });
    }
    await expect(read({ community: [], membership: [] })).resolves.toBeNull();

    // A slug nobody can spell is answered without a statement.
    const log: string[] = [];
    await expect(
      repository.readCommunityWritingContext(
        member,
        "../not a community",
        scriptedDb(statements, {}, log),
      ),
    ).resolves.toBeNull();
    expect(log).toEqual([]);
  });

  it("opens the review only to a moderator, with the counts behind each view (OVE-500)", async () => {
    const repository = await import("./community-repository");
    const statements = {
      community: repository
        .buildCommunityLookupQuery(testDb, communitySlug)
        .compile().sql,
      moderator: repository
        .buildCommunityModeratorAccessQuery(testDb, moderator, communityId)
        .compile().sql,
      "queue:open": repository
        .buildCommunityModerationQueueQuery(testDb, communityId)
        .compile().sql,
      "queue:resolved": repository
        .buildCommunityModerationQueueQuery(testDb, communityId, {
          view: "resolved",
        })
        .compile().sql,
      counts: repository
        .buildCommunityModerationCountsQuery(testDb, communityId)
        .compile().sql,
    };
    const decided = {
      reportId,
      reportReason: "privacy",
      reportState: "actioned",
      reportedAt: new Date("2026-09-20T10:00:00.000Z"),
      resolvedAt: new Date("2026-09-21T10:00:00.000Z"),
      contributionId,
      contributionState: "removed",
      discussionState: "closed",
      contributorUserId: member.userId,
      membershipId: "00000000-0000-4000-8000-000000000484",
      membershipState: "active",
      journalTitle: "Томати після спеки",
      journalExcerpt: "Листя   скрутилося\n\nпісля спеки.",
      publicSlug: "tomaty-pislia-speky",
      entryNumber: 3,
      objectDisplayName: "Томат",
      objectKind: "plant",
      authorHandle: "demo_olena",
      authorDisplayName: "Олена",
      addressHandle: "demo_olena",
    };
    const answers = {
      community: [communityRow()],
      moderator: [{ id: "assignment" }],
      "queue:resolved": [
        decided,
        // A row the page could not word is left out, not shown as blank.
        {
          ...decided,
          reportId: "00000000-0000-4000-8000-000000000585",
          reportReason: "not-a-reason",
        },
      ],
      counts: [{ open: "2", resolved: "5" }],
    };

    const log: string[] = [];
    const queue = await repository.listCommunityModerationQueue(
      moderator,
      communitySlug,
      { view: "resolved" },
      scriptedDb(statements, answers, log),
    );
    expect(queue.view).toBe("resolved");
    // Postgres counts arrive as strings; the filter labels need numbers.
    expect(queue.counts).toEqual({ open: 2, resolved: 5 });
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({
      reportId,
      reportState: "actioned",
      contributionState: "removed",
      membershipState: "active",
      journalExcerpt: "Листя скрутилося після спеки.",
      objectKind: "plant",
    });
    // Access is decided before a single report is read.
    expect(log.slice(0, 2)).toEqual(["community", "moderator"]);
    expect([...log.slice(2)].sort()).toEqual(["counts", "queue:resolved"]);

    // Anything but "resolved" is the work queue.
    const openLog: string[] = [];
    await expect(
      repository.listCommunityModerationQueue(
        moderator,
        communitySlug,
        {},
        scriptedDb(statements, answers, openLog),
      ),
    ).resolves.toMatchObject({ view: "open", items: [] });
    expect(openLog).toContain("queue:open");

    // Neither an assignment nor the operator: refused by name, and no report
    // — no excerpt of anybody's entry — was read.
    const deniedLog: string[] = [];
    await expect(
      refusalOf(
        repository.listCommunityModerationQueue(
          moderator,
          communitySlug,
          {},
          scriptedDb(statements, { ...answers, moderator: [] }, deniedLog),
        ),
      ),
    ).resolves.toBe("moderation_denied");
    expect(deniedLog).toEqual([
      "community",
      "moderator",
      "other:admin_user_roles",
    ]);

    // A report id that could not be one is answered without a statement.
    const reportLog: string[] = [];
    await expect(
      repository.readCommunityModerationReport(
        moderator,
        communitySlug,
        "not-a-report",
        scriptedDb(statements, answers, reportLog),
      ),
    ).resolves.toBeNull();
    expect(reportLog).toEqual([]);
  });

  /**
   * The owner's `operator:mutate` is read from the database. A read that
   * failed used to be taken for a "no", so a timeout told the owner they had
   * no access to a page they own; only a real refusal may say that now.
   */
  it("tells a failed role read from a refusal on the moderation pages (OVE-500)", async () => {
    const repository = await import("./community-repository");
    const statements = {
      community: repository
        .buildCommunityLookupQuery(testDb, communitySlug)
        .compile().sql,
      moderator: repository
        .buildCommunityModeratorAccessQuery(testDb, moderator, communityId)
        .compile().sql,
    };
    const failure = new Error(
      "Connection terminated due to connection timeout",
    );
    // Nobody assigned this reader to the community, so the operator's role
    // decides — and its read fails.
    const failing = {
      community: [communityRow()],
      moderator: [],
      "other:admin_user_roles": failure,
    };

    // The failure itself reaches the page, which offers a retry.
    await expect(
      repository.listModeratedCommunities(
        moderator,
        scriptedDb(statements, failing, []),
      ),
    ).rejects.toBe(failure);
    const queueLog: string[] = [];
    await expect(
      repository.listCommunityModerationQueue(
        moderator,
        communitySlug,
        {},
        scriptedDb(statements, failing, queueLog),
      ),
    ).rejects.toBe(failure);
    // …and no report was read on the way.
    expect(queueLog).toEqual([
      "community",
      "moderator",
      "other:admin_user_roles",
    ]);

    // A role read that finds no role ends in the admin module's own
    // `AdminAccessDeniedError`: a refusal, as before — the list is "no
    // access", and the queue is refused by name.
    const refusing = { ...failing, "other:admin_user_roles": [] };
    await expect(
      repository.listModeratedCommunities(
        moderator,
        scriptedDb(statements, refusing, []),
      ),
    ).resolves.toBeNull();
    await expect(
      refusalOf(
        repository.listCommunityModerationQueue(
          moderator,
          communitySlug,
          {},
          scriptedDb(statements, refusing, []),
        ),
      ),
    ).resolves.toBe("moderation_denied");

    // Refused as the operator, a moderator still gets their own communities,
    // with the work waiting in each.
    const assignedLog: string[] = [];
    await expect(
      repository.listModeratedCommunities(
        moderator,
        scriptedDb(
          statements,
          {
            ...refusing,
            "other:communities": [
              {
                ...communityRow(),
                openReportCount: "3",
              },
            ],
          },
          assignedLog,
        ),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: communityId,
        participationState: "open",
        openReportCount: 3,
      }),
    ]);
    expect(assignedLog).toEqual([
      "other:admin_user_roles",
      "other:communities",
    ]);
  });

  it("keeps a member's view of the community when the moderator check fails (OVE-500)", async () => {
    const repository = await import("./community-repository");
    // The public page reads as the member, so each statement is named by the
    // builder compiled with that member's scope.
    const statements = {
      community: repository
        .buildCommunityLookupQuery(testDb, communitySlug, member)
        .compile().sql,
      membership: repository
        .buildCommunityMembershipStateQuery(testDb, member, communityId)
        .compile().sql,
      moderator: repository
        .buildCommunityModeratorAccessQuery(testDb, member, communityId)
        .compile().sql,
    };
    const answers = {
      community: [communityRow()],
      membership: [{ id: "membership", membership_state: "active" }],
      moderator: [],
      "other:admin_user_roles": new Error(
        "Connection terminated due to connection timeout",
      ),
    };
    const read = (
      script: Record<string, readonly unknown[] | Error>,
      log: string[],
    ) =>
      repository.getPublicCommunityPage(communitySlug, "uk", {
        viewerScope: member,
        executor: scriptedDb(statements, script, log),
      });

    // The moderation link is a courtesy: a failed read hides it, and the
    // member still reads the community as a member.
    const log: string[] = [];
    const page = await read(answers, log);
    expect(page?.viewer).toMatchObject({
      membershipState: "active",
      isModerator: false,
    });
    expect(page?.slug).toBe(communitySlug);
    // The failing path really ran: no assignment, then the role read.
    expect(log).toEqual(
      expect.arrayContaining(["moderator", "other:admin_user_roles"]),
    );

    // An assigned moderator is offered the way in, with no role read at all.
    const assignedLog: string[] = [];
    const assigned = await read(
      { ...answers, moderator: [{ id: "assignment" }] },
      assignedLog,
    );
    expect(assigned?.viewer.isModerator).toBe(true);
    expect(assignedLog).not.toContain("other:admin_user_roles");
  });

  it("exposes the complete guest, member, safety, and moderator service boundary", async () => {
    const repository = await import("./community-repository");
    for (const operation of [
      repository.listPublicCommunities,
      repository.getPublicCommunityPage,
      repository.hasReadyCommunityNavigation,
      repository.readCommunityWritingContext,
      repository.setCommunityMembership,
      repository.contributePublicJournalToCommunity,
      repository.reportCommunityContribution,
      repository.blockCommunityContributionAuthor,
      repository.communityMutationRefusal,
      repository.CommunityMutationError,
      repository.listModeratedCommunities,
      repository.listCommunityModerationQueue,
      repository.readCommunityModerationReport,
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
