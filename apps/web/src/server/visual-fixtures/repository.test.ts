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
import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";
import {
  buildVisualFixtureResetQueries,
  buildVisualFixtureSeedQueries,
  buildVisualFixtureStatusQueries,
} from "./repository";

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

describe("visual fixture repository query contracts", () => {
  it("builds deterministic dependency-ordered upserts for only fixture-owned tables", () => {
    const queries = buildVisualFixtureSeedQueries(
      testDb,
      VISUAL_FIXTURE_MANIFEST,
    );

    expect(queries.map(({ label }) => label)).toEqual([
      "lineage_audit_cleanup",
      "community_audit_cleanup",
      "community_reports_cleanup",
      "community_contributions_cleanup",
      "community_memberships_cleanup",
      "community_profile_blocks_cleanup",
      "media_cleanup",
      "object_mentions_cleanup",
      "actors",
      "lineage_pending_identities",
      "spaces",
      "catalog_items",
      "catalog_names",
      "objects",
      "lineage_edges",
      "entries",
      "object_mentions",
      "topics",
      "communities",
      "community_rules",
      "community_memberships",
      "community_moderators",
      "community_contributions",
      "community_reports",
      "community_audit_events",
      "topic_signals",
      "media",
      "profiles",
      "profile_follows",
      "profile_blocks",
      "profile_reports",
      "engagement_comments",
      "engagement_bookmarks",
      "engagement_follows",
      "engagement_comment_reports",
      "notification_receipts",
      "notification_preferences",
      "wishlist_items",
    ]);

    const compiled = queries.map(({ query }) => query.compile());
    const sql = compiled.map((item) => item.sql).join("\n");

    expect(sql).toContain('delete from "media_assets"');
    expect(sql).toContain('delete from "lineage_provenance_edge_audit_events"');
    expect(sql).toContain('delete from "community_moderation_audit_log"');
    expect(sql).toContain('insert into "user"');
    expect(sql).toContain('insert into "user_public_profiles"');
    expect(sql).toContain('insert into "profile_follows"');
    expect(sql).toContain('insert into "profile_blocks"');
    expect(sql).toContain('insert into "profile_reports"');
    expect(sql).toContain('insert into "engagement_comments"');
    expect(sql).toContain('insert into "engagement_bookmarks"');
    expect(sql).toContain('insert into "engagement_follows"');
    expect(sql).toContain('insert into "engagement_comment_reports"');
    expect(sql).toContain('insert into "notification_receipts"');
    expect(sql).toContain('insert into "notification_preferences"');
    expect(sql).toContain('insert into "wishlist_items"');
    expect(sql).toContain('insert into "spaces"');
    expect(sql).toContain('insert into "catalog_items"');
    expect(sql).toContain('insert into "catalog_item_names"');
    expect(sql).toContain('insert into "plant_objects"');
    expect(sql).toContain('insert into "lineage_pending_source_identities"');
    expect(sql).toContain('insert into "lineage_provenance_edges"');
    expect(sql).toContain('insert into "journal_entries"');
    expect(sql).toContain('insert into "journal_entry_object_mentions"');
    expect(sql).toContain('insert into "journal_topics"');
    expect(sql).toContain('insert into "communities"');
    expect(sql).toContain('insert into "community_rules"');
    expect(sql).toContain('insert into "community_memberships"');
    expect(sql).toContain('insert into "community_moderators"');
    expect(sql).toContain('insert into "community_contributions"');
    expect(sql).toContain('insert into "community_contribution_reports"');
    expect(sql).toContain('insert into "community_moderation_audit_log"');
    expect(sql).toContain('insert into "journal_entry_topic_signals"');
    expect(sql).toContain('insert into "media_assets"');
    expect(sql).toContain('"alt_text"');
    expect(sql).toContain('"caption"');
    expect(sql).toContain('on conflict ("id") do update');
    expect(sql).toContain('on conflict ("user_id") do update');
    expect(sql).not.toMatch(
      /analytics_events|job_queue|meilisearch|search_documents|email_delivery|push_payload/i,
    );

    const parameters = compiled.flatMap((item) => item.parameters);
    expect(parameters).toContain(VISUAL_FIXTURE_MANIFEST.actors[0].id);
    expect(parameters).toContain(VISUAL_FIXTURE_MANIFEST.entries[79].id);
    expect(parameters).toContain(VISUAL_FIXTURE_MANIFEST.topics[2].id);
    expect(parameters).toContain(
      VISUAL_FIXTURE_MANIFEST.topicSignals[14].journalEntryId,
    );
    expect(parameters).toContain(VISUAL_FIXTURE_MANIFEST.media[15].id);
    expect(compiled[0].parameters).toEqual(
      VISUAL_FIXTURE_MANIFEST.lineageEvidence.edges.map(({ id }) => id),
    );
    const actorIds = VISUAL_FIXTURE_MANIFEST.actors.map(({ id }) => id);
    const communityIds =
      VISUAL_FIXTURE_MANIFEST.communityEvidence.communities.map(({ id }) => id);
    expect(compiled[1].parameters).toEqual([...communityIds, ...actorIds]);
    expect(compiled[2].parameters).toEqual([...actorIds, ...communityIds]);
    expect(compiled[3].parameters).toEqual([...communityIds, ...actorIds]);
    expect(compiled[4].parameters).toEqual([...communityIds, ...actorIds]);
    expect(compiled[5].parameters).toEqual([...actorIds, ...actorIds]);
    expect(compiled[6].parameters).toEqual(
      VISUAL_FIXTURE_MANIFEST.media.map(({ id }) => id),
    );
    expect(compiled[7].parameters).toEqual(
      VISUAL_FIXTURE_MANIFEST.entries.map(({ id }) => id),
    );
  });

  it("builds a manifest-bounded reset in reverse dependency order", () => {
    const queries = buildVisualFixtureResetQueries(
      testDb,
      VISUAL_FIXTURE_MANIFEST,
    );

    expect(queries.map(({ label }) => label)).toEqual([
      "community_audit_events",
      "community_reports",
      "community_contributions",
      "community_moderators",
      "community_memberships",
      "community_rules",
      "communities",
      "notification_receipts",
      "notification_preferences",
      "engagement_comment_reports",
      "engagement_comments",
      "engagement_bookmarks",
      "engagement_follows",
      "wishlist_items",
      "profile_reports",
      "profile_blocks",
      "profile_follows",
      "media",
      "topic_signals",
      "topics",
      "object_mentions",
      "entries",
      "lineage_edges",
      "lineage_pending_identities",
      "objects",
      "catalog_names",
      "catalog_items",
      "spaces",
      "profiles",
      "actors",
    ]);

    const compiled = queries.map(({ query }) => query.compile());
    const sql = compiled.map((item) => item.sql).join("\n");
    expect(sql).not.toMatch(/\blike\b|analytics_events|job_queue/i);

    const actorIds = VISUAL_FIXTURE_MANIFEST.actors.map(({ id }) => id);
    const communityIds =
      VISUAL_FIXTURE_MANIFEST.communityEvidence.communities.map(({ id }) => id);
    const expectedIdGroups = [
      [...communityIds, ...actorIds],
      [...actorIds, ...communityIds],
      [...communityIds, ...actorIds],
      VISUAL_FIXTURE_MANIFEST.communityEvidence.moderators.map(({ id }) => id),
      [...communityIds, ...actorIds],
      VISUAL_FIXTURE_MANIFEST.communityEvidence.rules.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.communityEvidence.communities.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.socialEvidence.notificationReceipts.map(
        ({ id }) => id,
      ),
      VISUAL_FIXTURE_MANIFEST.socialEvidence.notificationPreferences.map(
        ({ ownerUserId }) => ownerUserId,
      ),
      VISUAL_FIXTURE_MANIFEST.socialEvidence.commentReports.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.socialEvidence.comments.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.socialEvidence.bookmarks.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.socialEvidence.follows.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.socialEvidence.wishlistItems.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.profileReports.map(({ id }) => id),
      [...actorIds, ...actorIds],
      VISUAL_FIXTURE_MANIFEST.profileFollows.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.media.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.topics.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.topics.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.entries.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.entries.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.lineageEvidence.edges.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.lineageEvidence.pendingIdentities.map(
        ({ id }) => id,
      ),
      VISUAL_FIXTURE_MANIFEST.objects.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.catalogNames.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.catalogItems.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.spaces.map(({ id }) => id),
      VISUAL_FIXTURE_MANIFEST.profiles.map(({ userId }) => userId),
      VISUAL_FIXTURE_MANIFEST.actors.map(({ id }) => id),
    ];

    compiled.forEach((item, index) => {
      expect(item.parameters).toEqual(expectedIdGroups[index]);
    });
  });

  it("limits status queries to aggregate counts over exact manifest ids", () => {
    const queries = buildVisualFixtureStatusQueries(
      testDb,
      VISUAL_FIXTURE_MANIFEST,
    );
    const compiled = queries.map(({ query }) => query.compile());
    const sql = compiled.map((item) => item.sql).join("\n");

    expect(queries.map(({ label }) => label)).toEqual([
      "actors",
      "profiles",
      "profileFollows",
      "profileBlocks",
      "profileReports",
      "engagementComments",
      "engagementBookmarks",
      "engagementFollows",
      "engagementCommentReports",
      "notificationReceipts",
      "notificationPreferences",
      "wishlistItems",
      "spaces",
      "catalogItems",
      "catalogNames",
      "objects",
      "lineagePendingIdentities",
      "lineageEdges",
      "entries",
      "objectMentions",
      "topics",
      "topicSignals",
      "media",
      "communities",
      "communityRules",
      "communityMemberships",
      "communityModerators",
      "communityContributions",
      "communityReports",
      "communityAuditEvents",
    ]);
    expect(sql.match(/count\(\*\)/g)).toHaveLength(30);
    expect(sql).toContain('from "catalog_items"');
    expect(sql).toContain('from "catalog_item_names"');
    expect(sql).toContain('from "user_public_profiles"');
    expect(sql).toContain('from "journal_topics"');
    expect(sql).toContain('from "journal_entry_topic_signals"');
    expect(sql).toContain('from "journal_entry_object_mentions"');
    expect(sql).toContain('from "lineage_pending_source_identities"');
    expect(sql).toContain('from "lineage_provenance_edges"');
    expect(sql).toContain('from "engagement_comments"');
    expect(sql).toContain('from "notification_receipts"');
    expect(sql).toContain('from "wishlist_items"');
    expect(sql).toContain('from "communities"');
    expect(sql).toContain('from "community_rules"');
    expect(sql).toContain('from "community_memberships"');
    expect(sql).toContain('from "community_moderators"');
    expect(sql).toContain('from "community_contributions"');
    expect(sql).toContain('from "community_contribution_reports"');
    expect(sql).toContain('from "community_moderation_audit_log"');
    expect(sql).not.toMatch(
      /email|body|quarantine_key|derivative_key|comment_text/i,
    );
  });
});
