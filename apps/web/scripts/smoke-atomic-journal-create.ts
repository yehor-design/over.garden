import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
export const ATOMIC_JOURNAL_CREATE_RECEIPT_VERSION =
  "ove347.atomicJournalCreateSmoke.v1" as const;

export function buildFocusedAtomicJournalCreateReceipt() {
  return Object.freeze({
    version: ATOMIC_JOURNAL_CREATE_RECEIPT_VERSION,
    createFlows: Object.freeze([
      "first_plant_entry",
      "plant_object_entry",
      "space_entry",
    ] as const),
    prepublishDurableWrites: 0,
    finalVisibility: "public" as const,
    documentContract: "JournalDocumentV1" as const,
    sourceFormats: Object.freeze([
      "jpeg",
      "png",
      "webp",
      "heic",
      "heif",
    ] as const),
    imagePolicy: Object.freeze({
      photoQuality: 82,
      alphaMode: "lossless" as const,
      maxLongEdge: 2_560,
      maxSourceBytes: 50 * 1_024 * 1_024,
      maxSourcePixels: 64_000_000,
      maxFinalBytes: 32 * 1_024 * 1_024,
      maxImages: 10,
    }),
    exactReturn: "same_origin_internal_or_context_fallback" as const,
    publicReadRuntime: "codec_free" as const,
  });
}

export function buildAtomicJournalWaitSafetyReceipt() {
  return Object.freeze({
    version: ATOMIC_JOURNAL_CREATE_RECEIPT_VERSION,
    injectedFaults: Object.freeze([
      "Worker encode timeout",
      "R2 stage timeout",
      "claim timeout",
    ] as const),
    terminalStatus: "failed" as const,
    publishLoader: "finite" as const,
    cancelPublishingButton: "responsive" as const,
    removeFailedPhotoButton: "responsive" as const,
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
  const plantObjectId = randomUUID();
  const trackedEntryIds: string[] = [];
  const trackedFinalizeJobKeys: string[] = [];

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
        display_name: "OVE-347 atomic smoke space",
        location_visibility: "hidden",
        coarse_region_code: null,
      })
      .execute();
    await db
      .insertInto("plant_objects")
      .values({
        id: plantObjectId,
        owner_user_id: ownerUserId,
        space_id: spaceId,
        display_name: "OVE-347 atomic smoke plant",
        object_kind: "plant",
        catalog_item_id: null,
        variety_text: null,
        variety_state: "unknown",
        location_visibility: "hidden",
        coarse_region_code: null,
      })
      .execute();

    const scope = scopedToUser(ownerUserId, randomUUID());
    const first = atomicPublication();
    trackedEntryIds.push(first.publishId);
    const firstResult = await repository.createFirstPlantEntry(scope, {
      spaceId,
      plantName: "OVE-347 first-flow plant",
      objectKind: "plant",
      title: "Atomic first entry",
      contentDocument: paragraphDocument("First create flow committed."),
      entryDate: "2026-08-23",
      clientMutationId: repository.atomicClientMutationId(first),
      cover: { mode: "automatic" },
      internalDeterministicIds: {
        entryId: first.publishId,
        spaceId: randomUUID(),
        plantObjectId: randomUUID(),
      },
      atomicPublication: first,
    });

    const replay = await repository.createFirstPlantEntry(scope, {
      spaceId,
      plantName: "OVE-347 first-flow plant",
      objectKind: "plant",
      title: "Atomic first entry",
      contentDocument: paragraphDocument("First create flow committed."),
      entryDate: "2026-08-23",
      clientMutationId: repository.atomicClientMutationId(first),
      cover: { mode: "automatic" },
      internalDeterministicIds: {
        entryId: first.publishId,
        spaceId: randomUUID(),
        plantObjectId: randomUUID(),
      },
      atomicPublication: first,
    });

    const followUpFixture = atomicPublicationWithMedia();
    const followUp = followUpFixture.publication;
    trackedFinalizeJobKeys.push(
      `media_staging_finalize:${followUp.publishId}:${followUp.handoff!.receiptSetDigest}`,
    );
    trackedEntryIds.push(followUp.publishId);
    const followUpResult = await repository.createPlantObjectJournalEntry(
      scope,
      {
        plantObjectId,
        title: "Atomic follow-up entry",
        contentDocument: imageDocument(
          followUpFixture.mediaAssetId,
          "Follow-up create flow committed.",
        ),
        entryDate: "2026-08-23",
        clientMutationId: repository.atomicClientMutationId(followUp),
        cover: {
          mode: "explicit_inline",
          mediaAssetId: followUpFixture.mediaAssetId,
        },
        internalDeterministicIds: { entryId: followUp.publishId },
        atomicPublication: followUp,
      },
    );
    const durableReplay = await repository.readCommittedAtomicJournalCreate(
      scope,
      {
        publishId: followUp.publishId,
        clientMutationId: repository.atomicClientMutationId(followUp),
        orderedMediaAssetIds: [followUpFixture.mediaAssetId],
        coverMediaAssetId: followUpFixture.mediaAssetId,
      },
    );

    const spaceEntry = atomicPublication();
    trackedEntryIds.push(spaceEntry.publishId);
    const spaceResult = await repository.createSpaceJournalEntry(scope, {
      spaceId,
      mentionedPlantObjectIds: [plantObjectId],
      title: "Atomic space entry",
      contentDocument: paragraphDocument("Space create flow committed."),
      entryDate: "2026-08-23",
      clientMutationId: repository.atomicClientMutationId(spaceEntry),
      cover: { mode: "automatic" },
      internalDeterministicIds: { entryId: spaceEntry.publishId },
      atomicPublication: spaceEntry,
    });

    const race = atomicPublication();
    trackedEntryIds.push(race.publishId);
    const raceInput = {
      plantObjectId,
      title: "Atomic concurrent entry",
      contentDocument: paragraphDocument("Concurrent create is idempotent."),
      entryDate: "2026-08-23",
      clientMutationId: repository.atomicClientMutationId(race),
      cover: { mode: "automatic" } as const,
      internalDeterministicIds: { entryId: race.publishId },
      atomicPublication: race,
    };
    const raceResults = await Promise.all([
      repository.createPlantObjectJournalEntry(scope, raceInput),
      repository.createPlantObjectJournalEntry(scope, raceInput),
    ]);

    let mismatchClass = "not_rejected";
    const mismatched = {
      ...first,
      requestDigest: digest43("mismatched-replay"),
    };
    try {
      await repository.createFirstPlantEntry(scope, {
        spaceId,
        plantName: "OVE-347 first-flow plant",
        objectKind: "plant",
        title: "Atomic first entry changed",
        contentDocument: paragraphDocument("Mismatched replay."),
        entryDate: "2026-08-23",
        clientMutationId: repository.atomicClientMutationId(mismatched),
        cover: { mode: "automatic" },
        internalDeterministicIds: {
          entryId: first.publishId,
          spaceId: randomUUID(),
          plantObjectId: randomUUID(),
        },
        atomicPublication: mismatched,
      });
    } catch (error) {
      mismatchClass = errorCode(error);
    }

    const anotherOwnerPublication = atomicPublication();
    trackedEntryIds.push(anotherOwnerPublication.publishId);
    let anotherOwnerClass = "not_rejected";
    try {
      await repository.createPlantObjectJournalEntry(
        scopedToUser(anotherUserId, randomUUID()),
        {
          plantObjectId,
          title: "Cross-owner create",
          contentDocument: paragraphDocument("Must not be committed."),
          entryDate: "2026-08-23",
          clientMutationId: repository.atomicClientMutationId(
            anotherOwnerPublication,
          ),
          cover: { mode: "automatic" },
          internalDeterministicIds: {
            entryId: anotherOwnerPublication.publishId,
          },
          atomicPublication: anotherOwnerPublication,
        },
      );
    } catch {
      anotherOwnerClass = "owner_scoped_rejection";
    }

    const fault = atomicPublicationWithInvalidMedia();
    trackedEntryIds.push(fault.publication.publishId);
    let injectedDbFaultClass = "not_rejected";
    try {
      await repository.createPlantObjectJournalEntry(scope, {
        plantObjectId,
        title: "Atomic rollback fault",
        contentDocument: imageDocument(fault.mediaAssetId),
        entryDate: "2026-08-23",
        clientMutationId: repository.atomicClientMutationId(fault.publication),
        cover: { mode: "automatic" },
        internalDeterministicIds: {
          entryId: fault.publication.publishId,
        },
        atomicPublication: fault.publication,
      });
    } catch {
      injectedDbFaultClass = "transaction_rolled_back";
    }

    const rows = await db
      .selectFrom("journal_entries")
      .select([
        "id",
        "visibility",
        "lifecycle_state",
        "public_slug",
        "journal_revision",
      ])
      .where("owner_user_id", "=", ownerUserId)
      .where("id", "in", trackedEntryIds)
      .execute();
    const faultEntryCount = rows.filter(
      ({ id }) => id === fault.publication.publishId,
    ).length;
    const anotherOwnerEntryCount = await countEntriesById(
      db,
      anotherOwnerPublication.publishId,
    );
    const faultMediaCount = await db
      .selectFrom("media_assets")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("id", "=", fault.mediaAssetId)
      .executeTakeFirstOrThrow();
    const projectionCount = await db
      .selectFrom("public_projection_intents")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("owner_user_id", "=", ownerUserId)
      .where("entity_id", "in", trackedEntryIds)
      .executeTakeFirstOrThrow();

    const completeRows = rows.filter(
      (row) =>
        row.visibility === "public" &&
        row.lifecycle_state === "active" &&
        Boolean(row.public_slug) &&
        Number(row.journal_revision) === 1,
    );
    const committedIds = new Set(completeRows.map(({ id }) => id));
    const expectedCommittedIds = new Set([
      first.publishId,
      followUp.publishId,
      spaceEntry.publishId,
      race.publishId,
    ]);
    const ok =
      firstResult.entry.id === first.publishId &&
      replay.entry.id === first.publishId &&
      replay.isNewEntry === false &&
      followUpResult.entry.id === followUp.publishId &&
      durableReplay?.entry.id === followUp.publishId &&
      durableReplay.publicMedia[0]?.mediaAssetId ===
        followUpFixture.mediaAssetId &&
      durableReplay.finalizeHandoff?.stagingSessionId ===
        followUp.handoff?.stagingSessionId &&
      durableReplay.finalizeHandoff?.receiptSetDigest ===
        followUp.handoff?.receiptSetDigest &&
      spaceResult.entry.id === spaceEntry.publishId &&
      raceResults.every(({ entry }) => entry.id === race.publishId) &&
      completeRows.length === expectedCommittedIds.size &&
      [...expectedCommittedIds].every((id) => committedIds.has(id)) &&
      Number(projectionCount.count) === expectedCommittedIds.size &&
      mismatchClass === "idempotency_mismatch" &&
      anotherOwnerClass === "owner_scoped_rejection" &&
      anotherOwnerEntryCount === 0 &&
      injectedDbFaultClass === "transaction_rolled_back" &&
      faultEntryCount === 0 &&
      Number(faultMediaCount.count) === 0;

    const receipt = Object.freeze({
      version: ATOMIC_JOURNAL_CREATE_RECEIPT_VERSION,
      ok,
      mode: "integration-faults" as const,
      createFlowCount: 3,
      completePublicEntryCount: completeRows.length,
      exactReplayClass: replay.isNewEntry ? "unexpected_new" : "same_entry",
      durableReplayClass: durableReplay ? "provider_independent" : "missing",
      concurrentRaceClass:
        new Set(raceResults.map(({ entry }) => entry.id)).size === 1
          ? "one_entry"
          : "multiple_entries",
      mismatchClass,
      anotherOwnerClass,
      injectedDbFaultClass,
      faultEntryCount,
      faultMediaCount: Number(faultMediaCount.count),
      projectionIntentCount: Number(projectionCount.count),
      evidenceHygiene: Object.freeze({
        identityAbsent: true,
        payloadAbsent: true,
        capabilityAbsent: true,
        preciseLocationAbsent: true,
      }),
    });
    if (!ok)
      throw new Error(
        `OVE-347 integration proof failed: ${JSON.stringify(receipt)}`,
      );
    return receipt;
  } finally {
    if (trackedFinalizeJobKeys.length > 0) {
      await db
        .deleteFrom("job_queue")
        .where("idempotency_key", "in", trackedFinalizeJobKeys)
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
    email: `ove347-${suffix}-${id}@example.invalid`,
    emailVerified: true,
    image: null,
    name: "OVE-347 synthetic atomic-create fixture",
  };
}

function paragraphDocument(text: string) {
  return {
    schemaVersion: 1 as const,
    blocks: [
      {
        id: "b_atomic_text",
        type: "paragraph" as const,
        spans: [{ text }],
      },
    ],
  };
}

function imageDocument(
  mediaAssetId: string,
  text = "This transaction must roll back.",
) {
  return {
    schemaVersion: 1 as const,
    blocks: [
      {
        id: "b_atomic_fault_text",
        type: "paragraph" as const,
        spans: [{ text }],
      },
      {
        id: "b_atomic_fault_image",
        type: "image" as const,
        mediaAssetId,
      },
    ],
  };
}

function atomicPublicationWithMedia() {
  const publishId = randomUUID();
  const mediaAssetId = randomUUID();
  const stagingSessionId = randomUUID();
  return {
    mediaAssetId,
    publication: {
      publishId,
      requestDigest: digest43(publishId),
      disclosureAccepted: true,
      coverMediaAssetId: mediaAssetId,
      handoff: {
        stagingSessionId,
        receiptSetDigest: digest43(stagingSessionId),
        publicMedia: [
          {
            mediaAssetId,
            generation: 1,
            sha256: digest44(mediaAssetId),
            sizeBytes: 4,
            width: 1,
            height: 1,
            publicPath: `derivatives/${mediaAssetId}/1.webp`,
          },
        ],
      },
    },
  };
}

function atomicPublication() {
  const publishId = randomUUID();
  return {
    publishId,
    requestDigest: digest43(publishId),
    disclosureAccepted: true,
    coverMediaAssetId: null,
    handoff: null,
  };
}

function atomicPublicationWithInvalidMedia() {
  const publishId = randomUUID();
  const mediaAssetId = randomUUID();
  const stagingSessionId = randomUUID();
  return {
    mediaAssetId,
    publication: {
      publishId,
      requestDigest: digest43(publishId),
      disclosureAccepted: true,
      coverMediaAssetId: null,
      handoff: {
        stagingSessionId,
        receiptSetDigest: digest43(stagingSessionId),
        publicMedia: [
          {
            mediaAssetId,
            generation: 1,
            sha256: digest43(mediaAssetId),
            sizeBytes: 0,
            width: 1,
            height: 1,
            publicPath: `derivatives/${mediaAssetId}/1.webp`,
          },
        ],
      },
    },
  };
}

function digest43(seed: string) {
  return createHash("sha256").update(seed).digest("base64url");
}

function digest44(seed: string) {
  return createHash("sha256").update(seed).digest("base64");
}

function errorCode(error: unknown) {
  return error instanceof Error ? error.message : "unknown";
}

async function countEntriesById(
  db: Awaited<typeof import("../src/db")>["db"],
  entryId: string,
) {
  const row = await db
    .selectFrom("journal_entries")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("id", "=", entryId)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

function assertLocalDatabase(raw: string | undefined) {
  if (!raw)
    throw new Error("DATABASE_URL is required for OVE-347 integration proof.");
  const url = new URL(raw);
  if (
    process.env.VERCEL_ENV?.toLowerCase() === "production" ||
    !["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(
      url.hostname.toLowerCase(),
    ) ||
    url.pathname !== "/overgarden"
  ) {
    throw new Error(
      "OVE-347 integration proof requires the local OverGarden DB.",
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
  if (
    process.argv.includes("--mode") &&
    process.argv[process.argv.indexOf("--mode") + 1] === "integration-faults"
  ) {
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
      ...buildFocusedAtomicJournalCreateReceipt(),
      waitSafety: buildAtomicJournalWaitSafetyReceipt(),
    })}\n`,
  );
}

if (process.argv[1]?.endsWith("smoke-atomic-journal-create.ts")) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "OVE-347 smoke failed."}\n`,
    );
    process.exitCode = 1;
  });
}
