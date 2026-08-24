import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentRequestScope: vi.fn(),
  admitDocumentMutation: vi.fn(),
  moderateCommunityContribution: vi.fn(),
  moderateCommunityDiscussion: vi.fn(),
  moderateCommunityMembership: vi.fn(),
  resolveCommunityReport: vi.fn(),
  setCommunityParticipation: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  resolveAdminCapabilityAccessBounded: vi.fn(),
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
vi.mock("@/server/admin-access", () => ({
  resolveAdminCapabilityAccessBounded:
    mocks.resolveAdminCapabilityAccessBounded,
}));
vi.mock("@/server/community-repository", () => ({
  moderateCommunityContribution: mocks.moderateCommunityContribution,
  moderateCommunityDiscussion: mocks.moderateCommunityDiscussion,
  moderateCommunityMembership: mocks.moderateCommunityMembership,
  resolveCommunityReport: mocks.resolveCommunityReport,
  setCommunityParticipation: mocks.setCommunityParticipation,
}));

const scope = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};

describe("community moderator actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => undefined);
    mocks.requireCurrentRequestScope.mockResolvedValue(scope);
    mocks.admitDocumentMutation.mockImplementation(async () => ({
      status: "admitted",
      scope: await mocks.requireCurrentRequestScope(),
    }));
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "allowed",
    });
    for (const operation of [
      mocks.moderateCommunityContribution,
      mocks.moderateCommunityDiscussion,
      mocks.moderateCommunityMembership,
      mocks.resolveCommunityReport,
      mocks.setCommunityParticipation,
    ]) {
      operation.mockResolvedValue({ state: "updated" });
    }
  });

  it("passes exact targets and an allowlisted reason through authenticated moderator scope", async () => {
    const {
      moderateCommunityContributionAction,
      moderateCommunityDiscussionAction,
      moderateCommunityMembershipAction,
      resolveCommunityReportAction,
      setCommunityParticipationAction,
    } = await import("./actions");
    const formData = moderatorFormData();

    await moderateCommunityContributionAction(formData);
    await moderateCommunityDiscussionAction(formData);
    await moderateCommunityMembershipAction(formData);
    await resolveCommunityReportAction(formData);
    await setCommunityParticipationAction(formData);

    expect(mocks.moderateCommunityContribution).toHaveBeenCalledWith(scope, {
      slug: "observation-and-care",
      contributionId: "00000000-0000-4000-8000-000000000201",
      state: "removed",
      reason: "privacy",
    });
    expect(mocks.moderateCommunityDiscussion).toHaveBeenCalledWith(scope, {
      slug: "observation-and-care",
      contributionId: "00000000-0000-4000-8000-000000000201",
      state: "closed",
      reason: "privacy",
    });
    expect(mocks.moderateCommunityMembership).toHaveBeenCalledWith(scope, {
      slug: "observation-and-care",
      membershipId: "00000000-0000-4000-8000-000000000301",
      state: "banned",
      reason: "privacy",
    });
    expect(mocks.resolveCommunityReport).toHaveBeenCalledWith(scope, {
      slug: "observation-and-care",
      reportId: "00000000-0000-4000-8000-000000000401",
      state: "actioned",
      reason: "privacy",
    });
    expect(mocks.setCommunityParticipation).toHaveBeenCalledWith(scope, {
      slug: "observation-and-care",
      state: "closed",
      reason: "privacy",
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/account/communities/observation-and-care?moderationAction=updated#moderation-queue",
    );
    expect(mocks.resolveAdminCapabilityAccessBounded).toHaveBeenCalledTimes(5);
  });

  it("does not convert the framework redirect into a false unavailable result", async () => {
    const { moderateCommunityDiscussionAction } = await import("./actions");
    const formData = moderatorFormData();
    mocks.redirect.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(moderateCommunityDiscussionAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/account/communities/observation-and-care?moderationAction=updated#moderation-queue",
    );
  });

  it("denies an admitted ordinary actor before any moderation effect", async () => {
    const { moderateCommunityContributionAction } = await import("./actions");
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "timed_out",
    });

    await moderateCommunityContributionAction(moderatorFormData());

    expect(mocks.moderateCommunityContribution).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/account/communities/observation-and-care?moderationAction=unavailable#moderation-queue",
    );
  });
});

function moderatorFormData() {
  const formData = new FormData();
  formData.set("slug", "observation-and-care");
  formData.set("contributionId", "00000000-0000-4000-8000-000000000201");
  formData.set("membershipId", "00000000-0000-4000-8000-000000000301");
  formData.set("reportId", "00000000-0000-4000-8000-000000000401");
  formData.set("contributionState", "removed");
  formData.set("discussionState", "closed");
  formData.set("membershipState", "banned");
  formData.set("reportState", "actioned");
  formData.set("participationState", "closed");
  formData.set("reason", "privacy");
  return formData;
}
