import { sql, type Kysely, type Transaction } from "kysely";

import type { Database, JsonValue } from "@/db/schema";
import {
  SPECIES_BACKBONE_PARSER_VERSION,
  speciesBackboneAllowedProjection,
  speciesBackboneAllowedProjectionJson,
  speciesBackboneAllowedUsage,
  speciesBackboneConcepts,
  speciesBackbonePayloadChecksum,
  speciesBackboneRawPayload,
  speciesBackboneSeedDefinition,
  speciesBackboneSnapshotChecksum,
  speciesBackboneSourceOnlyFields,
  type SpeciesBackboneAliasCandidate,
  type SpeciesBackboneConceptDefinition,
  type SpeciesBackboneImportDefinition,
  type SpeciesBackboneProjection,
  type SpeciesBackboneSourceRecordDefinition,
} from "@/lib/catalog/species-backbone-seed";
import { assertCatalogSourcesProductProjectionAllowed } from "./source-projection-guard";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const SELECTABLE_CATALOG_STATUSES = ["seeded", "confirmed"] as const;
const MATCHING_QUEUE = "matching";
const CATALOG_TYPEAHEAD_REINDEX_KIND = "catalog_typeahead_reindex";
const CATALOG_TYPEAHEAD_REINDEX_IDEMPOTENCY_KEY = "catalog-typeahead-reindex";
const PROOF_OWNER_USER_ID = "00000000-0000-4000-8000-000000058000";
const SPECIES_BACKBONE_APPROVED_SOURCE_SLUGS = [
  "catalogue-of-life-checklistbank",
  "world-flora-online",
  "gbif-backbone",
  "eppo-codes",
  "wikidata",
] as const;

export interface SpeciesBackboneConceptImportSummary {
  key: string;
  sourceSnapshotIds: Record<string, string>;
  sourceRecordIds: Record<string, string>;
  catalogItemId: string;
  catalogKind: SpeciesBackboneProjection["catalogKind"];
  sourceSlugs: string[];
  sourceRecordKeys: string[];
  rawPayloadSha256BySource: Record<string, string>;
  snapshotSha256BySource: Record<string, string>;
  parserVersion: string;
  canonicalName: string;
  acceptedScientificName: string;
  publicSlug: string;
  sourceIds: SpeciesBackboneProjection["sourceIds"];
  aliasesProjected: number;
  aliasesRecorded: number;
  aliasStatusCounts: Record<SpeciesBackboneAliasCandidate["status"], number>;
  reindexQueued: boolean;
}

export interface SpeciesBackboneImportSummary
  extends SpeciesBackboneConceptImportSummary {
  concepts: SpeciesBackboneConceptImportSummary[];
  importedConcepts: number;
  sourceRowsImported: number;
}

export interface SpeciesBackboneTypeaheadProof {
  catalogItemId: string;
  displayName: string;
  canonicalName: string;
  locale: string;
  status: string;
  source: string;
}

export interface SpeciesBackboneGardenReadbackProof {
  catalogItemId: string;
  varietyText: string | null;
  varietyState: string;
  catalogCanonicalName: string | null;
  catalogSource: string | null;
}

export interface SpeciesBackboneSourceProvenanceProof {
  catalogItemId: string;
  canonicalName: string;
  status: string;
  source: string;
  sourceSlug: string;
  sourceName: string;
  sourceVersion: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string | null;
  attributionRequired: boolean;
  attributionText: string | null;
  allowedUsage: JsonValue;
  sourceRecordKey: string;
  sourceRecordId: string;
  sourceFileSha256: string;
  rawPayloadSha256: string;
  parserVersion: string;
  fetchedAt: Date | string;
  verifiedAt: Date | string;
  projectionStatus: string;
}

export interface SpeciesBackboneAliasCurationProof {
  catalogItemId: string;
  catalogItemNameId: string | null;
  canonicalName: string;
  displayName: string;
  locale: string;
  script: string;
  aliasKind: string;
  status: string;
  sourceSlug: string;
  sourceMethod: string;
  sourceRecordKey: string | null;
  confidence: number;
  license: string;
  attributionRequired: boolean;
  projectedToTypeahead: boolean;
  projectionNotes: string | null;
}

export async function importSpeciesBackboneSeed(
  executor: Kysely<Database>,
  definition = speciesBackboneSeedDefinition(),
): Promise<SpeciesBackboneImportSummary> {
  return executor.transaction().execute(async (trx) => {
    const conceptSummaries = [];
    for (const concept of speciesBackboneConcepts(definition)) {
      conceptSummaries.push(await importSpeciesBackboneConcept(trx, concept));
    }

    const reindexJob =
      await buildEnqueueSpeciesBackboneTypeaheadReindexJobQuery(
        trx,
      ).executeTakeFirstOrThrow();
    const reindexQueued = reindexJob.id.length > 0;
    const concepts = conceptSummaries.map((summary) => ({
      ...summary,
      reindexQueued,
    }));
    const primaryConcept = concepts[0];
    if (!primaryConcept) {
      throw new Error("Species backbone import definition has no concepts.");
    }

    return {
      ...primaryConcept,
      concepts,
      importedConcepts: concepts.length,
      sourceRowsImported: concepts.reduce(
        (total, concept) => total + concept.sourceRecordKeys.length,
        0,
      ),
      reindexQueued,
    };
  });
}

async function importSpeciesBackboneConcept(
  trx: Transaction<Database>,
  concept: SpeciesBackboneConceptDefinition,
): Promise<SpeciesBackboneConceptImportSummary> {
  const projection = speciesBackboneAllowedProjection(concept);
  const sourceSnapshotIds: Record<string, string> = {};
  const sourceRecordIds: Record<string, string> = {};
  const sourceRecordIdsByKey = new Map<string, string>();
  const rawPayloadSha256BySource: Record<string, string> = {};
  const snapshotSha256BySource: Record<string, string> = {};
  const linkedSourceRecords: Array<{
    sourceRecord: SpeciesBackboneSourceRecordDefinition;
    sourceRecordId: string;
  }> = [];

  for (const sourceRecord of concept.sourceRecords) {
    const rawPayloadSha256 = speciesBackbonePayloadChecksum(sourceRecord);
    const snapshotSha256 = speciesBackboneSnapshotChecksum(sourceRecord);

    const snapshot = await buildUpsertSpeciesBackboneSnapshotQuery(
      trx,
      sourceRecord,
      {
        payloadSha256: snapshotSha256,
      },
    ).executeTakeFirstOrThrow();

    const record = await buildUpsertSpeciesBackboneRecordQuery(
      trx,
      sourceRecord,
      {
        sourceSnapshotId: snapshot.id,
        rawPayloadSha256,
        projection,
      },
    ).executeTakeFirstOrThrow();

    sourceSnapshotIds[sourceRecord.source.slug] = snapshot.id;
    sourceRecordIds[sourceRecord.source.slug] = record.id;
    sourceRecordIdsByKey.set(sourceRecord.record.id, record.id);
    rawPayloadSha256BySource[sourceRecord.source.slug] = rawPayloadSha256;
    snapshotSha256BySource[sourceRecord.source.slug] = snapshotSha256;
    linkedSourceRecords.push({
      sourceRecord,
      sourceRecordId: record.id,
    });
  }

  const catalogItem = await buildUpsertSpeciesBackboneCatalogItemQuery(
    trx,
    projection,
  ).executeTakeFirstOrThrow();

  const catalogItemNameIdsByAliasKey = new Map<string, string>();
  for (const alias of projection.aliases) {
    const catalogItemName = await buildUpsertSpeciesBackboneCatalogNameQuery(
      trx,
      {
        catalogItemId: catalogItem.id,
        ...alias,
      },
    ).executeTakeFirstOrThrow();

    catalogItemNameIdsByAliasKey.set(
      buildAliasKey(alias.locale, alias.normalizedName),
      catalogItemName.id,
    );
  }

  const aliasStatusCounts = emptyAliasStatusCounts();
  for (const alias of concept.aliasCandidates) {
    const sourceRecordId = resolveAliasSourceRecordId(
      alias,
      sourceRecordIdsByKey,
    );
    const catalogItemNameId =
      alias.status === "accepted"
        ? catalogItemNameIdsByAliasKey.get(
            buildAliasKey(alias.locale, alias.normalizedName),
          )
        : null;

    if (alias.status === "accepted" && !catalogItemNameId) {
      throw new Error(
        `Accepted alias ${alias.locale}:${alias.normalizedName} is missing from catalog_item_names.`,
      );
    }

    await buildUpsertSpeciesBackboneAliasProjectionQuery(trx, {
      catalogItemId: catalogItem.id,
      catalogItemNameId: catalogItemNameId ?? null,
      sourceRecordId,
      alias,
    }).execute();
    aliasStatusCounts[alias.status] += 1;
  }

  for (const linked of linkedSourceRecords) {
    await buildInsertSpeciesBackboneSourceLinkQuery(trx, {
      catalogItemId: catalogItem.id,
      sourceRecordId: linked.sourceRecordId,
      sourceRecord: linked.sourceRecord,
    }).execute();
  }

  return {
    key: concept.key,
    sourceSnapshotIds,
    sourceRecordIds,
    catalogItemId: catalogItem.id,
    catalogKind: projection.catalogKind,
    sourceSlugs: concept.sourceRecords.map((row) => row.source.slug),
    sourceRecordKeys: concept.sourceRecords.map((row) => row.record.id),
    rawPayloadSha256BySource,
    snapshotSha256BySource,
    parserVersion: SPECIES_BACKBONE_PARSER_VERSION,
    canonicalName: catalogItem.canonicalName,
    acceptedScientificName: projection.acceptedScientificName,
    publicSlug: catalogItem.publicSlug ?? projection.publicSlug,
    sourceIds: projection.sourceIds,
    aliasesProjected: projection.aliases.length,
    aliasesRecorded: concept.aliasCandidates.length,
    aliasStatusCounts,
    reindexQueued: false,
  };
}

export async function readSpeciesBackboneTypeaheadProof(
  executor: QueryExecutor,
  query: string,
): Promise<SpeciesBackboneTypeaheadProof[]> {
  const rows = await buildSpeciesBackboneTypeaheadProofQuery(
    executor,
    query,
  ).execute();

  return rows.map((row) => ({
    catalogItemId: row.catalogItemId,
    displayName: row.displayName,
    canonicalName: row.canonicalName,
    locale: row.locale,
    status: row.status,
    source: row.source,
  }));
}

export async function readSpeciesBackboneSourceProvenanceProof(
  executor: QueryExecutor,
  catalogItemId: string,
): Promise<SpeciesBackboneSourceProvenanceProof[]> {
  const rows = await buildSpeciesBackboneSourceProvenanceProofQuery(
    executor,
    catalogItemId,
  ).execute();

  return rows.map((row) => ({
    catalogItemId: row.catalogItemId,
    canonicalName: row.canonicalName,
    status: row.status,
    source: row.source,
    sourceSlug: row.sourceSlug,
    sourceName: row.sourceName,
    sourceVersion: row.sourceVersion,
    sourceUrl: row.sourceUrl,
    license: row.license,
    licenseUrl: row.licenseUrl,
    attributionRequired: Boolean(row.attributionRequired),
    attributionText: row.attributionText,
    allowedUsage: row.allowedUsage,
    sourceRecordKey: row.sourceRecordKey,
    sourceRecordId: row.sourceRecordId,
    sourceFileSha256: row.sourceFileSha256,
    rawPayloadSha256: row.rawPayloadSha256,
    parserVersion: row.parserVersion,
    fetchedAt: row.fetchedAt,
    verifiedAt: row.verifiedAt,
    projectionStatus: row.projectionStatus,
  }));
}

export async function readSpeciesBackboneAliasCurationProof(
  executor: QueryExecutor,
  catalogItemId: string,
): Promise<SpeciesBackboneAliasCurationProof[]> {
  const rows = await buildSpeciesBackboneAliasCurationProofQuery(
    executor,
    catalogItemId,
  ).execute();

  return rows.map((row) => ({
    catalogItemId: row.catalogItemId,
    catalogItemNameId: row.catalogItemNameId,
    canonicalName: row.canonicalName,
    displayName: row.displayName,
    locale: row.locale,
    script: row.script,
    aliasKind: row.aliasKind,
    status: row.status,
    sourceSlug: row.sourceSlug,
    sourceMethod: row.sourceMethod,
    sourceRecordKey: row.sourceRecordKey,
    confidence: Number(row.confidence),
    license: row.license,
    attributionRequired: Boolean(row.attributionRequired),
    projectedToTypeahead: Boolean(row.projectedToTypeahead),
    projectionNotes: row.projectionNotes,
  }));
}

export async function proveSpeciesBackboneGardenReadback(
  executor: Kysely<Database>,
  catalogItemId: string,
  projection = speciesBackboneAllowedProjection(),
): Promise<SpeciesBackboneGardenReadbackProof> {
  try {
    await executor.transaction().execute(async (trx) => {
      const space = await trx
        .insertInto("spaces")
        .values({
          owner_user_id: PROOF_OWNER_USER_ID,
          display_name: "OVE-82 species backbone proof",
          location_visibility: "hidden",
          coarse_region_code: null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const plantObject = await trx
        .insertInto("plant_objects")
        .values({
          owner_user_id: PROOF_OWNER_USER_ID,
          space_id: space.id,
          display_name: `Proof ${projection.acceptedScientificName}`,
          catalog_item_id: catalogItemId,
          variety_text: projection.canonicalName,
          variety_state: "selected",
          location_visibility: "hidden",
          coarse_region_code: null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("journal_entries")
        .values({
          owner_user_id: PROOF_OWNER_USER_ID,
          space_id: space.id,
          plant_object_id: plantObject.id,
          title: "OVE-82 species backbone proof",
          body: "Species selection reads back the canonical catalog identity without raw source fields.",
          entry_scope: "object",
          entry_date: "2026-06-30",
          visibility: "private",
          client_mutation_id: "ove-59-alias-promotion-proof",
        })
        .executeTakeFirstOrThrow();

      const readback = await trx
        .selectFrom("plant_objects")
        .leftJoin(
          "catalog_items",
          "catalog_items.id",
          "plant_objects.catalog_item_id",
        )
        .select([
          "plant_objects.catalog_item_id as catalogItemId",
          "plant_objects.variety_text as varietyText",
          "plant_objects.variety_state as varietyState",
          "catalog_items.canonical_name as catalogCanonicalName",
          "catalog_items.source as catalogSource",
        ])
        .where("plant_objects.id", "=", plantObject.id)
        .where("plant_objects.owner_user_id", "=", PROOF_OWNER_USER_ID)
        .executeTakeFirstOrThrow();

      throw new RollbackReadbackProof({
        catalogItemId: readback.catalogItemId ?? "",
        varietyText: readback.varietyText,
        varietyState: readback.varietyState,
        catalogCanonicalName: readback.catalogCanonicalName,
        catalogSource: readback.catalogSource,
      });
    });
  } catch (error) {
    if (error instanceof RollbackReadbackProof) {
      return error.proof;
    }

    throw error;
  }

  throw new Error("Species backbone readback proof did not run.");
}

export function buildUpsertSpeciesBackboneSnapshotQuery(
  executor: QueryExecutor,
  sourceRecord: SpeciesBackboneSourceRecordDefinition,
  input: { payloadSha256: string },
) {
  const now = new Date();

  return executor
    .insertInto("catalog_source_snapshots")
    .values({
      source_slug: sourceRecord.source.slug,
      source_name: sourceRecord.source.name,
      source_category: sourceRecord.source.category,
      source_version: sourceRecord.source.version,
      source_url: sourceRecord.source.url,
      license: sourceRecord.source.license,
      license_url: sourceRecord.source.licenseUrl,
      attribution_required: sourceRecord.source.attributionRequired,
      attribution_text: sourceRecord.source.attributionText,
      allowed_usage: jsonbParam(speciesBackboneAllowedUsage(sourceRecord)),
      parser_version: SPECIES_BACKBONE_PARSER_VERSION,
      payload_sha256: input.payloadSha256,
      fetched_at: sourceRecord.source.fetchedAt,
      verified_at: sourceRecord.source.verifiedAt,
      status: "imported",
    })
    .onConflict((oc) =>
      oc
        .columns(["source_slug", "source_version", "payload_sha256"])
        .doUpdateSet({
          source_name: sourceRecord.source.name,
          source_category: sourceRecord.source.category,
          source_url: sourceRecord.source.url,
          license: sourceRecord.source.license,
          license_url: sourceRecord.source.licenseUrl,
          attribution_required: sourceRecord.source.attributionRequired,
          attribution_text: sourceRecord.source.attributionText,
          allowed_usage: jsonbParam(speciesBackboneAllowedUsage(sourceRecord)),
          parser_version: SPECIES_BACKBONE_PARSER_VERSION,
          fetched_at: sourceRecord.source.fetchedAt,
          verified_at: sourceRecord.source.verifiedAt,
          status: "imported",
          updated_at: now,
        }),
    )
    .returning("id");
}

export function buildUpsertSpeciesBackboneRecordQuery(
  executor: QueryExecutor,
  sourceRecord: SpeciesBackboneSourceRecordDefinition,
  input: {
    sourceSnapshotId: string;
    rawPayloadSha256: string;
    definition?: SpeciesBackboneImportDefinition;
    projection?: SpeciesBackboneProjection;
  },
) {
  const now = new Date();
  const projection =
    input.projection ??
    speciesBackboneAllowedProjection(
      input.definition ?? speciesBackboneSeedDefinition(),
    );

  return executor
    .insertInto("catalog_source_records")
    .values({
      source_snapshot_id: input.sourceSnapshotId,
      source_record_id: sourceRecord.record.id,
      raw_payload: jsonbParam(speciesBackboneRawPayload(sourceRecord)),
      raw_payload_sha256: input.rawPayloadSha256,
      source_only_fields: jsonbParam(
        speciesBackboneSourceOnlyFields(sourceRecord),
      ),
      allowed_projection: jsonbParam(
        speciesBackboneAllowedProjectionJson(projection),
      ),
      projection_status: "projected",
    })
    .onConflict((oc) =>
      oc.columns(["source_snapshot_id", "source_record_id"]).doUpdateSet({
        raw_payload: jsonbParam(speciesBackboneRawPayload(sourceRecord)),
        raw_payload_sha256: input.rawPayloadSha256,
        source_only_fields: jsonbParam(
          speciesBackboneSourceOnlyFields(sourceRecord),
        ),
        allowed_projection: jsonbParam(
          speciesBackboneAllowedProjectionJson(projection),
        ),
        projection_status: "projected",
        updated_at: now,
      }),
    )
    .returning("id");
}

export function buildUpsertSpeciesBackboneCatalogItemQuery(
  executor: QueryExecutor,
  projection = speciesBackboneAllowedProjection(),
) {
  assertCatalogSourcesProductProjectionAllowed({
    sourceSlugs: SPECIES_BACKBONE_APPROVED_SOURCE_SLUGS,
    productSurface: "catalog_items",
    productSource: projection.source,
    productSourceId: projection.sourceId,
  });

  const now = new Date();

  return executor
    .insertInto("catalog_items")
    .values({
      canonical_name: projection.canonicalName,
      normalized_name: projection.normalizedName,
      public_slug: projection.publicSlug,
      status: projection.status,
      source: projection.source,
      source_id: projection.sourceId,
      catalog_kind: projection.catalogKind,
      created_by_user_id: null,
      locale: projection.locale,
    })
    .onConflict((oc) =>
      oc.columns(["source", "source_id"]).doUpdateSet({
        canonical_name: projection.canonicalName,
        normalized_name: projection.normalizedName,
        public_slug: projection.publicSlug,
        status: projection.status,
        catalog_kind: projection.catalogKind,
        created_by_user_id: null,
        locale: projection.locale,
        updated_at: now,
      }),
    )
    .returning([
      "id",
      "canonical_name as canonicalName",
      "public_slug as publicSlug",
    ]);
}

export function buildUpsertSpeciesBackboneCatalogNameQuery(
  executor: QueryExecutor,
  input: {
    catalogItemId: string;
    displayName: string;
    normalizedName: string;
    locale: string;
    isPrimary: boolean;
  },
) {
  assertCatalogSourcesProductProjectionAllowed({
    sourceSlugs: SPECIES_BACKBONE_APPROVED_SOURCE_SLUGS,
    productSurface: "catalog_item_names",
    productSource: "species_backbone",
  });

  return executor
    .insertInto("catalog_item_names")
    .values({
      catalog_item_id: input.catalogItemId,
      display_name: input.displayName,
      normalized_name: input.normalizedName,
      locale: input.locale,
      is_primary: input.isPrimary,
    })
    .onConflict((oc) =>
      oc.columns(["catalog_item_id", "normalized_name", "locale"]).doUpdateSet({
        display_name: input.displayName,
        is_primary: input.isPrimary,
      }),
    )
    .returning("id");
}

export function buildUpsertSpeciesBackboneAliasProjectionQuery(
  executor: QueryExecutor,
  input: {
    catalogItemId: string;
    catalogItemNameId: string | null;
    sourceRecordId: string | null;
    alias: SpeciesBackboneAliasCandidate;
  },
) {
  const now = new Date();

  return executor
    .insertInto("catalog_alias_projections")
    .values({
      catalog_item_id: input.catalogItemId,
      catalog_item_name_id: input.catalogItemNameId,
      display_name: input.alias.displayName,
      normalized_name: input.alias.normalizedName,
      locale: input.alias.locale,
      script: input.alias.script,
      alias_kind: input.alias.aliasKind,
      status: input.alias.status,
      source_slug: input.alias.sourceSlug,
      source_method: input.alias.sourceMethod,
      source_record_id: input.sourceRecordId,
      source_record_key: input.alias.sourceRecordKey,
      confidence: input.alias.confidence,
      license: input.alias.license,
      attribution_required: input.alias.attributionRequired,
      projection_notes: input.alias.projectionNotes,
    })
    .onConflict((oc) =>
      oc
        .columns([
          "catalog_item_id",
          "normalized_name",
          "locale",
          "source_slug",
          "source_method",
        ])
        .doUpdateSet({
          catalog_item_name_id: input.catalogItemNameId,
          display_name: input.alias.displayName,
          script: input.alias.script,
          alias_kind: input.alias.aliasKind,
          status: input.alias.status,
          source_record_id: input.sourceRecordId,
          source_record_key: input.alias.sourceRecordKey,
          confidence: input.alias.confidence,
          license: input.alias.license,
          attribution_required: input.alias.attributionRequired,
          projection_notes: input.alias.projectionNotes,
          updated_at: now,
        }),
    )
    .returning("id");
}

export function buildInsertSpeciesBackboneSourceLinkQuery(
  executor: QueryExecutor,
  input: {
    catalogItemId: string;
    sourceRecordId: string;
    sourceRecord: SpeciesBackboneSourceRecordDefinition;
  },
) {
  return executor
    .insertInto("catalog_source_links")
    .values({
      catalog_item_id: input.catalogItemId,
      source_record_id: input.sourceRecordId,
      source_slug: input.sourceRecord.source.slug,
      source_record_key: input.sourceRecord.record.id,
      projection_kind: "canonical_item",
    })
    .onConflict((oc) =>
      oc.columns(["catalog_item_id", "source_record_id"]).doNothing(),
    );
}

export function buildEnqueueSpeciesBackboneTypeaheadReindexJobQuery(
  executor: QueryExecutor,
) {
  const payload = {
    kind: CATALOG_TYPEAHEAD_REINDEX_KIND,
  } satisfies JsonValue;

  return executor
    .insertInto("job_queue")
    .values({
      queue_name: MATCHING_QUEUE,
      payload,
      idempotency_key: CATALOG_TYPEAHEAD_REINDEX_IDEMPOTENCY_KEY,
    })
    .onConflict((oc) =>
      oc
        .column("idempotency_key")
        .where("idempotency_key", "is not", null)
        .doUpdateSet({
          updated_at: new Date(),
        }),
    )
    .returning("id");
}

export function buildSpeciesBackboneTypeaheadProofQuery(
  executor: QueryExecutor,
  query: string,
) {
  const pattern = `%${query.trim().replace(/\s+/g, " ").toLowerCase()}%`;

  return executor
    .selectFrom("catalog_item_names")
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "catalog_item_names.catalog_item_id",
    )
    .select([
      "catalog_items.id as catalogItemId",
      "catalog_item_names.display_name as displayName",
      "catalog_items.canonical_name as canonicalName",
      "catalog_item_names.locale as locale",
      "catalog_items.status as status",
      "catalog_items.source as source",
    ])
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_items.source", "=", "species_backbone")
    .where(
      sql<boolean>`lower(${sql.ref("catalog_item_names.display_name")}) like ${pattern}`,
    )
    .orderBy("catalog_item_names.is_primary", "desc")
    .orderBy("catalog_item_names.display_name", "asc")
    .limit(8);
}

export function buildSpeciesBackboneSourceProvenanceProofQuery(
  executor: QueryExecutor,
  catalogItemId: string,
) {
  return executor
    .selectFrom("catalog_source_links")
    .innerJoin(
      "catalog_source_records",
      "catalog_source_records.id",
      "catalog_source_links.source_record_id",
    )
    .innerJoin(
      "catalog_source_snapshots",
      "catalog_source_snapshots.id",
      "catalog_source_records.source_snapshot_id",
    )
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "catalog_source_links.catalog_item_id",
    )
    .select([
      "catalog_items.id as catalogItemId",
      "catalog_items.canonical_name as canonicalName",
      "catalog_items.status as status",
      "catalog_items.source as source",
      "catalog_source_links.source_slug as sourceSlug",
      "catalog_source_snapshots.source_name as sourceName",
      "catalog_source_snapshots.source_version as sourceVersion",
      "catalog_source_snapshots.source_url as sourceUrl",
      "catalog_source_snapshots.license as license",
      "catalog_source_snapshots.license_url as licenseUrl",
      "catalog_source_snapshots.attribution_required as attributionRequired",
      "catalog_source_snapshots.attribution_text as attributionText",
      "catalog_source_snapshots.allowed_usage as allowedUsage",
      "catalog_source_links.source_record_key as sourceRecordKey",
      "catalog_source_records.id as sourceRecordId",
      "catalog_source_snapshots.payload_sha256 as sourceFileSha256",
      "catalog_source_records.raw_payload_sha256 as rawPayloadSha256",
      "catalog_source_snapshots.parser_version as parserVersion",
      "catalog_source_snapshots.fetched_at as fetchedAt",
      "catalog_source_snapshots.verified_at as verifiedAt",
      "catalog_source_records.projection_status as projectionStatus",
    ])
    .where("catalog_items.id", "=", catalogItemId)
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_items.source", "=", "species_backbone")
    .where("catalog_source_links.projection_kind", "=", "canonical_item")
    .orderBy("catalog_source_links.source_slug", "asc");
}

export function buildSpeciesBackboneAliasCurationProofQuery(
  executor: QueryExecutor,
  catalogItemId: string,
) {
  return executor
    .selectFrom("catalog_alias_projections")
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "catalog_alias_projections.catalog_item_id",
    )
    .select([
      "catalog_items.id as catalogItemId",
      "catalog_alias_projections.catalog_item_name_id as catalogItemNameId",
      "catalog_items.canonical_name as canonicalName",
      "catalog_alias_projections.display_name as displayName",
      "catalog_alias_projections.locale as locale",
      "catalog_alias_projections.script as script",
      "catalog_alias_projections.alias_kind as aliasKind",
      "catalog_alias_projections.status as status",
      "catalog_alias_projections.source_slug as sourceSlug",
      "catalog_alias_projections.source_method as sourceMethod",
      "catalog_alias_projections.source_record_key as sourceRecordKey",
      "catalog_alias_projections.confidence as confidence",
      "catalog_alias_projections.license as license",
      "catalog_alias_projections.attribution_required as attributionRequired",
      sql<boolean>`(${sql.ref("catalog_alias_projections.catalog_item_name_id")} is not null)`.as(
        "projectedToTypeahead",
      ),
      "catalog_alias_projections.projection_notes as projectionNotes",
    ])
    .where("catalog_items.id", "=", catalogItemId)
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_items.source", "=", "species_backbone")
    .orderBy(
      sql<number>`case ${sql.ref("catalog_alias_projections.status")}
        when 'accepted' then 0
        when 'review_needed' then 1
        when 'generated' then 2
        when 'rejected' then 3
        else 4
      end`,
      "asc",
    )
    .orderBy("catalog_alias_projections.locale", "asc")
    .orderBy("catalog_alias_projections.display_name", "asc");
}

class RollbackReadbackProof extends Error {
  constructor(readonly proof: SpeciesBackboneGardenReadbackProof) {
    super("Rollback OVE-59 alias promotion readback proof");
  }
}

function jsonbParam(value: JsonValue) {
  return sql<JsonValue>`${JSON.stringify(value)}::jsonb`;
}

function emptyAliasStatusCounts(): Record<
  SpeciesBackboneAliasCandidate["status"],
  number
> {
  return {
    accepted: 0,
    review_needed: 0,
    rejected: 0,
    generated: 0,
    user_provisional: 0,
  };
}

function resolveAliasSourceRecordId(
  alias: SpeciesBackboneAliasCandidate,
  sourceRecordIdsByKey: ReadonlyMap<string, string>,
) {
  if (alias.sourceMethod !== "source_backed") return null;

  if (!alias.sourceRecordKey) {
    throw new Error(
      `Source-backed alias ${alias.displayName} has no source record key.`,
    );
  }

  const sourceRecordId = sourceRecordIdsByKey.get(alias.sourceRecordKey);
  if (!sourceRecordId) {
    throw new Error(
      `Source-backed alias ${alias.displayName} references missing source record ${alias.sourceRecordKey}.`,
    );
  }

  return sourceRecordId;
}

function buildAliasKey(locale: string, normalizedName: string) {
  return `${locale}:${normalizedName}`;
}
