import "server-only";

import { sql, type Kysely, type RawBuilder, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CommunityContributionState,
  CommunityDiscussionState,
  CommunityMembershipState,
  CommunityModerationAction,
  CommunityModerationReason,
  CommunityModerationTargetKind,
  CommunityReportReason,
  CommunityReportState,
  CommunityParticipationState,
  Database,
  PlantObjectKind,
} from "@/db/schema";
import {
  publicJournalEntryPath,
  publicLineageObjectPath,
  publicProfilePath,
} from "@/lib/garden/public-paths";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { getPublicDerivativeUrl } from "@/lib/storage";
import { blockProfile } from "@/server/profile-interaction-repository";
import type { RequestScope } from "@/server/request-scope";
import { sanitizePreciseLocationSearchQuery } from "@/lib/privacy/precise-location-text";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const COMMUNITY_PAGE_SIZE = 12;
const MAX_COMMUNITY_PAGE_SIZE = 30;
const MAX_COMMUNITY_SEARCH_LENGTH = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

export type CommunityObjectKind = "all" | PlantObjectKind;

export interface CommunityContributionCursor {
  addedAt: Date | string;
  id: string;
}

export interface CommunityReadinessRow {
  lifecycleState: string;
  participationState: string;
  topicTrustState: string;
  activeRuleCount: number | string | bigint;
  activeModeratorCount: number | string | bigint;
  activeContributionCount: number | string | bigint;
  minimumReadyContributions: number | string | bigint;
}

export interface PublicCommunityContributionQueryInput {
  communityId: string;
  viewerScope: RequestScope | null;
  query?: string | null;
  kind?: CommunityObjectKind;
  limit?: number;
  cursor?: CommunityContributionCursor | null;
}

export interface CommunityModerationAuditInput {
  communityId: string;
  targetKind: CommunityModerationTargetKind;
  targetId: string;
  action: CommunityModerationAction;
  reason: CommunityModerationReason;
  previousState: string;
  newState: string;
  now?: Date;
}

export interface PublicCommunityContributionRow {
  contributionId: string;
  addedAt: Date | string;
  discussionState: string;
  entryId: string;
  publicSlug: string | null;
  title: string;
  body: string;
  entryDate: Date | string;
  publishedAt: Date | string | null;
  ownerUserId: string;
  objectId: string;
  objectDisplayName: string;
  objectKind: string;
  authorHandle: string | null;
  authorDisplayName: string | null;
  coverDerivativeKey: string | null;
  coverFocalX: number | null;
  coverFocalY: number | null;
  coverIntrinsicWidth: number | null;
  coverIntrinsicHeight: number | null;
  viewerReportState: string | null;
}

export interface PublicCommunityContribution {
  id: string;
  href: string;
  title: string;
  excerpt: string;
  entryDate: Date | string;
  publishedAt: Date | string;
  addedAt: Date | string;
  discussionState: CommunityDiscussionState;
  author: {
    handle: string;
    label: string;
    href: string;
  } | null;
  object: {
    id: string;
    displayName: string;
    kind: PlantObjectKind;
    href: string;
  };
  coverUrl: string | null;
  coverFocalX: number | null;
  coverFocalY: number | null;
  coverIntrinsicWidth: number | null;
  coverIntrinsicHeight: number | null;
  viewerReportState: Extract<
    CommunityReportState,
    "submitted" | "reviewed"
  > | null;
}

export interface PublicCommunityContributionPage {
  items: PublicCommunityContribution[];
  nextCursor: string | null;
}

export interface PublicCommunityDirectoryItem {
  id: string;
  slug: string;
  contentKey: string;
  topicSlug: string;
  lifecycleState: string;
  participationState: string;
  navigationReady: boolean;
  activeMemberCount: number;
  activeContributionCount: number;
  activeObjectCount: number;
  coverUrl: string | null;
  coverFocalX: number | null;
  coverFocalY: number | null;
  coverIntrinsicWidth: number | null;
  coverIntrinsicHeight: number | null;
}

export interface PublicCommunityPageModel extends PublicCommunityDirectoryItem {
  rules: { id: string; key: string; order: number }[];
  contributions: PublicCommunityContributionPage;
  viewer: {
    membershipState: CommunityMembershipState | null;
    isModerator: boolean;
    eligibleJournals: CommunityContributionCandidate[];
  };
}

export interface CommunityContributionCandidate {
  id: string;
  title: string;
  entryDate: Date | string;
  publicSlug: string;
  objectDisplayName: string;
  objectKind: PlantObjectKind;
}

export interface CommunityModerationQueueItem {
  reportId: string;
  reportReason: CommunityReportReason;
  reportState: string;
  reportedAt: Date | string;
  contributionId: string;
  contributionState: string;
  discussionState: string;
  contributorUserId: string;
  membershipId: string;
  journalTitle: string | null;
  publicSlug: string | null;
  authorHandle: string | null;
}

export async function listPublicCommunities(
  viewerScope: RequestScope | null = null,
  executor: QueryExecutor = db,
): Promise<PublicCommunityDirectoryItem[]> {
  const rows = await executor
    .selectFrom("communities")
    .innerJoin(
      "journal_topics",
      "journal_topics.id",
      "communities.journal_topic_id",
    )
    .select([
      "communities.id",
      "communities.slug",
      "communities.content_key as contentKey",
      "communities.lifecycle_state as lifecycleState",
      "communities.participation_state as participationState",
      "journal_topics.slug as topicSlug",
      communityCoverDerivativeKey(viewerScope).as("coverDerivativeKey"),
      communityCoverFocalColumn("focal_x", viewerScope).as("coverFocalX"),
      communityCoverFocalColumn("focal_y", viewerScope).as("coverFocalY"),
      communityCoverFocalColumn("intrinsic_width", viewerScope).as(
        "coverIntrinsicWidth",
      ),
      communityCoverFocalColumn("intrinsic_height", viewerScope).as(
        "coverIntrinsicHeight",
      ),
    ])
    .where("communities.lifecycle_state", "in", ["active", "archived"])
    .where("journal_topics.trust_state", "=", "curated")
    .orderBy("communities.created_at", "asc")
    .limit(12)
    .execute();

  return Promise.all(
    rows.map(async (row) => {
      const [readiness, stats] = await Promise.all([
        buildCommunityReadinessQuery(executor, row.slug).executeTakeFirst(),
        buildCommunityStatsQuery(
          executor,
          row.id,
          viewerScope,
        ).executeTakeFirst(),
      ]);
      return {
        ...row,
        navigationReady: communityIsNavigationReady(readiness),
        activeMemberCount: Number(stats?.activeMemberCount ?? 0),
        activeContributionCount: Number(stats?.activeContributionCount ?? 0),
        activeObjectCount: Number(stats?.activeObjectCount ?? 0),
        coverUrl: row.coverDerivativeKey
          ? getPublicDerivativeUrl(row.coverDerivativeKey)
          : null,
        coverFocalX: row.coverDerivativeKey
          ? Number(row.coverFocalX ?? 0.5)
          : null,
        coverFocalY: row.coverDerivativeKey
          ? Number(row.coverFocalY ?? 0.5)
          : null,
        coverIntrinsicWidth: row.coverIntrinsicWidth ?? null,
        coverIntrinsicHeight: row.coverIntrinsicHeight ?? null,
      };
    }),
  );
}

export async function getPublicCommunityPage(
  slug: string,
  locale: PublicLocale,
  options: {
    viewerScope?: RequestScope | null;
    query?: string | null;
    kind?: CommunityObjectKind;
    cursor?: string | null;
    pageSize?: number;
    executor?: QueryExecutor;
    mediaUrlForKey?: (key: string) => string;
  } = {},
): Promise<PublicCommunityPageModel | null> {
  const executor = options.executor ?? db;
  const viewerScope = options.viewerScope ?? null;
  const community = await buildCommunityLookupQuery(
    executor,
    slug,
    viewerScope,
  ).executeTakeFirst();
  if (!community) return null;
  const cursor = options.cursor
    ? decodeCommunityContributionCursor(options.cursor)
    : null;
  const pageSize = normalizeRequestedPageSize(options.pageSize);

  const [rules, stats, readiness, contributionRows, membership, moderator] =
    await Promise.all([
      buildCommunityRulesQuery(executor, community.id).execute(),
      buildCommunityStatsQuery(
        executor,
        community.id,
        viewerScope,
      ).executeTakeFirst(),
      buildCommunityReadinessQuery(executor, community.slug).executeTakeFirst(),
      buildPublicCommunityContributionsQuery(executor, {
        communityId: community.id,
        viewerScope,
        query: options.query,
        kind: options.kind,
        limit: pageSize + 1,
        cursor,
      }).execute(),
      viewerScope
        ? buildCommunityMembershipStateQuery(
            executor,
            viewerScope,
            community.id,
          ).executeTakeFirst()
        : Promise.resolve(undefined),
      viewerScope
        ? buildCommunityModeratorAccessQuery(
            executor,
            viewerScope,
            community.id,
          ).executeTakeFirst()
        : Promise.resolve(undefined),
    ]);

  const membershipState = normalizeProjectedMembershipState(
    membership?.membership_state,
  );
  const eligibleRows =
    viewerScope &&
    membershipState === "active" &&
    community.lifecycleState === "active" &&
    community.participationState === "open"
      ? await buildEligibleCommunityContributionCandidatesQuery(
          executor,
          viewerScope,
          community.id,
        ).execute()
      : [];

  return {
    id: community.id,
    slug: community.slug,
    contentKey: community.contentKey,
    topicSlug: community.topicSlug,
    lifecycleState: community.lifecycleState,
    participationState: community.participationState,
    navigationReady: communityIsNavigationReady(readiness),
    activeMemberCount: Number(stats?.activeMemberCount ?? 0),
    activeContributionCount: Number(stats?.activeContributionCount ?? 0),
    activeObjectCount: Number(stats?.activeObjectCount ?? 0),
    coverUrl: community.coverDerivativeKey
      ? (options.mediaUrlForKey ?? getPublicDerivativeUrl)(
          community.coverDerivativeKey,
        )
      : null,
    coverFocalX: community.coverDerivativeKey
      ? Number(community.coverFocalX ?? 0.5)
      : null,
    coverFocalY: community.coverDerivativeKey
      ? Number(community.coverFocalY ?? 0.5)
      : null,
    coverIntrinsicWidth: community.coverIntrinsicWidth ?? null,
    coverIntrinsicHeight: community.coverIntrinsicHeight ?? null,
    rules: rules.map((rule) => ({
      id: rule.id,
      key: rule.ruleKey,
      order: rule.sortOrder,
    })),
    contributions: serializePublicCommunityContributionPage(
      contributionRows as PublicCommunityContributionRow[],
      locale,
      pageSize,
      options.mediaUrlForKey ?? getPublicDerivativeUrl,
    ),
    viewer: {
      membershipState,
      isModerator: Boolean(moderator),
      eligibleJournals: serializeContributionCandidates(eligibleRows),
    },
  };
}

export async function getPublicCommunityLifecycleLookup(
  slug: string,
  database: Kysely<Database> = db,
) {
  const row = await buildCommunityLifecycleLookupQuery(
    database,
    slug,
  ).executeTakeFirst();
  return row
    ? {
        status: "found" as const,
        communityId: row.id,
      }
    : { status: "not_found" as const };
}

export async function hasReadyCommunityNavigation(
  executor: QueryExecutor = db,
) {
  const rows = await executor
    .selectFrom("communities")
    .select("slug")
    .where("lifecycle_state", "=", "active")
    .where("participation_state", "=", "open")
    .orderBy("created_at", "asc")
    .limit(12)
    .execute();

  const readiness = await Promise.all(
    rows.map((row) =>
      buildCommunityReadinessQuery(executor, row.slug).executeTakeFirst(),
    ),
  );
  return readiness.some(communityIsNavigationReady);
}

export async function setCommunityMembership(
  scope: RequestScope,
  input: {
    slug: string;
    state: Exclude<CommunityMembershipState, "banned">;
  },
  database: Kysely<Database> = db,
) {
  return database.transaction().execute(async (trx) => {
    const community =
      input.state === "active"
        ? await requireMutableCommunity(trx, input.slug, {
            participationOpen: true,
          })
        : await requireExistingCommunity(trx, input.slug);
    const existing = await buildCommunityMembershipStateQuery(
      trx,
      scope,
      community.id,
    ).executeTakeFirst();
    if (existing?.membership_state === "banned") {
      throw new Error("Community membership is not available.");
    }
    const row = await buildUpsertCommunityMembershipQuery(trx, scope, {
      communityId: community.id,
      state: input.state,
    }).executeTakeFirst();
    if (!row) throw new Error("Community membership is not available.");
    return {
      community,
      state: normalizeProjectedMembershipState(row.membership_state)!,
    };
  });
}

export async function contributePublicJournalToCommunity(
  scope: RequestScope,
  input: { slug: string; journalEntryId: string },
  database: Kysely<Database> = db,
) {
  return database.transaction().execute(async (trx) => {
    const community = await requireMutableCommunity(trx, input.slug, {
      participationOpen: true,
    });
    const membership = await buildCommunityMembershipStateQuery(
      trx,
      scope,
      community.id,
    ).executeTakeFirst();
    if (membership?.membership_state !== "active") {
      throw new Error("An active community membership is required.");
    }
    const candidate = await buildEligibleCommunityContributionCandidatesQuery(
      trx,
      scope,
      community.id,
      input.journalEntryId,
    ).executeTakeFirst();
    if (!candidate) {
      throw new Error("Journal entry is not eligible for this community.");
    }
    const contribution = await buildInsertCommunityContributionQuery(
      trx,
      scope,
      {
        communityId: community.id,
        journalEntryId: candidate.id,
      },
    ).executeTakeFirst();
    if (!contribution) {
      throw new Error("Journal entry is already part of this community.");
    }
    return { community, contributionId: contribution.id };
  });
}

export async function reportCommunityContribution(
  scope: RequestScope,
  input: {
    slug: string;
    contributionId: string;
    reason: CommunityReportReason;
  },
  database: Kysely<Database> = db,
) {
  return database.transaction().execute(async (trx) => {
    const community = await requireExistingCommunity(trx, input.slug);
    const target = await buildCommunityReportTargetQuery(
      trx,
      scope,
      community.id,
      input.contributionId,
    ).executeTakeFirst();
    if (!target) throw new Error("Community contribution is not available.");
    const report = await buildReportCommunityContributionQuery(trx, scope, {
      contributionId: target.id,
      reason: input.reason,
    }).executeTakeFirstOrThrow();
    return { communityId: target.communityId, reportId: report.id };
  });
}

export async function blockCommunityContributionAuthor(
  scope: RequestScope,
  input: { slug: string; contributionId: string },
  database: Kysely<Database> = db,
) {
  const community = await requireExistingCommunity(database, input.slug);
  const target = await buildCommunityReportTargetQuery(
    database,
    scope,
    community.id,
    input.contributionId,
  ).executeTakeFirst();
  if (!target?.authorHandle) {
    throw new Error("Community contribution author is not available.");
  }
  const result = await blockProfile(scope, target.authorHandle, database);
  if (result !== "blocked") {
    throw new Error("Community contribution author is not available.");
  }
  return { communityId: target.communityId, authorHandle: target.authorHandle };
}

export async function listCommunityModerationQueue(
  scope: RequestScope,
  slug: string,
  executor: QueryExecutor = db,
): Promise<{
  community: Awaited<ReturnType<typeof requireExistingCommunity>>;
  items: CommunityModerationQueueItem[];
}> {
  const community = await requireExistingCommunity(executor, slug);
  await assertCommunityModerator(executor, scope, community.id);
  const rows = await buildCommunityModerationQueueQuery(
    executor,
    community.id,
  ).execute();
  return {
    community,
    items: rows.flatMap((row) => {
      const reason = normalizeCommunityReportReasonOrNull(row.reportReason);
      if (!reason) return [];
      return [{ ...row, reportReason: reason }];
    }),
  };
}

export async function moderateCommunityContribution(
  scope: RequestScope,
  input: {
    slug: string;
    contributionId: string;
    state: CommunityContributionState;
    reason: CommunityModerationReason;
  },
  database: Kysely<Database> = db,
) {
  return database.transaction().execute(async (trx) => {
    const community = await requireExistingCommunity(trx, input.slug);
    await assertCommunityModerator(trx, scope, community.id);
    const current = await buildCommunityContributionStateQuery(
      trx,
      community.id,
      input.contributionId,
    ).executeTakeFirst();
    if (!current) throw new Error("Community contribution is not available.");
    const next = normalizeContributionState(input.state);
    if (current.contribution_state === next) return { community, state: next };
    await buildModerateCommunityContributionQuery(trx, scope, {
      communityId: community.id,
      contributionId: current.id,
      state: next,
      reason: input.reason,
    }).executeTakeFirstOrThrow();
    await buildInsertCommunityModerationAuditQuery(trx, scope, {
      communityId: community.id,
      targetKind: "contribution",
      targetId: current.id,
      action:
        next === "removed" ? "remove_contribution" : "restore_contribution",
      reason: input.reason,
      previousState: current.contribution_state,
      newState: next,
    }).executeTakeFirstOrThrow();
    return { community, state: next };
  });
}

export async function moderateCommunityDiscussion(
  scope: RequestScope,
  input: {
    slug: string;
    contributionId: string;
    state: CommunityDiscussionState;
    reason: CommunityModerationReason;
  },
  database: Kysely<Database> = db,
) {
  return database.transaction().execute(async (trx) => {
    const community = await requireExistingCommunity(trx, input.slug);
    await assertCommunityModerator(trx, scope, community.id);
    const current = await buildCommunityContributionStateQuery(
      trx,
      community.id,
      input.contributionId,
    ).executeTakeFirst();
    if (!current) throw new Error("Community contribution is not available.");
    const next = normalizeDiscussionState(input.state);
    if (current.discussion_state === next) return { community, state: next };
    await buildModerateCommunityDiscussionQuery(trx, {
      communityId: community.id,
      contributionId: current.id,
      state: next,
    }).executeTakeFirstOrThrow();
    await buildInsertCommunityModerationAuditQuery(trx, scope, {
      communityId: community.id,
      targetKind: "contribution",
      targetId: current.id,
      action: next === "closed" ? "close_discussion" : "open_discussion",
      reason: input.reason,
      previousState: current.discussion_state,
      newState: next,
    }).executeTakeFirstOrThrow();
    return { community, state: next };
  });
}

export async function moderateCommunityMembership(
  scope: RequestScope,
  input: {
    slug: string;
    membershipId: string;
    state: Extract<CommunityMembershipState, "active" | "banned">;
    reason: CommunityModerationReason;
  },
  database: Kysely<Database> = db,
) {
  return database.transaction().execute(async (trx) => {
    const community = await requireExistingCommunity(trx, input.slug);
    await assertCommunityModerator(trx, scope, community.id);
    const current = await trx
      .selectFrom("community_memberships")
      .select(["id", "membership_state", "user_id"])
      .where("community_id", "=", community.id)
      .where("id", "=", normalizeUuid(input.membershipId, "Membership"))
      .executeTakeFirst();
    if (!current || current.user_id === scope.userId) {
      throw new Error("Community membership is not available.");
    }
    const next = normalizeModeratorMembershipState(input.state);
    if (current.membership_state === next) return { community, state: next };
    await buildModerateCommunityMembershipQuery(trx, {
      communityId: community.id,
      membershipId: current.id,
      state: next,
    }).executeTakeFirstOrThrow();
    await buildInsertCommunityModerationAuditQuery(trx, scope, {
      communityId: community.id,
      targetKind: "membership",
      targetId: current.id,
      action: next === "banned" ? "ban_member" : "restore_member",
      reason: input.reason,
      previousState: current.membership_state,
      newState: next,
    }).executeTakeFirstOrThrow();
    return { community, state: next };
  });
}

export async function resolveCommunityReport(
  scope: RequestScope,
  input: {
    slug: string;
    reportId: string;
    state: Extract<CommunityReportState, "dismissed" | "actioned">;
    reason: CommunityModerationReason;
  },
  database: Kysely<Database> = db,
) {
  return database.transaction().execute(async (trx) => {
    const community = await requireExistingCommunity(trx, input.slug);
    await assertCommunityModerator(trx, scope, community.id);
    const current = await trx
      .selectFrom("community_contribution_reports as reports")
      .innerJoin(
        "community_contributions as contributions",
        "contributions.id",
        "reports.contribution_id",
      )
      .select([
        "reports.id",
        "reports.report_state",
        "contributions.id as contributionId",
      ])
      .where("reports.id", "=", normalizeUuid(input.reportId, "Report"))
      .where("contributions.community_id", "=", community.id)
      .where("reports.report_state", "in", ["submitted", "reviewed"])
      .executeTakeFirst();
    if (!current) throw new Error("Community report is not available.");
    const next = normalizeResolvedReportState(input.state);
    await buildResolveCommunityReportQuery(trx, scope, {
      communityId: community.id,
      reportId: current.id,
      state: next,
    }).executeTakeFirstOrThrow();
    await buildInsertCommunityModerationAuditQuery(trx, scope, {
      communityId: community.id,
      targetKind: "report",
      targetId: current.id,
      action: next === "dismissed" ? "dismiss_report" : "action_report",
      reason: input.reason,
      previousState: current.report_state,
      newState: next,
    }).executeTakeFirstOrThrow();
    return { community, state: next };
  });
}

export async function setCommunityParticipation(
  scope: RequestScope,
  input: {
    slug: string;
    state: CommunityParticipationState;
    reason: CommunityModerationReason;
  },
  database: Kysely<Database> = db,
) {
  return database.transaction().execute(async (trx) => {
    const community = await requireExistingCommunity(trx, input.slug);
    await assertCommunityModerator(trx, scope, community.id);
    const next = normalizeParticipationState(input.state);
    if (community.participationState === next)
      return { community, state: next };
    await buildSetCommunityParticipationQuery(trx, {
      communityId: community.id,
      state: next,
    }).executeTakeFirstOrThrow();
    await buildInsertCommunityModerationAuditQuery(trx, scope, {
      communityId: community.id,
      targetKind: "community",
      targetId: community.id,
      action: next === "closed" ? "close_community" : "open_community",
      reason: input.reason,
      previousState: community.participationState,
      newState: next,
    }).executeTakeFirstOrThrow();
    return { community, state: next };
  });
}

export function buildCommunityReadinessQuery(
  executor: QueryExecutor,
  slug: string,
) {
  const normalizedSlug = normalizeCommunitySlug(slug);

  return executor
    .selectFrom("communities")
    .innerJoin(
      "journal_topics",
      "journal_topics.id",
      "communities.journal_topic_id",
    )
    .select([
      "communities.lifecycle_state as lifecycleState",
      "communities.participation_state as participationState",
      "communities.minimum_ready_contributions as minimumReadyContributions",
      "journal_topics.trust_state as topicTrustState",
      sql<number>`(
        select count(*)
        from community_rules
        where community_rules.community_id = communities.id
          and community_rules.rule_state = 'active'
      )`.as("activeRuleCount"),
      sql<number>`(
        select count(*)
        from community_moderators
        where community_moderators.community_id = communities.id
          and community_moderators.assignment_state = 'active'
          and community_moderators.revoked_at is null
      )`.as("activeModeratorCount"),
      sql<number>`(
        select count(distinct community_contributions.id)
        from community_contributions
        join journal_entries
          on journal_entries.id = community_contributions.journal_entry_id
        join user_handle_registry
          on user_handle_registry.user_id = journal_entries.owner_user_id
         and user_handle_registry.lifecycle_state = 'current'
        join user_public_profiles
          on user_public_profiles.user_id = user_handle_registry.user_id
         and user_public_profiles.normalized_handle = user_handle_registry.normalized_handle
         and user_public_profiles.profile_visibility = 'public'
         and user_public_profiles.profile_lifecycle_state = 'active'
         and user_public_profiles.removed_at is null
        join community_memberships
          on community_memberships.community_id = community_contributions.community_id
         and community_memberships.user_id = community_contributions.contributor_user_id
        where community_contributions.community_id = communities.id
          and community_contributions.contribution_state = 'active'
          and community_contributions.contributor_user_id = journal_entries.owner_user_id
          and community_memberships.membership_state != 'banned'
          and journal_entries.visibility = 'public'
          and journal_entries.lifecycle_state = 'active'
          and journal_entries.entry_scope = 'object'
          and journal_entries.public_gone_at is null
          and journal_entries.public_slug is not null
          and journal_entries.published_at is not null
      )`.as("activeContributionCount"),
    ])
    .where("communities.slug", "=", normalizedSlug)
    .where("communities.lifecycle_state", "=", "active")
    .where("communities.participation_state", "=", "open")
    .where("journal_topics.trust_state", "=", "curated")
    .limit(1);
}

export function serializePublicCommunityContributionPage(
  rows: readonly PublicCommunityContributionRow[],
  locale: PublicLocale,
  pageSize = COMMUNITY_PAGE_SIZE,
  mediaUrlForKey: (key: string) => string,
): PublicCommunityContributionPage {
  const normalizedPageSize = Math.min(
    Math.max(Math.floor(pageSize), 1),
    MAX_COMMUNITY_PAGE_SIZE,
  );
  const visibleRows = rows.slice(0, normalizedPageSize);
  const items = visibleRows.flatMap((row) => {
    const publicSlug = row.publicSlug?.trim();
    const publishedAt = row.publishedAt;
    const kind = normalizeProjectedObjectKind(row.objectKind);
    if (!publicSlug || !publishedAt || !kind) return [];
    const handle = normalizeProjectedHandle(row.authorHandle);

    return [
      {
        id: row.contributionId,
        href: localizedPath(locale, publicJournalEntryPath(publicSlug)),
        title: row.title,
        excerpt: publicExcerpt(row.body),
        entryDate: row.entryDate,
        publishedAt,
        addedAt: row.addedAt,
        discussionState: normalizeDiscussionState(row.discussionState),
        author: handle
          ? {
              handle,
              label: row.authorDisplayName?.trim() || `@${handle}`,
              href: publicProfilePath(locale, handle),
            }
          : null,
        object: {
          id: row.objectId,
          displayName: row.objectDisplayName,
          kind,
          href: publicLineageObjectPath(row.objectId),
        },
        coverUrl: row.coverDerivativeKey
          ? mediaUrlForKey(row.coverDerivativeKey)
          : null,
        coverFocalX: row.coverDerivativeKey
          ? Number(row.coverFocalX ?? 0.5)
          : null,
        coverFocalY: row.coverDerivativeKey
          ? Number(row.coverFocalY ?? 0.5)
          : null,
        coverIntrinsicWidth: row.coverIntrinsicWidth ?? null,
        coverIntrinsicHeight: row.coverIntrinsicHeight ?? null,
        viewerReportState: normalizeProjectedOpenReportState(
          row.viewerReportState,
        ),
      },
    ];
  });
  const hasMore = rows.length > normalizedPageSize;
  const anchor = hasMore ? visibleRows.at(-1) : null;

  return {
    items,
    nextCursor: anchor
      ? encodeCommunityContributionCursor({
          addedAt: toIsoDate(anchor.addedAt),
          id: anchor.contributionId,
        })
      : null,
  };
}

export function encodeCommunityContributionCursor(cursor: {
  addedAt: string;
  id: string;
}) {
  const normalized = validateSerializedCommunityCursor(cursor);
  if (!normalized) throw new Error("Community cursor is not available.");
  return Buffer.from(JSON.stringify(normalized), "utf8").toString("base64url");
}

export function decodeCommunityContributionCursor(value: string) {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    return validateSerializedCommunityCursor(parsed);
  } catch {
    return null;
  }
}

export function buildCommunityLookupQuery(
  executor: QueryExecutor,
  slug: string,
  viewerScope: RequestScope | null = null,
) {
  return executor
    .selectFrom("communities")
    .innerJoin(
      "journal_topics",
      "journal_topics.id",
      "communities.journal_topic_id",
    )
    .select([
      "communities.id",
      "communities.slug",
      "communities.content_key as contentKey",
      "communities.lifecycle_state as lifecycleState",
      "communities.participation_state as participationState",
      "communities.minimum_ready_contributions as minimumReadyContributions",
      "communities.created_at as createdAt",
      "communities.updated_at as updatedAt",
      "journal_topics.slug as topicSlug",
      "journal_topics.trust_state as topicTrustState",
      communityCoverDerivativeKey(viewerScope).as("coverDerivativeKey"),
      communityCoverFocalColumn("focal_x", viewerScope).as("coverFocalX"),
      communityCoverFocalColumn("focal_y", viewerScope).as("coverFocalY"),
      communityCoverFocalColumn("intrinsic_width", viewerScope).as(
        "coverIntrinsicWidth",
      ),
      communityCoverFocalColumn("intrinsic_height", viewerScope).as(
        "coverIntrinsicHeight",
      ),
    ])
    .where("communities.slug", "=", normalizeCommunitySlug(slug))
    .where("communities.lifecycle_state", "in", ["active", "archived"])
    .limit(1);
}

export function buildCommunityLifecycleLookupQuery(
  executor: QueryExecutor,
  slug: string,
) {
  return executor
    .selectFrom("communities")
    .select("id")
    .where("slug", "=", normalizeCommunitySlug(slug))
    .where("lifecycle_state", "in", ["active", "archived"])
    .limit(1);
}

export function buildCommunityRulesQuery(
  executor: QueryExecutor,
  communityId: string,
) {
  return executor
    .selectFrom("community_rules")
    .select(["id", "rule_key as ruleKey", "sort_order as sortOrder"])
    .where("community_id", "=", normalizeUuid(communityId, "Community"))
    .where("rule_state", "=", "active")
    .orderBy("sort_order", "asc")
    .orderBy("id", "asc")
    .limit(20);
}

export function buildCommunityStatsQuery(
  executor: QueryExecutor,
  communityId: string,
  viewerScope: RequestScope | null = null,
) {
  const normalizedCommunityId = normalizeUuid(communityId, "Community");
  const viewerPredicate = viewerScope
    ? sql`and ${noCommunityBlockPredicate(
        viewerScope.userId,
        "community_memberships.user_id",
      )}`
    : sql``;
  const contributionViewerPredicate = viewerScope
    ? sql`and ${noCommunityBlockPredicate(
        viewerScope.userId,
        "journal_entries.owner_user_id",
      )}`
    : sql``;

  return executor
    .selectFrom("community_memberships")
    .select([
      sql<number>`count(*) filter (
        where community_memberships.membership_state = 'active'
        ${viewerPredicate}
      )`.as("activeMemberCount"),
      sql<number>`(
        select count(distinct community_contributions.id)
        from community_contributions
        join journal_entries
          on journal_entries.id = community_contributions.journal_entry_id
        join user_handle_registry
          on user_handle_registry.user_id = journal_entries.owner_user_id
         and user_handle_registry.lifecycle_state = 'current'
        join user_public_profiles
          on user_public_profiles.user_id = user_handle_registry.user_id
         and user_public_profiles.normalized_handle = user_handle_registry.normalized_handle
         and user_public_profiles.profile_visibility = 'public'
         and user_public_profiles.profile_lifecycle_state = 'active'
         and user_public_profiles.removed_at is null
        join community_memberships as contribution_memberships
          on contribution_memberships.community_id = community_contributions.community_id
         and contribution_memberships.user_id = community_contributions.contributor_user_id
        where community_contributions.community_id = ${normalizedCommunityId}
          and community_contributions.contribution_state = 'active'
          and community_contributions.contributor_user_id = journal_entries.owner_user_id
          and contribution_memberships.membership_state != 'banned'
          and journal_entries.visibility = 'public'
          and journal_entries.lifecycle_state = 'active'
          and journal_entries.entry_scope = 'object'
          and journal_entries.public_gone_at is null
          and journal_entries.public_slug is not null
          and journal_entries.published_at is not null
          ${contributionViewerPredicate}
      )`.as("activeContributionCount"),
      sql<number>`(
        select count(distinct journal_entries.plant_object_id)
        from community_contributions
        join journal_entries
          on journal_entries.id = community_contributions.journal_entry_id
        join plant_objects
          on plant_objects.id = journal_entries.plant_object_id
         and plant_objects.owner_user_id = journal_entries.owner_user_id
        join user_handle_registry
          on user_handle_registry.user_id = journal_entries.owner_user_id
         and user_handle_registry.lifecycle_state = 'current'
        join user_public_profiles
          on user_public_profiles.user_id = user_handle_registry.user_id
         and user_public_profiles.normalized_handle = user_handle_registry.normalized_handle
         and user_public_profiles.profile_visibility = 'public'
         and user_public_profiles.profile_lifecycle_state = 'active'
         and user_public_profiles.removed_at is null
        join community_memberships as object_memberships
          on object_memberships.community_id = community_contributions.community_id
         and object_memberships.user_id = community_contributions.contributor_user_id
        where community_contributions.community_id = ${normalizedCommunityId}
          and community_contributions.contribution_state = 'active'
          and community_contributions.contributor_user_id = journal_entries.owner_user_id
          and object_memberships.membership_state != 'banned'
          and journal_entries.visibility = 'public'
          and journal_entries.lifecycle_state = 'active'
          and journal_entries.entry_scope = 'object'
          and journal_entries.public_gone_at is null
          and journal_entries.public_slug is not null
          and journal_entries.published_at is not null
          ${contributionViewerPredicate}
      )`.as("activeObjectCount"),
    ])
    .where("community_memberships.community_id", "=", normalizedCommunityId);
}

export function communityIsNavigationReady(
  row: CommunityReadinessRow | null | undefined,
) {
  if (!row) return false;
  return (
    row.lifecycleState === "active" &&
    row.participationState === "open" &&
    row.topicTrustState === "curated" &&
    Number(row.activeRuleCount) > 0 &&
    Number(row.activeModeratorCount) > 0 &&
    Number(row.activeContributionCount) >= Number(row.minimumReadyContributions)
  );
}

export function buildPublicCommunityContributionsQuery(
  executor: QueryExecutor,
  input: PublicCommunityContributionQueryInput,
) {
  const communityId = normalizeUuid(input.communityId, "Community");
  const queryText = normalizeCommunitySearch(input.query);
  const kind = normalizeCommunityObjectKind(input.kind);
  const cursor = normalizeCommunityCursor(input.cursor);
  const viewer = input.viewerScope;
  const viewerReportState = viewer
    ? sql<string | null>`(
        select community_contribution_reports.report_state
        from community_contribution_reports
        where community_contribution_reports.contribution_id = community_contributions.id
          and community_contribution_reports.reporter_user_id = ${viewer.userId}
          and community_contribution_reports.report_state in ('submitted', 'reviewed')
        order by community_contribution_reports.updated_at desc
        limit 1
      )`
    : sql<string | null>`null`;

  let query = executor
    .selectFrom("community_contributions")
    .innerJoin(
      "communities",
      "communities.id",
      "community_contributions.community_id",
    )
    .innerJoin(
      "journal_entries",
      "journal_entries.id",
      "community_contributions.journal_entry_id",
    )
    .innerJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .innerJoin("community_memberships", (join) =>
      join
        .onRef(
          "community_memberships.community_id",
          "=",
          "community_contributions.community_id",
        )
        .onRef(
          "community_memberships.user_id",
          "=",
          "community_contributions.contributor_user_id",
        ),
    )
    .innerJoin("user_handle_registry", (join) =>
      join
        .onRef(
          "user_handle_registry.user_id",
          "=",
          "journal_entries.owner_user_id",
        )
        .on("user_handle_registry.lifecycle_state", "=", "current"),
    )
    .innerJoin("user_public_profiles", (join) =>
      join
        .onRef(
          "user_public_profiles.user_id",
          "=",
          "user_handle_registry.user_id",
        )
        .onRef(
          "user_public_profiles.normalized_handle",
          "=",
          "user_handle_registry.normalized_handle",
        )
        .on("user_public_profiles.profile_visibility", "=", "public")
        .on("user_public_profiles.profile_lifecycle_state", "=", "active")
        .on("user_public_profiles.removed_at", "is", null),
    )
    .select([
      "community_contributions.id as contributionId",
      "community_contributions.added_at as addedAt",
      "community_contributions.discussion_state as discussionState",
      "journal_entries.id as entryId",
      "journal_entries.public_slug as publicSlug",
      "journal_entries.title as title",
      "journal_entries.body as body",
      "journal_entries.entry_date as entryDate",
      "journal_entries.published_at as publishedAt",
      "journal_entries.owner_user_id as ownerUserId",
      "plant_objects.id as objectId",
      "plant_objects.display_name as objectDisplayName",
      "plant_objects.object_kind as objectKind",
      "user_public_profiles.handle as authorHandle",
      "user_public_profiles.display_name as authorDisplayName",
      sql<string | null>`(
        select media_assets.derivative_key
        from media_assets
        where media_assets.journal_entry_id = journal_entries.id
          and media_assets.status = 'processed'
          and media_assets.derivative_key is not null
          and media_assets.revoked_at is null
          and media_assets.original_deleted_at is not null
          and (
            media_assets.id = journal_entries.cover_media_asset_id
            or media_assets.usage_role = 'inline'
          )
        order by
          case
            when media_assets.id = journal_entries.cover_media_asset_id then 0
            else 1
          end asc,
          media_assets.document_position asc nulls last,
          media_assets.id asc
        limit 1
      )`.as("coverDerivativeKey"),
      sql<number | null>`(
        select media_assets.focal_x
        from media_assets
        where media_assets.journal_entry_id = journal_entries.id
          and media_assets.status = 'processed'
          and media_assets.derivative_key is not null
          and media_assets.revoked_at is null
          and media_assets.original_deleted_at is not null
          and (
            media_assets.id = journal_entries.cover_media_asset_id
            or media_assets.usage_role = 'inline'
          )
        order by
          case
            when media_assets.id = journal_entries.cover_media_asset_id then 0
            else 1
          end asc,
          media_assets.document_position asc nulls last,
          media_assets.id asc
        limit 1
      )`.as("coverFocalX"),
      sql<number | null>`(
        select media_assets.focal_y
        from media_assets
        where media_assets.journal_entry_id = journal_entries.id
          and media_assets.status = 'processed'
          and media_assets.derivative_key is not null
          and media_assets.revoked_at is null
          and media_assets.original_deleted_at is not null
          and (
            media_assets.id = journal_entries.cover_media_asset_id
            or media_assets.usage_role = 'inline'
          )
        order by
          case
            when media_assets.id = journal_entries.cover_media_asset_id then 0
            else 1
          end asc,
          media_assets.document_position asc nulls last,
          media_assets.id asc
        limit 1
      )`.as("coverFocalY"),
      sql<number | null>`(
        select media_assets.intrinsic_width
        from media_assets
        where media_assets.journal_entry_id = journal_entries.id
          and media_assets.status = 'processed'
          and media_assets.derivative_key is not null
          and media_assets.revoked_at is null
          and media_assets.original_deleted_at is not null
          and (
            media_assets.id = journal_entries.cover_media_asset_id
            or media_assets.usage_role = 'inline'
          )
        order by
          case
            when media_assets.id = journal_entries.cover_media_asset_id then 0
            else 1
          end asc,
          media_assets.document_position asc nulls last,
          media_assets.id asc
        limit 1
      )`.as("coverIntrinsicWidth"),
      sql<number | null>`(
        select media_assets.intrinsic_height
        from media_assets
        where media_assets.journal_entry_id = journal_entries.id
          and media_assets.status = 'processed'
          and media_assets.derivative_key is not null
          and media_assets.revoked_at is null
          and media_assets.original_deleted_at is not null
          and (
            media_assets.id = journal_entries.cover_media_asset_id
            or media_assets.usage_role = 'inline'
          )
        order by
          case
            when media_assets.id = journal_entries.cover_media_asset_id then 0
            else 1
          end asc,
          media_assets.document_position asc nulls last,
          media_assets.id asc
        limit 1
      )`.as("coverIntrinsicHeight"),
      viewerReportState.as("viewerReportState"),
    ])
    .where("community_contributions.community_id", "=", communityId)
    .where("communities.lifecycle_state", "in", ["active", "archived"])
    .where("community_contributions.contribution_state", "=", "active")
    .whereRef(
      "community_contributions.contributor_user_id",
      "=",
      "journal_entries.owner_user_id",
    )
    .where("community_memberships.membership_state", "!=", "banned")
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
    .$if(Boolean(viewer), (qb) =>
      qb.where(
        noCommunityBlockPredicate(
          viewer!.userId,
          "journal_entries.owner_user_id",
        ),
      ),
    );

  if (kind !== "all") {
    query = query.where("plant_objects.object_kind", "=", kind);
  }
  if (queryText) {
    const pattern = `%${escapeLikePattern(queryText)}%`;
    query = query.where(({ or, eb }) =>
      or([
        eb("journal_entries.title", "ilike", pattern),
        eb("journal_entries.body", "ilike", pattern),
        eb("plant_objects.display_name", "ilike", pattern),
      ]),
    );
  }
  if (cursor) {
    query = query.where(({ or, and, eb }) =>
      or([
        eb("community_contributions.added_at", "<", cursor.addedAt),
        and([
          eb("community_contributions.added_at", "=", cursor.addedAt),
          eb("community_contributions.id", ">", cursor.id),
        ]),
      ]),
    );
  }

  return query
    .orderBy("community_contributions.added_at", "desc")
    .orderBy("community_contributions.id", "asc")
    .limit(normalizeCommunityLimit(input.limit));
}

export function buildCommunityMembershipStateQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  communityId: string,
) {
  return executor
    .selectFrom("community_memberships")
    .select(["id", "membership_state"])
    .where("community_id", "=", normalizeUuid(communityId, "Community"))
    .where("user_id", "=", scope.userId)
    .limit(1);
}

export function buildUpsertCommunityMembershipQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    communityId: string;
    state: Exclude<CommunityMembershipState, "banned">;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const state = normalizeSelfManagedMembershipState(input.state);

  return executor
    .insertInto("community_memberships")
    .values({
      community_id: normalizeUuid(input.communityId, "Community"),
      user_id: scope.userId,
      membership_state: state,
      joined_at: now,
      left_at: state === "left" ? now : null,
      banned_at: null,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc
        .columns(["community_id", "user_id"])
        .doUpdateSet({
          membership_state: state,
          left_at: state === "left" ? now : null,
          banned_at: null,
          updated_at: now,
        })
        .where("community_memberships.membership_state", "!=", "banned"),
    )
    .returning(["id", "membership_state"]);
}

export function buildEligibleCommunityContributionCandidatesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  communityId: string,
  journalEntryId?: string,
) {
  const normalizedCommunityId = normalizeUuid(communityId, "Community");
  const normalizedJournalEntryId = journalEntryId
    ? normalizeUuid(journalEntryId, "Journal entry")
    : null;

  return executor
    .selectFrom("journal_entries")
    .innerJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .innerJoin("user_public_profiles", (join) =>
      join
        .onRef(
          "user_public_profiles.user_id",
          "=",
          "journal_entries.owner_user_id",
        )
        .on("user_public_profiles.profile_visibility", "=", "public")
        .on("user_public_profiles.profile_lifecycle_state", "=", "active")
        .on("user_public_profiles.removed_at", "is", null),
    )
    .select([
      "journal_entries.id",
      "journal_entries.title",
      "journal_entries.entry_date as entryDate",
      "journal_entries.public_slug as publicSlug",
      "plant_objects.display_name as objectDisplayName",
      "plant_objects.object_kind as objectKind",
    ])
    .where("journal_entries.owner_user_id", "=", scope.userId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
    .$if(Boolean(normalizedJournalEntryId), (query) =>
      query.where("journal_entries.id", "=", normalizedJournalEntryId!),
    )
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("community_contributions")
            .select("community_contributions.id")
            .where(
              "community_contributions.community_id",
              "=",
              normalizedCommunityId,
            )
            .whereRef(
              "community_contributions.journal_entry_id",
              "=",
              "journal_entries.id",
            ),
        ),
      ),
    )
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.id", "asc")
    .limit(30);
}

export function buildCommunityContributionStateQuery(
  executor: QueryExecutor,
  communityId: string,
  contributionId: string,
) {
  return executor
    .selectFrom("community_contributions")
    .select(["id", "contribution_state", "discussion_state"])
    .where("community_id", "=", normalizeUuid(communityId, "Community"))
    .where("id", "=", normalizeUuid(contributionId, "Contribution"))
    .limit(1);
}

export function buildInsertCommunityContributionQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: { communityId: string; journalEntryId: string; now?: Date },
) {
  const now = input.now ?? new Date();

  return executor
    .insertInto("community_contributions")
    .values({
      community_id: normalizeUuid(input.communityId, "Community"),
      journal_entry_id: normalizeUuid(input.journalEntryId, "Journal entry"),
      contributor_user_id: scope.userId,
      contribution_state: "active",
      discussion_state: "open",
      removed_by_user_id: null,
      removal_reason: null,
      removed_at: null,
      added_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.columns(["community_id", "journal_entry_id"]).doNothing(),
    )
    .returning(["id", "contribution_state"]);
}

export function buildReportCommunityContributionQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    contributionId: string;
    reason: CommunityReportReason;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const reason = normalizeCommunityReportReason(input.reason);

  return executor
    .insertInto("community_contribution_reports")
    .values({
      contribution_id: normalizeUuid(input.contributionId, "Contribution"),
      reporter_user_id: scope.userId,
      report_reason: reason,
      report_state: "submitted",
      resolved_by_user_id: null,
      resolved_at: null,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.columns(["reporter_user_id", "contribution_id"]).doUpdateSet({
        report_reason: reason,
        report_state: "submitted",
        resolved_by_user_id: null,
        resolved_at: null,
        updated_at: now,
      }),
    )
    .returning("id");
}

export function buildCommunityReportTargetQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  communityId: string,
  contributionId: string,
) {
  return executor
    .selectFrom("community_contributions")
    .innerJoin(
      "communities",
      "communities.id",
      "community_contributions.community_id",
    )
    .innerJoin(
      "journal_entries",
      "journal_entries.id",
      "community_contributions.journal_entry_id",
    )
    .innerJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .innerJoin("community_memberships", (join) =>
      join
        .onRef(
          "community_memberships.community_id",
          "=",
          "community_contributions.community_id",
        )
        .onRef(
          "community_memberships.user_id",
          "=",
          "community_contributions.contributor_user_id",
        ),
    )
    .innerJoin("user_public_profiles", (join) =>
      join
        .onRef(
          "user_public_profiles.user_id",
          "=",
          "journal_entries.owner_user_id",
        )
        .on("user_public_profiles.profile_visibility", "=", "public")
        .on("user_public_profiles.profile_lifecycle_state", "=", "active")
        .on("user_public_profiles.removed_at", "is", null),
    )
    .select([
      "community_contributions.id",
      "community_contributions.community_id as communityId",
      "journal_entries.owner_user_id as ownerUserId",
      "user_public_profiles.handle as authorHandle",
    ])
    .where(
      "community_contributions.id",
      "=",
      normalizeUuid(contributionId, "Contribution"),
    )
    .where(
      "community_contributions.community_id",
      "=",
      normalizeUuid(communityId, "Community"),
    )
    .where("communities.lifecycle_state", "in", ["active", "archived"])
    .where("community_contributions.contribution_state", "=", "active")
    .whereRef(
      "community_contributions.contributor_user_id",
      "=",
      "journal_entries.owner_user_id",
    )
    .where("community_memberships.membership_state", "!=", "banned")
    .where("journal_entries.owner_user_id", "!=", scope.userId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
    .where(
      noCommunityBlockPredicate(scope.userId, "journal_entries.owner_user_id"),
    )
    .limit(1);
}

export function buildCommunityModeratorAccessQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  communityId: string,
) {
  return executor
    .selectFrom("community_moderators")
    .select("id")
    .where("community_id", "=", normalizeUuid(communityId, "Community"))
    .where("user_id", "=", scope.userId)
    .where("assignment_state", "=", "active")
    .where("revoked_at", "is", null)
    .limit(1);
}

export function buildCommunityModerationQueueQuery(
  executor: QueryExecutor,
  communityId: string,
  limit = 40,
) {
  return executor
    .selectFrom("community_contribution_reports")
    .innerJoin(
      "community_contributions",
      "community_contributions.id",
      "community_contribution_reports.contribution_id",
    )
    .innerJoin("community_memberships", (join) =>
      join
        .onRef(
          "community_memberships.community_id",
          "=",
          "community_contributions.community_id",
        )
        .onRef(
          "community_memberships.user_id",
          "=",
          "community_contributions.contributor_user_id",
        ),
    )
    .leftJoin("journal_entries", (join) =>
      join
        .onRef(
          "journal_entries.id",
          "=",
          "community_contributions.journal_entry_id",
        )
        .on("journal_entries.visibility", "=", "public")
        .on("journal_entries.lifecycle_state", "=", "active")
        .on("journal_entries.public_gone_at", "is", null)
        .on("journal_entries.public_slug", "is not", null)
        .on("journal_entries.published_at", "is not", null),
    )
    .leftJoin("user_handle_registry as contributor_handles", (join) =>
      join
        .onRef(
          "contributor_handles.user_id",
          "=",
          "community_contributions.contributor_user_id",
        )
        .on("contributor_handles.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_public_profiles", (join) =>
      join
        .onRef(
          "user_public_profiles.user_id",
          "=",
          "contributor_handles.user_id",
        )
        .onRef(
          "user_public_profiles.normalized_handle",
          "=",
          "contributor_handles.normalized_handle",
        )
        .on("user_public_profiles.profile_visibility", "=", "public")
        .on("user_public_profiles.profile_lifecycle_state", "=", "active")
        .on("user_public_profiles.removed_at", "is", null),
    )
    .select([
      "community_contribution_reports.id as reportId",
      "community_contribution_reports.report_reason as reportReason",
      "community_contribution_reports.report_state as reportState",
      "community_contribution_reports.created_at as reportedAt",
      "community_contributions.id as contributionId",
      "community_contributions.contribution_state as contributionState",
      "community_contributions.discussion_state as discussionState",
      "community_contributions.contributor_user_id as contributorUserId",
      "community_memberships.id as membershipId",
      "journal_entries.title as journalTitle",
      "journal_entries.public_slug as publicSlug",
      "user_public_profiles.handle as authorHandle",
    ])
    .where(
      "community_contributions.community_id",
      "=",
      normalizeUuid(communityId, "Community"),
    )
    .where("community_contribution_reports.report_state", "in", [
      "submitted",
      "reviewed",
    ])
    .orderBy("community_contribution_reports.created_at", "asc")
    .orderBy("community_contribution_reports.id", "asc")
    .limit(Math.min(Math.max(limit, 1), 100));
}

export function buildModerateCommunityContributionQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    communityId: string;
    contributionId: string;
    state: CommunityContributionState;
    reason: CommunityModerationReason;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const state = normalizeContributionState(input.state);
  const reason = normalizeModerationReason(input.reason);

  return executor
    .updateTable("community_contributions")
    .set({
      contribution_state: state,
      removed_by_user_id: state === "removed" ? scope.userId : null,
      removal_reason: state === "removed" ? reason : null,
      removed_at: state === "removed" ? now : null,
      updated_at: now,
    })
    .where("community_id", "=", normalizeUuid(input.communityId, "Community"))
    .where("id", "=", normalizeUuid(input.contributionId, "Contribution"))
    .returning(["id", "contribution_state"]);
}

export function buildModerateCommunityDiscussionQuery(
  executor: QueryExecutor,
  input: {
    communityId: string;
    contributionId: string;
    state: CommunityDiscussionState;
    now?: Date;
  },
) {
  const state = normalizeDiscussionState(input.state);
  return executor
    .updateTable("community_contributions")
    .set({ discussion_state: state, updated_at: input.now ?? new Date() })
    .where("community_id", "=", normalizeUuid(input.communityId, "Community"))
    .where("id", "=", normalizeUuid(input.contributionId, "Contribution"))
    .returning(["id", "discussion_state"]);
}

export function buildModerateCommunityMembershipQuery(
  executor: QueryExecutor,
  input: {
    communityId: string;
    membershipId: string;
    state: Extract<CommunityMembershipState, "active" | "banned">;
    now?: Date;
  },
) {
  const state = normalizeModeratorMembershipState(input.state);
  const now = input.now ?? new Date();
  return executor
    .updateTable("community_memberships")
    .set({
      membership_state: state,
      left_at: null,
      banned_at: state === "banned" ? now : null,
      updated_at: now,
    })
    .where("community_id", "=", normalizeUuid(input.communityId, "Community"))
    .where("id", "=", normalizeUuid(input.membershipId, "Membership"))
    .returning(["id", "membership_state"]);
}

export function buildResolveCommunityReportQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    communityId: string;
    reportId: string;
    state: Extract<CommunityReportState, "dismissed" | "actioned">;
    now?: Date;
  },
) {
  const state = normalizeResolvedReportState(input.state);
  const now = input.now ?? new Date();
  return executor
    .updateTable("community_contribution_reports")
    .set({
      report_state: state,
      resolved_by_user_id: scope.userId,
      resolved_at: now,
      updated_at: now,
    })
    .where("id", "=", normalizeUuid(input.reportId, "Report"))
    .where(({ exists, selectFrom }) =>
      exists(
        selectFrom("community_contributions")
          .select("community_contributions.id")
          .whereRef(
            "community_contributions.id",
            "=",
            "community_contribution_reports.contribution_id",
          )
          .where(
            "community_contributions.community_id",
            "=",
            normalizeUuid(input.communityId, "Community"),
          ),
      ),
    )
    .where("report_state", "in", ["submitted", "reviewed"])
    .returning(["id", "report_state"]);
}

export function buildSetCommunityParticipationQuery(
  executor: QueryExecutor,
  input: {
    communityId: string;
    state: CommunityParticipationState;
    now?: Date;
  },
) {
  const state = normalizeParticipationState(input.state);
  return executor
    .updateTable("communities")
    .set({ participation_state: state, updated_at: input.now ?? new Date() })
    .where("id", "=", normalizeUuid(input.communityId, "Community"))
    .where("lifecycle_state", "=", "active")
    .returning(["id", "participation_state"]);
}

export function buildInsertCommunityModerationAuditQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: CommunityModerationAuditInput,
) {
  return executor
    .insertInto("community_moderation_audit_log")
    .values({
      community_id: normalizeUuid(input.communityId, "Community"),
      actor_user_id: scope.userId,
      target_kind: input.targetKind,
      target_id: normalizeUuid(input.targetId, "Moderation target"),
      action: input.action,
      reason: normalizeModerationReason(input.reason),
      previous_state: normalizeAuditState(input.previousState),
      new_state: normalizeAuditState(input.newState),
      created_at: input.now ?? new Date(),
    })
    .returning("id");
}

function noCommunityBlockPredicate(
  viewerUserId: string,
  actorRef: string,
): RawBuilder<boolean> {
  return sql<boolean>`not exists (
    select 1
    from profile_blocks
    where profile_blocks.block_state = 'active'
      and (
        (
          profile_blocks.blocker_user_id = ${viewerUserId}
          and profile_blocks.blocked_user_id = ${sql.ref(actorRef)}
        )
        or (
          profile_blocks.blocker_user_id = ${sql.ref(actorRef)}
          and profile_blocks.blocked_user_id = ${viewerUserId}
        )
      )
  )`;
}

function communityCoverDerivativeKey(viewerScope: RequestScope | null = null) {
  const viewerPredicate = viewerScope
    ? sql`and ${noCommunityBlockPredicate(
        viewerScope.userId,
        "cover_entries.owner_user_id",
      )}`
    : sql``;

  return sql<string | null>`(
    select cover_media.derivative_key
    from community_contributions as cover_contributions
    join community_memberships as cover_memberships
      on cover_memberships.community_id = cover_contributions.community_id
     and cover_memberships.user_id = cover_contributions.contributor_user_id
    join journal_entries as cover_entries
      on cover_entries.id = cover_contributions.journal_entry_id
    join user_handle_registry as cover_handles
      on cover_handles.user_id = cover_entries.owner_user_id
     and cover_handles.lifecycle_state = 'current'
    join user_public_profiles as cover_profiles
      on cover_profiles.user_id = cover_handles.user_id
     and cover_profiles.normalized_handle = cover_handles.normalized_handle
     and cover_profiles.profile_visibility = 'public'
     and cover_profiles.profile_lifecycle_state = 'active'
     and cover_profiles.removed_at is null
    join media_assets as cover_media
      on cover_media.journal_entry_id = cover_entries.id
    where cover_contributions.community_id = communities.id
      and cover_contributions.contribution_state = 'active'
      and cover_contributions.contributor_user_id = cover_entries.owner_user_id
      and cover_memberships.membership_state != 'banned'
      and cover_entries.visibility = 'public'
      and cover_entries.lifecycle_state = 'active'
      and cover_entries.entry_scope = 'object'
      and cover_entries.public_gone_at is null
      and cover_entries.public_slug is not null
      and cover_entries.published_at is not null
      and cover_media.status = 'processed'
      and cover_media.derivative_key is not null
      and cover_media.revoked_at is null
      and cover_media.original_deleted_at is not null
      ${viewerPredicate}
    order by cover_contributions.added_at asc, cover_media.created_at asc, cover_media.id asc
    limit 1
  )`;
}

function communityCoverFocalColumn(
  column: "focal_x" | "focal_y" | "intrinsic_width" | "intrinsic_height",
  viewerScope: RequestScope | null = null,
) {
  const viewerPredicate = viewerScope
    ? sql`and ${noCommunityBlockPredicate(
        viewerScope.userId,
        "cover_entries.owner_user_id",
      )}`
    : sql``;

  return sql<number | null>`(
    select cover_media.${sql.raw(column)}
    from community_contributions as cover_contributions
    join community_memberships as cover_memberships
      on cover_memberships.community_id = cover_contributions.community_id
     and cover_memberships.user_id = cover_contributions.contributor_user_id
    join journal_entries as cover_entries
      on cover_entries.id = cover_contributions.journal_entry_id
    join user_handle_registry as cover_handles
      on cover_handles.user_id = cover_entries.owner_user_id
     and cover_handles.lifecycle_state = 'current'
    join user_public_profiles as cover_profiles
      on cover_profiles.user_id = cover_handles.user_id
     and cover_profiles.normalized_handle = cover_handles.normalized_handle
     and cover_profiles.profile_visibility = 'public'
     and cover_profiles.profile_lifecycle_state = 'active'
     and cover_profiles.removed_at is null
    join media_assets as cover_media
      on cover_media.journal_entry_id = cover_entries.id
    where cover_contributions.community_id = communities.id
      and cover_contributions.contribution_state = 'active'
      and cover_contributions.contributor_user_id = cover_entries.owner_user_id
      and cover_memberships.membership_state != 'banned'
      and cover_entries.visibility = 'public'
      and cover_entries.lifecycle_state = 'active'
      and cover_entries.entry_scope = 'object'
      and cover_entries.public_gone_at is null
      and cover_entries.public_slug is not null
      and cover_entries.published_at is not null
      and cover_media.status = 'processed'
      and cover_media.derivative_key is not null
      and cover_media.revoked_at is null
      and cover_media.original_deleted_at is not null
      ${viewerPredicate}
    order by cover_contributions.added_at asc, cover_media.created_at asc, cover_media.id asc
    limit 1
  )`;
}

async function requireExistingCommunity(executor: QueryExecutor, slug: string) {
  const community = await buildCommunityLookupQuery(
    executor,
    slug,
  ).executeTakeFirst();
  if (!community) throw new Error("Community is not available.");
  return community;
}

async function requireMutableCommunity(
  executor: QueryExecutor,
  slug: string,
  options: { participationOpen?: boolean } = {},
) {
  const community = await requireExistingCommunity(executor, slug);
  if (
    community.lifecycleState !== "active" ||
    (options.participationOpen && community.participationState !== "open")
  ) {
    throw new Error("Community is not available.");
  }
  return community;
}

async function assertCommunityModerator(
  executor: QueryExecutor,
  scope: RequestScope,
  communityId: string,
) {
  const moderator = await buildCommunityModeratorAccessQuery(
    executor,
    scope,
    communityId,
  ).executeTakeFirst();
  if (!moderator) throw new Error("Community moderation is not available.");
}

function normalizeCommunitySlug(value: string) {
  const normalized = value.trim().toLocaleLowerCase("en");
  if (!SLUG_PATTERN.test(normalized)) {
    throw new Error("Community is not available.");
  }
  return normalized;
}

function normalizeUuid(value: string, label: string) {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${label} is not available.`);
  }
  return normalized;
}

function normalizeCommunitySearch(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  const bounded = normalized.slice(0, MAX_COMMUNITY_SEARCH_LENGTH).trimEnd();
  // OVE-234: a coordinate-bearing GET term is dropped, so it can never reach
  // the SQL predicate, the reflected input, or a query log.
  return sanitizePreciseLocationSearchQuery(bounded).query;
}

function normalizeCommunityObjectKind(
  value: CommunityObjectKind | undefined,
): CommunityObjectKind {
  return value === "plant" || value === "animal"
    ? value
    : "all";
}

function normalizeCommunityCursor(
  cursor: CommunityContributionCursor | null | undefined,
): { addedAt: Date; id: string } | null {
  if (!cursor) return null;
  const addedAt = new Date(cursor.addedAt);
  if (Number.isNaN(addedAt.getTime()) || !UUID_PATTERN.test(cursor.id)) {
    return null;
  }
  return { addedAt, id: cursor.id };
}

function normalizeCommunityLimit(value: number | undefined) {
  if (!Number.isInteger(value) || !value || value < 1) {
    return COMMUNITY_PAGE_SIZE + 1;
  }
  return Math.min(value, MAX_COMMUNITY_PAGE_SIZE);
}

function normalizeRequestedPageSize(value: number | undefined) {
  if (!Number.isInteger(value) || !value || value < 1) {
    return COMMUNITY_PAGE_SIZE;
  }
  return Math.min(value, MAX_COMMUNITY_PAGE_SIZE);
}

function normalizeProjectedMembershipState(
  value: string | null | undefined,
): CommunityMembershipState | null {
  if (value === "active" || value === "left" || value === "banned") {
    return value;
  }
  return null;
}

function serializeContributionCandidates(
  rows: readonly {
    id: string;
    title: string;
    entryDate: Date | string;
    publicSlug: string | null;
    objectDisplayName: string;
    objectKind: string;
  }[],
): CommunityContributionCandidate[] {
  return rows.flatMap((row) => {
    const publicSlug = row.publicSlug?.trim();
    const objectKind = normalizeProjectedObjectKind(row.objectKind);
    if (!publicSlug || !objectKind) return [];
    return [{ ...row, publicSlug, objectKind }];
  });
}

function normalizeSelfManagedMembershipState(value: string) {
  if (value !== "active" && value !== "left") {
    throw new Error("Community membership state is not available.");
  }
  return value;
}

function normalizeCommunityReportReason(value: string): CommunityReportReason {
  if (
    value === "spam" ||
    value === "harassment" ||
    value === "privacy" ||
    value === "misinformation" ||
    value === "off_topic" ||
    value === "other"
  ) {
    return value;
  }
  throw new Error("Community report reason is not available.");
}

function normalizeCommunityReportReasonOrNull(
  value: string,
): CommunityReportReason | null {
  try {
    return normalizeCommunityReportReason(value);
  } catch {
    return null;
  }
}

function normalizeProjectedOpenReportState(
  value: string | null | undefined,
): Extract<CommunityReportState, "submitted" | "reviewed"> | null {
  return value === "submitted" || value === "reviewed" ? value : null;
}

function normalizeModerationReason(value: string): CommunityModerationReason {
  return value === "rule_violation"
    ? value
    : normalizeCommunityReportReason(value);
}

function normalizeContributionState(value: string): CommunityContributionState {
  if (value === "active" || value === "removed") return value;
  throw new Error("Community contribution state is not available.");
}

function normalizeDiscussionState(value: string): CommunityDiscussionState {
  if (value === "open" || value === "closed") return value;
  throw new Error("Community discussion state is not available.");
}

function normalizeModeratorMembershipState(
  value: string,
): Extract<CommunityMembershipState, "active" | "banned"> {
  if (value === "active" || value === "banned") return value;
  throw new Error("Community membership state is not available.");
}

function normalizeResolvedReportState(
  value: string,
): Extract<CommunityReportState, "dismissed" | "actioned"> {
  if (value === "dismissed" || value === "actioned") return value;
  throw new Error("Community report state is not available.");
}

function normalizeParticipationState(
  value: string,
): CommunityParticipationState {
  if (value === "open" || value === "closed") return value;
  throw new Error("Community participation state is not available.");
}

function normalizeAuditState(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 40) {
    throw new Error("Community moderation state is not available.");
  }
  return normalized;
}

function normalizeProjectedObjectKind(value: string): PlantObjectKind | null {
  return value === "plant" || value === "animal"
    ? value
    : null;
}

function normalizeProjectedHandle(value: string | null) {
  const normalized = value?.trim().toLocaleLowerCase("en") ?? "";
  return /^[a-z0-9][a-z0-9_]{2,29}$/.test(normalized) ? normalized : null;
}

function publicExcerpt(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 320) return normalized;
  return `${normalized.slice(0, 319).trimEnd()}…`;
}

function validateSerializedCommunityCursor(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { addedAt?: unknown; id?: unknown };
  if (
    typeof candidate.addedAt !== "string" ||
    typeof candidate.id !== "string" ||
    !UUID_PATTERN.test(candidate.id)
  ) {
    return null;
  }
  const addedAt = new Date(candidate.addedAt);
  if (Number.isNaN(addedAt.getTime())) return null;
  return { addedAt: addedAt.toISOString(), id: candidate.id };
}

function toIsoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Community cursor is not available.");
  }
  return date.toISOString();
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export const communityRepository = {
  database: db,
};
