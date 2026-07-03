import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createOfflinePhotoIntent,
  enqueueOfflineMutation,
  listQueuedMutations,
  offlineDb,
  type OfflineJournalEntryPayload,
} from "./queue";
import { appendVoiceTranscriptToBody } from "@/lib/garden/voice-to-text";
import {
  deleteOfflineDraft,
  FIRST_ENTRY_DRAFT_ID,
  followUpEntryDraftId,
  getOfflineDraft,
  hasPersistableFirstEntryDraft,
  hasPersistableFollowUpDraft,
  listOfflineDrafts,
  upsertOfflineDraft,
  type FirstEntryDraftPayload,
  type FollowUpEntryDraftPayload,
} from "./drafts";

describe("offline journal drafts", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await offlineDb?.mutations.clear();
    await offlineDb?.drafts.clear();
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
});

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
    photoIntent: payload.photoIntent,
  };
}
