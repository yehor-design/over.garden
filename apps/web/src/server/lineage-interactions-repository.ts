import "server-only";

import { sql, type Insertable, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogKind,
  Database,
  LineageNodeFollow,
  LineageQuestion,
  PlantObjectKind,
  VarietyState,
} from "@/db/schema";
import {
  looksLikePrivateContactOrPreciseLocation,
  normalizeRequiredText,
} from "@/server/lineage-repository";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const LINEAGE_FOLLOW_DAILY_LIMIT = 25;
const LINEAGE_QUESTION_DAILY_LIMIT = 6;
const LINEAGE_QUESTION_EDGE_DAILY_LIMIT = 2;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface LineageInteractionTarget {
  edgeId: string;
  targetPlantObjectId: string;
}

export interface FollowLineageNodeInput {
  edgeId: string;
  targetPlantObjectId: string;
}

export interface AskLineageQuestionInput {
  edgeId: string;
  targetPlantObjectId: string;
  questionText: string;
  clientMutationId: string;
}

export interface LineageFollowResult {
  follow: LineageNodeFollow;
  isNewFollow: boolean;
}

export interface LineageQuestionResult {
  question: LineageQuestion;
  isNewQuestion: boolean;
}

export interface LineageInteractionObjectReadback {
  id: string;
  displayName: string;
  objectKind: PlantObjectKind;
  catalogKind: CatalogKind | null;
  varietyText: string | null;
  varietyState: VarietyState;
}

export interface LineageQuestionInboxItem {
  id: string;
  questionText: string;
  targetObject: LineageInteractionObjectReadback;
  createdAt: Date | string;
}

export interface LineageFollowReadbackItem {
  id: string;
  targetObject: LineageInteractionObjectReadback;
  createdAt: Date | string;
}

interface NormalizedFollowLineageNodeInput {
  edgeId: string;
  targetPlantObjectId: string;
}

interface NormalizedAskLineageQuestionInput
  extends NormalizedFollowLineageNodeInput {
  questionText: string;
  clientMutationId: string;
}

interface EligibleLineageInteractionEdge {
  edgeId: string;
  subjectPlantObjectId: string;
  sourcePlantObjectId: string;
  ownerUserId: string;
  sourceOwnerUserId: string;
  targetOwnerUserId: string;
}

export async function listLineageInteractionTargets(
  scope: RequestScope,
  edgeIds: string[],
): Promise<LineageInteractionTarget[]> {
  const normalizedEdgeIds = [
    ...new Set(
      edgeIds
        .map((edgeId) => edgeId.trim())
        .filter((edgeId) => edgeId.length > 0 && edgeId.length <= 80),
    ),
  ];

  if (normalizedEdgeIds.length === 0) return [];

  const rows = await buildLineageInteractionTargetsForEdgesQuery(
    db,
    scope,
    normalizedEdgeIds,
  ).execute();

  return rows.flatMap((row) => {
    if (!row.sourcePlantObjectId || !row.sourceOwnerUserId) return [];

    if (row.ownerUserId === scope.userId) {
      return [
        {
          edgeId: row.id,
          targetPlantObjectId: row.sourcePlantObjectId,
        },
      ];
    }

    if (row.sourceOwnerUserId === scope.userId) {
      return [
        {
          edgeId: row.id,
          targetPlantObjectId: row.subjectPlantObjectId,
        },
      ];
    }

    return [];
  });
}

export async function followLineageNode(
  scope: RequestScope,
  input: FollowLineageNodeInput,
  now: Date = new Date(),
): Promise<LineageFollowResult> {
  const normalized = normalizeFollowLineageNodeInput(input);
  const since = new Date(now.getTime() - ONE_DAY_MS);

  return db.transaction().execute(async (trx) => {
    const existing = await buildFindLineageFollowQuery(
      trx,
      scope,
      normalized.targetPlantObjectId,
    ).executeTakeFirst();

    if (existing) {
      return { follow: existing, isNewFollow: false };
    }

    const eligibility = await readEligibleLineageInteractionEdge(
      trx,
      scope,
      normalized,
    );
    const recentCount = await buildCountRecentLineageFollowsQuery(
      trx,
      scope,
      since,
    ).executeTakeFirst();

    if (Number(recentCount?.count ?? 0) >= LINEAGE_FOLLOW_DAILY_LIMIT) {
      throw new Error("Lineage follow limit reached. Try again later.");
    }

    const follow = await buildInsertLineageFollowQuery(trx, {
      follower_user_id: scope.userId,
      target_owner_user_id: eligibility.targetOwnerUserId,
      target_plant_object_id: normalized.targetPlantObjectId,
      lineage_edge_id: eligibility.edgeId,
      follow_state: "active",
    }).executeTakeFirst();

    if (follow) {
      return { follow, isNewFollow: true };
    }

    const existingAfterConflict = await buildFindLineageFollowQuery(
      trx,
      scope,
      normalized.targetPlantObjectId,
    ).executeTakeFirst();

    if (!existingAfterConflict) {
      throw new Error("Lineage follow conflict could not be resolved.");
    }

    return { follow: existingAfterConflict, isNewFollow: false };
  });
}

export async function askLineageQuestion(
  scope: RequestScope,
  input: AskLineageQuestionInput,
  now: Date = new Date(),
): Promise<LineageQuestionResult> {
  const normalized = normalizeAskLineageQuestionInput(input);
  const since = new Date(now.getTime() - ONE_DAY_MS);

  return db.transaction().execute(async (trx) => {
    const existing = await buildFindLineageQuestionByClientMutationQuery(
      trx,
      scope,
      normalized.clientMutationId,
    ).executeTakeFirst();

    if (existing) {
      assertExistingQuestionMatchesInput(existing, normalized);
      return { question: existing, isNewQuestion: false };
    }

    const eligibility = await readEligibleLineageInteractionEdge(
      trx,
      scope,
      normalized,
    );

    const [recentForAsker, recentForEdge] = await Promise.all([
      buildCountRecentLineageQuestionsQuery(trx, scope, {
        since,
      }).executeTakeFirst(),
      buildCountRecentLineageQuestionsQuery(trx, scope, {
        since,
        edgeId: normalized.edgeId,
      }).executeTakeFirst(),
    ]);

    if (Number(recentForAsker?.count ?? 0) >= LINEAGE_QUESTION_DAILY_LIMIT) {
      throw new Error("Lineage question limit reached. Try again later.");
    }

    if (
      Number(recentForEdge?.count ?? 0) >= LINEAGE_QUESTION_EDGE_DAILY_LIMIT
    ) {
      throw new Error(
        "Lineage question limit for this chain reached. Try again later.",
      );
    }

    const question = await buildInsertLineageQuestionQuery(trx, {
      asker_user_id: scope.userId,
      recipient_user_id: eligibility.targetOwnerUserId,
      lineage_edge_id: eligibility.edgeId,
      subject_plant_object_id: eligibility.subjectPlantObjectId,
      target_plant_object_id: normalized.targetPlantObjectId,
      question_text: normalized.questionText,
      question_state: "delivered",
      client_mutation_id: normalized.clientMutationId,
    }).executeTakeFirst();

    if (question) {
      return { question, isNewQuestion: true };
    }

    const existingAfterConflict =
      await buildFindLineageQuestionByClientMutationQuery(
        trx,
        scope,
        normalized.clientMutationId,
      ).executeTakeFirst();

    if (!existingAfterConflict) {
      throw new Error("Lineage question conflict could not be resolved.");
    }

    assertExistingQuestionMatchesInput(existingAfterConflict, normalized);
    return { question: existingAfterConflict, isNewQuestion: false };
  });
}

export async function listLineageQuestionInbox(
  scope: RequestScope,
): Promise<LineageQuestionInboxItem[]> {
  const rows = await buildLineageQuestionInboxQuery(db, scope).execute();
  return rows.map((row) => ({
    id: row.id,
    questionText: row.question_text,
    targetObject: mapInteractionObjectReadback({
      id: row.targetObjectId,
      displayName: row.targetObjectDisplayName,
      objectKind: row.targetObjectKind,
      catalogKind: row.targetCatalogKind,
      varietyText: row.targetVarietyText,
      varietyState: row.targetVarietyState,
    }),
    createdAt: row.created_at,
  }));
}

export async function listLineageFollowReadback(
  scope: RequestScope,
): Promise<LineageFollowReadbackItem[]> {
  const rows = await buildLineageFollowReadbackQuery(db, scope).execute();
  return rows.map((row) => ({
    id: row.id,
    targetObject: mapInteractionObjectReadback({
      id: row.targetObjectId,
      displayName: row.targetObjectDisplayName,
      objectKind: row.targetObjectKind,
      catalogKind: row.targetCatalogKind,
      varietyText: row.targetVarietyText,
      varietyState: row.targetVarietyState,
    }),
    createdAt: row.created_at,
  }));
}

export function buildLineageInteractionTargetsForEdgesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  edgeIds: string[],
) {
  return publicSafeConfirmedLineageEdgesBaseQuery(executor)
    .select([
      "lineage_provenance_edges.id",
      "lineage_provenance_edges.subject_plant_object_id as subjectPlantObjectId",
      "lineage_provenance_edges.source_plant_object_id as sourcePlantObjectId",
      "lineage_provenance_edges.owner_user_id as ownerUserId",
      "lineage_provenance_edges.source_owner_user_id as sourceOwnerUserId",
    ])
    .where("lineage_provenance_edges.id", "in", edgeIds)
    .where((eb) =>
      eb.or([
        eb("lineage_provenance_edges.owner_user_id", "=", scope.userId),
        eb("lineage_provenance_edges.source_owner_user_id", "=", scope.userId),
      ]),
    )
    .whereRef(
      "lineage_provenance_edges.owner_user_id",
      "!=",
      "lineage_provenance_edges.source_owner_user_id",
    );
}

export function buildLineageInteractionEligibilityQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: NormalizedFollowLineageNodeInput,
) {
  return publicSafeConfirmedLineageEdgesBaseQuery(executor)
    .select([
      "lineage_provenance_edges.id",
      "lineage_provenance_edges.subject_plant_object_id as subjectPlantObjectId",
      "lineage_provenance_edges.source_plant_object_id as sourcePlantObjectId",
      "lineage_provenance_edges.owner_user_id as ownerUserId",
      "lineage_provenance_edges.source_owner_user_id as sourceOwnerUserId",
    ])
    .where("lineage_provenance_edges.id", "=", input.edgeId)
    .where((eb) =>
      eb.or([
        eb(
          "lineage_provenance_edges.subject_plant_object_id",
          "=",
          input.targetPlantObjectId,
        ),
        eb(
          "lineage_provenance_edges.source_plant_object_id",
          "=",
          input.targetPlantObjectId,
        ),
      ]),
    )
    .where((eb) =>
      eb.or([
        eb("lineage_provenance_edges.owner_user_id", "=", scope.userId),
        eb("lineage_provenance_edges.source_owner_user_id", "=", scope.userId),
      ]),
    )
    .whereRef(
      "lineage_provenance_edges.owner_user_id",
      "!=",
      "lineage_provenance_edges.source_owner_user_id",
    );
}

export function buildFindLineageFollowQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  targetPlantObjectId: string,
) {
  return executor
    .selectFrom("lineage_node_follows")
    .selectAll()
    .where("follower_user_id", "=", scope.userId)
    .where("target_plant_object_id", "=", targetPlantObjectId)
    .where("follow_state", "=", "active");
}

export function buildInsertLineageFollowQuery(
  executor: QueryExecutor,
  input: Insertable<Database["lineage_node_follows"]>,
) {
  return executor
    .insertInto("lineage_node_follows")
    .values(input)
    .onConflict((oc) =>
      oc.columns(["follower_user_id", "target_plant_object_id"]).doNothing(),
    )
    .returningAll();
}

export function buildCountRecentLineageFollowsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  since: Date,
) {
  return executor
    .selectFrom("lineage_node_follows")
    .select(sql<number>`count(*)`.as("count"))
    .where("follower_user_id", "=", scope.userId)
    .where("follow_state", "=", "active")
    .where("created_at", ">=", since);
}

export function buildFindLineageQuestionByClientMutationQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  clientMutationId: string,
) {
  return executor
    .selectFrom("lineage_questions")
    .selectAll()
    .where("asker_user_id", "=", scope.userId)
    .where("client_mutation_id", "=", clientMutationId);
}

export function buildInsertLineageQuestionQuery(
  executor: QueryExecutor,
  input: Insertable<Database["lineage_questions"]>,
) {
  return executor
    .insertInto("lineage_questions")
    .values(input)
    .onConflict((oc) =>
      oc.columns(["asker_user_id", "client_mutation_id"]).doNothing(),
    )
    .returningAll();
}

export function buildCountRecentLineageQuestionsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    since: Date;
    edgeId?: string;
  },
) {
  let query = executor
    .selectFrom("lineage_questions")
    .select(sql<number>`count(*)`.as("count"))
    .where("asker_user_id", "=", scope.userId)
    .where("question_state", "=", "delivered")
    .where("created_at", ">=", input.since);

  if (input.edgeId) {
    query = query.where("lineage_edge_id", "=", input.edgeId);
  }

  return query;
}

export function buildLineageQuestionInboxQuery(
  executor: QueryExecutor,
  scope: RequestScope,
) {
  return executor
    .selectFrom("lineage_questions")
    .innerJoin("plant_objects as target_objects", (join) =>
      join
        .onRef(
          "target_objects.id",
          "=",
          "lineage_questions.target_plant_object_id",
        )
        .onRef(
          "target_objects.owner_user_id",
          "=",
          "lineage_questions.recipient_user_id",
        ),
    )
    .leftJoin("catalog_items as target_catalog_items", (join) =>
      join
        .onRef("target_catalog_items.id", "=", "target_objects.catalog_item_id")
        .on("target_catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "lineage_questions.id",
      "lineage_questions.question_text",
      "lineage_questions.created_at",
      "target_objects.id as targetObjectId",
      "target_objects.display_name as targetObjectDisplayName",
      "target_objects.object_kind as targetObjectKind",
      "target_catalog_items.catalog_kind as targetCatalogKind",
      "target_objects.variety_text as targetVarietyText",
      "target_objects.variety_state as targetVarietyState",
    ])
    .where("lineage_questions.recipient_user_id", "=", scope.userId)
    .where("lineage_questions.question_state", "=", "delivered")
    .orderBy("lineage_questions.created_at", "desc")
    .orderBy("lineage_questions.id", "asc");
}

export function buildLineageFollowReadbackQuery(
  executor: QueryExecutor,
  scope: RequestScope,
) {
  return executor
    .selectFrom("lineage_node_follows")
    .innerJoin("plant_objects as target_objects", (join) =>
      join
        .onRef(
          "target_objects.id",
          "=",
          "lineage_node_follows.target_plant_object_id",
        )
        .onRef(
          "target_objects.owner_user_id",
          "=",
          "lineage_node_follows.target_owner_user_id",
        ),
    )
    .innerJoin("journal_entries as target_public_entries", (join) =>
      join
        .onRef(
          "target_public_entries.plant_object_id",
          "=",
          "target_objects.id",
        )
        .onRef(
          "target_public_entries.owner_user_id",
          "=",
          "target_objects.owner_user_id",
        )
        .on("target_public_entries.visibility", "=", "public")
        .on("target_public_entries.lifecycle_state", "=", "active")
        .on("target_public_entries.public_gone_at", "is", null)
        .on("target_public_entries.public_slug", "is not", null),
    )
    .leftJoin("catalog_items as target_catalog_items", (join) =>
      join
        .onRef("target_catalog_items.id", "=", "target_objects.catalog_item_id")
        .on("target_catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "lineage_node_follows.id",
      "lineage_node_follows.created_at",
      "target_objects.id as targetObjectId",
      "target_objects.display_name as targetObjectDisplayName",
      "target_objects.object_kind as targetObjectKind",
      "target_catalog_items.catalog_kind as targetCatalogKind",
      "target_objects.variety_text as targetVarietyText",
      "target_objects.variety_state as targetVarietyState",
    ])
    .where("lineage_node_follows.follower_user_id", "=", scope.userId)
    .where("lineage_node_follows.follow_state", "=", "active")
    .groupBy([
      "lineage_node_follows.id",
      "lineage_node_follows.created_at",
      "target_objects.id",
      "target_objects.display_name",
      "target_objects.object_kind",
      "target_catalog_items.catalog_kind",
      "target_objects.variety_text",
      "target_objects.variety_state",
    ])
    .orderBy("lineage_node_follows.created_at", "desc")
    .orderBy("lineage_node_follows.id", "asc");
}

export function normalizeLineageQuestionText(value: string) {
  const questionText = normalizeRequiredText(value, "Lineage question", 360);

  if (looksLikePrivateContactOrPreciseLocation(questionText)) {
    throw new Error(
      "Lineage question cannot include contact details, handles, URLs, or precise coordinates.",
    );
  }

  return questionText;
}

async function readEligibleLineageInteractionEdge(
  executor: QueryExecutor,
  scope: RequestScope,
  input: NormalizedFollowLineageNodeInput,
): Promise<EligibleLineageInteractionEdge> {
  const row = await buildLineageInteractionEligibilityQuery(
    executor,
    scope,
    input,
  ).executeTakeFirst();

  if (!row) {
    throw new Error("Lineage interaction target is not eligible.");
  }

  if (!row.sourcePlantObjectId || !row.sourceOwnerUserId) {
    throw new Error("Lineage interaction target is not eligible.");
  }

  const targetOwnerUserId =
    row.sourcePlantObjectId === input.targetPlantObjectId
      ? row.sourceOwnerUserId
      : row.ownerUserId;

  if (targetOwnerUserId === scope.userId) {
    throw new Error(
      "Lineage interaction target must belong to another gardener.",
    );
  }

  return {
    edgeId: row.id,
    subjectPlantObjectId: row.subjectPlantObjectId,
    sourcePlantObjectId: row.sourcePlantObjectId,
    ownerUserId: row.ownerUserId,
    sourceOwnerUserId: row.sourceOwnerUserId,
    targetOwnerUserId,
  };
}

function publicSafeConfirmedLineageEdgesBaseQuery(executor: QueryExecutor) {
  return executor
    .selectFrom("lineage_provenance_edges")
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
    .innerJoin("journal_entries as subject_public_entries", (join) =>
      join
        .onRef(
          "subject_public_entries.plant_object_id",
          "=",
          "subject_objects.id",
        )
        .onRef(
          "subject_public_entries.owner_user_id",
          "=",
          "subject_objects.owner_user_id",
        )
        .on("subject_public_entries.visibility", "=", "public")
        .on("subject_public_entries.lifecycle_state", "=", "active")
        .on("subject_public_entries.public_gone_at", "is", null)
        .on("subject_public_entries.public_slug", "is not", null),
    )
    .innerJoin("journal_entries as source_public_entries", (join) =>
      join
        .onRef(
          "source_public_entries.plant_object_id",
          "=",
          "source_objects.id",
        )
        .onRef(
          "source_public_entries.owner_user_id",
          "=",
          "source_objects.owner_user_id",
        )
        .on("source_public_entries.visibility", "=", "public")
        .on("source_public_entries.lifecycle_state", "=", "active")
        .on("source_public_entries.public_gone_at", "is", null)
        .on("source_public_entries.public_slug", "is not", null),
    )
    .where("lineage_provenance_edges.source_kind", "=", "own_object")
    .where("lineage_provenance_edges.source_plant_object_id", "is not", null)
    .where("lineage_provenance_edges.source_owner_user_id", "is not", null)
    .where("lineage_provenance_edges.consent_state", "=", "confirmed")
    .where(
      "lineage_provenance_edges.visibility_policy",
      "=",
      "owner_only_until_confirmed",
    )
    .where("lineage_provenance_edges.erasure_state", "=", "active");
}

function normalizeFollowLineageNodeInput(
  input: FollowLineageNodeInput,
): NormalizedFollowLineageNodeInput {
  return {
    edgeId: normalizeRequiredText(input.edgeId, "Lineage edge", 80),
    targetPlantObjectId: normalizeRequiredText(
      input.targetPlantObjectId,
      "Target object",
      80,
    ),
  };
}

function normalizeAskLineageQuestionInput(
  input: AskLineageQuestionInput,
): NormalizedAskLineageQuestionInput {
  return {
    ...normalizeFollowLineageNodeInput(input),
    questionText: normalizeLineageQuestionText(input.questionText),
    clientMutationId: normalizeRequiredText(
      input.clientMutationId,
      "Client mutation id",
      160,
    ),
  };
}

function assertExistingQuestionMatchesInput(
  question: LineageQuestion,
  input: NormalizedAskLineageQuestionInput,
) {
  if (
    question.lineage_edge_id !== input.edgeId ||
    question.target_plant_object_id !== input.targetPlantObjectId ||
    question.question_text !== input.questionText ||
    question.question_state !== "delivered"
  ) {
    throw new Error(
      "Client mutation id already belongs to another lineage question.",
    );
  }
}

function mapInteractionObjectReadback(row: {
  id: string;
  displayName: string;
  objectKind: string;
  catalogKind: string | null;
  varietyText: string | null;
  varietyState: string;
}): LineageInteractionObjectReadback {
  return {
    id: row.id,
    displayName: row.displayName,
    objectKind: row.objectKind as PlantObjectKind,
    catalogKind: row.catalogKind as CatalogKind | null,
    varietyText: row.varietyText,
    varietyState: row.varietyState as VarietyState,
  };
}
