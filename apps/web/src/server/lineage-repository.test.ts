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
  buildFindProvenanceEdgeByClientMutationQuery,
  buildInsertProvenanceEdgeQuery,
  buildLineageSourceObjectOptionsQuery,
  buildObjectProvenanceEdgesQuery,
  normalizeLineageSourceReferenceLabel,
} from "./lineage-repository";

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
const scope = scopedToUser("00000000-0000-4000-8000-000000000001");
const subjectPlantObjectId = "00000000-0000-4000-8000-000000000101";
const sourcePlantObjectId = "00000000-0000-4000-8000-000000000102";

describe("lineage provenance repository query contracts", () => {
  it("lists source object candidates only inside the current owner scope", () => {
    const compiled = buildLineageSourceObjectOptionsQuery(
      testDb,
      scope,
      subjectPlantObjectId,
    ).compile();

    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" = $1');
    expect(compiled.sql).toContain('"plant_objects"."id" != $2');
    expect(compiled.sql).not.toMatch(
      /journal_entries|media_assets|analytics_events|coarse_region|location_visibility|email|token/i,
    );
    expect(compiled.parameters).toEqual([
      scope.userId,
      subjectPlantObjectId,
    ]);
  });

  it("inserts proposed provenance edges idempotently by owner and client mutation", () => {
    const compiled = buildInsertProvenanceEdgeQuery(testDb, {
      owner_user_id: scope.userId,
      subject_plant_object_id: subjectPlantObjectId,
      source_kind: "own_object",
      source_plant_object_id: sourcePlantObjectId,
      source_owner_user_id: scope.userId,
      source_reference_kind: null,
      source_reference_label: null,
      edge_type: "provenance",
      consent_state: "proposed",
      visibility_policy: "owner_only_until_confirmed",
      erasure_state: "active",
      client_mutation_id: "lineage-1",
    }).compile();

    expect(compiled.sql).toContain('insert into "lineage_provenance_edges"');
    expect(compiled.sql).toContain(
      'on conflict ("owner_user_id", "client_mutation_id") do nothing',
    );
    expect(compiled.sql).toContain("returning *");
    expect(compiled.parameters).toEqual([
      scope.userId,
      subjectPlantObjectId,
      "own_object",
      sourcePlantObjectId,
      scope.userId,
      null,
      null,
      "provenance",
      "proposed",
      "owner_only_until_confirmed",
      "active",
      "lineage-1",
    ]);
  });

  it("finds idempotent provenance edges only inside the current owner scope", () => {
    const compiled = buildFindProvenanceEdgeByClientMutationQuery(
      testDb,
      scope,
      "lineage-1",
    ).compile();

    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('"client_mutation_id" = $2');
    expect(compiled.parameters).toEqual([scope.userId, "lineage-1"]);
  });

  it("reads proposed edges for one owned subject without selecting private payload fields", () => {
    const compiled = buildObjectProvenanceEdgesQuery(
      testDb,
      scope,
      subjectPlantObjectId,
    ).compile();

    expect(compiled.sql).toContain(
      'from "lineage_provenance_edges"',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."owner_user_id" = $1',
    );
    expect(compiled.sql).toContain(
      '"lineage_provenance_edges"."subject_plant_object_id" = $2',
    );
    expect(compiled.sql).toContain(
      '"source_objects"."owner_user_id" = "lineage_provenance_edges"."source_owner_user_id"',
    );
    expect(compiled.sql).not.toMatch(
      /journal_entries|media_assets|analytics_events|body|quarantine|derivative|ip|user_agent|email|phone|coarse_region|location_visibility/i,
    );
    expect(compiled.parameters).toEqual([
      scope.userId,
      subjectPlantObjectId,
    ]);
  });

  it("rejects source labels that look like private contact details or precise coordinates", () => {
    expect(normalizeLineageSourceReferenceLabel("Spring seed swap")).toBe(
      "Spring seed swap",
    );

    for (const unsafe of [
      "maria@example.com",
      "+380 67 123 45 67",
      "https://example.com/source",
      "@private-handle",
      "50.450100, 30.523400",
    ]) {
      expect(() => normalizeLineageSourceReferenceLabel(unsafe)).toThrow(
        /contact details/i,
      );
    }
  });
});
