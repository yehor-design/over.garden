import { sql, type Kysely, type Transaction } from "kysely";

import type { Database, JsonValue } from "@/db/schema";
import {
  BREED_SEED_PARSER_VERSION,
  breedSeedAllowedProjection,
  breedSeedAllowedProjectionJson,
  breedSeedAllowedUsage,
  breedSeedConceptPayloadChecksum,
  breedSeedConcepts,
  breedSeedDefinition,
  breedSeedPayloadChecksum,
  breedSeedRawPayload,
  breedSeedSnapshotChecksum,
  breedSeedSourceOnlyFields,
  type BreedSeedAliasCandidate,
  type BreedSeedConcept,
  type BreedSeedImportDefinition,
  type BreedSeedProjection,
  type BreedSeedSource,
} from "@/lib/catalog/breed-seed";
import { assertCatalogSourceProductProjectionAllowed } from "./source-projection-guard";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const SELECTABLE_CATALOG_STATUSES = ["seeded", "confirmed"] as const;
const MATCHING_QUEUE = "matching";
const CATALOG_TYPEAHEAD_REINDEX_KIND = "catalog_typeahead_reindex";
const CATALOG_TYPEAHEAD_REINDEX_IDEMPOTENCY_KEY = "catalog-typeahead-reindex";
const PROOF_OWNER_USER_ID = "00000000-0000-4000-8000-000000060000";
const OVE60_BEE_PROJECTION_GATE = {
  issueKey: "OVE-60",
  gateId: "ove-60-ua-official-bee-breed-manual-seed",
  scope: "manual_seed",
} as const;
const OVE86_BEE_PROJECTION_GATE = {
  issueKey: "OVE-86",
  gateId: "ove-86-ua-official-bee-breed-expanded-manual-seed",
  scope: "manual_seed",
} as const;

export interface BreedSeedImportedConceptSummary {
  sourceRecordId: string;
  catalogItemId: string;
  catalogKind: "breed";
  sourceSlug: string;
  sourceVersion: string;
  sourceRecordKey: string;
  rawPayloadSha256: string;
  canonicalName: string;
  publicSlug: string;
  source: BreedSeedProjection["source"];
  sourceId: string;
  expectedObjectKind: "animal";
  aliasesProjected: number;
  aliasesRecorded: number;
  aliasStatusCounts: Record<BreedSeedAliasCandidate["status"], number>;
}

export interface BreedSeedImportSummary {
  sourceSnapshotIds: string[];
  sourceRecordIds: string[];
  catalogItemIds: string[];
  conceptsImported: number;
  concepts: BreedSeedImportedConceptSummary[];
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
    const snapshotIdsBySourceSlug = new Map<string, string>();
    const snapshotShaBySourceSlug = new Map<string, string>();

    for (const source of uniqueBreedSources(definition)) {
      const snapshotSha256 = breedSeedSnapshotChecksum(definition, source.slug);
      const snapshot = await buildUpsertBreedSeedSnapshotQuery(trx, {
        definition,
        source,
        payloadSha256: snapshotSha256,
      }).executeTakeFirstOrThrow();
      snapshotIdsBySourceSlug.set(source.slug, snapshot.id);
      snapshotShaBySourceSlug.set(source.slug, snapshotSha256);
    }

    const importedConcepts: BreedSeedImportedConceptSummary[] = [];
    for (const concept of breedSeedConcepts(definition)) {
      const projection = breedSeedAllowedProjection(definition, concept);
      const rawPayloadSha256 = breedSeedConceptPayloadChecksum(concept);
      const sourceSnapshotId = snapshotIdsBySourceSlug.get(concept.source.slug);
      if (!sourceSnapshotId) {
        throw new Error(
          `Missing breed source snapshot for ${concept.source.slug}.`,
        );
      }

      const record = await buildUpsertBreedSeedRecordQuery(trx, {
        definition,
        concept,
        sourceSnapshotId,
        rawPayloadSha256,
      }).executeTakeFirstOrThrow();
      const catalogItem = await buildUpsertBreedSeedCatalogItemQuery(trx, {
        concept,
        projection,
      }).executeTakeFirstOrThrow();

      const catalogItemNameIdsByAliasKey = new Map<string, string>();
      for (const alias of projection.aliases) {
        const catalogItemName = await buildUpsertBreedSeedCatalogNameQuery(
          trx,
          {
            concept,
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
        concept,
        catalogItemId: catalogItem.id,
        sourceRecordId: record.id,
      }).execute();

      importedConcepts.push({
        sourceRecordId: record.id,
        catalogItemId: catalogItem.id,
        catalogKind: "breed",
        sourceSlug: concept.source.slug,
        sourceVersion: concept.source.version,
        sourceRecordKey: concept.record.id,
        rawPayloadSha256,
        canonicalName: catalogItem.canonicalName,
        publicSlug: catalogItem.publicSlug ?? projection.publicSlug,
        source: projection.source,
        sourceId: projection.sourceId,
        expectedObjectKind: projection.sourceIds.supportedObjectKind,
        aliasesProjected: projection.aliases.length,
        aliasesRecorded: concept.aliasCandidates.length,
        aliasStatusCounts,
      });
    }

    const reindexJob =
      await buildEnqueueBreedSeedTypeaheadReindexJobQuery(
        trx,
      ).executeTakeFirstOrThrow();
    const primary = importedConcepts[0];

    return {
      sourceSnapshotIds: [...snapshotIdsBySourceSlug.values()],
      sourceRecordIds: importedConcepts.map(
        (concept) => concept.sourceRecordId,
      ),
      catalogItemIds: importedConcepts.map((concept) => concept.catalogItemId),
      conceptsImported: importedConcepts.length,
      concepts: importedConcepts,
      sourceSnapshotId:
        snapshotIdsBySourceSlug.get(definition.source.slug) ?? "",
      sourceRecordId: primary.sourceRecordId,
      catalogItemId: primary.catalogItemId,
      catalogKind: "breed",
      sourceSlug: definition.source.slug,
      sourceVersion: definition.source.version,
      sourceRecordKey: definition.record.id,
      rawPayloadSha256: breedSeedPayloadChecksum(definition),
      snapshotSha256: snapshotShaBySourceSlug.get(definition.source.slug) ?? "",
      parserVersion: BREED_SEED_PARSER_VERSION,
      canonicalName: primary.canonicalName,
      publicSlug: primary.publicSlug,
      sourceIds: definition.projection.sourceIds,
      aliasesProjected: importedConcepts.reduce(
        (total, concept) => total + concept.aliasesProjected,
        0,
      ),
      aliasesRecorded: importedConcepts.reduce(
        (total, concept) => total + concept.aliasesRecorded,
        0,
      ),
      aliasStatusCounts: importedConcepts.reduce(
        (counts, concept) =>
          mergeAliasStatusCounts(counts, concept.aliasStatusCounts),
        emptyAliasStatusCounts(),
      ),
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
  options: {
    objectKind?: "animal";
    proofLabel?: string;
    entryTitle?: string;
  } = {},
): Promise<BreedSeedGardenReadbackProof> {
  try {
    await executor.transaction().execute(async (trx) => {
      const catalogItem = await trx
        .selectFrom("catalog_items")
        .select([
          "catalog_items.canonical_name as canonicalName",
          "catalog_items.catalog_kind as catalogKind",
          "catalog_items.source as source",
        ])
        .where("catalog_items.id", "=", catalogItemId)
        .where("catalog_items.catalog_kind", "=", "breed")
        .executeTakeFirstOrThrow();
      const objectKind =
        options.objectKind ??
        expectedObjectKindForBreedSource(catalogItem.source ?? "");
      const space = await trx
        .insertInto("spaces")
        .values({
          owner_user_id: PROOF_OWNER_USER_ID,
          display_name: "OVE-86 breed proof",
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
          display_name:
            options.proofLabel ?? `Proof ${catalogItem.canonicalName}`,
          object_kind: objectKind,
          catalog_item_id: catalogItemId,
          variety_text: catalogItem.canonicalName,
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
          title: options.entryTitle ?? "OVE-86 approved breed proof",
          body: "Approved breed seed can be selected and read back without exposing raw validation-only source fields.",
          entry_scope: "object",
          entry_date: "2026-07-02",
          visibility: "public",
          client_mutation_id: `ove-86-breed-proof-${catalogItemId}`,
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
    source?: BreedSeedSource;
    payloadSha256: string;
  },
) {
  const definition = input.definition ?? breedSeedDefinition();
  const source = input.source ?? definition.source;
  const now = new Date();

  return executor
    .insertInto("catalog_source_snapshots")
    .values({
      source_slug: source.slug,
      source_name: source.name,
      source_category: source.category,
      source_version: source.version,
      source_url: source.url,
      license: source.license,
      license_url: source.licenseUrl,
      attribution_required: source.attributionRequired,
      attribution_text: source.attributionText,
      allowed_usage: jsonbParam(breedSeedAllowedUsage(definition, source)),
      parser_version: BREED_SEED_PARSER_VERSION,
      payload_sha256: input.payloadSha256,
      fetched_at: source.fetchedAt,
      verified_at: source.verifiedAt,
      status: "imported",
    })
    .onConflict((oc) =>
      oc
        .columns(["source_slug", "source_version", "payload_sha256"])
        .doUpdateSet({
          source_name: source.name,
          source_category: source.category,
          source_url: source.url,
          license: source.license,
          license_url: source.licenseUrl,
          attribution_required: source.attributionRequired,
          attribution_text: source.attributionText,
          allowed_usage: jsonbParam(breedSeedAllowedUsage(definition, source)),
          parser_version: BREED_SEED_PARSER_VERSION,
          fetched_at: source.fetchedAt,
          verified_at: source.verifiedAt,
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
    concept?: BreedSeedConcept;
    sourceSnapshotId: string;
    rawPayloadSha256: string;
  },
) {
  const definition = input.definition ?? breedSeedDefinition();
  const concept = input.concept ?? definition.concepts[0];
  const now = new Date();

  return executor
    .insertInto("catalog_source_records")
    .values({
      source_snapshot_id: input.sourceSnapshotId,
      source_record_id: concept.record.id,
      raw_payload: jsonbParam(breedSeedRawPayload(definition, concept)),
      raw_payload_sha256: input.rawPayloadSha256,
      source_only_fields: jsonbParam(
        breedSeedSourceOnlyFields(definition, concept),
      ),
      allowed_projection: jsonbParam(
        breedSeedAllowedProjectionJson(definition, concept),
      ),
      projection_status: "projected",
    })
    .onConflict((oc) =>
      oc.columns(["source_snapshot_id", "source_record_id"]).doUpdateSet({
        raw_payload: jsonbParam(breedSeedRawPayload(definition, concept)),
        raw_payload_sha256: input.rawPayloadSha256,
        source_only_fields: jsonbParam(
          breedSeedSourceOnlyFields(definition, concept),
        ),
        allowed_projection: jsonbParam(
          breedSeedAllowedProjectionJson(definition, concept),
        ),
        projection_status: "projected",
        updated_at: now,
      }),
    )
    .returning("id");
}

export function buildUpsertBreedSeedCatalogItemQuery(
  executor: QueryExecutor,
  input:
    | BreedSeedProjection
    | {
        concept: BreedSeedConcept;
        projection?: BreedSeedProjection;
      } = breedSeedAllowedProjection(),
) {
  const concept =
    "concept" in input ? input.concept : breedSeedDefinition().concepts[0];
  const projection =
    "concept" in input ? (input.projection ?? concept.projection) : input;
  assertCatalogSourceProductProjectionAllowed({
    sourceSlug: concept.source.slug,
    sourceVersion: concept.source.version,
    sourceRecordKey: concept.record.id,
    productSurface: "catalog_items",
    productSource: projection.source,
    productSourceId: projection.sourceId,
    explicitGate: explicitGateForBreedConcept(concept),
  });

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
    concept?: BreedSeedConcept;
    catalogItemId: string;
    displayName: string;
    normalizedName: string;
    locale: string;
    isPrimary: boolean;
  },
) {
  const concept = input.concept ?? breedSeedDefinition().concepts[0];
  assertCatalogSourceProductProjectionAllowed({
    sourceSlug: concept.source.slug,
    sourceVersion: concept.source.version,
    sourceRecordKey: concept.record.id,
    productSurface: "catalog_item_names",
    productSource: concept.projection.source,
    productSourceId: concept.projection.sourceId,
    explicitGate: explicitGateForBreedConcept(concept),
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
    concept?: BreedSeedConcept;
    catalogItemId: string;
    sourceRecordId: string;
  },
) {
  const definition = input.definition ?? breedSeedDefinition();
  const concept = input.concept ?? definition.concepts[0];

  return executor
    .insertInto("catalog_source_links")
    .values({
      catalog_item_id: input.catalogItemId,
      source_record_id: input.sourceRecordId,
      source_slug: concept.source.slug,
      source_record_key: concept.record.id,
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
    .where("catalog_items.source", "in", [
      "ua_official_bee_breed",
      "vertebrate_breed_ontology",
    ])
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
    .where("catalog_items.source", "in", [
      "ua_official_bee_breed",
      "vertebrate_breed_ontology",
    ])
    .where("catalog_source_links.source_slug", "in", [
      "ua-official-bee-breeds",
      "vertebrate-breed-ontology",
    ])
    .where("catalog_source_links.projection_kind", "=", "canonical_item")
    .orderBy("catalog_source_snapshots.updated_at", "desc")
    .orderBy("catalog_source_snapshots.created_at", "desc")
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
    rejected: 0,
  };
}

function mergeAliasStatusCounts(
  target: Record<BreedSeedAliasCandidate["status"], number>,
  source: Record<BreedSeedAliasCandidate["status"], number>,
) {
  target.accepted += source.accepted;
  target.review_needed += source.review_needed;
  target.rejected += source.rejected;
  return target;
}

function uniqueBreedSources(
  definition: BreedSeedImportDefinition,
): BreedSeedSource[] {
  const seen = new Set<string>();
  return definition.concepts.flatMap((concept) => {
    if (seen.has(concept.source.slug)) return [];
    seen.add(concept.source.slug);
    return [concept.source];
  });
}

function explicitGateForBreedConcept(concept: BreedSeedConcept) {
  if (concept.source.slug !== "ua-official-bee-breeds") return undefined;
  if (concept.record.id === "ua-law-1492-iii:bee-breed:carpathian") {
    return OVE60_BEE_PROJECTION_GATE;
  }

  return OVE86_BEE_PROJECTION_GATE;
}

function expectedObjectKindForBreedSource(source: string): "animal" {
  void source;
  return "animal";
}

function buildAliasKey(locale: string, normalizedName: string) {
  return `${locale}:${normalizedName}`;
}

function jsonbParam(value: JsonValue) {
  return sql<JsonValue>`${JSON.stringify(value)}::jsonb`;
}
