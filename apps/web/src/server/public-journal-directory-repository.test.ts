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
  buildPublicJournalDirectoryEntriesQuery,
  normalizePublicJournalDirectoryRequest,
  PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE,
  serializePublicJournalDirectoryPage,
  type PublicJournalDirectoryEntryRow,
} from "./public-journal-directory-repository";

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

describe("public journal directory request", () => {
  it("normalizes every supported URL-owned discovery dimension", () => {
    expect(
      normalizePublicJournalDirectoryRequest({
        q: "  зимова   волога  ",
        kind: " BEE_COLONY ",
        catalog: " VISUAL-APIS-MELLIFERA ",
        topic: " STRESS-AND-RECOVERY ",
        season: " WINTER ",
        region: " bg-23 ",
        sort: " OLDEST ",
        page: "3",
      }),
    ).toEqual({
      query: "зимова волога",
      kind: "bee_colony",
      catalog: "visual-apis-mellifera",
      topic: "stress-and-recovery",
      season: "winter",
      region: "BG-23",
      sort: "oldest",
      page: 3,
    });
  });

  it("defaults text search to relevance and bounded browse to recent", () => {
    expect(normalizePublicJournalDirectoryRequest({ q: "томати" })).toEqual({
      query: "томати",
      kind: "all",
      catalog: null,
      topic: null,
      season: "all",
      region: null,
      sort: "relevance",
      page: 1,
    });
    expect(normalizePublicJournalDirectoryRequest({})).toEqual({
      query: "",
      kind: "all",
      catalog: null,
      topic: null,
      season: "all",
      region: null,
      sort: "recent",
      page: 1,
    });
  });

  it("rejects coordinate/contact searches and fails unsupported state to harmless defaults", () => {
    expect(
      normalizePublicJournalDirectoryRequest({
        q: "42.12345, 23.54321 owner@example.com",
        kind: ["plant", "animal"],
        catalog: "../../private",
        topic: "private text",
        season: "monsoon",
        region: "BG-99",
        sort: "popular",
        page: "99999999",
      }),
    ).toEqual({
      query: "",
      kind: "all",
      catalog: null,
      topic: null,
      season: "all",
      region: null,
      sort: "recent",
      page: 1_000,
    });
  });

  it("bounds long queries without accepting hidden precision", () => {
    expect(
      normalizePublicJournalDirectoryRequest({ q: "спостереження ".repeat(20) })
        .query,
    ).toHaveLength(120);
  });
});

describe("public journal directory query", () => {
  it("revalidates every search hint through public canonical rows and safe filters", () => {
    const compiled = buildPublicJournalDirectoryEntriesQuery(
      testDb,
      {
        query: "волога",
        kind: "plant",
        catalog: "visual-pomidor-cheri",
        topic: "stress-and-recovery",
        season: "summer",
        region: "UA-30",
        sort: "relevance",
        page: 2,
      },
      [
        "00000000-0000-4000-8000-000000000010",
        "00000000-0000-4000-8000-000000000011",
      ],
    ).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('inner join "plant_objects"');
    expect(compiled.sql).toContain('inner join "spaces"');
    expect(compiled.sql).toContain(
      '"plant_objects"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain(
      '"spaces"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
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
    expect(compiled.sql).toContain('"journal_entries"."entry_scope" =');
    expect(compiled.sql).toContain('from "journal_entry_topic_signals"');
    expect(compiled.sql).toContain('"journal_topics"."trust_state" =');
    expect(compiled.sql).toContain('"catalog_items"."status" in');
    expect(compiled.sql).toContain(
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(compiled.sql).toContain(
      'left join "user_handle_registry" on "user_handle_registry"."user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain(
      '"user_handle_registry"."lifecycle_state" =',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."user_id" = "user_handle_registry"."user_id"',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."normalized_handle" = "user_handle_registry"."normalized_handle"',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."profile_visibility" =',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."profile_lifecycle_state" =',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."removed_at" is null',
    );
    expect(compiled.sql).toContain('"plant_objects"."location_visibility" =');
    expect(compiled.sql).toContain("extract(month");
    expect(compiled.sql).toContain("array_position");
    expect(compiled.sql).toContain("count(*) over()");
    expect(compiled.sql).toContain("ilike");
    expect(compiled.parameters).toContain("public");
    expect(compiled.parameters).toContain("active");
    expect(compiled.parameters).toContain("current");
    expect(compiled.parameters).toContain("object");
    expect(compiled.parameters).toContain("plant");
    expect(compiled.parameters).toContain("visual-pomidor-cheri");
    expect(compiled.parameters).toContain("stress-and-recovery");
    expect(compiled.parameters).toContain("UA-30");
    expect(compiled.parameters).toContain("%волога%");
    expect(compiled.parameters).toContain(
      PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE + 1,
    );
    expect(compiled.parameters).toContain(PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE);
  });

  it("never selects user accounts, private text, exact location, or raw media/source data", () => {
    const sql = buildPublicJournalDirectoryEntriesQuery(testDb, {
      query: "",
      kind: "all",
      catalog: null,
      topic: null,
      season: "all",
      region: null,
      sort: "recent",
      page: 1,
    }).compile().sql;

    expect(sql).not.toMatch(
      /"user"\."email"|ip_address|user_agent|quarantine_key|original_key|raw_payload|source_only_fields|latitude|longitude|coordinates|exact_location/i,
    );
    expect(sql).not.toContain('join "catalog_source_records"');
    expect(sql).not.toContain('join "catalog_source_snapshots"');
  });

  it("can scope deterministic visual evidence to explicit fixture IDs without weakening public predicates", () => {
    const fixtureIds = [
      "00000000-0000-4000-8000-000000000010",
      "00000000-0000-4000-8000-000000000011",
    ];
    const compiled = buildPublicJournalDirectoryEntriesQuery(
      testDb,
      {
        query: "",
        kind: "all",
        catalog: null,
        topic: null,
        season: "all",
        region: null,
        sort: "recent",
        page: 1,
      },
      [],
      fixtureIds,
    ).compile();

    expect(compiled.sql).toContain('"journal_entries"."id" in');
    expect(compiled.sql).toContain('"journal_entries"."visibility" =');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.parameters).toEqual(expect.arrayContaining(fixtureIds));
  });
});

describe("public journal directory serialization", () => {
  it("renders public clues and derivatives while suppressing hidden or invalid region data", () => {
    const page = serializePublicJournalDirectoryPage(
      [
        row({
          title: "Після холодної ночі",
          body: "Листя відновило пружність після ранкового поливу.",
          objectKind: "plant",
          objectDisplayName: "Черрі біля стінки",
          catalogKind: "plant_variety",
          catalogCanonicalName: "Помідор чері",
          catalogPublicSlug: "pomidor-cheri",
          catalogStatus: "confirmed",
          safeRegionCode: "UA-30",
          authorHandle: "demo_olena",
          authorDisplayName: "Олена",
          authorAvatarUrl: "https://media.example/avatar.png",
          totalCount: 2,
        }),
        row({
          entryId: "00000000-0000-4000-8000-000000000002",
          publicSlug: "quiet-apiary-check",
          objectKind: "bee_colony",
          objectDisplayName: "Сім'я на схилі",
          catalogKind: "species",
          catalogCanonicalName: "Apis mellifera",
          catalogPublicSlug: "apis-mellifera",
          catalogStatus: "seeded",
          safeRegionCode: "hidden backyard address",
          authorHandle: null,
          authorDisplayName: null,
          authorAvatarUrl: null,
          totalCount: 2,
        }),
      ],
      [
        {
          id: "00000000-0000-4000-8000-000000000101",
          entryId: "00000000-0000-4000-8000-000000000001",
          derivativeKey: "visual-fixtures/public/one.png",
        },
        {
          id: "00000000-0000-4000-8000-000000000102",
          entryId: "00000000-0000-4000-8000-000000000001",
          derivativeKey: "visual-fixtures/public/two.png",
        },
        {
          id: "00000000-0000-4000-8000-000000000103",
          entryId: "00000000-0000-4000-8000-000000000001",
          derivativeKey: "visual-fixtures/public/three.png",
        },
      ],
      [
        {
          entryId: "00000000-0000-4000-8000-000000000001",
          slug: "stress-and-recovery",
          label: "Відновлення після стресу",
        },
      ],
      "uk",
      {
        query: "холод",
        kind: "all",
        catalog: null,
        topic: null,
        season: "all",
        region: null,
        sort: "relevance",
        page: 1,
      },
      PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE,
      (key) => `https://media.example/${key}`,
    );

    expect(page.totalCount).toBe(2);
    expect(page.cards[0]).toMatchObject({
      title: "Після холодної ночі",
      publicPath: "/journal/after-cold-night",
      safeRegionCode: "UA-30",
      object: {
        displayName: "Черрі біля стінки",
        kind: "plant",
        identityLabel: "Помідор чері",
        catalogSlug: "pomidor-cheri",
        catalogPath: "/variety/pomidor-cheri",
        publicPath: "/lineage/objects/00000000-0000-4000-8000-000000000201",
      },
      author: {
        displayName: "Олена",
        profilePath: "/@demo_olena",
      },
      topics: [
        {
          slug: "stress-and-recovery",
          label: "Відновлення після стресу",
        },
      ],
    });
    expect(page.cards[0]?.media).toHaveLength(3);
    expect(page.cards[1]).toMatchObject({
      safeRegionCode: null,
      author: null,
      object: {
        kind: "bee_colony",
        catalogPath: "/species/apis-mellifera",
      },
    });
    expect(JSON.stringify(page)).not.toMatch(
      /entryId|ownerUserId|spaceId|derivativeKey|quarantine|originalKey|email|latitude|longitude|coordinates|hidden backyard/i,
    );
  });

  it("removes every contact and exact-location fragment from public excerpts", () => {
    const page = serializePublicJournalDirectoryPage(
      [
        row({
          body: [
            "Безпечне спостереження за станом листя.",
            "owner@example.com backup@example.org",
            "42.12345, 23.54321; 43.12345, 24.54321",
            "Наступна перевірка через тиждень.",
          ].join(" "),
          totalCount: 1,
        }),
      ],
      [],
      [],
      "uk",
      normalizePublicJournalDirectoryRequest({}),
    );

    expect(page.cards[0]?.excerpt).toContain(
      "Наступна перевірка через тиждень.",
    );
    expect(page.cards[0]?.excerpt).not.toMatch(
      /owner@example|backup@example|42\.12345|43\.12345|23\.54321|24\.54321/i,
    );
  });

  it("uses page-size-plus-one for stable previous, next, and exhausted states", () => {
    const rows = Array.from(
      { length: PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE + 1 },
      (_, index) =>
        row({
          entryId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          publicSlug: `entry-${index + 1}`,
          totalCount: PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE * 3,
        }),
    );
    const page = serializePublicJournalDirectoryPage(rows, [], [], "bg", {
      query: "",
      kind: "all",
      catalog: null,
      topic: null,
      season: "all",
      region: null,
      sort: "recent",
      page: 2,
    });

    expect(page.cards).toHaveLength(PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE);
    expect(page.hasPreviousPage).toBe(true);
    expect(page.hasNextPage).toBe(true);
    expect(page.totalPages).toBe(3);
  });
});

function row(
  overrides: Partial<PublicJournalDirectoryEntryRow> = {},
): PublicJournalDirectoryEntryRow {
  return {
    entryId: "00000000-0000-4000-8000-000000000001",
    title: "Ранкове спостереження",
    body: "Стан стабільний, наступний огляд за тиждень.",
    entryDate: "2026-07-10",
    publishedAt: "2026-07-10T12:00:00.000Z",
    publicSlug: "after-cold-night",
    objectId: "00000000-0000-4000-8000-000000000201",
    objectDisplayName: "Тестовий живий об'єкт",
    objectKind: "animal",
    varietyText: null,
    catalogKind: null,
    catalogCanonicalName: null,
    catalogPublicSlug: null,
    catalogStatus: null,
    safeRegionCode: null,
    authorHandle: null,
    authorDisplayName: null,
    authorAvatarUrl: null,
    totalCount: 1,
    ...overrides,
  };
}
