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
  buildArchiveJournalEntryQuery,
  buildFindJournalEntryByIdQuery,
  buildFindExistingEntryByClientMutationQuery,
  buildInsertJournalEntryQuery,
  buildObjectJournalEntryCountQuery,
  buildPlantObjectPageObjectQuery,
  buildPriorPublicationDisclosureQuery,
  buildProcessedMediaForEntriesQuery,
  buildPublicEntrySlugsForObjectQuery,
  buildPublicJournalEntryLookupQuery,
  buildPublicJournalEntryPageQuery,
  buildPublicProcessedMediaForEntryQuery,
  buildPublishJournalEntryQuery,
  buildResolvePlantObjectCatalogQuery,
  buildUpdatePlantObjectLocationQuery,
} from "./journal-repository";
import { buildAttachProcessedMediaAssetToEntryQuery } from "./media/media-repository";

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

describe("journal repository query contracts", () => {
  it("binds entry idempotency to owner_user_id and client_mutation_id", () => {
    const compiled = buildInsertJournalEntryQuery(testDb, {
      owner_user_id: "00000000-0000-0000-0000-000000000001",
      space_id: "00000000-0000-0000-0000-000000000002",
      plant_object_id: "00000000-0000-0000-0000-000000000003",
      title: "First flowers",
      body: "Two new flower clusters.",
      entry_scope: "object",
      entry_date: "2026-06-26",
      visibility: "private",
      client_mutation_id: "mutation-1",
    }).compile();

    expect(compiled.sql).toContain(
      'on conflict ("owner_user_id", "client_mutation_id") do nothing',
    );
    expect(compiled.sql).toContain("returning *");
  });

  it("looks up existing idempotent entries only inside the request scope", () => {
    const compiled = buildFindExistingEntryByClientMutationQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      "mutation-1",
    ).compile();

    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('"client_mutation_id" = $2');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "mutation-1",
    ]);
  });

  it("looks up entries by id only inside the request scope", () => {
    const compiled = buildFindJournalEntryByIdQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      "00000000-0000-0000-0000-000000000020",
    ).compile();

    expect(compiled.sql).toContain('"id" = $1');
    expect(compiled.sql).toContain('"owner_user_id" = $2');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000020",
      "00000000-0000-0000-0000-000000000001",
    ]);
  });

  it("checks first-publication disclosure inside owner scope", () => {
    const compiled = buildPriorPublicationDisclosureQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
    ).compile();

    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain(
      '"first_publication_disclosed_at" is not null',
    );
    expect(compiled.sql).toContain("limit $2");
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      1,
    ]);
  });

  it("publishes only private entries inside owner scope", () => {
    const now = new Date("2026-06-26T12:00:00.000Z");
    const compiled = buildPublishJournalEntryQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      {
        entryId: "00000000-0000-0000-0000-000000000020",
        publicSlug: "first-flowers-abc123",
        publishedAt: now,
        now,
        disclosureLogged: true,
      },
    ).compile();

    expect(compiled.sql).toContain('update "journal_entries"');
    expect(compiled.sql).toContain('"lifecycle_state" = $1');
    expect(compiled.sql).toContain('"visibility" = $2');
    expect(compiled.sql).toContain('"public_slug" = $3');
    expect(compiled.sql).toContain('"public_noindex" = $4');
    expect(compiled.sql).toContain('"published_at" = $5');
    expect(compiled.sql).toContain('"archived_at" = $6');
    expect(compiled.sql).toContain('"public_gone_at" = $7');
    expect(compiled.sql).toContain(
      '"first_publication_disclosure_version" = $8',
    );
    expect(compiled.sql).toContain('"first_publication_disclosed_at" = $9');
    expect(compiled.sql).toContain('"id" = $11');
    expect(compiled.sql).toContain('"owner_user_id" = $12');
    expect(compiled.sql).toContain('"visibility" = $13');
    expect(compiled.sql).toContain('"lifecycle_state" = $14');
    expect(compiled.sql).toContain("returning *");
    expect(compiled.parameters).toEqual([
      "active",
      "public",
      "first-flowers-abc123",
      true,
      now,
      null,
      null,
      "first-publication-v1",
      now,
      now,
      "00000000-0000-0000-0000-000000000020",
      "00000000-0000-0000-0000-000000000001",
      "private",
      "active",
    ]);
  });

  it("archives entries only inside owner scope and records public gone state", () => {
    const now = new Date("2026-06-26T12:00:00.000Z");
    const compiled = buildArchiveJournalEntryQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      {
        entryId: "00000000-0000-0000-0000-000000000020",
        now,
        publicGoneAt: now,
      },
    ).compile();

    expect(compiled.sql).toContain('update "journal_entries"');
    expect(compiled.sql).toContain('"lifecycle_state" = $1');
    expect(compiled.sql).toContain('"visibility" = $2');
    expect(compiled.sql).toContain('"public_noindex" = $3');
    expect(compiled.sql).toContain('"archived_at" = $4');
    expect(compiled.sql).toContain('"public_gone_at" = $5');
    expect(compiled.sql).toContain('"id" = $7');
    expect(compiled.sql).toContain('"owner_user_id" = $8');
    expect(compiled.sql).toContain('"lifecycle_state" = $9');
    expect(compiled.parameters).toEqual([
      "archived",
      "private",
      true,
      now,
      now,
      now,
      "00000000-0000-0000-0000-000000000020",
      "00000000-0000-0000-0000-000000000001",
      "active",
    ]);
  });

  it("requires owner scope on object and space readback", () => {
    const compiled = buildPlantObjectPageObjectQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      "00000000-0000-0000-0000-000000000003",
    ).compile();

    expect(compiled.sql).toContain('"plant_objects"."id" = $1');
    expect(compiled.sql).toContain('"plant_objects"."catalog_item_id"');
    expect(compiled.sql).toContain('"plant_objects"."coarse_region_code"');
    expect(compiled.sql).toContain('"spaces"."coarse_region_code"');
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" = $2');
    expect(compiled.sql).toContain('"spaces"."owner_user_id" = $3');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000001",
    ]);
  });

  it("counts object journal entries only inside owner scope", () => {
    const compiled = buildObjectJournalEntryCountQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      "00000000-0000-0000-0000-000000000003",
    ).compile();

    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('"plant_object_id" = $2');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000003",
    ]);
  });

  it("resolves object catalog identity only inside owner scope and allowed states", () => {
    const now = new Date("2026-06-26T12:00:00.000Z");
    const compiled = buildResolvePlantObjectCatalogQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      {
        plantObjectId: "00000000-0000-0000-0000-000000000003",
        catalogItemId: "00000000-0000-4000-8000-000000000101",
        varietyText: "Помідор чері",
        now,
      },
    ).compile();

    expect(compiled.sql).toContain('update "plant_objects"');
    expect(compiled.sql).toContain('"catalog_item_id" = $1');
    expect(compiled.sql).toContain('"variety_text" = $2');
    expect(compiled.sql).toContain('"variety_state" = $3');
    expect(compiled.sql).toContain('"updated_at" = $4');
    expect(compiled.sql).toContain('"id" = $5');
    expect(compiled.sql).toContain('"owner_user_id" = $6');
    expect(compiled.sql).toContain('"variety_state" in ($7, $8)');
    expect(compiled.sql).toContain("returning *");
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000000101",
      "Помідор чері",
      "selected",
      now,
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000001",
      "unknown",
      "user_added",
    ]);
  });

  it("updates object location only inside owner scope with coarse code", () => {
    const now = new Date("2026-06-26T12:00:00.000Z");
    const compiled = buildUpdatePlantObjectLocationQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      {
        plantObjectId: "00000000-0000-0000-0000-000000000003",
        locationVisibility: "region",
        coarseRegionCode: "UA-30",
        now,
      },
    ).compile();

    expect(compiled.sql).toContain('update "plant_objects"');
    expect(compiled.sql).toContain('"location_visibility" = $1');
    expect(compiled.sql).toContain('"coarse_region_code" = $2');
    expect(compiled.sql).toContain('"updated_at" = $3');
    expect(compiled.sql).toContain('"id" = $4');
    expect(compiled.sql).toContain('"owner_user_id" = $5');
    expect(compiled.sql).toContain("returning *");
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("coordinates");
    expect(compiled.sql).not.toContain("latitude");
    expect(compiled.sql).not.toContain("longitude");
    expect(compiled.parameters).toEqual([
      "region",
      "UA-30",
      now,
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000001",
    ]);
  });

  it("finds active public entry paths for object revalidation without private fields", () => {
    const compiled = buildPublicEntrySlugsForObjectQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      "00000000-0000-0000-0000-000000000003",
    ).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('"plant_object_id" = $2');
    expect(compiled.sql).toContain('"visibility" = $3');
    expect(compiled.sql).toContain('"lifecycle_state" = $4');
    expect(compiled.sql).toContain('"public_gone_at" is null');
    expect(compiled.sql).toContain('"public_slug" is not null');
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("body");
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000003",
      "public",
      "active",
    ]);
  });

  it("reads public entries by slug without owner-private fields", () => {
    const compiled = buildPublicJournalEntryPageQuery(
      testDb,
      "first-flowers-abc123",
    ).compile();

    expect(compiled.sql).toContain(
      'inner join "plant_objects" on "plant_objects"."id" = "journal_entries"."plant_object_id"',
    );
    expect(compiled.sql).toContain(
      'inner join "spaces" on "spaces"."id" = "journal_entries"."space_id"',
    );
    expect(compiled.sql).toContain('"plant_objects"."catalog_item_id"');
    expect(compiled.sql).toContain('"plant_objects"."coarse_region_code"');
    expect(compiled.sql).toContain('"spaces"."coarse_region_code"');
    expect(compiled.sql).toContain('"journal_entries"."public_slug" = $1');
    expect(compiled.sql).toContain('"journal_entries"."visibility" = $2');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $3');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).not.toContain("owner_user_id");
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.sql).not.toContain("coordinates");
    expect(compiled.sql).not.toContain("latitude");
    expect(compiled.sql).not.toContain("longitude");
    expect(compiled.parameters).toEqual([
      "first-flowers-abc123",
      "public",
      "active",
    ]);
  });

  it("can look up a public slug tombstone without owner-private fields", () => {
    const compiled = buildPublicJournalEntryLookupQuery(
      testDb,
      "first-flowers-abc123",
    ).compile();

    expect(compiled.sql).toContain('"journal_entries"."public_slug" = $1');
    expect(compiled.sql).toContain(
      '"journal_entries"."lifecycle_state" as "lifecycleState"',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" as "publicGoneAt"',
    );
    expect(compiled.sql).not.toContain("owner_user_id");
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.parameters).toEqual(["first-flowers-abc123"]);
  });

  it("attaches only owner-scoped processed media to an entry", () => {
    const compiled = buildAttachProcessedMediaAssetToEntryQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      {
        mediaAssetId: "00000000-0000-0000-0000-000000000010",
        journalEntryId: "00000000-0000-0000-0000-000000000020",
      },
    ).compile();

    expect(compiled.sql).toContain('update "media_assets"');
    expect(compiled.sql).toContain('"id" = $3');
    expect(compiled.sql).toContain('"owner_user_id" = $4');
    expect(compiled.sql).toContain('"status" = $5');
    expect(compiled.sql).toContain('"journal_entry_id" is null');
    expect(compiled.sql).toContain('"journal_entry_id" = $6');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000020",
      expect.any(Date),
      "00000000-0000-0000-0000-000000000010",
      "00000000-0000-0000-0000-000000000001",
      "processed",
      "00000000-0000-0000-0000-000000000020",
    ]);
  });

  it("selects derivative-only public media for a published entry", () => {
    const compiled = buildPublicProcessedMediaForEntryQuery(
      testDb,
      "00000000-0000-0000-0000-000000000020",
    ).compile();

    expect(compiled.sql).toContain(
      'inner join "journal_entries" on "journal_entries"."id" = "media_assets"."journal_entry_id"',
    );
    expect(compiled.sql).toContain('"journal_entries"."id" = $1');
    expect(compiled.sql).toContain('"journal_entries"."visibility" = $2');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $3');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain('"media_assets"."status" = $4');
    expect(compiled.sql).toContain(
      '"media_assets"."derivative_key" is not null',
    );
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000020",
      "public",
      "active",
      "processed",
    ]);
  });

  it("selects derivative-only media readback inside owner scope", () => {
    const compiled = buildProcessedMediaForEntriesQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      [
        "00000000-0000-0000-0000-000000000020",
        "00000000-0000-0000-0000-000000000021",
      ],
    ).compile();

    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('"journal_entry_id" in ($2, $3)');
    expect(compiled.sql).toContain('"status" = $4');
    expect(compiled.sql).toContain('"derivative_key" is not null');
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000020",
      "00000000-0000-0000-0000-000000000021",
      "processed",
    ]);
  });
});
