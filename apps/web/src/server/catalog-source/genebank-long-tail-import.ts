import { sql, type Kysely, type Transaction } from "kysely";

import type { Database, JsonValue } from "@/db/schema";
import {
  GENEBANK_LONG_TAIL_PARSER_VERSION,
  GRIN_GENEBANK_SOURCE,
  genebankLongTailAllowedUsage,
  genebankLongTailDefinition,
  genebankLongTailPayloadChecksum,
  genebankLongTailPromotionProjection,
  genebankLongTailSnapshotChecksum,
  type GenebankLongTailImportDefinition,
  type GenebankLongTailProjection,
  type GenebankLongTailSourceRecordDefinition,
} from "@/lib/catalog/genebank-long-tail";
import { assertCatalogSourceProductProjectionAllowed } from "./source-projection-guard";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const SELECTABLE_CATALOG_STATUSES = ["seeded", "confirmed"] as const;
const MATCHING_QUEUE = "matching";
const CATALOG_TYPEAHEAD_REINDEX_KIND = "catalog_typeahead_reindex";
const CATALOG_TYPEAHEAD_REINDEX_IDEMPOTENCY_KEY = "catalog-typeahead-reindex";
const PROOF_OWNER_USER_ID = "00000000-0000-4000-8000-000000062000";

export interface GenebankLongTailImportSummary {
  sourceSnapshotId: string;
  promotableSourceRecordId: string;
  heldSourceRecordId: string;
  promotableRecordKey: string;
  heldRecordKey: string;
  promotableProjectionStatus: string;
  heldProjectionStatus: string;
  sourceSlug: string;
  sourceVersion: string;
  snapshotSha256: string;
  promotableRawPayloadSha256: string;
  heldRawPayloadSha256: string;
  parserVersion: string;
}

export interface GenebankLongTailPromotionSummary {
  sourceRecordId: string;
  catalogItemId: string;
  catalogKind: "plant_variety";
  sourceSlug: string;
  sourceRecordKey: string;
  sourceVersion: string;
  canonicalName: string;
  publicSlug: string;
  aliasesProjected: number;
  projectionStatus: "projected";
  reindexQueued: boolean;
}

export interface GenebankCandidateQueueRow {
  sourceRecordKey: string;
  projectionStatus: string;
  allowedProjection: JsonValue;
}

export interface GenebankTypeaheadProof {
  catalogItemId: string;
  displayName: string;
  canonicalName: string;
  catalogKind: string;
  locale: string;
  status: string;
  source: string;
}

export interface GenebankSourceProvenanceProof {
  catalogItemId: string;
  canonicalName: string;
  catalogKind: string;
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
  snapshotSha256: string;
  rawPayloadSha256: string;
  parserVersion: string;
  fetchedAt: Date | string;
  verifiedAt: Date | string;
  projectionStatus: string;
  allowedProjection: JsonValue;
}

export interface GenebankGardenReadbackProof {
  catalogItemId: string;
  objectKind: string;
  varietyText: string | null;
  varietyState: string;
  catalogCanonicalName: string | null;
  catalogKind: string | null;
  catalogSource: string | null;
}

export type GenebankProofHarnessIsolation =
  | {
      cleanStateProof: {
        status: "passed";
        candidateQueueBeforePromotion: GenebankCandidateQueueRow[];
        cleanStateTypeaheadBeforePromotion: GenebankTypeaheadProof[];
      };
      rerunExistingProjection: null;
    }
  | {
      cleanStateProof: {
        status: "skipped_existing_projection";
        reason: string;
      };
      rerunExistingProjection: {
        status: "existing_projection_before_this_run";
        promotableProjectionStatus: string;
        existingTypeaheadBeforeThisRun: GenebankTypeaheadProof[];
      };
    };

export interface GenebankProofHarnessIsolationInput {
  imported: GenebankLongTailImportSummary;
  candidateQueueBeforePromotion: GenebankCandidateQueueRow[];
  typeaheadBeforePromotion: GenebankTypeaheadProof[];
  requireCleanState?: boolean;
}

export async function importGenebankLongTailCandidates(
  executor: Kysely<Database>,
  definition = genebankLongTailDefinition(),
): Promise<GenebankLongTailImportSummary> {
  return executor.transaction().execute(async (trx) => {
    const snapshotSha256 = genebankLongTailSnapshotChecksum(definition);
    const snapshot = await buildUpsertGenebankSnapshotQuery(trx, {
      definition,
      payloadSha256: snapshotSha256,
    }).executeTakeFirstOrThrow();

    const records = new Map<
      string,
      { id: string; rawPayloadSha256: string; projectionStatus: string }
    >();
    for (const recordDefinition of definition.records) {
      const rawPayloadSha256 =
        genebankLongTailPayloadChecksum(recordDefinition);
      const record = await buildUpsertGenebankRecordQuery(trx, {
        record: recordDefinition,
        sourceSnapshotId: snapshot.id,
        rawPayloadSha256,
      }).executeTakeFirstOrThrow();
      records.set(recordDefinition.id, {
        id: record.id,
        rawPayloadSha256,
        projectionStatus: record.projectionStatus,
      });
    }

    const promotableRecord = records.get(definition.promotableRecordKey);
    const heldRecord = records.get(definition.heldRecordKey);
    if (!promotableRecord) {
      throw new Error(
        `Missing genebank candidate ${definition.promotableRecordKey}.`,
      );
    }
    if (!heldRecord) {
      throw new Error(
        `Missing held genebank candidate ${definition.heldRecordKey}.`,
      );
    }

    return {
      sourceSnapshotId: snapshot.id,
      promotableSourceRecordId: promotableRecord.id,
      heldSourceRecordId: heldRecord.id,
      promotableRecordKey: definition.promotableRecordKey,
      heldRecordKey: definition.heldRecordKey,
      promotableProjectionStatus: promotableRecord.projectionStatus,
      heldProjectionStatus: heldRecord.projectionStatus,
      sourceSlug: definition.source.slug,
      sourceVersion: definition.source.version,
      snapshotSha256,
      promotableRawPayloadSha256: promotableRecord.rawPayloadSha256,
      heldRawPayloadSha256: heldRecord.rawPayloadSha256,
      parserVersion: GENEBANK_LONG_TAIL_PARSER_VERSION,
    };
  });
}

export function buildGenebankProofHarnessIsolation(
  input: GenebankProofHarnessIsolationInput,
): GenebankProofHarnessIsolation {
  const existingProjectionVisible =
    input.imported.promotableProjectionStatus === "projected";
  const existingProductTypeahead = input.typeaheadBeforePromotion.filter(
    (row) => row.source === "grin_genebank_candidate",
  );

  if (existingProjectionVisible || existingProductTypeahead.length > 0) {
    const reason =
      "Promotable GRIN candidate already has a product projection before this script run; clean-state pre-promotion absence is not claimed on reruns.";
    if (input.requireCleanState) {
      throw new Error(
        `${reason} Re-run against a clean database or omit --require-clean-state to validate idempotency separately.`,
      );
    }

    return {
      cleanStateProof: {
        status: "skipped_existing_projection",
        reason,
      },
      rerunExistingProjection: {
        status: "existing_projection_before_this_run",
        promotableProjectionStatus: input.imported.promotableProjectionStatus,
        existingTypeaheadBeforeThisRun: input.typeaheadBeforePromotion,
      },
    };
  }

  if (
    !input.candidateQueueBeforePromotion.some(
      (row) => row.sourceRecordKey === input.imported.promotableRecordKey,
    )
  ) {
    throw new Error(
      "Promotable genebank candidate is missing from review queue.",
    );
  }

  return {
    cleanStateProof: {
      status: "passed",
      candidateQueueBeforePromotion: input.candidateQueueBeforePromotion,
      cleanStateTypeaheadBeforePromotion: input.typeaheadBeforePromotion,
    },
    rerunExistingProjection: null,
  };
}

export async function promoteGenebankLongTailCandidate(
  executor: Kysely<Database>,
  sourceRecordKey: string,
  definition = genebankLongTailDefinition(),
): Promise<GenebankLongTailPromotionSummary> {
  return executor.transaction().execute(async (trx) => {
    const candidate = await buildSelectPromotableGenebankCandidateQuery(
      trx,
      sourceRecordKey,
    ).executeTakeFirstOrThrow();
    const projection = genebankLongTailPromotionProjection(definition);

    if (sourceRecordKey !== definition.promotableRecordKey) {
      throw new Error(
        `Genebank candidate ${sourceRecordKey} is not approved for promotion.`,
      );
    }
    if (candidate.projectionStatus === "rejected") {
      throw new Error(`Genebank candidate ${sourceRecordKey} is rejected.`);
    }

    const catalogItem = await buildUpsertGenebankCatalogItemQuery(
      trx,
      projection,
    ).executeTakeFirstOrThrow();

    for (const alias of projection.aliases) {
      await buildUpsertGenebankCatalogNameQuery(trx, {
        catalogItemId: catalogItem.id,
        ...alias,
      }).execute();
    }

    await buildInsertGenebankSourceLinkQuery(trx, {
      catalogItemId: catalogItem.id,
      sourceRecordId: candidate.sourceRecordId,
      sourceRecordKey,
    }).execute();

    await buildMarkGenebankRecordProjectedQuery(trx, {
      sourceRecordId: candidate.sourceRecordId,
    }).executeTakeFirstOrThrow();

    const reindexJob =
      await buildEnqueueGenebankTypeaheadReindexJobQuery(
        trx,
      ).executeTakeFirstOrThrow();

    return {
      sourceRecordId: candidate.sourceRecordId,
      catalogItemId: catalogItem.id,
      catalogKind: "plant_variety",
      sourceSlug: definition.source.slug,
      sourceRecordKey,
      sourceVersion: candidate.sourceVersion,
      canonicalName: catalogItem.canonicalName,
      publicSlug: catalogItem.publicSlug ?? projection.publicSlug,
      aliasesProjected: projection.aliases.length,
      projectionStatus: "projected",
      reindexQueued: reindexJob.id.length > 0,
    };
  });
}

export async function readGenebankCandidateQueue(
  executor: QueryExecutor,
): Promise<GenebankCandidateQueueRow[]> {
  const rows = await buildGenebankCandidateQueueQuery(executor).execute();

  return rows.map((row) => ({
    sourceRecordKey: row.sourceRecordKey,
    projectionStatus: row.projectionStatus,
    allowedProjection: row.allowedProjection,
  }));
}

export async function readGenebankTypeaheadProof(
  executor: QueryExecutor,
  query: string,
): Promise<GenebankTypeaheadProof[]> {
  const rows = await buildGenebankTypeaheadProofQuery(
    executor,
    query,
  ).execute();

  return rows.map((row) => ({
    catalogItemId: row.catalogItemId,
    displayName: row.displayName,
    canonicalName: row.canonicalName,
    catalogKind: row.catalogKind,
    locale: row.locale,
    status: row.status,
    source: row.source,
  }));
}

export async function readGenebankSourceProvenanceProof(
  executor: QueryExecutor,
  catalogItemId: string,
): Promise<GenebankSourceProvenanceProof | null> {
  const row = await buildGenebankSourceProvenanceProofQuery(
    executor,
    catalogItemId,
  ).executeTakeFirst();

  if (!row) return null;

  return {
    catalogItemId: row.catalogItemId,
    canonicalName: row.canonicalName,
    catalogKind: row.catalogKind,
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
    snapshotSha256: row.snapshotSha256,
    rawPayloadSha256: row.rawPayloadSha256,
    parserVersion: row.parserVersion,
    fetchedAt: row.fetchedAt,
    verifiedAt: row.verifiedAt,
    projectionStatus: row.projectionStatus,
    allowedProjection: row.allowedProjection,
  };
}

export async function proveGenebankGardenReadback(
  executor: Kysely<Database>,
  catalogItemId: string,
): Promise<GenebankGardenReadbackProof> {
  try {
    await executor.transaction().execute(async (trx) => {
      const projection = genebankLongTailPromotionProjection();
      const space = await trx
        .insertInto("spaces")
        .values({
          owner_user_id: PROOF_OWNER_USER_ID,
          display_name: "OVE-62 genebank candidate proof",
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
          display_name: "Proof Red Cherry tomato",
          object_kind: "plant",
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
          title: "OVE-62 genebank candidate proof",
          body: "Promoted genebank candidate can be selected and read back without exposing accession source-only fields.",
          entry_scope: "object",
          entry_date: "2026-06-30",
          visibility: "private",
          client_mutation_id: "ove-62-genebank-candidate-proof",
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
          "plant_objects.object_kind as objectKind",
          "plant_objects.variety_text as varietyText",
          "plant_objects.variety_state as varietyState",
          "catalog_items.canonical_name as catalogCanonicalName",
          "catalog_items.catalog_kind as catalogKind",
          "catalog_items.source as catalogSource",
        ])
        .where("plant_objects.id", "=", plantObject.id)
        .where("plant_objects.owner_user_id", "=", PROOF_OWNER_USER_ID)
        .executeTakeFirstOrThrow();

      throw new RollbackReadbackProof({
        catalogItemId: readback.catalogItemId ?? "",
        objectKind: readback.objectKind,
        varietyText: readback.varietyText,
        varietyState: readback.varietyState,
        catalogCanonicalName: readback.catalogCanonicalName,
        catalogKind: readback.catalogKind,
        catalogSource: readback.catalogSource,
      });
    });
  } catch (error) {
    if (error instanceof RollbackReadbackProof) {
      return error.proof;
    }

    throw error;
  }

  throw new Error("Genebank garden readback proof did not run.");
}

export function buildUpsertGenebankSnapshotQuery(
  executor: QueryExecutor,
  input: {
    definition?: GenebankLongTailImportDefinition;
    payloadSha256: string;
  },
) {
  const definition = input.definition ?? genebankLongTailDefinition();
  const now = new Date();

  return executor
    .insertInto("catalog_source_snapshots")
    .values({
      source_slug: definition.source.slug,
      source_name: definition.source.name,
      source_category: definition.source.category,
      source_version: definition.source.version,
      source_url: definition.source.url,
      license: definition.source.license,
      license_url: definition.source.licenseUrl,
      attribution_required: definition.source.attributionRequired,
      attribution_text: definition.source.attributionText,
      allowed_usage: jsonbParam(genebankLongTailAllowedUsage(definition)),
      parser_version: GENEBANK_LONG_TAIL_PARSER_VERSION,
      payload_sha256: input.payloadSha256,
      fetched_at: definition.fileProof.fetchedAt,
      verified_at: definition.fileProof.verifiedAt,
      status: "imported",
    })
    .onConflict((oc) =>
      oc
        .columns(["source_slug", "source_version", "payload_sha256"])
        .doUpdateSet({
          source_name: definition.source.name,
          source_category: definition.source.category,
          source_url: definition.source.url,
          license: definition.source.license,
          license_url: definition.source.licenseUrl,
          attribution_required: definition.source.attributionRequired,
          attribution_text: definition.source.attributionText,
          allowed_usage: jsonbParam(genebankLongTailAllowedUsage(definition)),
          parser_version: GENEBANK_LONG_TAIL_PARSER_VERSION,
          fetched_at: definition.fileProof.fetchedAt,
          verified_at: definition.fileProof.verifiedAt,
          status: "imported",
          updated_at: now,
        }),
    )
    .returning("id");
}

export function buildUpsertGenebankRecordQuery(
  executor: QueryExecutor,
  input: {
    record?: GenebankLongTailSourceRecordDefinition;
    sourceSnapshotId: string;
    rawPayloadSha256: string;
  },
) {
  const record = input.record ?? genebankLongTailDefinition().records[0];
  const now = new Date();

  return executor
    .insertInto("catalog_source_records")
    .values({
      source_snapshot_id: input.sourceSnapshotId,
      source_record_id: record.id,
      raw_payload: jsonbParam(record.rawPayload),
      raw_payload_sha256: input.rawPayloadSha256,
      source_only_fields: jsonbParam(record.sourceOnlyFields),
      allowed_projection: jsonbParam(record.allowedProjection),
      projection_status: record.projectionStatus,
    })
    .onConflict((oc) =>
      oc.columns(["source_snapshot_id", "source_record_id"]).doUpdateSet({
        raw_payload: jsonbParam(record.rawPayload),
        raw_payload_sha256: input.rawPayloadSha256,
        source_only_fields: jsonbParam(record.sourceOnlyFields),
        allowed_projection: jsonbParam(record.allowedProjection),
        updated_at: now,
      }),
    )
    .returning(["id", "projection_status as projectionStatus"]);
}

export function buildSelectPromotableGenebankCandidateQuery(
  executor: QueryExecutor,
  sourceRecordKey: string,
) {
  return executor
    .selectFrom("catalog_source_records")
    .innerJoin(
      "catalog_source_snapshots",
      "catalog_source_snapshots.id",
      "catalog_source_records.source_snapshot_id",
    )
    .select([
      "catalog_source_records.id as sourceRecordId",
      "catalog_source_records.source_record_id as sourceRecordKey",
      "catalog_source_records.projection_status as projectionStatus",
      "catalog_source_records.allowed_projection as allowedProjection",
      "catalog_source_snapshots.source_version as sourceVersion",
    ])
    .where(
      "catalog_source_snapshots.source_slug",
      "=",
      GRIN_GENEBANK_SOURCE.slug,
    )
    .where("catalog_source_records.source_record_id", "=", sourceRecordKey)
    .where("catalog_source_records.projection_status", "!=", "rejected")
    .limit(1);
}

export function buildUpsertGenebankCatalogItemQuery(
  executor: QueryExecutor,
  projection: GenebankLongTailProjection = genebankLongTailPromotionProjection(),
) {
  assertCatalogSourceProductProjectionAllowed({
    sourceSlug: GRIN_GENEBANK_SOURCE.slug,
    sourceVersion: GRIN_GENEBANK_SOURCE.version,
    sourceRecordKey: projection.sourceId,
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

export function buildUpsertGenebankCatalogNameQuery(
  executor: QueryExecutor,
  input: {
    catalogItemId: string;
    displayName: string;
    normalizedName: string;
    locale: string;
    isPrimary: boolean;
  },
) {
  const projection = genebankLongTailPromotionProjection();
  assertCatalogSourceProductProjectionAllowed({
    sourceSlug: GRIN_GENEBANK_SOURCE.slug,
    sourceVersion: GRIN_GENEBANK_SOURCE.version,
    sourceRecordKey: projection.sourceId,
    productSurface: "catalog_item_names",
    productSource: projection.source,
    productSourceId: projection.sourceId,
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
    );
}

export function buildInsertGenebankSourceLinkQuery(
  executor: QueryExecutor,
  input: {
    catalogItemId: string;
    sourceRecordId: string;
    sourceRecordKey: string;
  },
) {
  return executor
    .insertInto("catalog_source_links")
    .values({
      catalog_item_id: input.catalogItemId,
      source_record_id: input.sourceRecordId,
      source_slug: GRIN_GENEBANK_SOURCE.slug,
      source_record_key: input.sourceRecordKey,
      projection_kind: "canonical_item",
    })
    .onConflict((oc) =>
      oc.columns(["catalog_item_id", "source_record_id"]).doNothing(),
    );
}

export function buildMarkGenebankRecordProjectedQuery(
  executor: QueryExecutor,
  input: { sourceRecordId: string },
) {
  return executor
    .updateTable("catalog_source_records")
    .set({
      projection_status: "projected",
      updated_at: new Date(),
    })
    .where("id", "=", input.sourceRecordId)
    .returning("projection_status as projectionStatus");
}

export function buildEnqueueGenebankTypeaheadReindexJobQuery(
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

export function buildGenebankCandidateQueueQuery(executor: QueryExecutor) {
  return executor
    .selectFrom("catalog_source_records")
    .innerJoin(
      "catalog_source_snapshots",
      "catalog_source_snapshots.id",
      "catalog_source_records.source_snapshot_id",
    )
    .select([
      "catalog_source_records.source_record_id as sourceRecordKey",
      "catalog_source_records.projection_status as projectionStatus",
      "catalog_source_records.allowed_projection as allowedProjection",
    ])
    .where(
      "catalog_source_snapshots.source_slug",
      "=",
      GRIN_GENEBANK_SOURCE.slug,
    )
    .where("catalog_source_records.projection_status", "=", "quarantined")
    .orderBy("catalog_source_records.source_record_id", "asc");
}

export function buildGenebankTypeaheadProofQuery(
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
      "catalog_items.catalog_kind as catalogKind",
      "catalog_item_names.locale as locale",
      "catalog_items.status as status",
      "catalog_items.source as source",
    ])
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_items.catalog_kind", "=", "plant_variety")
    .where("catalog_items.source", "=", "grin_genebank_candidate")
    .where(
      sql<boolean>`lower(${sql.ref("catalog_item_names.display_name")}) like ${pattern}`,
    )
    .orderBy("catalog_item_names.is_primary", "desc")
    .orderBy("catalog_item_names.display_name", "asc")
    .limit(8);
}

export function buildGenebankSourceProvenanceProofQuery(
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
      "catalog_items.catalog_kind as catalogKind",
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
      "catalog_source_snapshots.payload_sha256 as snapshotSha256",
      "catalog_source_records.raw_payload_sha256 as rawPayloadSha256",
      "catalog_source_records.allowed_projection as allowedProjection",
      "catalog_source_snapshots.parser_version as parserVersion",
      "catalog_source_snapshots.fetched_at as fetchedAt",
      "catalog_source_snapshots.verified_at as verifiedAt",
      "catalog_source_records.projection_status as projectionStatus",
    ])
    .where("catalog_items.id", "=", catalogItemId)
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_items.catalog_kind", "=", "plant_variety")
    .where("catalog_items.source", "=", "grin_genebank_candidate")
    .where("catalog_source_links.source_slug", "=", GRIN_GENEBANK_SOURCE.slug)
    .where("catalog_source_links.projection_kind", "=", "canonical_item")
    .limit(1);
}

class RollbackReadbackProof extends Error {
  constructor(readonly proof: GenebankGardenReadbackProof) {
    super("Rollback OVE-62 genebank readback proof");
  }
}

function jsonbParam(value: JsonValue) {
  return sql<JsonValue>`${JSON.stringify(value)}::jsonb`;
}
