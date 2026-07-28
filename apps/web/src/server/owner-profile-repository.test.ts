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
  buildBlockedProfileSummariesQuery,
  buildOwnerAvatarOptionsQuery,
  buildOwnerCurrentHandleClaimQuery,
  buildOwnerPublicProfileByUserIdQuery,
  buildUpdateOwnerPublicProfileQuery,
  normalizeOwnerPublicProfileInput,
  serializeOwnerPublicProfileEditor,
} from "./owner-profile-repository";

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
const ownerUserId = "00000000-0000-4000-8000-000000000001";
const scope = scopedToUser(ownerUserId, "session-1");

describe("owner profile repository", () => {
  it("normalizes bounded public settings without accepting exact place fields", () => {
    expect(
      normalizeOwnerPublicProfileInput({
        avatarMediaAssetId: "00000000-0000-4000-8000-000000000111",
        displayName: "  Olena  ",
        bio: "  Dated observations from a mixed garden.  ",
        languages: ["uk", "en", "uk"],
        locationVisibility: "region",
        coarseRegionCode: "ua-32",
        profileVisibility: "public",
        relationshipVisibility: "counts",
      }),
    ).toEqual({
      ok: true,
      value: {
        avatarMediaAssetId: "00000000-0000-4000-8000-000000000111",
        displayName: "Olena",
        bio: "Dated observations from a mixed garden.",
        languages: ["uk", "en"],
        locationVisibility: "region",
        coarseRegionCode: "UA-32",
        profileVisibility: "public",
        relationshipVisibility: "counts",
      },
    });
    expect(
      normalizeOwnerPublicProfileInput({
        avatarMediaAssetId: null,
        displayName: "Olena",
        bio: "x".repeat(601),
        languages: ["uk"],
        locationVisibility: "hidden",
        coarseRegionCode: null,
        profileVisibility: "public",
        relationshipVisibility: "counts",
      }),
    ).toEqual({ ok: false, error: "bio" });
    expect(
      normalizeOwnerPublicProfileInput({
        avatarMediaAssetId: null,
        displayName: "Olena",
        bio: null,
        languages: ["de"],
        locationVisibility: "hidden",
        coarseRegionCode: null,
        profileVisibility: "public",
        relationshipVisibility: "counts",
      }),
    ).toEqual({ ok: false, error: "languages" });
    expect(
      normalizeOwnerPublicProfileInput({
        avatarMediaAssetId: null,
        displayName: "Olena",
        bio: null,
        languages: ["uk"],
        locationVisibility: "region",
        coarseRegionCode: null,
        profileVisibility: "public",
        relationshipVisibility: "counts",
      }),
    ).toEqual({ ok: false, error: "region" });
    expect(
      normalizeOwnerPublicProfileInput({
        avatarMediaAssetId: "not-an-owned-media-id",
        displayName: "Olena",
        bio: null,
        languages: ["uk"],
        locationVisibility: "hidden",
        coarseRegionCode: null,
        profileVisibility: "public",
        relationshipVisibility: "counts",
      }),
    ).toEqual({ ok: false, error: "avatar" });
  });

  it("reads owner settings only through request scope and no account join", () => {
    const compiled = buildOwnerPublicProfileByUserIdQuery(
      testDb,
      scope,
    ).compile();

    expect(compiled.sql).toContain('from "user_public_profiles"');
    expect(compiled.sql).toContain('"user_id" =');
    expect(compiled.parameters).toContain(ownerUserId);
    expect(compiled.sql).not.toMatch(
      /join "user"|email|provider|session|token|ip_address|user_agent/i,
    );
  });

  it("updates every public setting inside the signed-in owner scope", () => {
    const compiled = buildUpdateOwnerPublicProfileQuery(testDb, scope, {
      avatarMediaAssetId: "00000000-0000-4000-8000-000000000111",
      displayName: "Olena",
      bio: "Dated observations.",
      languages: ["uk", "en"],
      locationVisibility: "region",
      coarseRegionCode: "UA-32",
      profileVisibility: "public",
      relationshipVisibility: "counts",
    }).compile();

    expect(compiled.sql).toContain('update "user_public_profiles"');
    expect(compiled.sql).toContain('"user_id" =');
    expect(compiled.sql).toContain('"profile_visibility" =');
    expect(compiled.sql).toContain('"relationship_visibility" =');
    expect(compiled.sql).toContain('"coarse_region_code" =');
    expect(compiled.sql).toContain('"avatar_media_asset_id" =');
    expect(compiled.sql).toContain('"display_name_policy_version" =');
    expect(compiled.sql).not.toContain('"handle" =');
    expect(compiled.sql).not.toContain('"normalized_handle" =');
    expect(compiled.sql).toContain('from "media_assets"');
    expect(compiled.sql).toContain('"owner_user_id" =');
    expect(compiled.sql).toContain('"status" =');
    expect(compiled.parameters).toContain(ownerUserId);
    expect(compiled.parameters).not.toContain("session-1");
  });

  it("reads the authoritative current handle cooldown in owner scope", () => {
    const compiled = buildOwnerCurrentHandleClaimQuery(testDb, scope).compile();

    expect(compiled.sql).toContain('from "user_handle_registry"');
    expect(compiled.sql).toContain('"user_id" =');
    expect(compiled.sql).toContain('"lifecycle_state" =');
    expect(compiled.sql).toContain('"next_rename_at" as "nextEligibleAt"');
    expect(compiled.parameters).toContain(ownerUserId);
  });

  it("offers only processed owner derivatives as avatar candidates", () => {
    const compiled = buildOwnerAvatarOptionsQuery(testDb, scope).compile();

    expect(compiled.sql).toContain('from "media_assets"');
    expect(compiled.sql).toContain('"owner_user_id" =');
    expect(compiled.sql).toContain('"status" =');
    expect(compiled.sql).toContain('"derivative_key" is not null');
    expect(compiled.parameters).toContain(ownerUserId);
    expect(compiled.sql).not.toMatch(/quarantine_key|latitude|longitude/i);
    expect(compiled.sql).not.toContain('"original_deleted_at" as');
    expect(compiled.sql).toContain('"original_deleted_at" is not null');
  });

  it("lists only active blocks created by the current owner", () => {
    const compiled = buildBlockedProfileSummariesQuery(testDb, scope).compile();

    expect(compiled.sql).toContain('from "profile_blocks"');
    expect(compiled.sql).toContain('inner join "user_public_profiles"');
    expect(compiled.sql).toContain('"profile_blocks"."blocker_user_id" =');
    expect(compiled.sql).toContain('"profile_blocks"."block_state" =');
    expect(compiled.parameters).toContain(ownerUserId);
    expect(compiled.sql).not.toMatch(/email|provider|session|token|bio/i);
  });

  it("serializes editor data without account or moderation fields", () => {
    const editor = serializeOwnerPublicProfileEditor({
      handle: "green_thumb",
      avatarMediaAssetId: "00000000-0000-4000-8000-000000000111",
      displayName: "Olena",
      bio: "Dated observations.",
      languages: ["uk", "en"],
      locationVisibility: "region",
      coarseRegionCode: "UA-32",
      profileVisibility: "public",
      relationshipVisibility: "counts",
    });

    expect(editor).toEqual({
      handle: "green_thumb",
      avatarMediaAssetId: "00000000-0000-4000-8000-000000000111",
      displayName: "Olena",
      bio: "Dated observations.",
      languages: ["uk", "en"],
      locationVisibility: "region",
      coarseRegionCode: "UA-32",
      profileVisibility: "public",
      relationshipVisibility: "counts",
    });
    expect(JSON.stringify(editor)).not.toMatch(
      /email|provider|session|token|report|moderation|userId/i,
    );
  });
});
