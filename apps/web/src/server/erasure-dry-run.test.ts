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
import {
  assembleErasureDryRunPreview,
  ERASURE_DRY_RUN_CAVEATS,
} from "./erasure-dry-run";
import {
  buildCountAuthAccountsQuery,
  buildCountAuthSessionsQuery,
  buildCountAuthUserPresentQuery,
  buildCountCatalogProvisionalItemsQuery,
  buildCountHandleClaimsQuery,
  buildCountJournalEntriesQuery,
  buildCountLineagePendingSourceIdentitiesQuery,
  buildCountLineageNodeFollowsQuery,
  buildCountLineageQuestionsQuery,
  buildCountLineageProvenanceAuditEventsQuery,
  buildCountLineageProvenanceEdgesQuery,
  buildCountMediaAssetsQuery,
  buildCountOwnedRowsQuery,
  buildCountPendingJournalSearchJobsQuery,
  buildCountPublicIdentityProfilesQuery,
  buildCountUnreviewedIdentityRowsQuery,
} from "./erasure-dry-run-repository";

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
const requesterUserId = "00000000-0000-4000-8000-000000000001";

describe("erasure dry-run preview assembly", () => {
  it("builds bounded data classes without embedding forbidden fields", () => {
    const preview = assembleErasureDryRunPreview({
      requestId: "00000000-0000-4000-8000-000000000111",
      requesterUserId,
      generatedAt: new Date("2026-06-29T08:00:00.000Z"),
      counts: {
        authUserPresent: 1,
        authSessions: 2,
        authAccounts: 1,
        pilotInviteGrantPresent: 1,
        publicIdentityProfiles: 1,
        currentHandleClaims: 1,
        retiredHandleClaims: 2,
        unreviewedIdentityRows: 0,
        spaces: 1,
        plantObjects: 2,
        lineageProvenanceEdges: 2,
        lineagePendingSourceIdentities: 1,
        lineageProvenanceAuditEvents: 1,
        lineageNodeFollows: 3,
        lineageQuestions: 2,
        journalEntriesTotal: 3,
        journalEntriesPrivateActive: 2,
        journalEntriesPublicActive: 1,
        journalEntriesArchived: 0,
        journalEntryObjectMentions: 2,
        journalEntryCatalogMentions: 1,
        journalMutationReceipts: 1,
        mediaAssetsTotal: 1,
        mediaAssetsQuarantined: 0,
        mediaAssetsProcessed: 1,
        mediaAssetsFailed: 0,
        mediaAssetsCoverOnly: 1,
        mediaAssetsWithExplicitCover: 1,
        profileFollows: 2,
        profileBlocks: 1,
        wishlistItems: 1,
        engagementComments: 2,
        engagementBookmarks: 1,
        notificationReceipts: 1,
        communityMemberships: 1,
        communityContributions: 1,
        communityModerationActorRefs: 2,
        publicSlugs: 1,
        publicGoneTombstones: 0,
        analyticsEvents: 5,
        catalogProvisionalItems: 1,
        plantObjectsUserAdded: 1,
        catalogReviewerLinks: 1,
        searchPublicActiveEntries: 1,
        searchPendingIndexJobs: 0,
        searchPendingUnindexJobs: 0,
        searchTerminalJobsWithUserId: 1,
        publicProjectionIntents: 1,
        erasureRequestsTotal: 1,
      },
    });

    expect(preview.dataClasses).toHaveLength(14);
    expect(
      preview.dataClasses.find(
        (dataClass) => dataClass.key === "public_identity",
      )?.counts,
    ).toEqual({
      profiles: 1,
      current_handle_claims: 1,
      retired_handle_claims: 2,
      unreviewed_policy_rows: 0,
    });
    expect(
      preview.dataClasses.find(
        (dataClass) => dataClass.key === "lineage_provenance",
      )?.counts,
    ).toEqual({
      provenance_edges: 2,
      pending_identities: 1,
      audit_events: 1,
      follows: 3,
      questions: 2,
    });
    expect(preview.caveats).toEqual([...ERASURE_DRY_RUN_CAVEATS]);
    expect(
      preview.dataClasses.find(
        (dataClass) => dataClass.key === "journal_entries",
      )?.counts,
    ).toMatchObject({
      object_mentions: 2,
      catalog_mentions: 1,
    });
    expect(
      JSON.stringify(preview.dataClasses.map((dataClass) => dataClass.counts)),
    ).not.toMatch(
      /quarantine_key|derivative_key|token|password|coordinate|latitude|longitude/i,
    );
  });
});

describe("erasure dry-run repository privacy contracts", () => {
  it("counts auth rows without selecting email, token, or session metadata", () => {
    const userSql = buildCountAuthUserPresentQuery(
      testDb,
      requesterUserId,
    ).compile().sql;
    const sessionSql = buildCountAuthSessionsQuery(
      testDb,
      requesterUserId,
    ).compile().sql;
    const accountSql = buildCountAuthAccountsQuery(
      testDb,
      requesterUserId,
    ).compile().sql;

    for (const sql of [userSql, sessionSql, accountSql]) {
      expect(sql).toMatch(/count\(\*\)/i);
      expect(sql).not.toMatch(
        /email|password|token|ipaddress|useragent|title|body|quarantine|derivative|referrer|coordinate|latitude|longitude/i,
      );
    }
  });

  it("counts current and retired pseudonymous identity rows without selecting values", () => {
    const profileSql = buildCountPublicIdentityProfilesQuery(
      testDb,
      requesterUserId,
    ).compile().sql;
    const currentSql = buildCountHandleClaimsQuery(
      testDb,
      requesterUserId,
      "current",
    ).compile().sql;
    const retiredSql = buildCountHandleClaimsQuery(
      testDb,
      requesterUserId,
      "retired",
    ).compile().sql;
    const policySql = buildCountUnreviewedIdentityRowsQuery(
      testDb,
      requesterUserId,
    ).compile().sql;

    for (const compiledSql of [profileSql, currentSql, retiredSql, policySql]) {
      expect(compiledSql).toMatch(/count\(\*\)/i);
      expect(compiledSql).not.toMatch(
        /\bhandle\b|display_name\s+as|email|provider|token|session|ip_address|user_agent|latitude|longitude/i,
      );
    }
  });

  it("counts journal and media rows without selecting private content or keys", () => {
    const journalSql = buildCountJournalEntriesQuery(testDb, requesterUserId, {
      visibility: "private",
      lifecycleState: "active",
    }).compile().sql;
    const mediaSql = buildCountMediaAssetsQuery(
      testDb,
      requesterUserId,
      "processed",
    ).compile().sql;

    expect(journalSql).toContain('"journal_entries"');
    expect(journalSql).toContain('"owner_user_id" = $1');
    expect(journalSql).not.toMatch(
      /title|body|public_slug|email|quarantine|derivative/i,
    );

    expect(mediaSql).toContain('"media_assets"');
    expect(mediaSql).not.toMatch(
      /quarantine_key|derivative_key|title|body|email/i,
    );
  });

  it("counts journal mention rows by owner without selecting linked content", () => {
    const objectMentionSql = buildCountOwnedRowsQuery(
      testDb,
      "journal_entry_object_mentions",
      requesterUserId,
    ).compile().sql;
    const catalogMentionSql = buildCountOwnedRowsQuery(
      testDb,
      "journal_entry_catalog_mentions",
      requesterUserId,
    ).compile().sql;

    for (const sql of [objectMentionSql, catalogMentionSql]) {
      expect(sql).toMatch(/count\(\*\)/i);
      expect(sql).toContain('"owner_user_id" = $1');
      expect(sql).not.toMatch(
        /journal_entries|plant_objects|catalog_items|title|body|display_name|canonical_name|media_assets|quarantine|derivative|email|phone|coarse_region|location_visibility|ip|user_agent/i,
      );
    }
  });

  it("counts lineage provenance edges without selecting labels or location-adjacent fields", () => {
    const compiled = buildCountLineageProvenanceEdgesQuery(
      testDb,
      requesterUserId,
    ).compile();

    expect(compiled.sql).toContain('"lineage_provenance_edges"');
    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('"source_owner_user_id" = $2');
    expect(compiled.sql).toMatch(/count\(\*\)/i);
    expect(compiled.sql).not.toMatch(
      /source_reference_label|journal_entries|media_assets|body|quarantine|derivative|email|phone|coarse_region|location_visibility|ip|user_agent/i,
    );
    expect(compiled.parameters).toEqual([requesterUserId, requesterUserId]);
  });

  it("counts lineage claim audit events without selecting edge payloads", () => {
    const compiled = buildCountLineageProvenanceAuditEventsQuery(
      testDb,
      requesterUserId,
    ).compile();

    expect(compiled.sql).toContain('"lineage_provenance_edge_audit_events"');
    expect(compiled.sql).toContain('"actor_user_id" = $1');
    expect(compiled.sql).toContain('"target_user_id" = $2');
    expect(compiled.sql).toMatch(/count\(\*\)/i);
    expect(compiled.sql).not.toMatch(
      /lineage_provenance_edges|source_reference_label|journal_entries|media_assets|body|quarantine|derivative|email|phone|coarse_region|location_visibility|ip|user_agent/i,
    );
    expect(compiled.parameters).toEqual([requesterUserId, requesterUserId]);
  });

  it("counts lineage pending source identities without selecting labels or tokens", () => {
    const compiled = buildCountLineagePendingSourceIdentitiesQuery(
      testDb,
      requesterUserId,
    ).compile();

    expect(compiled.sql).toContain('"lineage_pending_source_identities"');
    expect(compiled.sql).toContain('"created_by_user_id" = $1');
    expect(compiled.sql).toContain('"claimed_by_user_id" = $2');
    expect(compiled.sql).toMatch(/count\(\*\)/i);
    expect(compiled.sql).not.toMatch(
      /display_label|token|journal_entries|media_assets|body|quarantine|derivative|email|phone|coarse_region|location_visibility|ip|user_agent|referrer/i,
    );
    expect(compiled.parameters).toEqual([requesterUserId, requesterUserId]);
  });

  it("counts lineage follows without selecting target labels or public payloads", () => {
    const compiled = buildCountLineageNodeFollowsQuery(
      testDb,
      requesterUserId,
    ).compile();

    expect(compiled.sql).toContain('"lineage_node_follows"');
    expect(compiled.sql).toContain('"follower_user_id" = $1');
    expect(compiled.sql).toContain('"target_owner_user_id" = $2');
    expect(compiled.sql).toMatch(/count\(\*\)/i);
    expect(compiled.sql).not.toMatch(
      /plant_objects|journal_entries|display_name|question_text|email|phone|coarse_region|location_visibility|ip_address|user_agent/i,
    );
    expect(compiled.parameters).toEqual([requesterUserId, requesterUserId]);
  });

  it("counts lineage questions without selecting question text", () => {
    const compiled = buildCountLineageQuestionsQuery(
      testDb,
      requesterUserId,
    ).compile();

    expect(compiled.sql).toContain('"lineage_questions"');
    expect(compiled.sql).toContain('"asker_user_id" = $1');
    expect(compiled.sql).toContain('"recipient_user_id" = $2');
    expect(compiled.sql).toMatch(/count\(\*\)/i);
    expect(compiled.sql).not.toMatch(
      /question_text|client_mutation_id|plant_objects|journal_entries|display_name|email|phone|coarse_region|location_visibility|ip_address|user_agent/i,
    );
    expect(compiled.parameters).toEqual([requesterUserId, requesterUserId]);
  });

  it("counts search jobs by payload kind without returning payload content", () => {
    const compiled = buildCountPendingJournalSearchJobsQuery(
      testDb,
      requesterUserId,
      "journal_entry_unindex",
    ).compile();

    expect(compiled.sql).toContain('"job_queue"');
    expect(compiled.sql).toContain("payload->>'kind'");
    expect(compiled.sql).toContain("payload->>'userId'");
    expect(compiled.sql).toMatch(/count\(\*\)/i);
    expect(compiled.sql).not.toContain("payload as");
    expect(compiled.sql).not.toMatch(/title|body|email|quarantine|derivative/i);
  });

  it("counts provisional catalog records without private text", () => {
    const catalogSql = buildCountCatalogProvisionalItemsQuery(
      testDb,
      requesterUserId,
    ).compile().sql;

    expect(catalogSql).toContain('"catalog_items"');
    expect(catalogSql).not.toMatch(
      /canonical_name|normalized_name|title|body/i,
    );
  });
});
