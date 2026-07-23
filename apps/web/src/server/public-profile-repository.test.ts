import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import {
  buildCurrentPublicHandleClaimQuery,
  buildPublicProfileByNormalizedHandleQuery,
  buildPublicProfileEntrySummaryQuery,
  buildPublicProfileFollowerCountQuery,
  buildPublicProfileFollowingCountQuery,
  buildPublicProfileJournalEvidenceQuery,
  buildPublicProfileJournalMediaEvidenceQuery,
  buildPublicProfileLineageSummaryQuery,
  buildPublicProfileLinksQuery,
  buildPublicProfileLifecycleQuery,
  buildPublicProfileObjectEvidenceQuery,
  buildPublicProfileObjectMediaEvidenceQuery,
  classifyPublicProfileLifecycle,
  normalizePublicHandleInput,
  serializePublicProfileEvidencePage,
  serializePublicProfilePage,
} from "./public-profile-repository";

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
const userId = "00000000-0000-4000-8000-000000000001";
const forbiddenPublicProfilePattern =
  /email|provider|account|session|ip_address|user_agent|referrer|phone|invite|token|journal_entries"\."title|journal_entries"\."body|media_assets|quarantine|derivative|source_reference_label|source_pending_identity_id|pending_identity/i;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public profile handle contracts", () => {
  it("reads cooldown eligibility from the authoritative current registry claim", () => {
    const compiled = buildCurrentPublicHandleClaimQuery(
      testDb,
      userId,
    ).compile();

    expect(compiled.sql).toContain('from "user_handle_registry"');
    expect(compiled.sql).toContain('"next_rename_at" as "nextEligibleAt"');
    expect(compiled.sql).toContain('"lifecycle_state" =');
    expect(compiled.parameters).toEqual([userId, "current", 1]);
    expect(compiled.sql).not.toMatch(/email|provider|session|token/i);
  });

  it("normalizes handles without allowing reserved or blocked names", () => {
    expect(normalizePublicHandleInput(" @Green_Thumb42 ")).toMatchObject({
      ok: true,
      handle: "green_thumb42",
      mention: "@green_thumb42",
    });
    expect(normalizePublicHandleInput("api")).toEqual({
      ok: false,
      error: "unavailable",
    });
    expect(normalizePublicHandleInput("nazi_garden")).toEqual({
      ok: false,
      error: "unavailable",
    });
    expect(normalizePublicHandleInput("@@broken")).toEqual({
      ok: false,
      error: "format",
    });
  });

  it("keeps generation and atomic rename ownership inside SQL", () => {
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const schemaSql = readFileSync(
      join(webRoot, "sql/0001_walking_skeleton.sql"),
      "utf8",
    );

    expect(schemaSql).toContain(
      "create or replace function overgarden_provision_user_public_profile",
    );
    expect(schemaSql).toContain(
      "create or replace function overgarden_claim_user_public_handle",
    );
    expect(schemaSql).toContain("from 1 for 16");
    expect(schemaSql).toContain("for attempt in 0..99 loop");
    expect(schemaSql).toContain('after insert on "user"');
    expect(schemaSql).toContain(
      "user_handle_registry_one_current_per_user_uidx",
    );
    expect(schemaSql).toContain(
      "user_public_profiles_current_handle_registry_fkey",
    );
    expect(schemaSql).toContain("on update no action");
    expect(schemaSql).toContain("on delete no action");
    expect(schemaSql).toContain("deferrable initially deferred");
    expect(schemaSql).toContain(
      "overgarden_assert_user_public_identity_consistency",
    );
    expect(schemaSql).toContain(
      "overgarden_public_profile_identity_consistency",
    );
    expect(schemaSql).toContain(
      "overgarden_handle_registry_identity_consistency",
    );
    expect(schemaSql).toContain("now() + interval '30 days'");
    expect(schemaSql).toContain("lifecycle_state = 'retired'");
    expect(schemaSql).toContain(":mention:public_handle:[a-f0-9]{16}$");
    expect(schemaSql).toContain(
      "digest('public_handle:' || profile.normalized_handle, 'sha256')",
    );
    expect(schemaSql).not.toMatch(/provision_user_email|oauth_provider/i);
  });

  it("models a PII-free current and retired handle registry", () => {
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const schemaSql = readFileSync(
      join(webRoot, "sql/0001_walking_skeleton.sql"),
      "utf8",
    );
    const tableMatch = schemaSql.match(
      /create table if not exists user_handle_registry \(([\s\S]*?)\);/,
    );

    expect(tableMatch).not.toBeNull();
    const tableBody = (tableMatch?.[1] ?? "").toLowerCase();
    expect(tableBody).toContain("normalized_handle text primary key");
    expect(tableBody).toContain("user_id uuid not null");
    expect(tableBody).toContain("lifecycle_state text not null");
    expect(tableBody).toContain("next_rename_at timestamptz not null");
    expect(tableBody).toContain("policy_version text not null");
    expect(tableBody).not.toMatch(
      /email|provider|account|session|ip_address|user_agent|referrer|phone|invite|token|journal|bio|location|quarantine|derivative/,
    );
  });

  it("resolves public profiles by normalized handle without auth or private fields", () => {
    const compiled = buildPublicProfileByNormalizedHandleQuery(
      testDb,
      "green_thumb",
    ).compile();

    expect(compiled.sql).toContain('from "user_public_profiles"');
    expect(compiled.sql).toContain('"normalized_handle" =');
    expect(compiled.sql).toContain('"handle"');
    expect(compiled.sql).toContain('"display_name" as "displayName"');
    expect(compiled.sql).toContain('"avatar_url" as "avatarUrl"');
    expect(compiled.sql).not.toMatch(forbiddenPublicProfilePattern);
  });

  it("counts only active public contribution rows for profile summaries", () => {
    const entrySummary = buildPublicProfileEntrySummaryQuery(
      testDb,
      userId,
    ).compile();
    const lineageSummary = buildPublicProfileLineageSummaryQuery(
      testDb,
      userId,
    ).compile();

    expect(entrySummary.sql).toContain('from "journal_entries"');
    expect(entrySummary.sql).toContain('"visibility" =');
    expect(entrySummary.sql).toContain('"lifecycle_state" =');
    expect(entrySummary.sql).toContain('"public_gone_at" is null');
    expect(entrySummary.sql).toContain('"public_slug" is not null');
    expect(entrySummary.sql).not.toMatch(forbiddenPublicProfilePattern);

    expect(lineageSummary.sql).toContain('from "lineage_provenance_edges"');
    expect(lineageSummary.sql).toContain(
      'inner join "journal_entries" as "subject_public_entries"',
    );
    expect(lineageSummary.sql).toContain(
      'inner join "journal_entries" as "source_public_entries"',
    );
    expect(lineageSummary.sql).toContain('"source_kind" =');
    expect(lineageSummary.sql).toContain('"consent_state" =');
    expect(lineageSummary.sql).toContain('"erasure_state" =');
    expect(lineageSummary.parameters).toContain("confirmed");
    expect(lineageSummary.parameters).toContain("active");
    expect(lineageSummary.sql).not.toMatch(forbiddenPublicProfilePattern);
  });

  it("links only active public journal URLs without title or body readback", () => {
    const compiled = buildPublicProfileLinksQuery(testDb, userId).compile();

    expect(compiled.sql).toContain('"public_slug" as "publicSlug"');
    expect(compiled.sql).toContain('"entry_date" as "entryDate"');
    expect(compiled.sql).toContain('"visibility" =');
    expect(compiled.sql).toContain('"public_gone_at" is null');
    expect(compiled.sql).not.toMatch(forbiddenPublicProfilePattern);
  });

  it("loads object-first evidence through active public journal anchors only", () => {
    const compiled = buildPublicProfileObjectEvidenceQuery(
      testDb,
      userId,
    ).compile();

    expect(compiled.sql).toContain('from "plant_objects"');
    expect(compiled.sql).toContain('inner join "journal_entries"');
    expect(compiled.sql).toContain('"journal_entries"."visibility" =');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" =');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."published_at" is not null',
    );
    expect(compiled.sql).toContain('count(distinct "journal_entries"."id")');
    expect(compiled.sql).toContain('max("journal_entries"."entry_date")');
    expect(compiled.sql).not.toMatch(/email|provider|private|draft|precise/i);
  });

  it("loads bounded journal evidence with public object or space context", () => {
    const compiled = buildPublicProfileJournalEvidenceQuery(
      testDb,
      userId,
    ).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('left join "plant_objects"');
    expect(compiled.sql).toContain('inner join "spaces"');
    expect(compiled.sql).toContain('"journal_entries"."visibility" =');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" =');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."published_at" is not null',
    );
    expect(compiled.sql).toContain(
      'order by "journal_entries"."published_at" desc',
    );
    expect(compiled.sql).toContain("limit");
    expect(compiled.sql).not.toMatch(/email|provider|quarantine|exact/i);
  });

  it("loads processed public covers without serializing storage keys", () => {
    const objectMedia = buildPublicProfileObjectMediaEvidenceQuery(
      testDb,
      userId,
    ).compile();
    const journalMedia = buildPublicProfileJournalMediaEvidenceQuery(
      testDb,
      userId,
      ["00000000-0000-4000-8000-000000000101"],
    ).compile();

    for (const compiled of [objectMedia, journalMedia]) {
      expect(compiled.sql).toContain('inner join "journal_entries"');
      expect(compiled.sql).toContain('from "media_assets"');
      expect(compiled.sql).toContain('"media_assets"."status" =');
      expect(compiled.sql).toContain(
        '"media_assets"."derivative_key" is not null',
      );
      expect(compiled.sql).toContain('"journal_entries"."visibility" =');
      expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" =');
      expect(compiled.sql).not.toContain("quarantine_key");
    }
  });

  it("counts only active public counterpart profiles for aggregate relationships", () => {
    const followers = buildPublicProfileFollowerCountQuery(
      testDb,
      userId,
    ).compile();
    const following = buildPublicProfileFollowingCountQuery(
      testDb,
      userId,
    ).compile();

    expect(followers.sql).toContain('from "profile_follows"');
    expect(followers.sql).toContain('inner join "user_public_profiles"');
    expect(followers.sql).toContain('"profile_follows"."follow_state" =');
    expect(followers.sql).toContain(
      '"follower_profiles"."profile_visibility" =',
    );
    expect(followers.sql).toContain(
      '"follower_profiles"."profile_lifecycle_state" =',
    );
    expect(following.sql).toContain('from "profile_follows"');
    expect(following.sql).toContain('inner join "user_public_profiles"');
    expect(following.sql).toContain('"target_profiles"."profile_visibility" =');
    expect(following.sql).toContain(
      '"target_profiles"."profile_lifecycle_state" =',
    );
    expect(`${followers.sql}\n${following.sql}`).not.toMatch(
      /handle|display_name|email|avatar|bio/,
    );
  });

  it("classifies lifecycle from the handle registry and public-safe profile eligibility fields", () => {
    const compiled = buildPublicProfileLifecycleQuery(
      testDb,
      "green_thumb",
    ).compile();

    expect(compiled.sql).toContain('from "user_handle_registry"');
    expect(compiled.sql).toContain('left join "user_public_profiles"');
    expect(compiled.sql).toContain(
      '"user_handle_registry"."normalized_handle" =',
    );
    expect(compiled.sql).toContain('"lifecycle_state"');
    expect(compiled.sql).toContain('"profile_visibility"');
    expect(compiled.sql).toContain('"profile_lifecycle_state"');
    expect(compiled.sql).toContain('"removed_at"');
    expect(compiled.sql).not.toMatch(/email|provider|session|token|journal/i);
    expect(compiled.sql.split(" from ")[0]).not.toMatch(
      /user_id|normalized_handle|display_name|handle as/i,
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."user_id" = "user_handle_registry"."user_id"',
    );
    expect(compiled.sql).not.toContain(
      '"user_public_profiles"."normalized_handle" =',
    );
  });

  it("fails retired and current lifecycle lookup closed across mutual blocks", () => {
    const compiled = buildPublicProfileLifecycleQuery(
      testDb,
      "green_thumb",
      userId,
    ).compile();

    expect(compiled.sql).toContain("not exists");
    expect(compiled.sql).toContain("from profile_blocks block");
    expect(compiled.sql).toContain("block.block_state = 'active'");
    expect(compiled.sql).toContain("block.blocker_user_id");
    expect(compiled.sql).toContain("block.blocked_user_id");
    expect(compiled.parameters).toEqual(["green_thumb", userId, userId]);
  });

  it("returns gone for a retired handle without disclosing or following the current profile", () => {
    expect(
      classifyPublicProfileLifecycle({
        handleLifecycleState: "retired",
        profileVisibility: "public",
        profileLifecycleState: "active",
        removedAt: null,
      }),
    ).toEqual({ status: "gone" });
  });

  it("returns active only for a current public eligible profile and otherwise fails closed", () => {
    expect(
      classifyPublicProfileLifecycle({
        handleLifecycleState: "current",
        profileVisibility: "public",
        profileLifecycleState: "active",
        removedAt: null,
      }),
    ).toEqual({ status: "active" });

    for (const ineligible of [
      null,
      {
        handleLifecycleState: "retired",
        profileVisibility: "private",
        profileLifecycleState: "active",
        removedAt: null,
      },
      {
        handleLifecycleState: "retired",
        profileVisibility: "public",
        profileLifecycleState: "removed",
        removedAt: "2026-07-18T12:00:00.000Z",
      },
      {
        handleLifecycleState: "current",
        profileVisibility: null,
        profileLifecycleState: null,
        removedAt: null,
      },
      {
        handleLifecycleState: "current",
        profileVisibility: "private",
        profileLifecycleState: "active",
        removedAt: null,
      },
      {
        handleLifecycleState: "current",
        profileVisibility: "public",
        profileLifecycleState: "removed",
        removedAt: "2026-07-18T12:00:00.000Z",
      },
      {
        handleLifecycleState: "unknown",
        profileVisibility: "public",
        profileLifecycleState: "active",
        removedAt: null,
      },
    ]) {
      expect(classifyPublicProfileLifecycle(ineligible)).toEqual({
        status: "not_found",
      });
    }
  });

  it("serializes the evidence page without user ids or media keys", () => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://media.over.garden");
    const page = serializePublicProfileEvidencePage({
      locale: "uk",
      profile: {
        userId,
        handle: "green_thumb",
        displayName: "Green Thumb",
        bio: "Dated observations from a small mixed garden.",
        languages: ["uk", "en"],
        locationVisibility: "region",
        coarseRegionCode: "UA-32",
        relationshipVisibility: "counts",
        avatarDerivativeKey: "profiles/avatar.png",
        avatarAltText: "Green leaves",
      },
      entrySummary: {
        publicEntryCount: "12",
        publicObjectCount: "3",
        publicPlantCount: "1",
        publicAnimalCount: "1",
        publicBeeColonyCount: "1",
      },
      lineageSummary: { confirmedLineageEdgeCount: "2" },
      followerSummary: { count: "4" },
      followingSummary: { count: "3" },
      objects: [
        {
          objectId: "00000000-0000-4000-8000-000000000201",
          displayName: "Balcony lemon",
          objectKind: "plant",
          catalogCanonicalName: "Citrus limon",
          catalogKind: "species",
          varietyText: null,
          varietyState: "selected",
          latestEntryDate: "2026-07-10",
          publicEntryCount: "4",
        },
      ],
      objectMedia: [
        {
          objectId: "00000000-0000-4000-8000-000000000201",
          entryId: "00000000-0000-4000-8000-000000000301",
          derivativeKey: "objects/lemon.png",
          altText: "Lemon leaves",
          focalX: 0.5,
          focalY: 0.5,
          intrinsicWidth: 800,
          intrinsicHeight: 600,
        },
      ],
      journals: [
        {
          entryId: "00000000-0000-4000-8000-000000000301",
          publicSlug: "lemon-new-growth",
          title: "New growth after moving the pot",
          body: "The newest leaves stayed firm through the warm afternoon.",
          entryDate: "2026-07-10",
          publishedAt: "2026-07-10T12:00:00.000Z",
          entryScope: "object",
          objectId: "00000000-0000-4000-8000-000000000201",
          objectDisplayName: "Balcony lemon",
          objectKind: "plant",
          spaceDisplayName: "Balcony",
        },
      ],
      journalMedia: [
        {
          entryId: "00000000-0000-4000-8000-000000000301",
          derivativeKey: "objects/lemon.png",
          altText: "Lemon leaves",
          focalX: 0.5,
          focalY: 0.5,
          intrinsicWidth: 800,
          intrinsicHeight: 600,
        },
      ],
    });

    expect(page.summary).toMatchObject({
      publicEntryCount: 12,
      publicObjectCount: 3,
      objectKinds: { plant: 1, animal: 1, beeColony: 1 },
      confirmedLineageEdgeCount: 2,
      relationships: { followers: 4, following: 3 },
    });
    expect(page.objects[0]).toMatchObject({
      displayName: "Balcony lemon",
      publicEntryCount: 4,
      coverImageUrl: "https://media.over.garden/objects/lemon.png",
    });
    expect(page.journals[0]).toMatchObject({
      title: "New growth after moving the pot",
      publicPath: "/journal/lemon-new-growth",
    });
    expect(JSON.stringify(page)).not.toContain(userId);
    expect(JSON.stringify(page)).not.toMatch(
      /derivativeKey|quarantine|ownerUserId|email|provider|session|token/i,
    );
  });

  it("serializes public profile readback without raw user ids", () => {
    const page = serializePublicProfilePage({
      profile: {
        userId,
        handle: "green_thumb",
        displayName: "Green Thumb",
        avatarUrl: null,
      },
      entrySummary: {
        publicEntryCount: "2",
        publicObjectCount: "1",
      },
      lineageSummary: {
        confirmedLineageEdgeCount: "3",
      },
      links: [
        {
          publicSlug: "first-public-entry",
          entryDate: "2026-07-04",
        },
      ],
    });

    expect(page).toEqual({
      handle: "green_thumb",
      mention: "@green_thumb",
      displayName: "Green Thumb",
      avatarUrl: null,
      summary: {
        publicEntryCount: 2,
        publicObjectCount: 1,
        confirmedLineageEdgeCount: 3,
      },
      links: [
        {
          kind: "journal_entry",
          href: "/journal/first-public-entry",
          entryDate: "2026-07-04",
        },
      ],
    });
    expect(JSON.stringify(page)).not.toContain(userId);
    expect(JSON.stringify(page)).not.toMatch(
      /email|provider|session|private journal|quarantine|derivative/i,
    );
  });

  it("models the public profile table with unique handle constraints and no PII columns", () => {
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const schemaSql = readFileSync(
      join(webRoot, "sql/0001_walking_skeleton.sql"),
      "utf8",
    );
    const tableMatch = schemaSql.match(
      /create table if not exists user_public_profiles \(([\s\S]*?)\);/,
    );

    expect(tableMatch).not.toBeNull();
    const tableBody = (tableMatch?.[1] ?? "").toLowerCase();
    expect(tableBody).toContain("user_id uuid primary key");
    expect(tableBody).toContain("handle text not null");
    expect(tableBody).toContain("normalized_handle text not null");
    expect(tableBody).not.toMatch(
      /email|provider|account|session|ip_address|user_agent|referrer|phone|invite|token|journal|quarantine|derivative_key/,
    );
    expect(schemaSql).toContain("user_public_profiles_handle_uidx");
    expect(schemaSql).toContain("user_public_profiles_normalized_handle_uidx");
  });

  it("bounds public profile evidence fields and keeps location coarse or hidden", () => {
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const schemaSql = readFileSync(
      join(webRoot, "sql/0001_walking_skeleton.sql"),
      "utf8",
    );
    const tableMatch = schemaSql.match(
      /create table if not exists user_public_profiles \(([\s\S]*?)\);/,
    );

    expect(tableMatch).not.toBeNull();
    const tableBody = (tableMatch?.[1] ?? "").toLowerCase();
    expect(tableBody).toContain("bio text");
    expect(tableBody).toContain("languages text[]");
    expect(tableBody).toContain("location_visibility text");
    expect(tableBody).toContain("coarse_region_code text");
    expect(tableBody).toContain("profile_visibility text");
    expect(tableBody).toContain("profile_lifecycle_state text");
    expect(tableBody).toContain("relationship_visibility text");
    expect(tableBody).toContain("avatar_media_asset_id uuid");
    expect(schemaSql).toContain("user_public_profiles_bio_check");
    expect(schemaSql).toContain("user_public_profiles_languages_check");
    expect(schemaSql).toContain(
      "user_public_profiles_coarse_region_code_check",
    );
    expect(schemaSql).toContain(
      "user_public_profiles_avatar_media_asset_id_fkey",
    );
    expect(tableBody).not.toMatch(
      /birthday|city|latitude|longitude|phone|email|provider|token/,
    );
  });

  it("models idempotent profile follow, block, and report relationships", () => {
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const schemaSql = readFileSync(
      join(webRoot, "sql/0001_walking_skeleton.sql"),
      "utf8",
    ).toLowerCase();

    expect(schemaSql).toContain("create table if not exists profile_follows");
    expect(schemaSql).toContain("profile_follows_actor_target_uidx");
    expect(schemaSql).toContain("follower_user_id <> target_user_id");
    expect(schemaSql).toContain("follow_state in ('active', 'removed')");

    expect(schemaSql).toContain("create table if not exists profile_blocks");
    expect(schemaSql).toContain("profile_blocks_actor_target_uidx");
    expect(schemaSql).toContain("blocker_user_id <> blocked_user_id");
    expect(schemaSql).toContain("block_state in ('active', 'removed')");

    expect(schemaSql).toContain("create table if not exists profile_reports");
    expect(schemaSql).toContain("profile_reports_actor_target_uidx");
    expect(schemaSql).toContain("reporter_user_id <> target_user_id");
    expect(schemaSql).toContain(
      "report_reason in ('spam', 'harassment', 'privacy', 'impersonation', 'other')",
    );
    expect(schemaSql).not.toMatch(
      /profile_(?:follows|blocks|reports)[\s\s]*?(?:email|ip_address|user_agent|precise|latitude|longitude)/,
    );
  });

  it("keeps legacy journal backfill away from valid space-level entries", () => {
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const schemaSql = readFileSync(
      join(webRoot, "sql/0001_walking_skeleton.sql"),
      "utf8",
    );
    const backfill = schemaSql.match(
      /with owners as \(([\s\S]*?)alter table journal_entries/,
    )?.[1];

    expect(backfill).toBeTruthy();
    expect(backfill).toContain("entry_scope = 'object'");
    expect(backfill).not.toMatch(
      /where owner_user_id is not null\s+and \(space_id is null or plant_object_id is null\)/,
    );
  });
});
