import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

const runDatabaseIntegration =
  process.env.RUN_OVE269_DATABASE_INTEGRATION === "true";
const createdUserIds: string[] = [];

describe("plant identification repository database protocol", () => {
  afterEach(async () => {
    if (!runDatabaseIntegration || createdUserIds.length === 0) return;
    const { db } = await import("@/db");
    await db
      .deleteFrom("user")
      .where("id", "in", createdUserIds.splice(0, createdUserIds.length))
      .execute();
  });

  it.skipIf(!runDatabaseIntegration)(
    "allows one owner-scoped claim, fences a concurrent receipt, and removes all synthetic rows through account deletion",
    async () => {
      const [{ db }, repository] = await Promise.all([
        import("@/db"),
        import("./plant-identification-repository"),
      ]);
      const ownerId = randomUUID();
      const otherOwnerId = randomUUID();
      const concurrentOwnerIds = [
        otherOwnerId,
        randomUUID(),
        randomUUID(),
        randomUUID(),
      ];
      createdUserIds.push(ownerId, ...concurrentOwnerIds);
      await db
        .insertInto("user")
        .values([
          syntheticUser(ownerId),
          ...concurrentOwnerIds.map(syntheticUser),
        ])
        .execute();
      const scope = { userId: ownerId } as never;
      const otherScope = { userId: otherOwnerId } as never;
      const first = await repository.createOrReadPlantIdentificationRequest(
        scope,
        requestInput("a".repeat(64)),
      );
      const replay = await repository.createOrReadPlantIdentificationRequest(
        scope,
        requestInput("a".repeat(64)),
      );
      expect(first.isNew).toBe(true);
      expect(replay).toEqual({
        id: first.id,
        state: "ready_to_submit",
        isNew: false,
      });

      const firstClaim = await repository.claimPlantIdentificationSubmission(
        scope,
        first.id,
      );
      expect(firstClaim?.claimToken).toEqual(expect.any(String));
      const competing = await repository.createOrReadPlantIdentificationRequest(
        scope,
        requestInput("b".repeat(64)),
      );
      await expect(
        repository.claimPlantIdentificationSubmission(scope, competing.id),
      ).resolves.toBeNull();
      await expect(
        repository.readPlantIdentificationReceipt(otherScope, first.id),
      ).resolves.toBeNull();

      const globalClaims = await Promise.all(
        concurrentOwnerIds.slice(0, 3).map(async (userId, index) => {
          const request =
            await repository.createOrReadPlantIdentificationRequest(
              { userId } as never,
              requestInput(String(index + 3).repeat(64)),
            );
          return repository.claimPlantIdentificationSubmission(
            { userId } as never,
            request.id,
          );
        }),
      );
      expect(globalClaims).toEqual([
        { claimToken: expect.any(String) },
        { claimToken: expect.any(String) },
        { claimToken: expect.any(String) },
      ]);
      const fifthOwnerId = concurrentOwnerIds[3]!;
      const fifthRequest =
        await repository.createOrReadPlantIdentificationRequest(
          { userId: fifthOwnerId } as never,
          requestInput("6".repeat(64)),
        );
      await expect(
        repository.claimPlantIdentificationSubmission(
          { userId: fifthOwnerId } as never,
          fifthRequest.id,
        ),
      ).resolves.toBeNull();

      await expect(
        repository.settlePlantIdentificationCandidates(scope, {
          requestId: first.id,
          claimToken: firstClaim!.claimToken,
          durationMs: 10,
          quotaRemaining: 7,
          modelVersion: "model-v1",
          candidates: [
            {
              rank: 1,
              score: 0.9,
              scientificName: "Unmapped test species",
              genus: null,
              family: null,
              mappingStatus: "unmapped",
              catalogItemId: null,
            },
          ],
        }),
      ).resolves.toBe(true);
      await repository.recordPlantIdentificationDecision(scope, {
        requestId: first.id,
        decision: "unknown",
      });
      await expect(
        repository.readPlantIdentificationReceipt(scope, first.id),
      ).resolves.toMatchObject({ state: "completed", candidates: [] });
      await expect(
        repository.claimPlantIdentificationSubmission(
          { userId: fifthOwnerId } as never,
          fifthRequest.id,
        ),
      ).resolves.toEqual({ claimToken: expect.any(String) });
    },
  );
});

function requestInput(fingerprint: string) {
  return {
    plantObjectId: null,
    fingerprint,
    mediaManifest: [
      {
        mediaAssetId: randomUUID(),
        derivativeSha256: "c".repeat(64),
      },
    ],
    organs: ["auto"],
    policyVersion: "ove269.test.v1",
  };
}

function syntheticUser(id: string) {
  return {
    id,
    email: `${id}@ove269.invalid`,
    emailVerified: true,
    image: null,
    name: "OVE-269 synthetic integration user",
  };
}
