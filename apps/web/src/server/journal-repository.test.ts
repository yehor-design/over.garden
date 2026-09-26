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
import {
  DELETED_JOURNAL_ENTRY_BODY,
  DELETED_JOURNAL_ENTRY_TITLE,
} from "@/server/journal-deletion-retention";
import { scopedToUser } from "@/server/request-scope";
import {
  buildAdjacentPublicJournalEntryQuery,
  buildDeleteJournalEntryQuery,
  buildFindJournalEntryByIdQuery,
  buildFindExistingEntryByClientMutationQuery,
  buildInsertJournalEntryObjectMentionsQuery,
  buildInsertJournalEntryQuery,
  buildJournalMutationAdvisoryLockQuery,
  buildOwnedSpaceForFirstEntryQuery,
  buildMentionableObjectsInSpaceQuery,
  buildMyPlantObjectEntrySummariesQuery,
  buildMyPlantObjectCoverMediaQuery,
  buildMyPlantObjectsQuery,
  buildObjectTimelineEntriesQuery,
  buildObjectJournalEntryCountQuery,
  buildPlantObjectCatalogSourceCreditQuery,
  buildPlantObjectPageObjectQuery,
  buildProcessedMediaForEntriesQuery,
  buildProcessedObjectMediaGalleryQuery,
  buildPublicEntrySlugsForObjectQuery,
  buildPublicJournalEntryLifecycleQuery,
  buildPublicJournalEntryLookupQuery,
  buildPublicJournalEntryPageQuery,
  buildPublicJournalEntryPersonMentionsQuery,
  buildPublicJournalEntryTopicsQuery,
  buildPublicMentionedObjectsForEntryQuery,
  buildPublicProcessedMediaForEntryQuery,
  buildRelatedPublicJournalEntriesQuery,
  buildSpaceTimelineEntriesQuery,
  buildLabelPlantObjectCatalogQuery,
  buildResolvePlantObjectCatalogQuery,
  buildUpdatePlantObjectLocationQuery,
  serializePublicJournalEntryPage,
  publicJournalEntryNameKey,
  publicJournalEntryNumberKey,
} from "./journal-repository";

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

/**
 * The public queries carry the author's handle as a correlated scalar that
 * reads `owner_user_id` to find the registry row (ADR-0029 D9). The privacy
 * guard below is about what a query *selects*, so the subquery is taken out
 * before the guard runs and asserted separately.
 */
function withoutAuthorHandleSubquery(sql: string) {
  return sql.replace(
    /\(\s*select handle_registry\.normalized_handle[\s\S]*?limit 1\s*\)/gu,
    "<author-handle>",
  );
}

describe("journal repository query contracts", () => {
  it("reuses only an owner-scoped space for first-object creation", () => {
    const compiled = buildOwnedSpaceForFirstEntryQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      "00000000-0000-0000-0000-000000000002",
    ).compile();

    expect(compiled.sql).toContain('from "spaces"');
    expect(compiled.sql).toContain('"id" = $1');
    expect(compiled.sql).toContain('"owner_user_id" = $2');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000001",
    ]);
  });

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

  it("serializes first-entry creation by owner and client mutation before inserts", () => {
    const compiled = buildJournalMutationAdvisoryLockQuery(
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      "mutation-1",
    ).compile(testDb);

    expect(compiled.sql).toContain("pg_advisory_xact_lock");
    expect(compiled.sql).toContain("hashtextextended");
    expect(compiled.parameters).toEqual([
      "36:00000000-0000-0000-0000-000000000001:mutation-1",
    ]);
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

  it("deletes entries only inside owner scope and scrubs the row in one statement", () => {
    const compiled = buildDeleteJournalEntryQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      { entryId: "00000000-0000-0000-0000-000000000020" },
    ).compile();

    expect(compiled.sql).toContain('update "journal_entries"');
    // INV-02: raw journal content leaves the row in the same statement that
    // changes the lifecycle. There is no window where a deleted entry still
    // holds its title, body, document or cover.
    expect(compiled.sql).toContain('"content_document" = ');
    expect(compiled.sql).toContain('"cover_media_asset_id" = ');
    expect(compiled.sql).toContain('"published_at" = ');
    expect(compiled.parameters).toContain(DELETED_JOURNAL_ENTRY_TITLE);
    expect(compiled.parameters).toContain(DELETED_JOURNAL_ENTRY_BODY);

    // INV-04: both timestamps come from one PostgreSQL `now()`, never from
    // application time, so the seven-day horizon cannot drift across a
    // daylight-saving boundary and trip the retention check constraint.
    expect(compiled.sql).toContain('"deleted_at" = now()');
    expect(compiled.sql).toContain(
      "\"purge_after\" = now() + interval '7 days'",
    );
    expect(compiled.parameters).not.toContain("archived");

    // INV-01: owner scope and the active precondition are both in the WHERE,
    // so a non-owner or an already-deleted row matches nothing.
    expect(compiled.sql).toContain('"id" = $');
    expect(compiled.sql).toContain('"owner_user_id" = $');
    expect(compiled.parameters).toContain(
      "00000000-0000-0000-0000-000000000020",
    );
    expect(compiled.parameters).toContain(
      "00000000-0000-0000-0000-000000000001",
    );
    expect(compiled.parameters).toContain("active");
    expect(compiled.parameters).toContain("deleted_retention");
  });

  it("requires owner scope on object and space readback", () => {
    const compiled = buildPlantObjectPageObjectQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      "00000000-0000-0000-0000-000000000003",
    ).compile();

    expect(compiled.sql).toContain('"plant_objects"."id" = ');
    expect(compiled.sql).toContain('"plant_objects"."catalog_item_id"');
    expect(compiled.sql).toContain(
      'left join "catalog_items" on "catalog_items"."id" = "plant_objects"."catalog_item_id"',
    );
    expect(compiled.sql).toContain("catalog_items.node_kind = 'taxon'");
    expect(compiled.sql).toContain('"plant_objects"."coarse_region_code"');
    expect(compiled.sql).toContain('"spaces"."coarse_region_code"');
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" = ');
    expect(compiled.sql).toContain('"spaces"."owner_user_id" = ');
    // A gardener's shared cultivar or breed (0086) joins like any form.
    expect(compiled.sql).toContain('"catalog_items"."source" = ');
    expect(compiled.sql).toContain('"plant_objects"."species_text"');
    expect(compiled.parameters).toEqual([
      "active",
      "gardener",
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
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" = ');
    expect(compiled.sql).toContain('"spaces"."owner_user_id" = ');
    expect(compiled.sql).toContain("limit $4");
    expect(compiled.sql).toContain("offset $5");
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("coordinates");
    expect(compiled.parameters).toEqual([
      "active",
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

    expect(compiled.sql).toContain("limit $4");
    expect(compiled.sql).toContain("offset $5");
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
    expect(compiled.sql).toContain('"journal_entries"."owner_user_id" = ');
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" = ');
    expect(compiled.sql).toContain('"journal_entries"."entry_scope" = ');
    expect(compiled.sql).toContain(
      '"journal_entries"."plant_object_id" in ($5, $6)',
    );
    expect(compiled.sql).toContain(
      'group by "journal_entries"."plant_object_id"',
    );
    // OVE-353: a deleted entry is gone from the owner's own counts, not
    // counted separately. There is no archived tally to render any more.
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = ');
    expect(compiled.sql).not.toContain('as "archivedEntryCount"');
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("body");
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000001",
      "object",
      "active",
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
    expect(compiled.sql).toContain('"journal_entries"."owner_user_id" = ');
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" = ');
    expect(compiled.sql).toContain(
      '"media_assets"."derivative_key" is not null',
    );
    expect(compiled.sql).toContain(
      'distinct on ("journal_entries"."plant_object_id")',
    );
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.sql).toContain('"media_assets"."revoked_at" is null');
    expect(compiled.sql).not.toMatch(
      /original_deleted_at|media_readiness_state|quality_policy_version|quality_class/,
    );
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000004",
      "active",
      "inline",
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
      '"catalog_source_records"."projection_status" = ',
    );
    expect(compiled.sql).toContain(
      '"catalog_source_snapshots"."attribution_required" = ',
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

    expect(compiled.sql).toContain('"journal_entries"."owner_user_id" = ');
    expect(compiled.sql).toContain('"journal_entries"."plant_object_id" = ');
    expect(compiled.sql).toContain(
      '"journal_entry_object_mentions"."plant_object_id" = ',
    );
    // OVE-353: a deleted entry leaves the owner's own count immediately.
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = ');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000001",
      "active",
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

    expect(compiled.sql).toContain('"journal_entries"."entry_scope" = ');
    expect(compiled.sql).toContain('"journal_entries"."plant_object_id" = ');
    expect(compiled.sql).toContain(
      '"journal_entry_object_mentions"."plant_object_id" = ',
    );
    expect(compiled.sql).toContain("mentioned_space");
    expect(compiled.sql).toContain("direct_object");
    // OVE-353: the owner timeline is the active journal. A deleted entry is
    // filtered in the canonical query, not hidden by the presentation layer.
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = ');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000001",
      "active",
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

    expect(compiled.sql).toContain('"journal_entries"."owner_user_id" = ');
    expect(compiled.sql).toContain('"journal_entries"."entry_scope" = ');
    expect(compiled.sql).toContain('"journal_entries"."space_id" in ($3, $4)');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = ');
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "space",
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000022",
      "active",
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
    // A catalogue match replaces an own species (0086).
    expect(compiled.sql).toContain('"species_text" = $5');
    expect(compiled.sql).toContain('"updated_at" = $6');
    expect(compiled.sql).toContain('"id" = $7');
    expect(compiled.sql).toContain('"owner_user_id" = $8');
    expect(compiled.sql).toContain('"variety_state" in ($9, $10, $11)');
    expect(compiled.sql).toContain("returning *");
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000000101",
      "plant",
      "Помідор чері",
      "selected",
      null,
      now,
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000001",
      "unknown",
      "own",
      "free_text",
    ]);
  });

  it("keeps an own name as the object's own species, clearing the link and an own cultivar (0086)", () => {
    const now = new Date("2026-06-26T12:00:00.000Z");
    const compiled = buildLabelPlantObjectCatalogQuery(
      testDb,
      scopedToUser("00000000-0000-0000-0000-000000000001"),
      {
        plantObjectId: "00000000-0000-0000-0000-000000000003",
        catalogLabel: "Помідор бабусин",
        now,
      },
    ).compile();

    expect(compiled.sql).toContain('"catalog_item_id" = $1');
    expect(compiled.sql).toContain('"variety_text" = $2');
    expect(compiled.sql).toContain('"variety_state" = $3');
    expect(compiled.sql).toContain('"species_text" = $4');
    expect(compiled.parameters).toEqual([
      null,
      null,
      "unknown",
      "Помідор бабусин",
      now,
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000001",
      "unknown",
      "own",
      "free_text",
    ]);
    // Nothing writes the old label state any more.
    expect(compiled.parameters.slice(0, 5)).not.toContain("free_text");
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
    expect(compiled.sql).toContain('"journal_entries"."owner_user_id" = ');
    expect(compiled.sql).toContain('"journal_entries"."plant_object_id" = ');
    expect(compiled.sql).toContain(
      '"journal_entry_object_mentions"."plant_object_id" = ',
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
      publicJournalEntryNameKey("first-flowers-abc123"),
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
    expect(compiled.sql).toContain(
      'left join "user_handle_registry" on "user_handle_registry"."user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain(
      '"user_handle_registry"."lifecycle_state" = ',
    );
    expect(compiled.sql).toContain('left join "user_public_profiles"');
    expect(compiled.sql).toContain(
      '"user_public_profiles"."user_id" = "user_handle_registry"."user_id"',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."normalized_handle" = "user_handle_registry"."normalized_handle"',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."profile_lifecycle_state" = ',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."removed_at" is null',
    );
    expect(compiled.sql).toContain('"plant_objects"."catalog_item_id"');
    expect(compiled.sql).toContain('"journal_entries"."entry_scope"');
    expect(compiled.sql).toContain('"plant_objects"."id" as "plantObjectId"');
    expect(compiled.sql).toContain('"plant_objects"."object_kind"');
    expect(compiled.sql).toContain('"user_public_profiles"."handle"');
    expect(compiled.sql).toContain('"plant_objects"."coarse_region_code"');
    expect(compiled.sql).toContain('"spaces"."coarse_region_code"');
    expect(compiled.sql).toContain('"journal_entries"."public_slug" = ');
    expect(compiled.sql).toContain('"journal_entries"."visibility" = ');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = ');
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
      "active",
      "current",
      "active",
      "first-flowers-abc123",
      "public",
      "active",
    ]);
  });

  it("can look up a public slug tombstone without owner-private fields", () => {
    const compiled = buildPublicJournalEntryLookupQuery(
      testDb,
      publicJournalEntryNameKey("first-flowers-abc123"),
    ).compile();

    expect(compiled.sql).toContain('"journal_entries"."public_slug" = ');
    expect(compiled.sql).toContain('left join "catalog_items"');
    expect(compiled.sql).toContain('"catalog_items"."public_slug"');
    expect(compiled.sql).toContain('left join "user_handle_registry"');
    expect(compiled.sql).toContain(
      '"user_handle_registry"."lifecycle_state" = ',
    );
    expect(compiled.sql).toContain('left join "user_public_profiles"');
    expect(compiled.sql).toContain(
      '"user_public_profiles"."normalized_handle" = "user_handle_registry"."normalized_handle"',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."profile_lifecycle_state" = ',
    );
    expect(compiled.sql).toContain(
      '"user_public_profiles"."removed_at" is null',
    );
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
      "active",
      "current",
      "active",
      "first-flowers-abc123",
    ]);
  });

  it("classifies journal lifecycle without selecting content or enrichment", () => {
    const compiled = buildPublicJournalEntryLifecycleQuery(
      testDb,
      publicJournalEntryNameKey("first-flowers-abc123"),
    ).compile();

    expect(compiled.sql).toContain('inner join "spaces"');
    expect(compiled.sql).toContain('left join "plant_objects"');
    expect(compiled.sql).toContain('"journal_entries"."public_slug" = ');
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

  /**
   * The address is the author and the number (ADR-0029 D9, amendment of
   * 2026-09-18), so that pair is what the proxy's bounded lookup and the page
   * read ask for — through one shared predicate, so the two can never
   * disagree about which row `/@yehor/post/12` names.
   */
  it("finds an entry by its author and its number, in both reads", () => {
    const key = publicJournalEntryNumberKey("yehor", 12);
    for (const compiled of [
      buildPublicJournalEntryLifecycleQuery(testDb, key).compile(),
      buildPublicJournalEntryLookupQuery(testDb, key).compile(),
    ]) {
      expect(compiled.sql).toContain(
        '"journal_entries"."author_entry_number" = ',
      );
      // The registry's *current* handle: an address under a handle the
      // gardener no longer holds finds nothing here.
      expect(compiled.sql).toContain("handle_registry.normalized_handle");
      expect(compiled.sql).toContain(
        "handle_registry.lifecycle_state = 'current'",
      );
      expect(compiled.sql).not.toContain('"journal_entries"."public_slug" = ');
      expect(compiled.parameters).toContain(12);
      expect(compiled.parameters).toContain("yehor");
    }
    // And the number is on the row both reads return, because it is what the
    // canonical address and every 308 are built from.
    expect(
      buildPublicJournalEntryLifecycleQuery(testDb, key).compile().sql,
    ).toContain('"journal_entries"."author_entry_number" as "entryNumber"');
  });

  it("keeps a name lookup free of the handle when the request carried none", () => {
    const flat = buildPublicJournalEntryLifecycleQuery(
      testDb,
      publicJournalEntryNameKey("first-flowers-abc123"),
    ).compile();
    const scoped = buildPublicJournalEntryLifecycleQuery(
      testDb,
      publicJournalEntryNameKey("first-flowers-abc123", "yehor"),
    ).compile();

    expect(flat.parameters).toEqual(["first-flowers-abc123"]);
    expect(scoped.parameters).toEqual(["first-flowers-abc123", "yehor"]);
  });

  it("selects related public logbook entries for the same object only", () => {
    const compiled = buildRelatedPublicJournalEntriesQuery(
      testDb,
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000020",
      2,
    ).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('"journal_entries"."plant_object_id" = ');
    expect(compiled.sql).toContain('"journal_entries"."id" != $2');
    expect(compiled.sql).toContain('"journal_entries"."visibility" = ');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = ');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).toContain("handle_registry.normalized_handle");
    expect(withoutAuthorHandleSubquery(compiled.sql)).not.toMatch(
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
    expect(compiled.sql).toContain("handle_registry.normalized_handle");
    expect(withoutAuthorHandleSubquery(compiled.sql)).not.toMatch(
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

  it("resolves confirmed public person mentions by stable user id to the current profile handle", () => {
    const entryId = "00000000-0000-4000-8000-000000000020";
    const compiled = buildPublicJournalEntryPersonMentionsQuery(
      testDb,
      entryId,
    ).compile();

    expect(compiled.sql).toContain(
      'inner join "lineage_provenance_edges" as "person_mentions"',
    );
    expect(compiled.sql).toContain(
      '"person_mentions"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain(
      '"person_mentions"."subject_plant_object_id" = "journal_entries"."plant_object_id"',
    );
    expect(compiled.sql).toContain(
      '"person_mentions"."client_mutation_id"\n              ~',
    );
    expect(compiled.sql).toContain(":mention:public_handle:[a-f0-9]{16}$");
    expect(compiled.sql).toContain(
      '"mentioned_handles"."user_id" = "person_mentions"."source_owner_user_id"',
    );
    expect(compiled.sql).toContain('"mentioned_handles"."lifecycle_state" = ');
    expect(compiled.sql).toContain(
      '"mentioned_profiles"."normalized_handle" = "mentioned_handles"."normalized_handle"',
    );
    expect(compiled.sql).toContain(
      '"mentioned_profiles"."profile_lifecycle_state" = ',
    );
    expect(compiled.sql).toContain('"mentioned_profiles"."removed_at" is null');
    expect(compiled.sql).toContain('"mentioned_profiles"."handle" as "handle"');
    expect(compiled.sql).toContain("from profile_blocks");
    expect(compiled.sql).toContain("profile_blocks.block_state = 'active'");
    expect(compiled.sql).toContain(
      'profile_blocks.blocked_user_id = "person_mentions"."source_owner_user_id"',
    );
    expect(compiled.sql).toContain('"person_mentions"."consent_state" =');
    expect(compiled.sql).toContain('"person_mentions"."erasure_state" =');
    expect(compiled.sql).not.toMatch(
      /source_reference_label|email|journal_entries"\."body|quarantine|coordinates|latitude|longitude/i,
    );
    expect(compiled.parameters).toContain(entryId);
    expect(compiled.parameters.at(-1)).toBe(8);
  });

  it("serializes a localized object-first journal chapter without private fields", () => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://media.over.garden");
    const page = serializePublicJournalEntryPage({
      root: {
        sourceLanguage: "uk",
        catalogItemId: "00000000-0000-4000-8000-0000000000c1",
        entryId: "00000000-0000-4000-8000-000000000020",
        title: "Перший урожай",
        body: "Перший абзац.\n\nІсторична згадка @previous_gardener.",
        contentDocument: null,
        contentSchemaVersion: null,
        entryDate: "2026-07-10",
        entryCreatedAt: "2026-07-10T09:00:00.000Z",
        entryScope: "object",
        visibility: "public",
        lifecycleState: "active",
        publicSlug: "pershyi-urozhai",
        entryNumber: 8,
        publishedAt: "2026-07-10T10:00:00.000Z",
        publicGoneAt: null,
        spaceId: "00000000-0000-4000-8000-000000000002",
        spaceDisplayName: "Теплиця",
        spaceLocationVisibility: "region",
        spaceCoarseRegionCode: "UA-30",
        plantObjectId: "00000000-0000-4000-8000-000000000003",
        objectPublicSlug: "черрі",
        objectDisplayName: "Черрі",
        objectKind: "plant",
        catalogKind: "plant_variety",
        catalogCanonicalName: "Помідор чері",
        catalogPublicSlug: "pomidor-cheri",
        catalogSpeciesSlug: null,
        varietyText: "Помідор чері",
        varietyState: "selected",
        objectLocationVisibility: "region",
        objectCoarseRegionCode: "UA-30",
        authorHandle: "olena",
        addressHandle: "olena",
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
          addressHandle: "olena",
          entryNumber: 7,
        },
      ],
      newerRow: null,
      olderRow: {
        entryId: "00000000-0000-4000-8000-000000000021",
        title: "Тиждень раніше",
        body: "Коротка попередня нотатка.",
        entryDate: "2026-07-03",
        publicSlug: "tyzhden-ranishe",
        addressHandle: "olena",
        entryNumber: 7,
      },
      mentionedRows: [],
      mentionedProfileRows: [
        {
          handle: "renamed_gardener",
          displayName: "Садівник",
        },
      ],
      locale: "bg",
    });

    // The author's handle and the entry's number (ADR-0029 D9): the name is
    // still on the row, and it is no longer in the address.
    expect(page.entry.publicPath).toBe("/@olena/post/8");
    expect(page.entry.entryNumber).toBe(8);
    expect(page.context.kind).toBe("object");
    expect(page.context).toMatchObject({
      kind: "object",
      object: {
        displayName: "Черрі",
        // Under the author, as the passport's canonical is (ADR-0029 D9) —
        // not the id path, which has answered 308 since OVE-428.
        publicPath: `/@olena/objects/${encodeURIComponent("черрі")}`,
      },
    });
    expect(page.author?.profilePath).toBe("/bg/@olena");
    expect(page.entry.body).toContain("@previous_gardener");
    expect(page.mentionedProfiles).toEqual([
      {
        handle: "renamed_gardener",
        mention: "@renamed_gardener",
        displayName: "Садівник",
        profilePath: "/bg/@renamed_gardener",
      },
    ]);
    expect(page.topics).toEqual([
      { slug: "harvest", label: "Врожай", publicPath: "/bg/topics/harvest" },
    ]);
    expect(page.media).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000030",
        publicUrl: expect.stringContaining("public/first.webp"),
        altText: "Стиглі томати на кущі",
        caption: "Перша китиця",
        focalX: 0.5,
        focalY: 0.5,
        intrinsicWidth: null,
        intrinsicHeight: null,
        placeholderDataUri: null,
        variantLongEdges: [],
      },
    ]);
    expect(page.adjacentEntries).toMatchObject({
      newer: null,
      older: { publicPath: "/@olena/post/7" },
    });
    expect(page.relatedEntries[0]?.publicPath).toBe("/@olena/post/7");
    expect(JSON.stringify(page)).not.toMatch(
      /ownerUserId|owner_user_id|email|quarantine|coordinates|latitude|longitude/i,
    );
    vi.unstubAllEnvs();
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
    expect(compiled.sql).toContain('"journal_entries"."id" = ');
    expect(compiled.sql).toContain('"journal_entries"."visibility" = ');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = ');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"media_assets"."derivative_key" is not null',
    );
    expect(compiled.sql).toContain('"media_assets"."alt_text" as "altText"');
    expect(compiled.sql).toContain('"media_assets"."caption" as "caption"');
    expect(compiled.sql).toContain('"media_assets"."usage_role" =');
    expect(compiled.sql).toContain('"media_assets"."document_position" asc');
    expect(compiled.sql).toContain('"media_assets"."id" asc');
    expect(compiled.sql).not.toContain('"media_assets"."created_at" asc');
    expect(compiled.sql).toContain("limit $5");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.sql).toContain('"media_assets"."revoked_at" is null');
    expect(compiled.sql).not.toMatch(
      /original_deleted_at|media_readiness_state|quality_policy_version|quality_class/,
    );
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000020",
      "public",
      "active",
      "inline",
      10,
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
    expect(compiled.sql).toContain('"derivative_key" is not null');
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.sql).toContain('"revoked_at" is null');
    expect(compiled.sql).not.toMatch(
      /original_deleted_at|media_readiness_state|quality_policy_version|quality_class/,
    );
    expect(compiled.parameters).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000020",
      "00000000-0000-0000-0000-000000000021",
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
    expect(compiled.sql).toContain('"derivative_key" is not null');
    expect(compiled.sql).toContain('"document_position" asc');
    expect(compiled.sql).toContain('"usage_role" =');
    expect(compiled.sql).not.toContain('"created_at" asc');
    expect(compiled.parameters.at(-1)).toBe(6);
    expect(compiled.sql).not.toContain("quarantine_key");
  });
});
