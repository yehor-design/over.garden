import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentRequestScope: vi.fn(),
  updateUserPublicHandle: vi.fn(),
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

describe("public handle profile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentRequestScope.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    });
    mocks.updateUserPublicHandle.mockResolvedValue({
      status: "updated",
      profile: {
        handle: "green_thumb",
        display_name: null,
        avatar_url: null,
      },
    });
  });

  it("updates through the signed-in scope and revalidates private plus public paths", async () => {
    const { updatePublicHandleAction } = await import("./actions");
    const formData = new FormData();
    formData.set("handle", "@green_thumb");

    await updatePublicHandleAction(formData);

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
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/@green_thumb");
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/garden/profile?status=updated",
    );
  });

  it("turns deterministic validation failures into user-facing status params", async () => {
    mocks.updateUserPublicHandle.mockResolvedValueOnce({
      status: "blocked",
      profile: {
        handle: "green_thumb",
        display_name: null,
        avatar_url: null,
      },
    });
    const { updatePublicHandleAction } = await import("./actions");
    const formData = new FormData();
    formData.set("handle", "nazi_garden");

    await updatePublicHandleAction(formData);

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/garden/profile?status=blocked",
    );
  });
});
