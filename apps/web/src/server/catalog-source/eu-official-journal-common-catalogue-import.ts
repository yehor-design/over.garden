import { sql, type Kysely, type Transaction } from "kysely";

import type { Database, JsonValue } from "@/db/schema";
import {
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE,
  euOfficialJournalCommonCatalogueAllowedUsage,
  euOfficialJournalCommonCataloguePayloadChecksum,
  euOfficialJournalCommonCatalogueSnapshotChecksum,
  type EuOfficialJournalCommonCatalogueImportDefinition,
  type EuOfficialJournalCommonCatalogueProjection,
  type EuOfficialJournalCommonCatalogueSnapshotDefinition,
  type EuOfficialJournalCommonCatalogueSourceRecordDefinition,
} from "@/lib/catalog/eu-official-journal-common-catalogue";
import { assertCatalogSourceProductProjectionAllowed } from "./source-projection-guard";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const SELECTABLE_CATALOG_STATUSES = ["seeded", "confirmed"] as const;
const MATCHING_QUEUE = "matching";
const CATALOG_TYPEAHEAD_REINDEX_KIND = "catalog_typeahead_reindex";
const CATALOG_TYPEAHEAD_REINDEX_IDEMPOTENCY_KEY = "catalog-typeahead-reindex";

export interface EuOfficialJournalCommonCatalogueImportSummary {
  sourceSlug: typeof EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug;
  sourceSnapshotsImported: number;
  sourceRecordsImported: number;
  projectedConcepts: number;
  quarantinedRecords: number;
  rejectedRecords: number;
  aliasesProjected: number;
  parserVersion: string;
  extractionVersion: string;
  reindexQueued: boolean;
  sampleProjectedCatalogItemId: string | null;
  sampleProjectedCanonicalName: string | null;
  sampleProjectedSourceUrl: string | null;
  sampleProjectedSourceVersion: string | null;
  sampleProjectedPublicationDate: string | null;
}

export interface EuOfficialJournalCommonCatalogueTypeaheadProof {
  catalogItemId: string;
  displayName: string;
  canonicalName: string;
  catalogKind: string;
  locale: string;
  status: string;
  source: string;
}

export interface EuOfficialJournalCommonCatalogueSourceProvenanceProof {
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

export interface EuOfficialJournalCommonCatalogueBlockedRecordProof {
  sourceRecordKey: string;
  projectionStatus: string;
  allowedProjection: JsonValue;
}

export async function importEuOfficialJournalCommonCatalogue(
  executor: Kysely<Database>,
  definition: EuOfficialJournalCommonCatalogueImportDefinition,
): Promise<EuOfficialJournalCommonCatalogueImportSummary> {
  return executor.transaction().execute(async (trx) => {
    let sourceRecordsImported = 0;
    let projectedConcepts = 0;
    let quarantinedRecords = 0;
    let rejectedRecords = 0;
    let aliasesProjected = 0;
    let sampleProjectedCatalogItemId: string | null = null;
    let sampleProjectedCanonicalName: string | null = null;
    let sampleProjectedSourceUrl: string | null = null;
    let sampleProjectedSourceVersion: string | null = null;
    let sampleProjectedPublicationDate: string | null = null;

    for (const snapshotDefinition of definition.snapshots) {
      const snapshotSha256 =
        euOfficialJournalCommonCatalogueSnapshotChecksum(snapshotDefinition);
      const snapshot =
        await buildUpsertEuOfficialJournalCommonCatalogueSnapshotQuery(trx, {
          snapshot: snapshotDefinition,
          payloadSha256: snapshotSha256,
        }).executeTakeFirstOrThrow();

      for (const recordDefinition of snapshotDefinition.records) {
        const rawPayloadSha256 =
          euOfficialJournalCommonCataloguePayloadChecksum(recordDefinition);
        const sourceRecord =
          await buildUpsertEuOfficialJournalCommonCatalogueRecordQuery(trx, {
            record: recordDefinition,
            sourceSnapshotId: snapshot.id,
            rawPayloadSha256,
          }).executeTakeFirstOrThrow();
        sourceRecordsImported += 1;

        if (recordDefinition.projectionStatus === "quarantined") {
          quarantinedRecords += 1;
          continue;
        }
        if (recordDefinition.projectionStatus === "rejected") {
          rejectedRecords += 1;
          continue;
        }
        if (!recordDefinition.projection) {
          quarantinedRecords += 1;
          continue;
        }

        const catalogItem =
          await buildUpsertEuOfficialJournalCommonCatalogueCatalogItemQuery(
            trx,
            recordDefinition.projection,
          ).executeTakeFirstOrThrow();

        for (const alias of recordDefinition.projection.aliases) {
          await buildUpsertEuOfficialJournalCommonCatalogueCatalogNameQuery(
            trx,
            {
              catalogItemId: catalogItem.id,
              projection: recordDefinition.projection,
              ...alias,
            },
          ).execute();
          aliasesProjected += 1;
        }

        await buildInsertEuOfficialJournalCommonCatalogueSourceLinkQuery(trx, {
          catalogItemId: catalogItem.id,
          sourceRecordId: sourceRecord.id,
          projection: recordDefinition.projection,
        }).execute();

        projectedConcepts += 1;
        sampleProjectedCatalogItemId ??= catalogItem.id;
        sampleProjectedCanonicalName ??= catalogItem.canonicalName;
        sampleProjectedSourceUrl ??= snapshotDefinition.source.url;
        sampleProjectedSourceVersion ??= snapshotDefinition.source.version;
        sampleProjectedPublicationDate ??=
          snapshotDefinition.source.publicationDate;
      }
    }

    const reindexJob =
      projectedConcepts > 0
        ? await buildEnqueueEuOfficialJournalCommonCatalogueTypeaheadReindexJobQuery(
            trx,
          ).executeTakeFirstOrThrow()
        : null;

    return {
      sourceSlug: definition.sourceSlug,
      sourceSnapshotsImported: definition.snapshots.length,
      sourceRecordsImported,
      projectedConcepts,
      quarantinedRecords,
      rejectedRecords,
      aliasesProjected,
      parserVersion: definition.parserVersion,
      extractionVersion: definition.extractionVersion,
      reindexQueued: Boolean(reindexJob?.id),
      sampleProjectedCatalogItemId,
      sampleProjectedCanonicalName,
      sampleProjectedSourceUrl,
      sampleProjectedSourceVersion,
      sampleProjectedPublicationDate,
    };
  });
}

export async function readEuOfficialJournalCommonCatalogueTypeaheadProof(
  executor: QueryExecutor,
  query: string,
): Promise<EuOfficialJournalCommonCatalogueTypeaheadProof[]> {
  const rows = await buildEuOfficialJournalCommonCatalogueTypeaheadProofQuery(
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

export async function readEuOfficialJournalCommonCatalogueSourceProvenanceProof(
  executor: QueryExecutor,
  catalogItemId: string,
): Promise<EuOfficialJournalCommonCatalogueSourceProvenanceProof | null> {
  const row =
    await buildEuOfficialJournalCommonCatalogueSourceProvenanceProofQuery(
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

export async function readEuOfficialJournalCommonCatalogueBlockedRecordProof(
  executor: QueryExecutor,
  sourceRecordKey: string,
): Promise<EuOfficialJournalCommonCatalogueBlockedRecordProof | null> {
  const row =
    await buildEuOfficialJournalCommonCatalogueBlockedRecordProofQuery(
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

export function buildUpsertEuOfficialJournalCommonCatalogueSnapshotQuery(
  executor: QueryExecutor,
  input: {
    snapshot: EuOfficialJournalCommonCatalogueSnapshotDefinition;
    payloadSha256: string;
  },
) {
  const now = new Date();
  const source = input.snapshot.source;

  return executor
    .insertInto("catalog_source_snapshots")
    .values({
      source_slug: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
      source_name: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.name,
      source_category: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.category,
      source_version: source.version,
      source_url: source.url,
      license: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.license,
      license_url: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.licenseUrl,
      attribution_required:
        EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.attributionRequired,
      attribution_text:
        EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.attributionText,
      allowed_usage: jsonbParam(euOfficialJournalCommonCatalogueAllowedUsage()),
      parser_version:
        input.snapshot.records[0]?.projection?.provenance.parserVersion ??
        "ove102-eu-oj-formex-parser-v1",
      payload_sha256: input.payloadSha256,
      fetched_at: source.fetchedAt,
      verified_at: source.verifiedAt,
      status: "imported",
    })
    .onConflict((oc) =>
      oc
        .columns(["source_slug", "source_version", "payload_sha256"])
        .doUpdateSet({
          source_name: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.name,
          source_category: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.category,
          source_url: source.url,
          license: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.license,
          license_url: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.licenseUrl,
          attribution_required:
            EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.attributionRequired,
          attribution_text:
            EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.attributionText,
          allowed_usage: jsonbParam(
            euOfficialJournalCommonCatalogueAllowedUsage(),
          ),
          parser_version:
            input.snapshot.records[0]?.projection?.provenance.parserVersion ??
            "ove102-eu-oj-formex-parser-v1",
          fetched_at: source.fetchedAt,
          verified_at: source.verifiedAt,
          status: "imported",
          updated_at: now,
        }),
    )
    .returning("id");
}

export function buildUpsertEuOfficialJournalCommonCatalogueRecordQuery(
  executor: QueryExecutor,
  input: {
    record: EuOfficialJournalCommonCatalogueSourceRecordDefinition;
    sourceSnapshotId: string;
    rawPayloadSha256: string;
  },
) {
  const now = new Date();
  const record = input.record;

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

export function buildUpsertEuOfficialJournalCommonCatalogueCatalogItemQuery(
  executor: QueryExecutor,
  projection: EuOfficialJournalCommonCatalogueProjection,
) {
  assertEuOfficialJournalCommonCatalogueProjectionAllowed(
    projection,
    "catalog_items",
  );

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

export function buildUpsertEuOfficialJournalCommonCatalogueCatalogNameQuery(
  executor: QueryExecutor,
  input: {
    catalogItemId: string;
    projection: EuOfficialJournalCommonCatalogueProjection;
    displayName: string;
    normalizedName: string;
    locale: string;
    isPrimary: boolean;
  },
) {
  assertEuOfficialJournalCommonCatalogueProjectionAllowed(
    input.projection,
    "catalog_item_names",
  );

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

export function buildInsertEuOfficialJournalCommonCatalogueSourceLinkQuery(
  executor: QueryExecutor,
  input: {
    catalogItemId: string;
    sourceRecordId: string;
    projection: EuOfficialJournalCommonCatalogueProjection;
  },
) {
  assertEuOfficialJournalCommonCatalogueProjectionAllowed(
    input.projection,
    "catalog_source_links",
  );

  return executor
    .insertInto("catalog_source_links")
    .values({
      catalog_item_id: input.catalogItemId,
      source_record_id: input.sourceRecordId,
      source_slug: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
      source_record_key: input.projection.sourceId,
      projection_kind: "canonical_item",
    })
    .onConflict((oc) =>
      oc.columns(["catalog_item_id", "source_record_id"]).doNothing(),
    );
}

export function buildEnqueueEuOfficialJournalCommonCatalogueTypeaheadReindexJobQuery(
  executor: QueryExecutor,
) {
  const now = new Date();
  const payload = {
    kind: CATALOG_TYPEAHEAD_REINDEX_KIND,
  } satisfies JsonValue;

  return executor
    .insertInto("job_queue")
    .values({
      queue_name: MATCHING_QUEUE,
      payload,
      status: "pending",
      available_at: now,
      locked_at: null,
      locked_by: null,
      last_error: null,
      idempotency_key: CATALOG_TYPEAHEAD_REINDEX_IDEMPOTENCY_KEY,
    })
    .onConflict((oc) =>
      oc
        .column("idempotency_key")
        .where("idempotency_key", "is not", null)
        .doUpdateSet({
          payload,
          status: "pending",
          available_at: now,
          locked_at: null,
          locked_by: null,
          last_error: null,
          updated_at: now,
        }),
    )
    .returning("id");
}

export function buildEuOfficialJournalCommonCatalogueTypeaheadProofQuery(
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
    .where(
      "catalog_items.source",
      "=",
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
    )
    .where(
      sql<boolean>`lower(${sql.ref("catalog_item_names.display_name")}) like ${pattern}`,
    )
    .orderBy("catalog_item_names.is_primary", "desc")
    .orderBy("catalog_item_names.display_name", "asc")
    .limit(8);
}

export function buildEuOfficialJournalCommonCatalogueSourceProvenanceProofQuery(
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
    .where(
      "catalog_items.source",
      "=",
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
    )
    .where(
      "catalog_source_links.source_slug",
      "=",
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
    )
    .where("catalog_source_links.projection_kind", "=", "canonical_item")
    .limit(1);
}

export function buildEuOfficialJournalCommonCatalogueBlockedRecordProofQuery(
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
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
    )
    .where("catalog_source_records.source_record_id", "=", sourceRecordKey)
    .where("catalog_source_records.projection_status", "!=", "projected")
    .limit(1);
}

function assertEuOfficialJournalCommonCatalogueProjectionAllowed(
  projection: EuOfficialJournalCommonCatalogueProjection,
  productSurface: Parameters<
    typeof assertCatalogSourceProductProjectionAllowed
  >[0]["productSurface"],
) {
  assertCatalogSourceProductProjectionAllowed({
    sourceSlug: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
    sourceVersion: projection.provenance.sourceVersion,
    sourceRecordKey: projection.sourceId,
    sourceUrl: projection.provenance.sourceUrl,
    productSurface,
    productSource: projection.source,
    productSourceId: projection.sourceId,
  });
}

function jsonbParam(value: JsonValue) {
  return sql<JsonValue>`${JSON.stringify(value)}::jsonb`;
}
