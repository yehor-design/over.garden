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
  buildPublicLineageEdgesForSubjectsQuery,
  buildPublicLineageRootObjectQuery,
  publicLineageNodeLocationLabel,
} from "./public-lineage-repository";

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
const rootPlantObjectId = "00000000-0000-4000-8000-000000000101";
const sourcePlantObjectId = "00000000-0000-4000-8000-000000000102";

describe("public lineage repository query contracts", () => {
  it("opens public lineage only for objects backed by active public entries", () => {
    const compiled = buildPublicLineageRootObjectQuery(
      testDb,
      rootPlantObjectId,
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
    expect(compiled.sql).toContain('"plant_objects"."id" = $3');
    expect(compiled.sql).not.toMatch(
      /journal_entries"\."title|journal_entries"\."body|media_assets|quarantine|derivative|ip_address|user_agent|email|phone|coordinates|latitude|longitude|source_reference_label|client_mutation_id|pending_identity/i,
    );
    expect(compiled.parameters).toEqual([
      "public",
      "active",
      rootPlantObjectId,
    ]);
  });

  it("reads only confirmed active public-object lineage edges", () => {
    const compiled = buildPublicLineageEdgesForSubjectsQuery(testDb, [
      rootPlantObjectId,
      sourcePlantObjectId,
    ]).compile();

    expect(compiled.sql).toContain('from "lineage_provenance_edges"');
    expect(compiled.sql).toContain(
      'inner join "plant_objects" as "subject_objects"',
    );
    expect(compiled.sql).toContain(
      'inner join "plant_objects" as "source_objects"',
    );
    expect(compiled.sql).toContain(
      'inner join "journal_entries" as "subject_public_entries"',
    );
    expect(compiled.sql).toContain(
      'inner join "journal_entries" as "source_public_entries"',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."subject_plant_object_id" in ($5, $6)',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."source_kind" = $7',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."source_plant_object_id" is not null',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."source_owner_user_id" is not null',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."consent_state" = $8',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."visibility_policy" = $9',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."erasure_state" = $10',
    );
    expect(compiled.sql).not.toMatch(
      /journal_entries"\."title|journal_entries"\."body|media_assets|quarantine|derivative|ip_address|user_agent|email|phone|coordinates|latitude|longitude|source_reference_label|source_pending_identity_id|pending_identities|client_mutation_id/i,
    );
    expect(compiled.parameters).toEqual([
      "public",
      "active",
      "public",
      "active",
      rootPlantObjectId,
      sourcePlantObjectId,
      "own_object",
      "confirmed",
      "owner_only_until_confirmed",
      "active",
    ]);
  });

  it("suppresses hidden or unsupported regions in the public node label", () => {
    expect(
      publicLineageNodeLocationLabel({
        locationVisibility: "region",
        coarseRegionCode: "UA-30",
      }),
    ).toBe("Region: Ukraine - Kyiv City");
    expect(
      publicLineageNodeLocationLabel({
        locationVisibility: "hidden",
        coarseRegionCode: "UA-30",
      }),
    ).toBeNull();
    expect(
      publicLineageNodeLocationLabel({
        locationVisibility: "region",
        coarseRegionCode: "Kyiv apartment balcony",
      }),
    ).toBeNull();
  });
});
