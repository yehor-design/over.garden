import { sql, type Kysely, type RawBuilder, type Transaction } from "kysely";

import type { Database } from "@/db/schema";
import {
  VISUAL_FIXTURE_MANIFEST,
  VISUAL_FIXTURE_NAMESPACE,
  type VisualFixtureManifest,
} from "@/lib/visual-fixtures/manifest";
import {
  evaluatePublicIdentity,
  IDENTITY_POLICY_VERSION,
  parsePublicHandleSyntax,
} from "@/server/identity-policy";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface VisualFixtureCounts {
  actors: number;
  profiles: number;
  profileFollows: number;
  profileBlocks: number;
  profileReports: number;
  engagementComments: number;
  engagementBookmarks: number;
  engagementFollows: number;
  engagementCommentReports: number;
  notificationReceipts: number;
  notificationPreferences: number;
  wishlistItems: number;
  spaces: number;
  catalogItems: number;
  catalogNames: number;
  objects: number;
  lineagePendingIdentities: number;
  lineageEdges: number;
  entries: number;
  objectMentions: number;
  topics: number;
  topicSignals: number;
  media: number;
  communities: number;
  communityRules: number;
  communityMemberships: number;
  communityModerators: number;
  communityContributions: number;
  communityReports: number;
  communityAuditEvents: number;
}

export interface VisualFixtureStatus {
  version: string;
  expected: VisualFixtureCounts;
  actual: VisualFixtureCounts;
  seeded: boolean;
}

export function buildVisualFixtureSeedQueries(
  executor: QueryExecutor,
  manifest: VisualFixtureManifest,
) {
  assertVisualFixtureIdentities(manifest);
  const actorIds = manifest.actors.map(({ id }) => id);
  const communityIds = manifest.communityEvidence.communities.map(
    ({ id }) => id,
  );
  const mediaCleanup = executor.deleteFrom("media_assets").where(
    "id",
    "in",
    manifest.media.map(({ id }) => id),
  );
  const objectMentionsCleanup = executor
    .deleteFrom("journal_entry_object_mentions")
    .where(
      "journal_entry_id",
      "in",
      manifest.entries.map(({ id }) => id),
    );
  const lineageAuditCleanup = executor
    .deleteFrom("lineage_provenance_edge_audit_events")
    .where(
      "edge_id",
      "in",
      manifest.lineageEvidence.edges.map(({ id }) => id),
    );
  const communityAuditCleanup = executor
    .deleteFrom("community_moderation_audit_log")
    .where("community_id", "in", communityIds)
    .where("actor_user_id", "in", actorIds);
  const communityReportsCleanup = executor
    .deleteFrom("community_contribution_reports")
    .where("reporter_user_id", "in", actorIds)
    .where(
      "contribution_id",
      "in",
      executor
        .selectFrom("community_contributions")
        .select("id")
        .where("community_id", "in", communityIds),
    );
  const communityContributionsCleanup = executor
    .deleteFrom("community_contributions")
    .where("community_id", "in", communityIds)
    .where("contributor_user_id", "in", actorIds);
  const communityMembershipsCleanup = executor
    .deleteFrom("community_memberships")
    .where("community_id", "in", communityIds)
    .where("user_id", "in", actorIds);
  const communityProfileBlocksCleanup = executor
    .deleteFrom("profile_blocks")
    .where("blocker_user_id", "in", actorIds)
    .where("blocked_user_id", "in", actorIds);

  const actors = executor
    .insertInto("user")
    .values(
      manifest.actors.map((actor) => ({
        id: actor.id,
        name: actor.displayName,
        email: actor.email,
        emailVerified: true,
        image: null,
        createdAt: actor.createdAt,
        updatedAt: actor.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        name: sql`excluded.name`,
        email: sql`excluded.email`,
        emailVerified: sql`excluded."emailVerified"`,
        image: sql`excluded.image`,
        updatedAt: sql`excluded."updatedAt"`,
      }),
    );

  const profileIdentityValues = sql.join(
    manifest.profiles.map(
      (profile) => sql`(${profile.userId}::uuid, ${profile.handle}::text)`,
    ),
  );
  const profileClaims = bindRawQuery(
    executor,
    sql`
    with requested(user_id, normalized_handle) as (
      values ${profileIdentityValues}
    ),
    provisioned as materialized (
      select
        requested.*,
        overgarden_provision_user_public_profile(requested.user_id)
          as provisioned_handle
      from requested
    ),
    retired as (
      update user_handle_registry registry
      set lifecycle_state = 'retired', retired_at = now()
      from provisioned
      where registry.user_id = provisioned.user_id
        and registry.lifecycle_state = 'current'
        and registry.normalized_handle <> provisioned.normalized_handle
      returning registry.user_id
    ),
    claimed as (
      insert into user_handle_registry (
        normalized_handle,
        user_id,
        lifecycle_state,
        claim_source,
        policy_version,
        claimed_at,
        next_rename_at,
        retired_at
      )
      select
        provisioned.normalized_handle,
        provisioned.user_id,
        'current',
        'custom',
        ${IDENTITY_POLICY_VERSION},
        now(),
        now() + interval '30 days',
        null
      from provisioned
      cross join (select count(*) from retired) retired_barrier
      on conflict (normalized_handle) do nothing
      returning user_id
    ),
    reviewed_existing_fixture_claims as (
      update user_handle_registry registry
      set policy_version = ${IDENTITY_POLICY_VERSION}
      from provisioned
      cross join (select count(*) from claimed) claimed_barrier
      where registry.normalized_handle = provisioned.normalized_handle
        and registry.user_id = provisioned.user_id
        and registry.lifecycle_state = 'current'
        and registry.policy_version <> ${IDENTITY_POLICY_VERSION}
      returning registry.user_id
    )
    update user_public_profiles profile
    set
      handle = provisioned.normalized_handle,
      normalized_handle = provisioned.normalized_handle,
      handle_changed_at = case
        when profile.normalized_handle <> provisioned.normalized_handle then now()
        else profile.handle_changed_at
      end,
      identity_policy_version = ${IDENTITY_POLICY_VERSION},
      updated_at = now()
    from provisioned
    where profile.user_id = provisioned.user_id
  `,
  );

  const profilePresentationValues = sql.join(
    manifest.profiles.map(
      (profile) => sql`(
        ${profile.userId}::uuid,
        ${profile.displayName}::text,
        ${profile.avatarMediaAssetId}::uuid,
        ${profile.bio}::text,
        ${[...profile.languages]}::text[],
        ${profile.locationVisibility}::text,
        ${profile.coarseRegionCode}::text,
        ${profile.profileVisibility}::text,
        ${profile.profileLifecycleState}::text,
        ${profile.relationshipVisibility}::text,
        ${profile.removedAt}::timestamptz,
        ${profile.createdAt}::timestamptz
      )`,
    ),
  );
  const profiles = bindRawQuery(
    executor,
    sql`
    update user_public_profiles profile
    set
      display_name = fixture.display_name,
      display_name_policy_version = case
        when fixture.display_name is null then null
        else ${IDENTITY_POLICY_VERSION}
      end,
      avatar_url = null,
      avatar_media_asset_id = fixture.avatar_media_asset_id,
      bio = fixture.bio,
      languages = fixture.languages,
      location_visibility = fixture.location_visibility,
      coarse_region_code = fixture.coarse_region_code,
      profile_visibility = fixture.profile_visibility,
      profile_lifecycle_state = fixture.profile_lifecycle_state,
      relationship_visibility = fixture.relationship_visibility,
      removed_at = fixture.removed_at,
      created_at = fixture.created_at,
      updated_at = fixture.created_at
    from (
      values ${profilePresentationValues}
    ) as fixture(
      user_id,
      display_name,
      avatar_media_asset_id,
      bio,
      languages,
      location_visibility,
      coarse_region_code,
      profile_visibility,
      profile_lifecycle_state,
      relationship_visibility,
      removed_at,
      created_at
    )
    where profile.user_id = fixture.user_id
  `,
  );

  const profileFollows = executor
    .insertInto("profile_follows")
    .values(
      manifest.profileFollows.map((follow) => ({
        id: follow.id,
        follower_user_id: follow.followerUserId,
        target_user_id: follow.targetUserId,
        follow_state: follow.state,
        created_at: follow.createdAt,
        updated_at: follow.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["follower_user_id", "target_user_id"]).doUpdateSet({
        follow_state: sql`excluded.follow_state`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const profileBlocks = executor
    .insertInto("profile_blocks")
    .values(
      manifest.profileBlocks.map((block) => ({
        id: block.id,
        blocker_user_id: block.blockerUserId,
        blocked_user_id: block.blockedUserId,
        block_state: block.state,
        created_at: block.createdAt,
        updated_at: block.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["blocker_user_id", "blocked_user_id"]).doUpdateSet({
        block_state: sql`excluded.block_state`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const profileReports = executor
    .insertInto("profile_reports")
    .values(
      manifest.profileReports.map((report) => ({
        id: report.id,
        reporter_user_id: report.reporterUserId,
        target_user_id: report.targetUserId,
        report_reason: report.reason,
        report_state: report.state,
        created_at: report.createdAt,
        updated_at: report.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["reporter_user_id", "target_user_id"]).doUpdateSet({
        report_reason: sql`excluded.report_reason`,
        report_state: sql`excluded.report_state`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const lineagePendingIdentities = executor
    .insertInto("lineage_pending_source_identities")
    .values(
      manifest.lineageEvidence.pendingIdentities.map((identity) => ({
        id: identity.id,
        created_by_user_id: identity.createdByUserId,
        display_label: identity.displayLabel,
        invite_state: "pending",
        claimed_by_user_id: null,
        claimed_at: null,
        created_at: identity.createdAt,
        updated_at: identity.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        created_by_user_id: sql`excluded.created_by_user_id`,
        display_label: sql`excluded.display_label`,
        invite_state: sql`excluded.invite_state`,
        claimed_by_user_id: null,
        claimed_at: null,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const spaces = executor
    .insertInto("spaces")
    .values(
      manifest.spaces.map((space) => ({
        id: space.id,
        owner_user_id: space.ownerUserId,
        display_name: space.displayName,
        location_visibility: space.locationVisibility,
        coarse_region_code: space.coarseRegionCode,
        created_at: space.createdAt,
        updated_at: space.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        owner_user_id: sql`excluded.owner_user_id`,
        display_name: sql`excluded.display_name`,
        location_visibility: sql`excluded.location_visibility`,
        coarse_region_code: sql`excluded.coarse_region_code`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const catalogItems = executor
    .insertInto("catalog_items")
    .values(
      manifest.catalogItems.map((item) => ({
        id: item.id,
        canonical_name: item.canonicalName,
        normalized_name: item.normalizedName,
        public_slug: item.publicSlug,
        catalog_kind: item.catalogKind,
        status: item.status,
        source: item.source,
        source_id: item.sourceId,
        locale: item.locale,
        created_by_user_id: null,
        merged_into_catalog_item_id: null,
        reviewed_by_user_id: null,
        reviewed_at: null,
        created_at: item.createdAt,
        updated_at: item.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        canonical_name: sql`excluded.canonical_name`,
        normalized_name: sql`excluded.normalized_name`,
        public_slug: sql`excluded.public_slug`,
        catalog_kind: sql`excluded.catalog_kind`,
        status: sql`excluded.status`,
        source: sql`excluded.source`,
        source_id: sql`excluded.source_id`,
        locale: sql`excluded.locale`,
        created_by_user_id: null,
        merged_into_catalog_item_id: null,
        reviewed_by_user_id: null,
        reviewed_at: null,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const catalogNames = executor
    .insertInto("catalog_item_names")
    .values(
      manifest.catalogNames.map((name) => ({
        id: name.id,
        catalog_item_id: name.catalogItemId,
        display_name: name.displayName,
        normalized_name: name.normalizedName,
        locale: name.locale,
        is_primary: name.isPrimary,
        created_at: name.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        catalog_item_id: sql`excluded.catalog_item_id`,
        display_name: sql`excluded.display_name`,
        normalized_name: sql`excluded.normalized_name`,
        locale: sql`excluded.locale`,
        is_primary: sql`excluded.is_primary`,
      }),
    );

  const objects = executor
    .insertInto("plant_objects")
    .values(
      manifest.objects.map((object) => ({
        id: object.id,
        owner_user_id: object.ownerUserId,
        space_id: object.spaceId,
        display_name: object.displayName,
        object_kind: object.objectKind,
        catalog_item_id: object.catalogItemId,
        variety_text: object.varietyText,
        variety_state: object.varietyState,
        location_visibility: object.locationVisibility,
        coarse_region_code: object.coarseRegionCode,
        created_at: object.createdAt,
        updated_at: object.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        owner_user_id: sql`excluded.owner_user_id`,
        space_id: sql`excluded.space_id`,
        display_name: sql`excluded.display_name`,
        object_kind: sql`excluded.object_kind`,
        catalog_item_id: sql`excluded.catalog_item_id`,
        variety_text: sql`excluded.variety_text`,
        variety_state: sql`excluded.variety_state`,
        location_visibility: sql`excluded.location_visibility`,
        coarse_region_code: sql`excluded.coarse_region_code`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const lineageEdges = executor
    .insertInto("lineage_provenance_edges")
    .values(
      manifest.lineageEvidence.edges.map((edge) => ({
        id: edge.id,
        owner_user_id: edge.ownerUserId,
        subject_plant_object_id: edge.subjectObjectId,
        source_kind: "pending_identity",
        source_plant_object_id: null,
        source_owner_user_id: null,
        source_pending_identity_id: edge.sourcePendingIdentityId,
        source_reference_kind: null,
        source_reference_label: null,
        edge_type: "provenance",
        consent_state: "proposed",
        visibility_policy: "owner_only_until_confirmed",
        erasure_state: "active",
        client_mutation_id: edge.clientMutationId,
        created_at: edge.createdAt,
        updated_at: edge.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        owner_user_id: sql`excluded.owner_user_id`,
        subject_plant_object_id: sql`excluded.subject_plant_object_id`,
        source_kind: sql`excluded.source_kind`,
        source_plant_object_id: null,
        source_owner_user_id: null,
        source_pending_identity_id: sql`excluded.source_pending_identity_id`,
        source_reference_kind: null,
        source_reference_label: null,
        edge_type: sql`excluded.edge_type`,
        consent_state: sql`excluded.consent_state`,
        visibility_policy: sql`excluded.visibility_policy`,
        erasure_state: sql`excluded.erasure_state`,
        client_mutation_id: sql`excluded.client_mutation_id`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const entries = executor
    .insertInto("journal_entries")
    .values(
      manifest.entries.map((entry) => ({
        id: entry.id,
        owner_user_id: entry.ownerUserId,
        space_id: entry.spaceId,
        plant_object_id: entry.objectId,
        title: entry.title,
        body: entry.body,
        entry_scope: entry.entryScope,
        entry_date: entry.entryDate,
        visibility: entry.visibility,
        lifecycle_state: entry.lifecycleState,
        content_class: "visual_fixture",
        source_language:
          entry.locale === "uk" || entry.locale === "bg" ? entry.locale : null,
        public_slug: entry.publicSlug,
        public_noindex: entry.publicNoindex,
        published_at: entry.publishedAt,
        archived_at: entry.archivedAt,
        public_gone_at: entry.publicGoneAt,
        first_publication_disclosure_version:
          entry.firstPublicationDisclosureVersion,
        first_publication_disclosed_at: entry.firstPublicationDisclosedAt,
        client_mutation_id: entry.clientMutationId,
        created_at: entry.createdAt,
        updated_at: entry.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        owner_user_id: sql`excluded.owner_user_id`,
        space_id: sql`excluded.space_id`,
        plant_object_id: sql`excluded.plant_object_id`,
        title: sql`excluded.title`,
        body: sql`excluded.body`,
        entry_scope: sql`excluded.entry_scope`,
        entry_date: sql`excluded.entry_date`,
        visibility: sql`excluded.visibility`,
        lifecycle_state: sql`excluded.lifecycle_state`,
        content_class: sql`excluded.content_class`,
        source_language: sql`excluded.source_language`,
        public_slug: sql`excluded.public_slug`,
        public_noindex: sql`excluded.public_noindex`,
        published_at: sql`excluded.published_at`,
        archived_at: sql`excluded.archived_at`,
        public_gone_at: sql`excluded.public_gone_at`,
        first_publication_disclosure_version: sql`excluded.first_publication_disclosure_version`,
        first_publication_disclosed_at: sql`excluded.first_publication_disclosed_at`,
        client_mutation_id: sql`excluded.client_mutation_id`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const objectMentions = executor
    .insertInto("journal_entry_object_mentions")
    .values(
      manifest.objectMentions.map((mention) => ({
        owner_user_id: mention.ownerUserId,
        space_id: mention.spaceId,
        journal_entry_id: mention.journalEntryId,
        plant_object_id: mention.objectId,
        created_at: mention.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["journal_entry_id", "plant_object_id"]).doUpdateSet({
        owner_user_id: sql`excluded.owner_user_id`,
        space_id: sql`excluded.space_id`,
      }),
    );

  const topics = executor
    .insertInto("journal_topics")
    .values(
      manifest.topics.map((topic) => ({
        id: topic.id,
        slug: topic.slug,
        label: topic.label,
        trust_state: topic.trustState,
        created_at: topic.createdAt,
        updated_at: topic.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        slug: sql`excluded.slug`,
        label: sql`excluded.label`,
        trust_state: sql`excluded.trust_state`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const communities = executor
    .insertInto("communities")
    .values(
      manifest.communityEvidence.communities.map((community) => ({
        id: community.id,
        slug: community.slug,
        content_key: community.contentKey,
        journal_topic_id: community.topicId,
        lifecycle_state: community.lifecycleState,
        participation_state: community.participationState,
        minimum_ready_contributions: community.minimumReadyContributions,
        created_at: community.createdAt,
        updated_at: community.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        slug: sql`excluded.slug`,
        content_key: sql`excluded.content_key`,
        journal_topic_id: sql`excluded.journal_topic_id`,
        lifecycle_state: sql`excluded.lifecycle_state`,
        participation_state: sql`excluded.participation_state`,
        minimum_ready_contributions: sql`excluded.minimum_ready_contributions`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const communityRules = executor
    .insertInto("community_rules")
    .values(
      manifest.communityEvidence.rules.map((rule) => ({
        id: rule.id,
        community_id: rule.communityId,
        rule_key: rule.key,
        sort_order: rule.order,
        rule_state: rule.state,
        created_at: rule.createdAt,
        updated_at: rule.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        community_id: sql`excluded.community_id`,
        rule_key: sql`excluded.rule_key`,
        sort_order: sql`excluded.sort_order`,
        rule_state: sql`excluded.rule_state`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const communityMemberships = executor
    .insertInto("community_memberships")
    .values(
      manifest.communityEvidence.memberships.map((membership) => ({
        id: membership.id,
        community_id: membership.communityId,
        user_id: membership.userId,
        membership_state: membership.state,
        joined_at: membership.joinedAt,
        left_at: membership.leftAt,
        banned_at: membership.bannedAt,
        updated_at: membership.joinedAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        community_id: sql`excluded.community_id`,
        user_id: sql`excluded.user_id`,
        membership_state: sql`excluded.membership_state`,
        joined_at: sql`excluded.joined_at`,
        left_at: sql`excluded.left_at`,
        banned_at: sql`excluded.banned_at`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const communityModerators = executor
    .insertInto("community_moderators")
    .values(
      manifest.communityEvidence.moderators.map((moderator) => ({
        id: moderator.id,
        community_id: moderator.communityId,
        user_id: moderator.userId,
        assignment_state: moderator.state,
        granted_by_user_id: moderator.grantedByUserId,
        granted_at: moderator.grantedAt,
        revoked_at: moderator.revokedAt,
        updated_at: moderator.grantedAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        community_id: sql`excluded.community_id`,
        user_id: sql`excluded.user_id`,
        assignment_state: sql`excluded.assignment_state`,
        granted_by_user_id: sql`excluded.granted_by_user_id`,
        granted_at: sql`excluded.granted_at`,
        revoked_at: sql`excluded.revoked_at`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const communityContributions = executor
    .insertInto("community_contributions")
    .values(
      manifest.communityEvidence.contributions.map((contribution) => ({
        id: contribution.id,
        community_id: contribution.communityId,
        journal_entry_id: contribution.journalEntryId,
        contributor_user_id: contribution.contributorUserId,
        contribution_state: contribution.state,
        discussion_state: contribution.discussionState,
        removed_by_user_id: contribution.removedByUserId,
        removal_reason: contribution.removalReason,
        added_at: contribution.addedAt,
        removed_at: contribution.removedAt,
        updated_at: contribution.addedAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        community_id: sql`excluded.community_id`,
        journal_entry_id: sql`excluded.journal_entry_id`,
        contributor_user_id: sql`excluded.contributor_user_id`,
        contribution_state: sql`excluded.contribution_state`,
        discussion_state: sql`excluded.discussion_state`,
        removed_by_user_id: sql`excluded.removed_by_user_id`,
        removal_reason: sql`excluded.removal_reason`,
        added_at: sql`excluded.added_at`,
        removed_at: sql`excluded.removed_at`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const communityReports = executor
    .insertInto("community_contribution_reports")
    .values(
      manifest.communityEvidence.reports.map((report) => ({
        id: report.id,
        contribution_id: report.contributionId,
        reporter_user_id: report.reporterUserId,
        report_reason: report.reason,
        report_state: report.state,
        resolved_by_user_id: report.resolvedByUserId,
        resolved_at: report.resolvedAt,
        created_at: report.createdAt,
        updated_at: report.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        contribution_id: sql`excluded.contribution_id`,
        reporter_user_id: sql`excluded.reporter_user_id`,
        report_reason: sql`excluded.report_reason`,
        report_state: sql`excluded.report_state`,
        resolved_by_user_id: sql`excluded.resolved_by_user_id`,
        resolved_at: sql`excluded.resolved_at`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const communityAuditEvents = executor
    .insertInto("community_moderation_audit_log")
    .values(
      manifest.communityEvidence.auditEvents.map((event) => ({
        id: event.id,
        community_id: event.communityId,
        actor_user_id: event.actorUserId,
        target_kind: event.targetKind,
        target_id: event.targetId,
        action: event.action,
        reason: event.reason,
        previous_state: event.previousState,
        new_state: event.newState,
        created_at: event.createdAt,
      })),
    )
    .onConflict((oc) => oc.column("id").doNothing());

  const topicSignals = executor
    .insertInto("journal_entry_topic_signals")
    .values(
      manifest.topicSignals.map((signal) => ({
        journal_entry_id: signal.journalEntryId,
        topic_id: signal.topicId,
        signal_source: signal.signalSource,
        review_state: signal.reviewState,
        public_membership_state: signal.publicMembershipState,
        created_at: signal.createdAt,
        updated_at: signal.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc
        .columns(["journal_entry_id", "topic_id", "signal_source"])
        .doUpdateSet({
          review_state: sql`excluded.review_state`,
          public_membership_state: sql`excluded.public_membership_state`,
          updated_at: sql`excluded.updated_at`,
        }),
    );

  const media = executor
    .insertInto("media_assets")
    .values(
      manifest.media.map((item) => ({
        id: item.id,
        owner_user_id: item.ownerUserId,
        journal_entry_id: item.entryId,
        quarantine_key: item.quarantineKey,
        derivative_key: item.derivativeKey,
        alt_text: item.altText,
        caption: item.caption,
        status: "processed",
        original_deleted_at: item.createdAt,
        upload_generation_id: item.id,
        public_object_id: item.id,
        upload_generation: 1,
        declared_media_type: "image/png",
        declared_size_bytes: 1,
        admitted_media_type: "image/png",
        media_readiness_state: "public_ready",
        created_at: item.createdAt,
        updated_at: item.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        owner_user_id: sql`excluded.owner_user_id`,
        journal_entry_id: sql`excluded.journal_entry_id`,
        quarantine_key: sql`excluded.quarantine_key`,
        derivative_key: sql`excluded.derivative_key`,
        alt_text: sql`excluded.alt_text`,
        caption: sql`excluded.caption`,
        status: sql`excluded.status`,
        original_deleted_at: sql`excluded.original_deleted_at`,
        upload_generation_id: sql`excluded.upload_generation_id`,
        public_object_id: sql`excluded.public_object_id`,
        upload_generation: sql`excluded.upload_generation`,
        declared_media_type: sql`excluded.declared_media_type`,
        declared_size_bytes: sql`excluded.declared_size_bytes`,
        admitted_media_type: sql`excluded.admitted_media_type`,
        media_readiness_state: sql`excluded.media_readiness_state`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const engagementComments = executor
    .insertInto("engagement_comments")
    .values(
      manifest.socialEvidence.comments.map((comment) => ({
        id: comment.id,
        target_kind: comment.targetKind,
        target_ref: comment.targetRef,
        author_user_id: comment.authorUserId,
        parent_comment_id: comment.parentCommentId,
        client_mutation_id: comment.clientMutationId,
        body: comment.body,
        comment_state: comment.state,
        created_at: comment.createdAt,
        updated_at: comment.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        target_kind: sql`excluded.target_kind`,
        target_ref: sql`excluded.target_ref`,
        author_user_id: sql`excluded.author_user_id`,
        parent_comment_id: sql`excluded.parent_comment_id`,
        client_mutation_id: sql`excluded.client_mutation_id`,
        body: sql`excluded.body`,
        comment_state: sql`excluded.comment_state`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const engagementBookmarks = executor
    .insertInto("engagement_bookmarks")
    .values(
      manifest.socialEvidence.bookmarks.map((bookmark) => ({
        id: bookmark.id,
        owner_user_id: bookmark.ownerUserId,
        target_kind: bookmark.targetKind,
        target_ref: bookmark.targetRef,
        bookmark_state: bookmark.state,
        created_at: bookmark.createdAt,
        updated_at: bookmark.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["owner_user_id", "target_kind", "target_ref"]).doUpdateSet({
        bookmark_state: sql`excluded.bookmark_state`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const engagementFollows = executor
    .insertInto("engagement_follows")
    .values(
      manifest.socialEvidence.follows.map((follow) => ({
        id: follow.id,
        follower_user_id: follow.followerUserId,
        target_kind: follow.targetKind,
        target_ref: follow.targetRef,
        follow_state: follow.state,
        created_at: follow.createdAt,
        updated_at: follow.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc
        .columns(["follower_user_id", "target_kind", "target_ref"])
        .doUpdateSet({
          follow_state: sql`excluded.follow_state`,
          updated_at: sql`excluded.updated_at`,
        }),
    );

  const engagementCommentReports = executor
    .insertInto("engagement_comment_reports")
    .values(
      manifest.socialEvidence.commentReports.map((report) => ({
        id: report.id,
        reporter_user_id: report.reporterUserId,
        comment_id: report.commentId,
        report_reason: report.reason,
        report_state: report.state,
        created_at: report.createdAt,
        updated_at: report.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["reporter_user_id", "comment_id"]).doUpdateSet({
        report_reason: sql`excluded.report_reason`,
        report_state: sql`excluded.report_state`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const notificationReceipts = executor
    .insertInto("notification_receipts")
    .values(
      manifest.socialEvidence.notificationReceipts.map((receipt) => ({
        id: receipt.id,
        owner_user_id: receipt.ownerUserId,
        event_key: receipt.eventKey,
        receipt_state: receipt.state,
        read_at: receipt.readAt,
        created_at: receipt.createdAt,
        updated_at: receipt.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["owner_user_id", "event_key"]).doUpdateSet({
        receipt_state: sql`excluded.receipt_state`,
        read_at: sql`excluded.read_at`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const notificationPreferences = executor
    .insertInto("notification_preferences")
    .values(
      manifest.socialEvidence.notificationPreferences.map((preference) => ({
        owner_user_id: preference.ownerUserId,
        comments_enabled: preference.comments,
        replies_enabled: preference.replies,
        follows_enabled: preference.follows,
        mentions_enabled: preference.mentions,
        claims_enabled: preference.claims,
        system_enabled: preference.system,
        created_at: preference.createdAt,
        updated_at: preference.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("owner_user_id").doUpdateSet({
        comments_enabled: sql`excluded.comments_enabled`,
        replies_enabled: sql`excluded.replies_enabled`,
        follows_enabled: sql`excluded.follows_enabled`,
        mentions_enabled: sql`excluded.mentions_enabled`,
        claims_enabled: sql`excluded.claims_enabled`,
        system_enabled: sql`excluded.system_enabled`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  const wishlistItems = executor
    .insertInto("wishlist_items")
    .values(
      manifest.socialEvidence.wishlistItems.map((item) => ({
        id: item.id,
        owner_user_id: item.ownerUserId,
        catalog_item_id: item.catalogItemId,
        source_surface: item.sourceSurface,
        created_at: item.createdAt,
        updated_at: item.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["owner_user_id", "catalog_item_id"]).doUpdateSet({
        source_surface: sql`excluded.source_surface`,
        updated_at: sql`excluded.updated_at`,
      }),
    );

  return [
    { label: "lineage_audit_cleanup", query: lineageAuditCleanup },
    { label: "community_audit_cleanup", query: communityAuditCleanup },
    { label: "community_reports_cleanup", query: communityReportsCleanup },
    {
      label: "community_contributions_cleanup",
      query: communityContributionsCleanup,
    },
    {
      label: "community_memberships_cleanup",
      query: communityMembershipsCleanup,
    },
    {
      label: "community_profile_blocks_cleanup",
      query: communityProfileBlocksCleanup,
    },
    { label: "media_cleanup", query: mediaCleanup },
    { label: "object_mentions_cleanup", query: objectMentionsCleanup },
    { label: "actors", query: actors },
    { label: "lineage_pending_identities", query: lineagePendingIdentities },
    { label: "spaces", query: spaces },
    { label: "catalog_items", query: catalogItems },
    { label: "catalog_names", query: catalogNames },
    { label: "objects", query: objects },
    { label: "lineage_edges", query: lineageEdges },
    { label: "entries", query: entries },
    { label: "object_mentions", query: objectMentions },
    { label: "topics", query: topics },
    { label: "communities", query: communities },
    { label: "community_rules", query: communityRules },
    { label: "community_memberships", query: communityMemberships },
    { label: "community_moderators", query: communityModerators },
    { label: "community_contributions", query: communityContributions },
    { label: "community_reports", query: communityReports },
    { label: "community_audit_events", query: communityAuditEvents },
    { label: "topic_signals", query: topicSignals },
    { label: "media", query: media },
    { label: "profile_claims", query: profileClaims },
    { label: "profiles", query: profiles },
    { label: "profile_follows", query: profileFollows },
    { label: "profile_blocks", query: profileBlocks },
    { label: "profile_reports", query: profileReports },
    { label: "engagement_comments", query: engagementComments },
    { label: "engagement_bookmarks", query: engagementBookmarks },
    { label: "engagement_follows", query: engagementFollows },
    { label: "engagement_comment_reports", query: engagementCommentReports },
    { label: "notification_receipts", query: notificationReceipts },
    { label: "notification_preferences", query: notificationPreferences },
    { label: "wishlist_items", query: wishlistItems },
  ] as const;
}

export function buildVisualFixtureResetQueries(
  executor: QueryExecutor,
  manifest: VisualFixtureManifest,
) {
  const actorIds = manifest.actors.map(({ id }) => id);
  const communityIds = manifest.communityEvidence.communities.map(
    ({ id }) => id,
  );

  return [
    {
      label: "community_audit_events",
      query: executor
        .deleteFrom("community_moderation_audit_log")
        .where("community_id", "in", communityIds)
        .where("actor_user_id", "in", actorIds),
    },
    {
      label: "community_reports",
      query: executor
        .deleteFrom("community_contribution_reports")
        .where("reporter_user_id", "in", actorIds)
        .where(
          "contribution_id",
          "in",
          executor
            .selectFrom("community_contributions")
            .select("id")
            .where("community_id", "in", communityIds),
        ),
    },
    {
      label: "community_contributions",
      query: executor
        .deleteFrom("community_contributions")
        .where("community_id", "in", communityIds)
        .where("contributor_user_id", "in", actorIds),
    },
    {
      label: "community_moderators",
      query: executor.deleteFrom("community_moderators").where(
        "id",
        "in",
        manifest.communityEvidence.moderators.map(({ id }) => id),
      ),
    },
    {
      label: "community_memberships",
      query: executor
        .deleteFrom("community_memberships")
        .where("community_id", "in", communityIds)
        .where("user_id", "in", actorIds),
    },
    {
      label: "community_rules",
      query: executor.deleteFrom("community_rules").where(
        "id",
        "in",
        manifest.communityEvidence.rules.map(({ id }) => id),
      ),
    },
    {
      label: "communities",
      query: executor.deleteFrom("communities").where(
        "id",
        "in",
        manifest.communityEvidence.communities.map(({ id }) => id),
      ),
    },
    {
      label: "notification_receipts",
      query: executor.deleteFrom("notification_receipts").where(
        "id",
        "in",
        manifest.socialEvidence.notificationReceipts.map(({ id }) => id),
      ),
    },
    {
      label: "notification_preferences",
      query: executor.deleteFrom("notification_preferences").where(
        "owner_user_id",
        "in",
        manifest.socialEvidence.notificationPreferences.map(
          ({ ownerUserId }) => ownerUserId,
        ),
      ),
    },
    {
      label: "engagement_comment_reports",
      query: executor.deleteFrom("engagement_comment_reports").where(
        "id",
        "in",
        manifest.socialEvidence.commentReports.map(({ id }) => id),
      ),
    },
    {
      label: "engagement_comments",
      query: executor.deleteFrom("engagement_comments").where(
        "id",
        "in",
        manifest.socialEvidence.comments.map(({ id }) => id),
      ),
    },
    {
      label: "engagement_bookmarks",
      query: executor.deleteFrom("engagement_bookmarks").where(
        "id",
        "in",
        manifest.socialEvidence.bookmarks.map(({ id }) => id),
      ),
    },
    {
      label: "engagement_follows",
      query: executor.deleteFrom("engagement_follows").where(
        "id",
        "in",
        manifest.socialEvidence.follows.map(({ id }) => id),
      ),
    },
    {
      label: "wishlist_items",
      query: executor.deleteFrom("wishlist_items").where(
        "id",
        "in",
        manifest.socialEvidence.wishlistItems.map(({ id }) => id),
      ),
    },
    {
      label: "profile_reports",
      query: executor.deleteFrom("profile_reports").where(
        "id",
        "in",
        manifest.profileReports.map(({ id }) => id),
      ),
    },
    {
      label: "profile_blocks",
      query: executor
        .deleteFrom("profile_blocks")
        .where("blocker_user_id", "in", actorIds)
        .where("blocked_user_id", "in", actorIds),
    },
    {
      label: "profile_follows",
      query: executor.deleteFrom("profile_follows").where(
        "id",
        "in",
        manifest.profileFollows.map(({ id }) => id),
      ),
    },
    {
      label: "media",
      query: executor.deleteFrom("media_assets").where(
        "id",
        "in",
        manifest.media.map(({ id }) => id),
      ),
    },
    {
      label: "topic_signals",
      query: executor.deleteFrom("journal_entry_topic_signals").where(
        "topic_id",
        "in",
        manifest.topics.map(({ id }) => id),
      ),
    },
    {
      label: "topics",
      query: executor.deleteFrom("journal_topics").where(
        "id",
        "in",
        manifest.topics.map(({ id }) => id),
      ),
    },
    {
      label: "object_mentions",
      query: executor.deleteFrom("journal_entry_object_mentions").where(
        "journal_entry_id",
        "in",
        manifest.entries.map(({ id }) => id),
      ),
    },
    {
      label: "entries",
      query: executor.deleteFrom("journal_entries").where(
        "id",
        "in",
        manifest.entries.map(({ id }) => id),
      ),
    },
    {
      label: "lineage_edges",
      query: executor.deleteFrom("lineage_provenance_edges").where(
        "id",
        "in",
        manifest.lineageEvidence.edges.map(({ id }) => id),
      ),
    },
    {
      label: "lineage_pending_identities",
      query: executor.deleteFrom("lineage_pending_source_identities").where(
        "id",
        "in",
        manifest.lineageEvidence.pendingIdentities.map(({ id }) => id),
      ),
    },
    {
      label: "objects",
      query: executor.deleteFrom("plant_objects").where(
        "id",
        "in",
        manifest.objects.map(({ id }) => id),
      ),
    },
    {
      label: "catalog_alias_projections",
      query: executor.deleteFrom("catalog_alias_projections").where(
        "generated_from_catalog_item_name_id",
        "in",
        manifest.catalogNames.map(({ id }) => id),
      ),
    },
    {
      label: "catalog_names",
      query: executor.deleteFrom("catalog_item_names").where(
        "id",
        "in",
        manifest.catalogNames.map(({ id }) => id),
      ),
    },
    {
      label: "catalog_items",
      query: executor.deleteFrom("catalog_items").where(
        "id",
        "in",
        manifest.catalogItems.map(({ id }) => id),
      ),
    },
    {
      label: "spaces",
      query: executor.deleteFrom("spaces").where(
        "id",
        "in",
        manifest.spaces.map(({ id }) => id),
      ),
    },
    {
      label: "profiles",
      query: executor.deleteFrom("user_public_profiles").where(
        "user_id",
        "in",
        manifest.profiles.map(({ userId }) => userId),
      ),
    },
    {
      label: "actors",
      query: executor.deleteFrom("user").where("id", "in", actorIds),
    },
  ] as const;
}

export function buildVisualFixtureStatusQueries(
  executor: QueryExecutor,
  manifest: VisualFixtureManifest,
) {
  return [
    {
      label: "actors",
      query: executor
        .selectFrom("user")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.actors.map(({ id }) => id),
        ),
    },
    {
      label: "profiles",
      query: executor
        .selectFrom("user_public_profiles")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "user_id",
          "in",
          manifest.profiles.map(({ userId }) => userId),
        ),
    },
    {
      label: "profileFollows",
      query: executor
        .selectFrom("profile_follows")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.profileFollows.map(({ id }) => id),
        ),
    },
    {
      label: "profileBlocks",
      query: executor
        .selectFrom("profile_blocks")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.profileBlocks.map(({ id }) => id),
        ),
    },
    {
      label: "profileReports",
      query: executor
        .selectFrom("profile_reports")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.profileReports.map(({ id }) => id),
        ),
    },
    {
      label: "engagementComments",
      query: executor
        .selectFrom("engagement_comments")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.socialEvidence.comments.map(({ id }) => id),
        ),
    },
    {
      label: "engagementBookmarks",
      query: executor
        .selectFrom("engagement_bookmarks")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.socialEvidence.bookmarks.map(({ id }) => id),
        ),
    },
    {
      label: "engagementFollows",
      query: executor
        .selectFrom("engagement_follows")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.socialEvidence.follows.map(({ id }) => id),
        ),
    },
    {
      label: "engagementCommentReports",
      query: executor
        .selectFrom("engagement_comment_reports")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.socialEvidence.commentReports.map(({ id }) => id),
        ),
    },
    {
      label: "notificationReceipts",
      query: executor
        .selectFrom("notification_receipts")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.socialEvidence.notificationReceipts.map(({ id }) => id),
        ),
    },
    {
      label: "notificationPreferences",
      query: executor
        .selectFrom("notification_preferences")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "owner_user_id",
          "in",
          manifest.socialEvidence.notificationPreferences.map(
            ({ ownerUserId }) => ownerUserId,
          ),
        ),
    },
    {
      label: "wishlistItems",
      query: executor
        .selectFrom("wishlist_items")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.socialEvidence.wishlistItems.map(({ id }) => id),
        ),
    },
    {
      label: "spaces",
      query: executor
        .selectFrom("spaces")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.spaces.map(({ id }) => id),
        ),
    },
    {
      label: "catalogItems",
      query: executor
        .selectFrom("catalog_items")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.catalogItems.map(({ id }) => id),
        ),
    },
    {
      label: "catalogNames",
      query: executor
        .selectFrom("catalog_item_names")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.catalogNames.map(({ id }) => id),
        ),
    },
    {
      label: "objects",
      query: executor
        .selectFrom("plant_objects")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.objects.map(({ id }) => id),
        ),
    },
    {
      label: "lineagePendingIdentities",
      query: executor
        .selectFrom("lineage_pending_source_identities")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.lineageEvidence.pendingIdentities.map(({ id }) => id),
        )
        .where("invite_state", "=", "pending"),
    },
    {
      label: "lineageEdges",
      query: executor
        .selectFrom("lineage_provenance_edges")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.lineageEvidence.edges.map(({ id }) => id),
        )
        .where("source_kind", "=", "pending_identity")
        .where("consent_state", "=", "proposed")
        .where("erasure_state", "=", "active"),
    },
    {
      label: "entries",
      query: executor
        .selectFrom("journal_entries")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.entries.map(({ id }) => id),
        ),
    },
    {
      label: "objectMentions",
      query: executor
        .selectFrom("journal_entry_object_mentions")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "journal_entry_id",
          "in",
          manifest.entries.map(({ id }) => id),
        ),
    },
    {
      label: "topics",
      query: executor
        .selectFrom("journal_topics")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.topics.map(({ id }) => id),
        ),
    },
    {
      label: "topicSignals",
      query: executor
        .selectFrom("journal_entry_topic_signals")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "topic_id",
          "in",
          manifest.topics.map(({ id }) => id),
        ),
    },
    {
      label: "media",
      query: executor
        .selectFrom("media_assets")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.media.map(({ id }) => id),
        ),
    },
    {
      label: "communities",
      query: executor
        .selectFrom("communities")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.communityEvidence.communities.map(({ id }) => id),
        ),
    },
    {
      label: "communityRules",
      query: executor
        .selectFrom("community_rules")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.communityEvidence.rules.map(({ id }) => id),
        ),
    },
    {
      label: "communityMemberships",
      query: executor
        .selectFrom("community_memberships")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.communityEvidence.memberships.map(({ id }) => id),
        ),
    },
    {
      label: "communityModerators",
      query: executor
        .selectFrom("community_moderators")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.communityEvidence.moderators.map(({ id }) => id),
        ),
    },
    {
      label: "communityContributions",
      query: executor
        .selectFrom("community_contributions")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.communityEvidence.contributions.map(({ id }) => id),
        ),
    },
    {
      label: "communityReports",
      query: executor
        .selectFrom("community_contribution_reports")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.communityEvidence.reports.map(({ id }) => id),
        ),
    },
    {
      label: "communityAuditEvents",
      query: executor
        .selectFrom("community_moderation_audit_log")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where(
          "id",
          "in",
          manifest.communityEvidence.auditEvents.map(({ id }) => id),
        ),
    },
  ] as const;
}

export async function seedVisualFixtures(
  database: Kysely<Database>,
  manifest: VisualFixtureManifest = VISUAL_FIXTURE_MANIFEST,
): Promise<VisualFixtureStatus> {
  await database.transaction().execute(async (trx) => {
    for (const { query } of buildVisualFixtureSeedQueries(trx, manifest)) {
      await query.execute();
    }
    await trx
      .updateTable("journal_entries")
      .set({ content_class: "visual_fixture" })
      .where(
        "client_mutation_id",
        "like",
        `${VISUAL_FIXTURE_NAMESPACE}/%`,
      )
      .execute();

    const fixtureOwnerIds = [
      ...new Set(manifest.entries.map((entry) => entry.ownerUserId)),
    ];
    for (const userId of fixtureOwnerIds) {
      await trx
        .insertInto("learning_actor_attributions")
        .values({
          user_id: userId,
          actor_class: "visual_fixture",
          source: "producer",
          classified_at: new Date(),
          updated_at: new Date(),
        })
        .onConflict((oc) =>
          oc.column("user_id").doUpdateSet({
            actor_class: "visual_fixture",
            source: "producer",
            classified_at: new Date(),
            updated_at: new Date(),
          }),
        )
        .execute();
    }
  });

  return getVisualFixtureStatus(database, manifest);
}

export async function resetVisualFixtures(
  database: Kysely<Database>,
  manifest: VisualFixtureManifest = VISUAL_FIXTURE_MANIFEST,
): Promise<VisualFixtureStatus> {
  await database.transaction().execute(async (trx) => {
    for (const { query } of buildVisualFixtureResetQueries(trx, manifest)) {
      await query.execute();
    }
  });

  return getVisualFixtureStatus(database, manifest);
}

function assertVisualFixtureIdentities(manifest: VisualFixtureManifest) {
  let rejectedCount = 0;

  for (const profile of manifest.profiles) {
    const parsedHandle = parsePublicHandleSyntax(profile.handle);
    const moderationCandidate = profile.handle
      .replace(/^demo_/, "test_")
      .replace(/^visual_/, "sample_");
    if (
      !parsedHandle.ok ||
      !evaluatePublicIdentity({
        surface: "handle",
        value: moderationCandidate,
      }).ok
    ) {
      rejectedCount += 1;
    }
    if (profile.displayName) {
      const displayNameEvaluation = evaluatePublicIdentity({
        surface: "display_name",
        value: profile.displayName,
      });
      if (
        !displayNameEvaluation.ok ||
        displayNameEvaluation.value !== profile.displayName
      ) {
        rejectedCount += 1;
      }
    }
  }

  if (rejectedCount > 0) {
    throw new Error(
      `Visual fixture identity policy rejected ${rejectedCount} bounded fixture values.`,
    );
  }
}

function bindRawQuery(executor: QueryExecutor, query: RawBuilder<unknown>) {
  return {
    compile: () => query.compile(executor),
    execute: () => query.execute(executor),
  };
}

export async function getVisualFixtureStatus(
  executor: QueryExecutor,
  manifest: VisualFixtureManifest = VISUAL_FIXTURE_MANIFEST,
): Promise<VisualFixtureStatus> {
  const actualEntries = await Promise.all(
    buildVisualFixtureStatusQueries(executor, manifest).map(
      async ({ label, query }) => {
        const result = await query.executeTakeFirstOrThrow();
        return [label, Number(result.count)] as const;
      },
    ),
  );
  const actual = Object.fromEntries(
    actualEntries,
  ) as unknown as VisualFixtureCounts;
  const expected = expectedVisualFixtureCounts(manifest);

  return {
    version: manifest.version,
    expected,
    actual,
    seeded: countsEqual(actual, expected),
  };
}

export function expectedVisualFixtureCounts(
  manifest: VisualFixtureManifest = VISUAL_FIXTURE_MANIFEST,
): VisualFixtureCounts {
  return {
    actors: manifest.actors.length,
    profiles: manifest.profiles.length,
    profileFollows: manifest.profileFollows.length,
    profileBlocks: manifest.profileBlocks.length,
    profileReports: manifest.profileReports.length,
    engagementComments: manifest.socialEvidence.comments.length,
    engagementBookmarks: manifest.socialEvidence.bookmarks.length,
    engagementFollows: manifest.socialEvidence.follows.length,
    engagementCommentReports: manifest.socialEvidence.commentReports.length,
    notificationReceipts: manifest.socialEvidence.notificationReceipts.length,
    notificationPreferences:
      manifest.socialEvidence.notificationPreferences.length,
    wishlistItems: manifest.socialEvidence.wishlistItems.length,
    spaces: manifest.spaces.length,
    catalogItems: manifest.catalogItems.length,
    catalogNames: manifest.catalogNames.length,
    objects: manifest.objects.length,
    lineagePendingIdentities: manifest.lineageEvidence.pendingIdentities.length,
    lineageEdges: manifest.lineageEvidence.edges.length,
    entries: manifest.entries.length,
    objectMentions: manifest.objectMentions.length,
    topics: manifest.topics.length,
    topicSignals: manifest.topicSignals.length,
    media: manifest.media.length,
    communities: manifest.communityEvidence.communities.length,
    communityRules: manifest.communityEvidence.rules.length,
    communityMemberships: manifest.communityEvidence.memberships.length,
    communityModerators: manifest.communityEvidence.moderators.length,
    communityContributions: manifest.communityEvidence.contributions.length,
    communityReports: manifest.communityEvidence.reports.length,
    communityAuditEvents: manifest.communityEvidence.auditEvents.length,
  };
}

function countsEqual(
  actual: VisualFixtureCounts,
  expected: VisualFixtureCounts,
) {
  return (Object.keys(expected) as (keyof VisualFixtureCounts)[]).every(
    (key) => actual[key] === expected[key],
  );
}
