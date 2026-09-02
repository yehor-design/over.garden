import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ATOMIC_JOURNAL_CREATE_PROTOCOL,
  ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER,
  JOURNAL_ENTRY_PAYLOAD_MAX_BYTES,
  type AtomicJournalCreateRequest,
} from "@/lib/garden/entry-contracts";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const SPACE_ID = "00000000-0000-4000-8000-000000000002";
const OBJECT_ID = "00000000-0000-4000-8000-000000000003";
const ENTRY_ID = "00000000-0000-4000-8000-000000000004";
const MEDIA_ID = "00000000-0000-4000-8000-000000000005";
const SESSION_ID = "00000000-0000-4000-8000-000000000006";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  scheduleLearningAttributionDrain: vi.fn(),
  createFirstPlantEntry: vi.fn(),
  createPlantObjectJournalEntry: vi.fn(),
  createSpaceJournalEntry: vi.fn(),
  atomicClientMutationId: vi.fn(() => "atomic:opaque"),
  readCommittedAtomicJournalCreate: vi.fn(),
  recordAnalyticsEventSafely: vi.fn(),
  recordEntryLoggedEventSafely: vi.fn(),
  isBackdatedEntryDate: vi.fn(),
  resolveMutationScope: vi.fn(),
  claimEphemeralPublicationMedia: vi.fn(),
  finalizeEphemeralPublicationMedia: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath ,
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("@/server/mvp-learning/attribution-after-response", () => ({
  scheduleLearningAttributionDrain: mocks.scheduleLearningAttributionDrain,
}));

vi.mock("@/server/journal-repository", () => ({
  atomicClientMutationId: mocks.atomicClientMutationId,
  createFirstPlantEntry: mocks.createFirstPlantEntry,
  createPlantObjectJournalEntry: mocks.createPlantObjectJournalEntry,
  createSpaceJournalEntry: mocks.createSpaceJournalEntry,
  readCommittedAtomicJournalCreate: mocks.readCommittedAtomicJournalCreate,
}));

vi.mock("@/server/media/ephemeral-publication-handoff", () => ({
  claimEphemeralPublicationMedia: mocks.claimEphemeralPublicationMedia,
  finalizeEphemeralPublicationMedia: mocks.finalizeEphemeralPublicationMedia,
}));

vi.mock("@/lib/storage", () => ({
  getPublicDerivativeUrl: (path: string) => `https://media.over.garden/${path}`,
}));

vi.mock("@/server/analytics-events", () => ({
  isBackdatedEntryDate: mocks.isBackdatedEntryDate,
  recordAnalyticsEventSafely: mocks.recordAnalyticsEventSafely,
  recordEntryLoggedEventSafely: mocks.recordEntryLoggedEventSafely,
}));

vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromRequest: (request: Request) =>
    request.headers.get("x-overgarden-document-generation"),
  mutationScopeResponse: (admission: { code: string; statusCode: number }) =>
    Response.json(
      { code: admission.code },
      {
        status: admission.statusCode,
        headers: { "Cache-Control": "private, no-store" },
      },
    ),
}));

describe("POST /api/garden/entries atomic create", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.isBackdatedEntryDate.mockReturnValue(false);
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      internalResult: "MATCH",
      envelopeExpiresAtSeconds: 1_786_381_200,
      scope: { userId: OWNER_ID, sessionId: "session-1" },
    });
    mocks.createFirstPlantEntry.mockResolvedValue(entryResult());
    mocks.createPlantObjectJournalEntry.mockResolvedValue(entryResult());
    mocks.createSpaceJournalEntry.mockResolvedValue({
      ...entryResult(),
      mentionedObjects: [{ id: OBJECT_ID, displayName: "Rose" }],
    });
    mocks.readCommittedAtomicJournalCreate.mockResolvedValue(null);
    mocks.finalizeEphemeralPublicationMedia.mockResolvedValue(undefined);
  });

  it("refuses an authenticated pre-cutover client before reading its body", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://local.test/api/garden/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "legacy private body" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "atomic_journal_protocol_required",
    });
    expect(mocks.createFirstPlantEntry).not.toHaveBeenCalled();
  });

  it("enforces the bounded final publication payload before repository access", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://local.test/api/garden/entries", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER]:
            ATOMIC_JOURNAL_CREATE_PROTOCOL,
        },
        body: JSON.stringify({
          title: "x".repeat(JOURNAL_ENTRY_PAYLOAD_MAX_BYTES),
        }),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      code: "JOURNAL_ENTRY_TOO_LARGE",
    });
    expect(mocks.createFirstPlantEntry).not.toHaveBeenCalled();
  });

  it("commits a first entry directly public and returns the exact safe source context", async () => {
    const { POST } = await import("./route");
    const request = atomicRequest({
      context: {
        target: "first_plant_entry",
        spaceId: SPACE_ID,
        plantName: "Cherry tomato",
        entryDate: "2026-08-23",
        topicTags: ["flowering"],
      },
      returnTo: "/garden?space=current#space-journal",
    });
    const response = await POST(atomicJsonRequest(request));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      entryId: ENTRY_ID,
      slug: "first-flowers-00000000",
      revision: 1,
      returnTo: "/garden?space=current#space-journal",
      card: { entryId: ENTRY_ID, title: "First flowers" },
    });
    expect(mocks.createFirstPlantEntry).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OWNER_ID }),
      expect.objectContaining({
        contentDocument: request.document,
        clientMutationId: "atomic:opaque",
        atomicPublication: expect.objectContaining({
          publishId: ENTRY_ID,
          disclosureAccepted: true,
          handoff: null,
        }),
      }),
    );
    expect(mocks.claimEphemeralPublicationMedia).not.toHaveBeenCalled();
    const deferred = mocks.scheduleLearningAttributionDrain.mock.calls[0]?.[0];
    expect(deferred).toEqual(expect.any(Function));
    await deferred?.();
    expect(
      JSON.stringify(mocks.recordAnalyticsEventSafely.mock.calls),
    ).not.toMatch(/Two new flower clusters|media_key|coordinate|latitude/i);
  });

  it("claims ordered exact media, finalizes after commit, and HEAD-proves final WebP", async () => {
    const publicPath = `derivatives/${MEDIA_ID}/1.webp`;
    mocks.createPlantObjectJournalEntry.mockResolvedValueOnce({
      ...entryResult(),
      mediaAttached: true,
    });
    mocks.claimEphemeralPublicationMedia.mockResolvedValueOnce({
      stagingSessionId: SESSION_ID,
      receiptSetDigest: "receipt-digest",
      publicMedia: [
        {
          mediaAssetId: MEDIA_ID,
          generation: 1,
          sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          sizeBytes: 2,
          width: 100,
          height: 80,
          publicPath,
        },
      ],
    });
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { "content-type": "image/webp" },
      }),
    );
    const { POST } = await import("./route");
    const request = atomicRequest({
      context: {
        target: "plant_object_entry",
        plantObjectId: OBJECT_ID,
        entryDate: "2026-08-23",
      },
      document: documentWithImage(),
      coverMediaAssetId: MEDIA_ID,
      mediaClaimReceipts: ["r".repeat(40)],
      returnTo: `/garden/objects/${OBJECT_ID}#follow-up-composer`,
    });
    const response = await POST(atomicJsonRequest(request));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.claimEphemeralPublicationMedia).toHaveBeenCalledWith({
      ownerUserId: OWNER_ID,
      publishId: ENTRY_ID,
      stagingReceipts: ["r".repeat(40)],
      orderedMediaAssetIds: [MEDIA_ID],
    });
    expect(mocks.finalizeEphemeralPublicationMedia).toHaveBeenCalledAfter(
      mocks.createPlantObjectJournalEntry,
    );
    expect(fetcher).toHaveBeenCalledWith(
      `https://media.over.garden/${publicPath}`,
      expect.objectContaining({
        method: "HEAD",
        cache: "no-store",
        redirect: "error",
      }),
    );
    expect(body).toMatchObject({
      returnTo: `/garden/objects/${OBJECT_ID}#follow-up-composer`,
      card: { coverUrl: `https://media.over.garden/${publicPath}` },
    });
    const deferred = mocks.scheduleLearningAttributionDrain.mock.calls[0]?.[0];
    expect(deferred).toEqual(expect.any(Function));
    await deferred?.();
    expect(mocks.recordEntryLoggedEventSafely).toHaveBeenCalledTimes(1);
    expect(mocks.recordAnalyticsEventSafely).toHaveBeenCalledTimes(2);
    expect(mocks.recordAnalyticsEventSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventName: "entry_photo_attached",
        properties: expect.objectContaining({ has_photo: true }),
      }),
    );
    fetcher.mockRestore();
  });

  it("returns a durable exact replay before an expired or unavailable staging handoff", async () => {
    const publicPath = `derivatives/${MEDIA_ID}/1.webp`;
    mocks.readCommittedAtomicJournalCreate.mockResolvedValueOnce({
      entry: {
        ...entryResult().entry,
        plant_object_id: OBJECT_ID,
      },
      publicMedia: [{ mediaAssetId: MEDIA_ID, publicPath }],
      finalizeHandoff: {
        stagingSessionId: SESSION_ID,
        receiptSetDigest: "receipt-digest",
      },
    });
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { "content-type": "image/webp" },
      }),
    );
    const { POST } = await import("./route");
    const response = await POST(
      atomicJsonRequest(
        atomicRequest({
          context: {
            target: "plant_object_entry",
            plantObjectId: OBJECT_ID,
          },
          document: documentWithImage(),
          coverMediaAssetId: MEDIA_ID,
          mediaClaimReceipts: ["r".repeat(40)],
        }),
      ),
    );

    await expect(response.json()).resolves.toMatchObject({
      entryId: ENTRY_ID,
      card: { coverUrl: `https://media.over.garden/${publicPath}` },
    });
    expect(mocks.readCommittedAtomicJournalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OWNER_ID }),
      expect.objectContaining({
        publishId: ENTRY_ID,
        clientMutationId: "atomic:opaque",
        orderedMediaAssetIds: [MEDIA_ID],
        coverMediaAssetId: MEDIA_ID,
      }),
    );
    expect(mocks.claimEphemeralPublicationMedia).not.toHaveBeenCalled();
    expect(mocks.finalizeEphemeralPublicationMedia).toHaveBeenCalledWith({
      ownerUserId: OWNER_ID,
      publishId: ENTRY_ID,
      stagingSessionId: SESSION_ID,
      receiptSetDigest: "receipt-digest",
    });
    expect(mocks.createPlantObjectJournalEntry).not.toHaveBeenCalled();
    expect(mocks.scheduleLearningAttributionDrain).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce();
    fetcher.mockRestore();
  });

  it("records a staged space-entry image exactly once without leaking authoring data", async () => {
    const publicPath = `derivatives/${MEDIA_ID}/1.webp`;
    mocks.createSpaceJournalEntry.mockResolvedValueOnce({
      space: entryResult().space,
      entry: { ...entryResult().entry, entry_scope: "space" },
      mentionedObjects: [{ id: OBJECT_ID, displayName: "Rose" }],
      isNewEntry: true,
      mediaAttached: true,
    });
    mocks.claimEphemeralPublicationMedia.mockResolvedValueOnce({
      stagingSessionId: SESSION_ID,
      receiptSetDigest: "receipt-digest",
      publicMedia: [
        {
          mediaAssetId: MEDIA_ID,
          generation: 1,
          sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          sizeBytes: 2,
          width: 100,
          height: 80,
          publicPath,
        },
      ],
    });
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { "content-type": "image/webp" },
      }),
    );
    const { POST } = await import("./route");
    const response = await POST(
      atomicJsonRequest(
        atomicRequest({
          context: {
            target: "space_entry",
            spaceId: SPACE_ID,
            mentionedPlantObjectIds: [OBJECT_ID],
            entryDate: "2026-08-23",
          },
          document: documentWithImage(),
          coverMediaAssetId: MEDIA_ID,
          mediaClaimReceipts: ["r".repeat(40)],
        }),
      ),
    );

    expect(response.status).toBe(200);
    const deferred = mocks.scheduleLearningAttributionDrain.mock.calls[0]?.[0];
    await deferred?.();
    expect(mocks.recordEntryLoggedEventSafely).toHaveBeenCalledTimes(1);
    expect(mocks.recordEntryLoggedEventSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        properties: expect.objectContaining({ has_photo: true }),
      }),
    );
    expect(mocks.recordAnalyticsEventSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventName: "entry_photo_attached",
        properties: expect.objectContaining({ has_photo: true }),
      }),
    );
    expect(
      JSON.stringify([
        mocks.recordEntryLoggedEventSafely.mock.calls,
        mocks.recordAnalyticsEventSafely.mock.calls,
      ]),
    ).not.toMatch(/First flowers|Growth|media_key|coordinate|latitude/i);
    fetcher.mockRestore();
  });

  it("rejects receipt/document set drift without claiming or creating a card", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      atomicJsonRequest(
        atomicRequest({
          document: documentWithImage(),
          mediaClaimReceipts: [],
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "atomic_media_set_mismatch",
    });
    expect(mocks.claimEphemeralPublicationMedia).not.toHaveBeenCalled();
    expect(mocks.createFirstPlantEntry).not.toHaveBeenCalled();
  });

  it("returns one generic boundary failure for a cross-owner or forged receipt", async () => {
    mocks.claimEphemeralPublicationMedia.mockRejectedValueOnce(
      Object.assign(new Error("receipt_mismatch"), {
        code: "receipt_mismatch",
        privateObjectKey: "staging/private-owner/private-object.webp",
      }),
    );
    const { POST } = await import("./route");
    const response = await POST(
      atomicJsonRequest(
        atomicRequest({
          context: {
            target: "plant_object_entry",
            plantObjectId: OBJECT_ID,
          },
          document: documentWithImage(),
          coverMediaAssetId: MEDIA_ID,
          mediaClaimReceipts: ["f".repeat(40)],
        }),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "atomic_publication_failed",
    });
    expect(mocks.createPlantObjectJournalEntry).not.toHaveBeenCalled();
  });

  it("rejects context fields outside the versioned atomic protocol", async () => {
    const { POST } = await import("./route");
    const request = atomicRequest();
    const response = await POST(
      atomicJsonRequest({
        ...request,
        context: {
          ...request.context,
          legacyDraftId: "private-draft-should-never-cross-cutover",
        },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "atomic_request_invalid",
    });
    expect(mocks.claimEphemeralPublicationMedia).not.toHaveBeenCalled();
    expect(mocks.createFirstPlantEntry).not.toHaveBeenCalled();
  });

  it("normalizes an unsafe return target to the context fallback", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      atomicJsonRequest(
        atomicRequest({
          context: {
            target: "plant_object_entry",
            plantObjectId: OBJECT_ID,
          },
          returnTo: "https://attacker.example/steal",
        }),
      ),
    );
    await expect(response.json()).resolves.toMatchObject({
      returnTo: `/garden/objects/${OBJECT_ID}`,
    });
  });
});

function atomicJsonRequest(body: unknown) {
  return new Request("http://local.test/api/garden/entries", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER]: ATOMIC_JOURNAL_CREATE_PROTOCOL,
    },
    body: JSON.stringify(body),
  });
}

function atomicRequest(
  overrides: Partial<AtomicJournalCreateRequest> = {},
): AtomicJournalCreateRequest {
  return {
    publishId: ENTRY_ID,
    clientMutationId: "00000000-0000-4000-8000-000000000007",
    context: {
      target: "first_plant_entry",
      spaceId: SPACE_ID,
      plantName: "Cherry tomato",
      entryDate: "2026-08-23",
    },
    title: "First flowers",
    document: {
      schemaVersion: 1,
      blocks: [
        {
          id: "b_text",
          type: "paragraph",
          spans: [{ text: "Two new flower clusters." }],
        },
      ],
    },
    coverMediaAssetId: null,
    mediaClaimReceipts: [],
    returnTo: "/garden",
    disclosureAccepted: true,
    ...overrides,
  };
}

function documentWithImage() {
  return {
    schemaVersion: 1 as const,
    blocks: [
      { id: "b_text", type: "paragraph" as const, spans: [{ text: "Growth" }] },
      { id: "b_image", type: "image" as const, mediaAssetId: MEDIA_ID },
    ],
  };
}

function entryResult() {
  return {
    space: {
      id: SPACE_ID,
      display_name: "Balcony",
      location_visibility: "hidden",
      coarse_region_code: null,
    },
    plantObject: {
      id: OBJECT_ID,
      display_name: "Cherry tomato",
      object_kind: "plant",
      catalog_item_id: null,
      variety_text: "Cherry tomato",
      variety_state: "selected",
      location_visibility: "hidden",
      coarse_region_code: null,
    },
    entry: {
      id: ENTRY_ID,
      title: "First flowers",
      body: "Two new flower clusters.",
      entry_date: "2026-08-23",
      entry_scope: "object",
      client_mutation_id: "atomic:opaque",
      public_slug: "first-flowers-00000000",
      journal_revision: 1,
    },
    isNewEntry: true,
    mediaAttached: false,
    priorObjectEntryCount: 0,
  };
}
