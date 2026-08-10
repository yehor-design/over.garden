import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { offlineDb } from "./queue";
import {
  eraseCurrentDeviceOwnerVault,
  migrateLegacyOwnerVault,
  readOwnerVaultControlReceipt,
} from "./owner-vault-migration";
import {
  offlineOwnerVaultDatabaseName,
  OWNER_VAULT_CONTROL_DATABASE,
  OwnerVaultDb,
} from "./owner-vault";

const OWNER_A = "00000000-0000-4000-8000-0000000000a1";
const OWNER_B = "00000000-0000-4000-8000-0000000000b2";
const BINDING_A = "C".repeat(43);
const BINDING_B = "D".repeat(43);

describe("legacy owner-vault migration", () => {
  beforeEach(async () => {
    await clearLegacyDatabase();
    await Dexie.delete(offlineOwnerVaultDatabaseName(BINDING_A));
    await Dexie.delete(offlineOwnerVaultDatabaseName(BINDING_B));
    await Dexie.delete(OWNER_VAULT_CONTROL_DATABASE);
  });

  afterEach(async () => {
    await clearLegacyDatabase();
    await Dexie.delete(offlineOwnerVaultDatabaseName(BINDING_A));
    await Dexie.delete(offlineOwnerVaultDatabaseName(BINDING_B));
    await Dexie.delete(OWNER_VAULT_CONTROL_DATABASE);
  });

  it("copies only the exact owner, independently verifies it, then removes only that legacy source", async () => {
    const ownerADraft = {
      ...draft(OWNER_A, "draft-a", "owner-a-private"),
      payload: {
        body: "owner-a-private",
        photo: new Blob(["exact-photo-bytes"], { type: "image/webp" }),
      },
    };
    await offlineDb?.drafts.bulkAdd([
      ownerADraft,
      draft(OWNER_B, "draft-b", "owner-b-private"),
    ]);
    await offlineDb?.mutations.bulkAdd([
      mutation(OWNER_A, "mutation-a", "idempotency-a"),
      mutation(OWNER_B, "mutation-b", "idempotency-b"),
    ]);
    await offlineDb?.draftSummaries.bulkAdd([
      draftSummary(OWNER_A, "draft-a"),
      draftSummary(OWNER_B, "draft-b"),
    ]);
    await offlineDb?.mutationSummaries.bulkAdd([
      mutationSummary(OWNER_A, "mutation-a", "queued"),
      mutationSummary(OWNER_B, "mutation-b", "queued"),
    ]);
    await offlineDb?.composerDurability.bulkAdd([
      composerDurability(OWNER_A, "draft-a"),
      composerDurability(OWNER_B, "draft-b"),
    ]);
    await offlineDb?.ownerActivity.bulkAdd([
      ownerActivity(OWNER_A),
      ownerActivity(OWNER_B),
    ]);
    const target = new OwnerVaultDb(BINDING_A);
    await target.open();

    const result = await migrateLegacyOwnerVault({
      ownerUserId: OWNER_A,
      binding: BINDING_A,
      source: offlineDb!,
      target,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "activated",
        sourceCleanupConfirmed: true,
        counts: {
          drafts: 1,
          mutations: 1,
          draftSummaries: 1,
          mutationSummaries: 1,
          composerDurability: 1,
          ownerActivity: 1,
        },
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    await expect(target.drafts.toArray()).resolves.toEqual([
      expect.objectContaining({ ownerUserId: OWNER_A, id: "draft-a" }),
    ]);
    const migratedDraft = await target.drafts.get([OWNER_A, "draft-a"]);
    await expect(
      (migratedDraft?.payload as { photo: Blob }).photo.text(),
    ).resolves.toBe("exact-photo-bytes");
    await expect(target.mutations.toArray()).resolves.toEqual([
      expect.objectContaining({ ownerUserId: OWNER_A, id: "mutation-a" }),
    ]);
    await expect(target.draftSummaries.toArray()).resolves.toEqual([
      expect.objectContaining({ ownerUserId: OWNER_A, id: "draft-a" }),
    ]);
    await expect(target.mutationSummaries.toArray()).resolves.toEqual([
      expect.objectContaining({ ownerUserId: OWNER_A, id: "mutation-a" }),
    ]);
    await expect(target.composerDurability.toArray()).resolves.toEqual([
      expect.objectContaining({ ownerUserId: OWNER_A, draftId: "draft-a" }),
    ]);
    await expect(target.ownerActivity.toArray()).resolves.toEqual([
      expect.objectContaining({ ownerUserId: OWNER_A }),
    ]);
    await expect(offlineDb?.drafts.toArray()).resolves.toEqual([
      expect.objectContaining({ ownerUserId: OWNER_B, id: "draft-b" }),
    ]);
    await expect(offlineDb?.mutations.toArray()).resolves.toEqual([
      expect.objectContaining({ ownerUserId: OWNER_B, id: "mutation-b" }),
    ]);
    await expect(offlineDb?.draftSummaries.toArray()).resolves.toEqual([
      expect.objectContaining({ ownerUserId: OWNER_B, id: "draft-b" }),
    ]);
    await expect(offlineDb?.mutationSummaries.toArray()).resolves.toEqual([
      expect.objectContaining({ ownerUserId: OWNER_B, id: "mutation-b" }),
    ]);
    await expect(offlineDb?.composerDurability.toArray()).resolves.toEqual([
      expect.objectContaining({ ownerUserId: OWNER_B, draftId: "draft-b" }),
    ]);
    await expect(offlineDb?.ownerActivity.toArray()).resolves.toEqual([
      expect.objectContaining({ ownerUserId: OWNER_B }),
    ]);

    const control = await readOwnerVaultControlReceipt(BINDING_A);
    expect(control).toEqual(
      expect.objectContaining({
        binding: BINDING_A,
        state: "active",
        sourceCleanupConfirmed: true,
      }),
    );
    expect(JSON.stringify(control)).not.toMatch(
      /owner-a-private|owner-b-private|00000000|draft-a|mutation-a/i,
    );
    target.close();
  });

  it("preserves both copies and records a payload-free conflict when one key diverges", async () => {
    await offlineDb?.drafts.add(draft(OWNER_A, "same-key", "legacy-value"));
    const target = new OwnerVaultDb(BINDING_A);
    await target.open();
    await target.drafts.add(draft(OWNER_A, "same-key", "target-value"));

    const result = await migrateLegacyOwnerVault({
      ownerUserId: OWNER_A,
      binding: BINDING_A,
      source: offlineDb!,
      target,
    });

    expect(result.status).toBe("conflict_blocked");
    await expect(offlineDb?.drafts.get([OWNER_A, "same-key"])).resolves.toEqual(
      expect.objectContaining({ payload: { body: "legacy-value" } }),
    );
    await expect(target.drafts.get([OWNER_A, "same-key"])).resolves.toEqual(
      expect.objectContaining({ payload: { body: "target-value" } }),
    );
    expect(
      JSON.stringify(await readOwnerVaultControlReceipt(BINDING_A)),
    ).not.toMatch(/legacy-value|target-value|same-key|00000000/i);
    target.close();
  });

  it("resumes an interrupted non-conflicting partial target without dropping either row", async () => {
    const first = draft(OWNER_A, "partial-first", "first-value");
    const second = draft(OWNER_A, "partial-second", "second-value");
    await offlineDb?.drafts.bulkAdd([first, second]);
    const target = new OwnerVaultDb(BINDING_A);
    await target.open();
    await target.drafts.add(first);

    const result = await migrateLegacyOwnerVault({
      ownerUserId: OWNER_A,
      binding: BINDING_A,
      source: offlineDb!,
      target,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "activated",
        sourceCleanupConfirmed: true,
        counts: expect.objectContaining({ drafts: 2 }),
      }),
    );
    await expect(target.drafts.toArray()).resolves.toEqual([first, second]);
    await expect(
      offlineDb?.drafts.where("ownerUserId").equals(OWNER_A).count(),
    ).resolves.toBe(0);
    target.close();
  });

  it("defers cleanup when a late legacy write changes the verified source", async () => {
    await offlineDb?.drafts.add(draft(OWNER_A, "first", "first-value"));
    const target = new OwnerVaultDb(BINDING_A);
    await target.open();

    const result = await migrateLegacyOwnerVault(
      {
        ownerUserId: OWNER_A,
        binding: BINDING_A,
        source: offlineDb!,
        target,
      },
      {
        beforeSourceCleanup: async () => {
          await offlineDb?.drafts.add(
            draft(OWNER_A, "late", "late-private-value"),
          );
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "activated",
        sourceCleanupConfirmed: false,
      }),
    );
    await expect(
      offlineDb?.drafts.where("ownerUserId").equals(OWNER_A).count(),
    ).resolves.toBe(2);
    await expect(readOwnerVaultControlReceipt(BINDING_A)).resolves.toEqual(
      expect.objectContaining({ state: "cleanup_deferred" }),
    );

    const recovered = await migrateLegacyOwnerVault(
      {
        ownerUserId: OWNER_A,
        binding: BINDING_A,
        source: offlineDb!,
        target,
      },
      { cleanupMode: "background" },
    );
    expect(recovered).toEqual(
      expect.objectContaining({
        status: "activated",
        sourceCleanupConfirmed: true,
        counts: expect.objectContaining({ drafts: 2 }),
      }),
    );
    await expect(target.drafts.toArray()).resolves.toEqual([
      expect.objectContaining({
        id: "first",
        payload: { body: "first-value" },
      }),
      expect.objectContaining({
        id: "late",
        payload: { body: "late-private-value" },
      }),
    ]);
    await expect(
      offlineDb?.drafts.where("ownerUserId").equals(OWNER_A).count(),
    ).resolves.toBe(0);
    await expect(readOwnerVaultControlReceipt(BINDING_A)).resolves.toEqual(
      expect.objectContaining({
        state: "active",
        sourceCleanupConfirmed: true,
      }),
    );
    target.close();
  });

  it("rejects a cancelled late completion and retains the only legacy source", async () => {
    await offlineDb?.drafts.add(draft(OWNER_A, "cancelled", "only-source"));
    const target = new OwnerVaultDb(BINDING_A);
    await target.open();
    const controller = new AbortController();

    await expect(
      migrateLegacyOwnerVault(
        {
          ownerUserId: OWNER_A,
          binding: BINDING_A,
          source: offlineDb!,
          target,
        },
        {
          signal: controller.signal,
          beforeSourceCleanup: async () => controller.abort(),
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      offlineDb?.drafts.get([OWNER_A, "cancelled"]),
    ).resolves.toEqual(expect.objectContaining({ id: "cancelled" }));
    await expect(readOwnerVaultControlReceipt(BINDING_A)).resolves.toEqual(
      expect.objectContaining({ state: "migration_unstarted" }),
    );
    target.close();
  });

  it("closes a target reopened concurrently with cancellation", async () => {
    await offlineDb?.drafts.add(
      draft(OWNER_A, "reopen-cancelled", "only-source"),
    );
    const target = new OwnerVaultDb(BINDING_A);
    await target.open();
    const controller = new AbortController();
    const originalOpen = target.open.bind(target);
    const reopen = vi.spyOn(target, "open").mockImplementationOnce(() => {
      controller.abort();
      return originalOpen();
    });

    await expect(
      migrateLegacyOwnerVault(
        {
          ownerUserId: OWNER_A,
          binding: BINDING_A,
          source: offlineDb!,
          target,
        },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(reopen).toHaveBeenCalledOnce();
    expect(target.isOpen()).toBe(false);
    await expect(
      offlineDb?.drafts.get([OWNER_A, "reopen-cancelled"]),
    ).resolves.toEqual(expect.objectContaining({ id: "reopen-cancelled" }));
    await expect(readOwnerVaultControlReceipt(BINDING_A)).resolves.toEqual(
      expect.objectContaining({ state: "migration_unstarted" }),
    );
  });

  it("confirms explicit current-device erasure only after target and exact legacy absence", async () => {
    await offlineDb?.drafts.bulkAdd([
      draft(OWNER_A, "legacy-a", "legacy-a-private"),
      draft(OWNER_B, "legacy-b", "legacy-b-private"),
    ]);
    const targetA = new OwnerVaultDb(BINDING_A);
    const targetB = new OwnerVaultDb(BINDING_B);
    await Promise.all([targetA.open(), targetB.open()]);
    await targetA.drafts.add(draft(OWNER_A, "target-a", "target-a-private"));
    await targetB.drafts.add(draft(OWNER_B, "target-b", "target-b-private"));
    await offlineDb?.mutations.bulkAdd([
      {
        ...mutation(OWNER_A, "synced-a", "synced-idempotency-a"),
        status: "synced",
      },
      mutation(OWNER_B, "queued-b", "queued-idempotency-b"),
    ]);
    await offlineDb?.mutationSummaries.bulkAdd([
      mutationSummary(OWNER_A, "synced-a", "synced"),
      mutationSummary(OWNER_B, "queued-b", "queued"),
    ]);
    await offlineDb?.composerDurability.bulkAdd([
      composerDurability(OWNER_A, "legacy-a"),
      composerDurability(OWNER_B, "legacy-b"),
    ]);
    await offlineDb?.ownerActivity.bulkAdd([
      ownerActivity(OWNER_A),
      ownerActivity(OWNER_B),
    ]);
    targetA.close();

    const result = await eraseCurrentDeviceOwnerVault({
      ownerUserId: OWNER_A,
      binding: BINDING_A,
      legacy: offlineDb!,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "erased_confirmed",
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    await expect(
      Dexie.exists(offlineOwnerVaultDatabaseName(BINDING_A)),
    ).resolves.toBe(false);
    await expect(targetB.drafts.get([OWNER_B, "target-b"])).resolves.toEqual(
      expect.objectContaining({ payload: { body: "target-b-private" } }),
    );
    await expect(
      offlineDb?.drafts.where("ownerUserId").equals(OWNER_A).count(),
    ).resolves.toBe(0);
    await expect(
      offlineDb?.mutations.where("ownerUserId").equals(OWNER_A).count(),
    ).resolves.toBe(0);
    await expect(
      offlineDb?.mutationSummaries.where("ownerUserId").equals(OWNER_A).count(),
    ).resolves.toBe(0);
    await expect(
      offlineDb?.composerDurability
        .where("ownerUserId")
        .equals(OWNER_A)
        .count(),
    ).resolves.toBe(0);
    await expect(
      offlineDb?.ownerActivity.get(OWNER_A),
    ).resolves.toBeUndefined();
    await expect(offlineDb?.drafts.get([OWNER_B, "legacy-b"])).resolves.toEqual(
      expect.objectContaining({ payload: { body: "legacy-b-private" } }),
    );
    await expect(readOwnerVaultControlReceipt(BINDING_A)).resolves.toEqual(
      expect.objectContaining({ state: "erased_confirmed" }),
    );
    targetB.close();
  });

  it("fails closed before reading beyond the aggregate 10,000-row bound", async () => {
    const rows = Array.from({ length: 10_001 }, (_, index) =>
      draft(OWNER_A, `bounded-${index}`, `row-${index}`),
    );
    await offlineDb?.drafts.bulkAdd(rows);
    const target = new OwnerVaultDb(BINDING_A);
    await target.open();

    const result = await migrateLegacyOwnerVault({
      ownerUserId: OWNER_A,
      binding: BINDING_A,
      source: offlineDb!,
      target,
    });

    expect(result).toEqual({
      status: "degraded",
      sourceCleanupConfirmed: false,
    });
    await expect(target.drafts.count()).resolves.toBe(0);
    await expect(
      offlineDb?.drafts.where("ownerUserId").equals(OWNER_A).count(),
    ).resolves.toBe(10_001);
    await expect(readOwnerVaultControlReceipt(BINDING_A)).resolves.toEqual(
      expect.objectContaining({ state: "migration_unstarted" }),
    );
    target.close();
  }, 15_000);

  it.skipIf(process.env.OVERGARDEN_SKIP_OWNER_VAULT_PERFORMANCE === "1")(
    "keeps the 10,000-row owner_vault_operation_duration within the bounded target",
    async () => {
      const rows = Array.from({ length: 10_000 }, (_, index) =>
        draft(
          OWNER_A,
          `load-${index.toString().padStart(5, "0")}`,
          `row-${index}`,
        ),
      );
      await offlineDb?.drafts.bulkAdd(rows);
      const target = new OwnerVaultDb(BINDING_A);
      await target.open();
      const startedAt = performance.now();

      const result = await migrateLegacyOwnerVault({
        ownerUserId: OWNER_A,
        binding: BINDING_A,
        source: offlineDb!,
        target,
      });
      const ownerVaultOperationDuration = performance.now() - startedAt;

      expect(result).toEqual(expect.objectContaining({ status: "activated" }));
      expect(ownerVaultOperationDuration).toBeLessThanOrEqual(3_000);
      await expect(target.drafts.count()).resolves.toBe(10_000);
      target.close();
    },
    10_000,
  );
});

async function clearLegacyDatabase() {
  const database = offlineDb;
  if (!database) return;
  await database.transaction(
    "rw",
    [
      database.mutations,
      database.drafts,
      database.mutationSummaries,
      database.draftSummaries,
      database.composerDurability,
      database.ownerActivity,
    ],
    async () => {
      await Promise.all([
        database.mutations.clear(),
        database.drafts.clear(),
        database.mutationSummaries.clear(),
        database.draftSummaries.clear(),
        database.composerDurability.clear(),
        database.ownerActivity.clear(),
      ]);
    },
  );
}

function draft(ownerUserId: string, id: string, body: string) {
  return {
    ownerUserId,
    id,
    kind: "first_entry" as const,
    payload: { body },
    createdAt: 1,
    updatedAt: 1,
  };
}

function mutation(ownerUserId: string, id: string, idempotencyKey: string) {
  return {
    ownerUserId,
    id,
    kind: "journal_entry" as const,
    payload: { body: `${id}-private` },
    idempotencyKey,
    status: "queued" as const,
    createdAt: 1,
    updatedAt: 1,
    syncLeaseExpiresAt: null,
  };
}

function draftSummary(ownerUserId: string, id: string) {
  return {
    ownerUserId,
    id,
    kind: "first_entry" as const,
    createdAt: 1,
    updatedAt: 1,
    entryDate: "2026-08-10",
    targetObjectId: null,
    targetSpaceId: null,
  };
}

function mutationSummary(
  ownerUserId: string,
  id: string,
  status: "queued" | "synced",
) {
  return {
    ownerUserId,
    id,
    kind: "journal_entry" as const,
    status,
    workspaceVisible: status === "synced" ? (0 as const) : (1 as const),
    createdAt: 1,
    updatedAt: 1,
    target: "first_plant_entry" as const,
    targetObjectId: null,
    targetSpaceId: null,
  };
}

function composerDurability(ownerUserId: string, draftId: string) {
  return {
    ownerUserId,
    draftId,
    protocol: "ove293.owner-composer-durability.v1" as const,
    participantNonce: "participant-nonce-1234567890",
    generation: 1,
    disposition: "stored" as const,
    storedByteLength: 12,
    storedDigest: "a".repeat(64),
    vaultGeneration: "ove293-shared-v6" as const,
    updatedAt: 1,
  };
}

function ownerActivity(ownerUserId: string) {
  return {
    ownerUserId,
    sessionGeneration: "session-generation-a",
    lifecycle: "active" as const,
    operations: [],
    updatedAt: 1,
    expiresAt: Number.MAX_SAFE_INTEGER,
  };
}
