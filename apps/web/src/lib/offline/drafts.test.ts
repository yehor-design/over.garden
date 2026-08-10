import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createOfflinePhotoIntent,
  enqueueOfflineMutation as enqueueOwnedOfflineMutation,
  listOfflineMutationSummaries,
  listQueuedMutations as listOwnedQueuedMutations,
  offlineDb,
  type OfflineDraftRecord,
  type OfflineJournalEntryPayload,
} from "./queue";
import { appendVoiceTranscriptToBody } from "@/lib/garden/voice-to-text";
import {
  sealPublicHandleMentionTarget,
  unsealPublicHandleMentionTarget,
} from "@/server/public-handle-mention-token";
import {
  deleteOfflineDraft as deleteOwnedOfflineDraft,
  FIRST_ENTRY_DRAFT_ID,
  followUpEntryDraftId,
  getOfflineDraft as getOwnedOfflineDraft,
  hasPersistableFirstEntryDraft,
  hasPersistableFollowUpDraft,
  listOfflineDrafts as listOwnedOfflineDrafts,
  listOfflineDraftSummaries,
  upsertOfflineDraft as upsertOwnedOfflineDraft,
  type FirstEntryDraftPayload,
  type FollowUpEntryDraftPayload,
  type JournalDraftPayload,
} from "./drafts";
import {
  createOwnerComposerPersistenceController,
  prepareOwnerComposerParticipants,
} from "./owner-composer-participants";
import {
  hydrateOwnerOfflineActivitySession,
  pauseOwnerOfflineActivity,
} from "./owner-session-lifecycle";

const OWNER_A = "00000000-0000-4000-8000-0000000000a1";
const OWNER_B = "00000000-0000-4000-8000-0000000000b2";
const MENTION_TARGET_USER_ID = "00000000-0000-4000-8000-0000000000c3";
const MENTION_TOKEN_SECRET =
  "ove-203-offline-mention-token-test-secret-with-adequate-length";

function enqueueOfflineMutation(
  input: Omit<Parameters<typeof enqueueOwnedOfflineMutation>[0], "ownerUserId">,
) {
  return enqueueOwnedOfflineMutation({ ...input, ownerUserId: OWNER_A });
}

function listQueuedMutations() {
  return listOwnedQueuedMutations(OWNER_A);
}

function upsertOfflineDraft<TPayload extends JournalDraftPayload>(
  input: Pick<OfflineDraftRecord<TPayload>, "id" | "kind" | "payload">,
) {
  return upsertOwnedOfflineDraft({ ...input, ownerUserId: OWNER_A });
}

function getOfflineDraft<TPayload extends JournalDraftPayload>(id: string) {
  return getOwnedOfflineDraft<TPayload>(OWNER_A, id);
}

function listOfflineDrafts(
  kinds?: Parameters<typeof listOwnedOfflineDrafts>[1],
) {
  return listOwnedOfflineDrafts(OWNER_A, kinds);
}

function deleteOfflineDraft(id: string) {
  return deleteOwnedOfflineDraft(OWNER_A, id);
}

describe("offline journal drafts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await offlineDb?.mutations.clear();
    await offlineDb?.mutationSummaries.clear();
    await offlineDb?.drafts.clear();
    await offlineDb?.draftSummaries.clear();
    await offlineDb?.composerDurability.clear();
    await offlineDb?.ownerActivity.clear();
    await hydrateOwnerOfflineActivitySession(
      OWNER_A,
      "test-session-generation-owner-a-1234",
    );
    await hydrateOwnerOfflineActivitySession(
      OWNER_B,
      "test-session-generation-owner-b-5678",
    );
  });

  it("restores first-entry text, catalog state, photo bytes, and idempotency after a reload", async () => {
    const bytes = new Uint8Array([12, 24, 36, 48]);
    const file = new File([bytes], "balcony-tomato.jpg", {
      type: "image/jpeg",
      lastModified: 1_800_000_000_000,
    });
    const payload: FirstEntryDraftPayload = {
      clientMutationId: "draft-entry-id",
      draft: {
        spaceName: "Balcony",
        plantName: "Cherry tomato",
        objectKind: "plant",
        title: "First flowers",
        body: "Two new flower clusters.",
        entryDate: "2026-07-03",
        locationVisibility: "region",
        coarseRegionCode: "UA-30",
      },
      catalogQuery: "Помідор чері",
      selectedCatalogItem: {
        id: "00000000-0000-4000-8000-000000000101",
        displayName: "Помідор чері",
        canonicalName: "Помідор чері",
        catalogKind: "plant_variety",
        locale: "uk",
        status: "seeded",
        source: "manual",
      },
      userAddedCatalogName: null,
      activationSource: "public_variety",
      topicTagInput: "watering, seedlings",
      photoIntent: await createOfflinePhotoIntent(file),
    };

    await upsertOfflineDraft({
      id: FIRST_ENTRY_DRAFT_ID,
      kind: "first_entry",
      payload,
    });

    const restored =
      await getOfflineDraft<FirstEntryDraftPayload>(FIRST_ENTRY_DRAFT_ID);
    const restoredPhoto = restored?.payload.photoIntent?.blob;
    if (!restoredPhoto) throw new Error("Expected stored photo bytes.");

    expect(restored?.payload.clientMutationId).toBe("draft-entry-id");
    expect(restored?.payload.draft.body).toBe("Two new flower clusters.");
    expect(restored?.payload.selectedCatalogItem?.displayName).toBe(
      "Помідор чері",
    );
    expect(restored?.payload.draft.coarseRegionCode).toBe("UA-30");
    expect(restored?.payload.activationSource).toBe("public_variety");
    expect(restored?.payload.topicTagInput).toBe("watering, seedlings");
    expect(new Uint8Array(await restoredPhoto.arrayBuffer())).toEqual(bytes);
    expect(hasPersistableFirstEntryDraft(restored.payload, "2026-07-03")).toBe(
      true,
    );
  });

  it("stores follow-up drafts per object and lists resume candidates newest first", async () => {
    const firstPayload: FollowUpEntryDraftPayload = {
      clientMutationId: "follow-up-1",
      plantObjectId: "object-1",
      draft: {
        title: "Second flowering wave",
        body: "The same plant has stronger new leaves.",
        entryDate: "2026-07-03",
      },
      photoIntent: null,
    };
    const secondPayload: FollowUpEntryDraftPayload = {
      clientMutationId: "follow-up-2",
      plantObjectId: "object-2",
      draft: {
        title: "Soil stayed moist",
        body: "The second plant needed less watering.",
        entryDate: "2026-07-04",
      },
      photoIntent: null,
    };

    vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(200);

    await upsertOfflineDraft({
      id: followUpEntryDraftId("object-1"),
      kind: "follow_up_entry",
      payload: firstPayload,
    });
    await upsertOfflineDraft({
      id: followUpEntryDraftId("object-2"),
      kind: "follow_up_entry",
      payload: secondPayload,
    });

    const drafts = await listOfflineDrafts(["follow_up_entry"]);

    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.id).toBe(followUpEntryDraftId("object-2"));
    expect(hasPersistableFollowUpDraft(secondPayload, "2026-07-04")).toBe(true);
  });

  it("maintains a 24-plus-one blob-free summary page beside the canonical draft", async () => {
    const photo = await createOfflinePhotoIntent(
      new File(["private photo bytes"], "private.webp", {
        type: "image/webp",
      }),
    );
    for (let index = 0; index < 25; index += 1) {
      await upsertOfflineDraft({
        id: followUpEntryDraftId(`object-${index}`),
        kind: "follow_up_entry",
        payload: {
          clientMutationId: `summary-draft-${index}`,
          plantObjectId: `object-${index}`,
          draft: {
            title: `Private draft ${index}`,
            body: `Private body ${index}`,
            entryDate: "2026-08-01",
          },
          photoIntent: index === 0 ? photo : null,
        },
      });
    }

    const page = await listOfflineDraftSummaries(OWNER_A);

    expect(page.items).toHaveLength(24);
    expect(page.hasMore).toBe(true);
    expect(page.items[0]).toMatchObject({
      ownerUserId: OWNER_A,
      kind: "follow_up_entry",
      entryDate: "2026-08-01",
    });
    expect(JSON.stringify(page)).not.toContain("Private body");
    expect(JSON.stringify(page)).not.toContain("private photo bytes");
    expect(JSON.stringify(page)).not.toContain("clientMutationId");

    const first = page.items[0];
    if (!first) throw new Error("Expected a summary row.");
    await deleteOfflineDraft(first.id);
    expect(
      await offlineDb?.draftSummaries.get([OWNER_A, first.id]),
    ).toBeUndefined();
  });

  it("reads only fixed owner-scoped pages from a 5,000 plus 5,000 summary fixture", async () => {
    const database = offlineDb;
    if (!database) return;

    await database.draftSummaries.bulkPut(
      Array.from({ length: 5_000 }, (_, index) => ({
        id: `dense-draft-${index}`,
        ownerUserId: OWNER_A,
        kind: "follow_up_entry" as const,
        createdAt: index,
        updatedAt: index,
        entryDate: "2026-08-01",
        targetObjectId: `object-${index}`,
        targetSpaceId: null,
      })),
    );
    await database.mutationSummaries.bulkPut([
      ...Array.from({ length: 5_000 }, (_, index) => ({
        id: `dense-mutation-${index}`,
        ownerUserId: OWNER_A,
        kind: "journal_entry" as const,
        status: "queued" as const,
        workspaceVisible: 1 as const,
        createdAt: index,
        updatedAt: index,
        target: "plant_object_entry" as const,
        targetObjectId: `object-${index}`,
        targetSpaceId: null,
      })),
      {
        id: "other-owner-sentinel",
        ownerUserId: OWNER_B,
        kind: "journal_entry" as const,
        status: "queued" as const,
        workspaceVisible: 1 as const,
        createdAt: 9_999,
        updatedAt: 9_999,
        target: "plant_object_entry" as const,
        targetObjectId: "other-owner-object",
        targetSpaceId: null,
      },
    ]);

    const [
      firstDraftPage,
      secondDraftPage,
      firstMutationPage,
      secondMutationPage,
    ] = await Promise.all([
      listOfflineDraftSummaries(OWNER_A),
      listOfflineDraftSummaries(OWNER_A, { page: 2 }),
      listOfflineMutationSummaries(OWNER_A),
      listOfflineMutationSummaries(OWNER_A, { page: 2 }),
    ]);

    for (const page of [
      firstDraftPage,
      secondDraftPage,
      firstMutationPage,
      secondMutationPage,
    ]) {
      expect(page.items).toHaveLength(24);
      expect(page.hasMore).toBe(true);
      expect(JSON.stringify(page)).not.toMatch(/payload|blob|body|private/i);
    }
    expect(firstDraftPage.items[0]?.id).toBe("dense-draft-4999");
    expect(secondDraftPage.items[0]?.id).toBe("dense-draft-4975");
    expect(firstMutationPage.items[0]?.id).toBe("dense-mutation-4999");
    expect(secondMutationPage.items[0]?.id).toBe("dense-mutation-4975");
    expect(firstMutationPage.items.map((item) => item.ownerUserId)).toEqual(
      Array(24).fill(OWNER_A),
    );
  });

  it("persists voice-transcribed text as ordinary draft body text only", async () => {
    const payload: FirstEntryDraftPayload = {
      clientMutationId: "voice-draft-entry-id",
      draft: {
        spaceName: "Balcony",
        plantName: "Cherry tomato",
        objectKind: "plant",
        title: "Cherry tomato - Jul 3",
        body: appendVoiceTranscriptToBody(
          "Started by typing.",
          "two new flower clusters after rain",
        ),
        entryDate: "2026-07-03",
        locationVisibility: "hidden",
        coarseRegionCode: "",
      },
      catalogQuery: "",
      selectedCatalogItem: null,
      userAddedCatalogName: null,
      activationSource: "direct_garden",
      photoIntent: null,
    };

    await upsertOfflineDraft({
      id: FIRST_ENTRY_DRAFT_ID,
      kind: "first_entry",
      payload,
    });

    const restored =
      await getOfflineDraft<FirstEntryDraftPayload>(FIRST_ENTRY_DRAFT_ID);
    const serialized = JSON.stringify(restored?.payload);

    expect(restored?.payload.draft.body).toBe(
      "Started by typing.\ntwo new flower clusters after rain",
    );
    expect(serialized).not.toMatch(/audio|recording|speechBlob/i);
  });

  it("keeps an opaque handle target through offline reload and a later handle rename", async () => {
    const targetToken = sealPublicHandleMentionTarget(MENTION_TARGET_USER_ID, {
      audienceUserId: OWNER_A,
      secret: MENTION_TOKEN_SECRET,
    });
    const payload: FirstEntryDraftPayload = {
      ...minimalFirstEntryDraft("A draft that mentions another gardener."),
      mentionSelections: [
        {
          kind: "public_handle",
          id: targetToken,
          label: "@former_handle",
        },
      ],
    };

    await upsertOfflineDraft({
      id: FIRST_ENTRY_DRAFT_ID,
      kind: "first_entry",
      payload,
    });

    const restored =
      await getOfflineDraft<FirstEntryDraftPayload>(FIRST_ENTRY_DRAFT_ID);
    const restoredSelection = restored?.payload.mentionSelections?.[0];
    if (!restoredSelection) throw new Error("Expected a restored mention.");

    expect(restoredSelection).toEqual({
      kind: "public_handle",
      id: targetToken,
      label: "@former_handle",
    });
    expect(restoredSelection.id).not.toContain(MENTION_TARGET_USER_ID);
    expect(
      unsealPublicHandleMentionTarget(restoredSelection.id, {
        audienceUserId: OWNER_A,
        secret: MENTION_TOKEN_SECRET,
      }),
    ).toBe(MENTION_TARGET_USER_ID);

    await enqueueOfflineMutation({
      kind: "journal_entry",
      idempotencyKey: restored.payload.clientMutationId,
      payload: firstEntryPayloadFromDraft(restored.payload),
    });
    const queued = await listQueuedMutations();
    expect(
      (queued[0]?.payload as OfflineJournalEntryPayload).mentionSelections,
    ).toEqual([restoredSelection]);
  });

  it("deletes the draft after local save hands the same intent to the offline queue", async () => {
    const payload: FirstEntryDraftPayload = {
      clientMutationId: "draft-entry-id",
      draft: {
        spaceName: "Balcony",
        plantName: "Cherry tomato",
        objectKind: "plant",
        title: "First flowers",
        body: "Two new flower clusters.",
        entryDate: "2026-07-03",
        locationVisibility: "hidden",
        coarseRegionCode: "",
      },
      catalogQuery: "",
      selectedCatalogItem: null,
      userAddedCatalogName: null,
      activationSource: "direct_garden",
      photoIntent: null,
    };
    await upsertOfflineDraft({
      id: FIRST_ENTRY_DRAFT_ID,
      kind: "first_entry",
      payload,
    });

    await enqueueOfflineMutation({
      kind: "journal_entry",
      idempotencyKey: payload.clientMutationId,
      payload: firstEntryPayloadFromDraft(payload),
    });
    await deleteOfflineDraft(FIRST_ENTRY_DRAFT_ID);

    expect(await getOfflineDraft(FIRST_ENTRY_DRAFT_ID)).toBeUndefined();
    expect(await listQueuedMutations()).toHaveLength(1);
  });

  it("reuses a restored draft idempotency key instead of creating duplicate queued entries", async () => {
    const payload: FirstEntryDraftPayload = {
      clientMutationId: "stable-draft-entry-id",
      draft: {
        spaceName: "Balcony",
        plantName: "Cherry tomato",
        objectKind: "plant",
        title: "First flowers",
        body: "Draft before reload.",
        entryDate: "2026-07-03",
        locationVisibility: "hidden",
        coarseRegionCode: "",
      },
      catalogQuery: "",
      selectedCatalogItem: null,
      userAddedCatalogName: null,
      activationSource: "homepage",
      photoIntent: null,
    };
    await upsertOfflineDraft({
      id: FIRST_ENTRY_DRAFT_ID,
      kind: "first_entry",
      payload,
    });
    const restored =
      await getOfflineDraft<FirstEntryDraftPayload>(FIRST_ENTRY_DRAFT_ID);
    if (!restored) throw new Error("Expected restored draft.");

    await enqueueOfflineMutation({
      kind: "journal_entry",
      idempotencyKey: restored.payload.clientMutationId,
      payload: firstEntryPayloadFromDraft(restored.payload),
    });
    await enqueueOfflineMutation({
      kind: "journal_entry",
      idempotencyKey: restored.payload.clientMutationId,
      payload: firstEntryPayloadFromDraft({
        ...restored.payload,
        draft: {
          ...restored.payload.draft,
          body: "Edited after auth return.",
        },
      }),
    });

    const queued = await listQueuedMutations();

    expect(queued).toHaveLength(1);
    expect(queued[0]?.idempotencyKey).toBe("stable-draft-entry-id");
    expect((queued[0]?.payload as OfflineJournalEntryPayload).body).toBe(
      "Edited after auth return.",
    );
  });

  it("keeps the same logical draft isolated between browser accounts", async () => {
    const ownerAPayload = minimalFirstEntryDraft("Owner A private note");
    const ownerBPayload = minimalFirstEntryDraft("Owner B private note");

    await upsertOwnedOfflineDraft({
      ownerUserId: OWNER_A,
      id: FIRST_ENTRY_DRAFT_ID,
      kind: "first_entry",
      payload: ownerAPayload,
    });
    await upsertOwnedOfflineDraft({
      ownerUserId: OWNER_B,
      id: FIRST_ENTRY_DRAFT_ID,
      kind: "first_entry",
      payload: ownerBPayload,
    });

    expect(
      (
        await getOwnedOfflineDraft<FirstEntryDraftPayload>(
          OWNER_A,
          FIRST_ENTRY_DRAFT_ID,
        )
      )?.payload.draft.body,
    ).toBe("Owner A private note");
    expect(
      (
        await getOwnedOfflineDraft<FirstEntryDraftPayload>(
          OWNER_B,
          FIRST_ENTRY_DRAFT_ID,
        )
      )?.payload.draft.body,
    ).toBe("Owner B private note");
    expect(await listOwnedOfflineDrafts(OWNER_A)).toHaveLength(1);
    expect(await listOwnedOfflineDrafts(OWNER_B)).toHaveLength(1);
  });

  it("persists the newest text and photo through a cancel/sign-out overlap under the exact preparing fence", async () => {
    const automaticPersistenceAllowed = false;
    const controller = createOwnerComposerPersistenceController({
      ownerUserId: OWNER_A,
      shouldPersistAutomatically: () => automaticPersistenceAllowed,
      persist: async (payload: FirstEntryDraftPayload, context) => {
        await upsertOwnedOfflineDraft(
          {
            ownerUserId: OWNER_A,
            id: FIRST_ENTRY_DRAFT_ID,
            kind: "first_entry",
            payload,
          },
          context,
        );
      },
    });
    const firstPayload = minimalFirstEntryDraft("Before the overlap.");
    controller.updateSnapshot(firstPayload);

    // Submit/cancel handoff suppresses ordinary autosave, but preparation must
    // still persist rather than reporting a successful no-op.
    await controller.persistLatest();
    expect(await getOfflineDraft(FIRST_ENTRY_DRAFT_ID)).toBeUndefined();
    const preparation = await prepareOwnerComposerParticipants(OWNER_A);
    expect(
      (await getOfflineDraft<FirstEntryDraftPayload>(FIRST_ENTRY_DRAFT_ID))
        ?.payload.draft.body,
    ).toBe("Before the overlap.");

    const pauseHandle = await pauseOwnerOfflineActivity(OWNER_A, {
      operationId: "op-composer-draft-overlap-1234",
      sessionGeneration: "test-session-generation-owner-a-1234",
    });
    preparation.bindOfflineActivityScope({
      operationId: pauseHandle.operationId,
      sessionGeneration: pauseHandle.sessionGeneration,
    });

    const photoBytes = new Uint8Array([9, 8, 7, 6, 5]);
    const latestPayload: FirstEntryDraftPayload = {
      ...firstPayload,
      draft: {
        ...firstPayload.draft,
        body: "Newest character survives: ї",
      },
      photoIntent: {
        fileName: "latest.webp",
        contentType: "image/webp",
        size: photoBytes.byteLength,
        blob: new Blob([photoBytes], { type: "image/webp" }),
      },
    };
    controller.updateSnapshot(latestPayload);

    await expect(
      upsertOwnedOfflineDraft({
        ownerUserId: OWNER_A,
        id: FIRST_ENTRY_DRAFT_ID,
        kind: "first_entry",
        payload: latestPayload,
      }),
    ).rejects.toThrow("paused for sign-out");

    await preparation.flushLatest();
    const restored =
      await getOfflineDraft<FirstEntryDraftPayload>(FIRST_ENTRY_DRAFT_ID);
    expect(restored?.payload.draft.body).toBe("Newest character survives: ї");
    expect(
      new Uint8Array(await restored!.payload.photoIntent!.blob!.arrayBuffer()),
    ).toEqual(photoBytes);

    await pauseHandle.promoteToCommitFence();
    controller.updateSnapshot({
      ...latestPayload,
      draft: { ...latestPayload.draft, body: "must not cross commit fence" },
    });
    await expect(preparation.flushLatest()).rejects.toThrow(
      "paused for sign-out",
    );
    expect(
      (await getOfflineDraft<FirstEntryDraftPayload>(FIRST_ENTRY_DRAFT_ID))
        ?.payload.draft.body,
    ).toBe("Newest character survives: ї");

    controller.dispose();
    await pauseHandle.resume();
    await preparation.resume();
  });

  it("persists the newest generation through the ordinary guard after Stay resumes the durable fence", async () => {
    const controller = createOwnerComposerPersistenceController({
      ownerUserId: OWNER_A,
      persist: async (payload: FirstEntryDraftPayload, context) => {
        await upsertOwnedOfflineDraft(
          {
            ownerUserId: OWNER_A,
            id: FIRST_ENTRY_DRAFT_ID,
            kind: "first_entry",
            payload,
          },
          context,
        );
      },
    });
    controller.updateSnapshot(minimalFirstEntryDraft("Prepared generation"));
    const preparation = await prepareOwnerComposerParticipants(OWNER_A);
    const pauseHandle = await pauseOwnerOfflineActivity(OWNER_A, {
      operationId: "op-composer-stay-resume-1234",
      sessionGeneration: "test-session-generation-owner-a-1234",
    });
    preparation.bindOfflineActivityScope({
      operationId: pauseHandle.operationId,
      sessionGeneration: pauseHandle.sessionGeneration,
    });

    const photoBytes = new Uint8Array([4, 2, 4, 2]);
    controller.updateSnapshot({
      ...minimalFirstEntryDraft("Newest generation before Stay"),
      photoIntent: {
        fileName: "stay.webp",
        contentType: "image/webp",
        size: photoBytes.byteLength,
        blob: new Blob([photoBytes], { type: "image/webp" }),
      },
    });

    await pauseHandle.resume();
    await preparation.resume();

    const restored =
      await getOfflineDraft<FirstEntryDraftPayload>(FIRST_ENTRY_DRAFT_ID);
    expect(restored?.payload.draft.body).toBe("Newest generation before Stay");
    expect(
      new Uint8Array(await restored!.payload.photoIntent!.blob!.arrayBuffer()),
    ).toEqual(photoBytes);
    expect(controller.isFrozen()).toBe(false);
    controller.dispose();
  });

  it("durably flushes the newest IndexedDB text and Blob on hidden and BFCache pagehide", async () => {
    const documentListeners = new Map<string, EventListener>();
    const windowListeners = new Map<string, EventListener>();
    const documentTarget = {
      visibilityState: "visible",
      addEventListener: (name: string, listener: EventListener) => {
        documentListeners.set(name, listener);
      },
      removeEventListener: (name: string) => {
        documentListeners.delete(name);
      },
    };
    const windowTarget = {
      addEventListener: (name: string, listener: EventListener) => {
        windowListeners.set(name, listener);
      },
      removeEventListener: (name: string) => {
        windowListeners.delete(name);
      },
    };
    vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("window", windowTarget);

    const controller = createOwnerComposerPersistenceController({
      ownerUserId: OWNER_A,
      persist: async (payload: FirstEntryDraftPayload, context) => {
        await upsertOwnedOfflineDraft(
          {
            ownerUserId: OWNER_A,
            id: FIRST_ENTRY_DRAFT_ID,
            kind: "first_entry",
            payload,
          },
          context,
        );
      },
    });
    const hiddenBytes = new Uint8Array([1, 3, 5, 7]);
    controller.updateSnapshot({
      ...minimalFirstEntryDraft("Exact final hidden character: ї"),
      photoIntent: {
        fileName: "hidden.webp",
        contentType: "image/webp",
        size: hiddenBytes.byteLength,
        blob: new Blob([hiddenBytes], { type: "image/webp" }),
      },
    });

    documentTarget.visibilityState = "hidden";
    documentListeners.get("visibilitychange")?.(new Event("visibilitychange"));
    await vi.waitFor(async () => {
      expect(
        (await getOfflineDraft<FirstEntryDraftPayload>(FIRST_ENTRY_DRAFT_ID))
          ?.payload.draft.body,
      ).toBe("Exact final hidden character: ї");
    });

    const bfcacheBytes = new Uint8Array([2, 4, 6, 8]);
    controller.updateSnapshot({
      ...minimalFirstEntryDraft("Exact BFCache generation"),
      photoIntent: {
        fileName: "bfcache.jpg",
        contentType: "image/jpeg",
        size: bfcacheBytes.byteLength,
        blob: new Blob([bfcacheBytes], { type: "image/jpeg" }),
      },
    });
    windowListeners.get("pagehide")?.(new Event("pagehide"));
    await vi.waitFor(async () => {
      const restored =
        await getOfflineDraft<FirstEntryDraftPayload>(FIRST_ENTRY_DRAFT_ID);
      expect(restored?.payload.draft.body).toBe("Exact BFCache generation");
      expect(
        new Uint8Array(
          await restored!.payload.photoIntent!.blob!.arrayBuffer(),
        ),
      ).toEqual(bfcacheBytes);
    });

    controller.dispose();
    vi.unstubAllGlobals();
  });
});

function minimalFirstEntryDraft(body: string): FirstEntryDraftPayload {
  return {
    clientMutationId: crypto.randomUUID(),
    draft: {
      spaceName: "Balcony",
      plantName: "Cherry tomato",
      objectKind: "plant",
      title: "Private update",
      body,
      entryDate: "2026-07-13",
      locationVisibility: "hidden",
      coarseRegionCode: "",
    },
    catalogQuery: "",
    selectedCatalogItem: null,
    userAddedCatalogName: null,
    activationSource: "direct_garden",
    photoIntent: null,
  };
}

function firstEntryPayloadFromDraft(
  payload: FirstEntryDraftPayload,
): OfflineJournalEntryPayload {
  return {
    target: "first_plant_entry",
    spaceName: payload.draft.spaceName,
    plantName: payload.draft.plantName,
    objectKind: payload.draft.objectKind,
    catalogItemId: payload.selectedCatalogItem?.id ?? null,
    userAddedCatalogName: payload.userAddedCatalogName,
    varietyText:
      payload.selectedCatalogItem?.displayName ?? payload.userAddedCatalogName,
    title: payload.draft.title,
    body: payload.draft.body,
    entryDate: payload.draft.entryDate,
    locationVisibility: payload.draft.locationVisibility,
    coarseRegionCode:
      payload.draft.locationVisibility === "region"
        ? payload.draft.coarseRegionCode
        : null,
    clientMutationId: payload.clientMutationId,
    activationSource: payload.activationSource,
    syncStatus: "offline_queued",
    topicTags: payload.topicTagInput
      ? payload.topicTagInput.split(",").map((tag) => tag.trim())
      : [],
    mentionSelections: payload.mentionSelections ?? [],
    photoIntent: payload.photoIntent,
  };
}
