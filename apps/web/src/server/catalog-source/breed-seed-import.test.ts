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
  breedSeedAllowedProjection,
  breedSeedDefinition,
  breedSeedPayloadChecksum,
  breedSeedSnapshotChecksum,
} from "@/lib/catalog/breed-seed";
import {
  buildBreedSeedAliasCurationProofQuery,
  buildBreedSeedTypeaheadProofQuery,
  buildEnqueueBreedSeedTypeaheadReindexJobQuery,
  buildInsertBreedSeedSourceLinkQuery,
  buildUpsertBreedSeedAliasProjectionQuery,
  buildUpsertBreedSeedCatalogItemQuery,
  buildUpsertBreedSeedCatalogNameQuery,
  buildUpsertBreedSeedRecordQuery,
  buildUpsertBreedSeedSnapshotQuery,
  buildBreedSeedSourceProvenanceProofQuery,
} from "./breed-seed-import";

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
const definition = breedSeedDefinition();
const sourceSnapshotId = "00000000-0000-4000-8000-000000060001";
const sourceRecordId = "00000000-0000-4000-8000-000000060002";
const catalogItemId = "00000000-0000-4000-8000-000000060003";
const catalogItemNameId = "00000000-0000-4000-8000-000000060004";

const forbiddenProjectionMarkers = [
  "dadIsEfabisInternalValidation",
  "latinNameDispute",
  "restrictedFields",
  "coordinates",
  "sourceOnlyFields",
  "rawPayload",
  "journalBody",
  "ownerUserId",
  "exifGps",
];

describe("UA official bee breed seed import", () => {
  it("keeps validation-only breed source fields out of the product projection", () => {
    const rawPayload = JSON.stringify(definition.record.rawPayload);
    const sourceOnlyFields = JSON.stringify(definition.record.sourceOnlyFields);
    const projection = JSON.stringify(breedSeedAllowedProjection());

    expect(rawPayload).toContain("officialManualBreedSet");
    expect(rawPayload).toContain("Карпатська бджола");
    expect(sourceOnlyFields).toContain("dadIsEfabisInternalValidation");
    expect(sourceOnlyFields).toContain("latinNameDispute");
    expect(projection).toContain("Карпатська бджола");
    expect(projection).toContain('"catalogKind":"breed"');

    for (const marker of forbiddenProjectionMarkers) {
      expect(projection).not.toContain(marker);
    }
  });

  it("has distinct row and snapshot checksums for idempotent import proofs", () => {
    expect(breedSeedSnapshotChecksum()).toMatch(/^[a-f0-9]{64}$/);
    expect(breedSeedPayloadChecksum()).toMatch(/^[a-f0-9]{64}$/);
    expect(breedSeedSnapshotChecksum()).not.toBe(breedSeedPayloadChecksum());
  });

  it("upserts the manual official source snapshot with usage and attribution", () => {
    const compiled = buildUpsertBreedSeedSnapshotQuery(testDb, {
      payloadSha256: breedSeedSnapshotChecksum(),
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_snapshots"');
    expect(compiled.sql).toContain(
      'on conflict ("source_slug", "source_version", "payload_sha256") do update',
    );
    expect(compiled.parameters).toContain("ua-official-bee-breeds");
    expect(compiled.parameters).toContain("official_breeds");
    expect(compiled.parameters).toContain("Official Ukrainian legal text");
    expect(compiled.parameters).toContain(
      "Law of Ukraine On Beekeeping No. 1492-III, official Verkhovna Rada portal.",
    );
    expect(JSON.stringify(compiled.parameters)).toContain("manual_seed");
    expect(JSON.stringify(compiled.parameters)).not.toContain(
      "latinNameDispute",
    );
  });

  it("stores raw manual seed details only in source records", () => {
    const compiled = buildUpsertBreedSeedRecordQuery(testDb, {
      sourceSnapshotId,
      rawPayloadSha256: breedSeedPayloadChecksum(),
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_records"');
    expect(compiled.sql).toContain('"raw_payload"');
    expect(compiled.sql).toContain('"source_only_fields"');
    expect(compiled.sql).toContain('"allowed_projection"');
    expect(JSON.stringify(compiled.parameters)).toContain(
      "officialManualBreedSet",
    );
    expect(JSON.stringify(compiled.parameters)).toContain(
      "dadIsEfabisInternalValidation",
    );
  });

  it("projects the breed item as catalog_kind breed, not a plant variety", () => {
    const projection = breedSeedAllowedProjection();
    const item = buildUpsertBreedSeedCatalogItemQuery(
      testDb,
      projection,
    ).compile();
    const alias = buildUpsertBreedSeedCatalogNameQuery(testDb, {
      catalogItemId,
      displayName: "Карпатська",
      normalizedName: "карпатська",
      locale: "uk",
      isPrimary: false,
    }).compile();

    expect(projection.catalogKind).toBe("breed");
    expect(projection.sourceIds.officialBeeRef).toBe(
      "ua-law-1492-iii:bee-breed:carpathian",
    );
    expect(item.sql).toContain('on conflict ("source", "source_id") do update');
    expect(item.parameters).toContain("Карпатська бджола");
    expect(item.parameters).toContain("breed");
    expect(item.parameters).toContain("ua_official_bee_breed");
    expect(JSON.stringify(item.parameters)).not.toContain("dadIsRef");
    expect(alias.parameters).toEqual([
      catalogItemId,
      "Карпатська",
      "карпатська",
      "uk",
      false,
      "Карпатська",
      false,
    ]);
  });

  it("records accepted aliases and holds disputed Latin mappings for curation", () => {
    const acceptedAlias = definition.aliasCandidates.find(
      (alias) => alias.displayName === "Carpathian honey bee",
    );
    const reviewAlias = definition.aliasCandidates.find(
      (alias) => alias.displayName === "Apis mellifera carpatica",
    );

    expect(acceptedAlias?.status).toBe("accepted");
    expect(reviewAlias?.status).toBe("review_needed");

    const accepted = buildUpsertBreedSeedAliasProjectionQuery(testDb, {
      catalogItemId,
      catalogItemNameId,
      sourceRecordId,
      alias: acceptedAlias!,
    }).compile();
    const review = buildUpsertBreedSeedAliasProjectionQuery(testDb, {
      catalogItemId,
      catalogItemNameId: null,
      sourceRecordId,
      alias: reviewAlias!,
    }).compile();

    expect(accepted.parameters).toContain("accepted");
    expect(accepted.parameters).toContain(catalogItemNameId);
    expect(review.parameters).toContain("review_needed");
    expect(review.parameters).toContain(null);
  });

  it("links the breed catalog item to the quarantined source row", () => {
    const compiled = buildInsertBreedSeedSourceLinkQuery(testDb, {
      catalogItemId,
      sourceRecordId,
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_links"');
    expect(compiled.sql).toContain(
      'on conflict ("catalog_item_id", "source_record_id") do nothing',
    );
    expect(compiled.parameters).toEqual([
      catalogItemId,
      sourceRecordId,
      "ua-official-bee-breeds",
      "ua-law-1492-iii:bee-breed:carpathian",
      "canonical_item",
    ]);
  });

  it("proves breed typeahead without touching raw sources or plant-only source IDs", () => {
    const compiled = buildBreedSeedTypeaheadProofQuery(
      testDb,
      "Карпатська",
    ).compile();

    expect(compiled.sql).toContain('from "catalog_item_names"');
    expect(compiled.sql).toContain('inner join "catalog_items"');
    expect(compiled.sql).toContain('"catalog_items"."catalog_kind" = $3');
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "breed",
      "ua_official_bee_breed",
      "vertebrate_breed_ontology",
      "%карпатська%",
      8,
    ]);
  });

  it("reads operator provenance without selecting raw payload fields", () => {
    const compiled = buildBreedSeedSourceProvenanceProofQuery(
      testDb,
      catalogItemId,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_source_links"');
    expect(compiled.sql).toContain('inner join "catalog_source_records"');
    expect(compiled.sql).toContain('inner join "catalog_source_snapshots"');
    expect(compiled.sql).toContain("catalog_kind");
    expect(compiled.sql).toContain("source_record_key");
    expect(compiled.sql).toContain("license");
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.parameters).toEqual([
      catalogItemId,
      "breed",
      "ua_official_bee_breed",
      "vertebrate_breed_ontology",
      "ua-official-bee-breeds",
      "vertebrate-breed-ontology",
      "canonical_item",
      1,
    ]);
  });

  it("reads alias curation rows separately from typeahead projection", () => {
    const compiled = buildBreedSeedAliasCurationProofQuery(
      testDb,
      catalogItemId,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_alias_projections"');
    expect(compiled.sql).toContain('inner join "catalog_items"');
    expect(compiled.sql).toContain('"catalog_items"."catalog_kind" = $2');
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.parameters).toEqual([catalogItemId, "breed"]);
  });

  it("queues a derived typeahead reindex after import", () => {
    const compiled =
      buildEnqueueBreedSeedTypeaheadReindexJobQuery(testDb).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.parameters).toEqual([
      "matching",
      { kind: "catalog_typeahead_reindex" },
      "catalog-typeahead-reindex",
      expect.any(Date),
    ]);
  });
});
