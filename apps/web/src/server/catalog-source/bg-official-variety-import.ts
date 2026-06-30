import { sql, type Kysely, type Transaction } from "kysely";

import type { Database, JsonValue } from "@/db/schema";
import {
  BG_OFFICIAL_VARIETY_PARSER_VERSION,
  EU_COMMON_CATALOGUE_BG_SOURCE,
  bgOfficialVarietyAllowedProjection,
  bgOfficialVarietyAllowedUsage,
  bgOfficialVarietyDefinition,
  bgOfficialVarietyPayloadChecksum,
  bgOfficialVarietySnapshotChecksum,
  type BgOfficialVarietyImportDefinition,
  type BgOfficialVarietySourceRecordDefinition,
} from "@/lib/catalog/bg-official-variety";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const SELECTABLE_CATALOG_STATUSES = ["seeded", "confirmed"] as const;
const MATCHING_QUEUE = "matching";
const CATALOG_TYPEAHEAD_REINDEX_KIND = "catalog_typeahead_reindex";
const CATALOG_TYPEAHEAD_REINDEX_IDEMPOTENCY_KEY = "catalog-typeahead-reindex";
const PROOF_OWNER_USER_ID = "00000000-0000-4000-8000-000000061000";

export interface BgOfficialVarietyImportSummary {
  sourceSnapshotId: string;
  sourceRecordId: string;
  blockedSourceRecordId: string;
  catalogItemId: string;
  catalogKind: "plant_variety";
  sourceSlug: string;
  sourceVersion: string;
  sourceRecordKey: string;
  blockedRecordKey: string;
  rawPayloadSha256: string;
  blockedRawPayloadSha256: string;
  snapshotSha256: string;
  parserVersion: string;
  canonicalName: string;
  publicSlug: string;
  aliasesProjected: number;
  reindexQueued: boolean;
}

export interface BgOfficialVarietyTypeaheadProof {
  catalogItemId: string;
  displayName: string;
  canonicalName: string;
  catalogKind: string;
  locale: string;
  status: string;
  source: string;
}

export interface BgOfficialVarietyGardenReadbackProof {
  catalogItemId: string;
  objectKind: string;
  varietyText: string | null;
  varietyState: string;
  catalogCanonicalName: string | null;
  catalogKind: string | null;
  catalogSource: string | null;
}

export interface BgOfficialVarietySourceProvenanceProof {
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

export interface BgOfficialVarietyBlockedRecordProof {
  sourceRecordKey: string;
  projectionStatus: string;
  allowedProjection: JsonValue;
}

export async function importBgOfficialVariety(
  executor: Kysely<Database>,
  definition = bgOfficialVarietyDefinition(),
): Promise<BgOfficialVarietyImportSummary> {
  return executor.transaction().execute(async (trx) => {
    const projection = bgOfficialVarietyAllowedProjection(definition);
    const snapshotSha256 = bgOfficialVarietySnapshotChecksum(definition);

    const snapshot = await buildUpsertBgOfficialVarietySnapshotQuery(trx, {
      definition,
      payloadSha256: snapshotSha256,
    }).executeTakeFirstOrThrow();

    const records = new Map<
      string,
      { id: string; rawPayloadSha256: string; projectionStatus: string }
    >();
    for (const recordDefinition of definition.records) {
      const rawPayloadSha256 =
        bgOfficialVarietyPayloadChecksum(recordDefinition);
      const record = await buildUpsertBgOfficialVarietyRecordQuery(trx, {
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

    const projectedRecord = records.get(projection.sourceId);
    if (!projectedRecord) {
      throw new Error(
        `Missing projected BG official variety source record ${projection.sourceId}.`,
      );
    }

    const blockedRecord = records.get(definition.blockedRecordKey);
    if (!blockedRecord) {
      throw new Error(
        `Missing blocked BG official variety source record ${definition.blockedRecordKey}.`,
      );
    }

    const catalogItem = await buildUpsertBgOfficialVarietyCatalogItemQuery(
      trx,
      projection,
    ).executeTakeFirstOrThrow();

    for (const alias of projection.aliases) {
      await buildUpsertBgOfficialVarietyCatalogNameQuery(trx, {
        catalogItemId: catalogItem.id,
        ...alias,
      }).execute();
    }

    await buildInsertBgOfficialVarietySourceLinkQuery(trx, {
      definition,
      catalogItemId: catalogItem.id,
      sourceRecordId: projectedRecord.id,
    }).execute();

    const reindexJob =
      await buildEnqueueBgOfficialVarietyTypeaheadReindexJobQuery(
        trx,
      ).executeTakeFirstOrThrow();

    return {
      sourceSnapshotId: snapshot.id,
      sourceRecordId: projectedRecord.id,
      blockedSourceRecordId: blockedRecord.id,
      catalogItemId: catalogItem.id,
      catalogKind: "plant_variety",
      sourceSlug: definition.source.slug,
      sourceVersion: definition.source.version,
      sourceRecordKey: projection.sourceId,
      blockedRecordKey: definition.blockedRecordKey,
      rawPayloadSha256: projectedRecord.rawPayloadSha256,
      blockedRawPayloadSha256: blockedRecord.rawPayloadSha256,
      snapshotSha256,
      parserVersion: BG_OFFICIAL_VARIETY_PARSER_VERSION,
      canonicalName: catalogItem.canonicalName,
      publicSlug: catalogItem.publicSlug ?? projection.publicSlug,
      aliasesProjected: projection.aliases.length,
      reindexQueued: reindexJob.id.length > 0,
    };
  });
}

export async function readBgOfficialVarietyTypeaheadProof(
  executor: QueryExecutor,
  query: string,
): Promise<BgOfficialVarietyTypeaheadProof[]> {
  const rows = await buildBgOfficialVarietyTypeaheadProofQuery(
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

export async function readBgOfficialVarietySourceProvenanceProof(
  executor: QueryExecutor,
  catalogItemId: string,
): Promise<BgOfficialVarietySourceProvenanceProof | null> {
  const row = await buildBgOfficialVarietySourceProvenanceProofQuery(
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

export async function readBgOfficialVarietyBlockedRecordProof(
  executor: QueryExecutor,
  sourceRecordKey: string,
): Promise<BgOfficialVarietyBlockedRecordProof | null> {
  const row = await buildBgOfficialVarietyBlockedRecordProofQuery(
    executor,
    sourceRecordKey,
  ).executeTakeFirst();

  if (!row) return null;

  return {
    sourceRecordKey: row.sourceRecordKey,
    projectionStatus: row.projectionStatus,
    allowedProjection: row.allowedProjection,
  };
}

export async function proveBgOfficialVarietyGardenReadback(
  executor: Kysely<Database>,
  catalogItemId: string,
): Promise<BgOfficialVarietyGardenReadbackProof> {
  try {
    await executor.transaction().execute(async (trx) => {
      const projection = bgOfficialVarietyAllowedProjection();
      const space = await trx
        .insertInto("spaces")
        .values({
          owner_user_id: PROOF_OWNER_USER_ID,
          display_name: "OVE-61 BG official variety proof",
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
          display_name: "Proof Sadovo wheat",
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
          title: "OVE-61 BG official variety proof",
          body: "Verified Bulgarian official variety proof can be selected and read back without exposing raw source or parser-only fields.",
          entry_scope: "object",
          entry_date: "2026-06-30",
          visibility: "private",
          client_mutation_id: "ove-61-bg-official-variety-proof",
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

  throw new Error("BG official variety readback proof did not run.");
}

export function buildUpsertBgOfficialVarietySnapshotQuery(
  executor: QueryExecutor,
  input: {
    definition?: BgOfficialVarietyImportDefinition;
    payloadSha256: string;
  },
) {
  const definition = input.definition ?? bgOfficialVarietyDefinition();
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
      allowed_usage: jsonbParam(bgOfficialVarietyAllowedUsage(definition)),
      parser_version: BG_OFFICIAL_VARIETY_PARSER_VERSION,
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
          allowed_usage: jsonbParam(bgOfficialVarietyAllowedUsage(definition)),
          parser_version: BG_OFFICIAL_VARIETY_PARSER_VERSION,
          fetched_at: definition.fileProof.fetchedAt,
          verified_at: definition.fileProof.verifiedAt,
          status: "imported",
          updated_at: now,
        }),
    )
    .returning("id");
}

export function buildUpsertBgOfficialVarietyRecordQuery(
  executor: QueryExecutor,
  input: {
    record?: BgOfficialVarietySourceRecordDefinition;
    sourceSnapshotId: string;
    rawPayloadSha256: string;
  },
) {
  const record = input.record ?? bgOfficialVarietyDefinition().records[0];
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
        projection_status: record.projectionStatus,
        updated_at: now,
      }),
    )
    .returning(["id", "projection_status as projectionStatus"]);
}

export function buildUpsertBgOfficialVarietyCatalogItemQuery(
  executor: QueryExecutor,
  projection = bgOfficialVarietyAllowedProjection(),
) {
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

export function buildUpsertBgOfficialVarietyCatalogNameQuery(
  executor: QueryExecutor,
  input: {
    catalogItemId: string;
    displayName: string;
    normalizedName: string;
    locale: string;
    isPrimary: boolean;
  },
) {
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

export function buildInsertBgOfficialVarietySourceLinkQuery(
  executor: QueryExecutor,
  input: {
    definition?: BgOfficialVarietyImportDefinition;
    catalogItemId: string;
    sourceRecordId: string;
  },
) {
  const definition = input.definition ?? bgOfficialVarietyDefinition();

  return executor
    .insertInto("catalog_source_links")
    .values({
      catalog_item_id: input.catalogItemId,
      source_record_id: input.sourceRecordId,
      source_slug: definition.source.slug,
      source_record_key: definition.projection.sourceId,
      projection_kind: "canonical_item",
    })
    .onConflict((oc) =>
      oc.columns(["catalog_item_id", "source_record_id"]).doNothing(),
    );
}

export function buildEnqueueBgOfficialVarietyTypeaheadReindexJobQuery(
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

export function buildBgOfficialVarietyTypeaheadProofQuery(
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
    .where("catalog_items.source", "=", "eu_common_catalogue_bg")
    .where(
      sql<boolean>`lower(${sql.ref("catalog_item_names.display_name")}) like ${pattern}`,
    )
    .orderBy("catalog_item_names.is_primary", "desc")
    .orderBy("catalog_item_names.display_name", "asc")
    .limit(8);
}

export function buildBgOfficialVarietySourceProvenanceProofQuery(
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
    .where("catalog_items.source", "=", "eu_common_catalogue_bg")
    .where(
      "catalog_source_links.source_slug",
      "=",
      EU_COMMON_CATALOGUE_BG_SOURCE.slug,
    )
    .where("catalog_source_links.projection_kind", "=", "canonical_item")
    .limit(1);
}

export function buildBgOfficialVarietyBlockedRecordProofQuery(
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
      "catalog_source_records.source_record_id as sourceRecordKey",
      "catalog_source_records.projection_status as projectionStatus",
      "catalog_source_records.allowed_projection as allowedProjection",
    ])
    .where(
      "catalog_source_snapshots.source_slug",
      "=",
      EU_COMMON_CATALOGUE_BG_SOURCE.slug,
    )
    .where("catalog_source_records.source_record_id", "=", sourceRecordKey)
    .limit(1);
}

class RollbackReadbackProof extends Error {
  constructor(readonly proof: BgOfficialVarietyGardenReadbackProof) {
    super("Rollback OVE-61 BG official variety readback proof");
  }
}

function jsonbParam(value: JsonValue) {
  return sql<JsonValue>`${JSON.stringify(value)}::jsonb`;
}
