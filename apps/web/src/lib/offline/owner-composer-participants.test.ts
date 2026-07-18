import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createOwnerComposerPersistenceController,
  prepareOwnerComposerParticipants,
} from "./owner-composer-participants";

describe("owner composer sign-out participants", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("flushes an immediate pre-debounce edit and leaves the composer frozen", async () => {
    const persisted: string[] = [];
    const controller = createOwnerComposerPersistenceController({
      ownerUserId: "owner-immediate",
      persist: async (snapshot: { body: string }) => {
        persisted.push(snapshot.body);
      },
    });

    controller.updateSnapshot({ body: "typed immediately before sign-out" });
    const preparation =
      await prepareOwnerComposerParticipants("owner-immediate");

    expect(persisted).toEqual(["typed immediately before sign-out"]);
    expect(controller.isFrozen()).toBe(true);

    controller.updateSnapshot({ body: "must not repersist after discard" });
    await controller.persistLatest();
    expect(persisted).toHaveLength(1);

    await preparation.resume();
    expect(controller.isFrozen()).toBe(false);
    await controller.persistLatest();
    expect(persisted).toEqual([
      "typed immediately before sign-out",
      "must not repersist after discard",
    ]);
    controller.dispose();
  });

  it("serializes an in-flight autosave and makes the newest generation win", async () => {
    let releaseFirstWrite: (() => void) | undefined;
    const firstWriteBlocked = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const startedFirstWrite = vi.fn();
    const persisted: Array<{ body: string; photoName: string }> = [];
    let writeCount = 0;
    const controller = createOwnerComposerPersistenceController({
      ownerUserId: "owner-generation",
      persist: async (snapshot: { body: string; photoName: string }) => {
        writeCount += 1;
        persisted.push({ ...snapshot });
        if (writeCount === 1) {
          startedFirstWrite();
          await firstWriteBlocked;
        }
      },
    });

    controller.updateSnapshot({ body: "older", photoName: "old.jpg" });
    const autosave = controller.persistLatest();
    await vi.waitFor(() => expect(startedFirstWrite).toHaveBeenCalledOnce());

    controller.updateSnapshot({ body: "latest", photoName: "latest.jpg" });
    const preparation = prepareOwnerComposerParticipants("owner-generation");
    releaseFirstWrite?.();
    const handle = await preparation;
    await autosave;

    expect(persisted).toEqual([
      { body: "older", photoName: "old.jpg" },
      { body: "latest", photoName: "latest.jpg" },
    ]);
    expect(persisted.at(-1)).toEqual({
      body: "latest",
      photoName: "latest.jpg",
    });

    await handle.resume();
    controller.dispose();
  });

  it("keeps controls frozen until a post-READY generation is durably saved", async () => {
    let releaseResumeWrite: (() => void) | undefined;
    const resumeWriteBlocked = new Promise<void>((resolve) => {
      releaseResumeWrite = resolve;
    });
    const persisted: string[] = [];
    const frozenStates: boolean[] = [];
    const controller = createOwnerComposerPersistenceController({
      ownerUserId: "owner-resume-flush",
      persist: async (snapshot: { body: string }) => {
        persisted.push(snapshot.body);
        if (snapshot.body === "programmatic post-ready update") {
          await resumeWriteBlocked;
        }
      },
    });
    const unsubscribe = controller.subscribeFrozen((frozen) => {
      frozenStates.push(frozen);
    });
    controller.updateSnapshot({ body: "ready snapshot" });
    const preparation =
      await prepareOwnerComposerParticipants("owner-resume-flush");
    controller.updateSnapshot({ body: "programmatic post-ready update" });

    let resumed = false;
    const resume = preparation.resume().then(() => {
      resumed = true;
    });
    await vi.waitFor(() =>
      expect(persisted).toContain("programmatic post-ready update"),
    );
    expect(resumed).toBe(false);
    expect(controller.isFrozen()).toBe(true);
    expect(frozenStates).toEqual([false, true]);

    releaseResumeWrite?.();
    await resume;
    expect(resumed).toBe(true);
    expect(controller.isFrozen()).toBe(false);
    expect(frozenStates).toEqual([false, true, false]);
    unsubscribe();
    controller.dispose();
  });

  it("binds renewed writes to the exact preparing owner-activity scope", async () => {
    const contexts: Array<{
      operationId?: string;
      sessionGeneration?: string;
    }> = [];
    const controller = createOwnerComposerPersistenceController({
      ownerUserId: "owner-exact-scope",
      persist: async (_snapshot: { body: string }, context) => {
        contexts.push({
          operationId: context.offlineActivityScope?.operationId,
          sessionGeneration: context.offlineActivityScope?.sessionGeneration,
        });
      },
    });
    controller.updateSnapshot({ body: "before durable pause" });
    const preparation =
      await prepareOwnerComposerParticipants("owner-exact-scope");

    preparation.bindOfflineActivityScope({
      operationId: "op-exact-scope-1234",
      sessionGeneration: "session_generation_exact_1234",
    });
    controller.updateSnapshot({ body: "newest prepared generation" });
    await preparation.flushLatest();

    expect(contexts).toEqual([
      { operationId: undefined, sessionGeneration: undefined },
      {
        operationId: "op-exact-scope-1234",
        sessionGeneration: "session_generation_exact_1234",
      },
    ]);

    await preparation.resume();
    expect(() =>
      preparation.bindOfflineActivityScope({
        operationId: "op-too-late-1234",
        sessionGeneration: "session_generation_exact_1234",
      }),
    ).toThrow("inactive");
    controller.dispose();
  });

  it("never treats automatic persistence suppression as a successful preparation flush", async () => {
    let automaticPersistenceAllowed = false;
    const persist = vi.fn(async () => undefined);
    const controller = createOwnerComposerPersistenceController({
      ownerUserId: "owner-durable-handoff-race",
      persist,
      shouldPersistAutomatically: () => automaticPersistenceAllowed,
    });
    controller.updateSnapshot({ body: "latest cancel/submit overlap" });

    await controller.persistLatest();
    expect(persist).not.toHaveBeenCalled();

    const preparation = await prepareOwnerComposerParticipants(
      "owner-durable-handoff-race",
    );
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(
      { body: "latest cancel/submit overlap" },
      { offlineActivityScope: undefined },
    );

    automaticPersistenceAllowed = true;
    await preparation.resume();
    controller.dispose();
  });

  it("flushes the exact latest generation on hidden and BFCache pagehide before debounce", async () => {
    const documentListeners = new Map<string, EventListener>();
    const windowListeners = new Map<string, EventListener>();
    const documentTarget = {
      visibilityState: "visible",
      addEventListener: vi.fn((name: string, listener: EventListener) => {
        documentListeners.set(name, listener);
      }),
      removeEventListener: vi.fn((name: string) => {
        documentListeners.delete(name);
      }),
    };
    const windowTarget = {
      addEventListener: vi.fn((name: string, listener: EventListener) => {
        windowListeners.set(name, listener);
      }),
      removeEventListener: vi.fn((name: string) => {
        windowListeners.delete(name);
      }),
    };
    vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("window", windowTarget);

    const persisted: Array<{ body: string; photo: Blob }> = [];
    const controller = createOwnerComposerPersistenceController({
      ownerUserId: "owner-page-suspension",
      persist: async (snapshot: { body: string; photo: Blob }) => {
        persisted.push(snapshot);
      },
    });
    const hiddenPhoto = new Blob(["hidden-photo"], { type: "image/webp" });
    controller.updateSnapshot({
      body: "final character before hidden: ї",
      photo: hiddenPhoto,
    });

    documentTarget.visibilityState = "hidden";
    documentListeners.get("visibilitychange")?.(new Event("visibilitychange"));
    await vi.waitFor(() => expect(persisted).toHaveLength(1));
    expect(persisted[0]?.body).toBe("final character before hidden: ї");
    expect(await persisted[0]?.photo.text()).toBe("hidden-photo");

    const bfcachePhoto = new Blob(["bfcache-photo"], { type: "image/jpeg" });
    controller.updateSnapshot({
      body: "newest BFCache generation",
      photo: bfcachePhoto,
    });
    windowListeners.get("pagehide")?.(new Event("pagehide"));
    await vi.waitFor(() => expect(persisted).toHaveLength(2));
    expect(persisted[1]?.body).toBe("newest BFCache generation");
    expect(await persisted[1]?.photo.text()).toBe("bfcache-photo");

    controller.dispose();
    expect(documentListeners.has("visibilitychange")).toBe(false);
    expect(windowListeners.has("pagehide")).toBe(false);
    vi.unstubAllGlobals();
  });

  it("keeps the preparation retryable when the cancellation flush fails", async () => {
    const persist = vi
      .fn<(snapshot: { body: string }) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("resume flush failed"))
      .mockResolvedValue(undefined);
    const controller = createOwnerComposerPersistenceController({
      ownerUserId: "owner-resume-retry",
      persist,
    });
    controller.updateSnapshot({ body: "ready" });
    const preparation =
      await prepareOwnerComposerParticipants("owner-resume-retry");
    controller.updateSnapshot({ body: "newest" });

    await expect(preparation.resume()).rejects.toThrow("resume flush failed");
    expect(preparation.isActive()).toBe(true);
    expect(controller.isFrozen()).toBe(true);

    await expect(preparation.resume()).resolves.toBeUndefined();
    expect(preparation.isActive()).toBe(false);
    expect(controller.isFrozen()).toBe(false);
    expect(persist).toHaveBeenCalledTimes(3);
    controller.dispose();
  });

  it("inherits an active owner freeze across composer navigation and renews the new participant", async () => {
    const firstPersist = vi.fn(async () => undefined);
    const first = createOwnerComposerPersistenceController({
      ownerUserId: "owner-navigation-race",
      persist: firstPersist,
    });
    first.updateSnapshot({ body: "first route" });
    const preparation = await prepareOwnerComposerParticipants(
      "owner-navigation-race",
    );
    first.dispose();

    const secondPersist = vi.fn(async () => undefined);
    const second = createOwnerComposerPersistenceController({
      ownerUserId: "owner-navigation-race",
      persist: secondPersist,
    });
    second.updateSnapshot({ body: "new route while prepared" });

    expect(second.isFrozen()).toBe(true);
    await preparation.flushLatest();
    expect(secondPersist).toHaveBeenCalledWith(
      { body: "new route while prepared" },
      { offlineActivityScope: undefined },
    );

    await preparation.resume();
    expect(second.isFrozen()).toBe(false);
    second.dispose();
  });

  it("preserves a future structured 10-inline-plus-cover Blob generation", async () => {
    const inlineMedia = Array.from(
      { length: 10 },
      (_, index) => new Blob([`inline-${index + 1}`], { type: "image/webp" }),
    );
    const cover = new Blob(["separate-cover"], { type: "image/jpeg" });
    const persist = vi.fn(
      async (snapshot: {
        document: {
          blocks: Array<{ type: "image"; data: { blob: Blob } }>;
        };
        cover: { blob: Blob };
      }) => {
        void snapshot;
      },
    );
    const controller = createOwnerComposerPersistenceController({
      ownerUserId: "owner-structured",
      persist,
    });
    const snapshot = {
      document: {
        blocks: inlineMedia.map((blob) => ({
          type: "image" as const,
          data: { blob },
        })),
      },
      cover: { blob: cover },
    };

    controller.updateSnapshot(snapshot);
    const preparation =
      await prepareOwnerComposerParticipants("owner-structured");

    expect(persist).toHaveBeenCalledOnce();
    const persisted = persist.mock.calls[0]?.[0];
    expect(persisted?.document.blocks).toHaveLength(10);
    expect(await persisted?.document.blocks[9]?.data.blob.text()).toBe(
      "inline-10",
    );
    expect(await persisted?.cover.blob.text()).toBe("separate-cover");

    await preparation.resume();
    controller.dispose();
  });

  it("fails closed and releases its freeze when any durable flush rejects", async () => {
    const persist = vi
      .fn<(snapshot: { body: string }) => Promise<void>>()
      .mockRejectedValueOnce(new Error("IndexedDB write failed"))
      .mockResolvedValue(undefined);
    const controller = createOwnerComposerPersistenceController({
      ownerUserId: "owner-failure",
      persist,
    });
    controller.updateSnapshot({ body: "recoverable" });

    await expect(
      prepareOwnerComposerParticipants("owner-failure"),
    ).rejects.toThrow("IndexedDB write failed");
    expect(controller.isFrozen()).toBe(false);

    await controller.persistLatest();
    expect(persist).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it("isolates owners and reference-counts concurrent preparation freezes", async () => {
    const persistA = vi.fn(async () => undefined);
    const persistB = vi.fn(async () => undefined);
    const controllerA = createOwnerComposerPersistenceController({
      ownerUserId: "owner-a",
      persist: persistA,
    });
    const controllerB = createOwnerComposerPersistenceController({
      ownerUserId: "owner-b",
      persist: persistB,
    });
    controllerA.updateSnapshot({ body: "A" });
    controllerB.updateSnapshot({ body: "B" });

    const firstA = await prepareOwnerComposerParticipants("owner-a");
    const secondA = await prepareOwnerComposerParticipants("owner-a");

    expect(persistA).toHaveBeenCalledOnce();
    expect(persistB).not.toHaveBeenCalled();
    expect(controllerA.isFrozen()).toBe(true);
    expect(controllerB.isFrozen()).toBe(false);

    await firstA.resume();
    expect(controllerA.isFrozen()).toBe(true);
    await secondA.resume();
    expect(controllerA.isFrozen()).toBe(false);

    controllerA.dispose();
    controllerB.dispose();
  });

  it("freezes and flushes a composer mounted after the first READY", async () => {
    const oldPersist = vi.fn(async () => undefined);
    const oldController = createOwnerComposerPersistenceController({
      ownerUserId: "owner-remounted",
      persist: oldPersist,
    });
    oldController.updateSnapshot({ body: "old mounted composer" });
    const preparation =
      await prepareOwnerComposerParticipants("owner-remounted");
    expect(oldController.isFrozen()).toBe(true);

    oldController.dispose();
    const newPersist = vi.fn(async () => undefined);
    const newController = createOwnerComposerPersistenceController({
      ownerUserId: "owner-remounted",
      persist: newPersist,
    });
    expect(newController.isFrozen()).toBe(true);
    newController.updateSnapshot({ body: "new mounted composer" });
    await newController.persistLatest();
    expect(newPersist).not.toHaveBeenCalled();

    await preparation.flushLatest();
    expect(newPersist).toHaveBeenCalledOnce();
    expect(newPersist).toHaveBeenCalledWith(
      { body: "new mounted composer" },
      { offlineActivityScope: undefined },
    );
    await preparation.resume();
    expect(newController.isFrozen()).toBe(false);
    newController.dispose();
  });

  it("includes a composer mounted while the initial preparation flush is in flight", async () => {
    let releaseFirstWrite: (() => void) | undefined;
    const firstWriteBlocked = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const firstStarted = vi.fn();
    const first = createOwnerComposerPersistenceController({
      ownerUserId: "owner-mid-preparation-mount",
      persist: async () => {
        firstStarted();
        await firstWriteBlocked;
      },
    });
    first.updateSnapshot({ body: "first" });
    const preparationPromise = prepareOwnerComposerParticipants(
      "owner-mid-preparation-mount",
    );
    await vi.waitFor(() => expect(firstStarted).toHaveBeenCalledOnce());

    const secondPersist = vi.fn(async () => undefined);
    const second = createOwnerComposerPersistenceController({
      ownerUserId: "owner-mid-preparation-mount",
      persist: secondPersist,
    });
    second.updateSnapshot({ body: "mounted during flush" });
    expect(second.isFrozen()).toBe(true);

    releaseFirstWrite?.();
    const preparation = await preparationPromise;
    expect(secondPersist).toHaveBeenCalledWith(
      { body: "mounted during flush" },
      { offlineActivityScope: undefined },
    );
    expect(second.isFrozen()).toBe(true);

    await preparation.resume();
    first.dispose();
    second.dispose();
  });

  it("rejects blank owners and ignores disposed composers", async () => {
    expect(() =>
      createOwnerComposerPersistenceController({
        ownerUserId: " ",
        persist: async () => undefined,
      }),
    ).toThrow("owner user id");
    await expect(prepareOwnerComposerParticipants(" ")).rejects.toThrow(
      "owner user id",
    );

    const persist = vi.fn(async () => undefined);
    const controller = createOwnerComposerPersistenceController({
      ownerUserId: "owner-disposed",
      persist,
    });
    controller.updateSnapshot("never written");
    controller.dispose();

    const preparation =
      await prepareOwnerComposerParticipants("owner-disposed");
    expect(persist).not.toHaveBeenCalled();
    await preparation.resume();
  });
});
