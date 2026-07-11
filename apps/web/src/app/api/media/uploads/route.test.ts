import { describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  requireCurrentUserId: vi.fn(
    async () => "00000000-0000-0000-0000-000000000001",
  ),
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

vi.mock("@/server/auth-session", () => authMock);
vi.mock("@/server/media/media-repository", () => mediaRepositoryMock);
vi.mock("@/lib/storage", () => storageMock);
vi.mock("@/server/auth-intent-http", () => authIntentMock);

import { POST } from "./route";

describe("media upload API", () => {
  it("returns an opaque authentication intent before reading a private upload body", async () => {
    authMock.requireCurrentUserId.mockRejectedValueOnce(
      new authMock.AuthenticationRequiredError(),
    );
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
    expect(authIntentMock.authIntentRequiredResponse).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ action: "save", fallbackReturnTo: "/garden" }),
    );
    expect(serialized).toContain("opaque-media-intent");
    expect(serialized).not.toMatch(/private balcony|caption/i);
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
    expect(createMediaCall[1]).toMatch(
      /^quarantine\/00000000-0000-0000-0000-000000000001\/.+\.webp$/,
    );
    expect(storageMock.createQuarantineUploadUrl).toHaveBeenCalledWith({
      objectKey: expect.stringMatching(
        /^quarantine\/00000000-0000-0000-0000-000000000001\/.+\.webp$/,
      ),
      contentType: "image/webp",
    });
  });
});
