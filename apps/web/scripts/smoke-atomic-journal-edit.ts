import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
export const ATOMIC_JOURNAL_EDIT_RECEIPT_VERSION =
  "ove348.atomicJournalEditSmoke.v1" as const;

export function buildFocusedAtomicJournalEditReceipt() {
  return Object.freeze({
    version: ATOMIC_JOURNAL_EDIT_RECEIPT_VERSION,
    canonicalTransition: "active_public_revision_n_to_n_plus_1" as const,
    precommitPublishedMutationCount: 0,
    existingMediaUploadCount: 0,
    replacementIdentity: "stable_uuid_generation_swap" as const,
    mediaCommit: "claimed_subset_plus_retained_set" as const,
    documentContract: "JournalDocumentV1" as const,
    preservedRows: Object.freeze([
      "caption",
      "alt_text",
      "topics",
      "mentions",
      "entity_relations",
    ] as const),
    exactReturn: "same_origin_internal_or_garden_fallback" as const,
    activeLegacyEditCallers: 0,
  });
}

export function buildAtomicJournalEditWaitSafetyReceipt() {
  return Object.freeze({
    version: ATOMIC_JOURNAL_EDIT_RECEIPT_VERSION,
    injectedFaults: Object.freeze([
      "new-media claim timeout",
      "concurrent revision conflict",
    ] as const),
    terminalStatus: "failed_or_conflict" as const,
    saveLoader: "finite" as const,
    cancelSavingButton: "responsive" as const,
    copyLocalChangesButton: "responsive" as const,
    recovery: "bounded" as const,
    lateCompletion: "generation_fenced" as const,
  });
}

async function runIntegrationFaultProof() {
  loadEnv({ path: path.join(process.cwd(), ".env.local"), override: false });
  assertLocalDatabase(process.env.DATABASE_URL);

  const [{ db }, repository, { scopedToUser }] = await Promise.all([
    import("../src/db"),
    import("../src/server/journal-repository"),
    import("../src/server/request-scope"),
  ]);
  const ownerUserId = randomUUID();
  const anotherUserId = randomUUID();
  const spaceId = randomUUID();
  const plantObjectIds = [randomUUID(), randomUUID()];
  const trackedEntryIds: string[] = [];
  const trackedJobKeys = new Set<string>();
  const cleanupOnlyJobKeys = new Set<string>();
  const trackedTopicIds = new Set<string>();

  try {
    await db
      .insertInto("user")
      .values([
        syntheticUser(ownerUserId, "owner"),
        syntheticUser(anotherUserId, "other"),
      ])
      .execute();
    await db
      .insertInto("spaces")
      .values({
        id: spaceId,
        owner_user_id: ownerUserId,
        display_name: "OVE-348 atomic edit smoke space",
        location_visibility: "hidden",
        coarse_region_code: null,
      })
      .execute();
    await db
      .insertInto("plant_objects")
      .values(
        plantObjectIds.map((id, index) => ({
          id,
          owner_user_id: ownerUserId,
          space_id: spaceId,
          display_name: `OVE-348 synthetic object ${index + 1}`,
          object_kind: "plant",
          catalog_item_id: null,
          variety_text: null,
          variety_state: "unknown",
          location_visibility: "hidden",
          coarse_region_code: null,
        })),
      )
      .execute();

    const scope = scopedToUser(ownerUserId, randomUUID());
    const anotherScope = scopedToUser(anotherUserId, randomUUID());
    const initialMediaIds = [randomUUID(), randomUUID()];
    const initialPublication = atomicPublication(initialMediaIds);
    trackedEntryIds.push(initialPublication.publishId);
    trackedJobKeys.add(finalizeKey(initialPublication));
    const uniqueTopic = `ove348-${ownerUserId.slice(0, 8)}`;
    const created = await repository.createSpaceJournalEntry(scope, {
      spaceId,
      mentionedPlantObjectIds: plantObjectIds,
      title: "Atomic edit baseline",
      contentDocument: journalDocument(
        "The complete public baseline remains visible until commit.",
        initialMediaIds,
      ),
      entryDate: "2026-08-23",
      clientMutationId: repository.atomicClientMutationId(initialPublication),
      cover: {
        mode: "explicit_inline",
        mediaAssetId: initialMediaIds[0]!,
      },
      topicTags: [uniqueTopic],
      internalDeterministicIds: { entryId: initialPublication.publishId },
      atomicPublication: initialPublication,
    });
    await db
      .updateTable("media_assets")
      .set({ caption: "Preserved caption", alt_text: "Preserved alt text" })
      .where("id", "=", initialMediaIds[0]!)
      .where("owner_user_id", "=", ownerUserId)
      .execute();

    const relationBefore = await relationReceipt(
      db,
      initialPublication.publishId,
    );
    const topicsBefore = await topicReceipt(db, initialPublication.publishId);
    for (const topic of topicsBefore) trackedTopicIds.add(topic.topicId);
    const baseline = await repository.readAtomicJournalEditBaseline(
      scope,
      initialPublication.publishId,
    );

    let anotherOwnerClass = "not_rejected";
    try {
      await repository.readAtomicJournalEditBaseline(
        anotherScope,
        initialPublication.publishId,
      );
    } catch (error) {
      anotherOwnerClass = errorCode(error);
    }

    const addedMediaId = randomUUID();
    const firstEditIdentity = editIdentity();
    const firstEditHandoff = {
      stagingSessionId: randomUUID(),
      receiptSetDigest: digest43("ove348-edit-handoff"),
      publicMedia: [
        claimedMedia(initialMediaIds[0]!, 2),
        claimedMedia(addedMediaId, 1),
      ],
    };
    trackedJobKeys.add(
      `media_staging_finalize:${initialPublication.publishId}:${firstEditHandoff.receiptSetDigest}`,
    );
    trackedJobKeys.add(revokeKey(initialMediaIds[0]!, 1));
    trackedJobKeys.add(revokeKey(initialMediaIds[1]!, 1));
    const firstEditDocument = journalDocument(
      "The next complete revision replaces, removes, adds, and reorders media.",
      [addedMediaId, initialMediaIds[0]!],
    );
    const firstEditInput = {
      entryId: initialPublication.publishId,
      ...firstEditIdentity,
      expectedRevision: 1,
      title: "Atomic edit committed",
      entryDate: "2026-08-23",
      document: firstEditDocument,
      coverMediaAssetId: addedMediaId,
      finalMediaAssetIds: [addedMediaId, initialMediaIds[0]!],
      retainedMediaAssetIds: [initialMediaIds[0]!],
      removedMediaAssetIds: [initialMediaIds[1]!],
      focalPoints: [
        { mediaAssetId: addedMediaId, x: 0.2, y: 0.8 },
        { mediaAssetId: initialMediaIds[0]!, x: 0.35, y: 0.65 },
      ],
      handoff: firstEditHandoff,
    };
    const firstEdit = await repository.updateAtomicJournalEntry(
      scope,
      firstEditInput,
    );
    const exactReplay = await repository.updateAtomicJournalEntry(
      scope,
      firstEditInput,
    );
    const providerIndependentReplay =
      await repository.readCommittedAtomicJournalEdit(scope, {
        entryId: firstEditInput.entryId,
        mutationPrefix: firstEditInput.mutationPrefix,
        mutationReceiptId: firstEditInput.mutationReceiptId,
        expectedRevision: firstEditInput.expectedRevision,
        title: firstEditInput.title,
        entryDate: firstEditInput.entryDate,
        document: firstEditInput.document,
        coverMediaAssetId: firstEditInput.coverMediaAssetId,
        finalMediaAssetIds: firstEditInput.finalMediaAssetIds,
        focalPoints: firstEditInput.focalPoints,
        receiptSetDigest: firstEditHandoff.receiptSetDigest,
      });

    let mismatchClass = "not_rejected";
    try {
      await repository.readCommittedAtomicJournalEdit(scope, {
        entryId: firstEditInput.entryId,
        mutationPrefix: firstEditInput.mutationPrefix,
        mutationReceiptId: `${firstEditInput.mutationPrefix}${digest43("mismatch")}`,
        expectedRevision: firstEditInput.expectedRevision,
        title: firstEditInput.title,
        entryDate: firstEditInput.entryDate,
        document: firstEditInput.document,
        coverMediaAssetId: firstEditInput.coverMediaAssetId,
        finalMediaAssetIds: firstEditInput.finalMediaAssetIds,
        focalPoints: firstEditInput.focalPoints,
        receiptSetDigest: firstEditHandoff.receiptSetDigest,
      });
    } catch (error) {
      mismatchClass = errorCode(error);
    }

    const afterFirst = await repository.readAtomicJournalEditBaseline(
      scope,
      initialPublication.publishId,
    );
    const replacementRow = await db
      .selectFrom("media_assets")
      .select(["upload_generation", "derivative_key", "caption", "alt_text"])
      .where("id", "=", initialMediaIds[0]!)
      .executeTakeFirstOrThrow();
    const removedRow = await db
      .selectFrom("media_assets")
      .select(["journal_entry_id", "document_position"])
      .where("id", "=", initialMediaIds[1]!)
      .executeTakeFirstOrThrow();
    const relationAfter = await relationReceipt(
      db,
      initialPublication.publishId,
    );
    const topicsAfter = await topicReceipt(db, initialPublication.publishId);

    const raceDocumentA = journalDocument("Concurrent edit winner A.", [
      initialMediaIds[0]!,
      addedMediaId,
    ]);
    const raceDocumentB = journalDocument("Concurrent edit winner B.", [
      initialMediaIds[0]!,
      addedMediaId,
    ]);
    const raceBase = {
      entryId: initialPublication.publishId,
      expectedRevision: 2,
      entryDate: "2026-08-23",
      coverMediaAssetId: addedMediaId,
      finalMediaAssetIds: [initialMediaIds[0]!, addedMediaId],
      retainedMediaAssetIds: [initialMediaIds[0]!, addedMediaId],
      removedMediaAssetIds: [],
      focalPoints: [
        { mediaAssetId: initialMediaIds[0]!, x: 0.35, y: 0.65 },
        { mediaAssetId: addedMediaId, x: 0.2, y: 0.8 },
      ],
      handoff: null,
    } as const;
    const raceResults = await Promise.allSettled([
      repository.updateAtomicJournalEntry(scope, {
        ...raceBase,
        ...editIdentity(),
        title: "Concurrent winner A",
        document: raceDocumentA,
      }),
      repository.updateAtomicJournalEntry(scope, {
        ...raceBase,
        ...editIdentity(),
        title: "Concurrent winner B",
        document: raceDocumentB,
      }),
    ]);
    const raceFulfilled = raceResults.filter(
      (result) => result.status === "fulfilled",
    ).length;
    const raceConflictClasses = raceResults.flatMap((result) =>
      result.status === "rejected" ? [errorCode(result.reason)] : [],
    );
    const afterRace = await repository.readAtomicJournalEditBaseline(
      scope,
      initialPublication.publishId,
    );

    const coverOnlyRevokeKey = revokeKey(addedMediaId, 1);
    cleanupOnlyJobKeys.add(coverOnlyRevokeKey);
    const coverOnlyEdit = await repository.updateAtomicJournalEntry(scope, {
      entryId: initialPublication.publishId,
      ...editIdentity(),
      expectedRevision: 3,
      title: "Retained cover-only media",
      entryDate: "2026-08-23",
      document: journalDocument(
        "An inline photo may become the separate cover without revocation.",
        [initialMediaIds[0]!],
      ),
      coverMediaAssetId: addedMediaId,
      finalMediaAssetIds: [initialMediaIds[0]!, addedMediaId],
      retainedMediaAssetIds: [initialMediaIds[0]!, addedMediaId],
      removedMediaAssetIds: [],
      focalPoints: [
        { mediaAssetId: initialMediaIds[0]!, x: 0.35, y: 0.65 },
        { mediaAssetId: addedMediaId, x: 0.2, y: 0.8 },
      ],
      handoff: null,
    });
    const afterCoverOnly = await repository.readAtomicJournalEditBaseline(
      scope,
      initialPublication.publishId,
    );
    const coverOnlyRow = await db
      .selectFrom("media_assets")
      .select(["usage_role", "journal_entry_id"])
      .where("id", "=", addedMediaId)
      .executeTakeFirstOrThrow();
    const forbiddenCoverRevoke = await db
      .selectFrom("job_queue")
      .select("id")
      .where("idempotency_key", "=", coverOnlyRevokeKey)
      .executeTakeFirst();

    const archivePublication = atomicPublication([]);
    trackedEntryIds.push(archivePublication.publishId);
    const archiveCreated = await repository.createSpaceJournalEntry(scope, {
      spaceId,
      mentionedPlantObjectIds: [plantObjectIds[0]!],
      title: "Archive race baseline",
      contentDocument: journalDocument("Archive wins the canonical race.", []),
      entryDate: "2026-08-23",
      clientMutationId: repository.atomicClientMutationId(archivePublication),
      cover: { mode: "none" },
      internalDeterministicIds: { entryId: archivePublication.publishId },
      atomicPublication: archivePublication,
    });
    const archiveEditIdentity = editIdentity();
    const archiveRace = await Promise.allSettled([
      repository.deleteJournalEntry(scope, {
        entryId: archivePublication.publishId,
      }),
      repository.updateAtomicJournalEntry(scope, {
        entryId: archivePublication.publishId,
        ...archiveEditIdentity,
        expectedRevision: 1,
        title: "Archive race attempted edit",
        entryDate: "2026-08-23",
        document: journalDocument("This may commit only before archive.", []),
        coverMediaAssetId: null,
        finalMediaAssetIds: [],
        retainedMediaAssetIds: [],
        removedMediaAssetIds: [],
        focalPoints: [],
        handoff: null,
      }),
    ]);
    const archivedRow = await db
      .selectFrom("journal_entries")
      .select(["lifecycle_state", "public_gone_at"])
      .where("id", "=", archivePublication.publishId)
      .executeTakeFirstOrThrow();

    const faultPublication = atomicPublication([]);
    trackedEntryIds.push(faultPublication.publishId);
    const faultCreated = await repository.createSpaceJournalEntry(scope, {
      spaceId,
      mentionedPlantObjectIds: [plantObjectIds[0]!],
      title: "Rollback baseline",
      contentDocument: journalDocument(
        "This revision must survive a fault.",
        [],
      ),
      entryDate: "2026-08-23",
      clientMutationId: repository.atomicClientMutationId(faultPublication),
      cover: { mode: "none" },
      internalDeterministicIds: { entryId: faultPublication.publishId },
      atomicPublication: faultPublication,
    });
    const faultIdentity = editIdentity();
    let injectedDbFaultClass = "not_rejected";
    try {
      await repository.updateAtomicJournalEntry(scope, {
        entryId: faultPublication.publishId,
        ...faultIdentity,
        expectedRevision: 1,
        title: "Must roll back",
        entryDate: "2026-08-23",
        document: journalDocument("The duplicate identity faults after CAS.", [
          initialMediaIds[0]!,
        ]),
        coverMediaAssetId: initialMediaIds[0]!,
        finalMediaAssetIds: [initialMediaIds[0]!],
        retainedMediaAssetIds: [],
        removedMediaAssetIds: [],
        focalPoints: [{ mediaAssetId: initialMediaIds[0]!, x: 0.5, y: 0.5 }],
        handoff: {
          stagingSessionId: randomUUID(),
          receiptSetDigest: digest43("fault-handoff"),
          publicMedia: [claimedMedia(initialMediaIds[0]!, 1)],
        },
      });
    } catch {
      injectedDbFaultClass = "transaction_rolled_back";
    }
    const faultAfter = await db
      .selectFrom("journal_entries")
      .select(["title", "journal_revision", "content_document"])
      .where("id", "=", faultPublication.publishId)
      .executeTakeFirstOrThrow();
    const faultReceiptCount = await db
      .selectFrom("journal_entry_mutation_receipts")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("journal_entry_id", "=", faultPublication.publishId)
      .where("client_mutation_id", "=", faultIdentity.mutationReceiptId)
      .executeTakeFirstOrThrow();

    const archivedPublication = atomicPublication([]);
    trackedEntryIds.push(archivedPublication.publishId);
    await repository.createSpaceJournalEntry(scope, {
      spaceId,
      mentionedPlantObjectIds: [plantObjectIds[0]!],
      title: "Archived exclusion baseline",
      contentDocument: journalDocument("Archived entries stay immutable.", []),
      entryDate: "2026-08-23",
      clientMutationId: repository.atomicClientMutationId(archivedPublication),
      cover: { mode: "none" },
      internalDeterministicIds: { entryId: archivedPublication.publishId },
      atomicPublication: archivedPublication,
    });
    const archivedAt = new Date();
    await db
      .updateTable("journal_entries")
      .set({
        lifecycle_state: "archived",
        archived_at: archivedAt,
        public_gone_at: archivedAt,
      })
      .where("id", "=", archivedPublication.publishId)
      .execute();
    let archivedEntryClass = "not_rejected";
    try {
      await repository.readAtomicJournalEditBaseline(
        scope,
        archivedPublication.publishId,
      );
    } catch (error) {
      archivedEntryClass = errorCode(error);
    }

    const lifecycleJobs = await db
      .selectFrom("job_queue")
      .select(["idempotency_key", "payload"])
      .where("idempotency_key", "in", [...trackedJobKeys])
      .execute();
    const oldReplacementJob = lifecycleJobs.find(
      (job) => job.idempotency_key === revokeKey(initialMediaIds[0]!, 1),
    );
    const removedJob = lifecycleJobs.find(
      (job) => job.idempotency_key === revokeKey(initialMediaIds[1]!, 1),
    );
    const oldReplacementPayload = record(oldReplacementJob?.payload);
    const removedPayload = record(removedJob?.payload);
    const archiveTerminal =
      archivedRow.lifecycle_state === "archived" &&
      archivedRow.public_gone_at !== null;
    const faultWhole =
      faultAfter.title === faultCreated.entry.title &&
      Number(faultAfter.journal_revision) === 1 &&
      JSON.stringify(faultAfter.content_document) ===
        JSON.stringify(faultCreated.entry.content_document) &&
      Number(faultReceiptCount.count) === 0;
    const firstWhole =
      created.entry.id === initialPublication.publishId &&
      baseline.media.length === 2 &&
      Number(firstEdit.entry.journal_revision) === 2 &&
      firstEdit.isReplay === false &&
      exactReplay.isReplay === true &&
      providerIndependentReplay?.isReplay === true &&
      Number(afterFirst.entry.journal_revision) === 2 &&
      afterFirst.media.map((media) => media.mediaAssetId).join(",") ===
        [addedMediaId, initialMediaIds[0]!].join(",") &&
      Number(replacementRow.upload_generation) === 2 &&
      replacementRow.derivative_key ===
        `derivatives/${initialMediaIds[0]}/2.webp` &&
      replacementRow.caption === "Preserved caption" &&
      replacementRow.alt_text === "Preserved alt text" &&
      removedRow.journal_entry_id === initialPublication.publishId &&
      removedRow.document_position === null &&
      JSON.stringify(relationAfter) === JSON.stringify(relationBefore) &&
      JSON.stringify(topicsAfter) === JSON.stringify(topicsBefore);
    const raceWhole =
      raceFulfilled === 1 &&
      raceConflictClasses.length === 1 &&
      raceConflictClasses[0] === "journal_aggregate_conflict" &&
      Number(afterRace.entry.journal_revision) === 3 &&
      ["Concurrent winner A", "Concurrent winner B"].includes(
        afterRace.entry.title,
      );
    const coverOnlyWhole =
      Number(coverOnlyEdit.entry.journal_revision) === 4 &&
      Number(afterCoverOnly.entry.journal_revision) === 4 &&
      coverOnlyRow.usage_role === "cover_only" &&
      coverOnlyRow.journal_entry_id === initialPublication.publishId &&
      forbiddenCoverRevoke === undefined;
    const jobWhole =
      lifecycleJobs.length === trackedJobKeys.size &&
      oldReplacementPayload?.mediaAssetId === undefined &&
      oldReplacementPayload?.objectKey ===
        `derivatives/${initialMediaIds[0]}/1.webp` &&
      removedPayload?.mediaAssetId === initialMediaIds[1] &&
      removedPayload?.objectKey === `derivatives/${initialMediaIds[1]}/1.webp`;
    const ok =
      firstWhole &&
      raceWhole &&
      coverOnlyWhole &&
      archiveTerminal &&
      archiveCreated.entry.id === archivePublication.publishId &&
      archiveRace.some((result) => result.status === "fulfilled") &&
      faultWhole &&
      injectedDbFaultClass === "transaction_rolled_back" &&
      mismatchClass === "idempotency_mismatch" &&
      anotherOwnerClass === "atomic_edit_unavailable" &&
      archivedEntryClass === "atomic_edit_unavailable" &&
      jobWhole;

    const receipt = Object.freeze({
      version: ATOMIC_JOURNAL_EDIT_RECEIPT_VERSION,
      ok,
      mode: "integration-faults" as const,
      initialRevision: 1,
      committedRevision: 2,
      concurrentFinalRevision: Number(afterRace.entry.journal_revision),
      exactReplayClass: exactReplay.isReplay ? "same_revision" : "unexpected",
      durableReplayClass: providerIndependentReplay
        ? "provider_independent"
        : "missing",
      mismatchClass,
      anotherOwnerClass,
      archivedEntryClass,
      concurrentWinnerCount: raceFulfilled,
      concurrentLoserClass: raceConflictClasses[0] ?? "missing",
      coverOnlyTransitionClass: coverOnlyWhole
        ? "retained_without_revoke"
        : "unsafe",
      archiveRaceClass: archiveTerminal ? "canonical_terminal_winner" : "mixed",
      injectedDbFaultClass,
      faultStateClass: faultWhole ? "exact_prior_revision" : "mixed",
      retainedMediaCount: afterFirst.media.length,
      replacementGeneration: Number(replacementRow.upload_generation),
      preservedRelationCount: relationAfter.length,
      preservedTopicSignalCount: topicsAfter.length,
      lifecycleIntentCount: lifecycleJobs.length,
      evidenceHygiene: Object.freeze({
        identityAbsent: true,
        documentTextAbsent: true,
        mediaKeyAbsent: true,
        capabilityAbsent: true,
        preciseLocationAbsent: true,
      }),
    });
    if (!ok) {
      throw new Error(
        `OVE-348 integration proof failed: ${JSON.stringify(receipt)}`,
      );
    }
    return receipt;
  } finally {
    if (trackedJobKeys.size > 0 || cleanupOnlyJobKeys.size > 0) {
      await db
        .deleteFrom("job_queue")
        .where("idempotency_key", "in", [
          ...trackedJobKeys,
          ...cleanupOnlyJobKeys,
        ])
        .execute()
        .catch(() => undefined);
    }
    await db
      .deleteFrom("public_projection_intents")
      .where("owner_user_id", "in", [ownerUserId, anotherUserId])
      .execute()
      .catch(() => undefined);
    await db
      .deleteFrom("learning_attribution_outbox")
      .where("user_id", "in", [ownerUserId, anotherUserId])
      .execute()
      .catch(() => undefined);
    await db
      .deleteFrom("spaces")
      .where("owner_user_id", "in", [ownerUserId, anotherUserId])
      .execute()
      .catch(() => undefined);
    if (trackedTopicIds.size > 0) {
      await db
        .deleteFrom("journal_topics")
        .where("id", "in", [...trackedTopicIds])
        .where("slug", "like", "ove348-%")
        .execute()
        .catch(() => undefined);
    }
    await db
      .deleteFrom("user")
      .where("id", "in", [ownerUserId, anotherUserId])
      .execute()
      .catch(() => undefined);
    await db.destroy();
  }
}

function syntheticUser(id: string, suffix: string) {
  return {
    id,
    email: `ove348-${suffix}-${id}@example.invalid`,
    emailVerified: true,
    image: null,
    name: "OVE-348 synthetic atomic-edit fixture",
  };
}

function journalDocument(text: string, mediaAssetIds: readonly string[]) {
  return {
    schemaVersion: 1 as const,
    blocks: [
      {
        id: "b_atomic_edit_text",
        type: "paragraph" as const,
        spans: [{ text }],
      },
      ...mediaAssetIds.map((mediaAssetId, index) => ({
        id: `b_atomic_edit_image_${index + 1}`,
        type: "image" as const,
        mediaAssetId,
      })),
    ],
  };
}

function atomicPublication(mediaAssetIds: readonly string[]) {
  const publishId = randomUUID();
  if (mediaAssetIds.length === 0) {
    return {
      publishId,
      requestDigest: digest43(publishId),
      disclosureAccepted: true,
      coverMediaAssetId: null,
      handoff: null,
    };
  }
  const stagingSessionId = randomUUID();
  return {
    publishId,
    requestDigest: digest43(publishId),
    disclosureAccepted: true,
    coverMediaAssetId: mediaAssetIds[0]!,
    handoff: {
      stagingSessionId,
      receiptSetDigest: digest43(stagingSessionId),
      publicMedia: mediaAssetIds.map((mediaAssetId) =>
        claimedMedia(mediaAssetId, 1),
      ),
    },
  };
}

function claimedMedia(mediaAssetId: string, generation: number) {
  return {
    mediaAssetId,
    generation,
    sha256: digest44(`${mediaAssetId}:${generation}`),
    sizeBytes: 4,
    width: 2,
    height: 2,
    publicPath: `derivatives/${mediaAssetId}/${generation}.webp`,
  };
}

function editIdentity() {
  const clientMutationId = randomUUID();
  const mutationPrefix = `atomic-edit:${clientMutationId}:`;
  return {
    mutationPrefix,
    mutationReceiptId: `${mutationPrefix}${digest43(clientMutationId)}`,
  };
}

function finalizeKey(publication: ReturnType<typeof atomicPublication>) {
  if (!publication.handoff) return `unused:${publication.publishId}`;
  return `media_staging_finalize:${publication.publishId}:${publication.handoff.receiptSetDigest}`;
}

function revokeKey(mediaAssetId: string, generation: number) {
  return `media_derivative_revoke:public_derivative:derivatives/${mediaAssetId}/${generation}.webp`;
}

async function relationReceipt(
  db: Awaited<typeof import("../src/db")>["db"],
  entryId: string,
) {
  return db
    .selectFrom("journal_entry_object_mentions")
    .select(["plant_object_id as plantObjectId", "space_id as spaceId"])
    .where("journal_entry_id", "=", entryId)
    .orderBy("plant_object_id", "asc")
    .execute();
}

async function topicReceipt(
  db: Awaited<typeof import("../src/db")>["db"],
  entryId: string,
) {
  return db
    .selectFrom("journal_entry_topic_signals")
    .select([
      "topic_id as topicId",
      "signal_source as signalSource",
      "review_state as reviewState",
      "public_membership_state as publicMembershipState",
    ])
    .where("journal_entry_id", "=", entryId)
    .orderBy("topic_id", "asc")
    .orderBy("signal_source", "asc")
    .execute();
}

function digest43(seed: string) {
  return createHash("sha256").update(seed).digest("base64url");
}

function digest44(seed: string) {
  return createHash("sha256").update(seed).digest("base64");
}

function errorCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return error instanceof Error ? error.message : "unknown";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function assertLocalDatabase(raw: string | undefined) {
  if (!raw) {
    throw new Error("DATABASE_URL is required for OVE-348 integration proof.");
  }
  const url = new URL(raw);
  if (
    process.env.VERCEL_ENV?.toLowerCase() === "production" ||
    !["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(
      url.hostname.toLowerCase(),
    ) ||
    url.pathname !== "/overgarden"
  ) {
    throw new Error(
      "OVE-348 integration proof requires the local OverGarden DB.",
    );
  }
}

function runWithReactServerCondition() {
  const scriptPath = fileURLToPath(import.meta.url);
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      scriptPath,
      ...process.argv.slice(2),
      "--internal-react-server",
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: ["inherit", "pipe", "pipe"],
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

async function main() {
  const integrationMode =
    process.argv.includes("--mode") &&
    process.argv[process.argv.indexOf("--mode") + 1] === "integration-faults";
  if (integrationMode) {
    if (!process.argv.includes("--internal-react-server")) {
      runWithReactServerCondition();
      return;
    }
    const receipt = await runIntegrationFaultProof();
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return;
  }
  process.stdout.write(
    `${JSON.stringify({
      ...buildFocusedAtomicJournalEditReceipt(),
      waitSafety: buildAtomicJournalEditWaitSafetyReceipt(),
    })}\n`,
  );
}

if (process.argv[1]?.endsWith("smoke-atomic-journal-edit.ts")) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : "OVE-348 smoke failed."}\n`,
    );
    process.exitCode = 1;
  });
}
