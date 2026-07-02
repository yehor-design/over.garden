import { sql, type Kysely, type Transaction } from "kysely";

import type { Database, JsonValue } from "@/db/schema";
import {
  UA_STATE_REGISTER_SOURCE,
  UA_STATE_REGISTER_VARIETY_PARSER_VERSION,
  uaStateRegisterAllowedProjection,
  uaStateRegisterAllowedProjectionJson,
  uaStateRegisterAllowedUsage,
  uaStateRegisterFixtureDefinition,
  uaStateRegisterPayloadChecksum,
  uaStateRegisterRawPayload,
  uaStateRegisterSnapshotChecksum,
  uaStateRegisterSourceOnlyFields,
  type UaStateRegisterFullImportBuildResult,
  type UaStateRegisterVarietyImportDefinition,
  type UaStateRegisterVarietyProjection,
} from "@/lib/catalog/ua-state-register-variety";
import { assertCatalogSourceProductProjectionAllowed } from "./source-projection-guard";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const SELECTABLE_CATALOG_STATUSES = ["seeded", "confirmed"] as const;
const MATCHING_QUEUE = "matching";
const CATALOG_TYPEAHEAD_REINDEX_KIND = "catalog_typeahead_reindex";
const CATALOG_TYPEAHEAD_REINDEX_IDEMPOTENCY_KEY = "catalog-typeahead-reindex";
const PROOF_OWNER_USER_ID = "00000000-0000-4000-8000-000000057000";
const UA_STATE_REGISTER_BATCH_SIZE = 500;

export interface UaStateRegisterImportSummary {
  sourceSnapshotId: string;
  sourceRecordId: string;
  catalogItemId: string;
  catalogKind: "plant_variety";
  sourceSlug: string;
  sourceVersion: string;
  sourceRecordKey: string;
  sourceFileSha256: string;
  sourceFileRowCount: number;
  rawPayloadSha256: string;
  parserVersion: string;
  canonicalName: string;
  transliterationName: string | null;
  publicSlug: string;
  aliasesProjected: number;
  reindexQueued: boolean;
}

export interface UaStateRegisterFullImportSummary extends UaStateRegisterImportSummary {
  varieties: UaStateRegisterImportSummary[];
  importedVarieties: number;
  sourceRowsImported: number;
  audit: UaStateRegisterFullImportBuildResult["audit"];
}

export interface UaStateRegisterTypeaheadProof {
  catalogItemId: string;
  displayName: string;
  canonicalName: string;
  locale: string;
  status: string;
  source: string;
}

export interface UaStateRegisterGardenReadbackProof {
  catalogItemId: string;
  varietyText: string | null;
  varietyState: string;
  catalogCanonicalName: string | null;
  catalogSource: string | null;
}

export interface UaStateRegisterSourceProvenanceProof {
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

export async function importUaStateRegisterVariety(
  executor: Kysely<Database>,
  definition = uaStateRegisterFixtureDefinition(),
): Promise<UaStateRegisterImportSummary> {
  const imported = await importUaStateRegisterVarieties(executor, {
    definitions: [definition],
    audit: {
      sourceRowsRead: 1,
      rawRowsCaptured: 1,
      productConceptsProjected: 1,
      aliasesProjected: definition.projection.aliases.length,
      reviewNeededRows: 0,
      rejectedRows: 0,
      duplicateCanonicalNameClusters: 0,
    },
  });

  const first = imported.varieties[0];
  if (!first) {
    throw new Error("UA State Register import returned no variety summary.");
  }

  return first;
}

export async function importUaStateRegisterVarieties(
  executor: Kysely<Database>,
  input: UaStateRegisterFullImportBuildResult,
): Promise<UaStateRegisterFullImportSummary> {
  if (input.definitions.length === 0) {
    throw new Error("UA State Register full import has no accepted rows.");
  }

  return executor.transaction().execute(async (trx) => {
    const firstDefinition = input.definitions[0];
    const sourceFileSha256 = uaStateRegisterSnapshotChecksum(firstDefinition);

    const snapshot = await buildUpsertUaStateRegisterSnapshotQuery(trx, {
      definition: firstDefinition,
      payloadSha256: sourceFileSha256,
    }).executeTakeFirstOrThrow();

    const records = await upsertUaStateRegisterRecordsInChunks(
      trx,
      input.definitions,
      snapshot.id,
    );
    const catalogItems = await upsertUaStateRegisterCatalogItemsInChunks(
      trx,
      input.definitions,
    );
    const recordBySourceRecordId = new Map(
      records.map((record) => [record.sourceRecordId, record]),
    );
    const catalogItemBySourceId = new Map(
      catalogItems.map((item) => [item.sourceId, item]),
    );

    await upsertUaStateRegisterCatalogNamesInChunks(
      trx,
      input.definitions,
      catalogItemBySourceId,
    );
    await insertUaStateRegisterSourceLinksInChunks(
      trx,
      input.definitions,
      recordBySourceRecordId,
      catalogItemBySourceId,
    );

    const varieties = input.definitions.map((definition) => {
      const projection = uaStateRegisterAllowedProjection(definition);
      const rawPayloadSha256 = uaStateRegisterPayloadChecksum(definition);
      const record = recordBySourceRecordId.get(definition.record.id);
      const catalogItem = catalogItemBySourceId.get(projection.sourceId);

      if (!record) {
        throw new Error(
          `UA State Register record ${definition.record.id} was not returned by batch upsert.`,
        );
      }
      if (!catalogItem) {
        throw new Error(
          `UA State Register catalog item ${projection.sourceId} was not returned by batch upsert.`,
        );
      }

      const transliteration =
        projection.aliases.find(
          (alias) =>
            alias.displayName !== projection.canonicalName &&
            /^[A-Za-z0-9`' -]+$/.test(alias.displayName),
        )?.displayName ?? null;

      return {
        sourceSnapshotId: snapshot.id,
        sourceRecordId: record.id,
        catalogItemId: catalogItem.id,
        catalogKind: projection.catalogKind,
        sourceSlug: definition.source.slug,
        sourceVersion: definition.source.version,
        sourceRecordKey: definition.record.id,
        sourceFileSha256,
        sourceFileRowCount: definition.fileProof.rowCount,
        rawPayloadSha256,
        parserVersion: UA_STATE_REGISTER_VARIETY_PARSER_VERSION,
        canonicalName: catalogItem.canonicalName,
        transliterationName: transliteration,
        publicSlug: catalogItem.publicSlug ?? projection.publicSlug,
        aliasesProjected: projection.aliases.length,
        reindexQueued: false,
      };
    });

    const reindexJob =
      await buildEnqueueUaStateRegisterTypeaheadReindexJobQuery(
        trx,
      ).executeTakeFirstOrThrow();
    const reindexQueued = reindexJob.id.length > 0;
    const importedVarieties = varieties.map((summary) => ({
      ...summary,
      reindexQueued,
    }));
    const primary = importedVarieties[0];
    if (!primary) {
      throw new Error("UA State Register full import produced no summaries.");
    }

    return {
      ...primary,
      varieties: importedVarieties,
      importedVarieties: importedVarieties.length,
      sourceRowsImported: importedVarieties.length,
      audit: input.audit,
      reindexQueued,
    };
  });
}

export async function readUaStateRegisterTypeaheadProof(
  executor: QueryExecutor,
  query: string,
): Promise<UaStateRegisterTypeaheadProof[]> {
  const rows = await buildUaStateRegisterTypeaheadProofQuery(
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

export async function readUaStateRegisterSourceProvenanceProof(
  executor: QueryExecutor,
  catalogItemId: string,
): Promise<UaStateRegisterSourceProvenanceProof | null> {
  const row = await buildUaStateRegisterSourceProvenanceProofQuery(
    executor,
    catalogItemId,
  ).executeTakeFirst();

  if (!row) return null;

  return {
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
  };
}

export async function proveUaStateRegisterGardenReadback(
  executor: Kysely<Database>,
  catalogItemId: string,
  projection: UaStateRegisterVarietyProjection = uaStateRegisterAllowedProjection(),
): Promise<UaStateRegisterGardenReadbackProof> {
  try {
    await executor.transaction().execute(async (trx) => {
      const space = await trx
        .insertInto("spaces")
        .values({
          owner_user_id: PROOF_OWNER_USER_ID,
          display_name: "OVE-57 UA Register proof",
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
          title: "OVE-57 official variety proof",
          body: "Official UA State Register projection can be selected and read back without raw source fields.",
          entry_scope: "object",
          entry_date: "2026-06-29",
          visibility: "private",
          client_mutation_id: "ove-57-ua-register-official-variety-proof",
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

  throw new Error("UA State Register readback proof did not run.");
}

export function buildUpsertUaStateRegisterSnapshotQuery(
  executor: QueryExecutor,
  input: {
    definition?: UaStateRegisterVarietyImportDefinition;
    payloadSha256: string;
  },
) {
  const definition = input.definition ?? uaStateRegisterFixtureDefinition();
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
      allowed_usage: jsonbParam(uaStateRegisterAllowedUsage(definition)),
      parser_version: UA_STATE_REGISTER_VARIETY_PARSER_VERSION,
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
          allowed_usage: jsonbParam(uaStateRegisterAllowedUsage(definition)),
          parser_version: UA_STATE_REGISTER_VARIETY_PARSER_VERSION,
          fetched_at: definition.fileProof.fetchedAt,
          verified_at: definition.fileProof.verifiedAt,
          status: "imported",
          updated_at: now,
        }),
    )
    .returning("id");
}

export function buildUpsertUaStateRegisterRecordQuery(
  executor: QueryExecutor,
  input: {
    definition?: UaStateRegisterVarietyImportDefinition;
    sourceSnapshotId: string;
    rawPayloadSha256: string;
  },
) {
  const definition = input.definition ?? uaStateRegisterFixtureDefinition();
  const now = new Date();

  return executor
    .insertInto("catalog_source_records")
    .values({
      source_snapshot_id: input.sourceSnapshotId,
      source_record_id: definition.record.id,
      raw_payload: jsonbParam(uaStateRegisterRawPayload(definition)),
      raw_payload_sha256: input.rawPayloadSha256,
      source_only_fields: jsonbParam(
        uaStateRegisterSourceOnlyFields(definition),
      ),
      allowed_projection: jsonbParam(
        uaStateRegisterAllowedProjectionJson(definition),
      ),
      projection_status: "projected",
    })
    .onConflict((oc) =>
      oc.columns(["source_snapshot_id", "source_record_id"]).doUpdateSet({
        raw_payload: jsonbParam(uaStateRegisterRawPayload(definition)),
        raw_payload_sha256: input.rawPayloadSha256,
        source_only_fields: jsonbParam(
          uaStateRegisterSourceOnlyFields(definition),
        ),
        allowed_projection: jsonbParam(
          uaStateRegisterAllowedProjectionJson(definition),
        ),
        projection_status: "projected",
        updated_at: now,
      }),
    )
    .returning("id");
}

async function upsertUaStateRegisterRecordsInChunks(
  executor: QueryExecutor,
  definitions: UaStateRegisterVarietyImportDefinition[],
  sourceSnapshotId: string,
) {
  const rows: Array<{ id: string; sourceRecordId: string }> = [];
  const now = new Date();

  for (const chunk of chunkArray(definitions, UA_STATE_REGISTER_BATCH_SIZE)) {
    const result = await executor
      .insertInto("catalog_source_records")
      .values(
        chunk.map((definition) => ({
          source_snapshot_id: sourceSnapshotId,
          source_record_id: definition.record.id,
          raw_payload: jsonbParam(uaStateRegisterRawPayload(definition)),
          raw_payload_sha256: uaStateRegisterPayloadChecksum(definition),
          source_only_fields: jsonbParam(
            uaStateRegisterSourceOnlyFields(definition),
          ),
          allowed_projection: jsonbParam(
            uaStateRegisterAllowedProjectionJson(definition),
          ),
          projection_status: "projected" as const,
        })),
      )
      .onConflict((oc) =>
        oc.columns(["source_snapshot_id", "source_record_id"]).doUpdateSet({
          raw_payload: sql`excluded.raw_payload`,
          raw_payload_sha256: sql`excluded.raw_payload_sha256`,
          source_only_fields: sql`excluded.source_only_fields`,
          allowed_projection: sql`excluded.allowed_projection`,
          projection_status: sql`excluded.projection_status`,
          updated_at: now,
        }),
      )
      .returning(["id", "source_record_id as sourceRecordId"])
      .execute();

    rows.push(...result);
  }

  return rows;
}

export function buildUpsertUaStateRegisterCatalogItemQuery(
  executor: QueryExecutor,
  projection = uaStateRegisterAllowedProjection(),
) {
  assertCatalogSourceProductProjectionAllowed({
    sourceSlug: UA_STATE_REGISTER_SOURCE.slug,
    sourceVersion: UA_STATE_REGISTER_SOURCE.version,
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

async function upsertUaStateRegisterCatalogItemsInChunks(
  executor: QueryExecutor,
  definitions: UaStateRegisterVarietyImportDefinition[],
) {
  const rows: Array<{
    id: string;
    sourceId: string;
    canonicalName: string;
    publicSlug: string | null;
  }> = [];
  const now = new Date();

  for (const chunk of chunkArray(definitions, UA_STATE_REGISTER_BATCH_SIZE)) {
    const result = await executor
      .insertInto("catalog_items")
      .values(
        chunk.map((definition) => {
          const projection = uaStateRegisterAllowedProjection(definition);
          assertUaStateRegisterCatalogItemProjectionAllowed(projection);

          return {
            canonical_name: projection.canonicalName,
            normalized_name: projection.normalizedName,
            public_slug: projection.publicSlug,
            status: projection.status,
            source: projection.source,
            source_id: projection.sourceId,
            catalog_kind: projection.catalogKind,
            created_by_user_id: null,
            locale: projection.locale,
          };
        }),
      )
      .onConflict((oc) =>
        oc.columns(["source", "source_id"]).doUpdateSet({
          canonical_name: sql`excluded.canonical_name`,
          normalized_name: sql`excluded.normalized_name`,
          public_slug: sql`excluded.public_slug`,
          status: sql`excluded.status`,
          catalog_kind: sql`excluded.catalog_kind`,
          created_by_user_id: null,
          locale: sql`excluded.locale`,
          updated_at: now,
        }),
      )
      .returning([
        "id",
        "source_id as sourceId",
        "canonical_name as canonicalName",
        "public_slug as publicSlug",
      ])
      .$castTo<{
        id: string;
        sourceId: string;
        canonicalName: string;
        publicSlug: string | null;
      }>()
      .execute();

    rows.push(...result);
  }

  return rows;
}

export function buildUpsertUaStateRegisterCatalogNameQuery(
  executor: QueryExecutor,
  input: {
    catalogItemId: string;
    displayName: string;
    normalizedName: string;
    locale: string;
    isPrimary: boolean;
  },
) {
  assertCatalogSourceProductProjectionAllowed({
    sourceSlug: UA_STATE_REGISTER_SOURCE.slug,
    sourceVersion: UA_STATE_REGISTER_SOURCE.version,
    productSurface: "catalog_item_names",
    productSource: UA_STATE_REGISTER_SOURCE.slug.replaceAll("-", "_"),
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

async function upsertUaStateRegisterCatalogNamesInChunks(
  executor: QueryExecutor,
  definitions: UaStateRegisterVarietyImportDefinition[],
  catalogItemBySourceId: Map<
    string,
    { id: string; canonicalName: string; publicSlug: string | null }
  >,
) {
  assertUaStateRegisterCatalogNameProjectionAllowed();

  const values = definitions.flatMap((definition) => {
    const projection = uaStateRegisterAllowedProjection(definition);
    const catalogItem = catalogItemBySourceId.get(projection.sourceId);
    if (!catalogItem) {
      throw new Error(
        `UA State Register catalog item ${projection.sourceId} is missing before alias upsert.`,
      );
    }

    return projection.aliases.map((alias) => ({
      catalog_item_id: catalogItem.id,
      display_name: alias.displayName,
      normalized_name: alias.normalizedName,
      locale: alias.locale,
      is_primary: alias.isPrimary,
    }));
  });

  for (const chunk of chunkArray(values, UA_STATE_REGISTER_BATCH_SIZE)) {
    await executor
      .insertInto("catalog_item_names")
      .values(chunk)
      .onConflict((oc) =>
        oc
          .columns(["catalog_item_id", "normalized_name", "locale"])
          .doUpdateSet({
            display_name: sql`excluded.display_name`,
            is_primary: sql`excluded.is_primary`,
          }),
      )
      .execute();
  }
}

export function buildInsertUaStateRegisterSourceLinkQuery(
  executor: QueryExecutor,
  input: {
    definition?: UaStateRegisterVarietyImportDefinition;
    catalogItemId: string;
    sourceRecordId: string;
  },
) {
  const definition = input.definition ?? uaStateRegisterFixtureDefinition();

  return executor
    .insertInto("catalog_source_links")
    .values({
      catalog_item_id: input.catalogItemId,
      source_record_id: input.sourceRecordId,
      source_slug: definition.source.slug,
      source_record_key: definition.record.id,
      projection_kind: "canonical_item",
    })
    .onConflict((oc) =>
      oc.columns(["catalog_item_id", "source_record_id"]).doNothing(),
    );
}

async function insertUaStateRegisterSourceLinksInChunks(
  executor: QueryExecutor,
  definitions: UaStateRegisterVarietyImportDefinition[],
  recordBySourceRecordId: Map<string, { id: string; sourceRecordId: string }>,
  catalogItemBySourceId: Map<
    string,
    { id: string; canonicalName: string; publicSlug: string | null }
  >,
) {
  const values = definitions.map((definition) => {
    const projection = uaStateRegisterAllowedProjection(definition);
    const record = recordBySourceRecordId.get(definition.record.id);
    const catalogItem = catalogItemBySourceId.get(projection.sourceId);

    if (!record) {
      throw new Error(
        `UA State Register record ${definition.record.id} is missing before source-link insert.`,
      );
    }
    if (!catalogItem) {
      throw new Error(
        `UA State Register catalog item ${projection.sourceId} is missing before source-link insert.`,
      );
    }

    return {
      catalog_item_id: catalogItem.id,
      source_record_id: record.id,
      source_slug: definition.source.slug,
      source_record_key: definition.record.id,
      projection_kind: "canonical_item" as const,
    };
  });

  for (const chunk of chunkArray(values, UA_STATE_REGISTER_BATCH_SIZE)) {
    await executor
      .insertInto("catalog_source_links")
      .values(chunk)
      .onConflict((oc) =>
        oc.columns(["catalog_item_id", "source_record_id"]).doNothing(),
      )
      .execute();
  }
}

export function buildEnqueueUaStateRegisterTypeaheadReindexJobQuery(
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

export function buildUaStateRegisterTypeaheadProofQuery(
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

export function buildUaStateRegisterSourceProvenanceProofQuery(
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
    .where("catalog_items.source", "=", "ua_state_register")
    .where(
      "catalog_source_links.source_slug",
      "=",
      UA_STATE_REGISTER_SOURCE.slug,
    )
    .where("catalog_source_links.projection_kind", "=", "canonical_item")
    .limit(1);
}

class RollbackReadbackProof extends Error {
  constructor(readonly proof: UaStateRegisterGardenReadbackProof) {
    super("Rollback OVE-57 UA State Register readback proof");
  }
}

function jsonbParam(value: JsonValue) {
  return sql<JsonValue>`${JSON.stringify(value)}::jsonb`;
}

function assertUaStateRegisterCatalogItemProjectionAllowed(
  projection: UaStateRegisterVarietyProjection,
) {
  assertCatalogSourceProductProjectionAllowed({
    sourceSlug: UA_STATE_REGISTER_SOURCE.slug,
    sourceVersion: UA_STATE_REGISTER_SOURCE.version,
    productSurface: "catalog_items",
    productSource: projection.source,
    productSourceId: projection.sourceId,
  });
}

function assertUaStateRegisterCatalogNameProjectionAllowed() {
  assertCatalogSourceProductProjectionAllowed({
    sourceSlug: UA_STATE_REGISTER_SOURCE.slug,
    sourceVersion: UA_STATE_REGISTER_SOURCE.version,
    productSurface: "catalog_item_names",
    productSource: UA_STATE_REGISTER_SOURCE.slug.replaceAll("-", "_"),
  });
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
