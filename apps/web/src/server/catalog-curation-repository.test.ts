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
  buildConfirmCatalogCurationCandidateQuery,
  buildCatalogItemNameForDecisionQuery,
  buildCatalogMatchFingerprint,
  buildMergeCatalogCurationCandidateQuery,
  buildPendingCatalogMatchSuggestionsQuery,
  buildPendingCatalogCurationCandidatesQuery,
  buildPublicEntrySlugsForCatalogCandidateQuery,
  buildRejectCatalogCurationCandidateQuery,
  buildStaleCatalogMatchSuggestionsQuery,
  buildUpdateObjectsForConfirmedCatalogCandidateQuery,
  buildUpdateObjectsForMergedCatalogCandidateQuery,
  normalizeCatalogMatchSuggestionRejectionReason,
} from "./catalog-curation-repository";

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

describe("catalog curation repository query contracts", () => {
  it("locks one pending suggestion and both catalog identities before review", async () => {
    const repository =
      (await import("./catalog-curation-repository")) as Record<
        string,
        unknown
      >;
    const builder = repository.buildCatalogMatchSuggestionForDecisionQuery;

    expect(typeof builder).toBe("function");
    const compiled = (
      builder as (
        executor: Kysely<Database>,
        suggestionId: string,
      ) => { compile(): { sql: string; parameters: readonly unknown[] } }
    )(testDb, "00000000-0000-4000-8000-000000000301").compile();

    expect(compiled.sql).toContain('from "catalog_match_suggestions"');
    expect(compiled.sql).toContain(
      'inner join "catalog_items" as "source_items"',
    );
    expect(compiled.sql).toContain(
      'inner join "catalog_items" as "target_items"',
    );
    expect(compiled.sql).toContain('"catalog_match_suggestions"."status" = $2');
    expect(compiled.sql).toContain("target_catalog_item_name_id");
    expect(compiled.sql).toContain("source_matching_fingerprint");
    expect(compiled.sql).toContain("target_matching_fingerprint");
    expect(compiled.sql).toContain("for update");
    expect(compiled.sql).not.toContain("journal_entries");
  });

  it("locks and reads the exact alias that supplied matching evidence", () => {
    const compiled = buildCatalogItemNameForDecisionQuery(
      testDb,
      "00000000-0000-4000-8000-000000000311",
    ).compile();

    expect(compiled.sql).toContain('from "catalog_item_names"');
    expect(compiled.sql).toContain('"id" = $1');
    expect(compiled.sql).toContain("for update");
    expect(compiled.sql).toContain("normalizedName");
  });

  it("uses the same stable UTF-8 semantic fingerprint contract as the worker", () => {
    expect(buildCatalogMatchFingerprint(["a", "б", "uk"])).toBe(
      "9eb1dcce6971f5add2a31c28cfedccaa01e473bf6ab429a1cc896e1835caf457",
    );
  });

  it("approves one suggestion with reviewer and action-result metadata", async () => {
    const repository =
      (await import("./catalog-curation-repository")) as Record<
        string,
        unknown
      >;
    const builder = repository.buildApproveCatalogMatchSuggestionQuery;

    expect(typeof builder).toBe("function");
    const now = new Date("2026-07-15T08:00:00.000Z");
    const compiled = (
      builder as (
        executor: Kysely<Database>,
        requestScope: ReturnType<typeof scopedToUser>,
        input: {
          suggestionId: string;
          decisionAffectedObjectCount: number;
          now: Date;
        },
      ) => { compile(): { sql: string; parameters: readonly unknown[] } }
    )(testDb, scope, {
      suggestionId: "00000000-0000-4000-8000-000000000301",
      decisionAffectedObjectCount: 2,
      now,
    }).compile();

    expect(compiled.sql).toContain('update "catalog_match_suggestions"');
    expect(compiled.sql).toContain('"status" = $1');
    expect(compiled.sql).toContain('"decision_reason_code" = $4');
    expect(compiled.sql).toContain('"decision_result" = $5');
    expect(compiled.sql).toContain('"decision_affected_object_count" = $6');
    expect(compiled.parameters).toContain("approved");
    expect(compiled.parameters).toContain("approved_canonical_match");
    expect(compiled.parameters).toContain("catalog_merged");
  });

  it("rejects one suggestion with a bounded reason and no catalog mutation", async () => {
    const repository =
      (await import("./catalog-curation-repository")) as Record<
        string,
        unknown
      >;
    const builder = repository.buildRejectCatalogMatchSuggestionQuery;

    expect(typeof builder).toBe("function");
    const compiled = (
      builder as (
        executor: Kysely<Database>,
        requestScope: ReturnType<typeof scopedToUser>,
        input: {
          suggestionId: string;
          reasonCode: string;
          now: Date;
        },
      ) => { compile(): { sql: string; parameters: readonly unknown[] } }
    )(testDb, scope, {
      suggestionId: "00000000-0000-4000-8000-000000000301",
      reasonCode: "not_same_entity",
      now: new Date("2026-07-15T08:00:00.000Z"),
    }).compile();

    expect(compiled.sql).toContain('update "catalog_match_suggestions"');
    expect(compiled.parameters).toContain("rejected");
    expect(compiled.parameters).toContain("not_same_entity");
    expect(compiled.parameters).toContain("suggestion_rejected");
    expect(compiled.sql).not.toContain("catalog_items");
    expect(compiled.sql).not.toContain("plant_objects");
  });

  it("rejects arbitrary decision reasons before building a write", () => {
    expect(
      normalizeCatalogMatchSuggestionRejectionReason("not_same_entity"),
    ).toBe("not_same_entity");
    expect(() =>
      normalizeCatalogMatchSuggestionRejectionReason("freeform operator note"),
    ).toThrow("A valid catalog match rejection reason is required.");
    expect(() =>
      normalizeCatalogMatchSuggestionRejectionReason(undefined),
    ).toThrow("A valid catalog match rejection reason is required.");
  });

  it("lists pending provisional names with aggregate-safe metadata only", () => {
    const compiled = buildPendingCatalogCurationCandidatesQuery(
      testDb,
      12,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_items"');
    expect(compiled.sql).toContain('left join "plant_objects"');
    expect(compiled.sql).toContain('left join "pilot_invite_grants"');
    expect(compiled.sql).toContain("creator_pilot_grants");
    expect(compiled.sql).toContain("object_owner_pilot_grants");
    expect(compiled.sql).toContain('"creator_pilot_grants"."cohort" = $2');
    expect(compiled.sql).toContain('"object_owner_pilot_grants"."cohort" = $3');
    expect(compiled.sql).toContain("bool_or");
    expect(compiled.sql).toContain("count(distinct");
    expect(compiled.sql).toContain('"catalog_items"."status" = $4');
    expect(compiled.sql).toContain('"catalog_items"."source" = $5');
    expect(compiled.sql).toContain(
      '"catalog_items"."created_by_user_id" is not null',
    );
    expect(compiled.sql).not.toContain("job_queue");
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("title");
    expect(compiled.sql).not.toContain("body");
    expect(compiled.sql).not.toContain("email");
    expect(compiled.parameters).toEqual([
      "user_added",
      "closed_pilot",
      "closed_pilot",
      "provisional",
      "user_added",
      12,
    ]);
  });

  it("prioritizes pilot-origin candidates without selecting gardener identities", () => {
    const compiled =
      buildPendingCatalogCurationCandidatesQuery(testDb).compile();

    expect(compiled.sql).toContain("order by bool_or");
    expect(compiled.sql).toContain('"catalog_items"."created_at" asc');
    expect(JSON.stringify(compiled.parameters)).not.toContain("00000000");
  });

  it("reads pending and rejected match evidence for provisional user names", () => {
    const compiled = buildPendingCatalogMatchSuggestionsQuery(testDb, [
      "00000000-0000-4000-8000-000000000201",
    ]).compile();

    expect(compiled.sql).toContain('from "catalog_match_suggestions"');
    expect(compiled.sql).toContain(
      'inner join "catalog_items" as "source_items"',
    );
    expect(compiled.sql).toContain(
      'left join "catalog_items" as "target_items"',
    );
    expect(compiled.sql).toContain(
      '"catalog_match_suggestions"."status" in ($2, $3)',
    );
    expect(compiled.sql).toContain('"source_items"."status" = $4');
    expect(compiled.sql).toContain('"source_items"."source" = $5');
    expect(compiled.sql).toContain(
      '"source_items"."created_by_user_id" is not null',
    );
    expect(compiled.sql).toContain(
      '"target_items"."created_by_user_id" is null',
    );
    expect(compiled.sql).not.toContain("safe_evidence");
    expect(compiled.parameters).toContain("pending");
    expect(compiled.parameters).toContain("rejected");
    for (const forbidden of [
      "journal_entries",
      "owner_user_id",
      "email",
      "raw_payload",
      "source_record_id",
      "media_assets",
      "latitude",
      "longitude",
    ]) {
      expect(compiled.sql).not.toContain(forbidden);
    }
  });

  it("marks only unresolved suggestions stale after a manual catalog decision", () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    const compiled = buildStaleCatalogMatchSuggestionsQuery(
      testDb,
      "00000000-0000-4000-8000-000000000201",
      now,
    ).compile();

    expect(compiled.sql).toContain('update "catalog_match_suggestions"');
    expect(compiled.sql).toContain('"status" = $1');
    expect(compiled.sql).toContain('"source_catalog_item_id" = $3');
    expect(compiled.sql).toContain('"status" = $4');
    expect(compiled.parameters).toEqual([
      "stale",
      now,
      "00000000-0000-4000-8000-000000000201",
      "pending",
    ]);
  });

  it("confirms a provisional candidate into global catalog eligibility", () => {
    const now = new Date("2026-06-26T12:00:00.000Z");
    const compiled = buildConfirmCatalogCurationCandidateQuery(testDb, scope, {
      candidateId: "00000000-0000-4000-8000-000000000201",
      now,
      publicSlug: "babusyn-perets-0000000201",
    }).compile();

    expect(compiled.sql).toContain('update "catalog_items"');
    expect(compiled.sql).toContain('"status" = $1');
    expect(compiled.sql).toContain('"source" = $2');
    expect(compiled.sql).toContain('"public_slug" = $3');
    expect(compiled.sql).toContain('"created_by_user_id" = $4');
    expect(compiled.sql).toContain('"reviewed_at" = $5');
    expect(compiled.sql).toContain('"reviewed_by_user_id" = $6');
    expect(compiled.sql).toContain('"merged_into_catalog_item_id" = $7');
    expect(compiled.sql).toContain('"updated_at" = $8');
    expect(compiled.sql).toContain('"id" = $9');
    expect(compiled.sql).toContain('"status" = $10');
    expect(compiled.sql).toContain('"source" = $11');
    expect(compiled.sql).toContain('"created_by_user_id" is not null');
    expect(compiled.sql).not.toContain("catalog_alias_projections");
    expect(compiled.parameters).toEqual([
      "confirmed",
      "curated_user",
      "babusyn-perets-0000000201",
      null,
      now,
      "00000000-0000-0000-0000-000000000001",
      null,
      now,
      "00000000-0000-4000-8000-000000000201",
      "provisional",
      "user_added",
    ]);
  });

  it("updates user-added objects to selected when a candidate is confirmed", () => {
    const now = new Date("2026-06-26T12:00:00.000Z");
    const compiled = buildUpdateObjectsForConfirmedCatalogCandidateQuery(
      testDb,
      {
        candidateId: "00000000-0000-4000-8000-000000000201",
        varietyText: "Бабусин перець",
        now,
      },
    ).compile();

    expect(compiled.sql).toContain('update "plant_objects"');
    expect(compiled.sql).toContain('"variety_text" = $1');
    expect(compiled.sql).toContain('"variety_state" = $2');
    expect(compiled.sql).toContain('"updated_at" = $3');
    expect(compiled.sql).toContain('"catalog_item_id" = $4');
    expect(compiled.sql).toContain('"variety_state" = $5');
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.parameters).toEqual([
      "Бабусин перець",
      "selected",
      now,
      "00000000-0000-4000-8000-000000000201",
      "user_added",
    ]);
  });

  it("marks a provisional candidate as merged into an existing catalog item", () => {
    const now = new Date("2026-06-26T12:00:00.000Z");
    const compiled = buildMergeCatalogCurationCandidateQuery(testDb, scope, {
      candidateId: "00000000-0000-4000-8000-000000000201",
      targetCatalogItemId: "00000000-0000-4000-8000-000000000101",
      now,
    }).compile();

    expect(compiled.sql).toContain('update "catalog_items"');
    expect(compiled.sql).toContain('"status" = $1');
    expect(compiled.sql).toContain('"reviewed_at" = $2');
    expect(compiled.sql).toContain('"reviewed_by_user_id" = $3');
    expect(compiled.sql).toContain('"merged_into_catalog_item_id" = $4');
    expect(compiled.sql).toContain('"updated_at" = $5');
    expect(compiled.sql).toContain('"created_by_user_id" is not null');
    expect(compiled.sql).not.toContain("catalog_alias_projections");
    expect(compiled.parameters).toEqual([
      "merged",
      now,
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-4000-8000-000000000101",
      now,
      "00000000-0000-4000-8000-000000000201",
      "provisional",
      "user_added",
    ]);
  });

  it("moves affected objects to the merge target without moving entries", () => {
    const now = new Date("2026-06-26T12:00:00.000Z");
    const compiled = buildUpdateObjectsForMergedCatalogCandidateQuery(testDb, {
      candidateId: "00000000-0000-4000-8000-000000000201",
      targetCatalogItemId: "00000000-0000-4000-8000-000000000101",
      varietyText: "Помідор чері",
      now,
    }).compile();

    expect(compiled.sql).toContain('update "plant_objects"');
    expect(compiled.sql).toContain('"catalog_item_id" = $1');
    expect(compiled.sql).toContain('"variety_text" = $2');
    expect(compiled.sql).toContain('"variety_state" = $3');
    expect(compiled.sql).toContain('"updated_at" = $4');
    expect(compiled.sql).toContain('"catalog_item_id" = $5');
    expect(compiled.sql).toContain('"variety_state" = $6');
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000000101",
      "Помідор чері",
      "selected",
      now,
      "00000000-0000-4000-8000-000000000201",
      "user_added",
    ]);
  });

  it("can merge a provisional user-added candidate into an imported official variety", () => {
    const now = new Date("2026-06-29T12:00:00.000Z");
    const compiled = buildUpdateObjectsForMergedCatalogCandidateQuery(testDb, {
      candidateId: "00000000-0000-4000-8000-000000000201",
      targetCatalogItemId: "00000000-0000-4000-8000-000000057003",
      varietyText: "Ботсадівський",
      now,
    }).compile();

    expect(compiled.sql).toContain('update "plant_objects"');
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain("catalog_alias_projections");
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000057003",
      "Ботсадівський",
      "selected",
      now,
      "00000000-0000-4000-8000-000000000201",
      "user_added",
    ]);
  });

  it("rejects a provisional candidate without creating global eligibility", () => {
    const now = new Date("2026-06-26T12:00:00.000Z");
    const compiled = buildRejectCatalogCurationCandidateQuery(testDb, scope, {
      candidateId: "00000000-0000-4000-8000-000000000201",
      now,
    }).compile();

    expect(compiled.sql).toContain('update "catalog_items"');
    expect(compiled.sql).toContain('"status" = $1');
    expect(compiled.sql).toContain('"merged_into_catalog_item_id" = $4');
    expect(compiled.sql).toContain('"created_by_user_id" is not null');
    expect(compiled.parameters).toEqual([
      "rejected",
      now,
      "00000000-0000-0000-0000-000000000001",
      null,
      now,
      "00000000-0000-4000-8000-000000000201",
      "provisional",
      "user_added",
    ]);
  });

  it("finds affected public entry slugs without selecting private entry fields", () => {
    const compiled = buildPublicEntrySlugsForCatalogCandidateQuery(
      testDb,
      "00000000-0000-4000-8000-000000000201",
    ).compile();

    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain('inner join "plant_objects"');
    expect(compiled.sql).toContain('"plant_objects"."catalog_item_id" = $1');
    expect(compiled.sql).toContain('"plant_objects"."variety_state" = $2');
    expect(compiled.sql).toContain('"journal_entries"."visibility" = $3');
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $4');
    expect(compiled.sql).toContain(
      '"journal_entries"."public_gone_at" is null',
    );
    expect(compiled.sql).toContain(
      '"journal_entries"."public_slug" is not null',
    );
    expect(compiled.sql).not.toContain("client_mutation_id");
    expect(compiled.sql).not.toContain("body");
    expect(compiled.sql).not.toContain("quarantine_key");
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000000201",
      "user_added",
      "public",
      "active",
    ]);
  });
});
