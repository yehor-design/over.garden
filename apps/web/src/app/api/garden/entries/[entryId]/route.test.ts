import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ATOMIC_JOURNAL_EDIT_PROTOCOL,
  ATOMIC_JOURNAL_EDIT_PROTOCOL_HEADER,
  JOURNAL_ENTRY_PAYLOAD_MAX_BYTES,
  type AtomicJournalEditRequest,
} from "@/lib/garden/entry-contracts";

const mocks = vi.hoisted(() => ({
  admitDocumentMutation: vi.fn(),
  readCommittedAtomicJournalEdit: vi.fn(),
  readAtomicJournalEditBaseline: vi.fn(),
  updateAtomicJournalEntry: vi.fn(),
  updateJournalEntryAggregate: vi.fn(),
  verifyEphemeralPublicationReceipts: vi.fn(),
  claimEphemeralPublicationMedia: vi.fn(),
  finalizeEphemeralPublicationMedia: vi.fn(),
  convergePublicProjectionsNow: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  getPublicDerivativeUrl: (key: string) => `https://media.over.garden/${key}`,
}));
vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: mocks.admitDocumentMutation,
  documentMutationGenerationFromRequest: () => "signed-generation",
  documentMutationAdmissionResponse: () =>
    Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }),
}));
vi.mock("@/server/journal-repository", () => ({
  JournalAggregateConflictError: class JournalAggregateConflictError extends Error {
    code = "journal_aggregate_conflict";
    currentRevision = 5;
  },
  readCommittedAtomicJournalEdit: mocks.readCommittedAtomicJournalEdit,
  readAtomicJournalEditBaseline: mocks.readAtomicJournalEditBaseline,
  updateAtomicJournalEntry: mocks.updateAtomicJournalEntry,
  updateJournalEntryAggregate: mocks.updateJournalEntryAggregate,
}));
vi.mock("@/server/media/ephemeral-publication-handoff", () => ({
  verifyEphemeralPublicationReceipts: mocks.verifyEphemeralPublicationReceipts,
  claimEphemeralPublicationMedia: mocks.claimEphemeralPublicationMedia,
  finalizeEphemeralPublicationMedia: mocks.finalizeEphemeralPublicationMedia,
}));
vi.mock("@/server/mvp-learning/composer-signals", () => ({
  recordComposerLearningSignalsSafely: vi.fn(),
}));
vi.mock("@/server/mvp-learning/attribution-after-response", () => ({
  scheduleLearningAttributionDrain: vi.fn(),
}));
vi.mock("@/server/search/public-projection-outbox", () => ({
  convergePublicProjectionsNow: mocks.convergePublicProjectionsNow,
}));

describe("PATCH /api/garden/entries/[entryId]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.admitDocumentMutation.mockResolvedValue({
      status: "admitted",
      scope: { userId: "00000000-0000-4000-8000-000000000001" },
    });
    mocks.readCommittedAtomicJournalEdit.mockResolvedValue(null);
    mocks.convergePublicProjectionsNow.mockResolvedValue(undefined);
    mocks.readAtomicJournalEditBaseline.mockResolvedValue({
      entry: {
        id: ENTRY_ID,
        title: "Before",
        body: "Before",
        entry_date: "2026-08-22",
        journal_revision: "4",
        public_slug: "public-entry",
        plant_object_id: null,
        visibility: "public",
      },
      document: document(MEDIA_ID),
      media: [
        {
          mediaAssetId: MEDIA_ID,
          generation: 4,
          publicPath: `derivatives/${MEDIA_ID}/4.webp`,
          focalX: 0.5,
          focalY: 0.5,
        },
      ],
    });
    mocks.verifyEphemeralPublicationReceipts.mockResolvedValue({
      receiptSetDigest: "B".repeat(43),
      stagingSessionId: SESSION_ID,
      media: [
        {
          mediaAssetId: MEDIA_ID,
          generation: 5,
          sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          sizeBytes: 1_024,
          width: 800,
          height: 600,
        },
      ],
    });
    mocks.claimEphemeralPublicationMedia.mockResolvedValue({
      receiptSetDigest: "B".repeat(43),
      stagingSessionId: SESSION_ID,
      publicMedia: [
        {
          mediaAssetId: MEDIA_ID,
          generation: 5,
          sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          sizeBytes: 1_024,
          width: 800,
          height: 600,
          publicPath: `derivatives/${MEDIA_ID}/5.webp`,
        },
      ],
    });
    mocks.updateAtomicJournalEntry.mockResolvedValue({
      entry: {
        id: ENTRY_ID,
        title: "After",
        body: "After",
        entry_date: "2026-08-23",
        journal_revision: "5",
        public_slug: "public-entry",
        plant_object_id: null,
      },
      publicMedia: [
        {
          mediaAssetId: MEDIA_ID,
          publicPath: `derivatives/${MEDIA_ID}/5.webp`,
        },
      ],
      isReplay: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 200,
            headers: { "content-type": "image/webp" },
          }),
      ),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("enforces the shared publication payload budget before repository access", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://local.test/api/garden/entries/entry-1", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          [ATOMIC_JOURNAL_EDIT_PROTOCOL_HEADER]: ATOMIC_JOURNAL_EDIT_PROTOCOL,
        },
        body: JSON.stringify({
          title: "x".repeat(JOURNAL_ENTRY_PAYLOAD_MAX_BYTES),
        }),
      }),
      { params: Promise.resolve({ entryId: "entry-1" }) },
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      code: "JOURNAL_ENTRY_TOO_LARGE",
    });
    expect(mocks.updateJournalEntryAggregate).not.toHaveBeenCalled();
  });

  it("claims only the replacement receipt and returns one final authoritative revision", async () => {
    const { PATCH } = await import("./route");
    const request = validRequest();
    const response = await PATCH(
      new Request(`http://local.test/api/garden/entries/${ENTRY_ID}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          [ATOMIC_JOURNAL_EDIT_PROTOCOL_HEADER]: ATOMIC_JOURNAL_EDIT_PROTOCOL,
        },
        body: JSON.stringify(request),
      }),
      { params: Promise.resolve({ entryId: ENTRY_ID }) },
    );

    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      200,
    );
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        entryId: ENTRY_ID,
        revision: 5,
        returnTo: "/uk/journal/public-entry",
      }),
    );
    expect(mocks.verifyEphemeralPublicationReceipts).toHaveBeenCalledWith(
      expect.objectContaining({
        stagingReceipts: [RECEIPT],
      }),
    );
    expect(mocks.claimEphemeralPublicationMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        publishId: ENTRY_ID,
        orderedMediaAssetIds: [MEDIA_ID],
      }),
    );
    expect(mocks.updateAtomicJournalEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryId: ENTRY_ID,
        expectedRevision: 4,
        retainedMediaAssetIds: [MEDIA_ID],
        removedMediaAssetIds: [],
      }),
    );
    expect(mocks.finalizeEphemeralPublicationMedia).toHaveBeenCalledOnce();
    expect(mocks.updateJournalEntryAggregate).not.toHaveBeenCalled();
  });

  it("replays a committed edit before checking an expired staging receipt", async () => {
    mocks.readCommittedAtomicJournalEdit.mockResolvedValue({
      entry: {
        id: ENTRY_ID,
        title: "After",
        body: "After",
        entry_date: "2026-08-23",
        journal_revision: "5",
        public_slug: "public-entry",
        plant_object_id: null,
      },
      publicMedia: [
        {
          mediaAssetId: MEDIA_ID,
          publicPath: `derivatives/${MEDIA_ID}/5.webp`,
        },
      ],
      finalizeHandoff: {
        stagingSessionId: SESSION_ID,
        receiptSetDigest: "B".repeat(43),
      },
      isReplay: true,
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request(`http://local.test/api/garden/entries/${ENTRY_ID}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          [ATOMIC_JOURNAL_EDIT_PROTOCOL_HEADER]: ATOMIC_JOURNAL_EDIT_PROTOCOL,
        },
        body: JSON.stringify(validRequest()),
      }),
      { params: Promise.resolve({ entryId: ENTRY_ID }) },
    );

    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      200,
    );
    expect(mocks.verifyEphemeralPublicationReceipts).not.toHaveBeenCalled();
    expect(mocks.claimEphemeralPublicationMedia).not.toHaveBeenCalled();
    expect(mocks.updateAtomicJournalEntry).not.toHaveBeenCalled();
    expect(mocks.finalizeEphemeralPublicationMedia).toHaveBeenCalledOnce();
  });

  it("returns a revision conflict before verifying or claiming staged media", async () => {
    const staleBaseline = await mocks.readAtomicJournalEditBaseline();
    mocks.readAtomicJournalEditBaseline.mockResolvedValue({
      ...staleBaseline,
      entry: {
        ...staleBaseline.entry,
        journal_revision: "5",
      },
    });
    mocks.readAtomicJournalEditBaseline.mockClear();
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request(`http://local.test/api/garden/entries/${ENTRY_ID}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          [ATOMIC_JOURNAL_EDIT_PROTOCOL_HEADER]: ATOMIC_JOURNAL_EDIT_PROTOCOL,
        },
        body: JSON.stringify(validRequest()),
      }),
      { params: Promise.resolve({ entryId: ENTRY_ID }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "journal_aggregate_conflict",
      currentRevision: 5,
    });
    expect(mocks.verifyEphemeralPublicationReceipts).not.toHaveBeenCalled();
    expect(mocks.claimEphemeralPublicationMedia).not.toHaveBeenCalled();
    expect(mocks.updateAtomicJournalEntry).not.toHaveBeenCalled();
  });

  it.each([null, "2026-02-31"])(
    "rejects replay-unstable or impossible edit date %s",
    async (entryDate) => {
      const { PATCH } = await import("./route");
      const response = await PATCH(
        new Request(`http://local.test/api/garden/entries/${ENTRY_ID}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            [ATOMIC_JOURNAL_EDIT_PROTOCOL_HEADER]: ATOMIC_JOURNAL_EDIT_PROTOCOL,
          },
          body: JSON.stringify({ ...validRequest(), entryDate }),
        }),
        { params: Promise.resolve({ entryId: ENTRY_ID }) },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        code: "atomic_edit_request_invalid",
      });
      expect(mocks.readAtomicJournalEditBaseline).not.toHaveBeenCalled();
      expect(mocks.updateAtomicJournalEntry).not.toHaveBeenCalled();
    },
  );
});

const ENTRY_ID = "00000000-0000-4000-8000-000000000010";
const MEDIA_ID = "00000000-0000-4000-8000-000000000011";
const MUTATION_ID = "00000000-0000-4000-8000-000000000012";
const SESSION_ID = "00000000-0000-4000-8000-000000000013";
const RECEIPT = "R".repeat(40);

function validRequest(): AtomicJournalEditRequest {
  return {
    publishId: ENTRY_ID,
    clientMutationId: MUTATION_ID,
    expectedRevision: 4,
    title: "After",
    entryDate: "2026-08-23",
    document: document(MEDIA_ID),
    coverMediaAssetId: MEDIA_ID,
    newMediaClaimReceipts: [RECEIPT],
    retainedMediaAssetIds: [MEDIA_ID],
    removedMediaAssetIds: [],
    focalPoints: [{ mediaAssetId: MEDIA_ID, x: 0.25, y: 0.75 }],
    returnTo: "/uk/journal/public-entry",
  };
}

function document(mediaAssetId: string) {
  return {
    schemaVersion: 1 as const,
    blocks: [
      { id: "b_text", type: "paragraph" as const, spans: [{ text: "After" }] },
      { id: "b_image", type: "image" as const, mediaAssetId },
    ],
  };
}
