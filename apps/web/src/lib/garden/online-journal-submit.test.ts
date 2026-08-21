import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type {
  JournalEntryDraftPayloadV1,
  JournalEntryDraftReceiptV1,
} from "./entry-contracts";
import type { OnlineJournalDraftOwner } from "./online-journal-draft";
import {
  createOnlineJournalSubmitOwner,
  OnlineJournalSubmitError,
  uploadOnlineComposerPhoto,
} from "./online-journal-submit";

describe("online journal publication owner", () => {
  it("publishes the exact stable mutation, deletes the consumed draft, and reads absence back", async () => {
    const draft = firstEntryDraft();
    const draftOwner = mockDraftOwner();
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json(publicationResponse(JSON.parse(String(init?.body)))),
    );
    const owner = createOnlineJournalSubmitOwner({
      documentMutationGeneration: "signed-generation",
      draftOwner,
      fetchImpl,
    });

    const result = await owner.submit(draft);

    expect(result.entry.clientMutationId).toBe("stable-mutation-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/garden/entries");
    expect(init?.method).toBe("POST");
    expect(
      new Headers(init?.headers).get("x-overgarden-document-generation"),
    ).toBe("signed-generation");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      target: "first_plant_entry",
      clientMutationId: "stable-mutation-1",
      syncStatus: "online",
    });
    expect(draftOwner.delete).toHaveBeenCalledWith(draft);
    expect(draftOwner.hydrate).toHaveBeenCalledTimes(1);
    expect(owner.getSnapshot()).toMatchObject({
      status: "published",
      error: null,
    });
  });

  it("uses the existing aggregate PATCH endpoint for edit drafts", async () => {
    const draft = editDraft();
    const draftOwner = mockDraftOwner();
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return Response.json({
        entry: {
          id: "00000000-0000-4000-8000-000000000010",
          title: "Edited",
          clientMutationId: "stable-edit-1",
          journalRevision: 3,
        },
        isReplay: false,
      });
    });
    const owner = createOnlineJournalSubmitOwner({
      documentMutationGeneration: "signed-generation",
      draftOwner,
      fetchImpl,
    });

    await owner.submit(draft);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      "/api/garden/entries/00000000-0000-4000-8000-000000000010",
    );
    expect(init?.method).toBe("PATCH");
    const body = JSON.parse(String(init?.body));
    expect(body.entryId).toBeUndefined();
    expect(body.clientMutationId).toBe("stable-edit-1");
    expect(body.expectedRevision).toBe(2);
  });

  it("does not auto-replay a failed publication and explicit retry reuses the exact body", async () => {
    const draft = firstEntryDraft();
    const draftOwner = mockDraftOwner();
    const bodies: string[] = [];
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        bodies.push(String(init?.body));
        throw new TypeError("network unavailable");
      })
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        bodies.push(String(init?.body));
        return Response.json(
          publicationResponse(JSON.parse(String(init?.body))),
        );
      });
    const owner = createOnlineJournalSubmitOwner({
      documentMutationGeneration: "signed-generation",
      draftOwner,
      fetchImpl,
    });

    await expect(owner.submit(draft)).rejects.toMatchObject({
      code: "JOURNAL_SUBMIT_CONNECTION_REQUIRED",
      retryable: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(draftOwner.delete).not.toHaveBeenCalled();

    await owner.retry();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[1]!).clientMutationId).toBe("stable-mutation-1");
    expect(draftOwner.delete).toHaveBeenCalledTimes(1);
  });

  it("keeps publication retryable until exact draft consumption is confirmed", async () => {
    const draft = firstEntryDraft();
    const draftOwner = mockDraftOwner();
    draftOwner.delete
      .mockRejectedValueOnce(new Error("delete unavailable"))
      .mockResolvedValueOnce(draft);
    const requestBodies: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      requestBodies.push(String(init?.body));
      return Response.json(publicationResponse(JSON.parse(String(init?.body))));
    });
    const owner = createOnlineJournalSubmitOwner({
      documentMutationGeneration: "signed-generation",
      draftOwner,
      fetchImpl,
    });

    await expect(owner.submit(draft)).rejects.toBeInstanceOf(
      OnlineJournalSubmitError,
    );
    expect(owner.getSnapshot()).toMatchObject({
      status: "connection_required",
      error: { code: "JOURNAL_DRAFT_CONSUMPTION_UNCONFIRMED" },
    });

    await owner.retry();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(requestBodies[1]).toBe(requestBodies[0]);
    expect(draftOwner.delete).toHaveBeenCalledTimes(2);
    expect(draftOwner.hydrate).toHaveBeenCalledTimes(1);
    expect(owner.getSnapshot().status).toBe("published");
  });

  it("settles at the publication deadline and ignores a late transport", async () => {
    vi.useFakeTimers();
    try {
      const draft = firstEntryDraft();
      const draftOwner = mockDraftOwner();
      const late = deferred<Response>();
      const owner = createOnlineJournalSubmitOwner({
        documentMutationGeneration: "signed-generation",
        draftOwner,
        deadlineMs: 5,
        fetchImpl: vi.fn(() => late.promise),
      });
      let outcome = "pending";
      const submission = owner.submit(draft).then(
        () => {
          outcome = "resolved";
        },
        () => {
          outcome = "rejected";
        },
      );

      await vi.advanceTimersByTimeAsync(6);

      expect(outcome).toBe("rejected");
      expect(owner.getSnapshot()).toMatchObject({
        status: "connection_required",
        result: null,
        error: { code: "JOURNAL_SUBMIT_TIMEOUT", retryable: true },
      });
      expect(draftOwner.delete).not.toHaveBeenCalled();

      late.resolve(
        Response.json(publicationResponse({ ...draft.payload.request })),
      );
      await Promise.resolve();
      await Promise.resolve();
      await submission;
      expect(owner.getSnapshot()).toMatchObject({
        status: "connection_required",
        result: null,
        error: { code: "JOURNAL_SUBMIT_TIMEOUT" },
      });
      expect(draftOwner.delete).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("coalesces simultaneous publication retries into one request", async () => {
    const draft = firstEntryDraft();
    const draftOwner = mockDraftOwner();
    const retryResponse = deferred<Response>();
    let attempt = 0;
    const fetchImpl = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new TypeError("network unavailable");
      return retryResponse.promise;
    });
    const owner = createOnlineJournalSubmitOwner({
      documentMutationGeneration: "signed-generation",
      draftOwner,
      fetchImpl,
    });

    await expect(owner.submit(draft)).rejects.toMatchObject({
      code: "JOURNAL_SUBMIT_CONNECTION_REQUIRED",
    });
    const firstRetry = owner.retry();
    const secondRetry = owner.retry();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    retryResponse.resolve(
      Response.json(publicationResponse({ ...draft.payload.request })),
    );
    await expect(Promise.all([firstRetry, secondRetry])).resolves.toHaveLength(
      2,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(draftOwner.delete).toHaveBeenCalledTimes(1);
  });

  it("has no queue, offline module, or durable browser storage dependency", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./online-journal-submit.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(
      /@\/lib\/offline|enqueueOffline|IndexedDB|indexedDB|localStorage|sessionStorage|Dexie|navigator\.onLine/,
    );
  });

  it("uploads current-tab media through quarantine and confirms processed read-back", async () => {
    const file = new Blob(["safe-image"], { type: "image/jpeg" });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          mediaAssetId: "00000000-0000-4000-8000-000000000030",
          uploadUrl: "https://upload.example.invalid/private-capability",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          mediaAsset: {
            id: "00000000-0000-4000-8000-000000000030",
            status: "processed",
          },
          publicUrl: "https://media.example.invalid/derived.webp",
        }),
      );

    await expect(
      uploadOnlineComposerPhoto({
        intent: {
          fileName: "garden.jpg",
          contentType: "image/jpeg",
          size: file.size,
          blob: file,
        },
        authReturnTo: "/garden",
        documentMutationGeneration: "signed-generation",
        fetchImpl,
      }),
    ).resolves.toEqual({
      mediaAssetId: "00000000-0000-4000-8000-000000000030",
      publicUrl: "https://media.example.invalid/derived.webp",
    });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "/api/media/uploads",
      "https://upload.example.invalid/private-capability",
      "/api/media/process",
    ]);
    expect(
      new Headers(fetchImpl.mock.calls[0]![1]?.headers).get(
        "x-overgarden-document-generation",
      ),
    ).toBe("signed-generation");
    expect(fetchImpl.mock.calls[1]![1]?.body).toBe(file);
  });

  it("reuses a stable retirement upload generation without restoring a deleted original", async () => {
    const file = new Blob(["safe-image"], { type: "image/jpeg" });
    const uploadGenerationId = "00000000-0000-4000-8000-000000000322";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          mediaAssetId: "00000000-0000-4000-8000-000000000030",
          uploadRequired: false,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          mediaAsset: {
            id: "00000000-0000-4000-8000-000000000030",
            status: "processed",
          },
          publicUrl: "https://media.example.invalid/derived.webp",
        }),
      );

    await uploadOnlineComposerPhoto({
      intent: {
        fileName: "garden.jpg",
        contentType: "image/jpeg",
        size: file.size,
        blob: file,
      },
      stableUploadGenerationId: uploadGenerationId,
      authReturnTo: "/garden",
      documentMutationGeneration: "signed-generation",
      fetchImpl,
    });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "/api/media/uploads",
      "/api/media/process",
    ]);
    expect(JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body))).toEqual({
      contentType: "image/jpeg",
      sizeBytes: file.size,
      uploadGenerationId,
    });
  });

  it("refuses a media selection whose bytes are absent from current-tab memory", async () => {
    const fetchImpl = vi.fn();

    await expect(
      uploadOnlineComposerPhoto({
        intent: {
          fileName: "missing.jpg",
          contentType: "image/jpeg",
          size: 100,
        },
        authReturnTo: "/garden",
        documentMutationGeneration: "signed-generation",
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      code: "JOURNAL_MEDIA_INVALID",
      retryable: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("settles media upload at its deadline and ignores a late transport", async () => {
    const file = new Blob(["safe-image"], { type: "image/jpeg" });
    const late = deferred<Response>();
    const fetchImpl = vi.fn(() => late.promise);
    const upload = uploadOnlineComposerPhoto({
      intent: {
        fileName: "garden.jpg",
        contentType: "image/jpeg",
        size: file.size,
        blob: file,
      },
      authReturnTo: "/garden",
      documentMutationGeneration: "signed-generation",
      deadlineMs: 5,
      fetchImpl,
    });

    await expect(upload).rejects.toMatchObject({
      code: "JOURNAL_MEDIA_TIMEOUT",
      retryable: true,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();

    late.resolve(
      Response.json({
        mediaAssetId: "00000000-0000-4000-8000-000000000030",
        uploadUrl: "https://upload.example.invalid/private-capability",
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("honors the retirement bridge's explicit thirty-second media deadline", async () => {
    vi.useFakeTimers();
    try {
      const file = new Blob(["safe-image"], { type: "image/jpeg" });
      const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
      const outcome = uploadOnlineComposerPhoto({
        intent: {
          fileName: "garden.jpg",
          contentType: "image/jpeg",
          size: file.size,
          blob: file,
        },
        authReturnTo: "/garden",
        documentMutationGeneration: "signed-generation",
        deadlineMs: 30_000,
        fetchImpl,
      }).then(
        () => "resolved",
        (error: unknown) =>
          error instanceof OnlineJournalSubmitError ? error.code : "unknown",
      );
      let observed: string | undefined;
      void outcome.then((result) => {
        observed = result;
      });

      await vi.advanceTimersByTimeAsync(15_000);
      expect(observed).toBeUndefined();

      await vi.advanceTimersByTimeAsync(15_000);
      await expect(outcome).resolves.toBe("JOURNAL_MEDIA_TIMEOUT");
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

function mockDraftOwner() {
  return {
    getSnapshot: vi.fn(),
    subscribe: vi.fn(),
    hydrate: vi.fn().mockResolvedValue(null),
    save: vi.fn(),
    delete: vi.fn().mockResolvedValue(null),
    retry: vi.fn(),
    replaceContext: vi.fn(),
    replaceDocumentMutationGeneration: vi.fn(),
    abort: vi.fn(),
  } as unknown as OnlineJournalDraftOwner & {
    delete: ReturnType<typeof vi.fn>;
    hydrate: ReturnType<typeof vi.fn>;
  };
}

function firstEntryPayload(): JournalEntryDraftPayloadV1 {
  return {
    schemaVersion: 1,
    draftKind: "first_entry",
    request: {
      target: "first_plant_entry",
      title: "First flowers",
      body: "Two clusters.",
      clientMutationId: "stable-mutation-1",
    },
  };
}

function firstEntryDraft(): JournalEntryDraftReceiptV1 {
  return {
    draftKey: "first-entry",
    draftKind: "first_entry",
    context: {},
    payload: firstEntryPayload(),
    generation: 4,
    payloadSha256: "a".repeat(64),
    serverRevision: 6,
    updatedAt: "2026-08-20T16:00:00.000Z",
  };
}

function editDraft(): JournalEntryDraftReceiptV1 {
  const entryId = "00000000-0000-4000-8000-000000000010";
  return {
    draftKey: `edit-entry:${entryId}`,
    draftKind: "edit_entry",
    context: { journalEntryId: entryId },
    payload: {
      schemaVersion: 1,
      draftKind: "edit_entry",
      request: {
        entryId,
        title: "Edited",
        clientMutationId: "stable-edit-1",
        expectedRevision: 2,
      },
    },
    generation: 2,
    payloadSha256: "b".repeat(64),
    serverRevision: 2,
    updatedAt: "2026-08-20T16:00:00.000Z",
  };
}

function publicationResponse(body: Record<string, unknown>) {
  return {
    space: {
      id: "space-1",
      displayName: "Balcony",
      locationVisibility: "hidden",
      coarseRegionCode: null,
    },
    plantObject: {
      id: "object-1",
      displayName: "Tomato",
      objectKind: "plant",
      catalogItemId: null,
      varietyText: null,
      varietyState: "unknown",
      locationVisibility: "hidden",
      coarseRegionCode: null,
    },
    entry: {
      id: "entry-1",
      title: body.title,
      body: body.body,
      entryDate: "2026-08-20",
      clientMutationId: body.clientMutationId,
      journalRevision: 1,
    },
    readbackUrl: "/garden/objects/object-1",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
