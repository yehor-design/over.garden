import { sql, type Kysely, type Transaction } from "kysely";

import type { Database, JsonValue } from "@/db/schema";
import {
  BREED_SEED_PARSER_VERSION,
  UA_OFFICIAL_BEE_BREED_SOURCE,
  breedSeedAllowedProjection,
  breedSeedAllowedProjectionJson,
  breedSeedAllowedUsage,
  breedSeedDefinition,
  breedSeedPayloadChecksum,
  breedSeedRawPayload,
  breedSeedSnapshotChecksum,
  breedSeedSourceOnlyFields,
  type BreedSeedAliasCandidate,
  type BreedSeedImportDefinition,
  type BreedSeedProjection,
} from "@/lib/catalog/breed-seed";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const SELECTABLE_CATALOG_STATUSES = ["seeded", "confirmed"] as const;
const MATCHING_QUEUE = "matching";
const CATALOG_TYPEAHEAD_REINDEX_KIND = "catalog_typeahead_reindex";
const CATALOG_TYPEAHEAD_REINDEX_IDEMPOTENCY_KEY = "catalog-typeahead-reindex";
const PROOF_OWNER_USER_ID = "00000000-0000-4000-8000-000000060000";

export interface BreedSeedImportSummary {
  sourceSnapshotId: string;
  sourceRecordId: string;
  catalogItemId: string;
  catalogKind: "breed";
  sourceSlug: string;
  sourceVersion: string;
  sourceRecordKey: string;
  rawPayloadSha256: string;
  snapshotSha256: string;
  parserVersion: string;
  canonicalName: string;
  publicSlug: string;
  sourceIds: BreedSeedProjection["sourceIds"];
  aliasesProjected: number;
  aliasesRecorded: number;
  aliasStatusCounts: Record<BreedSeedAliasCandidate["status"], number>;
  reindexQueued: boolean;
}

export interface BreedSeedTypeaheadProof {
  catalogItemId: string;
  displayName: string;
  canonicalName: string;
  catalogKind: string;
  locale: string;
  status: string;
  source: string;
}

export interface BreedSeedGardenReadbackProof {
  catalogItemId: string;
  objectKind: string;
  varietyText: string | null;
  varietyState: string;
  catalogCanonicalName: string | null;
  catalogKind: string | null;
  catalogSource: string | null;
}

export interface BreedSeedSourceProvenanceProof {
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
}

export interface BreedSeedAliasCurationProof {
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

export async function importBreedSeed(
  executor: Kysely<Database>,
  definition = breedSeedDefinition(),
): Promise<BreedSeedImportSummary> {
  return executor.transaction().execute(async (trx) => {
    const projection = breedSeedAllowedProjection(definition);
    const rawPayloadSha256 = breedSeedPayloadChecksum(definition);
    const snapshotSha256 = breedSeedSnapshotChecksum(definition);

    const snapshot = await buildUpsertBreedSeedSnapshotQuery(trx, {
      definition,
      payloadSha256: snapshotSha256,
    }).executeTakeFirstOrThrow();
    const record = await buildUpsertBreedSeedRecordQuery(trx, {
      definition,
      sourceSnapshotId: snapshot.id,
      rawPayloadSha256,
    }).executeTakeFirstOrThrow();
    const catalogItem = await buildUpsertBreedSeedCatalogItemQuery(
      trx,
      projection,
    ).executeTakeFirstOrThrow();

    const catalogItemNameIdsByAliasKey = new Map<string, string>();
    for (const alias of projection.aliases) {
      const catalogItemName = await buildUpsertBreedSeedCatalogNameQuery(trx, {
        catalogItemId: catalogItem.id,
        ...alias,
      }).executeTakeFirstOrThrow();
      catalogItemNameIdsByAliasKey.set(
        buildAliasKey(alias.locale, alias.normalizedName),
        catalogItemName.id,
      );
    }

    const aliasStatusCounts = emptyAliasStatusCounts();
    for (const alias of definition.aliasCandidates) {
      const catalogItemNameId =
        alias.status === "accepted"
          ? catalogItemNameIdsByAliasKey.get(
              buildAliasKey(alias.locale, alias.normalizedName),
            )
          : null;

      if (alias.status === "accepted" && !catalogItemNameId) {
        throw new Error(
          `Accepted breed alias ${alias.locale}:${alias.normalizedName} is missing from catalog_item_names.`,
        );
      }

      await buildUpsertBreedSeedAliasProjectionQuery(trx, {
        catalogItemId: catalogItem.id,
        catalogItemNameId: catalogItemNameId ?? null,
        sourceRecordId: record.id,
        alias,
      }).execute();
      aliasStatusCounts[alias.status] += 1;
    }

    await buildInsertBreedSeedSourceLinkQuery(trx, {
      definition,
      catalogItemId: catalogItem.id,
      sourceRecordId: record.id,
    }).execute();

    const reindexJob =
      await buildEnqueueBreedSeedTypeaheadReindexJobQuery(
        trx,
      ).executeTakeFirstOrThrow();

    return {
      sourceSnapshotId: snapshot.id,
      sourceRecordId: record.id,
      catalogItemId: catalogItem.id,
      catalogKind: "breed",
      sourceSlug: definition.source.slug,
      sourceVersion: definition.source.version,
      sourceRecordKey: definition.record.id,
      rawPayloadSha256,
      snapshotSha256,
      parserVersion: BREED_SEED_PARSER_VERSION,
      canonicalName: catalogItem.canonicalName,
      publicSlug: catalogItem.publicSlug ?? projection.publicSlug,
      sourceIds: projection.sourceIds,
      aliasesProjected: projection.aliases.length,
      aliasesRecorded: definition.aliasCandidates.length,
      aliasStatusCounts,
      reindexQueued: reindexJob.id.length > 0,
    };
  });
}

export async function readBreedSeedTypeaheadProof(
  executor: QueryExecutor,
  query: string,
): Promise<BreedSeedTypeaheadProof[]> {
  const rows = await buildBreedSeedTypeaheadProofQuery(
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

export async function readBreedSeedSourceProvenanceProof(
  executor: QueryExecutor,
  catalogItemId: string,
): Promise<BreedSeedSourceProvenanceProof | null> {
  const row = await buildBreedSeedSourceProvenanceProofQuery(
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
  };
}

export async function readBreedSeedAliasCurationProof(
  executor: QueryExecutor,
  catalogItemId: string,
): Promise<BreedSeedAliasCurationProof[]> {
  const rows = await buildBreedSeedAliasCurationProofQuery(
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
    projectedToTypeahead: row.catalogItemNameId !== null,
    projectionNotes: row.projectionNotes,
  }));
}

export async function proveBreedSeedGardenReadback(
  executor: Kysely<Database>,
  catalogItemId: string,
): Promise<BreedSeedGardenReadbackProof> {
  try {
    await executor.transaction().execute(async (trx) => {
      const projection = breedSeedAllowedProjection();
      const space = await trx
        .insertInto("spaces")
        .values({
          owner_user_id: PROOF_OWNER_USER_ID,
          display_name: "OVE-60 bee proof",
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
          display_name: "Proof Carpathian colony",
          object_kind: "bee_colony",
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
          title: "OVE-60 official bee breed proof",
          body: "Official/manual Ukrainian bee breed seed can be selected and read back without exposing raw validation-only source fields.",
          entry_scope: "object",
          entry_date: "2026-06-30",
          visibility: "private",
          client_mutation_id: "ove-60-ua-official-bee-breed-proof",
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

  throw new Error("Breed seed readback proof did not run.");
}

export function buildUpsertBreedSeedSnapshotQuery(
  executor: QueryExecutor,
  input: {
    definition?: BreedSeedImportDefinition;
    payloadSha256: string;
  },
) {
  const definition = input.definition ?? breedSeedDefinition();
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
      allowed_usage: jsonbParam(breedSeedAllowedUsage(definition)),
      parser_version: BREED_SEED_PARSER_VERSION,
      payload_sha256: input.payloadSha256,
      fetched_at: definition.source.fetchedAt,
      verified_at: definition.source.verifiedAt,
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
          allowed_usage: jsonbParam(breedSeedAllowedUsage(definition)),
          parser_version: BREED_SEED_PARSER_VERSION,
          fetched_at: definition.source.fetchedAt,
          verified_at: definition.source.verifiedAt,
          status: "imported",
          updated_at: now,
        }),
    )
    .returning("id");
}

export function buildUpsertBreedSeedRecordQuery(
  executor: QueryExecutor,
  input: {
    definition?: BreedSeedImportDefinition;
    sourceSnapshotId: string;
    rawPayloadSha256: string;
  },
) {
  const definition = input.definition ?? breedSeedDefinition();
  const now = new Date();

  return executor
    .insertInto("catalog_source_records")
    .values({
      source_snapshot_id: input.sourceSnapshotId,
      source_record_id: definition.record.id,
      raw_payload: jsonbParam(breedSeedRawPayload(definition)),
      raw_payload_sha256: input.rawPayloadSha256,
      source_only_fields: jsonbParam(breedSeedSourceOnlyFields(definition)),
      allowed_projection: jsonbParam(
        breedSeedAllowedProjectionJson(definition),
      ),
      projection_status: "projected",
    })
    .onConflict((oc) =>
      oc.columns(["source_snapshot_id", "source_record_id"]).doUpdateSet({
        raw_payload: jsonbParam(breedSeedRawPayload(definition)),
        raw_payload_sha256: input.rawPayloadSha256,
        source_only_fields: jsonbParam(breedSeedSourceOnlyFields(definition)),
        allowed_projection: jsonbParam(
          breedSeedAllowedProjectionJson(definition),
        ),
        projection_status: "projected",
        updated_at: now,
      }),
    )
    .returning("id");
}

export function buildUpsertBreedSeedCatalogItemQuery(
  executor: QueryExecutor,
  projection = breedSeedAllowedProjection(),
) {
  const now = new Date();

  return executor
    .insertInto("catalog_items")
    .values({
      canonical_name: projection.canonicalName,
      normalized_name: projection.normalizedName,
      public_slug: projection.publicSlug,
      catalog_kind: projection.catalogKind,
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
        catalog_kind: projection.catalogKind,
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

export function buildUpsertBreedSeedCatalogNameQuery(
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

export function buildUpsertBreedSeedAliasProjectionQuery(
  executor: QueryExecutor,
  input: {
    catalogItemId: string;
    catalogItemNameId: string | null;
    sourceRecordId: string;
    alias: BreedSeedAliasCandidate;
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
    );
}

export function buildInsertBreedSeedSourceLinkQuery(
  executor: QueryExecutor,
  input: {
    definition?: BreedSeedImportDefinition;
    catalogItemId: string;
    sourceRecordId: string;
  },
) {
  const definition = input.definition ?? breedSeedDefinition();

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

export function buildEnqueueBreedSeedTypeaheadReindexJobQuery(
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

export function buildBreedSeedTypeaheadProofQuery(
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
    .where("catalog_items.catalog_kind", "=", "breed")
    .where("catalog_items.source", "=", "ua_official_bee_breed")
    .where(
      sql<boolean>`lower(${sql.ref("catalog_item_names.display_name")}) like ${pattern}`,
    )
    .orderBy("catalog_item_names.is_primary", "desc")
    .orderBy("catalog_item_names.display_name", "asc")
    .limit(8);
}

export function buildBreedSeedSourceProvenanceProofQuery(
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
      "catalog_source_snapshots.parser_version as parserVersion",
      "catalog_source_snapshots.fetched_at as fetchedAt",
      "catalog_source_snapshots.verified_at as verifiedAt",
      "catalog_source_records.projection_status as projectionStatus",
    ])
    .where("catalog_items.id", "=", catalogItemId)
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_items.catalog_kind", "=", "breed")
    .where("catalog_items.source", "=", "ua_official_bee_breed")
    .where(
      "catalog_source_links.source_slug",
      "=",
      UA_OFFICIAL_BEE_BREED_SOURCE.slug,
    )
    .where("catalog_source_links.projection_kind", "=", "canonical_item")
    .limit(1);
}

export function buildBreedSeedAliasCurationProofQuery(
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
      "catalog_alias_projections.catalog_item_id as catalogItemId",
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
      "catalog_alias_projections.projection_notes as projectionNotes",
    ])
    .where("catalog_alias_projections.catalog_item_id", "=", catalogItemId)
    .where("catalog_items.catalog_kind", "=", "breed")
    .orderBy(
      sql<number>`case ${sql.ref("catalog_alias_projections.status")}
        when 'accepted' then 0
        when 'review_needed' then 1
        else 2
      end`,
      "asc",
    )
    .orderBy("catalog_alias_projections.display_name", "asc");
}

class RollbackReadbackProof extends Error {
  constructor(readonly proof: BreedSeedGardenReadbackProof) {
    super("Rollback OVE-60 breed seed readback proof");
  }
}

function emptyAliasStatusCounts(): Record<
  BreedSeedAliasCandidate["status"],
  number
> {
  return {
    accepted: 0,
    review_needed: 0,
  };
}

function buildAliasKey(locale: string, normalizedName: string) {
  return `${locale}:${normalizedName}`;
}

function jsonbParam(value: JsonValue) {
  return sql<JsonValue>`${JSON.stringify(value)}::jsonb`;
}
