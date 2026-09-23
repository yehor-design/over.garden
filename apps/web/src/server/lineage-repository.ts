import "server-only";

import { sql, type Insertable, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogKind,
  Database,
  LineageConsentState,
  LineageErasureState,
  LineagePendingSourceIdentity,
  LineagePendingSourceInviteState,
  LineageProvenanceEdge,
  LineageSourceKind,
  LineageSourceReferenceKind,
  LineageVisibilityPolicy,
  PlantObjectKind,
  VarietyState,
} from "@/db/schema";
import { lineageInvitationClaimPath } from "@/lib/garden/public-paths";
import {
  inspectLineageInviteToken,
  signLineageInviteToken,
  verifyLineageInviteToken,
  type LineageInviteVerification,
} from "@/server/lineage-invite-token";
import {
  lineageGardenerIdentitySql,
  mapLineageGardenerIdentity,
  type LineageGardenerIdentity,
} from "@/server/lineage-identity";
import type { RequestScope } from "@/server/request-scope";
import { optionalCatalogKindSql } from "@/server/catalog-kind-sql";

type QueryExecutor = Kysely<Database> | Transaction<Database>;
type CreateProvenanceSourceKind = Extract<
  LineageSourceKind,
  "own_object" | "source_reference"
>;

export interface CreateProvenanceEdgeInput {
  subjectPlantObjectId: string;
  sourceKind: string;
  sourcePlantObjectId?: string | null;
  sourceReferenceKind?: string | null;
  sourceReferenceLabel?: string | null;
  clientMutationId: string;
}

export interface CreateLineageInvitationInput {
  subjectPlantObjectId: string;
  pendingSourceLabel: string;
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
  pendingIdentity: LineagePendingSourceIdentityReadback | null;
  sourceReferenceKind: LineageSourceReferenceKind | null;
  sourceReferenceLabel: string | null;
  sourcePersonMention: `@${string}` | null;
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

export interface CreateLineageInvitationResult {
  edge: LineageProvenanceEdge;
  subjectObject: LineagePlantObjectOption;
  pendingIdentity: LineagePendingSourceIdentityReadback;
  isNewEdge: boolean;
}

export interface LineagePendingSourceIdentityReadback {
  id: string;
  displayLabel: string;
  inviteState: LineagePendingSourceInviteState;
  invitePath: string;
  /**
   * The link is signed from the invitation's creation and lasts thirty days;
   * past that the invited gardener is told it expired, so the writer is told
   * too rather than handed a link that no longer opens (`OVE-495`).
   */
  linkExpired: boolean;
  createdAt: Date | string;
}

export interface LineageClaimInboxItem {
  id: string;
  consentState: LineageConsentState;
  visibilityPolicy: LineageVisibilityPolicy;
  erasureState: LineageErasureState;
  subjectObject: LineagePlantObjectOption;
  sourceObject: LineagePlantObjectOption;
  /**
   * Who says their object came from yours — their public name and handle, or
   * null when there is no public profile to show you (`OVE-495`).
   */
  proposer: LineageGardenerIdentity | null;
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

export interface LineageInvitationClaimPreview {
  edgeId: string;
  consentState: LineageConsentState;
  pendingIdentity: {
    id: string;
    displayLabel: string;
    inviteState: LineagePendingSourceInviteState;
  };
  subjectObject: LineagePlantObjectOption;
  createdAt: Date | string;
}

/**
 * Every answer an invitation link can get, each its own sentence
 * (`OVE-495`, criterion 9). `ready` is the only one with a decision to make.
 */
export type LineageInvitationClaimState =
  | {
      state: "ready";
      preview: LineageInvitationClaimPreview;
      inviter: LineageGardenerIdentity | null;
    }
  | { state: "expired" }
  | { state: "invalid" }
  /** The record it points at was removed, or its object deleted. */
  | { state: "withdrawn" }
  /** Answered already — by this reader, or by somebody else. */
  | {
      state: "answered";
      byViewer: boolean;
      decision: "confirmed" | "declined" | null;
    }
  /** The reader wrote this invitation: it is for the other gardener. */
  | { state: "own"; preview: LineageInvitationClaimPreview };

export interface ResolveLineageInvitationClaimInput {
  token: string;
  decision: string;
}

export interface ResolveLineageInvitationClaimResult {
  edge: LineageProvenanceEdge;
  decision: LineageClaimDecision;
}

interface NormalizedCreateProvenanceEdgeInput {
  subjectPlantObjectId: string;
  sourceKind: CreateProvenanceSourceKind;
  sourcePlantObjectId: string | null;
  sourceReferenceKind: LineageSourceReferenceKind | null;
  sourceReferenceLabel: string | null;
  clientMutationId: string;
}

interface NormalizedCreateLineageInvitationInput {
  subjectPlantObjectId: string;
  pendingSourceLabel: string;
  clientMutationId: string;
}

interface NormalizedResolveLineageClaimInput {
  edgeId: string;
  decision: LineageClaimDecision;
}

/** An id from a URL is checked before it reaches a `uuid` column. */
const EDGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

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
  return rows.map(mapLineageClaimRow);
}

/**
 * One claim addressed to this gardener, in whatever state it is now — how the
 * inbox says what an answer did (`OVE-495`): the outcome it shows is the
 * stored one, read back, not the button that was pressed. Null when the claim
 * is not this gardener's to answer or no longer exists.
 */
export async function getLineageClaimRecord(
  scope: RequestScope,
  edgeId: string,
): Promise<LineageClaimInboxItem | null> {
  if (!EDGE_ID_PATTERN.test(edgeId)) return null;
  const row = await buildLineageClaimRecordQuery(
    db,
    scope,
    edgeId,
  ).executeTakeFirst();
  return row ? mapLineageClaimRow(row) : null;
}

function mapLineageClaimRow(
  row: Awaited<
    ReturnType<ReturnType<typeof buildLineageClaimInboxQuery>["execute"]>
  >[number],
): LineageClaimInboxItem {
  return {
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
    proposer: mapLineageGardenerIdentity(row.proposer),
    createdAt: row.created_at,
  };
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
      subject.objectKind,
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
      pendingIdentity: edge.pendingIdentityId
        ? pendingIdentityReadback({
            id: edge.pendingIdentityId,
            displayLabel: edge.pendingIdentityDisplayLabel ?? "Pending source",
            inviteState:
              edge.pendingIdentityInviteState as LineagePendingSourceInviteState,
            edgeId: edge.id,
            createdAt: edge.pendingIdentityCreatedAt ?? edge.created_at,
          })
        : null,
      sourceReferenceKind:
        edge.source_reference_kind as LineageSourceReferenceKind | null,
      sourceReferenceLabel: edge.source_reference_label,
      sourcePersonMention:
        edge.source_kind === "source_reference" &&
        edge.source_reference_kind === "person" &&
        edge.sourcePersonHandle
          ? `@${edge.sourcePersonHandle}`
          : null,
      createdAt: edge.created_at,
    })),
  };
}

/** A relation the domain does not allow, refused with a reason the form can say. */
/**
 * A decision that can no longer be made: the claim or invitation was
 * answered already, withdrawn, expired, or is not the reader's to answer
 * (`OVE-495`, criterion 9). Nothing was written. The pages read the record
 * again to say which of those it is, so this carries no reason of its own.
 */
export class LineageDecisionUnavailableError extends Error {
  constructor(readonly subject: "claim" | "invitation") {
    super(
      subject === "claim"
        ? "Lineage claim is not available for this gardener."
        : "Lineage invitation is not available.",
    );
    this.name = "LineageDecisionUnavailableError";
  }
}

export function isLineageDecisionUnavailableError(
  error: unknown,
): error is LineageDecisionUnavailableError {
  return error instanceof LineageDecisionUnavailableError;
}

export class ProvenanceRelationError extends Error {
  constructor(readonly reason: "cross_kind") {
    super(`Provenance relation refused: ${reason}.`);
    this.name = "ProvenanceRelationError";
  }
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
      // A plant comes from a plant and an animal from an animal; the form
      // offers only those, and a request that names another kind is refused
      // here rather than recorded (`OVE-491`, OG-UX-045).
      if (sourceRow.objectKind !== subjectObject.objectKind) {
        throw new ProvenanceRelationError("cross_kind");
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

export async function createLineageInvitation(
  scope: RequestScope,
  input: CreateLineageInvitationInput,
): Promise<CreateLineageInvitationResult> {
  const normalized = normalizeCreateLineageInvitationInput(input);
  const existing = await buildFindProvenanceEdgeByClientMutationQuery(
    db,
    scope,
    normalized.clientMutationId,
  ).executeTakeFirst();

  if (existing) {
    assertExistingInvitationEdgeMatchesInput(existing, normalized);
    return readCreateLineageInvitationResult(db, scope, existing, false);
  }

  return db.transaction().execute(async (trx) => {
    const subjectObject = await buildLineagePlantObjectByIdQuery(
      trx,
      scope,
      normalized.subjectPlantObjectId,
    ).executeTakeFirst();

    if (!subjectObject) {
      throw new Error("Lineage invitation subject object was not found.");
    }

    const pendingIdentity = await buildInsertLineagePendingSourceIdentityQuery(
      trx,
      {
        created_by_user_id: scope.userId,
        display_label: normalized.pendingSourceLabel,
        invite_state: "pending",
      },
    ).executeTakeFirstOrThrow();

    const edge = await buildInsertProvenanceEdgeQuery(trx, {
      owner_user_id: scope.userId,
      subject_plant_object_id: normalized.subjectPlantObjectId,
      source_kind: "pending_identity",
      source_plant_object_id: null,
      source_owner_user_id: null,
      source_pending_identity_id: pendingIdentity.id,
      source_reference_kind: null,
      source_reference_label: null,
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
        pendingIdentity: mapPendingIdentityReadback(pendingIdentity, edge.id),
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
      throw new Error(
        "Lineage invitation idempotency conflict could not be resolved.",
      );
    }

    await trx
      .deleteFrom("lineage_pending_source_identities")
      .where("id", "=", pendingIdentity.id)
      .execute();

    assertExistingInvitationEdgeMatchesInput(existingAfterConflict, normalized);
    return readCreateLineageInvitationResult(
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
      throw new LineageDecisionUnavailableError("claim");
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

/**
 * What an invitation link says to the reader holding it (`OVE-495`).
 *
 * The page used to ask only "can this be decided now", and every other case
 * was one sentence: "unavailable, expired or already handled". This reads the
 * record without the filters that make a decision possible and says which
 * case it is, so a reader who already answered, or who wrote the invitation
 * themselves, is told so instead of being told the link is broken. The
 * decision itself still goes through `resolveLineageInvitationClaim`.
 */
export async function getLineageInvitationClaimState(
  token: string,
  viewerUserId: string,
): Promise<LineageInvitationClaimState> {
  const inspection = inspectLineageInviteToken(token);
  if (inspection.state === "invalid") return { state: "invalid" };
  if (inspection.state === "expired") return { state: "expired" };

  const row = await buildLineageInvitationRecordQuery(
    db,
    inspection.verification,
    viewerUserId,
  ).executeTakeFirst();
  if (!row || row.erasure_state !== "active") return { state: "withdrawn" };
  if (row.pendingIdentityInviteState === "anonymized") {
    return { state: "withdrawn" };
  }
  if (
    row.consent_state !== "proposed" ||
    row.pendingIdentityInviteState !== "pending"
  ) {
    return {
      state: "answered",
      byViewer: row.pendingIdentityClaimedByUserId === viewerUserId,
      decision:
        row.pendingIdentityInviteState === "claimed"
          ? "confirmed"
          : row.pendingIdentityInviteState === "declined"
            ? "declined"
            : null,
    };
  }

  const preview: LineageInvitationClaimPreview = {
    edgeId: row.id,
    consentState: row.consent_state as LineageConsentState,
    pendingIdentity: {
      id: row.pendingIdentityId,
      displayLabel: row.pendingIdentityDisplayLabel,
      inviteState:
        row.pendingIdentityInviteState as LineagePendingSourceInviteState,
    },
    subjectObject: mapPlantObjectOption({
      id: row.subjectObjectId,
      displayName: row.subjectObjectDisplayName,
      objectKind: row.subjectObjectKind,
      catalogKind: row.subjectCatalogKind,
      varietyText: row.subjectVarietyText,
      varietyState: row.subjectVarietyState,
    }),
    createdAt: row.created_at,
  };
  if (row.owner_user_id === viewerUserId) return { state: "own", preview };
  return {
    state: "ready",
    preview,
    inviter: mapLineageGardenerIdentity(row.inviter),
  };
}

export async function resolveLineageInvitationClaim(
  scope: RequestScope,
  input: ResolveLineageInvitationClaimInput,
): Promise<ResolveLineageInvitationClaimResult> {
  const decision = normalizeLineageClaimDecision(input.decision);
  const verified = verifyLineageInviteToken(input.token);
  if (!verified) {
    throw new LineageDecisionUnavailableError("invitation");
  }
  const inviteState = decision === "confirmed" ? "claimed" : "declined";
  const now = new Date();

  return db.transaction().execute(async (trx) => {
    const edge = await buildResolveLineageInvitationClaimEdgeQuery(
      trx,
      verified,
      {
        decision,
        claimerUserId: scope.userId,
        now,
      },
    ).executeTakeFirst();

    if (!edge) {
      throw new LineageDecisionUnavailableError("invitation");
    }

    await buildResolveLineagePendingSourceIdentityClaimQuery(trx, verified, {
      claimedByUserId: scope.userId,
      inviteState,
      now,
    }).executeTakeFirstOrThrow();

    await buildInsertLineageClaimAuditEventQuery(trx, {
      edge_id: edge.id,
      actor_user_id: scope.userId,
      target_user_id: scope.userId,
      action: lineageClaimActionForDecision(decision),
      previous_consent_state: "proposed",
      new_consent_state: decision,
      visibility_policy: edge.visibility_policy,
    }).executeTakeFirstOrThrow();

    return {
      edge,
      decision,
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
      optionalCatalogKindSql("catalog_items").as("catalogKind"),
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
    ])
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("plant_objects.id", "=", plantObjectId ?? "");
}

/**
 * The objects a subject may name as its source: the owner's own, never the
 * subject itself, and — when the subject's kind is known — only of that kind
 * (`OVE-491`, OG-UX-045). A tomato is not grown from a bee colony, and a list
 * that offers one invites the mistake; `createProvenanceEdge` refuses it
 * whatever the form sent.
 */
export function buildLineageSourceObjectOptionsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  subjectPlantObjectId: string,
  objectKind?: string,
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
      optionalCatalogKindSql("catalog_items").as("catalogKind"),
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
    ])
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("plant_objects.id", "!=", subjectPlantObjectId)
    .$if(objectKind !== undefined, (query) =>
      query.where("plant_objects.object_kind", "=", objectKind ?? ""),
    )
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
    .leftJoin(
      "lineage_pending_source_identities as pending_identities",
      (join) =>
        join.onRef(
          "pending_identities.id",
          "=",
          "lineage_provenance_edges.source_pending_identity_id",
        ),
    )
    .leftJoin("user_handle_registry as source_person_handles", (join) =>
      join
        .onRef(
          "source_person_handles.user_id",
          "=",
          "lineage_provenance_edges.source_owner_user_id",
        )
        .on("source_person_handles.lifecycle_state", "=", "current")
        .on("lineage_provenance_edges.source_kind", "=", "source_reference")
        .on("lineage_provenance_edges.source_reference_kind", "=", "person"),
    )
    .leftJoin("user_public_profiles as source_person_profiles", (join) =>
      join
        .onRef(
          "source_person_profiles.user_id",
          "=",
          "source_person_handles.user_id",
        )
        .onRef(
          "source_person_profiles.normalized_handle",
          "=",
          "source_person_handles.normalized_handle",
        )
        .on("source_person_profiles.handle_registry_state", "=", "current")
        .on("source_person_profiles.profile_lifecycle_state", "=", "active")
        .on("source_person_profiles.removed_at", "is", null)
        .on(noActiveLineageProfileBlockPredicate()),
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
      optionalCatalogKindSql("source_catalog_items").as("sourceCatalogKind"),
      "source_objects.variety_text as sourceVarietyText",
      "source_objects.variety_state as sourceVarietyState",
      "pending_identities.id as pendingIdentityId",
      "pending_identities.display_label as pendingIdentityDisplayLabel",
      "pending_identities.invite_state as pendingIdentityInviteState",
      "pending_identities.created_at as pendingIdentityCreatedAt",
      "source_person_profiles.handle as sourcePersonHandle",
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

function noActiveLineageProfileBlockPredicate() {
  return sql<boolean>`not exists (
    select 1
    from profile_blocks
    where profile_blocks.block_state = 'active'
      and (
        (
          profile_blocks.blocker_user_id = ${sql.ref(
            "lineage_provenance_edges.owner_user_id",
          )}
          and profile_blocks.blocked_user_id = ${sql.ref(
            "lineage_provenance_edges.source_owner_user_id",
          )}
        )
        or (
          profile_blocks.blocker_user_id = ${sql.ref(
            "lineage_provenance_edges.source_owner_user_id",
          )}
          and profile_blocks.blocked_user_id = ${sql.ref(
            "lineage_provenance_edges.owner_user_id",
          )}
        )
      )
  )`;
}

export function buildLineageClaimInboxQuery(
  executor: QueryExecutor,
  scope: RequestScope,
) {
  return lineageClaimBaseQuery(executor, scope)
    .where("lineage_provenance_edges.consent_state", "=", "proposed")
    .where("lineage_provenance_edges.erasure_state", "=", "active")
    .orderBy("lineage_provenance_edges.created_at", "desc")
    .orderBy("lineage_provenance_edges.id", "asc");
}

/** The same claim as the inbox reads it, answered or not. */
export function buildLineageClaimRecordQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  edgeId: string,
) {
  return lineageClaimBaseQuery(executor, scope)
    .where("lineage_provenance_edges.erasure_state", "=", "active")
    .where("lineage_provenance_edges.id", "=", edgeId);
}

/**
 * A claim on one of this gardener's objects by another gardener: the edge,
 * both objects, and who made it. Nothing about the state it is in.
 */
function lineageClaimBaseQuery(executor: QueryExecutor, scope: RequestScope) {
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
      optionalCatalogKindSql("subject_catalog_items").as("subjectCatalogKind"),
      "subject_objects.variety_text as subjectVarietyText",
      "subject_objects.variety_state as subjectVarietyState",
      "source_objects.id as sourceObjectId",
      "source_objects.display_name as sourceObjectDisplayName",
      "source_objects.object_kind as sourceObjectKind",
      optionalCatalogKindSql("source_catalog_items").as("sourceCatalogKind"),
      "source_objects.variety_text as sourceVarietyText",
      "source_objects.variety_state as sourceVarietyState",
      lineageGardenerIdentitySql(
        "lineage_provenance_edges.owner_user_id",
        scope.userId,
      ).as("proposer"),
    ])
    .where("lineage_provenance_edges.source_owner_user_id", "=", scope.userId)
    .where("lineage_provenance_edges.owner_user_id", "!=", scope.userId)
    .where("lineage_provenance_edges.source_kind", "=", "own_object");
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

export function buildInsertLineagePendingSourceIdentityQuery(
  executor: QueryExecutor,
  input: Insertable<Database["lineage_pending_source_identities"]>,
) {
  return executor
    .insertInto("lineage_pending_source_identities")
    .values(input)
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

/**
 * The invitation's record as it is now, whatever state it is in: the edge
 * the token names, its pending identity and subject, and who wrote it — with
 * none of the filters that make a decision possible.
 */
export function buildLineageInvitationRecordQuery(
  executor: QueryExecutor,
  token: LineageInviteVerification,
  viewerUserId: string,
) {
  return executor
    .selectFrom("lineage_provenance_edges")
    .innerJoin(
      "lineage_pending_source_identities as pending_identities",
      (join) =>
        join.onRef(
          "pending_identities.id",
          "=",
          "lineage_provenance_edges.source_pending_identity_id",
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
      "lineage_provenance_edges.owner_user_id",
      "lineage_provenance_edges.consent_state",
      "lineage_provenance_edges.erasure_state",
      "lineage_provenance_edges.created_at",
      "pending_identities.id as pendingIdentityId",
      "pending_identities.display_label as pendingIdentityDisplayLabel",
      "pending_identities.invite_state as pendingIdentityInviteState",
      "pending_identities.claimed_by_user_id as pendingIdentityClaimedByUserId",
      "subject_objects.id as subjectObjectId",
      "subject_objects.display_name as subjectObjectDisplayName",
      "subject_objects.object_kind as subjectObjectKind",
      optionalCatalogKindSql("subject_catalog_items").as("subjectCatalogKind"),
      "subject_objects.variety_text as subjectVarietyText",
      "subject_objects.variety_state as subjectVarietyState",
      lineageGardenerIdentitySql(
        "lineage_provenance_edges.owner_user_id",
        viewerUserId,
      ).as("inviter"),
    ])
    .where("lineage_provenance_edges.id", "=", token.edgeId)
    .where(
      "lineage_provenance_edges.source_pending_identity_id",
      "=",
      token.pendingIdentityId,
    )
    .where("lineage_provenance_edges.source_kind", "=", "pending_identity")
    .where("pending_identities.id", "=", token.pendingIdentityId);
}

export function buildResolveLineageInvitationClaimEdgeQuery(
  executor: QueryExecutor,
  token: LineageInviteVerification,
  input: {
    decision: LineageClaimDecision;
    /**
     * The invitation is the other gardener's to answer. Its writer holds the
     * same link — it is how they send it — and answering it themselves would
     * confirm their own claim (`OVE-495`, criterion 9).
     */
    claimerUserId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("lineage_provenance_edges")
    .set({
      consent_state: input.decision,
      updated_at: input.now,
    })
    .where("id", "=", token.edgeId)
    .where("source_pending_identity_id", "=", token.pendingIdentityId)
    .where("source_kind", "=", "pending_identity")
    .where("consent_state", "=", "proposed")
    .where("erasure_state", "=", "active")
    .where("owner_user_id", "!=", input.claimerUserId)
    .returningAll();
}

export function buildResolveLineagePendingSourceIdentityClaimQuery(
  executor: QueryExecutor,
  token: LineageInviteVerification,
  input: {
    claimedByUserId: string;
    inviteState: Extract<
      LineagePendingSourceInviteState,
      "claimed" | "declined"
    >;
    now: Date;
  },
) {
  return executor
    .updateTable("lineage_pending_source_identities")
    .set({
      invite_state: input.inviteState,
      claimed_by_user_id: input.claimedByUserId,
      claimed_at: input.now,
      updated_at: input.now,
    })
    .where("id", "=", token.pendingIdentityId)
    .where("invite_state", "=", "pending")
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
  if (looksLikePrivateContact(label)) {
    throw new Error(
      "Source label cannot include contact details, handles, or URLs.",
    );
  }

  return label;
}

export function normalizeLineagePendingSourceLabel(value: string) {
  const label = normalizeRequiredText(value, "Invited source label", 120);
  if (looksLikePrivateContact(label)) {
    throw new Error(
      "Invited source label cannot include contact details, handles, or URLs.",
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

function normalizeCreateLineageInvitationInput(
  input: CreateLineageInvitationInput,
): NormalizedCreateLineageInvitationInput {
  return {
    subjectPlantObjectId: normalizeRequiredText(
      input.subjectPlantObjectId,
      "Subject object",
      80,
    ),
    pendingSourceLabel: normalizeLineagePendingSourceLabel(
      input.pendingSourceLabel,
    ),
    clientMutationId: normalizeRequiredText(
      input.clientMutationId,
      "Client mutation id",
      160,
    ),
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

async function readCreateLineageInvitationResult(
  executor: QueryExecutor,
  scope: RequestScope,
  edge: LineageProvenanceEdge,
  isNewEdge: boolean,
): Promise<CreateLineageInvitationResult> {
  const subjectObject = await buildLineagePlantObjectByIdQuery(
    executor,
    scope,
    edge.subject_plant_object_id,
  ).executeTakeFirst();

  if (!subjectObject) {
    throw new Error("Lineage invitation subject object was not found.");
  }

  if (!edge.source_pending_identity_id) {
    throw new Error("Lineage invitation pending identity was not found.");
  }

  const pendingIdentity = await executor
    .selectFrom("lineage_pending_source_identities")
    .selectAll()
    .where("id", "=", edge.source_pending_identity_id)
    .executeTakeFirst();

  if (!pendingIdentity) {
    throw new Error("Lineage invitation pending identity was not found.");
  }

  return {
    edge,
    subjectObject: mapPlantObjectOption(subjectObject),
    pendingIdentity: mapPendingIdentityReadback(pendingIdentity, edge.id),
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

function assertExistingInvitationEdgeMatchesInput(
  edge: LineageProvenanceEdge,
  input: NormalizedCreateLineageInvitationInput,
) {
  if (
    edge.subject_plant_object_id !== input.subjectPlantObjectId ||
    edge.source_kind !== "pending_identity" ||
    edge.source_pending_identity_id === null
  ) {
    throw new Error(
      "Client mutation id already belongs to another lineage invitation.",
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

function mapPendingIdentityReadback(
  pendingIdentity: LineagePendingSourceIdentity,
  edgeId: string,
): LineagePendingSourceIdentityReadback {
  return pendingIdentityReadback({
    id: pendingIdentity.id,
    displayLabel: pendingIdentity.display_label,
    inviteState:
      pendingIdentity.invite_state as LineagePendingSourceInviteState,
    edgeId,
    createdAt: pendingIdentity.created_at,
  });
}

function pendingIdentityReadback(input: {
  id: string;
  displayLabel: string;
  inviteState: LineagePendingSourceInviteState;
  edgeId: string;
  createdAt: Date | string;
}): LineagePendingSourceIdentityReadback {
  const token = signLineageInviteToken({
    pendingIdentityId: input.id,
    edgeId: input.edgeId,
    createdAt: input.createdAt,
  });
  return {
    id: input.id,
    displayLabel: input.displayLabel,
    inviteState: input.inviteState,
    invitePath: lineageInvitationClaimPath(token),
    linkExpired: inspectLineageInviteToken(token).state === "expired",
    createdAt: input.createdAt,
  };
}

function normalizeSourceKind(value: string): CreateProvenanceSourceKind {
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

/** Contact/handle/URL moderation for lineage labels and questions. */
export function looksLikePrivateContact(value: string) {
  return /(@|https?:\/\/|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{6,}\d)/i.test(
    value,
  );
}

export function normalizeRequiredText(
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
