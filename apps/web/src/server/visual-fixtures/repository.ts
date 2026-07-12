import { sql, type Kysely, type Transaction } from "kysely";

import type { Database } from "@/db/schema";
import {
  VISUAL_FIXTURE_MANIFEST,
  type VisualFixtureManifest,
} from "@/lib/visual-fixtures/manifest";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface VisualFixtureCounts {
  actors: number;
  profiles: number;
  profileFollows: number;
  profileBlocks: number;
  profileReports: number;
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

  const profiles = executor
    .insertInto("user_public_profiles")
    .values(
      manifest.profiles.map((profile) => ({
        user_id: profile.userId,
        handle: profile.handle,
        normalized_handle: profile.handle.toLowerCase(),
        display_name: profile.displayName,
        avatar_url: null,
        avatar_media_asset_id: profile.avatarMediaAssetId,
        bio: profile.bio,
        languages: [...profile.languages],
        location_visibility: profile.locationVisibility,
        coarse_region_code: profile.coarseRegionCode,
        profile_visibility: profile.profileVisibility,
        profile_lifecycle_state: profile.profileLifecycleState,
        relationship_visibility: profile.relationshipVisibility,
        removed_at: profile.removedAt,
        created_at: profile.createdAt,
        updated_at: profile.createdAt,
      })),
    )
    .onConflict((oc) =>
      oc.column("user_id").doUpdateSet({
        handle: sql`excluded.handle`,
        normalized_handle: sql`excluded.normalized_handle`,
        display_name: sql`excluded.display_name`,
        avatar_url: sql`excluded.avatar_url`,
        avatar_media_asset_id: sql`excluded.avatar_media_asset_id`,
        bio: sql`excluded.bio`,
        languages: sql`excluded.languages`,
        location_visibility: sql`excluded.location_visibility`,
        coarse_region_code: sql`excluded.coarse_region_code`,
        profile_visibility: sql`excluded.profile_visibility`,
        profile_lifecycle_state: sql`excluded.profile_lifecycle_state`,
        relationship_visibility: sql`excluded.relationship_visibility`,
        removed_at: sql`excluded.removed_at`,
        updated_at: sql`excluded.updated_at`,
      }),
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
        updated_at: sql`excluded.updated_at`,
      }),
    );

  return [
    { label: "lineage_audit_cleanup", query: lineageAuditCleanup },
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
    { label: "topic_signals", query: topicSignals },
    { label: "media", query: media },
    { label: "profiles", query: profiles },
    { label: "profile_follows", query: profileFollows },
    { label: "profile_blocks", query: profileBlocks },
    { label: "profile_reports", query: profileReports },
  ] as const;
}

export function buildVisualFixtureResetQueries(
  executor: QueryExecutor,
  manifest: VisualFixtureManifest,
) {
  const actorIds = manifest.actors.map(({ id }) => id);

  return [
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
      query: executor.deleteFrom("profile_blocks").where(
        "id",
        "in",
        manifest.profileBlocks.map(({ id }) => id),
      ),
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
