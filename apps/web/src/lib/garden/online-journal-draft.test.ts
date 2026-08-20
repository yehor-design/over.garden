import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type {
  JournalEntryDraftPayloadV1,
  JournalEntryDraftReceiptV1,
} from "./entry-contracts";
import {
  createOnlineJournalDraftOwner,
  OnlineJournalDraftError,
} from "./online-journal-draft";

describe("online journal draft owner", () => {
  it("sends one canonical hashed save with document-generation fencing", async () => {
    const payload = firstEntryPayload("Safe title");
    const receipt = draftReceipt(payload, {
      generation: 1,
      payloadSha256: "ignored-by-test-server",
      serverRevision: 1,
    });
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      receipt.payloadSha256 = body.payloadSha256;
      return Response.json({ outcome: "saved", draft: receipt });
    });
    const owner = createOnlineJournalDraftOwner({
      draftKey: "first-entry",
      draftKind: "first_entry",
      context: {},
      documentMutationGeneration: "signed-generation",
      fetchImpl,
    });

    const saved = await owner.save(payload, { generation: 1 });

    expect(saved).toEqual(receipt);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/garden/drafts/first-entry");
    expect(init?.method).toBe("PUT");
    expect(init?.keepalive).toBeUndefined();
    expect(
      new Headers(init?.headers).get("x-overgarden-document-generation"),
    ).toBe("signed-generation");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      generation: 1,
      expectedServerRevision: null,
      payload,
    });
    expect(body.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(owner.getSnapshot()).toMatchObject({
      status: "saved",
      draft: receipt,
      error: null,
    });
  });

  it("updates a mutable first-entry context without rehydrating or changing its key", async () => {
    const payload = firstEntryPayload("Space-scoped title");
    payload.request.spaceId = "00000000-0000-4000-8000-000000000020";
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return Response.json({
        outcome: "saved",
        draft: {
          ...draftReceipt(payload, {
            generation: 1,
            payloadSha256: body.payloadSha256,
            serverRevision: 1,
          }),
          context: body.context,
        },
      });
    });
    const owner = createOnlineJournalDraftOwner({
      draftKey: "first-entry",
      draftKind: "first_entry",
      context: {},
      documentMutationGeneration: "signed-generation",
      fetchImpl,
    });

    owner.replaceContext({ spaceId: payload.request.spaceId });
    await owner.save(payload, { generation: 1, keepalive: true });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/garden/drafts/first-entry");
    expect(init?.keepalive).toBe(true);
    expect(JSON.parse(String(init?.body)).context).toEqual({
      spaceId: payload.request.spaceId,
    });
  });

  it("times out fail-closed, never auto-replays, and explicitly retries the exact body once", async () => {
    const payload = firstEntryPayload("Retry me");
    const requestBodies: string[] = [];
    let attempt = 0;
    const fetchImpl = vi.fn(
      async (_url: string, init?: RequestInit): Promise<Response> => {
        requestBodies.push(String(init?.body));
        attempt += 1;
        if (attempt === 1) {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          });
        }
        const request = JSON.parse(String(init?.body));
        return Response.json({
          outcome: "saved",
          draft: draftReceipt(payload, {
            generation: 1,
            payloadSha256: request.payloadSha256,
            serverRevision: 1,
          }),
        });
      },
    );
    const owner = createOnlineJournalDraftOwner({
      draftKey: "first-entry",
      draftKind: "first_entry",
      context: {},
      documentMutationGeneration: "signed-generation",
      deadlineMs: 5,
      fetchImpl,
    });

    await expect(owner.save(payload, { generation: 1 })).rejects.toMatchObject({
      code: "JOURNAL_DRAFT_TIMEOUT",
      retryable: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(owner.getSnapshot().status).toBe("connection_required");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await owner.retry();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(requestBodies[1]).toBe(requestBodies[0]);
    expect(owner.getSnapshot().status).toBe("saved");
  });

  it("settles at the deadline and ignores a transport that resolves after abort", async () => {
    const payload = firstEntryPayload("Late transport");
    const late = deferred<Response>();
    const fetchImpl = vi.fn(() => late.promise);
    const owner = createOnlineJournalDraftOwner({
      draftKey: "first-entry",
      draftKind: "first_entry",
      context: {},
      documentMutationGeneration: "signed-generation",
      deadlineMs: 5,
      fetchImpl,
    });
    const save = owner.save(payload, { generation: 1 });

    await expect(save).rejects.toMatchObject({
      code: "JOURNAL_DRAFT_TIMEOUT",
      retryable: true,
    });
    expect(owner.getSnapshot()).toMatchObject({
      status: "connection_required",
      error: { code: "JOURNAL_DRAFT_TIMEOUT", retryable: true },
    });

    late.resolve(
      Response.json({
        outcome: "saved",
        draft: draftReceipt(payload, {
          generation: 1,
          payloadSha256: "a".repeat(64),
          serverRevision: 1,
        }),
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(owner.getSnapshot()).toMatchObject({
      status: "connection_required",
      draft: null,
      error: { code: "JOURNAL_DRAFT_TIMEOUT" },
    });
  });

  it("coalesces simultaneous explicit retries into one transport request", async () => {
    const payload = firstEntryPayload("Single flight retry");
    const retryResponse = deferred<Response>();
    let attempt = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      attempt += 1;
      if (attempt === 1) throw new TypeError("network unavailable");
      const body = JSON.parse(String(init?.body));
      const response = await retryResponse.promise;
      void body;
      return response;
    });
    const owner = createOnlineJournalDraftOwner({
      draftKey: "first-entry",
      draftKind: "first_entry",
      context: {},
      documentMutationGeneration: "signed-generation",
      fetchImpl,
    });

    await expect(owner.save(payload, { generation: 1 })).rejects.toMatchObject({
      code: "JOURNAL_DRAFT_CONNECTION_REQUIRED",
    });
    const firstRetry = owner.retry();
    const secondRetry = owner.retry();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    retryResponse.resolve(
      Response.json({
        outcome: "saved",
        draft: draftReceipt(payload, {
          generation: 1,
          payloadSha256: "a".repeat(64),
          serverRevision: 1,
        }),
      }),
    );
    await expect(Promise.all([firstRetry, secondRetry])).resolves.toHaveLength(
      2,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("ignores a late superseded response and keeps the newer generation authoritative", async () => {
    const first = deferred<Response>();
    const payload1 = firstEntryPayload("First");
    const payload2 = firstEntryPayload("Second");
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.payload.request.title === "First") return first.promise;
      return Response.json({
        outcome: "saved",
        draft: draftReceipt(payload2, {
          generation: 2,
          payloadSha256: body.payloadSha256,
          serverRevision: 2,
        }),
      });
    });
    const owner = createOnlineJournalDraftOwner({
      draftKey: "first-entry",
      draftKind: "first_entry",
      context: {},
      documentMutationGeneration: "signed-generation",
      fetchImpl,
    });

    const oldSave = owner.save(payload1, { generation: 1 });
    const oldSaveRejection = expect(oldSave).rejects.toMatchObject({
      code: "JOURNAL_DRAFT_REQUEST_SUPERSEDED",
    });
    const newSave = owner.save(payload2, {
      generation: 2,
      expectedServerRevision: 1,
    });
    await expect(newSave).resolves.toMatchObject({ generation: 2 });
    first.resolve(
      Response.json({
        outcome: "saved",
        draft: draftReceipt(payload1, {
          generation: 1,
          payloadSha256: "a".repeat(64),
          serverRevision: 1,
        }),
      }),
    );
    await oldSaveRejection;

    expect(owner.getSnapshot().draft).toMatchObject({ generation: 2 });
  });

  it("settles an explicit abort even when transport ignores the signal", async () => {
    const late = deferred<Response>();
    const owner = createOnlineJournalDraftOwner({
      draftKey: "first-entry",
      draftKind: "first_entry",
      context: {},
      documentMutationGeneration: "signed-generation",
      fetchImpl: vi.fn(() => late.promise),
    });
    let outcome = "pending";
    const save = owner
      .save(firstEntryPayload("Abort me"), { generation: 1 })
      .then(
        () => {
          outcome = "resolved";
        },
        () => {
          outcome = "rejected";
        },
      );

    owner.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(outcome).toBe("rejected");
    expect(owner.getSnapshot()).toEqual({
      status: "idle",
      draft: null,
      error: null,
    });
    late.resolve(Response.json({ code: "late" }));
    await save;
    expect(owner.getSnapshot()).toEqual({
      status: "idle",
      draft: null,
      error: null,
    });
  });

  it("hydrates a generic 404 as no draft and exposes safe typed failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ code: "JOURNAL_DRAFT_NOT_FOUND" }, { status: 404 }),
      )
      .mockResolvedValue(
        Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }),
      );
    const owner = createOnlineJournalDraftOwner({
      draftKey: "first-entry",
      draftKind: "first_entry",
      context: {},
      documentMutationGeneration: "signed-generation",
      fetchImpl,
    });

    await expect(owner.hydrate()).resolves.toBeNull();
    await expect(owner.hydrate()).rejects.toBeInstanceOf(
      OnlineJournalDraftError,
    );
    await expect(owner.retry()).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      status: 401,
      retryable: false,
    });
    expect(JSON.stringify(owner.getSnapshot())).not.toMatch(
      /Safe title|Retry me/,
    );
  });

  it("contains no durable browser storage or network-state dependency", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./online-journal-draft.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(
      /indexedDB|localStorage|sessionStorage|Dexie|navigator\.onLine|addEventListener\(["'](?:online|offline)/,
    );
  });
});

function firstEntryPayload(
  title: string,
): Extract<JournalEntryDraftPayloadV1, { draftKind: "first_entry" }> {
  return {
    schemaVersion: 1,
    draftKind: "first_entry",
    request: {
      target: "first_plant_entry",
      title,
      clientMutationId: "stable-mutation-1",
    },
  };
}

function draftReceipt(
  payload: JournalEntryDraftPayloadV1,
  input: {
    generation: number;
    payloadSha256: string;
    serverRevision: number;
  },
): JournalEntryDraftReceiptV1 {
  return {
    draftKey: "first-entry",
    draftKind: "first_entry",
    context: {
      spaceId: null,
      plantObjectId: null,
      journalEntryId: null,
    },
    payload,
    ...input,
    updatedAt: "2026-08-20T16:00:00.000Z",
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
