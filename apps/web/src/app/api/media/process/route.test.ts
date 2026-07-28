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
  claimMediaAssetForProcessing: vi.fn(),
  findMediaAssetForOwner: vi.fn(),
  markClaimedMediaDerivativeWritten: vi.fn(),
  releaseMediaProcessingClaim: vi.fn(),
  settleClaimedMediaPublicReady: vi.fn(),
}));

const processorMock = vi.hoisted(() => ({
  MediaLaunchQualityError: class MediaLaunchQualityError extends Error {
    readonly code = "media_launch_quality_rejected";
  },
  processQuarantinedImage: vi.fn(),
}));

const storageMock = vi.hoisted(() => ({
  getPublicDerivativeUrl: vi.fn(
    (key: string) => `https://media.over.garden/${key}`,
  ),
}));
const lifecycleMock = vi.hoisted(() => ({
  revokeMediaObjectBytes: vi.fn(async () => ({ outcome: "confirmed_gone" })),
}));

vi.mock("@/server/auth-session", () => authMock);
vi.mock("@/server/pilot-write-access", () => pilotMock);
vi.mock("@/server/auth-intent-http", () => authIntentMock);
vi.mock("@/server/media/media-repository", () => mediaRepositoryMock);
vi.mock("@/server/media/processor", () => processorMock);
vi.mock("@/lib/storage", () => storageMock);
vi.mock("@/server/media/lifecycle-revoke", () => lifecycleMock);

import { POST } from "./route";

describe("media process API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lifecycleMock.revokeMediaObjectBytes.mockResolvedValue({
      outcome: "confirmed_gone",
    });
    mediaRepositoryMock.releaseMediaProcessingClaim.mockResolvedValue(
      undefined,
    );
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
    expect(mediaRepositoryMock.findMediaAssetForOwner).not.toHaveBeenCalled();
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

  it("still maps unexpected write-boundary errors to opaque 403", async () => {
    pilotMock.requireWriteEligibleRequestScope.mockRejectedValueOnce(
      new pilotMock.PilotWriteAccessError("Write boundary failed."),
    );

    const response = await POST(
      new Request("http://localhost/api/media/process", {
        method: "POST",
        body: JSON.stringify({ mediaAssetId: "media-1" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mediaRepositoryMock.findMediaAssetForOwner).not.toHaveBeenCalled();
  });

  it("fences derivative state and proves original absence before readiness", async () => {
    const calls: string[] = [];
    const asset = {
      id: "media-1",
      owner_user_id: "00000000-0000-0000-0000-000000000001",
      quarantine_key: "quarantine/user/photo.jpg",
      derivative_key: null,
      status: "quarantined",
      media_readiness_state: "quarantined",
      upload_generation_id: "generation-1",
    };
    mediaRepositoryMock.findMediaAssetForOwner.mockResolvedValue(asset);
    const claim = {
      asset: { ...asset, media_readiness_state: "processing" },
      claimToken: "claim-1",
      phase: "process_original",
    };
    mediaRepositoryMock.claimMediaAssetForProcessing.mockResolvedValue(claim);
    processorMock.processQuarantinedImage.mockImplementation(async () => {
      calls.push("put-derivative");
      return {
        derivativeKey: "derivatives/opaque.webp",
        admittedMediaType: "image/jpeg",
        intrinsicWidth: 800,
        intrinsicHeight: 600,
      };
    });
    mediaRepositoryMock.markClaimedMediaDerivativeWritten.mockImplementation(async () => {
      calls.push("mark-derivative-written");
      return { ...asset, derivative_key: "derivatives/opaque.webp" };
    });
    lifecycleMock.revokeMediaObjectBytes.mockImplementation(async () => {
      calls.push("prove-original-gone");
      return { outcome: "confirmed_gone" };
    });
    mediaRepositoryMock.settleClaimedMediaPublicReady.mockImplementation(async () => {
      calls.push("settle-public-ready");
      return { ...asset, derivative_key: "derivatives/opaque.webp", status: "processed" };
    });

    const response = await POST(
      new Request("http://localhost/api/media/process", {
        method: "POST",
        body: JSON.stringify({ mediaAssetId: asset.id }),
      }),
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      "put-derivative",
      "mark-derivative-written",
      "prove-original-gone",
      "settle-public-ready",
    ]);
  });

  it("uses one generic denial for absent and foreign owner-scoped assets", async () => {
    mediaRepositoryMock.findMediaAssetForOwner.mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost/api/media/process", {
        method: "POST",
        body: JSON.stringify({ mediaAssetId: "opaque-unavailable-id" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Media asset is unavailable.",
    });
    expect(mediaRepositoryMock.claimMediaAssetForProcessing).not.toHaveBeenCalled();
  });

  it("recovers derivative-written state without reading the deleted original again", async () => {
    const asset = {
      id: "media-1",
      status: "quarantined",
      media_readiness_state: "derivative_written",
      derivative_key: "derivatives/recovery.webp",
      quarantine_key: "quarantine/recovery.jpg",
    };
    mediaRepositoryMock.findMediaAssetForOwner.mockResolvedValue(asset);
    mediaRepositoryMock.claimMediaAssetForProcessing.mockResolvedValue({
      asset,
      claimToken: "recovery-claim",
      phase: "prove_original_absence",
    });
    mediaRepositoryMock.settleClaimedMediaPublicReady.mockResolvedValue({
      ...asset,
      status: "processed",
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
    expect(lifecycleMock.revokeMediaObjectBytes).toHaveBeenCalledWith({
      bucket: "quarantine",
      objectKey: "quarantine/recovery.jpg",
    });
    expect(mediaRepositoryMock.settleClaimedMediaPublicReady).toHaveBeenCalled();
  });

  it("keeps a written derivative recoverable when original absence is indeterminate", async () => {
    const asset = {
      id: "media-1",
      status: "quarantined",
      media_readiness_state: "processing",
      derivative_key: null,
      quarantine_key: "quarantine/opaque.jpg",
    };
    const claim = {
      asset,
      claimToken: "claim-1",
      phase: "process_original",
    };
    mediaRepositoryMock.findMediaAssetForOwner.mockResolvedValue(asset);
    mediaRepositoryMock.claimMediaAssetForProcessing.mockResolvedValue(claim);
    processorMock.processQuarantinedImage.mockResolvedValue({
      derivativeKey: "derivatives/opaque.webp",
      admittedMediaType: "image/jpeg",
      intrinsicWidth: 800,
      intrinsicHeight: 600,
    });
    mediaRepositoryMock.markClaimedMediaDerivativeWritten.mockResolvedValue({
      ...asset,
      derivative_key: "derivatives/opaque.webp",
      media_readiness_state: "derivative_written",
    });
    lifecycleMock.revokeMediaObjectBytes.mockResolvedValue({
      outcome: "indeterminate_transport",
    });

    const response = await POST(
      new Request("http://localhost/api/media/process", {
        method: "POST",
        body: JSON.stringify({ mediaAssetId: asset.id }),
      }),
    );

    expect(response.status).toBe(500);
    expect(mediaRepositoryMock.releaseMediaProcessingClaim).toHaveBeenCalledWith(
      expect.anything(),
      claim,
      false,
    );
    expect(mediaRepositoryMock.settleClaimedMediaPublicReady).not.toHaveBeenCalled();
  });

  it("deletes an unreachable stale derivative when claim settlement loses", async () => {
    const asset = {
      id: "media-1",
      status: "quarantined",
      media_readiness_state: "processing",
      derivative_key: null,
      quarantine_key: "quarantine/opaque.jpg",
    };
    const claim = {
      asset,
      claimToken: "stale-claim",
      phase: "process_original",
    };
    mediaRepositoryMock.findMediaAssetForOwner.mockResolvedValue(asset);
    mediaRepositoryMock.claimMediaAssetForProcessing.mockResolvedValue(claim);
    processorMock.processQuarantinedImage.mockResolvedValue({
      derivativeKey: "derivatives/stale.webp",
      admittedMediaType: "image/jpeg",
      intrinsicWidth: 800,
      intrinsicHeight: 600,
    });
    mediaRepositoryMock.markClaimedMediaDerivativeWritten.mockResolvedValue(
      undefined,
    );

    const response = await POST(
      new Request("http://localhost/api/media/process", {
        method: "POST",
        body: JSON.stringify({ mediaAssetId: asset.id }),
      }),
    );

    expect(response.status).toBe(500);
    expect(lifecycleMock.revokeMediaObjectBytes).toHaveBeenCalledWith({
      bucket: "public_derivative",
      objectKey: "derivatives/stale.webp",
    });
    expect(mediaRepositoryMock.settleClaimedMediaPublicReady).not.toHaveBeenCalled();
  });

  it("returns an idempotent receipt when media is already public-ready", async () => {
    const asset = {
      id: "media-1",
      owner_user_id: "00000000-0000-0000-0000-000000000001",
      quarantine_key: "quarantine/user/photo.jpg",
      derivative_key: "derivatives/user/photo.webp",
      status: "processed",
      original_deleted_at: new Date(),
      media_readiness_state: "public_ready",
      public_object_id: "00000000-0000-4000-8000-000000000011",
      revoked_at: null,
    };
    mediaRepositoryMock.findMediaAssetForOwner.mockResolvedValue(asset);

    const response = await POST(
      new Request("http://localhost/api/media/process", {
        method: "POST",
        body: JSON.stringify({ mediaAssetId: asset.id }),
      }),
    );

    expect(response.status).toBe(200);
    expect(processorMock.processQuarantinedImage).not.toHaveBeenCalled();
    expect(mediaRepositoryMock.claimMediaAssetForProcessing).not.toHaveBeenCalled();
  });
});
