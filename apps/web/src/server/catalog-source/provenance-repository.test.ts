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
import { buildCatalogSourceProvenanceForCurationQuery } from "./provenance-repository";

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

describe("catalog source provenance repository", () => {
  it("lists imported source provenance without raw payload or user data", () => {
    const compiled = buildCatalogSourceProvenanceForCurationQuery(
      testDb,
      10,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_source_links"');
    expect(compiled.sql).toContain('inner join "catalog_items"');
    expect(compiled.sql).toContain('inner join "catalog_source_records"');
    expect(compiled.sql).toContain('inner join "catalog_source_snapshots"');
    expect(compiled.sql).toContain("source_record_key");
    expect(compiled.sql).toContain("source_version");
    expect(compiled.sql).toContain("license");
    expect(compiled.sql).toContain("attribution_required");
    expect(compiled.sql).not.toContain("raw_payload");
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("owner_user_id");
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "canonical_item",
      10,
    ]);
  });
});
