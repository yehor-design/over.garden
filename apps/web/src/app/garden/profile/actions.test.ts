import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentRequestScope: vi.fn(),
  updateUserPublicHandle: vi.fn(),
  updateOwnerPublicProfile: vi.fn(),
  unblockProfileByBlockId: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/server/auth-session", () => ({
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));

vi.mock("@/server/public-profile-repository", () => ({
  updateUserPublicHandle: mocks.updateUserPublicHandle,
}));

vi.mock("@/server/owner-profile-repository", () => ({
  updateOwnerPublicProfile: mocks.updateOwnerPublicProfile,
}));

vi.mock("@/server/profile-interaction-repository", () => ({
  unblockProfileByBlockId: mocks.unblockProfileByBlockId,
}));

describe("public handle profile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentRequestScope.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    });
    mocks.updateUserPublicHandle.mockResolvedValue({
      status: "updated",
      previousHandle: "gardener_0123456789abcdef",
      nextEligibleAt: new Date("2026-08-17T10:00:00.000Z"),
      profile: {
        handle: "green_thumb",
        display_name: null,
        avatar_url: null,
      },
    });
    mocks.updateOwnerPublicProfile.mockResolvedValue({
      status: "updated",
      profile: { handle: "green_thumb" },
    });
    mocks.unblockProfileByBlockId.mockResolvedValue("unblocked");
  });

  it("updates through the signed-in scope and revalidates private plus public paths", async () => {
    const { updatePublicHandleAction } = await import("./actions");
    const formData = new FormData();
    formData.set("handle", "@green_thumb");

    const result = await updatePublicHandleAction(
      {
        status: null,
        currentHandle: "gardener_0123456789abcdef",
        nextEligibleAt: "2026-07-18T10:00:00.000Z",
      },
      formData,
    );

    expect(mocks.requireCurrentRequestScope).toHaveBeenCalledOnce();
    expect(mocks.updateUserPublicHandle).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      "@green_thumb",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden/profile");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/@gardener_0123456789abcdef",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/bg/@gardener_0123456789abcdef",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/ru/@gardener_0123456789abcdef",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/@green_thumb");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/bg/@green_thumb");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ru/@green_thumb");
    expect(result).toEqual({
      status: "updated",
      currentHandle: "green_thumb",
      nextEligibleAt: "2026-08-17T10:00:00.000Z",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("turns deterministic validation failures into user-facing status params", async () => {
    mocks.updateUserPublicHandle.mockResolvedValueOnce({
      status: "unavailable",
      previousHandle: "green_thumb",
      nextEligibleAt: null,
      profile: {
        handle: "green_thumb",
        display_name: null,
        avatar_url: null,
      },
    });
    const { updatePublicHandleAction } = await import("./actions");
    const formData = new FormData();
    formData.set("handle", "nazi_garden");

    const result = await updatePublicHandleAction(
      {
        status: null,
        currentHandle: "green_thumb",
        nextEligibleAt: "2099-01-01T00:00:00.000Z",
      },
      formData,
    );

    expect(result).toEqual({
      status: "unavailable",
      currentHandle: "green_thumb",
      nextEligibleAt: null,
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("updates bounded public settings through the owner repository", async () => {
    const { updatePublicProfileAction } = await import("./actions");
    const formData = new FormData();
    formData.set("avatarMediaAssetId", "00000000-0000-4000-8000-000000000111");
    formData.set("displayName", "Olena");
    formData.set("bio", "Dated observations.");
    formData.append("languages", "uk");
    formData.append("languages", "en");
    formData.set("locationVisibility", "region");
    formData.set("coarseRegionCode", "UA-32");
    formData.set("profileVisibility", "public");
    formData.set("relationshipVisibility", "counts");

    await updatePublicProfileAction(formData);

    expect(mocks.updateOwnerPublicProfile).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      {
        avatarMediaAssetId: "00000000-0000-4000-8000-000000000111",
        displayName: "Olena",
        bio: "Dated observations.",
        languages: ["uk", "en"],
        locationVisibility: "region",
        coarseRegionCode: "UA-32",
        profileVisibility: "public",
        relationshipVisibility: "counts",
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/@green_thumb");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/bg/@green_thumb");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ru/@green_thumb");
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/garden/profile?status=updated#public-profile-editor",
    );
  });

  it("unblocks only through signed-in owner scope", async () => {
    const { unblockProfileAction } = await import("./actions");
    const formData = new FormData();
    formData.set("blockId", "00000000-0000-4000-8000-000000000222");

    await unblockProfileAction(formData);

    expect(mocks.unblockProfileByBlockId).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      "00000000-0000-4000-8000-000000000222",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/garden/profile?relationshipStatus=unblocked#blocked-profiles",
    );
  });
});
