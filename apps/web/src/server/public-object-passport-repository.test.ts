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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import {
  buildPublicObjectPassportLifecycleQuery,
  buildPublicObjectPassportGalleryQuery,
  buildPublicObjectPassportRootQuery,
  buildPublicObjectPassportTimelineQuery,
  publicObjectPassportLocationLabel,
  serializePublicObjectPassportPage,
  classifyPublicObjectPassportLifecycle,
} from "./public-object-passport-repository";

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
const plantObjectId = "00000000-0000-4000-8000-000000000101";

describe("public object passport repository query contracts", () => {
  beforeEach(() => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://media.over.garden");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("opens passports only for objects backed by active public entries", () => {
    const compiled = buildPublicObjectPassportRootQuery(
      testDb,
      plantObjectId,
    ).compile();

    expect(compiled.sql).toContain('from "plant_objects"');
    expect(compiled.sql).toContain(
      'inner join "journal_entries" as "public_entries"',
    );
    expect(compiled.sql).toContain(
      '"public_entries"."plant_object_id" = "plant_objects"."id"',
    );
    expect(compiled.sql).toContain(
      '"public_entries"."owner_user_id" = "plant_objects"."owner_user_id"',
    );
    expect(compiled.sql).toContain('"public_entries"."visibility" = $1');
    expect(compiled.sql).toContain('"public_entries"."lifecycle_state" = $2');
    expect(compiled.sql).toContain('"public_entries"."public_gone_at" is null');
    expect(compiled.sql).toContain(
      '"public_entries"."public_slug" is not null',
    );
    expect(compiled.sql).toContain(
      'left join "user_handle_registry" on "user_handle_registry"."user_id" = "plant_objects"."owner_user_id"',
    );
    expect(compiled.sql).toContain(
      '"user_handle_registry"."lifecycle_state" = $5',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."user_id" = "user_handle_registry"."user_id"',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."normalized_handle" = "user_handle_registry"."normalized_handle"',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."profile_visibility" = $6',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."profile_lifecycle_state" = $7',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."removed_at" is null',
    );
    expect(compiled.sql).toContain('"catalog_items"."status" in ($3, $4)');
    expect(compiled.sql).toContain('"plant_objects"."id" = $8');
    expect(compiled.sql).not.toMatch(
      /journal_entries"\."title|journal_entries"\."body|media_assets|quarantine_key|derivative_key|ip_address|user_agent|email|phone|coordinates|latitude|longitude|source_reference_label|client_mutation_id|pending_identity/i,
    );
    expect(compiled.parameters).toEqual([
      "public",
      "active",
      "seeded",
      "confirmed",
      "current",
      "public",
      "active",
      plantObjectId,
    ]);
  });

  it("classifies public lifecycle without selecting private object content", () => {
    const compiled = buildPublicObjectPassportLifecycleQuery(
      testDb,
      plantObjectId,
    ).compile();

    expect(compiled.sql).toContain('from "plant_objects"');
    expect(compiled.sql).toContain('left join "journal_entries"');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).toContain('"journal_entries"."visibility" =');
    expect(compiled.sql).toContain("publicAnchorCount");
    expect(compiled.sql).toContain("activePublicCount");
    expect(compiled.sql).toContain("gonePublicCount");
    expect(compiled.sql).not.toMatch(
      /display_name|title|body|email|owner_user_id as|coarse_region|location_visibility|media_assets|quarantine|derivative/i,
    );
  });

  it("returns gone only for a previously public passport with no active anchor", () => {
    expect(
      classifyPublicObjectPassportLifecycle({
        plantObjectId,
        publicAnchorCount: 3,
        activePublicCount: 0,
        gonePublicCount: 3,
      }),
    ).toBe("gone");
    expect(
      classifyPublicObjectPassportLifecycle({
        plantObjectId,
        publicAnchorCount: 1,
        activePublicCount: 1,
        gonePublicCount: 0,
      }),
    ).toBe("not_found");
    expect(
      classifyPublicObjectPassportLifecycle({
        plantObjectId,
        publicAnchorCount: 0,
        activePublicCount: 0,
        gonePublicCount: 0,
      }),
    ).toBe("not_found");
  });

  it("reads the public journal preview with processed derivative media only", () => {
    const compiled = buildPublicObjectPassportTimelineQuery(
      testDb,
      plantObjectId,
      3,
    ).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('inner join "plant_objects"');
    expect(compiled.sql).not.toContain('left join "media_assets"');
    expect(compiled.sql).toContain('from "media_assets"');
    expect(compiled.sql).toContain(
      '"first_public_media"."journalEntryId" = "journal_entries"."id"',
    );
    expect(compiled.sql).toContain(
      '"first_public_media"."ownerUserId" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain('"media_assets"."status" = $1');
    expect(compiled.sql).toContain(
      '"media_assets"."derivative_key" is not null',
    );
    expect(compiled.sql).toContain("select distinct on");
    expect(compiled.sql).toContain("cover_media_asset_id");
    expect(compiled.sql).toContain('"media_assets"."document_position" asc');
    expect(compiled.sql).not.toContain('"media_assets"."created_at" asc');
    expect(compiled.sql).toContain('"journal_entries"."visibility" = $5');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $6');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).not.toMatch(
      /quarantine_key|ip_address|user_agent|email|phone|coordinates|latitude|longitude|source_reference_label|client_mutation_id|pending_identity/i,
    );
    expect(compiled.parameters).toEqual([
      "processed",
      "public_ready",
      "inline",
      plantObjectId,
      "public",
      "active",
      3,
    ]);
  });

  it("reads a bounded public derivative gallery across all visible entries", () => {
    const compiled = buildPublicObjectPassportGalleryQuery(
      testDb,
      plantObjectId,
    ).compile();

    expect(compiled.sql).toContain('from "media_assets"');
    expect(compiled.sql).toContain('inner join "journal_entries"');
    expect(compiled.sql).toContain('inner join "plant_objects"');
    expect(compiled.sql).toContain('"media_assets"."status" = $1');
    expect(compiled.sql).toContain(
      '"media_assets"."derivative_key" is not null',
    );
    expect(compiled.sql).toContain('"journal_entries"."visibility" = $5');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $6');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).toContain('"media_assets"."usage_role" =');
    expect(compiled.sql).toContain('"media_assets"."document_position" asc');
    expect(compiled.sql).not.toContain('"media_assets"."created_at" asc');
    expect(compiled.parameters.at(-1)).toBe(6);
    expect(compiled.sql).not.toMatch(/quarantine_key|owner_user_id as|email/i);
  });

  it("fetches one page-size overflow record for the real show-more state", () => {
    const compiled = buildPublicObjectPassportTimelineQuery(
      testDb,
      plantObjectId,
    ).compile();

    expect(compiled.parameters.at(-1)).toBe(40);
  });

  it("suppresses hidden or unsupported region labels", () => {
    expect(
      publicObjectPassportLocationLabel({
        objectLocationVisibility: "region",
        objectCoarseRegionCode: "UA-30",
        spaceLocationVisibility: "region",
        spaceCoarseRegionCode: "UA-32",
      }),
    ).toBe("Region: Ukraine - Kyiv City");
    expect(
      publicObjectPassportLocationLabel({
        objectLocationVisibility: "hidden",
        objectCoarseRegionCode: "UA-30",
        spaceLocationVisibility: "region",
        spaceCoarseRegionCode: "UA-32",
      }),
    ).toBeNull();
    expect(
      publicObjectPassportLocationLabel({
        objectLocationVisibility: "region",
        objectCoarseRegionCode: "Kyiv apartment balcony",
        spaceLocationVisibility: "hidden",
        spaceCoarseRegionCode: "UA-32",
      }),
    ).toBeNull();
  });

  it("serializes only public paths, labels, profile handles, and media URLs", () => {
    const page = serializePublicObjectPassportPage(
      {
        plantObjectId,
        displayName: "Balcony tomato",
        objectKind: "plant",
        varietyText: "Red Cherry",
        varietyState: "selected",
        catalogKind: "plant_variety",
        catalogCanonicalName: "Red Cherry tomato",
        catalogPublicSlug: "red-cherry-tomato-0000000101",
        objectLocationVisibility: "region",
        objectCoarseRegionCode: "UA-30",
        spaceLocationVisibility: "region",
        spaceCoarseRegionCode: "UA-32",
        publicEntryCount: "10",
        firstEntryDate: new Date("2026-07-01T12:00:00.000Z"),
        latestEntryDate: new Date("2026-07-04T12:00:00.000Z"),
        authorHandle: "green_thumb",
        authorDisplayName: "Green Thumb",
        authorAvatarUrl: null,
      },
      Array.from({ length: 10 }, (_, index) => ({
        entryId: `00000000-0000-4000-8000-${String(index + 301).padStart(12, "0")}`,
        entryTitle: index === 0 ? "First flowering" : `Entry ${index + 1}`,
        entryBody:
          index === 0
            ? "Two new flower clusters opened after the balcony warmed."
            : `Public journal body ${index + 1}.`,
        entryDate: new Date(`2026-07-0${Math.min(index + 1, 9)}T12:00:00.000Z`),
        entryPublicSlug: index === 0 ? "first-flowering" : `entry-${index + 1}`,
        mediaDerivativeKey:
          index === 0 ? "derivatives/first-flowering.webp" : null,
        mediaFocalX: index === 0 ? 0.5 : null,
        mediaFocalY: index === 0 ? 0.5 : null,
        mediaIntrinsicWidth: index === 0 ? 1200 : null,
        mediaIntrinsicHeight: index === 0 ? 900 : null,
      })),
      [
        {
          mediaId: "media-1",
          mediaDerivativeKey: "derivatives/first-flowering.webp",
          mediaFocalX: 0.5,
          mediaFocalY: 0.5,
          mediaIntrinsicWidth: 1200,
          mediaIntrinsicHeight: 900,
        },
        {
          mediaId: "media-2",
          mediaDerivativeKey: "derivatives/portrait.webp",
          mediaFocalX: 0.25,
          mediaFocalY: 0.75,
          mediaIntrinsicWidth: 800,
          mediaIntrinsicHeight: 1200,
        },
      ],
    );

    expect(page.object.catalogPath).toBe(
      "/variety/red-cherry-tomato-0000000101",
    );
    expect(page.object.safeLocationLabel).toBe("Region: Ukraine - Kyiv City");
    expect(page.author).toMatchObject({
      handle: "green_thumb",
      mention: "@green_thumb",
      displayName: "Green Thumb",
      profilePath: "/@green_thumb",
    });
    expect(page.journalPreview[0]).toMatchObject({
      title: "First flowering",
      bodyPreview: "Two new flower clusters opened after the balcony warmed.",
      publicPath: "/journal/first-flowering",
      mediaPublicUrl:
        "https://media.over.garden/derivatives/first-flowering.webp",
    });
    expect(page.journalPreview).toHaveLength(5);
    expect(page.journalContinuation).toHaveLength(5);
    expect(page.journalContinuation.at(-1)?.title).toBe("Entry 10");
    expect(page.timelineHasMore).toBe(false);
    expect(page.galleryMediaPublicUrls).toEqual([
      "https://media.over.garden/derivatives/first-flowering.webp",
      "https://media.over.garden/derivatives/portrait.webp",
    ]);
    expect(JSON.stringify(page)).not.toMatch(
      /quarantine_key|derivative_key|owner_user_id|email|phone|coordinates|location_visibility|coarse_region/i,
    );
  });
});
