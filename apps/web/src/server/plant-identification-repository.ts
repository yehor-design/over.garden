import "server-only";

import { randomUUID } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, JsonValue } from "@/db/schema";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export type PlantIdentificationState =
  | "ready_to_submit"
  | "submitting"
  | "shortlist_ready"
  | "provider_rejected_non_plant"
  | "no_species_found"
  | "catalog_mapping_incomplete"
  | "quota_exhausted"
  | "rate_limited"
  | "provider_timeout"
  | "provider_unavailable"
  | "invalid_media"
  | "canceled"
  | "completed";

export type PlantIdentificationErrorClass =
  | Exclude<
      PlantIdentificationState,
      | "ready_to_submit"
      | "submitting"
      | "shortlist_ready"
      | "completed"
      | "canceled"
    >
  | "provider_schema";

export interface IdentificationMediaManifestItem {
  mediaAssetId: string;
  derivativeSha256: string;
}

export interface IdentificationCandidateInput {
  rank: number;
  score: number;
  scientificName: string;
  genus: string | null;
  family: string | null;
  mappingStatus: "mapped" | "unmapped" | "ambiguous";
  catalogItemId: string | null;
}

export interface PlantIdentificationReceipt {
  id: string;
  state: PlantIdentificationState;
  canConfirm: boolean;
  candidates: Array<{
    rank: number;
    score: number;
    scientificName: string;
    genus: string | null;
    family: string | null;
    catalogItemId: string | null;
  }>;
}

export async function createOrReadPlantIdentificationRequest(
  scope: RequestScope,
  input: {
    plantObjectId: string | null;
    fingerprint: string;
    mediaManifest: readonly IdentificationMediaManifestItem[];
    organs: readonly string[];
    policyVersion: string;
  },
): Promise<{ id: string; state: PlantIdentificationState; isNew: boolean }> {
  return db.transaction().execute(async (trx) => {
    const inserted = await trx
      .insertInto("plant_identification_requests")
      .values({
        owner_user_id: scope.userId,
        plant_object_id: input.plantObjectId,
        fingerprint: input.fingerprint,
        media_manifest: JSON.stringify(input.mediaManifest) as unknown as JsonValue,
        organs: [...input.organs],
        policy_version: input.policyVersion,
      })
      .onConflict((oc) =>
        oc.columns(["owner_user_id", "fingerprint"]).doNothing(),
      )
      .returning(["id", "state"])
      .executeTakeFirst();
    if (inserted) {
      return {
        id: inserted.id,
        state: inserted.state as PlantIdentificationState,
        isNew: true,
      };
    }
    const existing = await trx
      .selectFrom("plant_identification_requests")
      .select(["id", "state"])
      .where("owner_user_id", "=", scope.userId)
      .where("fingerprint", "=", input.fingerprint)
      .executeTakeFirstOrThrow();
    return {
      id: existing.id,
      state: existing.state as PlantIdentificationState,
      isNew: false,
    };
  });
}

export async function claimPlantIdentificationSubmission(
  scope: RequestScope,
  requestId: string,
): Promise<{ claimToken: string } | null> {
  const claimToken = randomUUID();
  try {
    return await db.transaction().execute(async (trx) => {
      // Restore a capacity row after account erasure cascaded an occupied
      // lease. Slots never contain a user id or provider payload.
      await trx
        .insertInto("plant_identification_submission_slots")
        .values([{ slot: 1 }, { slot: 2 }, { slot: 3 }, { slot: 4 }])
        .onConflict((oc) => oc.column("slot").doNothing())
        .execute();
      await trx
        .updateTable("plant_identification_submission_slots")
        .set({ request_id: null, claim_token: null, claim_expires_at: null })
        .where("claim_expires_at", "<", sql<Date>`now()`)
        .execute();
      // A crashed worker cannot hold the owner or global gate forever. This
      // only terminalizes the old attempt; it never resubmits provider data.
      await trx
        .updateTable("plant_identification_requests")
        .set({
          state: "provider_timeout",
          error_class: "provider_timeout",
          claim_token: null,
          claim_expires_at: null,
          completed_at: sql<Date>`now()`,
          updated_at: sql<Date>`now()`,
        })
        .where("owner_user_id", "=", scope.userId)
        .where("state", "=", "submitting")
        .where("claim_expires_at", "<", sql<Date>`now()`)
        .execute();
      const slot = await trx
        .selectFrom("plant_identification_submission_slots")
        .select("slot")
        .where("request_id", "is", null)
        .orderBy("slot", "asc")
        .forUpdate()
        .skipLocked()
        .limit(1)
        .executeTakeFirst();
      if (!slot) return null;

      const claimed = await trx
        .updateTable("plant_identification_requests")
        .set({
          state: "submitting",
          claim_token: claimToken,
          claim_expires_at: sql<Date>`now() + interval '30 seconds'`,
          submitted_at: sql<Date>`now()`,
          updated_at: sql<Date>`now()`,
        })
        .where("id", "=", requestId)
        .where("owner_user_id", "=", scope.userId)
        .where("state", "=", "ready_to_submit")
        .returning(["id", "claim_expires_at"])
        .executeTakeFirst();
      if (!claimed?.claim_expires_at) return null;

      const leased = await trx
        .updateTable("plant_identification_submission_slots")
        .set({
          request_id: claimed.id,
          claim_token: claimToken,
          claim_expires_at: claimed.claim_expires_at,
        })
        .where("slot", "=", slot.slot)
        .where("request_id", "is", null)
        .returning("slot")
        .executeTakeFirst();
      if (!leased) {
        throw new Error("Plant identification submission slot was lost.");
      }
      return { claimToken };
    });
  } catch (error) {
    // The partial owner-in-flight unique index wins a same-user race. It is a
    // normal bounded receipt, not an error worth retrying or logging.
    if ((error as { code?: unknown }).code === "23505") return null;
    throw error;
  }
}

export async function settlePlantIdentificationCandidates(
  scope: RequestScope,
  input: {
    requestId: string;
    claimToken: string;
    durationMs: number;
    quotaRemaining: number | null;
    modelVersion: string | null;
    candidates: readonly IdentificationCandidateInput[];
  },
): Promise<boolean> {
  return db.transaction().execute(async (trx) => {
    const request = await trx
      .selectFrom("plant_identification_requests")
      .select("id")
      .where("id", "=", input.requestId)
      .where("owner_user_id", "=", scope.userId)
      .where("state", "=", "submitting")
      .where("claim_token", "=", input.claimToken)
      .where("claim_expires_at", ">", sql<Date>`now()`)
      .executeTakeFirst();
    if (!request) return false;

    if (input.candidates.length > 0) {
      await trx
        .insertInto("plant_identification_candidates")
        .values(
          input.candidates.map((candidate) => ({
            request_id: input.requestId,
            rank: candidate.rank,
            score: candidate.score,
            scientific_name: candidate.scientificName,
            genus: candidate.genus,
            family: candidate.family,
            mapping_status: candidate.mappingStatus,
            catalog_item_id: candidate.catalogItemId,
          })),
        )
        .execute();
    }
    const hasMappedCandidate = input.candidates.some(
      (candidate) => candidate.mappingStatus === "mapped",
    );
    const nextState: PlantIdentificationState = hasMappedCandidate
      ? "shortlist_ready"
      : "catalog_mapping_incomplete";
    const updated = await trx
      .updateTable("plant_identification_requests")
      .set({
        state: nextState,
        error_class: hasMappedCandidate ? null : "catalog_mapping_incomplete",
        claim_token: null,
        claim_expires_at: null,
        completed_at: sql<Date>`now()`,
        request_duration_ms: Math.min(
          Math.max(Math.trunc(input.durationMs), 0),
          15_000,
        ),
        quota_remaining: input.quotaRemaining,
        model_version: input.modelVersion,
        updated_at: sql<Date>`now()`,
      })
      .where("id", "=", input.requestId)
      .where("owner_user_id", "=", scope.userId)
      .where("state", "=", "submitting")
      .where("claim_token", "=", input.claimToken)
      .returning("id")
      .executeTakeFirst();
    if (updated) {
      await releasePlantIdentificationSlot(trx, input);
    }
    return Boolean(updated);
  });
}

export async function settlePlantIdentificationFailure(
  scope: RequestScope,
  input: {
    requestId: string;
    claimToken: string;
    errorClass: PlantIdentificationErrorClass;
  },
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const settled = await trx
      .updateTable("plant_identification_requests")
      .set({
        state:
          input.errorClass === "provider_schema"
            ? "provider_unavailable"
            : input.errorClass,
        error_class: input.errorClass,
        claim_token: null,
        claim_expires_at: null,
        completed_at: sql<Date>`now()`,
        updated_at: sql<Date>`now()`,
      })
      .where("id", "=", input.requestId)
      .where("owner_user_id", "=", scope.userId)
      .where("state", "=", "submitting")
      .where("claim_token", "=", input.claimToken)
      .returning("id")
      .executeTakeFirst();
    if (settled) await releasePlantIdentificationSlot(trx, input);
  });
}

async function releasePlantIdentificationSlot(
  trx: Transaction<Database>,
  input: { requestId: string; claimToken: string },
) {
  await trx
    .updateTable("plant_identification_submission_slots")
    .set({ request_id: null, claim_token: null, claim_expires_at: null })
    .where("request_id", "=", input.requestId)
    .where("claim_token", "=", input.claimToken)
    .execute();
}

export async function readPlantIdentificationTarget(
  scope: RequestScope,
  requestId: string,
): Promise<string | null> {
  const request = await db
    .selectFrom("plant_identification_requests")
    .select("plant_object_id as plantObjectId")
    .where("id", "=", requestId)
    .where("owner_user_id", "=", scope.userId)
    .executeTakeFirst();
  return request?.plantObjectId ?? null;
}

export async function readPlantIdentificationReceipt(
  scope: RequestScope,
  requestId: string,
  executor: QueryExecutor = db,
): Promise<PlantIdentificationReceipt | null> {
  const request = await executor
    .selectFrom("plant_identification_requests")
    .select(["id", "state"])
    .where("id", "=", requestId)
    .where("owner_user_id", "=", scope.userId)
    .executeTakeFirst();
  if (!request) return null;

  const candidates = await executor
    .selectFrom("plant_identification_candidates")
    .select([
      "rank",
      "score",
      "scientific_name as scientificName",
      "genus",
      "family",
      "mapping_status as mappingStatus",
      "catalog_item_id as catalogItemId",
    ])
    .where("request_id", "=", request.id)
    .orderBy("rank", "asc")
    .execute();
  return {
    id: request.id,
    state: request.state as PlantIdentificationState,
    canConfirm: request.state === "shortlist_ready",
    candidates: candidates
      .filter(
        (candidate) =>
          candidate.mappingStatus === "mapped" && candidate.catalogItemId,
      )
      .map((candidate) => ({
        rank: candidate.rank,
        score: Number(candidate.score),
        scientificName: candidate.scientificName,
        genus: candidate.genus,
        family: candidate.family,
        catalogItemId: candidate.catalogItemId,
      })),
  };
}

export async function recordPlantIdentificationDecision(
  scope: RequestScope,
  input: PlantIdentificationDecisionInput,
): Promise<void> {
  await db
    .transaction()
    .execute((trx) =>
      recordPlantIdentificationDecisionInTransaction(trx, scope, input),
    );
}

export interface PlantIdentificationDecisionInput {
  requestId: string;
  decision: "confirmed" | "manual" | "unknown" | "dismissed";
  selectedCandidateRank?: number | null;
  selectedCatalogItemId?: string | null;
}

export async function recordPlantIdentificationDecisionInTransaction(
  trx: Transaction<Database>,
  scope: RequestScope,
  input: PlantIdentificationDecisionInput,
): Promise<void> {
  const request = await trx
    .selectFrom("plant_identification_requests")
    .select(["id", "state"])
    .where("id", "=", input.requestId)
    .where("owner_user_id", "=", scope.userId)
    .executeTakeFirstOrThrow();
  if (request.state !== "shortlist_ready" && input.decision === "confirmed") {
    throw new Error("This identification has no confirmable candidate.");
  }
  if (input.decision === "confirmed") {
    const candidate = await trx
      .selectFrom("plant_identification_candidates")
      .select([
        "rank",
        "catalog_item_id as catalogItemId",
        "mapping_status as mappingStatus",
      ])
      .where("request_id", "=", request.id)
      .where("rank", "=", input.selectedCandidateRank ?? -1)
      .executeTakeFirst();
    if (
      !candidate ||
      candidate.mappingStatus !== "mapped" ||
      candidate.catalogItemId !== input.selectedCatalogItemId
    ) {
      throw new Error("Selected species is not safe to confirm.");
    }
  }
  await trx
    .insertInto("plant_identification_decisions")
    .values({
      request_id: request.id,
      owner_user_id: scope.userId,
      decision: input.decision,
      selected_candidate_rank:
        input.decision === "confirmed"
          ? (input.selectedCandidateRank ?? null)
          : null,
      selected_catalog_item_id:
        input.decision === "confirmed"
          ? (input.selectedCatalogItemId ?? null)
          : null,
    })
    .onConflict((oc) => oc.column("request_id").doNothing())
    .execute();
  await trx
    .updateTable("plant_identification_requests")
    .set({
      state: "completed",
      completed_at: sql<Date>`now()`,
      updated_at: sql<Date>`now()`,
    })
    .where("id", "=", request.id)
    .where("owner_user_id", "=", scope.userId)
    .where("state", "in", ["shortlist_ready", "catalog_mapping_incomplete"])
    .execute();
}
