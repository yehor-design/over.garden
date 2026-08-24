import "server-only";

import { createHash } from "node:crypto";

import type { Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  copyPublicDerivativeObject,
  deletePublicDerivativeObject,
} from "@/lib/storage";
import { normalizeJournalTopicTagLabels } from "@/lib/garden/journal-topics";
import { normalizeCatalogQuery } from "@/server/catalog-repository";
import {
  atomicClientMutationId,
  createFirstPlantEntry,
  createPlantObjectJournalEntry,
} from "@/server/journal-repository";
import { scopedToUser } from "@/server/request-scope";
import {
  VISUAL_FIXTURE_MANIFEST,
  type VisualFixtureCreationScenarioEvidence,
} from "@/lib/visual-fixtures/manifest";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export type VisualJournalCreationEvidenceAction = "reset" | "run" | "verify";

export interface VisualJournalCreationSnapshot {
  actorExists: boolean;
  space: {
    id: string;
    displayName: string;
    locationVisibility: string;
    coarseRegionCode: string | null;
  } | null;
  plantObject: {
    id: string;
    spaceId: string;
    displayName: string;
    objectKind: string;
    varietyState: string;
  } | null;
  entry: {
    id: string;
    plantObjectId: string | null;
    title: string;
    body: string;
    entryDate: string;
    visibility: string;
    clientMutationId: string;
  } | null;
  mediaAssetIds: string[];
  matchingMutationCount: number;
  preconditionEntryCount: number;
}

export interface VisualJournalCreationEvidenceResult {
  action: VisualJournalCreationEvidenceAction;
  scenarioId: string;
  before: VisualJournalCreationSnapshot;
  after: VisualJournalCreationSnapshot;
  canonicalCreateCalls: number;
  duplicateStable: boolean;
  postSavePath: string | null;
}

export interface JournalCreationDependencies {
  database: Kysely<Database>;
  createFirst: typeof createFirstPlantEntry;
  createFollowUp: typeof createPlantObjectJournalEntry;
  readSnapshot: typeof readVisualJournalCreationSnapshot;
  resetScenario: typeof resetVisualJournalCreationScenario;
  seedMedia: typeof seedScenarioMediaAsset;
}

const defaultDependencies: JournalCreationDependencies = {
  database: db,
  createFirst: createFirstPlantEntry,
  createFollowUp: createPlantObjectJournalEntry,
  readSnapshot: readVisualJournalCreationSnapshot,
  resetScenario: resetVisualJournalCreationScenario,
  seedMedia: seedScenarioMediaAsset,
};

export async function executeVisualJournalCreationEvidence(
  action: VisualJournalCreationEvidenceAction,
  scenario: VisualFixtureCreationScenarioEvidence,
  dependencies: JournalCreationDependencies = defaultDependencies,
): Promise<VisualJournalCreationEvidenceResult> {
  assertManifestScenario(scenario);

  if (action === "reset") {
    const before = await dependencies.readSnapshot(
      dependencies.database,
      scenario,
    );
    await dependencies.resetScenario(dependencies.database, scenario);
    const after = await dependencies.readSnapshot(
      dependencies.database,
      scenario,
    );
    assertScenarioSnapshot(scenario, after, "before");
    return resultFor(action, scenario, before, after, 0);
  }

  if (action === "verify") {
    const snapshot = await dependencies.readSnapshot(
      dependencies.database,
      scenario,
    );
    assertScenarioSnapshot(
      scenario,
      snapshot,
      scenario.expectedServerWrite ? "after" : "before",
    );
    return resultFor(action, scenario, snapshot, snapshot, 0);
  }

  await dependencies.resetScenario(dependencies.database, scenario);
  const before = await dependencies.readSnapshot(
    dependencies.database,
    scenario,
  );
  assertScenarioSnapshot(scenario, before, "before");

  let canonicalCreateCalls = 0;
  if (scenario.expectedServerWrite) {
    await dependencies.seedMedia(dependencies.database, scenario);
    canonicalCreateCalls = scenario.state === "duplicate" ? 2 : 1;
    const create = () => applyCanonicalCreation(scenario, dependencies);

    if (canonicalCreateCalls === 2) {
      await Promise.all([create(), create()]);
    } else {
      await create();
    }
  }

  const after = await dependencies.readSnapshot(
    dependencies.database,
    scenario,
  );
  assertScenarioSnapshot(
    scenario,
    after,
    scenario.expectedServerWrite ? "after" : "before",
  );

  return resultFor(action, scenario, before, after, canonicalCreateCalls);
}

export async function resetVisualJournalCreationScenario(
  database: Kysely<Database>,
  scenario: VisualFixtureCreationScenarioEvidence,
) {
  await database.transaction().execute(async (trx) => {
    const pendingTopics = await trx
      .selectFrom("journal_entry_topic_signals")
      .innerJoin(
        "journal_topics",
        "journal_topics.id",
        "journal_entry_topic_signals.topic_id",
      )
      .select("journal_topics.id")
      .where("journal_entry_topic_signals.journal_entry_id", "in", [
        ...scenario.resetOwnedEntryIds,
      ])
      .where("journal_topics.trust_state", "=", "pending")
      .execute();

    if (scenario.resetOwnedMediaAssetIds.length > 0) {
      await trx
        .deleteFrom("media_assets")
        .where("owner_user_id", "=", scenario.ownerActorId)
        .where("id", "in", [...scenario.resetOwnedMediaAssetIds])
        .execute();
    }
    await trx
      .deleteFrom("journal_entry_topic_signals")
      .where("journal_entry_id", "in", [...scenario.resetOwnedEntryIds])
      .execute();
    await trx
      .deleteFrom("journal_entry_catalog_mentions")
      .where("owner_user_id", "=", scenario.ownerActorId)
      .where("journal_entry_id", "in", [...scenario.resetOwnedEntryIds])
      .execute();
    await trx
      .deleteFrom("journal_entry_object_mentions")
      .where("owner_user_id", "=", scenario.ownerActorId)
      .where("journal_entry_id", "in", [...scenario.resetOwnedEntryIds])
      .execute();
    await trx
      .deleteFrom("journal_entries")
      .where("owner_user_id", "=", scenario.ownerActorId)
      .where("id", "in", [...scenario.resetOwnedEntryIds])
      .execute();
    if (scenario.resetOwnedObjectIds.length > 0) {
      await trx
        .deleteFrom("plant_objects")
        .where("owner_user_id", "=", scenario.ownerActorId)
        .where("id", "in", [...scenario.resetOwnedObjectIds])
        .execute();
    }
    if (scenario.resetOwnedSpaceIds.length > 0) {
      await trx
        .deleteFrom("spaces")
        .where("owner_user_id", "=", scenario.ownerActorId)
        .where("id", "in", [...scenario.resetOwnedSpaceIds])
        .execute();
    }

    await deleteScenarioCatalogCandidate(trx, scenario);

    const pendingTopicIds = pendingTopics.map((topic) => topic.id);
    if (pendingTopicIds.length > 0) {
      await trx
        .deleteFrom("journal_topics")
        .where("id", "in", pendingTopicIds)
        .where("trust_state", "=", "pending")
        .where(({ not, exists, selectFrom }) =>
          not(
            exists(
              selectFrom("journal_entry_topic_signals")
                .select("journal_entry_topic_signals.topic_id")
                .whereRef(
                  "journal_entry_topic_signals.topic_id",
                  "=",
                  "journal_topics.id",
                ),
            ),
          ),
        )
        .execute();
    }
  });

  await Promise.all(
    scenario.resetOwnedMediaAssetIds.map(() =>
      deletePublicDerivativeObject(scenarioMediaDerivativeKey(scenario)),
    ),
  );
}

export async function readVisualJournalCreationSnapshot(
  executor: QueryExecutor,
  scenario: VisualFixtureCreationScenarioEvidence,
): Promise<VisualJournalCreationSnapshot> {
  const [
    actor,
    space,
    plantObject,
    entry,
    media,
    mutationCount,
    preconditions,
  ] = await Promise.all([
    executor
      .selectFrom("user")
      .select("id")
      .where("id", "=", scenario.ownerActorId)
      .executeTakeFirst(),
    executor
      .selectFrom("spaces")
      .select([
        "id",
        "display_name as displayName",
        "location_visibility as locationVisibility",
        "coarse_region_code as coarseRegionCode",
      ])
      .where("id", "=", scenario.expectedSpaceId)
      .where("owner_user_id", "=", scenario.ownerActorId)
      .executeTakeFirst(),
    executor
      .selectFrom("plant_objects")
      .select([
        "id",
        "space_id as spaceId",
        "display_name as displayName",
        "object_kind as objectKind",
        "variety_state as varietyState",
      ])
      .where("id", "=", scenario.expectedObjectId)
      .where("owner_user_id", "=", scenario.ownerActorId)
      .executeTakeFirst(),
    executor
      .selectFrom("journal_entries")
      .select([
        "id",
        "plant_object_id as plantObjectId",
        "title",
        "body",
        "entry_date as entryDate",
        "visibility",
        "client_mutation_id as clientMutationId",
      ])
      .where("id", "=", scenario.expectedEntryId)
      .where("owner_user_id", "=", scenario.ownerActorId)
      .executeTakeFirst(),
    scenario.expectedMediaAssetIds.length > 0
      ? executor
          .selectFrom("media_assets")
          .select("id")
          .where("owner_user_id", "=", scenario.ownerActorId)
          .where("id", "in", [...scenario.expectedMediaAssetIds])
          .where("journal_entry_id", "=", scenario.expectedEntryId)
          .where("derivative_key", "is not", null)
          .where("revoked_at", "is", null)
          .orderBy("id", "asc")
          .execute()
      : Promise.resolve([]),
    executor
      .selectFrom("journal_entries")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("owner_user_id", "=", scenario.ownerActorId)
      .where("client_mutation_id", "=", scenario.clientMutationId)
      .executeTakeFirstOrThrow(),
    scenario.preconditionEntryIds.length > 0
      ? executor
          .selectFrom("journal_entries")
          .select(({ fn }) => fn.countAll<number>().as("count"))
          .where("owner_user_id", "=", scenario.ownerActorId)
          .where("id", "in", [...scenario.preconditionEntryIds])
          .executeTakeFirstOrThrow()
      : Promise.resolve({ count: 0 }),
  ]);

  return {
    actorExists: Boolean(actor),
    space: space ?? null,
    plantObject: plantObject ?? null,
    entry: entry
      ? {
          ...entry,
          entryDate: normalizeDate(entry.entryDate),
        }
      : null,
    mediaAssetIds: media.map((item) => item.id),
    matchingMutationCount: Number(mutationCount.count),
    preconditionEntryCount: Number(preconditions.count),
  };
}

async function applyCanonicalCreation(
  scenario: VisualFixtureCreationScenarioEvidence,
  dependencies: JournalCreationDependencies,
) {
  const scope = scopedToUser(scenario.ownerActorId);
  const mediaAssetId = scenario.expectedMediaAssetIds[0] ?? null;
  const topicTags = normalizeJournalTopicTagLabels(scenario.topicTagInput);
  const requestDigest = createHash("sha256")
    .update(`${scenario.id}:publication`)
    .digest("base64url");
  const atomicPublication = {
    publishId: scenario.expectedEntryId,
    requestDigest,
    disclosureAccepted: true,
    coverMediaAssetId: null,
    handoff: mediaAssetId
      ? {
          stagingSessionId: mediaAssetId,
          receiptSetDigest: requestDigest,
          publicMedia: [
            {
              mediaAssetId,
              generation: 1,
              sha256: requestDigest,
              sizeBytes: 1,
              width: 1,
              height: 1,
              publicPath: scenarioMediaDerivativeKey(scenario),
            },
          ],
        }
      : null,
  };
  const clientMutationId = atomicClientMutationId(atomicPublication);
  const contentDocument = {
    schemaVersion: 1 as const,
    blocks: [
      {
        id: "fixture-text",
        type: "paragraph" as const,
        spans: [{ text: scenario.entryBody }],
      },
      ...(mediaAssetId
        ? [
            {
              id: "fixture-photo",
              type: "image" as const,
              mediaAssetId,
            },
          ]
        : []),
    ],
  };

  const result =
    scenario.flow === "first-entry"
      ? await dependencies.createFirst(scope, {
          spaceId: null,
          spaceName: scenario.spaceName,
          plantName: scenario.objectName,
          objectKind: scenario.objectKind,
          catalogItemId: null,
          userAddedCatalogName: scenario.userAddedCatalogName,
          title: scenario.entryTitle,
          contentDocument,
          entryDate: scenario.entryDate,
          locationVisibility: scenario.locationVisibility,
          coarseRegionCode: scenario.coarseRegionCode,
          clientMutationId,
          cover: { mode: "automatic" },
          topicTags,
          internalDeterministicIds: {
            spaceId: scenario.expectedSpaceId,
            plantObjectId: scenario.expectedObjectId,
            entryId: scenario.expectedEntryId,
          },
          atomicPublication,
        })
      : await dependencies.createFollowUp(scope, {
          plantObjectId: scenario.expectedObjectId,
          title: scenario.entryTitle,
          contentDocument,
          entryDate: scenario.entryDate,
          clientMutationId,
          cover: { mode: "automatic" },
          topicTags,
          internalDeterministicIds: {
            entryId: scenario.expectedEntryId,
          },
          atomicPublication,
        });

  if (
    result.space.id !== scenario.expectedSpaceId ||
    result.plantObject.id !== scenario.expectedObjectId ||
    result.entry.id !== scenario.expectedEntryId
  ) {
    throw new Error(
      "Canonical creation returned IDs outside the scenario contract.",
    );
  }

  return result;
}

export async function seedScenarioMediaAsset(
  database: Kysely<Database>,
  scenario: VisualFixtureCreationScenarioEvidence,
) {
  const mediaAssetId = scenario.expectedMediaAssetIds[0];
  if (!mediaAssetId) return;

  const source = VISUAL_FIXTURE_MANIFEST.media[0];
  const derivativeKey = scenarioMediaDerivativeKey(scenario);
  await copyPublicDerivativeObject(source.derivativeKey, derivativeKey);
}

function scenarioMediaDerivativeKey(
  scenario: VisualFixtureCreationScenarioEvidence,
) {
  const mediaAssetId = scenario.expectedMediaAssetIds[0];
  if (!mediaAssetId) {
    throw new Error(`Scenario ${scenario.id} has no media identity.`);
  }
  return `derivatives/${mediaAssetId}.webp`;
}

async function deleteScenarioCatalogCandidate(
  executor: QueryExecutor,
  scenario: VisualFixtureCreationScenarioEvidence,
) {
  if (!scenario.userAddedCatalogName) return;

  const candidates = await executor
    .selectFrom("catalog_items")
    .select("id")
    .where("created_by_user_id", "=", scenario.ownerActorId)
    .where(
      "normalized_name",
      "=",
      normalizeCatalogQuery(scenario.userAddedCatalogName),
    )
    .where("source", "=", "user_added")
    .where("status", "=", "provisional")
    .execute();
  const candidateIds = candidates.map((candidate) => candidate.id);
  if (candidateIds.length === 0) return;

  await executor
    .deleteFrom("catalog_item_names")
    .where("catalog_item_id", "in", candidateIds)
    .execute();
  await executor
    .deleteFrom("catalog_items")
    .where("created_by_user_id", "=", scenario.ownerActorId)
    .where("id", "in", candidateIds)
    .execute();
}

function assertScenarioSnapshot(
  scenario: VisualFixtureCreationScenarioEvidence,
  snapshot: VisualJournalCreationSnapshot,
  phase: "before" | "after",
) {
  if (!snapshot.actorExists) {
    throw new Error(
      `Scenario ${scenario.id} requires its seeded fixture actor.`,
    );
  }
  if (
    snapshot.preconditionEntryCount !== scenario.preconditionEntryIds.length
  ) {
    throw new Error(`Scenario ${scenario.id} is missing precondition entries.`);
  }

  const expectsWrite = phase === "after" && scenario.expectedServerWrite;
  const expectsExistingContext = scenario.flow === "follow-up" || expectsWrite;
  if (Boolean(snapshot.space) !== expectsExistingContext) {
    throw new Error(`Scenario ${scenario.id} has an unexpected space state.`);
  }
  if (Boolean(snapshot.plantObject) !== expectsExistingContext) {
    throw new Error(`Scenario ${scenario.id} has an unexpected object state.`);
  }
  if (
    snapshot.space &&
    (snapshot.space.id !== scenario.expectedSpaceId ||
      snapshot.space.displayName !== scenario.spaceName)
  ) {
    throw new Error(`Scenario ${scenario.id} space readback is incorrect.`);
  }
  if (
    snapshot.plantObject &&
    (snapshot.plantObject.id !== scenario.expectedObjectId ||
      snapshot.plantObject.spaceId !== scenario.expectedSpaceId ||
      snapshot.plantObject.displayName !== scenario.objectName ||
      snapshot.plantObject.objectKind !== scenario.objectKind)
  ) {
    throw new Error(`Scenario ${scenario.id} object readback is incorrect.`);
  }
  if (
    expectsWrite &&
    scenario.flow === "first-entry" &&
    snapshot.space &&
    (snapshot.space.locationVisibility !== scenario.locationVisibility ||
      snapshot.space.coarseRegionCode !== scenario.coarseRegionCode)
  ) {
    throw new Error(`Scenario ${scenario.id} privacy readback is incorrect.`);
  }
  if (Boolean(snapshot.entry) !== expectsWrite) {
    throw new Error(`Scenario ${scenario.id} has an unexpected entry state.`);
  }
  if (snapshot.matchingMutationCount !== (expectsWrite ? 1 : 0)) {
    throw new Error(`Scenario ${scenario.id} failed mutation idempotency.`);
  }

  if (!expectsWrite || !snapshot.entry || !snapshot.plantObject) {
    if (snapshot.mediaAssetIds.length !== 0) {
      throw new Error(`Scenario ${scenario.id} retained unexpected media.`);
    }
    return;
  }

  if (
    snapshot.entry.plantObjectId !== scenario.expectedObjectId ||
    snapshot.entry.title !== scenario.entryTitle ||
    snapshot.entry.body !== scenario.entryBody ||
    snapshot.entry.entryDate !== scenario.entryDate ||
    snapshot.entry.clientMutationId !== scenario.clientMutationId ||
    snapshot.entry.visibility !== scenario.expectedEntryVisibility
  ) {
    throw new Error(
      `Scenario ${scenario.id} readback does not match its payload.`,
    );
  }

  if (
    snapshot.mediaAssetIds.join(",") !==
    [...scenario.expectedMediaAssetIds].sort().join(",")
  ) {
    throw new Error(`Scenario ${scenario.id} media readback is incomplete.`);
  }
}

function resultFor(
  action: VisualJournalCreationEvidenceAction,
  scenario: VisualFixtureCreationScenarioEvidence,
  before: VisualJournalCreationSnapshot,
  after: VisualJournalCreationSnapshot,
  canonicalCreateCalls: number,
): VisualJournalCreationEvidenceResult {
  return {
    action,
    scenarioId: scenario.id,
    before,
    after,
    canonicalCreateCalls,
    duplicateStable:
      scenario.state !== "duplicate" ||
      (action === "run"
        ? canonicalCreateCalls === 2 && after.matchingMutationCount === 1
        : action === "verify"
          ? after.matchingMutationCount === 1
          : after.matchingMutationCount === 0),
    postSavePath: scenario.postSavePath,
  };
}

function assertManifestScenario(
  scenario: VisualFixtureCreationScenarioEvidence,
) {
  const owned = VISUAL_FIXTURE_MANIFEST.creationEvidence.scenarios.find(
    (candidate) => candidate.id === scenario.id,
  );
  if (owned !== scenario) {
    throw new Error(
      "Journal creation evidence must use the manifest-owned scenario.",
    );
  }
}

function normalizeDate(value: Date | string) {
  if (!(value instanceof Date)) return value;

  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function expectedVisualJournalEntryVisibility(
  scenario: VisualFixtureCreationScenarioEvidence,
): "public" {
  return scenario.expectedEntryVisibility;
}
