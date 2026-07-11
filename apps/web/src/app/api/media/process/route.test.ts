import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  requireCurrentUserId: vi.fn(
    async () => "00000000-0000-0000-0000-000000000001",
  ),
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
  markMediaAssetProcessed: vi.fn(),
}));

vi.mock("@/server/auth-session", () => authMock);
vi.mock("@/server/auth-intent-http", () => authIntentMock);
vi.mock("@/server/media/media-repository", () => mediaRepositoryMock);
vi.mock("@/server/media/processor", () => ({
  processQuarantinedImage: vi.fn(),
}));

import { POST } from "./route";

describe("media process API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an opaque authentication intent before reading a private media id", async () => {
    authMock.requireCurrentUserId.mockRejectedValueOnce(
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
    authMock.requireCurrentUserId.mockRejectedValueOnce(
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
});
