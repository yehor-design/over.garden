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
const scope = scopedToUser("00000000-0000-4000-8000-000000000999");

async function loadRepository() {
  return (await import("./catalog-alias-curation-repository")) as Record<
    string,
    (...args: never[]) => unknown
  >;
}

describe("catalog alias curation repository", () => {
  it("searches only global selectable catalog identities", async () => {
    const repository = await loadRepository();
    const compiled = (
      repository.buildCatalogAliasSuggestionTargetsQuery as unknown as (
        executor: Kysely<Database>,
        input: { query: string; limit: number },
      ) => { compile(): { sql: string; parameters: readonly unknown[] } }
    )(testDb, { query: "rosa", limit: 8 }).compile();

    expect(compiled.sql).toContain('from "catalog_items"');
    expect(compiled.sql).toContain('"catalog_items"."status" in');
    expect(compiled.sql).toContain(
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(compiled.sql).toContain("from catalog_item_names");
    expect(compiled.sql).toContain("ilike");
    expect(compiled.parameters).toContain("%rosa%");
    expect(compiled.sql).not.toContain("journal_entries");
  });

  it("reads generated review rows without private or raw-source fields", async () => {
    const repository = await loadRepository();
    const compiled = (
      repository.buildCatalogAliasSuggestionsForCurationQuery as unknown as (
        executor: Kysely<Database>,
        limit: number,
      ) => { compile(): { sql: string; parameters: readonly unknown[] } }
    )(testDb, 25).compile();

    expect(compiled.sql).toContain('from "catalog_alias_projections"');
    expect(compiled.sql).toContain('inner join "catalog_items"');
    expect(compiled.sql).toContain('"source_method" =');
    expect(compiled.sql).toContain("reasonCodes");
    expect(compiled.sql).toContain("decisionReasonCode");
    expect(compiled.parameters).toContain("generated");
    for (const forbidden of [
      "journal_entries",
      "owner_user_id",
      "email",
      "raw_payload",
      "source_only_fields",
      "media_assets",
    ]) {
      expect(compiled.sql).not.toContain(forbidden);
    }
  });

  it("enqueues one exact idempotent worker job per catalog identity", async () => {
    const repository = await loadRepository();
    const catalogItemId = "00000000-0000-4000-8000-000000000101";
    const compiled = (
      repository.buildEnqueueCatalogAliasSuggestionsRefreshJobQuery as unknown as (
        executor: Kysely<Database>,
        catalogItemId: string,
      ) => { compile(): { sql: string; parameters: readonly unknown[] } }
    )(testDb, catalogItemId).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.sql).toContain("on conflict");
    expect(compiled.sql).toContain("rerun_requested");
    expect(compiled.parameters).toContain("matching");
    expect(compiled.parameters).toContain(
      "matching:catalog_alias_suggestions_refresh:" + catalogItemId,
    );
    expect(JSON.stringify(compiled.parameters)).toContain(
      "catalog_alias_suggestions_refresh",
    );
    expect(JSON.stringify(compiled.parameters)).not.toContain("journalBody");
  });

  it("locks the proposal, source name, and catalog identity before approval", async () => {
    const repository = await loadRepository();
    const compiled = (
      repository.buildCatalogAliasSuggestionForDecisionQuery as unknown as (
        executor: Kysely<Database>,
        aliasProjectionId: string,
      ) => { compile(): { sql: string; parameters: readonly unknown[] } }
    )(testDb, "00000000-0000-4000-8000-000000000301").compile();

    expect(compiled.sql).toContain('from "catalog_alias_projections"');
    expect(compiled.sql).toContain('inner join "catalog_items"');
    expect(compiled.sql).toContain(
      'inner join "catalog_item_names" as "source_names"',
    );
    expect(compiled.sql).toContain("sourceNameFingerprint");
    expect(compiled.sql).toContain("sourceNameEligible");
    expect(compiled.sql).toContain("source_method");
    expect(compiled.sql).toContain("status = 'accepted'");
    expect(compiled.sql).toContain("source_method <> 'generated'");
    expect(compiled.sql).toContain("for update");
    expect(compiled.sql).not.toContain("journal_entries");
  });

  it("checks normalized collisions against other catalog concepts", async () => {
    const repository = await loadRepository();
    const compiled = (
      repository.buildCatalogAliasCollisionQuery as unknown as (
        executor: Kysely<Database>,
        input: { catalogItemId: string; normalizedName: string },
      ) => { compile(): { sql: string; parameters: readonly unknown[] } }
    )(testDb, {
      catalogItemId: "00000000-0000-4000-8000-000000000101",
      normalizedName: "rozova gradina",
    }).compile();

    expect(compiled.sql).toContain('from "catalog_item_names"');
    expect(compiled.sql).toContain('"normalized_name" =');
    expect(compiled.sql).toContain('"catalog_item_id" !=');
    expect(compiled.sql).toContain("for update");
  });

  it("projects an approved alias and records a closed audit result", async () => {
    const repository = await loadRepository();
    const now = new Date("2026-07-15T12:00:00.000Z");
    const insertCompiled = (
      repository.buildInsertApprovedCatalogAliasNameQuery as unknown as (
        executor: Kysely<Database>,
        input: {
          catalogItemId: string;
          displayName: string;
          normalizedName: string;
          locale: string;
        },
      ) => { compile(): { sql: string; parameters: readonly unknown[] } }
    )(testDb, {
      catalogItemId: "00000000-0000-4000-8000-000000000101",
      displayName: "Rozova gradina",
      normalizedName: "rozova gradina",
      locale: "bg",
    }).compile();
    const approveCompiled = (
      repository.buildApproveCatalogAliasProjectionQuery as unknown as (
        executor: Kysely<Database>,
        requestScope: ReturnType<typeof scopedToUser>,
        input: {
          aliasProjectionId: string;
          catalogItemNameId: string;
          decisionResult: string;
          now: Date;
        },
      ) => { compile(): { sql: string; parameters: readonly unknown[] } }
    )(testDb, scope, {
      aliasProjectionId: "00000000-0000-4000-8000-000000000301",
      catalogItemNameId: "00000000-0000-4000-8000-000000000401",
      decisionResult: "alias_projected",
      now,
    }).compile();

    expect(insertCompiled.sql).toContain('insert into "catalog_item_names"');
    expect(insertCompiled.sql).toContain("on conflict");
    expect(insertCompiled.parameters).toContain(false);
    expect(approveCompiled.sql).toContain('update "catalog_alias_projections"');
    expect(approveCompiled.parameters).toContain("accepted");
    expect(approveCompiled.parameters).toContain("approved_generated_alias");
    expect(approveCompiled.parameters).toContain("alias_projected");
    expect(approveCompiled.parameters).toContain(scope.userId);
  });

  it("rejects free-form decision reasons before any write", async () => {
    const repository = await loadRepository();
    const normalize =
      repository.normalizeCatalogAliasRejectionReason as unknown as (
        value: string | null | undefined,
      ) => string;

    expect(normalize("incorrect_variant")).toBe("incorrect_variant");
    expect(() => normalize("free-form operator note")).toThrow(
      "A valid catalog alias rejection reason is required.",
    );
    expect(() => normalize(undefined)).toThrow(
      "A valid catalog alias rejection reason is required.",
    );
  });
});
