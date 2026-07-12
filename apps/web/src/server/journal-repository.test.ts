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
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";
import { FIRST_PUBLICATION_DISCLOSURE_VERSION } from "@/lib/privacy/disclosures";
import { scopedToUser } from "@/server/request-scope";
import {
  buildAdjacentPublicJournalEntryQuery,
  buildArchiveJournalEntryQuery,
  buildFindJournalEntryByIdQuery,
  buildFindExistingEntryByClientMutationQuery,
  buildInsertJournalEntryObjectMentionsQuery,
  buildInsertJournalEntryQuery,
  buildMentionableObjectsInSpaceQuery,
  buildMyPlantObjectEntrySummariesQuery,
  buildMyPlantObjectCoverMediaQuery,
  buildMyPlantObjectsQuery,
  buildObjectTimelineEntriesQuery,
  buildObjectJournalEntryCountQuery,
  buildPlantObjectCatalogSourceCreditQuery,
  buildPlantObjectPageObjectQuery,
  buildPriorPublicationDisclosureQuery,
  buildProcessedMediaForEntriesQuery,
  buildProcessedObjectMediaGalleryQuery,
  buildPublicEntrySlugsForObjectQuery,
  buildPublicJournalEntryLifecycleQuery,
  buildPublicJournalEntryLookupQuery,
  buildPublicJournalEntryPageQuery,
  buildPublicJournalEntryTopicsQuery,
  buildPublicMentionedObjectsForEntryQuery,
  buildPublicProcessedMediaForEntryQuery,
  buildRelatedPublicJournalEntriesQuery,
  buildPublishJournalEntryQuery,
  buildSpaceTimelineEntriesQuery,
  buildResolvePlantObjectCatalogQuery,
  buildUpdatePlantObjectLocationQuery,
  serializePublicJournalEntryPage,
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

  it("inserts a space-level entry without a direct plant object", () => {
    const compiled = buildInsertJournalEntryQuery(testDb, {
      owner_user_id: "00000000-0000-0000-0000-000000000001",
      space_id: "00000000-0000-0000-0000-000000000002",
      plant_object_id: null,
      title: "Balcony watering round",
      body: "Watered tomatoes and basil together.",
      entry_scope: "space",
      entry_date: "2026-07-03",
      visibility: "private",
      client_mutation_id: "space-mutation-1",
    }).compile();

    expect(compiled.sql).toContain(
      'on conflict ("owner_user_id", "client_mutation_id") do nothing',
    );
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      null,
      "Balcony watering round",
      "Watered tomatoes and basil together.",
      "space",
      "2026-07-03",
      "private",
      "space-mutation-1",
    ]);
  });

  it("inserts entry-object mentions idempotently after same-space validation", () => {
    const compiled = buildInsertJournalEntryObjectMentionsQuery(testDb, {
      ownerUserId: "00000000-0000-0000-0000-000000000001",
      spaceId: "00000000-0000-0000-0000-000000000002",
      journalEntryId: "00000000-0000-0000-0000-000000000020",
      plantObjectIds: [
        "00000000-0000-0000-0000-000000000003",
        "00000000-0000-0000-0000-000000000004",
      ],
    }).compile();

    expect(compiled.sql).toContain(
      'insert into "journal_entry_object_mentions"',
    );
    expect(compiled.sql).toContain(
      'on conflict ("journal_entry_id", "plant_object_id") do nothing',
    );
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000020",
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000020",
      "00000000-0000-0000-0000-000000000004",
    ]);
  });

  it("validates mentioned objects inside the same owner and space", () => {
    const compiled = buildMentionableObjectsInSpaceQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      {
        spaceId: "00000000-0000-0000-0000-000000000002",
        plantObjectIds: [
          "00000000-0000-0000-0000-000000000003",
          "00000000-0000-0000-0000-000000000004",
        ],
      },
    ).compile();

    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('"space_id" = $2');
    expect(compiled.sql).toContain('"id" in ($3, $4)');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000004",
    ]);
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
      FIRST_PUBLICATION_DISCLOSURE_VERSION,
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

    expect(compiled.sql).toContain('"plant_objects"."id" = $3');
    expect(compiled.sql).toContain('"plant_objects"."catalog_item_id"');
    expect(compiled.sql).toContain(
      'left join "catalog_items" on "catalog_items"."id" = "plant_objects"."catalog_item_id"',
    );
    expect(compiled.sql).toContain('"catalog_items"."catalog_kind"');
    expect(compiled.sql).toContain('"plant_objects"."coarse_region_code"');
    expect(compiled.sql).toContain('"spaces"."coarse_region_code"');
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" = $4');
    expect(compiled.sql).toContain('"spaces"."owner_user_id" = $5');
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000001",
    ]);
  });

  it("reads the garden workspace inventory only inside owner scope", () => {
    const compiled = buildMyPlantObjectsQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      20,
    ).compile();

    expect(compiled.sql).toContain('from "plant_objects"');
    expect(compiled.sql).toContain(
      'inner join "spaces" on "spaces"."id" = "plant_objects"."space_id"',
    );
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" = $3');
    expect(compiled.sql).toContain('"spaces"."owner_user_id" = $4');
    expect(compiled.sql).toContain("limit $5");
    expect(compiled.sql).toContain("offset $6");
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("coordinates");
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000001",
      20,
      0,
    ]);
  });

  it("uses a stable bounded inventory offset", () => {
    const compiled = buildMyPlantObjectsQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      12,
      12,
    ).compile();

    expect(compiled.sql).toContain("limit $5");
    expect(compiled.sql).toContain("offset $6");
    expect(compiled.parameters.slice(-2)).toEqual([12, 12]);
  });

  it("summarizes object workspace entries through owner-bound objects", () => {
    const compiled = buildMyPlantObjectEntrySummariesQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      [
        "00000000-0000-0000-0000-000000000003",
        "00000000-0000-0000-0000-000000000004",
      ],
    ).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('inner join "plant_objects"');
    expect(compiled.sql).toContain(
      '"plant_objects"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain('"journal_entries"."owner_user_id" = $1');
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" = $2');
    expect(compiled.sql).toContain('"journal_entries"."entry_scope" = $3');
    expect(compiled.sql).toContain(
      '"journal_entries"."plant_object_id" in ($4, $5)',
    );
    expect(compiled.sql).toContain(
      'group by "journal_entries"."plant_object_id"',
    );
    expect(compiled.sql).toContain('as "archivedEntryCount"');
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("body");
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000001",
      "object",
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000004",
    ]);
  });

  it("selects one owner-scoped processed cover without exposing storage keys", () => {
    const compiled = buildMyPlantObjectCoverMediaQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      [
        "00000000-0000-0000-0000-000000000003",
        "00000000-0000-0000-0000-000000000004",
      ],
    ).compile();

    expect(compiled.sql).toContain('from "media_assets"');
    expect(compiled.sql).toContain('inner join "journal_entries"');
    expect(compiled.sql).toContain(
      '"media_assets"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain('inner join "plant_objects"');
    expect(compiled.sql).toContain(
      '"plant_objects"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain('"journal_entries"."owner_user_id" = $1');
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" = $2');
    expect(compiled.sql).toContain('"media_assets"."status" = $6');
    expect(compiled.sql).toContain(
      '"media_assets"."derivative_key" is not null',
    );
    expect(compiled.sql).toContain(
      'distinct on ("journal_entries"."plant_object_id")',
    );
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000004",
      "active",
      "processed",
    ]);
  });

  it("reads authenticated object source credit without raw source payloads", () => {
    const catalogItemId = "00000000-0000-4000-8000-000000104001";
    const compiled = buildPlantObjectCatalogSourceCreditQuery(
      testDb,
      catalogItemId,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_source_links"');
    expect(compiled.sql).toContain('inner join "catalog_source_records"');
    expect(compiled.sql).toContain('inner join "catalog_source_snapshots"');
    expect(compiled.sql).toContain('"catalog_source_snapshots"."source_name"');
    expect(compiled.sql).toContain('"catalog_source_snapshots"."source_url"');
    expect(compiled.sql).toContain(
      '"catalog_source_snapshots"."attribution_text"',
    );
    expect(compiled.sql).toContain(
      '"catalog_source_records"."projection_status" = $3',
    );
    expect(compiled.sql).toContain(
      '"catalog_source_snapshots"."attribution_required" = $4',
    );
    expect(compiled.sql).not.toContain(
      '"catalog_source_records"."raw_payload"',
    );
    expect(compiled.sql).not.toContain(
      '"catalog_source_records"."source_only_fields"',
    );
    expect(compiled.sql).not.toContain(
      '"catalog_source_links"."source_record_key"',
    );
    expect(compiled.sql).not.toContain("payload_sha256");
    expect(compiled.sql).not.toContain("coordinates");
    expect(compiled.sql).not.toContain("latitude");
    expect(compiled.sql).not.toContain("longitude");
    expect(compiled.parameters).toEqual([
      catalogItemId,
      "canonical_item",
      "projected",
      true,
      1,
    ]);
  });

  it("counts object journal entries only inside owner scope", () => {
    const compiled = buildObjectJournalEntryCountQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      "00000000-0000-0000-0000-000000000003",
    ).compile();

    expect(compiled.sql).toContain('"journal_entries"."owner_user_id" = $3');
    expect(compiled.sql).toContain('"journal_entries"."plant_object_id" = $5');
    expect(compiled.sql).toContain(
      '"journal_entry_object_mentions"."plant_object_id" = $7',
    );
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000001",
      "object",
      "00000000-0000-0000-0000-000000000003",
      "space",
      "00000000-0000-0000-0000-000000000003",
    ]);
  });

  it("reads object timelines from direct entries plus mentioned space entries", () => {
    const compiled = buildObjectTimelineEntriesQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      "00000000-0000-0000-0000-000000000003",
    ).compile();

    expect(compiled.sql).toContain('"journal_entries"."entry_scope" = $4');
    expect(compiled.sql).toContain('"journal_entries"."plant_object_id" = $5');
    expect(compiled.sql).toContain(
      '"journal_entry_object_mentions"."plant_object_id" = $7',
    );
    expect(compiled.sql).toContain("mentioned_space");
    expect(compiled.sql).toContain("direct_object");
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000001",
      "object",
      "00000000-0000-0000-0000-000000000003",
      "space",
      "00000000-0000-0000-0000-000000000003",
    ]);
  });

  it("reads space timelines only from space-level entries", () => {
    const compiled = buildSpaceTimelineEntriesQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      [
        "00000000-0000-0000-0000-000000000002",
        "00000000-0000-0000-0000-000000000022",
      ],
    ).compile();

    expect(compiled.sql).toContain('"journal_entries"."owner_user_id" = $1');
    expect(compiled.sql).toContain('"journal_entries"."entry_scope" = $2');
    expect(compiled.sql).toContain('"journal_entries"."space_id" in ($3, $4)');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "space",
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000022",
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
        objectKind: "plant",
        varietyText: "Помідор чері",
        now,
      },
    ).compile();

    expect(compiled.sql).toContain('update "plant_objects"');
    expect(compiled.sql).toContain('"catalog_item_id" = $1');
    expect(compiled.sql).toContain('"object_kind" = $2');
    expect(compiled.sql).toContain('"variety_text" = $3');
    expect(compiled.sql).toContain('"variety_state" = $4');
    expect(compiled.sql).toContain('"updated_at" = $5');
    expect(compiled.sql).toContain('"id" = $6');
    expect(compiled.sql).toContain('"owner_user_id" = $7');
    expect(compiled.sql).toContain('"variety_state" in ($8, $9)');
    expect(compiled.sql).toContain("returning *");
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000000101",
      "plant",
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
    expect(compiled.sql).toContain('"journal_entries"."owner_user_id" = $3');
    expect(compiled.sql).toContain('"journal_entries"."plant_object_id" = $5');
    expect(compiled.sql).toContain(
      '"journal_entry_object_mentions"."plant_object_id" = $7',
    );
    expect(compiled.sql).toContain('"visibility" = $8');
    expect(compiled.sql).toContain('"lifecycle_state" = $9');
    expect(compiled.sql).toContain('"public_gone_at" is null');
    expect(compiled.sql).toContain('"public_slug" is not null');
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("body");
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000001",
      "object",
      "00000000-0000-0000-0000-000000000003",
      "space",
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

    expect(compiled.sql).toContain('left join "plant_objects"');
    expect(compiled.sql).toContain(
      '"plant_objects"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain('inner join "spaces"');
    expect(compiled.sql).toContain(
      '"spaces"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain('left join "catalog_items"');
    expect(compiled.sql).toContain('"catalog_items"."public_slug"');
    expect(compiled.sql).toContain(
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(compiled.sql).toContain('left join "user_public_profiles"');
    expect(compiled.sql).toContain(
      '"user_public_profiles"."user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain('"plant_objects"."catalog_item_id"');
    expect(compiled.sql).toContain('"journal_entries"."entry_scope"');
    expect(compiled.sql).toContain('"plant_objects"."id" as "plantObjectId"');
    expect(compiled.sql).toContain('"plant_objects"."object_kind"');
    expect(compiled.sql).toContain('"user_public_profiles"."handle"');
    expect(compiled.sql).toContain('"plant_objects"."coarse_region_code"');
    expect(compiled.sql).toContain('"spaces"."coarse_region_code"');
    expect(compiled.sql).toContain('"journal_entries"."public_slug" = $3');
    expect(compiled.sql).toContain('"journal_entries"."visibility" = $4');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $5');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).not.toContain('as "ownerUserId"');
    expect(compiled.sql).not.toContain('as "owner_user_id"');
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.sql).not.toContain("coordinates");
    expect(compiled.sql).not.toContain("latitude");
    expect(compiled.sql).not.toContain("longitude");
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
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

    expect(compiled.sql).toContain('"journal_entries"."public_slug" = $3');
    expect(compiled.sql).toContain('left join "catalog_items"');
    expect(compiled.sql).toContain('"catalog_items"."public_slug"');
    expect(compiled.sql).toContain('left join "user_public_profiles"');
    expect(compiled.sql).toContain(
      '"journal_entries"."lifecycle_state" as "lifecycleState"',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" as "publicGoneAt"',
    );
    expect(compiled.sql).toContain('"plant_objects"."id" as "plantObjectId"');
    expect(compiled.sql).toContain('"plant_objects"."object_kind"');
    expect(compiled.sql).toContain('"user_public_profiles"."handle"');
    expect(compiled.sql).not.toContain('as "ownerUserId"');
    expect(compiled.sql).not.toContain('as "owner_user_id"');
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "first-flowers-abc123",
    ]);
  });

  it("classifies journal lifecycle without selecting content or enrichment", () => {
    const compiled = buildPublicJournalEntryLifecycleQuery(
      testDb,
      "first-flowers-abc123",
    ).compile();

    expect(compiled.sql).toContain('inner join "spaces"');
    expect(compiled.sql).toContain('left join "plant_objects"');
    expect(compiled.sql).toContain('"journal_entries"."public_slug" = $1');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" as "publicGoneAt"',
    );
    expect(compiled.sql).toContain(
      '"plant_objects"."id" as "joinedPlantObjectId"',
    );
    expect(compiled.sql).not.toMatch(
      /title|body|catalog_items|user_public_profiles|media_assets|topic|email|quarantine|coordinates|latitude|longitude/i,
    );
    expect(compiled.parameters).toEqual(["first-flowers-abc123"]);
  });

  it("selects related public logbook entries for the same object only", () => {
    const compiled = buildRelatedPublicJournalEntriesQuery(
      testDb,
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000020",
      2,
    ).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('"journal_entries"."plant_object_id" = $1');
    expect(compiled.sql).toContain('"journal_entries"."id" != $2');
    expect(compiled.sql).toContain('"journal_entries"."visibility" = $3');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $4');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).not.toMatch(
      /owner_user_id|client_mutation_id|quarantine_key|derivative_key|ip_address|user_agent|email|phone|coordinates|latitude|longitude/i,
    );
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000020",
      "public",
      "active",
      2,
    ]);
  });

  it("selects only curated accepted topics for an active public entry", () => {
    const compiled = buildPublicJournalEntryTopicsQuery(
      testDb,
      "00000000-0000-0000-0000-000000000020",
    ).compile();

    expect(compiled.sql).toContain('from "journal_entry_topic_signals"');
    expect(compiled.sql).toContain('inner join "journal_entries"');
    expect(compiled.sql).toContain('inner join "journal_topics"');
    expect(compiled.sql).toContain(
      '"journal_entry_topic_signals"."review_state" =',
    );
    expect(compiled.sql).toContain(
      '"journal_entry_topic_signals"."public_membership_state" =',
    );
    expect(compiled.sql).toContain('"journal_topics"."trust_state" =');
    expect(compiled.sql).toContain('"journal_entries"."visibility" =');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" =');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).not.toMatch(
      /owner_user_id|body|email|moderation|quarantine|coordinates|latitude|longitude/i,
    );
  });

  it("selects the nearest older entry with the complete public chronology predicate", () => {
    const compiled = buildAdjacentPublicJournalEntryQuery(testDb, {
      entryScope: "object",
      plantObjectId: "00000000-0000-0000-0000-000000000003",
      spaceId: "00000000-0000-0000-0000-000000000002",
      currentEntryId: "00000000-0000-0000-0000-000000000020",
      currentEntryDate: "2026-07-10",
      currentCreatedAt: "2026-07-10T09:00:00.000Z",
      direction: "older",
    }).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('"journal_entries"."plant_object_id" =');
    expect(compiled.sql).toContain('"journal_entries"."visibility" =');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" =');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).toContain('"journal_entries"."entry_date" <');
    expect(compiled.sql).toContain('"journal_entries"."created_at" <');
    expect(compiled.sql).toContain('"journal_entries"."id" >');
    expect(compiled.sql).toContain('"journal_entries"."entry_date" desc');
    expect(compiled.sql).toContain('"journal_entries"."created_at" desc');
    expect(compiled.sql).toContain('"journal_entries"."id" asc');
    expect(compiled.parameters.at(-1)).toBe(1);
    expect(compiled.sql).not.toMatch(
      /owner_user_id|client_mutation_id|quarantine_key|email|coordinates|latitude|longitude/i,
    );
  });

  it("exposes space-entry mentions only when the root and mentioned object both have public anchors", () => {
    const compiled = buildPublicMentionedObjectsForEntryQuery(
      testDb,
      "00000000-0000-0000-0000-000000000020",
    ).compile();

    expect(compiled.sql).toContain('from "journal_entry_object_mentions"');
    expect(compiled.sql).toContain('inner join "journal_entries"');
    expect(compiled.sql).toContain('inner join "plant_objects"');
    expect(compiled.sql).toContain('left join "catalog_items"');
    expect(compiled.sql).toContain("exists");
    expect(compiled.sql).toContain(
      'from "journal_entries" as "object_public_entries"',
    );
    expect(compiled.sql).toContain('"journal_entries"."entry_scope" =');
    expect(compiled.sql).toContain('"journal_entries"."visibility" =');
    expect(compiled.sql).toContain('"object_public_entries"."visibility" =');
    expect(compiled.sql).not.toMatch(
      /client_mutation_id|quarantine_key|email|coordinates|latitude|longitude/i,
    );
  });

  it("serializes a localized object-first journal chapter without private fields", () => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://media.over.garden");
    const page = serializePublicJournalEntryPage({
      root: {
        entryId: "00000000-0000-4000-8000-000000000020",
        title: "Перший урожай",
        body: "Перший абзац.\n\nДругий абзац.",
        entryDate: "2026-07-10",
        entryCreatedAt: "2026-07-10T09:00:00.000Z",
        entryScope: "object",
        visibility: "public",
        lifecycleState: "active",
        publicSlug: "pershyi-urozhai",
        publicNoindex: true,
        publishedAt: "2026-07-10T10:00:00.000Z",
        publicGoneAt: null,
        spaceId: "00000000-0000-4000-8000-000000000002",
        spaceDisplayName: "Теплиця",
        spaceLocationVisibility: "region",
        spaceCoarseRegionCode: "UA-30",
        plantObjectId: "00000000-0000-4000-8000-000000000003",
        objectDisplayName: "Черрі",
        objectKind: "plant",
        catalogKind: "plant_variety",
        catalogCanonicalName: "Помідор чері",
        catalogPublicSlug: "pomidor-cheri",
        varietyText: "Помідор чері",
        varietyState: "selected",
        objectLocationVisibility: "region",
        objectCoarseRegionCode: "UA-30",
        authorHandle: "olena",
        authorDisplayName: "Олена",
        authorAvatarUrl: null,
      },
      mediaRows: [
        {
          id: "00000000-0000-4000-8000-000000000030",
          derivativeKey: "public/first.webp",
          altText: "Стиглі томати на кущі",
          caption: "Перша китиця",
        },
      ],
      topicRows: [{ slug: "harvest", label: "Врожай" }],
      relatedRows: [
        {
          entryId: "00000000-0000-4000-8000-000000000021",
          title: "Тиждень раніше",
          body: "Коротка попередня нотатка.",
          entryDate: "2026-07-03",
          publicSlug: "tyzhden-ranishe",
        },
      ],
      newerRow: null,
      olderRow: {
        entryId: "00000000-0000-4000-8000-000000000021",
        title: "Тиждень раніше",
        body: "Коротка попередня нотатка.",
        entryDate: "2026-07-03",
        publicSlug: "tyzhden-ranishe",
      },
      mentionedRows: [],
      locale: "bg",
    });

    expect(page.entry.publicPath).toBe("/bg/journal/pershyi-urozhai");
    expect(page.context.kind).toBe("object");
    expect(page.context).toMatchObject({
      kind: "object",
      object: {
        displayName: "Черрі",
        publicPath: "/lineage/objects/00000000-0000-4000-8000-000000000003",
      },
    });
    expect(page.author?.profilePath).toBe("/bg/@olena");
    expect(page.topics).toEqual([
      { slug: "harvest", label: "Врожай", publicPath: "/bg/topics/harvest" },
    ]);
    expect(page.media).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000030",
        publicUrl: expect.stringContaining("public/first.webp"),
        altText: "Стиглі томати на кущі",
        caption: "Перша китиця",
      },
    ]);
    expect(page.adjacentEntries).toMatchObject({
      newer: null,
      older: { publicPath: "/bg/journal/tyzhden-ranishe" },
    });
    expect(page.relatedEntries[0]?.publicPath).toBe(
      "/bg/journal/tyzhden-ranishe",
    );
    expect(JSON.stringify(page)).not.toMatch(
      /ownerUserId|owner_user_id|email|quarantine|coordinates|latitude|longitude/i,
    );
    vi.unstubAllEnvs();
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
    expect(compiled.sql).toContain("exists");
    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('"journal_entries"."id" = $7');
    expect(compiled.sql).toContain('"journal_entries"."owner_user_id" = $8');
    expect(compiled.sql).toContain("not exists");
    expect(compiled.sql).toContain(
      'from "media_assets" as "existing_entry_media"',
    );
    expect(compiled.sql).toContain(
      '"existing_entry_media"."journal_entry_id" = $9',
    );
    expect(compiled.sql).toContain('"existing_entry_media"."id" != $10');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000020",
      expect.any(Date),
      "00000000-0000-0000-0000-000000000010",
      "00000000-0000-0000-0000-000000000001",
      "processed",
      "00000000-0000-0000-0000-000000000020",
      "00000000-0000-0000-0000-000000000020",
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000020",
      "00000000-0000-0000-0000-000000000010",
    ]);
  });

  it("selects a bounded ordered public gallery with safe readback metadata", () => {
    const compiled = buildPublicProcessedMediaForEntryQuery(
      testDb,
      "00000000-0000-0000-0000-000000000020",
    ).compile();

    expect(compiled.sql).toContain(
      'inner join "journal_entries" on "journal_entries"."id" = "media_assets"."journal_entry_id"',
    );
    expect(compiled.sql).toContain(
      '"media_assets"."owner_user_id" = "journal_entries"."owner_user_id"',
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
    expect(compiled.sql).toContain('"media_assets"."alt_text" as "altText"');
    expect(compiled.sql).toContain('"media_assets"."caption" as "caption"');
    expect(compiled.sql).toContain('"media_assets"."created_at" asc');
    expect(compiled.sql).toContain('"media_assets"."id" asc');
    expect(compiled.sql).toContain("limit $5");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000020",
      "public",
      "active",
      "processed",
      6,
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

  it("selects a bounded owner-only object gallery from already scoped entry ids", () => {
    const compiled = buildProcessedObjectMediaGalleryQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      [
        "00000000-0000-0000-0000-000000000020",
        "00000000-0000-0000-0000-000000000021",
      ],
    ).compile();

    expect(compiled.sql).toContain('from "media_assets"');
    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('"journal_entry_id" in ($2, $3)');
    expect(compiled.sql).toContain('"status" = $4');
    expect(compiled.sql).toContain('"derivative_key" is not null');
    expect(compiled.sql).toContain('"created_at" asc');
    expect(compiled.parameters.at(-1)).toBe(6);
    expect(compiled.sql).not.toContain("quarantine_key");
  });
});
