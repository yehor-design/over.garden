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

const mediaRepositoryMock = vi.hoisted(() => ({
  getMediaAssetForOwner: vi.fn(),
  markMediaAssetFailed: vi.fn(),
  markMediaAssetOriginalDeleted: vi.fn(),
  markMediaAssetProcessed: vi.fn(),
}));

const processorMock = vi.hoisted(() => ({
  processQuarantinedImage: vi.fn(),
}));

const storageMock = vi.hoisted(() => ({
  deleteQuarantineObject: vi.fn(),
  getPublicDerivativeUrl: vi.fn(
    (key: string) => `https://media.over.garden/${key}`,
  ),
}));

vi.mock("@/server/auth-session", () => authMock);
vi.mock("@/server/pilot-write-access", () => pilotMock);
vi.mock("@/server/auth-intent-http", () => authIntentMock);
vi.mock("@/server/media/media-repository", () => mediaRepositoryMock);
vi.mock("@/server/media/processor", () => processorMock);
vi.mock("@/lib/storage", () => storageMock);

import { POST } from "./route";

describe("media process API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an opaque authentication intent before reading a private media id", async () => {
    pilotMock.requireWriteEligibleRequestScope.mockRejectedValueOnce(
      new authMock.AuthenticationRequiredError(),
    );
    const request = new Request("http://localhost/api/media/process", {
      method: "POST",
      headers: {
        "x-overgarden-auth-return":
          "/garden/objects/00000000-0000-4000-8000-000000000201",
      },
      body: JSON.stringify({
        mediaAssetId: "00000000-0000-4000-8000-000000000099",
      }),
    });
    const response = await POST(request);
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(401);
    expect(authIntentMock.authIntentRequiredResponse).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ action: "save", fallbackReturnTo: "/garden" }),
    );
    expect(serialized).toContain("opaque-media-intent");
    expect(serialized).not.toContain("00000000-0000-4000-8000-000000000099");
    expect(mediaRepositoryMock.getMediaAssetForOwner).not.toHaveBeenCalled();
  });

  it("does not misclassify an operational authentication failure", async () => {
    pilotMock.requireWriteEligibleRequestScope.mockRejectedValueOnce(
      new Error("session storage unavailable"),
    );

    await expect(
      POST(
        new Request("http://localhost/api/media/process", {
          method: "POST",
          body: JSON.stringify({ mediaAssetId: "media-1" }),
        }),
      ),
    ).rejects.toThrow("session storage unavailable");
    expect(authIntentMock.authIntentRequiredResponse).not.toHaveBeenCalled();
  });

  it("rejects authenticated users who are outside the closed pilot", async () => {
    pilotMock.requireWriteEligibleRequestScope.mockRejectedValueOnce(
      new pilotMock.PilotWriteAccessError("Invite required."),
    );

    const response = await POST(
      new Request("http://localhost/api/media/process", {
        method: "POST",
        body: JSON.stringify({ mediaAssetId: "media-1" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mediaRepositoryMock.getMediaAssetForOwner).not.toHaveBeenCalled();
  });

  it("persists processed state before deleting the quarantine original", async () => {
    const calls: string[] = [];
    const asset = {
      id: "media-1",
      owner_user_id: "00000000-0000-0000-0000-000000000001",
      quarantine_key: "quarantine/user/photo.jpg",
      derivative_key: null,
      status: "quarantined",
    };
    mediaRepositoryMock.getMediaAssetForOwner.mockResolvedValue(asset);
    processorMock.processQuarantinedImage.mockImplementation(async () => {
      calls.push("put-derivative");
      return {
        derivativeKey: "derivatives/user/photo.webp",
        publicUrl: "https://media.over.garden/derivatives/user/photo.webp",
      };
    });
    mediaRepositoryMock.markMediaAssetProcessed.mockImplementation(async () => {
      calls.push("mark-processed");
      return {
        ...asset,
        derivative_key: "derivatives/user/photo.webp",
        status: "processed",
      };
    });
    storageMock.deleteQuarantineObject.mockImplementation(async () => {
      calls.push("delete-original");
    });
    mediaRepositoryMock.markMediaAssetOriginalDeleted.mockImplementation(
      async () => {
        calls.push("mark-original-deleted");
        return { ...asset, status: "processed" };
      },
    );

    const response = await POST(
      new Request("http://localhost/api/media/process", {
        method: "POST",
        body: JSON.stringify({ mediaAssetId: asset.id }),
      }),
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      "put-derivative",
      "mark-processed",
      "delete-original",
      "mark-original-deleted",
    ]);
  });

  it("retries only original cleanup when derivative state is already durable", async () => {
    const asset = {
      id: "media-1",
      owner_user_id: "00000000-0000-0000-0000-000000000001",
      quarantine_key: "quarantine/user/photo.jpg",
      derivative_key: "derivatives/user/photo.webp",
      status: "processed",
      original_deleted_at: null,
    };
    mediaRepositoryMock.getMediaAssetForOwner.mockResolvedValue(asset);
    mediaRepositoryMock.markMediaAssetOriginalDeleted.mockResolvedValue({
      ...asset,
      original_deleted_at: new Date(),
    });

    const response = await POST(
      new Request("http://localhost/api/media/process", {
        method: "POST",
        body: JSON.stringify({ mediaAssetId: asset.id }),
      }),
    );

    expect(response.status).toBe(200);
    expect(processorMock.processQuarantinedImage).not.toHaveBeenCalled();
    expect(storageMock.deleteQuarantineObject).toHaveBeenCalledWith(
      asset.quarantine_key,
    );
    expect(mediaRepositoryMock.markMediaAssetFailed).not.toHaveBeenCalled();
  });
});
