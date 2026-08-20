import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  JOURNAL_ENTRY_PAYLOAD_MAX_BYTES,
  JOURNAL_DRAFT_REQUEST_MAX_BYTES,
  journalDraftPublicationBody,
  journalDraftPayloadSha256,
  type JournalEntryDraftPayloadV1,
} from "@/lib/garden/entry-contracts";

const mocks = vi.hoisted(() => ({
  admitDocumentMutation: vi.fn(),
  readJournalDraft: vi.fn(),
  saveJournalDraft: vi.fn(),
  deleteJournalDraft: vi.fn(),
  JournalDraftContextForbiddenError: class JournalDraftContextForbiddenError extends Error {
    readonly code = "journal_draft_context_forbidden";
  },
}));

vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: mocks.admitDocumentMutation,
  documentMutationGenerationFromRequest: (request: Request) =>
    request.headers.get("x-overgarden-document-generation"),
  documentMutationAdmissionResponse: (admission: {
    transportResult: string;
    statusCode: number;
  }) =>
    Response.json(
      { code: admission.transportResult },
      {
        status: admission.statusCode,
        headers: { "Cache-Control": "private, no-store" },
      },
    ),
}));

vi.mock("@/server/journal-draft-repository", () => ({
  readJournalDraft: mocks.readJournalDraft,
  saveJournalDraft: mocks.saveJournalDraft,
  deleteJournalDraft: mocks.deleteJournalDraft,
  JournalDraftContextForbiddenError: mocks.JournalDraftContextForbiddenError,
}));

describe("/api/garden/drafts/[draftKey]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.admitDocumentMutation.mockResolvedValue({
      status: "admitted",
      internalResult: "MATCH",
      transportResult: "MATCH",
      envelopeExpiresAtSeconds: 1_786_381_200,
      scope: {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
    });
  });

  it("closes authentication before reading an owner draft", async () => {
    mocks.admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      internalResult: "SIGNED_OUT",
      transportResult: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
    });
    const { GET } = await import("./route");
    const response = await GET(request("GET"), context("first-entry"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.readJournalDraft).not.toHaveBeenCalled();
  });

  it("returns a generic private no-store 404 without cross-owner disclosure", async () => {
    mocks.readJournalDraft.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(request("GET"), context("first-entry"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      code: "JOURNAL_DRAFT_NOT_FOUND",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.readJournalDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "00000000-0000-4000-8000-000000000001",
      }),
      "first-entry",
    );
  });

  it("rejects an oversized body before JSON parsing or repository access", async () => {
    expect(JOURNAL_DRAFT_REQUEST_MAX_BYTES).toBeGreaterThan(
      JOURNAL_ENTRY_PAYLOAD_MAX_BYTES,
    );
    const { PUT } = await import("./route");
    const response = await PUT(
      request(
        "PUT",
        `{"padding":"${"x".repeat(JOURNAL_DRAFT_REQUEST_MAX_BYTES)}"}`,
      ),
      context("first-entry"),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      code: "JOURNAL_DRAFT_TOO_LARGE",
    });
    expect(mocks.saveJournalDraft).not.toHaveBeenCalled();
  });

  it("accepts the supported 100-block document with 10 inline image references", async () => {
    const payload = firstEntryPayload("Full supported document");
    payload.request.contentDocument = {
      schemaVersion: 1,
      blocks: [
        ...Array.from({ length: 90 }, (_, index) => ({
          id: `paragraph-${index}`,
          type: "paragraph" as const,
          spans: [{ text: `Growth note ${index}` }],
        })),
        ...Array.from({ length: 10 }, (_, index) => ({
          id: `image-${index}`,
          type: "image" as const,
          mediaAssetId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        })),
      ],
    };
    const body = await saveBody(payload);
    const receipt = {
      draftKey: "first-entry",
      draftKind: "first_entry",
      context: {},
      payload,
      generation: 1,
      payloadSha256: body.payloadSha256,
      serverRevision: 1,
      updatedAt: "2026-08-20T16:00:00.000Z",
    };
    mocks.saveJournalDraft.mockResolvedValue({
      outcome: "saved",
      draft: receipt,
    });
    const { PUT } = await import("./route");
    const response = await PUT(
      request("PUT", JSON.stringify(body)),
      context("first-entry"),
    );

    expect(response.status).toBe(200);
    expect(mocks.saveJournalDraft).toHaveBeenCalledTimes(1);
  });

  it("keeps the semantic draft request budget at least as large as publication", async () => {
    const payload = firstEntryPayload("Payload parity");
    payload.request.body = "";
    const baseRequestBytes = new TextEncoder().encode(
      JSON.stringify(journalDraftPublicationBody(payload)),
    ).byteLength;
    payload.request.body = "x".repeat(
      JOURNAL_ENTRY_PAYLOAD_MAX_BYTES - baseRequestBytes,
    );
    expect(
      new TextEncoder().encode(
        JSON.stringify(journalDraftPublicationBody(payload)),
      ).byteLength,
    ).toBeLessThanOrEqual(JOURNAL_ENTRY_PAYLOAD_MAX_BYTES);
    expect(
      new TextEncoder().encode(JSON.stringify(payload)).byteLength,
    ).toBeGreaterThan(JOURNAL_ENTRY_PAYLOAD_MAX_BYTES);
    const body = await saveBody(payload);
    expect(
      new TextEncoder().encode(JSON.stringify(body)).byteLength,
    ).toBeLessThanOrEqual(JOURNAL_DRAFT_REQUEST_MAX_BYTES);
    mocks.saveJournalDraft.mockResolvedValue({
      outcome: "saved",
      draft: {
        draftKey: "first-entry",
        draftKind: "first_entry",
        context: {},
        payload,
        generation: 1,
        payloadSha256: body.payloadSha256,
        serverRevision: 1,
        updatedAt: "2026-08-20T16:00:00.000Z",
      },
    });
    const { PUT } = await import("./route");

    const response = await PUT(
      request("PUT", JSON.stringify(body)),
      context("first-entry"),
    );

    expect(response.status).toBe(200);
    expect(mocks.saveJournalDraft).toHaveBeenCalledTimes(1);
  });

  it("rejects a first-entry payload whose selected space is absent from its context", async () => {
    const payload = firstEntryPayload("Mismatched context");
    payload.request.spaceId = "00000000-0000-4000-8000-000000000020";
    const body = await saveBody(payload);
    const { PUT } = await import("./route");

    const response = await PUT(
      request("PUT", JSON.stringify(body)),
      context("first-entry"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "JOURNAL_DRAFT_INVALID",
    });
    expect(mocks.saveJournalDraft).not.toHaveBeenCalled();
  });

  it("maps malformed JSON to a bounded private client error", async () => {
    const { PUT } = await import("./route");

    const response = await PUT(
      request("PUT", "{not-json"),
      context("first-entry"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "JOURNAL_DRAFT_INVALID",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.saveJournalDraft).not.toHaveBeenCalled();
  });

  it("rejects precise coordinates without echoing private text", async () => {
    const payload = firstEntryPayload("Coordinates 50.45010,30.52340");
    const body = await saveBody(payload);
    const { PUT } = await import("./route");
    const response = await PUT(
      request("PUT", JSON.stringify(body)),
      context("first-entry"),
    );
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.code).toBe("precise_location_text");
    expect(JSON.stringify(result)).not.toContain("50.45010");
    expect(mocks.saveJournalDraft).not.toHaveBeenCalled();
  });

  it("rejects a payload/hash fork before persistence", async () => {
    const payload = firstEntryPayload("Safe title");
    const body = await saveBody(payload);
    body.payloadSha256 = "f".repeat(64);
    const { PUT } = await import("./route");
    const response = await PUT(
      request("PUT", JSON.stringify(body)),
      context("first-entry"),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "JOURNAL_DRAFT_HASH_MISMATCH",
    });
    expect(mocks.saveJournalDraft).not.toHaveBeenCalled();
  });

  it("returns the exact authoritative revision/hash receipt", async () => {
    const payload = firstEntryPayload("Safe title");
    const body = await saveBody(payload);
    const receipt = {
      draftKey: "first-entry",
      draftKind: "first_entry",
      context: {
        spaceId: null,
        plantObjectId: null,
        journalEntryId: null,
      },
      payload,
      generation: 1,
      payloadSha256: body.payloadSha256,
      serverRevision: 1,
      updatedAt: "2026-08-20T16:00:00.000Z",
    };
    mocks.saveJournalDraft.mockResolvedValue({
      outcome: "saved",
      draft: receipt,
    });
    const { PUT } = await import("./route");
    const response = await PUT(
      request("PUT", JSON.stringify(body)),
      context("first-entry"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      outcome: "saved",
      draft: receipt,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.saveJournalDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "00000000-0000-4000-8000-000000000001",
      }),
      expect.objectContaining({
        draftKey: "first-entry",
        generation: 1,
        payloadSha256: body.payloadSha256,
      }),
    );
  });

  it("maps stale CAS to a bounded conflict receipt without returning payload", async () => {
    const payload = firstEntryPayload("Safe title");
    const body = await saveBody(payload);
    mocks.saveJournalDraft.mockResolvedValue({
      outcome: "conflict",
      reason: "stale_server_revision",
      current: {
        draftKey: "first-entry",
        draftKind: "first_entry",
        context: {},
        payload: firstEntryPayload("Private current text"),
        generation: 3,
        payloadSha256: "a".repeat(64),
        serverRevision: 7,
        updatedAt: "2026-08-20T16:00:00.000Z",
      },
    });
    const { PUT } = await import("./route");
    const response = await PUT(
      request("PUT", JSON.stringify(body)),
      context("first-entry"),
    );
    const result = await response.json();

    expect(response.status).toBe(409);
    expect(result).toEqual({
      code: "JOURNAL_DRAFT_CONFLICT",
      reason: "stale_server_revision",
      current: {
        generation: 3,
        payloadSha256: "a".repeat(64),
        serverRevision: 7,
        updatedAt: "2026-08-20T16:00:00.000Z",
      },
    });
    expect(JSON.stringify(result)).not.toContain("Private current text");
  });

  it("deletes only an exact consumed draft receipt", async () => {
    mocks.deleteJournalDraft.mockResolvedValue({
      outcome: "deleted",
      draft: { generation: 4 },
    });
    const { DELETE } = await import("./route");
    const response = await DELETE(
      request(
        "DELETE",
        JSON.stringify({
          generation: 4,
          payloadSha256: "b".repeat(64),
          expectedServerRevision: 6,
        }),
      ),
      context("first-entry"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ outcome: "deleted" });
    expect(mocks.deleteJournalDraft).toHaveBeenCalledWith(
      expect.anything(),
      "first-entry",
      {
        generation: 4,
        payloadSha256: "b".repeat(64),
        expectedServerRevision: 6,
      },
    );
  });
});

function request(method: string, body?: string) {
  return new Request("http://local.test/api/garden/drafts/first-entry", {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-overgarden-document-generation": "signed-generation",
    },
    body,
  });
}

function context(draftKey: string) {
  return { params: Promise.resolve({ draftKey }) };
}

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

async function saveBody(payload: JournalEntryDraftPayloadV1) {
  return {
    draftKind: "first_entry" as const,
    context: {},
    payload,
    generation: 1,
    payloadSha256: await journalDraftPayloadSha256(payload),
    expectedServerRevision: null,
  };
}
