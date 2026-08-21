import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ONLINE_JOURNAL_PROTOCOL,
  ONLINE_JOURNAL_PROTOCOL_HEADER,
} from "@/lib/garden/entry-contracts";

const authMock = vi.hoisted(() => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
}));

const mediaRepositoryMock = vi.hoisted(() => ({
  createQuarantinedMediaAsset: vi.fn(
    async (_scope: unknown, input: Record<string, unknown>) => ({
      id: "00000000-0000-0000-0000-000000000010",
      quarantine_key: input.quarantineKey,
      declared_media_type: input.declaredMediaType,
      declared_size_bytes: String(input.declaredSizeBytes),
      media_readiness_state: "quarantined",
      status: "quarantined",
    }),
  ),
  findMediaAssetByUploadGeneration: vi.fn(),
}));

const storageMock = vi.hoisted(() => ({
  createQuarantineUploadUrl: vi.fn(async () => ({
    uploadUrl: "https://uploads.example.test/quarantine-photo",
  })),
  resolveR2UploadUrlTtlConfiguration: vi.fn(() => ({
    source: "default" as const,
    effectiveSeconds: 900,
  })),
  resolveEffectiveR2PresignTtlSeconds: vi.fn(() => 900),
}));

const authIntentMock = vi.hoisted(() => ({
  authIntentRequiredResponse: vi.fn(() =>
    Response.json(
      {
        error: "Sign in to continue this photo save.",
        authIntentUrl: "/auth/intent?intent=opaque-media-intent",
      },
      { status: 401 },
    ),
  ),
}));

const admissionMock = vi.hoisted(() => ({
  admitDocumentMutation: vi.fn(),
}));

vi.mock("@/server/auth-session", () => authMock);
vi.mock("@/server/media/media-repository", () => mediaRepositoryMock);
vi.mock("@/lib/storage", () => storageMock);
vi.mock("@/server/auth-intent-http", () => authIntentMock);
vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: admissionMock.admitDocumentMutation,
  documentMutationGenerationFromRequest: (request: Request) =>
    request.headers.get("x-overgarden-document-generation"),
  documentMutationAdmissionResponse: (admission: {
    transportResult: string;
    statusCode: number;
  }) =>
    Response.json(
      { code: admission.transportResult },
      { status: admission.statusCode },
    ),
}));

import { POST } from "./route";

describe("media upload API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mediaRepositoryMock.findMediaAssetByUploadGeneration.mockResolvedValue(
      undefined,
    );
    admissionMock.admitDocumentMutation.mockResolvedValue({
      status: "admitted",
      scope: {
        userId: "00000000-0000-0000-0000-000000000001",
        sessionId: "session-1",
      },
      envelopeExpiresAtSeconds: 1_786_381_200,
    });
  });

  it("returns a closed authentication result before reading a private upload body", async () => {
    admissionMock.admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      internalResult: "SIGNED_OUT",
      transportResult: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
    });
    const privateBody = JSON.stringify({
      contentType: "image/jpeg",
      privateCaption: "A private balcony note",
    });
    const request = onlineRequest("http://localhost/api/media/uploads", {
      method: "POST",
      headers: { "x-overgarden-auth-return": "/garden" },
      body: privateBody,
    });
    const response = await POST(request);
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(401);
    expect(serialized).toContain("AUTHENTICATION_REQUIRED");
    expect(serialized).not.toMatch(/private balcony|caption/i);
    expect(
      mediaRepositoryMock.createQuarantinedMediaAsset,
    ).not.toHaveBeenCalled();
  });

  it("maps an unavailable admission boundary to a closed 503", async () => {
    admissionMock.admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      internalResult: "MUTATION_ADMISSION_UNAVAILABLE",
      transportResult: "MUTATION_ADMISSION_UNAVAILABLE",
      statusCode: 503,
    });

    const response = await POST(
      new Request("http://localhost/api/media/uploads", {
        method: "POST",
        body: JSON.stringify({ contentType: "image/jpeg", sizeBytes: 123 }),
      }),
    );

    expect(response.status).toBe(503);
    expect(
      mediaRepositoryMock.createQuarantinedMediaAsset,
    ).not.toHaveBeenCalled();
  });

  it("refuses an authenticated legacy client before reserving media", async () => {
    const response = await POST(
      new Request("http://localhost/api/media/uploads", {
        method: "POST",
        body: JSON.stringify({
          contentType: "image/jpeg",
          sizeBytes: 123,
          privateCaption: "Private legacy caption",
        }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "legacy_client_retired",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(
      mediaRepositoryMock.createQuarantinedMediaAsset,
    ).not.toHaveBeenCalled();
    expect(storageMock.createQuarantineUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects attempts to pre-bind quarantined media to a journal entry", async () => {
    const response = await POST(
      onlineRequest("http://localhost/api/media/uploads", {
        method: "POST",
        body: JSON.stringify({
          contentType: "image/jpeg",
          sizeBytes: 123,
          journalEntryId: "00000000-0000-0000-0000-000000000020",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(
      mediaRepositoryMock.createQuarantinedMediaAsset,
    ).not.toHaveBeenCalled();
    expect(storageMock.createQuarantineUploadUrl).not.toHaveBeenCalled();
  });

  it("creates quarantine uploads without an entry binding", async () => {
    mediaRepositoryMock.createQuarantinedMediaAsset.mockClear();
    storageMock.createQuarantineUploadUrl.mockClear();

    const response = await POST(
      onlineRequest("http://localhost/api/media/uploads", {
        method: "POST",
        body: JSON.stringify({
          contentType: "image/webp",
          sizeBytes: 123,
        }),
      }),
    );
    const body = (await response.json()) as { mediaAssetId?: string };

    expect(response.status).toBe(200);
    expect(body.mediaAssetId).toBe("00000000-0000-0000-0000-000000000010");
    expect(
      mediaRepositoryMock.createQuarantinedMediaAsset,
    ).toHaveBeenCalledOnce();
    const createMediaCall = mediaRepositoryMock.createQuarantinedMediaAsset.mock
      .calls[0] as unknown[];
    expect(createMediaCall).toHaveLength(2);
    expect(createMediaCall[1]).toEqual(
      expect.objectContaining({
        quarantineKey: expect.stringMatching(/^quarantine\/[0-9a-f-]+\.webp$/),
        declaredMediaType: "image/webp",
        declaredSizeBytes: 123,
        uploadGenerationId: expect.any(String),
        publicObjectId: expect.any(String),
      }),
    );
    expect(storageMock.createQuarantineUploadUrl).toHaveBeenCalledWith({
      objectKey: expect.stringMatching(/^quarantine\/[0-9a-f-]+\.webp$/),
      contentType: "image/webp",
      contentLength: 123,
      expiresInSeconds: 900,
    });
  });

  it("reuses the exact owner-scoped media generation for retirement retries", async () => {
    const uploadGenerationId = "00000000-0000-4000-8000-000000000322";
    mediaRepositoryMock.findMediaAssetByUploadGeneration.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000010",
      quarantine_key: `quarantine/${uploadGenerationId}.jpeg`,
      declared_media_type: "image/jpeg",
      declared_size_bytes: "123",
      media_readiness_state: "public_ready",
      status: "processed",
    });

    const response = await POST(
      onlineRequest("http://localhost/api/media/uploads", {
        method: "POST",
        body: JSON.stringify({
          contentType: "image/jpeg",
          sizeBytes: 123,
          uploadGenerationId,
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        mediaAssetId: "00000000-0000-4000-8000-000000000010",
        uploadRequired: false,
      }),
    );
    expect(
      mediaRepositoryMock.findMediaAssetByUploadGeneration,
    ).toHaveBeenCalledWith(expect.anything(), uploadGenerationId);
    expect(
      mediaRepositoryMock.createQuarantinedMediaAsset,
    ).not.toHaveBeenCalled();
    expect(storageMock.createQuarantineUploadUrl).not.toHaveBeenCalled();
  });

  it("re-reads the owner-scoped generation after a concurrent unique insert", async () => {
    const uploadGenerationId = "00000000-0000-4000-8000-000000000322";
    const concurrentAsset = {
      id: "00000000-0000-4000-8000-000000000010",
      quarantine_key: `quarantine/${uploadGenerationId}.jpeg`,
      declared_media_type: "image/jpeg",
      declared_size_bytes: "123",
      media_readiness_state: "quarantined",
      status: "quarantined",
    };
    mediaRepositoryMock.findMediaAssetByUploadGeneration
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(concurrentAsset);
    mediaRepositoryMock.createQuarantinedMediaAsset.mockRejectedValueOnce({
      code: "23505",
    });

    const response = await POST(
      onlineRequest("http://localhost/api/media/uploads", {
        method: "POST",
        body: JSON.stringify({
          contentType: "image/jpeg",
          sizeBytes: 123,
          uploadGenerationId,
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        mediaAssetId: concurrentAsset.id,
        uploadRequired: true,
      }),
    );
    expect(storageMock.createQuarantineUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ objectKey: concurrentAsset.quarantine_key }),
    );
  });

  it("does not misclassify a repository outage as an idempotency conflict", async () => {
    mediaRepositoryMock.createQuarantinedMediaAsset.mockRejectedValueOnce({
      code: "57P01",
    });

    const response = await POST(
      onlineRequest("http://localhost/api/media/uploads", {
        method: "POST",
        body: JSON.stringify({ contentType: "image/jpeg", sizeBytes: 123 }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "media_upload_unavailable",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects missing and oversized byte contracts before creating quarantine rows", async () => {
    const missing = await POST(
      onlineRequest("http://localhost/api/media/uploads", {
        method: "POST",
        body: JSON.stringify({ contentType: "image/jpeg" }),
      }),
    );
    const oversized = await POST(
      onlineRequest("http://localhost/api/media/uploads", {
        method: "POST",
        body: JSON.stringify({
          contentType: "image/jpeg",
          sizeBytes: 12 * 1024 * 1024 + 1,
        }),
      }),
    );

    expect(missing.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(
      mediaRepositoryMock.createQuarantinedMediaAsset,
    ).not.toHaveBeenCalled();
  });
});

function onlineRequest(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set(ONLINE_JOURNAL_PROTOCOL_HEADER, ONLINE_JOURNAL_PROTOCOL);
  return new Request(input, { ...init, headers });
}
