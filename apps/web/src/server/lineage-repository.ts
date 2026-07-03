import "server-only";

import type { Insertable, Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogKind,
  Database,
  LineageConsentState,
  LineageErasureState,
  LineageProvenanceEdge,
  LineageSourceKind,
  LineageSourceReferenceKind,
  LineageVisibilityPolicy,
  PlantObjectKind,
  VarietyState,
} from "@/db/schema";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface CreateProvenanceEdgeInput {
  subjectPlantObjectId: string;
  sourceKind: string;
  sourcePlantObjectId?: string | null;
  sourceReferenceKind?: string | null;
  sourceReferenceLabel?: string | null;
  clientMutationId: string;
}

export type LineageClaimDecision = Extract<
  LineageConsentState,
  "confirmed" | "declined"
>;

export type LineageClaimAuditAction = "confirm" | "decline";

export interface LineagePlantObjectOption {
  id: string;
  displayName: string;
  objectKind: PlantObjectKind;
  catalogKind: CatalogKind | null;
  varietyText: string | null;
  varietyState: VarietyState;
}

export interface LineageProvenanceEdgeReadback {
  id: string;
  sourceKind: LineageSourceKind;
  consentState: LineageConsentState;
  visibilityPolicy: LineageVisibilityPolicy;
  erasureState: LineageErasureState;
  sourceObject: LineagePlantObjectOption | null;
  sourceReferenceKind: LineageSourceReferenceKind | null;
  sourceReferenceLabel: string | null;
  createdAt: Date | string;
}

export interface ObjectProvenancePanel {
  sourceObjectOptions: LineagePlantObjectOption[];
  edges: LineageProvenanceEdgeReadback[];
}

export interface CreateProvenanceEdgeResult {
  edge: LineageProvenanceEdge;
  subjectObject: LineagePlantObjectOption;
  sourceObject: LineagePlantObjectOption | null;
  isNewEdge: boolean;
}

export interface LineageClaimInboxItem {
  id: string;
  consentState: LineageConsentState;
  visibilityPolicy: LineageVisibilityPolicy;
  erasureState: LineageErasureState;
  subjectObject: LineagePlantObjectOption;
  sourceObject: LineagePlantObjectOption;
  createdAt: Date | string;
}

export interface ResolveLineageClaimInput {
  edgeId: string;
  decision: string;
}

export interface ResolveLineageClaimResult {
  edge: LineageProvenanceEdge;
  decision: LineageClaimDecision;
}

interface NormalizedCreateProvenanceEdgeInput {
  subjectPlantObjectId: string;
  sourceKind: LineageSourceKind;
  sourcePlantObjectId: string | null;
  sourceReferenceKind: LineageSourceReferenceKind | null;
  sourceReferenceLabel: string | null;
  clientMutationId: string;
}

interface NormalizedResolveLineageClaimInput {
  edgeId: string;
  decision: LineageClaimDecision;
}

const LINEAGE_SOURCE_REFERENCE_KINDS = [
  "person",
  "seed_packet",
  "nursery",
  "catalog_variety",
  "other",
] as const satisfies readonly LineageSourceReferenceKind[];

export async function listLineageClaimInbox(
  scope: RequestScope,
): Promise<LineageClaimInboxItem[]> {
  const rows = await buildLineageClaimInboxQuery(db, scope).execute();
  return rows.map((row) => ({
    id: row.id,
    consentState: row.consent_state as LineageConsentState,
    visibilityPolicy: row.visibility_policy as LineageVisibilityPolicy,
    erasureState: row.erasure_state as LineageErasureState,
    subjectObject: mapPlantObjectOption({
      id: row.subjectObjectId,
      displayName: row.subjectObjectDisplayName,
      objectKind: row.subjectObjectKind,
      catalogKind: row.subjectCatalogKind,
      varietyText: row.subjectVarietyText,
      varietyState: row.subjectVarietyState,
    }),
    sourceObject: mapPlantObjectOption({
      id: row.sourceObjectId,
      displayName: row.sourceObjectDisplayName,
      objectKind: row.sourceObjectKind,
      catalogKind: row.sourceCatalogKind,
      varietyText: row.sourceVarietyText,
      varietyState: row.sourceVarietyState,
    }),
    createdAt: row.created_at,
  }));
}

export async function getObjectProvenancePanel(
  scope: RequestScope,
  subjectPlantObjectId: string,
): Promise<ObjectProvenancePanel | null> {
  const subject = await buildLineagePlantObjectByIdQuery(
    db,
    scope,
    subjectPlantObjectId,
  ).executeTakeFirst();

  if (!subject) return null;

  const [sourceObjectOptions, edgeRows] = await Promise.all([
    buildLineageSourceObjectOptionsQuery(
      db,
      scope,
      subjectPlantObjectId,
    ).execute(),
    buildObjectProvenanceEdgesQuery(db, scope, subjectPlantObjectId).execute(),
  ]);

  return {
    sourceObjectOptions: sourceObjectOptions.map(mapPlantObjectOption),
    edges: edgeRows.map((edge) => ({
      id: edge.id,
      sourceKind: edge.source_kind as LineageSourceKind,
      consentState: edge.consent_state as LineageConsentState,
      visibilityPolicy: edge.visibility_policy as LineageVisibilityPolicy,
      erasureState: edge.erasure_state as LineageErasureState,
      sourceObject: edge.sourceObjectId
        ? {
            id: edge.sourceObjectId,
            displayName: edge.sourceObjectDisplayName ?? "Erased object",
            objectKind: edge.sourceObjectKind as PlantObjectKind,
            catalogKind: edge.sourceCatalogKind as CatalogKind | null,
            varietyText: edge.sourceVarietyText,
            varietyState: edge.sourceVarietyState as VarietyState,
          }
        : null,
      sourceReferenceKind:
        edge.source_reference_kind as LineageSourceReferenceKind | null,
      sourceReferenceLabel: edge.source_reference_label,
      createdAt: edge.created_at,
    })),
  };
}

export async function createProvenanceEdge(
  scope: RequestScope,
  input: CreateProvenanceEdgeInput,
): Promise<CreateProvenanceEdgeResult> {
  const normalized = normalizeCreateProvenanceEdgeInput(input);
  const existing = await buildFindProvenanceEdgeByClientMutationQuery(
    db,
    scope,
    normalized.clientMutationId,
  ).executeTakeFirst();

  if (existing) {
    assertExistingEdgeMatchesInput(existing, normalized);
    return readCreateProvenanceEdgeResult(db, scope, existing, false);
  }

  return db.transaction().execute(async (trx) => {
    const subjectObject = await buildLineagePlantObjectByIdQuery(
      trx,
      scope,
      normalized.subjectPlantObjectId,
    ).executeTakeFirst();

    if (!subjectObject) {
      throw new Error("Provenance subject object was not found.");
    }

    let sourceObject: LineagePlantObjectOption | null = null;
    if (normalized.sourceKind === "own_object") {
      const sourceRow = await buildLineagePlantObjectByIdQuery(
        trx,
        scope,
        normalized.sourcePlantObjectId,
      ).executeTakeFirst();

      if (!sourceRow) {
        throw new Error("Provenance source object was not found.");
      }

      sourceObject = mapPlantObjectOption(sourceRow);
    }

    const edge = await buildInsertProvenanceEdgeQuery(trx, {
      owner_user_id: scope.userId,
      subject_plant_object_id: normalized.subjectPlantObjectId,
      source_kind: normalized.sourceKind,
      source_plant_object_id: normalized.sourcePlantObjectId,
      source_owner_user_id:
        normalized.sourceKind === "own_object" ? scope.userId : null,
      source_reference_kind: normalized.sourceReferenceKind,
      source_reference_label: normalized.sourceReferenceLabel,
      edge_type: "provenance",
      consent_state: "proposed",
      visibility_policy: "owner_only_until_confirmed",
      erasure_state: "active",
      client_mutation_id: normalized.clientMutationId,
    }).executeTakeFirst();

    if (edge) {
      return {
        edge,
        subjectObject: mapPlantObjectOption(subjectObject),
        sourceObject,
        isNewEdge: true,
      };
    }

    const existingAfterConflict =
      await buildFindProvenanceEdgeByClientMutationQuery(
        trx,
        scope,
        normalized.clientMutationId,
      ).executeTakeFirst();

    if (!existingAfterConflict) {
      throw new Error("Provenance idempotency conflict could not be resolved.");
    }

    assertExistingEdgeMatchesInput(existingAfterConflict, normalized);
    return readCreateProvenanceEdgeResult(
      trx,
      scope,
      existingAfterConflict,
      false,
    );
  });
}

export async function resolveLineageClaim(
  scope: RequestScope,
  input: ResolveLineageClaimInput,
): Promise<ResolveLineageClaimResult> {
  const normalized = normalizeResolveLineageClaimInput(input);
  const now = new Date();

  return db.transaction().execute(async (trx) => {
    const edge = await buildResolveLineageClaimQuery(trx, scope, {
      edgeId: normalized.edgeId,
      decision: normalized.decision,
      now,
    }).executeTakeFirst();

    if (!edge) {
      throw new Error("Lineage claim is not available for this gardener.");
    }

    await buildInsertLineageClaimAuditEventQuery(trx, {
      edge_id: edge.id,
      actor_user_id: scope.userId,
      target_user_id: scope.userId,
      action: lineageClaimActionForDecision(normalized.decision),
      previous_consent_state: "proposed",
      new_consent_state: normalized.decision,
      visibility_policy: edge.visibility_policy,
    }).executeTakeFirstOrThrow();

    return {
      edge,
      decision: normalized.decision,
    };
  });
}

export function buildLineagePlantObjectByIdQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  plantObjectId: string | null,
) {
  return executor
    .selectFrom("plant_objects")
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "plant_objects.id as id",
      "plant_objects.display_name as displayName",
      "plant_objects.object_kind as objectKind",
      "catalog_items.catalog_kind as catalogKind",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
    ])
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("plant_objects.id", "=", plantObjectId ?? "");
}

export function buildLineageSourceObjectOptionsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  subjectPlantObjectId: string,
) {
  return executor
    .selectFrom("plant_objects")
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "plant_objects.id as id",
      "plant_objects.display_name as displayName",
      "plant_objects.object_kind as objectKind",
      "catalog_items.catalog_kind as catalogKind",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
    ])
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("plant_objects.id", "!=", subjectPlantObjectId)
    .orderBy("plant_objects.created_at", "desc")
    .orderBy("plant_objects.id", "asc");
}

export function buildObjectProvenanceEdgesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  subjectPlantObjectId: string,
) {
  return executor
    .selectFrom("lineage_provenance_edges")
    .leftJoin("plant_objects as source_objects", (join) =>
      join
        .onRef(
          "source_objects.id",
          "=",
          "lineage_provenance_edges.source_plant_object_id",
        )
        .onRef(
          "source_objects.owner_user_id",
          "=",
          "lineage_provenance_edges.source_owner_user_id",
        ),
    )
    .leftJoin("catalog_items as source_catalog_items", (join) =>
      join
        .onRef("source_catalog_items.id", "=", "source_objects.catalog_item_id")
        .on("source_catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "lineage_provenance_edges.id",
      "lineage_provenance_edges.source_kind",
      "lineage_provenance_edges.source_reference_kind",
      "lineage_provenance_edges.source_reference_label",
      "lineage_provenance_edges.consent_state",
      "lineage_provenance_edges.visibility_policy",
      "lineage_provenance_edges.erasure_state",
      "lineage_provenance_edges.created_at",
      "source_objects.id as sourceObjectId",
      "source_objects.display_name as sourceObjectDisplayName",
      "source_objects.object_kind as sourceObjectKind",
      "source_catalog_items.catalog_kind as sourceCatalogKind",
      "source_objects.variety_text as sourceVarietyText",
      "source_objects.variety_state as sourceVarietyState",
    ])
    .where("lineage_provenance_edges.owner_user_id", "=", scope.userId)
    .where(
      "lineage_provenance_edges.subject_plant_object_id",
      "=",
      subjectPlantObjectId,
    )
    .orderBy("lineage_provenance_edges.created_at", "desc")
    .orderBy("lineage_provenance_edges.id", "asc");
}

export function buildLineageClaimInboxQuery(
  executor: QueryExecutor,
  scope: RequestScope,
) {
  return executor
    .selectFrom("lineage_provenance_edges")
    .innerJoin("plant_objects as source_objects", (join) =>
      join
        .onRef(
          "source_objects.id",
          "=",
          "lineage_provenance_edges.source_plant_object_id",
        )
        .onRef(
          "source_objects.owner_user_id",
          "=",
          "lineage_provenance_edges.source_owner_user_id",
        ),
    )
    .innerJoin("plant_objects as subject_objects", (join) =>
      join
        .onRef(
          "subject_objects.id",
          "=",
          "lineage_provenance_edges.subject_plant_object_id",
        )
        .onRef(
          "subject_objects.owner_user_id",
          "=",
          "lineage_provenance_edges.owner_user_id",
        ),
    )
    .leftJoin("catalog_items as source_catalog_items", (join) =>
      join
        .onRef("source_catalog_items.id", "=", "source_objects.catalog_item_id")
        .on("source_catalog_items.created_by_user_id", "is", null),
    )
    .leftJoin("catalog_items as subject_catalog_items", (join) =>
      join
        .onRef(
          "subject_catalog_items.id",
          "=",
          "subject_objects.catalog_item_id",
        )
        .on("subject_catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "lineage_provenance_edges.id",
      "lineage_provenance_edges.consent_state",
      "lineage_provenance_edges.visibility_policy",
      "lineage_provenance_edges.erasure_state",
      "lineage_provenance_edges.created_at",
      "subject_objects.id as subjectObjectId",
      "subject_objects.display_name as subjectObjectDisplayName",
      "subject_objects.object_kind as subjectObjectKind",
      "subject_catalog_items.catalog_kind as subjectCatalogKind",
      "subject_objects.variety_text as subjectVarietyText",
      "subject_objects.variety_state as subjectVarietyState",
      "source_objects.id as sourceObjectId",
      "source_objects.display_name as sourceObjectDisplayName",
      "source_objects.object_kind as sourceObjectKind",
      "source_catalog_items.catalog_kind as sourceCatalogKind",
      "source_objects.variety_text as sourceVarietyText",
      "source_objects.variety_state as sourceVarietyState",
    ])
    .where("lineage_provenance_edges.source_owner_user_id", "=", scope.userId)
    .where("lineage_provenance_edges.owner_user_id", "!=", scope.userId)
    .where("lineage_provenance_edges.source_kind", "=", "own_object")
    .where("lineage_provenance_edges.consent_state", "=", "proposed")
    .where("lineage_provenance_edges.erasure_state", "=", "active")
    .orderBy("lineage_provenance_edges.created_at", "desc")
    .orderBy("lineage_provenance_edges.id", "asc");
}

export function buildFindProvenanceEdgeByClientMutationQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  clientMutationId: string,
) {
  return executor
    .selectFrom("lineage_provenance_edges")
    .selectAll()
    .where("owner_user_id", "=", scope.userId)
    .where("client_mutation_id", "=", clientMutationId);
}

export function buildInsertProvenanceEdgeQuery(
  executor: QueryExecutor,
  input: Insertable<Database["lineage_provenance_edges"]>,
) {
  return executor
    .insertInto("lineage_provenance_edges")
    .values(input)
    .onConflict((oc) =>
      oc.columns(["owner_user_id", "client_mutation_id"]).doNothing(),
    )
    .returningAll();
}

export function buildResolveLineageClaimQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    edgeId: string;
    decision: LineageClaimDecision;
    now: Date;
  },
) {
  return executor
    .updateTable("lineage_provenance_edges")
    .set({
      consent_state: input.decision,
      updated_at: input.now,
    })
    .where("id", "=", input.edgeId)
    .where("source_owner_user_id", "=", scope.userId)
    .where("owner_user_id", "!=", scope.userId)
    .where("source_kind", "=", "own_object")
    .where("consent_state", "=", "proposed")
    .where("erasure_state", "=", "active")
    .returningAll();
}

export function buildInsertLineageClaimAuditEventQuery(
  executor: QueryExecutor,
  input: Insertable<Database["lineage_provenance_edge_audit_events"]>,
) {
  return executor
    .insertInto("lineage_provenance_edge_audit_events")
    .values(input)
    .returningAll();
}

export function normalizeLineageSourceReferenceLabel(value: string) {
  const label = normalizeRequiredText(value, "Source label", 120);
  const forbiddenPattern =
    /(@|https?:\/\/|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{6,}\d|[-+]?\d{1,2}\.\d{3,}\s*,\s*[-+]?\d{1,3}\.\d{3,})/i;

  if (forbiddenPattern.test(label)) {
    throw new Error(
      "Source label cannot include contact details, handles, URLs, or precise coordinates.",
    );
  }

  return label;
}

function normalizeCreateProvenanceEdgeInput(
  input: CreateProvenanceEdgeInput,
): NormalizedCreateProvenanceEdgeInput {
  const subjectPlantObjectId = normalizeRequiredText(
    input.subjectPlantObjectId,
    "Subject object",
    80,
  );
  const sourceKind = normalizeSourceKind(input.sourceKind);
  const clientMutationId = normalizeRequiredText(
    input.clientMutationId,
    "Client mutation id",
    160,
  );

  if (sourceKind === "own_object") {
    const sourcePlantObjectId = normalizeRequiredText(
      input.sourcePlantObjectId,
      "Source object",
      80,
    );

    if (sourcePlantObjectId === subjectPlantObjectId) {
      throw new Error("An object cannot be its own provenance source.");
    }

    return {
      subjectPlantObjectId,
      sourceKind,
      sourcePlantObjectId,
      sourceReferenceKind: null,
      sourceReferenceLabel: null,
      clientMutationId,
    };
  }

  return {
    subjectPlantObjectId,
    sourceKind,
    sourcePlantObjectId: null,
    sourceReferenceKind: normalizeSourceReferenceKind(
      input.sourceReferenceKind,
    ),
    sourceReferenceLabel: normalizeLineageSourceReferenceLabel(
      input.sourceReferenceLabel ?? "",
    ),
    clientMutationId,
  };
}

function normalizeResolveLineageClaimInput(
  input: ResolveLineageClaimInput,
): NormalizedResolveLineageClaimInput {
  return {
    edgeId: normalizeRequiredText(input.edgeId, "Lineage claim", 80),
    decision: normalizeLineageClaimDecision(input.decision),
  };
}

async function readCreateProvenanceEdgeResult(
  executor: QueryExecutor,
  scope: RequestScope,
  edge: LineageProvenanceEdge,
  isNewEdge: boolean,
): Promise<CreateProvenanceEdgeResult> {
  const subjectObject = await buildLineagePlantObjectByIdQuery(
    executor,
    scope,
    edge.subject_plant_object_id,
  ).executeTakeFirst();

  if (!subjectObject) {
    throw new Error("Provenance subject object was not found.");
  }

  const sourceObject = edge.source_plant_object_id
    ? await buildLineagePlantObjectByIdQuery(
        executor,
        scope,
        edge.source_plant_object_id,
      ).executeTakeFirst()
    : null;

  return {
    edge,
    subjectObject: mapPlantObjectOption(subjectObject),
    sourceObject: sourceObject ? mapPlantObjectOption(sourceObject) : null,
    isNewEdge,
  };
}

function assertExistingEdgeMatchesInput(
  edge: LineageProvenanceEdge,
  input: NormalizedCreateProvenanceEdgeInput,
) {
  if (
    edge.subject_plant_object_id !== input.subjectPlantObjectId ||
    edge.source_kind !== input.sourceKind ||
    edge.source_plant_object_id !== input.sourcePlantObjectId ||
    edge.source_reference_kind !== input.sourceReferenceKind ||
    edge.source_reference_label !== input.sourceReferenceLabel
  ) {
    throw new Error(
      "Client mutation id already belongs to another provenance edge.",
    );
  }
}

function mapPlantObjectOption(row: {
  id: string;
  displayName: string;
  objectKind: string;
  catalogKind: string | null;
  varietyText: string | null;
  varietyState: string;
}): LineagePlantObjectOption {
  return {
    id: row.id,
    displayName: row.displayName,
    objectKind: row.objectKind as PlantObjectKind,
    catalogKind: row.catalogKind as CatalogKind | null,
    varietyText: row.varietyText,
    varietyState: row.varietyState as VarietyState,
  };
}

function normalizeSourceKind(value: string): LineageSourceKind {
  if (value === "own_object" || value === "source_reference") {
    return value;
  }

  throw new Error("Unsupported provenance source type.");
}

function normalizeSourceReferenceKind(
  value: string | null | undefined,
): LineageSourceReferenceKind {
  const normalized = normalizeRequiredText(value, "Source reference type", 40);
  if (
    LINEAGE_SOURCE_REFERENCE_KINDS.includes(
      normalized as LineageSourceReferenceKind,
    )
  ) {
    return normalized as LineageSourceReferenceKind;
  }

  throw new Error("Unsupported provenance source reference type.");
}

function normalizeLineageClaimDecision(value: string): LineageClaimDecision {
  if (value === "confirmed" || value === "declined") {
    return value;
  }

  throw new Error("Unsupported lineage claim decision.");
}

function lineageClaimActionForDecision(
  decision: LineageClaimDecision,
): LineageClaimAuditAction {
  return decision === "confirmed" ? "confirm" : "decline";
}

function normalizeRequiredText(
  value: string | null | undefined,
  label: string,
  maxLength: number,
) {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }

  return normalized;
}
