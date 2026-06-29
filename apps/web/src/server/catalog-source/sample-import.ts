import { sql, type Kysely, type Transaction } from "kysely";

import {
  CATALOG_SOURCE_SAMPLE,
  CATALOG_SOURCE_SAMPLE_PARSER_VERSION,
  catalogSourceSampleAllowedProjectionJson,
  catalogSourceSampleAllowedUsage,
  catalogSourceSampleAllowedProjection,
  catalogSourceSamplePayloadChecksum,
  catalogSourceSampleRawPayload,
  catalogSourceSampleSnapshotChecksum,
  catalogSourceSampleSourceOnlyFields,
} from "@/lib/catalog/source-sample";
import type { Database, JsonValue } from "@/db/schema";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const SELECTABLE_CATALOG_STATUSES = ["seeded", "confirmed"] as const;
const MATCHING_QUEUE = "matching";
const CATALOG_TYPEAHEAD_REINDEX_KIND = "catalog_typeahead_reindex";
const CATALOG_TYPEAHEAD_REINDEX_IDEMPOTENCY_KEY = "catalog-typeahead-reindex";
const PROOF_OWNER_USER_ID = "00000000-0000-4000-8000-000000056000";

export interface CatalogSourceSampleImportSummary {
  sourceSnapshotId: string;
  sourceRecordId: string;
  catalogItemId: string;
  sourceSlug: string;
  sourceVersion: string;
  sourceRecordKey: string;
  payloadSha256: string;
  snapshotSha256: string;
  parserVersion: string;
  canonicalName: string;
  publicSlug: string;
  aliasesProjected: number;
  reindexQueued: boolean;
}

export interface CatalogSourceSampleTypeaheadProof {
  catalogItemId: string;
  displayName: string;
  canonicalName: string;
  locale: string;
  status: string;
  source: string;
}

export interface CatalogSourceSampleGardenReadbackProof {
  catalogItemId: string;
  varietyText: string | null;
  varietyState: string;
  catalogCanonicalName: string | null;
  catalogSource: string | null;
}

export async function importCatalogSourceSample(
  executor: Kysely<Database>,
): Promise<CatalogSourceSampleImportSummary> {
  return executor.transaction().execute(async (trx) => {
    const projection = catalogSourceSampleAllowedProjection();
    const payloadSha256 = catalogSourceSamplePayloadChecksum();
    const snapshotSha256 = catalogSourceSampleSnapshotChecksum();

    const snapshot = await buildUpsertCatalogSourceSnapshotQuery(trx, {
      payloadSha256: snapshotSha256,
    }).executeTakeFirstOrThrow();

    const record = await buildUpsertCatalogSourceRecordQuery(trx, {
      sourceSnapshotId: snapshot.id,
      rawPayloadSha256: payloadSha256,
    }).executeTakeFirstOrThrow();

    const catalogItem = await buildUpsertCatalogSourceCatalogItemQuery(
      trx,
      projection,
    ).executeTakeFirstOrThrow();

    for (const alias of projection.aliases) {
      await buildUpsertCatalogSourceCatalogNameQuery(trx, {
        catalogItemId: catalogItem.id,
        ...alias,
      }).execute();
    }

    await buildInsertCatalogSourceLinkQuery(trx, {
      catalogItemId: catalogItem.id,
      sourceRecordId: record.id,
    }).execute();

    const reindexJob =
      await buildEnqueueCatalogSourceTypeaheadReindexJobQuery(
        trx,
      ).executeTakeFirstOrThrow();

    return {
      sourceSnapshotId: snapshot.id,
      sourceRecordId: record.id,
      catalogItemId: catalogItem.id,
      sourceSlug: CATALOG_SOURCE_SAMPLE.source.slug,
      sourceVersion: CATALOG_SOURCE_SAMPLE.source.version,
      sourceRecordKey: CATALOG_SOURCE_SAMPLE.record.id,
      payloadSha256,
      snapshotSha256,
      parserVersion: CATALOG_SOURCE_SAMPLE_PARSER_VERSION,
      canonicalName: catalogItem.canonicalName,
      publicSlug: catalogItem.publicSlug ?? projection.publicSlug,
      aliasesProjected: projection.aliases.length,
      reindexQueued: reindexJob.id.length > 0,
    };
  });
}

export async function readCatalogSourceSampleTypeaheadProof(
  executor: QueryExecutor,
): Promise<CatalogSourceSampleTypeaheadProof[]> {
  const rows = await buildCatalogSourceSampleTypeaheadProofQuery(
    executor,
    CATALOG_SOURCE_SAMPLE.projection.canonicalName,
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

export async function proveCatalogSourceSampleGardenReadback(
  executor: Kysely<Database>,
  catalogItemId: string,
): Promise<CatalogSourceSampleGardenReadbackProof> {
  try {
    await executor.transaction().execute(async (trx) => {
      const space = await trx
        .insertInto("spaces")
        .values({
          owner_user_id: PROOF_OWNER_USER_ID,
          display_name: "OVE-56 source quarantine proof",
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
          display_name: "Proof apricot",
          catalog_item_id: catalogItemId,
          variety_text: CATALOG_SOURCE_SAMPLE.projection.canonicalName,
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
          title: "OVE-56 catalog source proof",
          body: "Imported catalog projection can be selected and read back without raw source fields.",
          entry_scope: "object",
          entry_date: "2026-06-29",
          visibility: "private",
          client_mutation_id: "ove-56-source-quarantine-proof",
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

  throw new Error("Catalog source sample readback proof did not run.");
}

export function buildUpsertCatalogSourceSnapshotQuery(
  executor: QueryExecutor,
  input: { payloadSha256: string },
) {
  const now = new Date();

  return executor
    .insertInto("catalog_source_snapshots")
    .values({
      source_slug: CATALOG_SOURCE_SAMPLE.source.slug,
      source_name: CATALOG_SOURCE_SAMPLE.source.name,
      source_category: CATALOG_SOURCE_SAMPLE.source.category,
      source_version: CATALOG_SOURCE_SAMPLE.source.version,
      source_url: CATALOG_SOURCE_SAMPLE.source.url,
      license: CATALOG_SOURCE_SAMPLE.source.license,
      attribution_required: CATALOG_SOURCE_SAMPLE.source.attributionRequired,
      allowed_usage: jsonbParam(catalogSourceSampleAllowedUsage()),
      parser_version: CATALOG_SOURCE_SAMPLE_PARSER_VERSION,
      payload_sha256: input.payloadSha256,
      fetched_at: CATALOG_SOURCE_SAMPLE.source.fetchedAt,
      verified_at: CATALOG_SOURCE_SAMPLE.source.verifiedAt,
      status: "imported",
    })
    .onConflict((oc) =>
      oc
        .columns(["source_slug", "source_version", "payload_sha256"])
        .doUpdateSet({
          source_name: CATALOG_SOURCE_SAMPLE.source.name,
          source_category: CATALOG_SOURCE_SAMPLE.source.category,
          source_url: CATALOG_SOURCE_SAMPLE.source.url,
          license: CATALOG_SOURCE_SAMPLE.source.license,
          attribution_required:
            CATALOG_SOURCE_SAMPLE.source.attributionRequired,
          allowed_usage: jsonbParam(catalogSourceSampleAllowedUsage()),
          parser_version: CATALOG_SOURCE_SAMPLE_PARSER_VERSION,
          fetched_at: CATALOG_SOURCE_SAMPLE.source.fetchedAt,
          verified_at: CATALOG_SOURCE_SAMPLE.source.verifiedAt,
          status: "imported",
          updated_at: now,
        }),
    )
    .returning("id");
}

export function buildUpsertCatalogSourceRecordQuery(
  executor: QueryExecutor,
  input: { sourceSnapshotId: string; rawPayloadSha256: string },
) {
  const now = new Date();

  return executor
    .insertInto("catalog_source_records")
    .values({
      source_snapshot_id: input.sourceSnapshotId,
      source_record_id: CATALOG_SOURCE_SAMPLE.record.id,
      raw_payload: jsonbParam(catalogSourceSampleRawPayload()),
      raw_payload_sha256: input.rawPayloadSha256,
      source_only_fields: jsonbParam(catalogSourceSampleSourceOnlyFields()),
      allowed_projection: jsonbParam(
        catalogSourceSampleAllowedProjectionJson(),
      ),
      projection_status: "projected",
    })
    .onConflict((oc) =>
      oc.columns(["source_snapshot_id", "source_record_id"]).doUpdateSet({
        raw_payload: jsonbParam(catalogSourceSampleRawPayload()),
        raw_payload_sha256: input.rawPayloadSha256,
        source_only_fields: jsonbParam(catalogSourceSampleSourceOnlyFields()),
        allowed_projection: jsonbParam(
          catalogSourceSampleAllowedProjectionJson(),
        ),
        projection_status: "projected",
        updated_at: now,
      }),
    )
    .returning("id");
}

export function buildUpsertCatalogSourceCatalogItemQuery(
  executor: QueryExecutor,
  projection = catalogSourceSampleAllowedProjection(),
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
      created_by_user_id: null,
      locale: projection.locale,
    })
    .onConflict((oc) =>
      oc.columns(["source", "source_id"]).doUpdateSet({
        canonical_name: projection.canonicalName,
        normalized_name: projection.normalizedName,
        public_slug: projection.publicSlug,
        status: projection.status,
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

export function buildUpsertCatalogSourceCatalogNameQuery(
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

export function buildInsertCatalogSourceLinkQuery(
  executor: QueryExecutor,
  input: { catalogItemId: string; sourceRecordId: string },
) {
  return executor
    .insertInto("catalog_source_links")
    .values({
      catalog_item_id: input.catalogItemId,
      source_record_id: input.sourceRecordId,
      source_slug: CATALOG_SOURCE_SAMPLE.source.slug,
      source_record_key: CATALOG_SOURCE_SAMPLE.record.id,
      projection_kind: "canonical_item",
    })
    .onConflict((oc) =>
      oc.columns(["catalog_item_id", "source_record_id"]).doNothing(),
    );
}

export function buildEnqueueCatalogSourceTypeaheadReindexJobQuery(
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

export function buildCatalogSourceSampleTypeaheadProofQuery(
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
    .where("catalog_items.source", "=", CATALOG_SOURCE_SAMPLE.projection.source)
    .where(
      sql<boolean>`lower(${sql.ref("catalog_item_names.display_name")}) like ${pattern}`,
    )
    .orderBy("catalog_item_names.is_primary", "desc")
    .orderBy("catalog_item_names.display_name", "asc")
    .limit(8);
}

class RollbackReadbackProof extends Error {
  constructor(readonly proof: CatalogSourceSampleGardenReadbackProof) {
    super("Rollback OVE-56 catalog source sample readback proof");
  }
}

function jsonbParam(value: JsonValue) {
  return sql<JsonValue>`${JSON.stringify(value)}::jsonb`;
}
