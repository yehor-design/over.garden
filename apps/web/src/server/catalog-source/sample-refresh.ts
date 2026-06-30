import { sql, type Kysely, type Transaction } from "kysely";

import type { Database, JsonValue } from "@/db/schema";
import {
  CATALOG_SOURCE_REFRESH_PARSER_VERSION,
  catalogSourceRefreshAllowedProjectionJson,
  catalogSourceRefreshAllowedUsage,
  catalogSourceRefreshBaselineSnapshotDefinition,
  catalogSourceRefreshIncomingSnapshotDefinition,
  catalogSourceRefreshPayloadChecksum,
  catalogSourceRefreshSnapshotChecksum,
  planCatalogSourceRefreshDiff,
  summarizeCatalogSourceRefreshPlan,
  type CatalogSourceRefreshDiffStatus,
  type CatalogSourceRefreshPlanRow,
  type CatalogSourceRefreshProjection,
  type CatalogSourceRefreshRecordDefinition,
  type CatalogSourceRefreshSnapshotDefinition,
} from "@/lib/catalog/source-refresh-sample";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const SELECTABLE_CATALOG_STATUSES = ["seeded", "confirmed"] as const;
const MATCHING_QUEUE = "matching";
const CATALOG_TYPEAHEAD_REINDEX_KIND = "catalog_typeahead_reindex";
const CATALOG_TYPEAHEAD_REINDEX_IDEMPOTENCY_KEY = "catalog-typeahead-reindex";
const PROOF_OWNER_USER_ID = "00000000-0000-4000-8000-000000064000";

type CatalogSourceRecordProjectionStatus =
  | "projected"
  | "quarantined"
  | "rejected";

interface SeededRefreshBaselineRecord {
  sourceRecordKey: string;
  sourceRecordId: string;
  catalogItemId: string;
  catalogCanonicalName: string;
}

interface SeededRefreshBaseline {
  sourceSnapshotId: string;
  recordsByKey: Map<string, SeededRefreshBaselineRecord>;
}

export interface CatalogSourceRefreshSummary {
  refreshEventId: string;
  sourceSlug: string;
  previousSnapshotId: string;
  refreshedSnapshotId: string;
  refreshedSourceVersion: string;
  refreshedSnapshotSha256: string;
  parserVersion: string;
  statusCounts: Record<CatalogSourceRefreshDiffStatus, number>;
  diffRows: CatalogSourceRefreshReadbackRow[];
  newCatalogItemId: string | null;
  changedCatalogItemId: string | null;
  reviewCatalogItemId: string | null;
  removedCatalogItemId: string | null;
  reindexQueued: boolean;
}

export interface CatalogSourceRefreshReadbackRow {
  refreshEventId: string;
  sourceSlug: string;
  refreshLabel: string;
  sourceRecordKey: string;
  diffStatus: CatalogSourceRefreshDiffStatus;
  projectionAction: string;
  safeDiff: JsonValue;
  reviewReason: string | null;
  reindexRequired: boolean;
  catalogItemId: string | null;
  catalogCanonicalName: string | null;
}

export interface CatalogSourceRefreshTypeaheadProof {
  catalogItemId: string;
  displayName: string;
  canonicalName: string;
  locale: string;
  status: string;
  source: string;
}

export interface CatalogSourceRefreshStableReadbackProof {
  catalogItemIdBeforeRefresh: string;
  catalogItemIdAfterRefresh: string;
  varietyText: string | null;
  varietyState: string;
  catalogCanonicalNameAfterRefresh: string | null;
  catalogSourceAfterRefresh: string | null;
}

export async function refreshCatalogSourceSample(
  executor: Kysely<Database>,
): Promise<CatalogSourceRefreshSummary> {
  return executor
    .transaction()
    .execute(async (trx) => executeCatalogSourceSampleRefresh(trx));
}

export async function readCatalogSourceRefreshDiff(
  executor: QueryExecutor,
  refreshEventId: string,
): Promise<CatalogSourceRefreshReadbackRow[]> {
  const rows = await buildCatalogSourceRefreshReadbackQuery(
    executor,
    refreshEventId,
  ).execute();

  return rows.map((row) => ({
    refreshEventId: row.refreshEventId,
    sourceSlug: row.sourceSlug,
    refreshLabel: row.refreshLabel,
    sourceRecordKey: row.sourceRecordKey,
    diffStatus: row.diffStatus as CatalogSourceRefreshDiffStatus,
    projectionAction: row.projectionAction,
    safeDiff: row.safeDiff,
    reviewReason: row.reviewReason,
    reindexRequired: Boolean(row.reindexRequired),
    catalogItemId: row.catalogItemId,
    catalogCanonicalName: row.catalogCanonicalName,
  }));
}

export async function readCatalogSourceRefreshTypeaheadProof(
  executor: QueryExecutor,
  query: string,
): Promise<CatalogSourceRefreshTypeaheadProof[]> {
  const rows = await buildCatalogSourceRefreshTypeaheadProofQuery(
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

export async function proveCatalogSourceRefreshStableUserReadback(
  executor: Kysely<Database>,
): Promise<CatalogSourceRefreshStableReadbackProof> {
  try {
    await executor.transaction().execute(async (trx) => {
      const baseline = await seedCatalogSourceRefreshBaseline(trx);
      const reviewCandidate = baseline.recordsByKey.get(
        "RegisterVarietis:24256011",
      );

      if (!reviewCandidate) {
        throw new Error("OVE-64 review-needed baseline record is missing.");
      }

      const space = await trx
        .insertInto("spaces")
        .values({
          owner_user_id: PROOF_OWNER_USER_ID,
          display_name: "OVE-64 source refresh proof",
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
          display_name: "Proof apricot refresh",
          catalog_item_id: reviewCandidate.catalogItemId,
          variety_text: reviewCandidate.catalogCanonicalName,
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
          title: "OVE-64 source refresh identity proof",
          body: "A source refresh that requires curator review must not rewrite user-linked catalog identity.",
          entry_scope: "object",
          entry_date: "2026-06-30",
          visibility: "private",
          client_mutation_id: "ove-64-source-refresh-stable-readback-proof",
        })
        .executeTakeFirstOrThrow();

      await executeCatalogSourceSampleRefresh(trx);

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

      throw new RollbackStableReadbackProof({
        catalogItemIdBeforeRefresh: reviewCandidate.catalogItemId,
        catalogItemIdAfterRefresh: readback.catalogItemId ?? "",
        varietyText: readback.varietyText,
        varietyState: readback.varietyState,
        catalogCanonicalNameAfterRefresh: readback.catalogCanonicalName,
        catalogSourceAfterRefresh: readback.catalogSource,
      });
    });
  } catch (error) {
    if (error instanceof RollbackStableReadbackProof) {
      return error.proof;
    }

    throw error;
  }

  throw new Error("Catalog source refresh stable readback proof did not run.");
}

export function buildUpsertCatalogSourceRefreshSnapshotQuery(
  executor: QueryExecutor,
  definition: CatalogSourceRefreshSnapshotDefinition,
) {
  const snapshotSha256 = catalogSourceRefreshSnapshotChecksum(definition);
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
      allowed_usage: jsonbParam(catalogSourceRefreshAllowedUsage(definition)),
      parser_version: CATALOG_SOURCE_REFRESH_PARSER_VERSION,
      payload_sha256: snapshotSha256,
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
          allowed_usage: jsonbParam(
            catalogSourceRefreshAllowedUsage(definition),
          ),
          parser_version: CATALOG_SOURCE_REFRESH_PARSER_VERSION,
          fetched_at: definition.fileProof.fetchedAt,
          verified_at: definition.fileProof.verifiedAt,
          status: "imported",
          updated_at: now,
        }),
    )
    .returning("id");
}

export function buildUpsertCatalogSourceRefreshRecordQuery(
  executor: QueryExecutor,
  input: {
    sourceSnapshotId: string;
    record: CatalogSourceRefreshRecordDefinition;
    projectionStatus: CatalogSourceRecordProjectionStatus;
  },
) {
  const now = new Date();

  return executor
    .insertInto("catalog_source_records")
    .values({
      source_snapshot_id: input.sourceSnapshotId,
      source_record_id: input.record.id,
      raw_payload: jsonbParam(input.record.rawPayload),
      raw_payload_sha256: catalogSourceRefreshPayloadChecksum(input.record),
      source_only_fields: jsonbParam(input.record.sourceOnlyFields),
      allowed_projection: jsonbParam(
        catalogSourceRefreshAllowedProjectionJson(input.record),
      ),
      projection_status: input.projectionStatus,
    })
    .onConflict((oc) =>
      oc.columns(["source_snapshot_id", "source_record_id"]).doUpdateSet({
        raw_payload: jsonbParam(input.record.rawPayload),
        raw_payload_sha256: catalogSourceRefreshPayloadChecksum(input.record),
        source_only_fields: jsonbParam(input.record.sourceOnlyFields),
        allowed_projection: jsonbParam(
          catalogSourceRefreshAllowedProjectionJson(input.record),
        ),
        projection_status: input.projectionStatus,
        updated_at: now,
      }),
    )
    .returning("id");
}

export function buildUpsertCatalogSourceRefreshCatalogItemQuery(
  executor: QueryExecutor,
  projection: CatalogSourceRefreshProjection,
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

export function buildUpsertCatalogSourceRefreshCatalogNameQuery(
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
    )
    .returning("id");
}

export function buildInsertCatalogSourceRefreshLinkQuery(
  executor: QueryExecutor,
  input: {
    catalogItemId: string;
    sourceRecordId: string;
    sourceSlug: string;
    sourceRecordKey: string;
  },
) {
  return executor
    .insertInto("catalog_source_links")
    .values({
      catalog_item_id: input.catalogItemId,
      source_record_id: input.sourceRecordId,
      source_slug: input.sourceSlug,
      source_record_key: input.sourceRecordKey,
      projection_kind: "canonical_item",
    })
    .onConflict((oc) =>
      oc.columns(["catalog_item_id", "source_record_id"]).doNothing(),
    );
}

export function buildEnqueueCatalogSourceRefreshTypeaheadReindexJobQuery(
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

export function buildUpsertCatalogSourceRefreshEventQuery(
  executor: QueryExecutor,
  input: {
    sourceSlug: string;
    previousSnapshotId: string;
    refreshedSnapshotId: string;
    refreshLabel: string;
    refreshedSnapshotSha256: string;
    summary: JsonValue;
  },
) {
  const now = new Date();

  return executor
    .insertInto("catalog_source_refresh_events")
    .values({
      source_slug: input.sourceSlug,
      previous_snapshot_id: input.previousSnapshotId,
      refreshed_snapshot_id: input.refreshedSnapshotId,
      refresh_label: input.refreshLabel,
      payload_sha256: input.refreshedSnapshotSha256,
      summary: jsonbParam(input.summary),
    })
    .onConflict((oc) =>
      oc.columns(["source_slug", "refreshed_snapshot_id"]).doUpdateSet({
        previous_snapshot_id: input.previousSnapshotId,
        refresh_label: input.refreshLabel,
        payload_sha256: input.refreshedSnapshotSha256,
        summary: jsonbParam(input.summary),
        updated_at: now,
      }),
    )
    .returning("id");
}

export function buildUpsertCatalogSourceRefreshRecordDiffQuery(
  executor: QueryExecutor,
  input: {
    refreshEventId: string;
    planRow: CatalogSourceRefreshPlanRow;
    previousSourceRecordId: string | null;
    refreshedSourceRecordId: string | null;
    catalogItemId: string | null;
  },
) {
  const now = new Date();

  return executor
    .insertInto("catalog_source_refresh_records")
    .values({
      refresh_event_id: input.refreshEventId,
      source_record_key: input.planRow.sourceRecordKey,
      previous_source_record_id: input.previousSourceRecordId,
      refreshed_source_record_id: input.refreshedSourceRecordId,
      catalog_item_id: input.catalogItemId,
      diff_status: input.planRow.diffStatus,
      projection_action: input.planRow.projectionAction,
      safe_diff: jsonbParam(input.planRow.safeDiff),
      review_reason: input.planRow.reviewReason,
      reindex_required: input.planRow.reindexRequired,
    })
    .onConflict((oc) =>
      oc.columns(["refresh_event_id", "source_record_key"]).doUpdateSet({
        previous_source_record_id: input.previousSourceRecordId,
        refreshed_source_record_id: input.refreshedSourceRecordId,
        catalog_item_id: input.catalogItemId,
        diff_status: input.planRow.diffStatus,
        projection_action: input.planRow.projectionAction,
        safe_diff: jsonbParam(input.planRow.safeDiff),
        review_reason: input.planRow.reviewReason,
        reindex_required: input.planRow.reindexRequired,
        updated_at: now,
      }),
    )
    .returning("id");
}

export function buildCatalogSourceRefreshReadbackQuery(
  executor: QueryExecutor,
  refreshEventId: string,
) {
  return executor
    .selectFrom("catalog_source_refresh_records")
    .innerJoin(
      "catalog_source_refresh_events",
      "catalog_source_refresh_events.id",
      "catalog_source_refresh_records.refresh_event_id",
    )
    .leftJoin(
      "catalog_items",
      "catalog_items.id",
      "catalog_source_refresh_records.catalog_item_id",
    )
    .select([
      "catalog_source_refresh_events.id as refreshEventId",
      "catalog_source_refresh_events.source_slug as sourceSlug",
      "catalog_source_refresh_events.refresh_label as refreshLabel",
      "catalog_source_refresh_records.source_record_key as sourceRecordKey",
      "catalog_source_refresh_records.diff_status as diffStatus",
      "catalog_source_refresh_records.projection_action as projectionAction",
      "catalog_source_refresh_records.safe_diff as safeDiff",
      "catalog_source_refresh_records.review_reason as reviewReason",
      "catalog_source_refresh_records.reindex_required as reindexRequired",
      "catalog_items.id as catalogItemId",
      "catalog_items.canonical_name as catalogCanonicalName",
    ])
    .where("catalog_source_refresh_events.id", "=", refreshEventId)
    .orderBy(
      sql<number>`case ${sql.ref("catalog_source_refresh_records.diff_status")}
        when 'new' then 0
        when 'changed' then 1
        when 'review_needed' then 2
        when 'projection_blocked' then 3
        when 'parser_reject' then 4
        when 'removed_upstream' then 5
        when 'unchanged' then 6
        else 7
      end`,
      "asc",
    )
    .orderBy("catalog_source_refresh_records.source_record_key", "asc");
}

export function buildCatalogSourceRefreshTypeaheadProofQuery(
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
    .where("catalog_items.source", "=", "ua_state_register")
    .where(
      sql<boolean>`lower(${sql.ref("catalog_item_names.display_name")}) like ${pattern}`,
    )
    .orderBy("catalog_item_names.is_primary", "desc")
    .orderBy("catalog_item_names.display_name", "asc")
    .limit(8);
}

async function executeCatalogSourceSampleRefresh(
  executor: QueryExecutor,
): Promise<CatalogSourceRefreshSummary> {
  const baselineDefinition = catalogSourceRefreshBaselineSnapshotDefinition();
  const refreshedDefinition = catalogSourceRefreshIncomingSnapshotDefinition();
  const planRows = planCatalogSourceRefreshDiff(
    baselineDefinition.records,
    refreshedDefinition.records,
  );
  const statusCounts = summarizeCatalogSourceRefreshPlan(planRows);
  const refreshedSnapshotSha256 =
    catalogSourceRefreshSnapshotChecksum(refreshedDefinition);
  const baseline = await seedCatalogSourceRefreshBaseline(executor);
  const refreshedSnapshot = await buildUpsertCatalogSourceRefreshSnapshotQuery(
    executor,
    refreshedDefinition,
  ).executeTakeFirstOrThrow();
  const incomingByKey = new Map(
    refreshedDefinition.records.map((record) => [record.id, record]),
  );
  const refreshedRecordIdsByKey = new Map<string, string>();
  const catalogItemIdsByKey = new Map<string, string>();
  let reindexQueued = false;

  for (const planRow of planRows) {
    const incoming = incomingByKey.get(planRow.sourceRecordKey);
    if (!incoming) continue;

    const sourceRecord = await buildUpsertCatalogSourceRefreshRecordQuery(
      executor,
      {
        sourceSnapshotId: refreshedSnapshot.id,
        record: incoming,
        projectionStatus: projectionStatusForPlanRow(planRow),
      },
    ).executeTakeFirstOrThrow();
    refreshedRecordIdsByKey.set(planRow.sourceRecordKey, sourceRecord.id);

    if (planRow.diffStatus === "new" && incoming.projection) {
      const catalogItem = await projectCatalogItemAndNames(
        executor,
        incoming.projection,
      );
      await buildInsertCatalogSourceRefreshLinkQuery(executor, {
        catalogItemId: catalogItem.id,
        sourceRecordId: sourceRecord.id,
        sourceSlug: refreshedDefinition.source.slug,
        sourceRecordKey: incoming.id,
      }).execute();
      catalogItemIdsByKey.set(planRow.sourceRecordKey, catalogItem.id);
      reindexQueued = true;
      continue;
    }

    const existingCatalogItem =
      baseline.recordsByKey.get(planRow.sourceRecordKey) ?? null;

    if (
      existingCatalogItem &&
      ["unchanged", "changed", "review_needed"].includes(planRow.diffStatus)
    ) {
      if (planRow.diffStatus === "changed" && incoming.projection) {
        for (const alias of incoming.projection.aliases) {
          await buildUpsertCatalogSourceRefreshCatalogNameQuery(executor, {
            catalogItemId: existingCatalogItem.catalogItemId,
            ...alias,
          }).execute();
        }
        reindexQueued = true;
      }

      await buildInsertCatalogSourceRefreshLinkQuery(executor, {
        catalogItemId: existingCatalogItem.catalogItemId,
        sourceRecordId: sourceRecord.id,
        sourceSlug: refreshedDefinition.source.slug,
        sourceRecordKey: incoming.id,
      }).execute();
      catalogItemIdsByKey.set(
        planRow.sourceRecordKey,
        existingCatalogItem.catalogItemId,
      );
    }
  }

  for (const planRow of planRows) {
    if (planRow.diffStatus !== "removed_upstream") continue;
    const existingCatalogItem =
      baseline.recordsByKey.get(planRow.sourceRecordKey) ?? null;
    if (existingCatalogItem) {
      catalogItemIdsByKey.set(
        planRow.sourceRecordKey,
        existingCatalogItem.catalogItemId,
      );
    }
  }

  if (reindexQueued) {
    await buildEnqueueCatalogSourceRefreshTypeaheadReindexJobQuery(
      executor,
    ).executeTakeFirstOrThrow();
  }

  const event = await buildUpsertCatalogSourceRefreshEventQuery(executor, {
    sourceSlug: refreshedDefinition.source.slug,
    previousSnapshotId: baseline.sourceSnapshotId,
    refreshedSnapshotId: refreshedSnapshot.id,
    refreshLabel: `${baselineDefinition.source.version} -> ${refreshedDefinition.source.version}`,
    refreshedSnapshotSha256,
    summary: statusCounts,
  }).executeTakeFirstOrThrow();

  for (const planRow of planRows) {
    await buildUpsertCatalogSourceRefreshRecordDiffQuery(executor, {
      refreshEventId: event.id,
      planRow,
      previousSourceRecordId:
        baseline.recordsByKey.get(planRow.sourceRecordKey)?.sourceRecordId ??
        null,
      refreshedSourceRecordId:
        refreshedRecordIdsByKey.get(planRow.sourceRecordKey) ?? null,
      catalogItemId: catalogItemIdsByKey.get(planRow.sourceRecordKey) ?? null,
    }).executeTakeFirstOrThrow();
  }

  const diffRows = await readCatalogSourceRefreshDiff(executor, event.id);

  return {
    refreshEventId: event.id,
    sourceSlug: refreshedDefinition.source.slug,
    previousSnapshotId: baseline.sourceSnapshotId,
    refreshedSnapshotId: refreshedSnapshot.id,
    refreshedSourceVersion: refreshedDefinition.source.version,
    refreshedSnapshotSha256,
    parserVersion: CATALOG_SOURCE_REFRESH_PARSER_VERSION,
    statusCounts,
    diffRows,
    newCatalogItemId:
      catalogItemIdsByKey.get("RegisterVarietis:24256013") ?? null,
    changedCatalogItemId:
      catalogItemIdsByKey.get("RegisterVarietis:24256010") ?? null,
    reviewCatalogItemId:
      catalogItemIdsByKey.get("RegisterVarietis:24256011") ?? null,
    removedCatalogItemId:
      catalogItemIdsByKey.get("RegisterVarietis:24256012") ?? null,
    reindexQueued,
  };
}

async function seedCatalogSourceRefreshBaseline(
  executor: QueryExecutor,
): Promise<SeededRefreshBaseline> {
  const definition = catalogSourceRefreshBaselineSnapshotDefinition();
  const sourceSnapshot = await buildUpsertCatalogSourceRefreshSnapshotQuery(
    executor,
    definition,
  ).executeTakeFirstOrThrow();
  const recordsByKey = new Map<string, SeededRefreshBaselineRecord>();

  for (const record of definition.records) {
    if (!record.projection) {
      throw new Error("OVE-64 baseline records must have safe projections.");
    }

    const sourceRecord = await buildUpsertCatalogSourceRefreshRecordQuery(
      executor,
      {
        sourceSnapshotId: sourceSnapshot.id,
        record,
        projectionStatus: "projected",
      },
    ).executeTakeFirstOrThrow();
    const catalogItem = await projectCatalogItemAndNames(
      executor,
      record.projection,
    );

    await buildInsertCatalogSourceRefreshLinkQuery(executor, {
      catalogItemId: catalogItem.id,
      sourceRecordId: sourceRecord.id,
      sourceSlug: definition.source.slug,
      sourceRecordKey: record.id,
    }).execute();

    recordsByKey.set(record.id, {
      sourceRecordKey: record.id,
      sourceRecordId: sourceRecord.id,
      catalogItemId: catalogItem.id,
      catalogCanonicalName: catalogItem.canonicalName,
    });
  }

  return {
    sourceSnapshotId: sourceSnapshot.id,
    recordsByKey,
  };
}

async function projectCatalogItemAndNames(
  executor: QueryExecutor,
  projection: CatalogSourceRefreshProjection,
) {
  const catalogItem = await buildUpsertCatalogSourceRefreshCatalogItemQuery(
    executor,
    projection,
  ).executeTakeFirstOrThrow();

  for (const alias of projection.aliases) {
    await buildUpsertCatalogSourceRefreshCatalogNameQuery(executor, {
      catalogItemId: catalogItem.id,
      ...alias,
    }).execute();
  }

  return catalogItem;
}

function projectionStatusForPlanRow(
  planRow: CatalogSourceRefreshPlanRow,
): CatalogSourceRecordProjectionStatus {
  if (planRow.diffStatus === "parser_reject") return "rejected";
  if (
    planRow.diffStatus === "review_needed" ||
    planRow.diffStatus === "projection_blocked"
  ) {
    return "quarantined";
  }

  return "projected";
}

class RollbackStableReadbackProof extends Error {
  constructor(readonly proof: CatalogSourceRefreshStableReadbackProof) {
    super("Rollback OVE-64 source refresh stable readback proof");
  }
}

function jsonbParam(value: JsonValue) {
  return sql<JsonValue>`${JSON.stringify(value)}::jsonb`;
}
