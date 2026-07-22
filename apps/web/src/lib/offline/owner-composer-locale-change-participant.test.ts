import { describe, expect, it, vi } from "vitest";

import { createInterfaceLocaleChangeCoordinator } from "../interface-locale-change-coordinator";
import { createOwnerComposerLocaleChangeParticipant } from "./owner-composer-locale-change-participant";
import { createOwnerComposerPersistenceController } from "./owner-composer-participants";

interface StructuredComposerSnapshot {
  editor: {
    generation: number;
    blockOrder: string[];
    blocks: Array<
      | { id: string; type: "paragraph"; data: { text: string } }
      | { id: string; type: "image"; data: { intentId: string; blob: Blob } }
    >;
  };
  activeComposition: { isComposing: boolean; text: string };
  cover: { mode: "separate"; blob: Blob };
  aggregateRevision: number;
  conflictRevision: number | null;
  idempotencyKey: string;
}

describe("owner composer locale-change participant", () => {
  it("flushes the exact latest multi-owner generation through one global registration", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    coordinator.register(createOwnerComposerLocaleChangeParticipant());
    let releaseOldWrite: (() => void) | undefined;
    const oldWriteBlocked = new Promise<void>((resolve) => {
      releaseOldWrite = resolve;
    });
    const firstOwnerWriteStarted = vi.fn();
    const firstOwnerPersisted: StructuredComposerSnapshot[] = [];
    let firstOwnerWriteCount = 0;
    const firstOwner = createOwnerComposerPersistenceController({
      ownerUserId: "locale-owner-a",
      persist: async (snapshot: StructuredComposerSnapshot) => {
        firstOwnerWriteCount += 1;
        firstOwnerPersisted.push(snapshot);
        if (firstOwnerWriteCount === 1) {
          firstOwnerWriteStarted();
          await oldWriteBlocked;
        }
      },
    });
    const secondOwnerPersist = vi.fn(async (_snapshot: { body: string }) => {
      void _snapshot;
    });
    const secondOwner = createOwnerComposerPersistenceController({
      ownerUserId: "locale-owner-b",
      persist: secondOwnerPersist,
    });
    const siblingComposerPersist = vi.fn(
      async (_snapshot: { body: string }) => {
        void _snapshot;
      },
    );
    const siblingComposer = createOwnerComposerPersistenceController({
      ownerUserId: "locale-owner-a",
      persist: siblingComposerPersist,
    });
    const inlineBlobs = Array.from(
      { length: 10 },
      (_, index) => new Blob([`inline-${index + 1}`], { type: "image/webp" }),
    );
    const oldSnapshot = structuredSnapshot(1, "old generation", inlineBlobs);
    const latestSnapshot = structuredSnapshot(
      2,
      "latest active IME: ї",
      inlineBlobs,
    );
    firstOwner.updateSnapshot(oldSnapshot);
    const autosave = firstOwner.persistLatest();
    await vi.waitFor(() =>
      expect(firstOwnerWriteStarted).toHaveBeenCalledOnce(),
    );
    firstOwner.updateSnapshot(latestSnapshot);
    secondOwner.updateSnapshot({ body: "second owner latest" });
    siblingComposer.updateSnapshot({ body: "same owner, second composer" });

    const transition = coordinator.prepare();
    releaseOldWrite?.();
    const result = await transition;
    await autosave;

    expect(result.status).toBe("prepared");
    expect(firstOwnerPersisted).toEqual([oldSnapshot, latestSnapshot]);
    const persisted = firstOwnerPersisted.at(-1);
    expect(persisted?.editor.generation).toBe(2);
    expect(persisted?.activeComposition).toEqual({
      isComposing: true,
      text: "latest active IME: ї",
    });
    expect(persisted?.editor.blockOrder).toHaveLength(11);
    expect(
      persisted?.editor.blocks.filter((block) => block.type === "image"),
    ).toHaveLength(10);
    const lastInline = persisted?.editor.blocks.at(-1);
    expect(lastInline?.type).toBe("image");
    if (lastInline?.type === "image") {
      expect(await lastInline.data.blob.text()).toBe("inline-10");
    }
    expect(await persisted?.cover.blob.text()).toBe("separate-cover-2");
    expect(persisted).toMatchObject({
      cover: { mode: "separate" },
      aggregateRevision: 42,
      conflictRevision: 41,
      idempotencyKey: "journal-mutation-generation-2",
    });
    expect(secondOwnerPersist).toHaveBeenCalledOnce();
    expect(siblingComposerPersist).toHaveBeenCalledOnce();
    expect(firstOwner.isFrozen()).toBe(true);
    expect(secondOwner.isFrozen()).toBe(true);
    expect(siblingComposer.isFrozen()).toBe(true);

    if (result.status === "prepared") {
      await expect(result.preparation.resume()).resolves.toBe("resumed");
    }
    expect(firstOwner.isFrozen()).toBe(false);
    expect(secondOwner.isFrozen()).toBe(false);
    expect(siblingComposer.isFrozen()).toBe(false);
    firstOwner.dispose();
    secondOwner.dispose();
    siblingComposer.dispose();
  });

  it("inherits the global fence and flushes a new owner mounted during preparation", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    coordinator.register(createOwnerComposerLocaleChangeParticipant());
    let releaseFirstWrite: (() => void) | undefined;
    const firstWriteBlocked = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const firstStarted = vi.fn();
    const first = createOwnerComposerPersistenceController({
      ownerUserId: "global-mount-owner-a",
      persist: async () => {
        firstStarted();
        await firstWriteBlocked;
      },
    });
    first.updateSnapshot({ body: "first owner" });

    const transition = coordinator.prepare();
    await vi.waitFor(() => expect(firstStarted).toHaveBeenCalledOnce());

    const latePersist = vi.fn(async () => undefined);
    const lateOwner = createOwnerComposerPersistenceController({
      ownerUserId: "global-mount-owner-b",
      persist: latePersist,
    });
    lateOwner.updateSnapshot({ body: "mounted while globally frozen" });
    expect(lateOwner.isFrozen()).toBe(true);

    releaseFirstWrite?.();
    const result = await transition;

    expect(result.status).toBe("prepared");
    expect(latePersist).toHaveBeenCalledWith(
      { body: "mounted while globally frozen" },
      { offlineActivityScope: undefined },
    );
    if (result.status === "prepared") {
      await result.preparation.resume();
    }
    expect(lateOwner.isFrozen()).toBe(false);
    first.dispose();
    lateOwner.dispose();
  });

  it("flushes a generation created after prepare before document replacement", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    coordinator.register(createOwnerComposerLocaleChangeParticipant());
    const persisted: Array<{ body: string }> = [];
    const controller = createOwnerComposerPersistenceController({
      ownerUserId: "locale-final-fence-owner",
      persist: async (snapshot: { body: string }) => {
        persisted.push(snapshot);
      },
    });
    controller.updateSnapshot({ body: "before prepare" });

    const result = await coordinator.prepare();
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    controller.updateSnapshot({ body: "after prepare" });
    await result.preparation.sealForDocumentReplacement();

    expect(persisted).toEqual([
      { body: "before prepare" },
      { body: "after prepare" },
    ]);
    expect(controller.updateSnapshot({ body: "after seal" })).toBe(2);
    await result.preparation.resume();
    controller.dispose();
  });

  it("blocks handoff and preserves a composer mounted after the document seal", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    coordinator.register(createOwnerComposerLocaleChangeParticipant());

    const result = await coordinator.prepare();
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    await result.preparation.sealForDocumentReplacement();

    const latePersist = vi.fn(async (_snapshot: { body: string }) => {
      void _snapshot;
    });
    const lateController = createOwnerComposerPersistenceController({
      ownerUserId: "locale-post-seal-mount-owner",
      persist: latePersist,
    });
    expect(lateController.isFrozen()).toBe(true);
    expect(
      lateController.updateSnapshot({ body: "mounted during locale POST" }),
    ).toBe(1);
    expect(result.preparation.revalidateCommitGate()).toEqual({
      status: "blocked",
      reason: "participant-set-changed",
      participantIds: ["owner-composer-drafts"],
    });

    await expect(result.preparation.resume()).resolves.toBe("resumed");
    expect(latePersist).toHaveBeenCalledWith(
      { body: "mounted during locale POST" },
      { offlineActivityScope: undefined },
    );
    expect(lateController.isFrozen()).toBe(false);
    lateController.dispose();
  });

  it("atomically seals every composer before the final multi-participant flush", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    coordinator.register(createOwnerComposerLocaleChangeParticipant());
    const firstPersisted: Array<{ body: string }> = [];
    const first = createOwnerComposerPersistenceController({
      ownerUserId: "locale-atomic-seal-owner-a",
      persist: async (snapshot: { body: string }) => {
        firstPersisted.push(snapshot);
      },
    });
    let releaseSecondWrite: (() => void) | undefined;
    const secondWriteBlocked = new Promise<void>((resolve) => {
      releaseSecondWrite = resolve;
    });
    const secondWriteStarted = vi.fn();
    let secondWriteCount = 0;
    const second = createOwnerComposerPersistenceController({
      ownerUserId: "locale-atomic-seal-owner-b",
      persist: async (_snapshot: { body: string }) => {
        void _snapshot;
        secondWriteCount += 1;
        if (secondWriteCount === 2) {
          secondWriteStarted();
          await secondWriteBlocked;
        }
      },
    });
    first.updateSnapshot({ body: "first before prepare" });
    second.updateSnapshot({ body: "second before prepare" });
    const result = await coordinator.prepare();
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;

    first.updateSnapshot({ body: "first before final seal" });
    second.updateSnapshot({ body: "second before final seal" });
    const seal = result.preparation.sealForDocumentReplacement();
    await vi.waitFor(() => expect(secondWriteStarted).toHaveBeenCalled());
    const generationAtSeal = first.updateSnapshot({
      body: "must not advance after atomic seal",
    });
    releaseSecondWrite?.();
    await seal;

    expect(generationAtSeal).toBe(2);
    expect(firstPersisted).toEqual([
      { body: "first before prepare" },
      { body: "first before final seal" },
    ]);
    await result.preparation.resume();
    const fresh = createOwnerComposerPersistenceController({
      ownerUserId: "locale-fresh-after-seal",
      persist: async () => undefined,
    });
    expect(fresh.updateSnapshot({ body: "fresh generation" })).toBe(1);
    fresh.dispose();
    first.dispose();
    second.dispose();
  });

  it("rolls every owner fence back when one durable flush fails", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    coordinator.register(createOwnerComposerLocaleChangeParticipant());
    const healthyPersist = vi.fn(async () => undefined);
    const failingPersist = vi
      .fn<(_snapshot: { body: string }) => Promise<void>>()
      .mockRejectedValueOnce(new Error("IndexedDB unavailable"))
      .mockResolvedValue(undefined);
    const healthy = createOwnerComposerPersistenceController({
      ownerUserId: "global-rollback-owner-a",
      persist: healthyPersist,
    });
    const failing = createOwnerComposerPersistenceController({
      ownerUserId: "global-rollback-owner-b",
      persist: failingPersist,
    });
    healthy.updateSnapshot({ body: "healthy latest" });
    failing.updateSnapshot({ body: "retryable latest" });

    const failed = await coordinator.prepare();

    expect(failed).toMatchObject({
      status: "failed",
      reason: "safe-flush-failed",
      participantIds: ["owner-composer-drafts"],
      recovery: null,
    });
    expect(healthy.isFrozen()).toBe(false);
    expect(failing.isFrozen()).toBe(false);
    expect(coordinator.readState().phase).toBe("idle");

    const retry = await coordinator.prepare();
    expect(retry.status).toBe("prepared");
    if (retry.status === "prepared") {
      await retry.preparation.resume();
    }
    expect(failingPersist).toHaveBeenCalledTimes(2);
    healthy.dispose();
    failing.dispose();
  });

  it("keeps all composers frozen until a failed recovery write is retried", async () => {
    const coordinator = createInterfaceLocaleChangeCoordinator();
    coordinator.register(createOwnerComposerLocaleChangeParticipant());
    const persist = vi
      .fn<(_snapshot: { body: string }) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("resume write failed"))
      .mockResolvedValue(undefined);
    const controller = createOwnerComposerPersistenceController({
      ownerUserId: "global-resume-retry-owner",
      persist,
    });
    controller.updateSnapshot({ body: "prepared generation" });
    const result = await coordinator.prepare();
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    controller.updateSnapshot({ body: "newest recovery generation" });

    await expect(result.preparation.resume()).resolves.toBe("retry-required");
    expect(result.preparation.isActive()).toBe(true);
    expect(controller.isFrozen()).toBe(true);
    expect(coordinator.readState().phase).toBe("preparing");

    await expect(result.preparation.resume()).resolves.toBe("resumed");
    expect(result.preparation.isActive()).toBe(false);
    expect(controller.isFrozen()).toBe(false);
    expect(persist).toHaveBeenCalledTimes(3);
    controller.dispose();
  });
});

function structuredSnapshot(
  generation: number,
  compositionText: string,
  inlineBlobs: Blob[],
): StructuredComposerSnapshot {
  const paragraph = {
    id: `paragraph-${generation}`,
    type: "paragraph" as const,
    data: { text: `Editor.js generation ${generation}` },
  };
  const images = inlineBlobs.map((blob, index) => ({
    id: `image-${generation}-${index + 1}`,
    type: "image" as const,
    data: { intentId: `intent-${index + 1}`, blob },
  }));
  const blocks = [paragraph, ...images];
  return {
    editor: {
      generation,
      blockOrder: blocks.map((block) => block.id),
      blocks,
    },
    activeComposition: { isComposing: true, text: compositionText },
    cover: {
      mode: "separate",
      blob: new Blob([`separate-cover-${generation}`], {
        type: "image/jpeg",
      }),
    },
    aggregateRevision: 42,
    conflictRevision: 41,
    idempotencyKey: `journal-mutation-generation-${generation}`,
  };
}
