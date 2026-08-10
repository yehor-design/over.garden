import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
}));

const pilotMock = vi.hoisted(() => ({
  PilotWriteAccessError: class PilotWriteAccessError extends Error {},
  requireWriteEligibleRequestScope: vi.fn(async () => ({
    userId: "00000000-0000-0000-0000-000000000001",
    sessionId: "session-1",
  })),
}));

const mediaRepositoryMock = vi.hoisted(() => ({
  createQuarantinedMediaAsset: vi.fn(async () => ({
    id: "00000000-0000-0000-0000-000000000010",
  })),
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
vi.mock("@/server/pilot-write-access", () => pilotMock);
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
    const request = new Request("http://localhost/api/media/uploads", {
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

  it("rejects attempts to pre-bind quarantined media to a journal entry", async () => {
    const response = await POST(
      new Request("http://localhost/api/media/uploads", {
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
      new Request("http://localhost/api/media/uploads", {
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

  it("rejects missing and oversized byte contracts before creating quarantine rows", async () => {
    const missing = await POST(
      new Request("http://localhost/api/media/uploads", {
        method: "POST",
        body: JSON.stringify({ contentType: "image/jpeg" }),
      }),
    );
    const oversized = await POST(
      new Request("http://localhost/api/media/uploads", {
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
