import "server-only";

import { type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { CatalogItem, Database } from "@/db/schema";
import { createCatalogPublicSlug } from "@/lib/garden/public-paths";
import {
  buildEnqueueCatalogTypeaheadReindexJobQuery,
  findSelectableCatalogItem,
  normalizeCatalogItemId,
} from "@/server/catalog-repository";
import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import type { RequestScope } from "@/server/request-scope";

const MAX_CURATION_CANDIDATES = 25;
const CURATED_USER_SOURCE = "curated_user";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface CatalogCurationCandidate {
  id: string;
  displayName: string;
  normalizedName: string | null;
  locale: string;
  status: "provisional";
  source: string;
  createdAt: Date | string;
  affectedObjectCount: number;
}

export interface CatalogCurationDecisionInput {
  candidateId: string;
}

export interface MergeCatalogCurationCandidateInput extends CatalogCurationDecisionInput {
  targetCatalogItemId: string;
}

export interface CatalogCurationDecisionResult {
  candidate: CatalogItem;
  affectedObjectCount: number;
  publicEntryPaths: string[];
}

export async function listPendingCatalogCurationCandidates(
  limit = MAX_CURATION_CANDIDATES,
): Promise<CatalogCurationCandidate[]> {
  const rows = await buildPendingCatalogCurationCandidatesQuery(
    db,
    limit,
  ).execute();

  return rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    normalizedName: row.normalizedName,
    locale: row.locale,
    status: "provisional",
    source: row.source,
    createdAt: row.createdAt,
    affectedObjectCount: Number(row.affectedObjectCount),
  }));
}

export async function confirmCatalogCurationCandidate(
  scope: RequestScope,
  input: CatalogCurationDecisionInput,
): Promise<CatalogCurationDecisionResult> {
  const candidateId = normalizeCurationCandidateId(input.candidateId);
  const now = new Date();

  return db.transaction().execute(async (trx) => {
    const pendingCandidate = await requirePendingCatalogCurationCandidate(
      trx,
      candidateId,
    );
    const publicEntryPaths = await publicEntryPathsForCandidate(
      trx,
      candidateId,
    );

    const candidate = await buildConfirmCatalogCurationCandidateQuery(
      trx,
      scope,
      {
        candidateId,
        now,
        publicSlug: createCatalogPublicSlug(
          pendingCandidate.canonical_name,
          pendingCandidate.id,
        ),
      },
    ).executeTakeFirstOrThrow();

    const affectedObjects =
      await buildUpdateObjectsForConfirmedCatalogCandidateQuery(trx, {
        candidateId,
        varietyText: candidate.canonical_name,
        now,
      }).execute();

    await buildEnqueueCatalogTypeaheadReindexJobQuery(trx).executeTakeFirst();

    return {
      candidate,
      affectedObjectCount: affectedObjects.length,
      publicEntryPaths,
    };
  });
}

export async function mergeCatalogCurationCandidate(
  scope: RequestScope,
  input: MergeCatalogCurationCandidateInput,
): Promise<CatalogCurationDecisionResult> {
  const candidateId = normalizeCurationCandidateId(input.candidateId);
  const targetCatalogItemId = normalizeCurationCandidateId(
    input.targetCatalogItemId,
  );
  if (candidateId === targetCatalogItemId) {
    throw new Error("A candidate cannot be merged into itself.");
  }

  const now = new Date();

  return db.transaction().execute(async (trx) => {
    await requirePendingCatalogCurationCandidate(trx, candidateId);
    const targetCatalogItem = await findSelectableCatalogItem(
      trx,
      targetCatalogItemId,
    );

    if (!targetCatalogItem) {
      throw new Error("Target catalog item was not found.");
    }

    const publicEntryPaths = await publicEntryPathsForCandidate(
      trx,
      candidateId,
    );

    const affectedObjects =
      await buildUpdateObjectsForMergedCatalogCandidateQuery(trx, {
        candidateId,
        targetCatalogItemId: targetCatalogItem.id,
        varietyText: targetCatalogItem.canonicalName,
        now,
      }).execute();

    const candidate = await buildMergeCatalogCurationCandidateQuery(
      trx,
      scope,
      {
        candidateId,
        targetCatalogItemId: targetCatalogItem.id,
        now,
      },
    ).executeTakeFirstOrThrow();

    await buildEnqueueCatalogTypeaheadReindexJobQuery(trx).executeTakeFirst();

    return {
      candidate,
      affectedObjectCount: affectedObjects.length,
      publicEntryPaths,
    };
  });
}

export async function rejectCatalogCurationCandidate(
  scope: RequestScope,
  input: CatalogCurationDecisionInput,
): Promise<CatalogCurationDecisionResult> {
  const candidateId = normalizeCurationCandidateId(input.candidateId);
  const now = new Date();

  return db.transaction().execute(async (trx) => {
    await requirePendingCatalogCurationCandidate(trx, candidateId);
    const candidate = await buildRejectCatalogCurationCandidateQuery(
      trx,
      scope,
      {
        candidateId,
        now,
      },
    ).executeTakeFirstOrThrow();

    await buildEnqueueCatalogTypeaheadReindexJobQuery(trx).executeTakeFirst();

    return {
      candidate,
      affectedObjectCount: 0,
      publicEntryPaths: [],
    };
  });
}

export function buildPendingCatalogCurationCandidatesQuery(
  executor: QueryExecutor,
  limit = MAX_CURATION_CANDIDATES,
) {
  const boundedLimit = normalizeCurationLimit(limit);

  return executor
    .selectFrom("catalog_items")
    .leftJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.catalog_item_id", "=", "catalog_items.id")
        .on("plant_objects.variety_state", "=", "user_added"),
    )
    .select(({ fn }) => [
      "catalog_items.id as id",
      "catalog_items.canonical_name as displayName",
      "catalog_items.normalized_name as normalizedName",
      "catalog_items.locale as locale",
      "catalog_items.source as source",
      "catalog_items.created_at as createdAt",
      fn.count<number>("plant_objects.id").as("affectedObjectCount"),
    ])
    .where("catalog_items.status", "=", "provisional")
    .where("catalog_items.source", "=", "user_added")
    .where("catalog_items.created_by_user_id", "is not", null)
    .groupBy([
      "catalog_items.id",
      "catalog_items.canonical_name",
      "catalog_items.normalized_name",
      "catalog_items.locale",
      "catalog_items.source",
      "catalog_items.created_at",
    ])
    .orderBy("catalog_items.created_at", "asc")
    .limit(boundedLimit);
}

export function buildPendingCatalogCurationCandidateByIdQuery(
  executor: QueryExecutor,
  candidateId: string,
) {
  return executor
    .selectFrom("catalog_items")
    .selectAll("catalog_items")
    .where("id", "=", candidateId)
    .where("status", "=", "provisional")
    .where("source", "=", "user_added")
    .where("created_by_user_id", "is not", null);
}

export function buildConfirmCatalogCurationCandidateQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    candidateId: string;
    now: Date;
    publicSlug: string;
  },
) {
  return executor
    .updateTable("catalog_items")
    .set({
      status: "confirmed",
      source: CURATED_USER_SOURCE,
      public_slug: input.publicSlug,
      created_by_user_id: null,
      reviewed_at: input.now,
      reviewed_by_user_id: scope.userId,
      merged_into_catalog_item_id: null,
      updated_at: input.now,
    })
    .where("id", "=", input.candidateId)
    .where("status", "=", "provisional")
    .where("source", "=", "user_added")
    .where("created_by_user_id", "is not", null)
    .returningAll();
}

export function buildMergeCatalogCurationCandidateQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    candidateId: string;
    targetCatalogItemId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("catalog_items")
    .set({
      status: "merged",
      reviewed_at: input.now,
      reviewed_by_user_id: scope.userId,
      merged_into_catalog_item_id: input.targetCatalogItemId,
      updated_at: input.now,
    })
    .where("id", "=", input.candidateId)
    .where("status", "=", "provisional")
    .where("source", "=", "user_added")
    .where("created_by_user_id", "is not", null)
    .returningAll();
}

export function buildRejectCatalogCurationCandidateQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    candidateId: string;
    now: Date;
  },
) {
  return executor
    .updateTable("catalog_items")
    .set({
      status: "rejected",
      reviewed_at: input.now,
      reviewed_by_user_id: scope.userId,
      merged_into_catalog_item_id: null,
      updated_at: input.now,
    })
    .where("id", "=", input.candidateId)
    .where("status", "=", "provisional")
    .where("source", "=", "user_added")
    .where("created_by_user_id", "is not", null)
    .returningAll();
}

export function buildUpdateObjectsForConfirmedCatalogCandidateQuery(
  executor: QueryExecutor,
  input: {
    candidateId: string;
    varietyText: string;
    now: Date;
  },
) {
  return executor
    .updateTable("plant_objects")
    .set({
      variety_text: input.varietyText,
      variety_state: "selected",
      updated_at: input.now,
    })
    .where("catalog_item_id", "=", input.candidateId)
    .where("variety_state", "=", "user_added")
    .returning(["id"]);
}

export function buildUpdateObjectsForMergedCatalogCandidateQuery(
  executor: QueryExecutor,
  input: {
    candidateId: string;
    targetCatalogItemId: string;
    varietyText: string;
    now: Date;
  },
) {
  return executor
    .updateTable("plant_objects")
    .set({
      catalog_item_id: input.targetCatalogItemId,
      variety_text: input.varietyText,
      variety_state: "selected",
      updated_at: input.now,
    })
    .where("catalog_item_id", "=", input.candidateId)
    .where("variety_state", "=", "user_added")
    .returning(["id"]);
}

export function buildPublicEntrySlugsForCatalogCandidateQuery(
  executor: QueryExecutor,
  candidateId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .innerJoin(
      "plant_objects",
      "plant_objects.id",
      "journal_entries.plant_object_id",
    )
    .select("journal_entries.public_slug as publicSlug")
    .where("plant_objects.catalog_item_id", "=", candidateId)
    .where("plant_objects.variety_state", "=", "user_added")
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null);
}

async function requirePendingCatalogCurationCandidate(
  executor: QueryExecutor,
  candidateId: string,
): Promise<CatalogItem> {
  const candidate = await buildPendingCatalogCurationCandidateByIdQuery(
    executor,
    candidateId,
  ).executeTakeFirst();

  if (!candidate) {
    throw new Error("Pending catalog candidate was not found.");
  }

  return candidate;
}

async function publicEntryPathsForCandidate(
  executor: QueryExecutor,
  candidateId: string,
) {
  const rows = await buildPublicEntrySlugsForCatalogCandidateQuery(
    executor,
    candidateId,
  ).execute();

  return rows.flatMap((row) =>
    row.publicSlug ? [publicJournalEntryPath(row.publicSlug)] : [],
  );
}

function normalizeCurationCandidateId(value: string | null | undefined) {
  const normalized = normalizeCatalogItemId(value);
  if (!normalized) throw new Error("Catalog candidate id is required.");
  return normalized;
}

function normalizeCurationLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_CURATION_CANDIDATES;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_CURATION_CANDIDATES);
}
