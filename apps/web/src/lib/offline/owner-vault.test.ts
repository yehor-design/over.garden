import Dexie from "dexie";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  activatePhysicalOwnerVault,
  acquireOwnerVaultExclusiveFence,
  deactivatePhysicalOwnerVault,
  fetchAuthenticatedOwnerVaultBinding,
  finalizeOwnerVaultExclusiveFence,
  offlineOwnerVaultDatabaseName,
  OWNER_VAULT_DATABASE_PREFIX,
  readActiveOwnerVaultLifetimeSignal,
  resolveOwnerOfflineDatabase,
  sealActiveOwnerVaultsForLocalExit,
  waitForOwnerVaultWritersToSettle,
  withOwnerVaultWriterLease,
} from "./owner-vault";

const OWNER_A = "00000000-0000-4000-8000-0000000000a1";
const OWNER_B = "00000000-0000-4000-8000-0000000000b2";
const BINDING_A = "A".repeat(43);
const BINDING_B = "B".repeat(43);

describe("physical owner vault", () => {
  afterEach(async () => {
    await deactivatePhysicalOwnerVault(OWNER_A);
    await deactivatePhysicalOwnerVault(OWNER_B);
    await Dexie.delete(offlineOwnerVaultDatabaseName(BINDING_A));
    await Dexie.delete(offlineOwnerVaultDatabaseName(BINDING_B));
  });

  it("uses an exact opaque per-owner database and prevents cross-account reads", async () => {
    const ownerA = await activatePhysicalOwnerVault(OWNER_A, BINDING_A);
    await ownerA.drafts.add({
      ownerUserId: OWNER_A,
      id: "private-a",
      kind: "first_entry",
      payload: { body: "owner-a-private" },
      createdAt: 1,
      updatedAt: 1,
    });

    const ownerB = await activatePhysicalOwnerVault(OWNER_B, BINDING_B);

    expect(ownerA.name).toBe(`${OWNER_VAULT_DATABASE_PREFIX}${BINDING_A}`);
    expect(ownerB.name).toBe(`${OWNER_VAULT_DATABASE_PREFIX}${BINDING_B}`);
    await expect(ownerB.drafts.toArray()).resolves.toEqual([]);
    await expect(ownerA.drafts.toArray()).resolves.toEqual([
      expect.objectContaining({ id: "private-a", ownerUserId: OWNER_A }),
    ]);
    expect(resolveOwnerOfflineDatabase(OWNER_A)).toBe(ownerA);
    expect(resolveOwnerOfflineDatabase(OWNER_B)).toBe(ownerB);
  });

  it("rejects malformed bindings and one binding mapped to two owners", async () => {
    await expect(
      activatePhysicalOwnerVault(OWNER_A, "not-a-binding"),
    ).rejects.toThrow(TypeError);
    await activatePhysicalOwnerVault(OWNER_A, BINDING_A);
    await expect(
      activatePhysicalOwnerVault(OWNER_B, BINDING_A),
    ).rejects.toThrow(/already active/i);
  });

  it("closes and removes the document-local mapping without deleting retained work", async () => {
    const ownerA = await activatePhysicalOwnerVault(OWNER_A, BINDING_A);
    const lifetime = readActiveOwnerVaultLifetimeSignal(OWNER_A, BINDING_A);
    expect(lifetime?.aborted).toBe(false);
    await ownerA.drafts.add({
      ownerUserId: OWNER_A,
      id: "retained-a",
      kind: "first_entry",
      payload: {},
      createdAt: 1,
      updatedAt: 1,
    });

    await deactivatePhysicalOwnerVault(OWNER_A);
    expect(resolveOwnerOfflineDatabase(OWNER_A)).toBeUndefined();
    expect(lifetime?.aborted).toBe(true);

    const reopened = await activatePhysicalOwnerVault(OWNER_A, BINDING_A);
    await expect(reopened.drafts.get([OWNER_A, "retained-a"])).resolves.toEqual(
      expect.objectContaining({ id: "retained-a" }),
    );
  });

  it("synchronously seals every active handle for local exit while retaining exact-owner rows", async () => {
    const ownerA = await activatePhysicalOwnerVault(OWNER_A, BINDING_A);
    await activatePhysicalOwnerVault(OWNER_B, BINDING_B);
    const lifetimeA = readActiveOwnerVaultLifetimeSignal(OWNER_A, BINDING_A);
    const lifetimeB = readActiveOwnerVaultLifetimeSignal(OWNER_B, BINDING_B);
    await ownerA.drafts.add({
      ownerUserId: OWNER_A,
      id: "retained-a-sync-seal",
      kind: "first_entry",
      payload: {},
      createdAt: 1,
      updatedAt: 1,
    });

    expect(sealActiveOwnerVaultsForLocalExit()).toBe(2);
    expect(resolveOwnerOfflineDatabase(OWNER_A)).toBeUndefined();
    expect(resolveOwnerOfflineDatabase(OWNER_B)).toBeUndefined();
    expect(lifetimeA?.aborted).toBe(true);
    expect(lifetimeB?.aborted).toBe(true);

    const reopenedA = await activatePhysicalOwnerVault(OWNER_A, BINDING_A);
    await expect(
      reopenedA.drafts.get([OWNER_A, "retained-a-sync-seal"]),
    ).resolves.toEqual(expect.objectContaining({ id: "retained-a-sync-seal" }));
  });

  it("accepts only a no-store receipt for the immediately verified session generation", async () => {
    const generation = "G".repeat(43);
    const fetcher = async () =>
      Response.json({
        protocol: "ove288.owner-vault-binding.v1",
        binding: BINDING_A,
        sessionGeneration: generation,
      });

    await expect(
      fetchAuthenticatedOwnerVaultBinding(generation, fetcher),
    ).resolves.toBe(BINDING_A);
    await expect(
      fetchAuthenticatedOwnerVaultBinding("H".repeat(43), fetcher),
    ).resolves.toBeNull();
  });

  it("serializes admitted writers against an exclusive migration fence", async () => {
    await activatePhysicalOwnerVault(OWNER_A, BINDING_A);
    let releaseWriter: (() => void) | undefined;
    const writer = withOwnerVaultWriterLease(OWNER_A, async () => {
      await new Promise<void>((resolve) => {
        releaseWriter = resolve;
      });
      return "written";
    });
    await waitFor(() => Boolean(releaseWriter));

    const fence = await acquireOwnerVaultExclusiveFence(BINDING_A, "copying");
    expect(fence).not.toBeNull();
    await expect(
      withOwnerVaultWriterLease(OWNER_A, async () => "should-not-run"),
    ).rejects.toThrow(/exclusively fenced/i);
    let waitSettled = false;
    const wait = waitForOwnerVaultWritersToSettle(fence!).then((result) => {
      waitSettled = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(waitSettled).toBe(false);
    releaseWriter?.();
    await expect(writer).resolves.toBe("written");
    await expect(wait).resolves.toBe(true);
    await finalizeOwnerVaultExclusiveFence(fence!, {
      state: "active",
      counts: {
        mutations: 0,
        drafts: 0,
        mutationSummaries: 0,
        draftSummaries: 0,
        composerDurability: 0,
        ownerActivity: 0,
      },
      digest: "0".repeat(64),
      sourceCleanupConfirmed: true,
    });
  });

  it("keeps legacy access migration-only and the service worker storage-free", async () => {
    const [queue, drafts, lifecycle, erasureControl, serviceWorker] =
      await Promise.all([
        readSource("./queue.ts"),
        readSource("./drafts.ts"),
        readSource("./owner-session-lifecycle.ts"),
        readSource("../../app/erasure/erasure-local-cleanup.tsx"),
        readFile(
          fileURLToPath(new URL("../../../public/sw.js", import.meta.url)),
          "utf8",
        ),
      ]);

    expect(queue).toContain("withOwnerVaultWriterLease");
    expect(queue.match(/export const offlineDb/g)).toHaveLength(1);
    expect(drafts).not.toContain("offlineDb");
    expect(drafts).toContain("withOwnerVaultWriterLease");
    expect(lifecycle).toContain("migrateLegacyOwnerVault");
    expect(lifecycle).toContain("eraseCurrentDeviceOwnerOfflineStore");
    expect(lifecycle.indexOf("migrateLegacyOwnerVault(")).toBeLessThan(
      lifecycle.indexOf("activatePhysicalOwnerVault("),
    );
    expect(erasureControl).toContain("eraseCurrentDeviceOwnerOfflineStore");
    expect(serviceWorker).not.toMatch(
      /indexedDB\s*[.(]|new\s+Dexie|Dexie\.|overgarden-offline/i,
    );
    expect(`${queue}\n${drafts}\n${lifecycle}`).not.toContain(
      "indexedDB.databases",
    );
  });
});

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Condition did not settle.");
}

function readSource(relativePath: string) {
  return readFile(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}
