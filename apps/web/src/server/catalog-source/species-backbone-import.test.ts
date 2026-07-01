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
  SPECIES_BACKBONE_SOURCE_IDS,
  speciesBackboneAllowedProjection,
  speciesBackbonePayloadChecksum,
  speciesBackboneSeedDefinition,
  speciesBackboneSnapshotChecksum,
} from "@/lib/catalog/species-backbone-seed";
import {
  buildEnqueueSpeciesBackboneTypeaheadReindexJobQuery,
  buildInsertSpeciesBackboneSourceLinkQuery,
  buildSpeciesBackboneAliasCurationProofQuery,
  buildSpeciesBackboneSourceProvenanceProofQuery,
  buildSpeciesBackboneTypeaheadProofQuery,
  buildUpsertSpeciesBackboneAliasProjectionQuery,
  buildUpsertSpeciesBackboneCatalogItemQuery,
  buildUpsertSpeciesBackboneCatalogNameQuery,
  buildUpsertSpeciesBackboneRecordQuery,
  buildUpsertSpeciesBackboneSnapshotQuery,
} from "./species-backbone-import";

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
const definition = speciesBackboneSeedDefinition();
const sourceSnapshotId = "00000000-0000-4000-8000-000000058001";
const sourceRecordId = "00000000-0000-4000-8000-000000058002";
const catalogItemId = "00000000-0000-4000-8000-000000058003";

const forbiddenProjectionMarkers = [
  "poisonCoordinateSentinel",
  "decimalLatitude",
  "decimalLongitude",
  "nonProjectedDistributionText",
  "nonProjectedCandidates",
  "love apple",
  "sourceOnlyFields",
  "rawPayload",
  "journalBody",
  "ownerUserId",
  "exifGps",
];

function sourceRecord(slug: string) {
  const record = definition.sourceRecords.find(
    (row) => row.source.slug === slug,
  );
  if (!record) throw new Error(`Missing test source ${slug}`);
  return record;
}

describe("species backbone seed import", () => {
  it("keeps raw source-only taxonomy fields out of the product projection", () => {
    const rawPayload = JSON.stringify(
      definition.sourceRecords.map((row) => row.record.rawPayload),
    );
    const sourceOnlyFields = JSON.stringify(
      definition.sourceRecords.map((row) => row.record.sourceOnlyFields),
    );
    const projection = JSON.stringify(
      speciesBackboneAllowedProjection(definition),
    );

    expect(rawPayload).toContain("Solanum lycopersicum");
    expect(sourceOnlyFields).toContain("poisonCoordinateSentinel");
    expect(sourceOnlyFields).toContain("nonProjectedDistributionText");
    expect(projection).toContain("Solanum lycopersicum L.");
    expect(projection).toContain("Tomato");
    expect(projection).toContain("помідор");
    expect(projection).not.toContain("garden tomato");
    expect(projection).not.toContain("помидор");

    for (const marker of forbiddenProjectionMarkers) {
      expect(projection).not.toContain(marker);
    }
  });

  it("records deterministic source IDs, aliases, and conflict precedence", () => {
    const projection = speciesBackboneAllowedProjection(definition);

    expect(projection.sourceIds).toEqual(SPECIES_BACKBONE_SOURCE_IDS);
    expect(projection.precedence).toEqual([
      "catalogue-of-life-checklistbank",
      "world-flora-online",
      "gbif-backbone",
      "eppo-codes",
      "wikidata",
    ]);
    expect(projection.aliases.map((row) => row.displayName)).toEqual([
      "Solanum lycopersicum L.",
      "Solanum lycopersicum",
      "Lycopersicon esculentum",
      "Tomato",
      "помідор",
      "томати",
      "домат",
    ]);
    expect(definition.aliasCandidates.map((row) => row.status)).toEqual([
      "accepted",
      "accepted",
      "accepted",
      "accepted",
      "accepted",
      "accepted",
      "accepted",
      "review_needed",
      "rejected",
      "generated",
    ]);
    expect(
      definition.aliasCandidates.find((row) => row.displayName === "помідор"),
    ).toMatchObject({
      sourceSlug: "wikidata",
      sourceMethod: "source_backed",
      license: "CC0 1.0 Universal",
      confidence: 0.98,
    });
    expect(
      definition.aliasCandidates.find((row) => row.displayName === "помидор"),
    ).toMatchObject({
      status: "generated",
      sourceSlug: "overgarden-generated",
      sourceRecordKey: null,
      sourceMethod: "generated",
    });
    expect(projection.conflictBehavior).toContain("Conflicting accepted names");
  });

  it("upserts each source snapshot by source version and snapshot checksum", () => {
    const col = sourceRecord("catalogue-of-life-checklistbank");
    const snapshotSha256 = speciesBackboneSnapshotChecksum(col);
    const rawPayloadSha256 = speciesBackbonePayloadChecksum(col);
    const compiled = buildUpsertSpeciesBackboneSnapshotQuery(testDb, col, {
      payloadSha256: snapshotSha256,
    }).compile();

    expect(snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(rawPayloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshotSha256).not.toBe(rawPayloadSha256);
    expect(compiled.sql).toContain('insert into "catalog_source_snapshots"');
    expect(compiled.sql).toContain(
      'on conflict ("source_slug", "source_version", "payload_sha256") do update',
    );
    expect(compiled.parameters).toContain("catalogue-of-life-checklistbank");
    expect(compiled.parameters).toContain(
      "https://creativecommons.org/licenses/by/4.0/",
    );
    expect(compiled.parameters).toContain(
      "Catalogue of Life / ChecklistBank, Creative Commons Attribution 4.0 International.",
    );
    expect(compiled.parameters).toContain(snapshotSha256);
    expect(JSON.stringify(compiled.parameters)).not.toContain("raw_payload");
    expect(JSON.stringify(compiled.parameters)).not.toContain(
      "poisonCoordinateSentinel",
    );
  });

  it("stores raw GBIF backbone payload and source-only occurrence boundary only in source records", () => {
    const gbif = sourceRecord("gbif-backbone");
    const compiled = buildUpsertSpeciesBackboneRecordQuery(testDb, gbif, {
      sourceSnapshotId,
      rawPayloadSha256: speciesBackbonePayloadChecksum(gbif),
      definition,
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_records"');
    expect(compiled.sql).toContain('"raw_payload"');
    expect(compiled.sql).toContain('"source_only_fields"');
    expect(compiled.sql).toContain('"allowed_projection"');
    expect(JSON.stringify(compiled.parameters)).toContain("usageKey");
    expect(JSON.stringify(compiled.parameters)).toContain("2930137");
    expect(JSON.stringify(compiled.parameters)).toContain("decimalLatitude");
    expect(JSON.stringify(compiled.parameters)).toContain(
      "Solanum lycopersicum L.",
    );
  });

  it("projects the accepted scientific name, source-backed synonym, and safe aliases", () => {
    const projection = speciesBackboneAllowedProjection(definition);
    const item = buildUpsertSpeciesBackboneCatalogItemQuery(
      testDb,
      projection,
    ).compile();
    const alias = buildUpsertSpeciesBackboneCatalogNameQuery(testDb, {
      catalogItemId,
      displayName: "Tomato",
      normalizedName: "tomato",
      locale: "en",
      isPrimary: false,
    }).compile();

    expect(item.sql).toContain('on conflict ("source", "source_id") do update');
    expect(item.sql).toContain('"catalog_kind"');
    expect(item.parameters).toContain("Solanum lycopersicum L.");
    expect(item.parameters).toContain("species_backbone");
    expect(item.parameters).toContain("species");
    expect(item.parameters).toContain("species-backbone:col-3LR:4Y369");
    expect(JSON.stringify(item.parameters)).not.toContain("decimalLatitude");
    expect(alias.parameters).toEqual([
      catalogItemId,
      "Tomato",
      "tomato",
      "en",
      false,
      "Tomato",
      false,
    ]);
  });

  it("records alias status, source, license, and confidence separately from typeahead names", () => {
    const alias = definition.aliasCandidates.find(
      (row) => row.displayName === "помідор",
    );
    if (!alias) throw new Error("Missing Ukrainian alias fixture");

    const compiled = buildUpsertSpeciesBackboneAliasProjectionQuery(testDb, {
      catalogItemId,
      catalogItemNameId: "00000000-0000-4000-8000-000000058004",
      sourceRecordId,
      alias,
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_alias_projections"');
    expect(compiled.sql).toContain(
      'on conflict ("catalog_item_id", "normalized_name", "locale", "source_slug", "source_method") do update',
    );
    expect(compiled.parameters).toContain("помідор");
    expect(compiled.parameters).toContain("accepted");
    expect(compiled.parameters).toContain("wikidata");
    expect(compiled.parameters).toContain("source_backed");
    expect(compiled.parameters).toContain("Wikidata:Q23501");
    expect(compiled.parameters).toContain(0.98);
    expect(compiled.parameters).toContain("CC0 1.0 Universal");
    expect(JSON.stringify(compiled.parameters)).not.toContain(
      "poisonCoordinateSentinel",
    );
    expect(JSON.stringify(compiled.parameters)).not.toContain("raw_payload");
  });

  it("links the catalog item to every approved source record", () => {
    const eppo = sourceRecord("eppo-codes");
    const compiled = buildInsertSpeciesBackboneSourceLinkQuery(testDb, {
      catalogItemId,
      sourceRecordId,
      sourceRecord: eppo,
    }).compile();

    expect(compiled.sql).toContain('insert into "catalog_source_links"');
    expect(compiled.sql).toContain(
      'on conflict ("catalog_item_id", "source_record_id") do nothing',
    );
    expect(compiled.parameters).toEqual([
      catalogItemId,
      sourceRecordId,
      "eppo-codes",
      "EPPO:LYPES",
      "canonical_item",
    ]);
  });

  it("proves typeahead by accepted scientific name without touching raw sources", () => {
    const compiled = buildSpeciesBackboneTypeaheadProofQuery(
      testDb,
      "Solanum lycopersicum",
    ).compile();

    expect(compiled.sql).toContain('from "catalog_item_names"');
    expect(compiled.sql).toContain('inner join "catalog_items"');
    expect(compiled.sql).not.toContain("catalog_alias_projections");
    expect(compiled.sql).toContain(
      '"catalog_items"."created_by_user_id" is null',
    );
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "species_backbone",
      "%solanum lycopersicum%",
      8,
    ]);
  });

  it("proves typeahead by safe Ukrainian alias without touching raw sources", () => {
    const compiled = buildSpeciesBackboneTypeaheadProofQuery(
      testDb,
      "помідор",
    ).compile();

    expect(compiled.parameters).toEqual([
      "seeded",
      "confirmed",
      "species_backbone",
      "%помідор%",
      8,
    ]);
  });

  it("reads alias curation proof without raw payload fields", () => {
    const compiled = buildSpeciesBackboneAliasCurationProofQuery(
      testDb,
      catalogItemId,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_alias_projections"');
    expect(compiled.sql).toContain('inner join "catalog_items"');
    expect(compiled.sql).toContain('"catalog_alias_projections"."status"');
    expect(compiled.sql).toContain('"catalog_alias_projections"."source_slug"');
    expect(compiled.sql).toContain(
      '"catalog_alias_projections"."source_method"',
    );
    expect(compiled.sql).toContain('"catalog_alias_projections"."confidence"');
    expect(compiled.sql).toContain('"catalog_alias_projections"."license"');
    expect(compiled.sql).toContain("projectedToTypeahead");
    expect(compiled.sql).not.toContain("catalog_source_records");
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.parameters).toEqual([catalogItemId, "species_backbone"]);
  });

  it("reads source provenance rows without selecting raw payload fields", () => {
    const compiled = buildSpeciesBackboneSourceProvenanceProofQuery(
      testDb,
      catalogItemId,
    ).compile();

    expect(compiled.sql).toContain('from "catalog_source_links"');
    expect(compiled.sql).toContain('inner join "catalog_source_records"');
    expect(compiled.sql).toContain('inner join "catalog_source_snapshots"');
    expect(compiled.sql).toContain("source_record_key");
    expect(compiled.sql).toContain("license");
    expect(compiled.sql).toContain("license_url");
    expect(compiled.sql).toContain("attribution_text");
    expect(compiled.sql).not.toContain('"raw_payload"');
    expect(compiled.sql).not.toContain("source_only_fields");
    expect(compiled.parameters).toEqual([
      catalogItemId,
      "species_backbone",
      "canonical_item",
    ]);
  });

  it("queues a derived typeahead reindex after import", () => {
    const compiled =
      buildEnqueueSpeciesBackboneTypeaheadReindexJobQuery(testDb).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.parameters).toEqual([
      "matching",
      { kind: "catalog_typeahead_reindex" },
      "catalog-typeahead-reindex",
      expect.any(Date),
    ]);
  });
});
