import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  enqueueOfflineMutation,
  getOfflineMutation,
  offlineDb,
  type OfflineJournalEntryPayload,
} from "./queue";
import {
  JournalEntrySyncError,
  syncOfflineJournalEntryMutation,
} from "./journal-entry-sync";
import { hydrateOwnerOfflineActivitySession } from "./owner-session-lifecycle";

const OWNER_A = "00000000-0000-4000-8000-0000000000a1";
const OWNER_B = "00000000-0000-4000-8000-0000000000b2";
const DOCUMENT_A1 = "opaque-document-generation-a1";
const DOCUMENT_A2 = "opaque-document-generation-a2";
const IDEMPOTENCY_KEY = "synthetic-offline-admission-key";

const payload: OfflineJournalEntryPayload = {
  target: "first_plant_entry",
  spaceName: "Synthetic",
  plantName: "Synthetic",
  title: "Synthetic",
  body: "Synthetic",
  entryDate: "2026-08-10",
  clientMutationId: IDEMPOTENCY_KEY,
  syncStatus: "offline_queued",
};

describe("offline document mutation admission", () => {
  beforeEach(async () => {
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
    vi.unstubAllGlobals();
  });

  it("uses the document generation and preserves the owner-scoped durable key", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        successfulEntryResponse(new Headers(init?.headers)),
    );
    vi.stubGlobal("fetch", fetchMock);
    const mutation = await createQueuedMutation();

    await syncOfflineJournalEntryMutation(mutation, {
      expectedOwnerUserId: OWNER_A,
      documentMutationGeneration: DOCUMENT_A1,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get(
        "x-overgarden-document-generation",
      ),
    ).toBe(DOCUMENT_A1);
    expect(await getOfflineMutation(OWNER_A, mutation.id)).toMatchObject({
      ownerUserId: OWNER_A,
      idempotencyKey: IDEMPOTENCY_KEY,
      status: "synced",
    });
  });

  it("never reassigns an A row to B and performs no request or local transition", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const mutation = await createQueuedMutation();
    const before = await getOfflineMutation(OWNER_A, mutation.id);

    await expect(
      syncOfflineJournalEntryMutation(mutation, {
        expectedOwnerUserId: OWNER_B,
        documentMutationGeneration: DOCUMENT_A1,
      }),
    ).rejects.toThrow("does not belong to the active account");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getOfflineMutation(OWNER_A, mutation.id)).toEqual(before);
    expect(await getOfflineMutation(OWNER_B, mutation.id)).toBeUndefined();
  });

  it.each([
    ["DOCUMENT_OWNER_CHANGED", DOCUMENT_A1],
    ["DOCUMENT_SESSION_REFRESH_REQUIRED", DOCUMENT_A1],
    ["DOCUMENT_PROTOCOL_REFRESH_REQUIRED", DOCUMENT_A1],
    ["AUTHENTICATION_REQUIRED", DOCUMENT_A1],
    ["MUTATION_ADMISSION_UNAVAILABLE", DOCUMENT_A1],
  ] as const)(
    "retains the exact A intent after closed result %s",
    async (code, generation) => {
      const fetchMock = vi.fn(async () =>
        Response.json(
          { code },
          {
            status:
              code === "AUTHENTICATION_REQUIRED"
                ? 401
                : code === "MUTATION_ADMISSION_UNAVAILABLE"
                  ? 503
                  : 409,
          },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const mutation = await createQueuedMutation();

      const error = await syncOfflineJournalEntryMutation(mutation, {
        expectedOwnerUserId: OWNER_A,
        documentMutationGeneration: generation,
      }).then(
        () => null,
        (reason: unknown) => reason,
      );

      expect(error).toBeInstanceOf(JournalEntrySyncError);
      expect(error).toMatchObject({ documentMutationAdmission: code });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(await getOfflineMutation(OWNER_A, mutation.id)).toMatchObject({
        ownerUserId: OWNER_A,
        idempotencyKey: IDEMPOTENCY_KEY,
        status: "failed",
        payload,
      });
      expect(JSON.stringify(error)).not.toMatch(
        /ownerUserId|sessionId|latitude|longitude|coordinates|generation-a1/i,
      );
    },
  );

  it("reuses the same durable row and produces at most one effect after a fresh generation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { code: "DOCUMENT_SESSION_REFRESH_REQUIRED" },
          { status: 409 },
        ),
      )
      .mockImplementationOnce(
        async (_input: RequestInfo | URL, init?: RequestInit) =>
          successfulEntryResponse(new Headers(init?.headers)),
      );
    vi.stubGlobal("fetch", fetchMock);
    const mutation = await createQueuedMutation();

    await expect(
      syncOfflineJournalEntryMutation(mutation, {
        expectedOwnerUserId: OWNER_A,
        documentMutationGeneration: DOCUMENT_A1,
      }),
    ).rejects.toMatchObject({
      documentMutationAdmission: "DOCUMENT_SESSION_REFRESH_REQUIRED",
    });
    const failed = await getOfflineMutation(OWNER_A, mutation.id);
    expect(failed).toMatchObject({
      id: mutation.id,
      idempotencyKey: IDEMPOTENCY_KEY,
      status: "failed",
    });

    await syncOfflineJournalEntryMutation(failed!, {
      expectedOwnerUserId: OWNER_A,
      documentMutationGeneration: DOCUMENT_A2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get(
        "x-overgarden-document-generation",
      ),
    ).toBe(DOCUMENT_A2);
    expect(await getOfflineMutation(OWNER_A, mutation.id)).toMatchObject({
      id: mutation.id,
      ownerUserId: OWNER_A,
      idempotencyKey: IDEMPOTENCY_KEY,
      status: "synced",
    });
  });
});

function createQueuedMutation() {
  return enqueueOfflineMutation({
    ownerUserId: OWNER_A,
    kind: "journal_entry",
    payload,
    idempotencyKey: IDEMPOTENCY_KEY,
  });
}

function successfulEntryResponse(headers: Headers) {
  expect(headers.get("x-overgarden-document-generation")).toMatch(
    /^opaque-document-generation-a[12]$/,
  );
  return Response.json({
    space: { id: "space-1", displayName: "Synthetic" },
    plantObject: { id: "object-1", displayName: "Synthetic" },
    entry: { id: "entry-1", title: "Synthetic", body: "Synthetic" },
    readbackUrl: "/garden/objects/object-1",
  });
}
