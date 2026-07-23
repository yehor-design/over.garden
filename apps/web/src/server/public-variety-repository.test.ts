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
  buildIndexablePublicVarietySitemapRowsQuery,
  buildPublicVarietyEntriesQuery,
  buildPublicVarietySourceCreditsQuery,
  buildPublicVarietySummaryQuery,
} from "./public-variety-repository";

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

describe("public variety repository query contracts", () => {
  it("counts only safe public entries for global seeded or confirmed catalog identity", () => {
    const compiled = buildPublicVarietySummaryQuery(
      testDb,
      "pomidor-cheri-0000000101",
    ).compile();

    expect(compiled.sql).toContain('from "catalog_items"');
    expect(compiled.sql).toContain(
      'inner join "plant_objects" on "plant_objects"."catalog_item_id" = "catalog_items"."id"',
    );
    expect(compiled.sql).toContain(
      'inner join "journal_entries" on "journal_entries"."plant_object_id" = "plant_objects"."id"',
    );
    expect(compiled.sql).toContain(
      'inner join "spaces" on "spaces"."id" = "journal_entries"."space_id"',
    );
    expect(compiled.sql).not.toContain('left join "media_assets"');
    expect(compiled.sql).toContain("from media_assets as public_media");
    expect(compiled.sql).toContain("select count(*)");
    expect(compiled.sql).not.toContain("case when exists");
    expect(compiled.sql).toContain(
      'coalesce(sum(char_length("journal_entries"."body")), 0)',
    );
    expect(compiled.sql).toContain('"catalog_items"."id"');
    expect(compiled.sql).toContain('"catalog_items"."public_slug" = $1');
    expect(compiled.sql).toContain('"catalog_items"."status" in ($2, $3)');
    expect(compiled.sql).not.toContain("provisional");
    expect(compiled.sql).not.toContain("rejected");
    expect(compiled.sql).not.toContain("merged");
    expect(compiled.sql).toContain(
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(compiled.sql).toContain('"plant_objects"."variety_state" = $4');
    expect(compiled.sql).toContain(
      '"journal_entries"."owner_user_id" = "plant_objects"."owner_user_id"',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."owner_user_id" = "spaces"."owner_user_id"',
    );
    expect(compiled.sql).toContain(
      'public_media.owner_user_id = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain('"journal_entries"."visibility" = $5');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $6');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.sql).not.toContain("original_deleted_at");
    expect(compiled.sql).not.toContain("coordinates");
    expect(compiled.sql).not.toContain("latitude");
    expect(compiled.sql).not.toContain("longitude");
    expect(compiled.parameters).toEqual([
      "pomidor-cheri-0000000101",
      "seeded",
      "confirmed",
      "selected",
      "public",
      "active",
    ]);
  });

  it("can constrain a deep evidence page to its expected species or breed kind", () => {
    const compiled = buildPublicVarietySummaryQuery(
      testDb,
      "solanum-lycopersicum",
      "species",
    ).compile();

    expect(compiled.sql).toContain('"catalog_items"."catalog_kind"');
    expect(compiled.sql).toContain('"catalog_items"."catalog_kind" =');
    expect(compiled.parameters).toContain("species");
  });

  it("selects bounded entry readback with derivative media only", () => {
    const compiled = buildPublicVarietyEntriesQuery(
      testDb,
      "pomidor-cheri-0000000101",
      99,
    ).compile();

    expect(compiled.sql).toContain('"journal_entries"."title"');
    expect(compiled.sql).toContain('"journal_entries"."body"');
    expect(compiled.sql).toContain('"journal_entries"."entry_date"');
    expect(compiled.sql).toContain('from "media_assets"');
    expect(compiled.sql).not.toContain('left join "media_assets"');
    expect(compiled.sql).toContain('"media_assets"."derivative_key"');
    expect(compiled.sql).toContain(
      '"first_public_media"."ownerUserId" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain("cover_media_asset_id");
    expect(compiled.sql).toContain('"media_assets"."document_position" asc');
    expect(compiled.sql).not.toContain('"media_assets"."created_at" asc');
    expect(compiled.sql).toContain('"catalog_items"."public_slug" = $3');
    expect(compiled.sql).toContain('"catalog_items"."status" in ($4, $5)');
    expect(compiled.sql).not.toContain("provisional");
    expect(compiled.sql).not.toContain("rejected");
    expect(compiled.sql).not.toContain("merged");
    expect(compiled.sql).toContain(
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(compiled.sql).toContain('"plant_objects"."variety_state" = $6');
    expect(compiled.sql).toContain('"journal_entries"."visibility" = $7');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $8');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).toContain(
      'order by "journal_entries"."entry_date" desc',
    );
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.sql).not.toContain("original_deleted_at");
    expect(compiled.sql).not.toContain("email");
    expect(compiled.sql).not.toContain("coordinates");
    expect(compiled.sql).not.toContain("latitude");
    expect(compiled.sql).not.toContain("longitude");
    expect(compiled.parameters).toEqual([
      "processed",
      "inline",
      "pomidor-cheri-0000000101",
      "seeded",
      "confirmed",
      "selected",
      "public",
      "active",
      20,
    ]);
  });

  it("reads public source credits without raw source payload or source-only fields", () => {
    const catalogItemId = "00000000-0000-4000-8000-000000063001";
    const compiled = buildPublicVarietySourceCreditsQuery(
      testDb,
      catalogItemId,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_source_links"');
    expect(compiled.sql).toContain('inner join "catalog_source_records"');
    expect(compiled.sql).toContain('inner join "catalog_source_snapshots"');
    expect(compiled.sql).toContain('"catalog_source_snapshots"."source_name"');
    expect(compiled.sql).toContain('"catalog_source_snapshots"."source_url"');
    expect(compiled.sql).toContain('"catalog_source_snapshots"."license"');
    expect(compiled.sql).toContain('"catalog_source_snapshots"."license_url"');
    expect(compiled.sql).toContain(
      '"catalog_source_snapshots"."attribution_text"',
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
    ]);
  });

  it("lists sitemap rows only for threshold-passing public variety pages", () => {
    const compiled =
      buildIndexablePublicVarietySitemapRowsQuery(testDb).compile();

    expect(compiled.sql).toContain('from "catalog_items"');
    expect(compiled.sql).toContain(
      'inner join "plant_objects" on "plant_objects"."catalog_item_id" = "catalog_items"."id"',
    );
    expect(compiled.sql).toContain(
      'inner join "journal_entries" on "journal_entries"."plant_object_id" = "plant_objects"."id"',
    );
    expect(compiled.sql).toContain(
      'inner join "spaces" on "spaces"."id" = "journal_entries"."space_id"',
    );
    expect(compiled.sql).toContain('"catalog_items"."public_slug" is not null');
    expect(compiled.sql).toContain('"catalog_items"."status" in ($1, $2)');
    expect(compiled.sql).toContain('"catalog_items"."status" = $3');
    expect(compiled.sql).toContain('"catalog_items"."status" = $4');
    expect(compiled.sql).toContain('"catalog_items"."source" in');
    expect(compiled.sql).not.toContain("internal_seed");
    expect(compiled.sql).not.toContain("grin_genebank_candidate");
    expect(compiled.sql).not.toContain("provisional");
    expect(compiled.sql).not.toContain("rejected");
    expect(compiled.sql).not.toContain("merged");
    expect(compiled.sql).toContain(
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(compiled.sql).toContain('"plant_objects"."variety_state" = $11');
    expect(compiled.sql).toContain(
      '"journal_entries"."owner_user_id" = "plant_objects"."owner_user_id"',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."owner_user_id" = "spaces"."owner_user_id"',
    );
    expect(compiled.sql).toContain('"journal_entries"."visibility" = $12');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $13');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).toContain(
      'group by "catalog_items"."catalog_kind", "catalog_items"."public_slug"',
    );
    expect(compiled.sql).toContain(
      'having count("journal_entries"."id") >= $14 and coalesce(sum(char_length("journal_entries"."body")), 0) >= $15',
    );
    expect(compiled.sql).not.toContain('join "media_assets"');
    expect(compiled.sql).not.toContain("variety_seed_proofs");
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.sql).not.toContain("original_deleted_at");
    expect(compiled.sql).not.toContain("email");
    expect(compiled.sql).not.toContain("coordinates");
    expect(compiled.sql).not.toContain("latitude");
    expect(compiled.sql).not.toContain("longitude");
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "confirmed",
      "seeded",
      "ua_state_register",
      "species_backbone",
      "ua_official_bee_breed",
      "vertebrate_breed_ontology",
      "eu_common_catalogue_bg",
      "eu_oj_eur_lex_common_catalogue",
      "selected",
      "public",
      "active",
      3,
      600,
    ]);
  });
});
