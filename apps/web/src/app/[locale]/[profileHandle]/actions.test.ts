import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentRequestScope: vi.fn(),
  admitDocumentMutation: vi.fn(),
  followProfile: vi.fn(),
  unfollowProfile: vi.fn(),
  blockProfile: vi.fn(),
  reportProfile: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth-session", () => ({
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));
vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: mocks.admitDocumentMutation,
  documentMutationGenerationFromFormData: vi.fn(() => null),
}));
vi.mock("@/server/profile-interaction-repository", () => ({
  followProfile: mocks.followProfile,
  unfollowProfile: mocks.unfollowProfile,
  blockProfile: mocks.blockProfile,
  reportProfile: mocks.reportProfile,
}));

describe("localized public profile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentRequestScope.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    });
    mocks.admitDocumentMutation.mockImplementation(async () => ({
      status: "admitted",
      scope: await mocks.requireCurrentRequestScope(),
    }));
    mocks.followProfile.mockResolvedValue("followed");
    mocks.unfollowProfile.mockResolvedValue("unfollowed");
    mocks.blockProfile.mockResolvedValue("blocked");
    mocks.reportProfile.mockResolvedValue("reported");
  });

  it("follows and unfollows the exact profile through authenticated scope", async () => {
    const { followProfileAction, unfollowProfileAction } =
      await import("./actions");
    const formData = profileFormData("bg");

    await followProfileAction(formData);
    await unfollowProfileAction(formData);

    const scope = {
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    };
    expect(mocks.followProfile).toHaveBeenCalledWith(scope, "demo_olena");
    expect(mocks.unfollowProfile).toHaveBeenCalledWith(scope, "demo_olena");
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/bg/@demo_olena?profileAction=followed#profile-follow",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/bg/@demo_olena?profileAction=unfollowed#profile-follow",
    );
  });

  it("reports only an allowlisted reason and returns to the safety control", async () => {
    const { reportProfileAction } = await import("./actions");
    const formData = profileFormData("ru");
    formData.set("reason", "privacy");

    await reportProfileAction(formData);

    expect(mocks.reportProfile).toHaveBeenCalledWith(
      expect.any(Object),
      "demo_olena",
      "privacy",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/ru/@demo_olena?profileAction=reported#profile-report",
    );
  });

  it("blocks transactionally and returns to owner block management", async () => {
    const { blockProfileAction } = await import("./actions");
    const formData = profileFormData("uk");

    await blockProfileAction(formData);

    expect(mocks.blockProfile).toHaveBeenCalledWith(
      expect.any(Object),
      "demo_olena",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/garden/profile?relationshipStatus=blocked#blocked-profiles",
    );
  });

  it("normalizes malformed locale and unavailable targets without open redirects", async () => {
    mocks.followProfile.mockResolvedValueOnce("unavailable");
    const { followProfileAction } = await import("./actions");
    const formData = profileFormData("https://attacker.example");

    await followProfileAction(formData);

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/@demo_olena?profileAction=unavailable#profile-follow",
    );
  });
});

function profileFormData(locale: string) {
  const formData = new FormData();
  formData.set("handle", "@demo_olena");
  formData.set("locale", locale);
  return formData;
}
