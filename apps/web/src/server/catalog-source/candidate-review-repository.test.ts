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
  GENEBANK_LONG_TAIL_PARSER_VERSION,
  genebankLongTailDefinition,
} from "@/lib/catalog/genebank-long-tail";
import {
  buildCatalogSourceCandidateForDecisionQuery,
  buildCatalogSourceCandidateReviewSummaryQuery,
  buildCatalogSourceCandidatesForReviewQuery,
  buildHoldCatalogSourceCandidateQuery,
  buildRejectCatalogSourceCandidateQuery,
  toCatalogSourceCandidateReviewItem,
  type CatalogSourceCandidateReviewRow,
} from "./candidate-review-repository";

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
const definition = genebankLongTailDefinition();
const heldRecord = definition.records.find(
  (record) => record.id === definition.heldRecordKey,
)!;

const forbiddenReviewMarkers = [
  "rawPayload",
  "sourceOnlyFields",
  "accessionIdentifier",
  "accessionRecordUrl",
  "genesysEuriscoBlocker",
  "journalBody",
  "ownerUserId",
  "mediaKey",
  "decimalLatitude",
  "decimalLongitude",
  "occurrenceCoordinates",
];

function candidateRow(
  overrides: Partial<CatalogSourceCandidateReviewRow> = {},
): CatalogSourceCandidateReviewRow {
  return {
    sourceRecordId: "00000000-0000-4000-8000-000000066001",
    sourceRecordKey: definition.promotableRecordKey,
    projectionStatus: "quarantined",
    allowedProjection: definition.records[0].allowedProjection,
    updatedAt: "2026-06-30T00:00:00.000Z",
    sourceSlug: definition.source.slug,
    sourceName: definition.source.name,
    sourceVersion: definition.source.version,
    sourceUrl: definition.source.url,
    license: definition.source.license,
    licenseUrl: definition.source.licenseUrl,
    attributionRequired: definition.source.attributionRequired,
    attributionText: definition.source.attributionText,
    allowedUsage: [...definition.source.allowedUsage],
    parserVersion: GENEBANK_LONG_TAIL_PARSER_VERSION,
    fetchedAt: "2026-06-30T00:00:00.000Z",
    verifiedAt: "2026-06-30T00:00:00.000Z",
    catalogItemId: null,
    catalogCanonicalName: null,
    catalogPublicSlug: null,
    catalogStatus: null,
    catalogKind: null,
    typeaheadNameCount: 0,
    ...overrides,
  };
}

describe("catalog source candidate review repository", () => {
  it("lists source candidates from safe projection metadata only", () => {
    const compiled = buildCatalogSourceCandidatesForReviewQuery(
      testDb,
      10,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_source_records"');
    expect(compiled.sql).toContain('inner join "catalog_source_snapshots"');
    expect(compiled.sql).toContain('left join "catalog_source_links"');
    expect(compiled.sql).toContain('"allowed_projection"');
    expect(compiled.sql).toContain('"source_url"');
    expect(compiled.sql).toContain('"license_url"');
    expect(compiled.sql).not.toContain("raw_payload");
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("media_assets");
    expect(compiled.sql).not.toContain("owner_user_id");
  });

  it("summarizes and filters source candidates without raw payload fields", () => {
    const summary = buildCatalogSourceCandidateReviewSummaryQuery(
      testDb,
    ).compile();
    const filtered = buildCatalogSourceCandidatesForReviewQuery(
      testDb,
      10,
      "blocked",
    ).compile();

    expect(summary.sql).toContain("count(*)::int");
    expect(summary.sql).toContain("#>> '{reviewQueue,curatorDecision}'");
    expect(summary.sql).not.toContain("raw_payload");
    expect(summary.sql).not.toContain("source_only_fields");
    expect(filtered.sql).toContain("#>> '{reviewQueue,curatorDecision}'");
    expect(filtered.parameters).toContain("blocked");
    expect(filtered.sql).not.toContain("raw_payload");
    expect(filtered.sql).not.toContain("source_only_fields");
  });

  it("reads one source candidate for decisions without raw payload fields", () => {
    const compiled = buildCatalogSourceCandidateForDecisionQuery(
      testDb,
      "00000000-0000-4000-8000-000000066001",
    ).compile();

    expect(compiled.sql).toContain('"catalog_source_records"."id" = $1');
    expect(compiled.sql).toContain('"allowed_projection"');
    expect(compiled.sql).not.toContain("raw_payload");
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.parameters).toContain(
      "00000000-0000-4000-8000-000000066001",
    );
  });

  it("maps clean review groups and promotion eligibility without source-only leakage", () => {
    const promotable = toCatalogSourceCandidateReviewItem(candidateRow());
    const held = toCatalogSourceCandidateReviewItem(
      candidateRow({
        sourceRecordId: "00000000-0000-4000-8000-000000066002",
        sourceRecordKey: definition.heldRecordKey,
        allowedProjection: heldRecord.allowedProjection,
      }),
    );
    const projected = toCatalogSourceCandidateReviewItem(
      candidateRow({
        projectionStatus: "projected",
        catalogItemId: "00000000-0000-4000-8000-000000066003",
        catalogCanonicalName: "Red Cherry tomato",
        catalogPublicSlug: "red-cherry-tomato-grin-genebank-candidate",
        catalogStatus: "seeded",
        catalogKind: "plant_variety",
        typeaheadNameCount: 3,
      }),
    );
    const rejected = toCatalogSourceCandidateReviewItem(
      candidateRow({
        projectionStatus: "rejected",
        catalogItemId: null,
        catalogCanonicalName: null,
        catalogPublicSlug: null,
        catalogStatus: null,
        catalogKind: null,
      }),
    );

    expect(promotable.status).toBe("quarantined");
    expect(promotable.actions.canPromote).toBe(true);
    expect(held.status).toBe("held");
    expect(held.actions.canPromote).toBe(false);
    expect(held.actions.canReject).toBe(true);
    expect(projected.status).toBe("promoted");
    expect(projected.actions.canReject).toBe(false);
    expect(projected.projectedCatalog?.typeaheadNameCount).toBe(3);
    expect(rejected.status).toBe("rejected");
    expect(rejected.actions.canHold).toBe(false);

    const serialized = JSON.stringify([promotable, held, projected, rejected]);
    for (const marker of forbiddenReviewMarkers) {
      expect(serialized).not.toContain(marker);
    }
  });

  it("keeps hold and reject decisions inside the quarantine boundary", () => {
    const now = new Date("2026-06-30T00:00:00.000Z");
    const held = buildHoldCatalogSourceCandidateQuery(testDb, {
      sourceRecordId: "00000000-0000-4000-8000-000000066001",
      now,
    }).compile();
    const rejected = buildRejectCatalogSourceCandidateQuery(testDb, {
      sourceRecordId: "00000000-0000-4000-8000-000000066001",
      now,
    }).compile();

    expect(held.sql).toContain('update "catalog_source_records"');
    expect(held.sql).toContain('"projection_status" = $1');
    expect(held.parameters).toContain("quarantined");
    expect(rejected.sql).toContain('update "catalog_source_records"');
    expect(rejected.parameters).toContain("rejected");
    expect(rejected.parameters).toContain("quarantined");
    expect(rejected.sql).not.toContain("catalog_items");
    expect(rejected.sql).not.toContain("catalog_item_names");
    expect(rejected.sql).not.toContain("journal_entries");
  });
});
