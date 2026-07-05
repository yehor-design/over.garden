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
  buildPublicObjectPassportRootQuery,
  buildPublicObjectPassportTimelineQuery,
  publicObjectPassportLocationLabel,
  serializePublicObjectPassportPage,
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
      'left join "user_public_profiles" on "user_public_profiles"."user_id" = "plant_objects"."owner_user_id"',
    );
    expect(compiled.sql).toContain('"catalog_items"."status" in ($3, $4)');
    expect(compiled.sql).toContain('"plant_objects"."id" = $5');
    expect(compiled.sql).not.toMatch(
      /journal_entries"\."title|journal_entries"\."body|media_assets|quarantine_key|derivative_key|ip_address|user_agent|email|phone|coordinates|latitude|longitude|source_reference_label|client_mutation_id|pending_identity/i,
    );
    expect(compiled.parameters).toEqual([
      "public",
      "active",
      "seeded",
      "confirmed",
      plantObjectId,
    ]);
  });

  it("reads the public journal preview with processed derivative media only", () => {
    const compiled = buildPublicObjectPassportTimelineQuery(
      testDb,
      plantObjectId,
      3,
    ).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('inner join "plant_objects"');
    expect(compiled.sql).toContain('left join "media_assets"');
    expect(compiled.sql).toContain('"media_assets"."status" = $1');
    expect(compiled.sql).toContain(
      '"media_assets"."derivative_key" is not null',
    );
    expect(compiled.sql).toContain('"journal_entries"."visibility" = $3');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $4');
    expect(compiled.sql).toContain('"journal_entries"."public_gone_at" is null');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).not.toMatch(
      /quarantine_key|ip_address|user_agent|email|phone|coordinates|latitude|longitude|source_reference_label|client_mutation_id|pending_identity/i,
    );
    expect(compiled.parameters).toEqual([
      "processed",
      plantObjectId,
      "public",
      "active",
      3,
    ]);
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
        publicEntryCount: "2",
        firstEntryDate: new Date("2026-07-01T12:00:00.000Z"),
        latestEntryDate: new Date("2026-07-04T12:00:00.000Z"),
        authorHandle: "green_thumb",
        authorDisplayName: "Green Thumb",
        authorAvatarUrl: null,
      },
      [
        {
          entryId: "00000000-0000-4000-8000-000000000301",
          entryTitle: "First flowering",
          entryBody: "Two new flower clusters opened after the balcony warmed.",
          entryDate: new Date("2026-07-04T12:00:00.000Z"),
          entryPublicSlug: "first-flowering",
          mediaDerivativeKey: "derivatives/first-flowering.webp",
        },
      ],
    );

    expect(page.object.catalogPath).toBe(
      "/variety/red-cherry-tomato-0000000101",
    );
    expect(page.object.safeLocationLabel).toBe(
      "Region: Ukraine - Kyiv City",
    );
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
    expect(JSON.stringify(page)).not.toMatch(
      /quarantine_key|derivative_key|owner_user_id|email|phone|coordinates|location_visibility|coarse_region/i,
    );
  });
});
