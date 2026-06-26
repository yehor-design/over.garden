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
  buildFindSeedProofCatalogItemQuery,
  buildListVarietySeedProofsForCurationQuery,
  buildPublishedVarietySeedProofByCatalogItemIdQuery,
  buildUpsertVarietySeedProofQuery,
  normalizeVarietySeedProofInput,
} from "./variety-seed-proof-repository";

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
const scope = scopedToUser("00000000-0000-0000-0000-000000000001");
const catalogItemId = "00000000-0000-4000-8000-000000000101";
const validBody =
  "First-hand note from the founder seed bed. It records what was observed, when the fruit set, and why this variety is worth watching again.";

describe("variety seed proof repository", () => {
  it("allows seed proofs only for global seeded or confirmed catalog rows with public slugs", () => {
    const compiled = buildFindSeedProofCatalogItemQuery(
      testDb,
      catalogItemId,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_items"');
    expect(compiled.sql).toContain('"id" = $1');
    expect(compiled.sql).toContain('"status" in ($2, $3)');
    expect(compiled.sql).toContain('"created_by_user_id" is null');
    expect(compiled.sql).toContain('"public_slug" is not null');
    expect(compiled.sql).not.toContain("provisional");
    expect(compiled.parameters).toEqual([
      catalogItemId,
      "seeded",
      "confirmed",
    ]);
  });

  it("upserts one proof block per catalog item with operator authorship", () => {
    const now = new Date("2026-06-26T12:00:00.000Z");
    const input = normalizeVarietySeedProofInput({
      catalogItemId,
      title: "Why this cherry tomato is worth a page",
      summary: "A short founder note based on observed balcony growth.",
      body: validBody,
      sourceLabel: "Founder observation",
      status: "published",
    });
    const compiled = buildUpsertVarietySeedProofQuery(
      testDb,
      scope,
      input,
      now,
    ).compile();

    expect(compiled.sql).toContain('insert into "variety_seed_proofs"');
    expect(compiled.sql).toContain('"catalog_item_id"');
    expect(compiled.sql).toContain('"author_user_id"');
    expect(compiled.sql).toContain('on conflict ("catalog_item_id") do update');
    expect(compiled.sql).toContain('"published_at" = $16');
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("media_assets");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.parameters).toEqual([
      catalogItemId,
      "Why this cherry tomato is worth a page",
      "A short founder note based on observed balcony growth.",
      validBody,
      "Founder observation",
      "published",
      "00000000-0000-0000-0000-000000000001",
      now,
      now,
      "Why this cherry tomato is worth a page",
      "A short founder note based on observed balcony growth.",
      validBody,
      "Founder observation",
      "published",
      "00000000-0000-0000-0000-000000000001",
      now,
      now,
    ]);
  });

  it("lists internal proof blocks without reading private journal or media fields", () => {
    const compiled = buildListVarietySeedProofsForCurationQuery(
      testDb,
      9,
    ).compile();

    expect(compiled.sql).toContain('from "variety_seed_proofs"');
    expect(compiled.sql).toContain('inner join "catalog_items"');
    expect(compiled.sql).toContain('"catalog_items"."status" in ($1, $2)');
    expect(compiled.sql).toContain(
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(compiled.sql).toContain('"catalog_items"."public_slug" is not null');
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("media_assets");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("email");
    expect(compiled.parameters).toEqual(["seeded", "confirmed", 9]);
  });

  it("selects only published seed proof fields for the public variety page", () => {
    const compiled = buildPublishedVarietySeedProofByCatalogItemIdQuery(
      testDb,
      catalogItemId,
    ).compile();

    expect(compiled.sql).toContain('from "variety_seed_proofs"');
    expect(compiled.sql).toContain('"catalog_item_id" = $1');
    expect(compiled.sql).toContain('"status" = $2');
    expect(compiled.sql).not.toContain("author_user_id");
    expect(compiled.sql).not.toContain("catalog_items");
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("media_assets");
    expect(compiled.parameters).toEqual([catalogItemId, "published"]);
  });

  it("rejects raw HTML in seed proof content", () => {
    expect(() =>
      normalizeVarietySeedProofInput({
        catalogItemId,
        title: "HTML should not pass",
        summary: "A short plain-text summary.",
        body: `${validBody}\n<script>alert('x')</script>`,
        sourceLabel: null,
        status: "draft",
      }),
    ).toThrow("plain text");
  });

  it("rejects obvious precise-location or private field keys", () => {
    expect(() =>
      normalizeVarietySeedProofInput({
        catalogItemId,
        title: "Precise location should not pass",
        summary: "A short plain-text summary.",
        body: `${validBody}\nlatitude: 50.45, longitude: 30.52`,
        sourceLabel: null,
        status: "draft",
      }),
    ).toThrow("unsafe public fields");
  });
});
