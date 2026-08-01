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
  buildPublicObjectCatalogGroupsQuery,
  normalizePublicObjectCatalogRequest,
  PUBLIC_OBJECT_CATALOG_PAGE_SIZE,
  serializePublicObjectCatalogPage,
  type PublicObjectCatalogGroupRow,
} from "./public-object-catalog-repository";

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

describe("public living-object catalog request", () => {
  it("normalizes allowlisted kind, identity, search, and page state", () => {
    expect(
      normalizePublicObjectCatalogRequest({
        kind: " ANIMAL ",
        identity: " BREED ",
        q: "  Українська   місцева  ",
        page: "2",
      }),
    ).toEqual({
      kind: "animal",
      identity: "breed",
      query: "Українська місцева",
      page: 2,
    });
  });

  it("fails closed to harmless defaults for arrays, unsupported filters, and abusive pages", () => {
    expect(
      normalizePublicObjectCatalogRequest({
        kind: ["plant", "animal"],
        identity: "private",
        q: "x".repeat(200),
        page: "999999999",
      }),
    ).toEqual({
      kind: "all",
      identity: "all",
      query: "x".repeat(120),
      page: 1_000,
    });
  });
});

describe("public living-object catalog query", () => {
  it("groups only public active published evidence through owner-consistent objects", () => {
    const compiled = buildPublicObjectCatalogGroupsQuery(testDb, {
      kind: "animal",
      identity: "breed",
      query: "карпатська",
      page: 2,
    }).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('inner join "plant_objects"');
    expect(compiled.sql).toContain(
      '"plant_objects"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain('left join "catalog_items"');
    expect(compiled.sql).toContain('from "catalog_item_names"');
    expect(compiled.sql).toContain('from "media_assets"');
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
    expect(compiled.sql).toContain('"plant_objects"."object_kind" =');
    expect(compiled.sql).toContain('"catalog_items"."catalog_kind" =');
    expect(compiled.sql).toContain("count(distinct");
    expect(compiled.sql).toContain("count(*) over()");
    expect(compiled.sql).toContain("ilike");
    expect(compiled.sql).toContain(
      `limit $${compiled.parameters.length - 1} offset $${compiled.parameters.length}`,
    );
    expect(compiled.parameters).toContain("public");
    expect(compiled.parameters).toContain("active");
    expect(compiled.parameters).toContain("animal");
    expect(compiled.parameters).toContain("breed");
    expect(compiled.parameters).toContain("%карпатська%");
    expect(compiled.parameters).toContain(PUBLIC_OBJECT_CATALOG_PAGE_SIZE + 1);
    expect(compiled.parameters).toContain(PUBLIC_OBJECT_CATALOG_PAGE_SIZE);
  });

  it("never selects private, exact-location, raw-source, or storage-key fields", () => {
    const sql = buildPublicObjectCatalogGroupsQuery(testDb, {
      kind: "all",
      identity: "all",
      query: "",
      page: 1,
    }).compile().sql;

    expect(sql).not.toMatch(
      /space_id|coarse_region|location_visibility|email|ip_address|user_agent|raw_payload|source_only_fields|source_record_key|quarantine_key|latitude|longitude|coordinates/i,
    );
    expect(sql).not.toContain('join "catalog_source_records"');
    expect(sql).not.toContain('join "catalog_source_snapshots"');
    expect(sql).not.toContain('join "spaces"');
  });

  it("treats SQL LIKE wildcards in a public query as literal characters", () => {
    const compiled = buildPublicObjectCatalogGroupsQuery(testDb, {
      kind: "all",
      identity: "all",
      query: "bee%_\\hive",
      page: 1,
    }).compile();

    expect(compiled.sql).toContain("ilike");
    expect(compiled.parameters).toContain("%bee\\%\\_\\\\hive%");
    expect(
      compiled.parameters.filter((value) => value === "%bee\\%\\_\\\\hive%"),
    ).toHaveLength(4);
    expect(compiled.parameters).not.toContain("%bee%_\\hive%");
  });
});

describe("public living-object catalog serialization", () => {
  it("keeps domain identity states explicit and exposes only real evidence links", () => {
    const page = serializePublicObjectCatalogPage(
      [
        row({
          groupKey: "catalog:1",
          objectKind: "plant",
          identityState: "catalog",
          catalogItemId: "00000000-0000-4000-8000-000000000101",
          catalogKind: "plant_variety",
          identityName: "Помідор чері",
          catalogPublicSlug: "pomidor-cheri-0000000101",
          catalogStatus: "confirmed",
          objectCount: 2,
          journalCount: 5,
          mediaDerivativeKey: "public/catalog/tomato.png",
          totalCount: 4,
        }),
        row({
          groupKey: "provisional:animal:local",
          objectKind: "animal",
          identityState: "provisional",
          identityName: "Українська місцева",
          catalogItemId: null,
          catalogKind: null,
          catalogPublicSlug: null,
          catalogStatus: null,
          mediaDerivativeKey: null,
          totalCount: 4,
        }),
        row({
          groupKey: "provisional:animal:unsafe",
          objectKind: "animal",
          identityState: "provisional",
          identityName: "Коза +359 888 123 456 GPS 42.1, 23.3",
          catalogItemId: null,
          catalogKind: null,
          catalogPublicSlug: null,
          catalogStatus: null,
          totalCount: 4,
        }),
        row({
          groupKey: "unavailable:bee:1",
          objectKind: "animal",
          identityState: "unavailable",
          identityName: null,
          catalogItemId: null,
          catalogKind: null,
          catalogPublicSlug: null,
          catalogStatus: null,
          totalCount: 4,
        }),
      ],
      "bg",
      {
        kind: "all",
        identity: "all",
        query: "",
        page: 1,
      },
      PUBLIC_OBJECT_CATALOG_PAGE_SIZE,
      (key) => `https://media.example/${key}`,
    );

    expect(page.totalCount).toBe(4);
    expect(page.cards[0]).toMatchObject({
      objectKind: "plant",
      identityState: "catalog",
      identityName: "Помідор чері",
      catalogKind: "plant_variety",
      catalogPath: "/variety/pomidor-cheri-0000000101",
      objectCount: 2,
      journalCount: 5,
      mediaPublicUrl: "https://media.example/public/catalog/tomato.png",
      representativeObject: {
        path: "/lineage/objects/00000000-0000-4000-8000-000000000201",
      },
      latestJournal: { path: "/bg/journal/catalog-entry" },
    });
    expect(page.cards[1]).toMatchObject({
      objectKind: "animal",
      identityState: "provisional",
      identityName: "Українська місцева",
      catalogPath: null,
    });
    expect(page.cards[2]).toMatchObject({
      identityState: "unknown",
      identityName: null,
    });
    expect(page.cards[3]).toMatchObject({
      objectKind: "animal",
      identityState: "unavailable",
      identityName: null,
    });
    expect(JSON.stringify(page)).not.toMatch(
      /ownerUserId|spaceId|coarseRegion|locationVisibility|derivativeKey|quarantine|latitude|longitude|coordinates/i,
    );
  });

  it("keeps page-size-plus-one pagination deterministic", () => {
    const rows = Array.from(
      { length: PUBLIC_OBJECT_CATALOG_PAGE_SIZE + 1 },
      (_, index) =>
        row({
          groupKey: `unknown:plant:${index}`,
          totalCount: PUBLIC_OBJECT_CATALOG_PAGE_SIZE + 1,
        }),
    );
    const page = serializePublicObjectCatalogPage(rows, "bg", {
      kind: "plant",
      identity: "all",
      query: "",
      page: 1,
    });

    expect(page.cards).toHaveLength(PUBLIC_OBJECT_CATALOG_PAGE_SIZE);
    expect(page.hasPreviousPage).toBe(false);
    expect(page.hasNextPage).toBe(true);
    expect(page.totalPages).toBe(2);
  });

  it("uses species and breed evidence routes instead of relabeling them as varieties", () => {
    const species = serializePublicObjectCatalogPage(
      [
        row({
          identityState: "catalog",
          catalogKind: "species",
          catalogStatus: "seeded",
          catalogItemId: "00000000-0000-4000-8000-000000000401",
          catalogPublicSlug: "solanum-lycopersicum",
          identityName: "Solanum lycopersicum",
        }),
      ],
      "uk",
      { kind: "plant", identity: "species", query: "", page: 1 },
    );
    const breed = serializePublicObjectCatalogPage(
      [
        row({
          identityState: "catalog",
          catalogKind: "breed",
          catalogStatus: "seeded",
          catalogItemId: "00000000-0000-4000-8000-000000000402",
          catalogPublicSlug: "carpathian-bee",
          identityName: "Карпатська бджола",
        }),
      ],
      "uk",
      { kind: "animal", identity: "breed", query: "", page: 1 },
    );

    expect(species.cards[0]?.catalogPath).toBe("/species/solanum-lycopersicum");
    expect(breed.cards[0]?.catalogPath).toBe("/breed/carpathian-bee");
  });
});

function row(
  overrides: Partial<PublicObjectCatalogGroupRow> = {},
): PublicObjectCatalogGroupRow {
  return {
    groupKey: "unknown:plant",
    objectKind: "plant",
    identityState: "unknown",
    catalogItemId: null,
    catalogKind: null,
    identityName: null,
    catalogPublicSlug: null,
    catalogStatus: null,
    objectCount: 1,
    journalCount: 1,
    representativeObjectId: "00000000-0000-4000-8000-000000000201",
    representativeObjectName: "Тестовий живий об'єкт",
    latestEntryTitle: "Спостереження за сезоном",
    latestEntryPublicSlug: "catalog-entry",
    latestEntryDate: "2026-07-10",
    mediaDerivativeKey: null,
    totalCount: 1,
    ...overrides,
  };
}
