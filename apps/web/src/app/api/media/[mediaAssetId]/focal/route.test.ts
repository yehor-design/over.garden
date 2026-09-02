import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
  mutationScopeResponse: vi.fn(),
  ownerUserIdFromRequest: vi.fn(),
  findMediaAssetForOwner: vi.fn(),
  updateMediaAssetFocalForOwner: vi.fn(),
  convergePublicProjectionsNow: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath ,
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  mutationScopeResponse: mocks.mutationScopeResponse,
  ownerUserIdFromRequest: mocks.ownerUserIdFromRequest,
}));
vi.mock("@/server/media/media-repository", () => ({
  findMediaAssetForOwner: mocks.findMediaAssetForOwner,
  updateMediaAssetFocalForOwner: mocks.updateMediaAssetFocalForOwner,
}));
vi.mock("@/server/search/public-projection-outbox", () => ({
  convergePublicProjectionsNow: mocks.convergePublicProjectionsNow,
}));

const mediaAssetId = "00000000-0000-4000-8000-000000000330";
const context = { params: Promise.resolve({ mediaAssetId }) };

describe("PATCH /api/media/[mediaAssetId]/focal", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.ownerUserIdFromRequest.mockReturnValue("transport");
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
    });
    mocks.updateMediaAssetFocalForOwner.mockResolvedValue({
      asset: {
        id: mediaAssetId,
        focal_x: "0.25",
        focal_y: "0.75",
        intrinsic_width: 1200,
        intrinsic_height: 800,
      },
      publicSlug: null,
      journalEntryId: null,
      journalRevision: 4,
      visibility: "private",
    });
    mocks.findMediaAssetForOwner.mockResolvedValue({
      id: mediaAssetId,
      intrinsic_width: 1200,
      intrinsic_height: 800,
    });
  });

  it("serves an out-of-range focal point at centre without writing the coerced value", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request(`http://localhost/api/media/${mediaAssetId}/focal`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          focalX: -0.1,
          focalY: 1.1,
          expectedRevision: 3,
        }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mediaAsset: {
        id: mediaAssetId,
        focalX: 0.5,
        focalY: 0.5,
        intrinsicWidth: 1200,
        intrinsicHeight: 800,
      },
      journalRevision: null,
      canonicalMutation: "none",
      serveClass: "clamped",
    });
    expect(mocks.updateMediaAssetFocalForOwner).not.toHaveBeenCalled();
    expect(mocks.findMediaAssetForOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "00000000-0000-4000-8000-000000000001",
      }),
      mediaAssetId,
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.convergePublicProjectionsNow).not.toHaveBeenCalled();
  });

  it("does not serve another owner's media identity on the clamped path", async () => {
    mocks.findMediaAssetForOwner.mockResolvedValueOnce(null);
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request(`http://localhost/api/media/${mediaAssetId}/focal`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ focalX: -0.1, focalY: 1.1 }),
      }),
      context,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Media asset not found." });
    expect(mocks.updateMediaAssetFocalForOwner).not.toHaveBeenCalled();
  });

  it("writes an expressible focal point unchanged and returns exact", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request(`http://localhost/api/media/${mediaAssetId}/focal`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          focalX: 0.25,
          focalY: 0.75,
          expectedRevision: 3,
        }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      mediaAsset: { focalX: 0.25, focalY: 0.75 },
      journalRevision: 4,
      canonicalMutation: "updated",
      serveClass: "exact",
    });
    expect(mocks.updateMediaAssetFocalForOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "00000000-0000-4000-8000-000000000001",
      }),
      {
        mediaAssetId,
        focalX: 0.25,
        focalY: 0.75,
        expectedRevision: 3,
      },
    );
  });

  it("still refuses a focal request that cannot be expressed", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request(`http://localhost/api/media/${mediaAssetId}/focal`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ focalX: "left", focalY: 0.5 }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.updateMediaAssetFocalForOwner).not.toHaveBeenCalled();
  });
});
