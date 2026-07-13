import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentRequestScope: vi.fn(),
  setCommunityMembership: vi.fn(),
  contributePublicJournalToCommunity: vi.fn(),
  reportCommunityContribution: vi.fn(),
  blockCommunityContributionAuthor: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth-session", () => ({
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));
vi.mock("@/server/community-repository", () => ({
  setCommunityMembership: mocks.setCommunityMembership,
  contributePublicJournalToCommunity: mocks.contributePublicJournalToCommunity,
  reportCommunityContribution: mocks.reportCommunityContribution,
  blockCommunityContributionAuthor: mocks.blockCommunityContributionAuthor,
}));

const scope = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};

describe("community actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => undefined);
    mocks.requireCurrentRequestScope.mockResolvedValue(scope);
    mocks.setCommunityMembership.mockResolvedValue({ state: "active" });
    mocks.contributePublicJournalToCommunity.mockResolvedValue({
      contributionId: "00000000-0000-4000-8000-000000000201",
    });
    mocks.reportCommunityContribution.mockResolvedValue({
      reportId: "00000000-0000-4000-8000-000000000301",
    });
    mocks.blockCommunityContributionAuthor.mockResolvedValue({
      authorHandle: "demo_olena",
    });
  });

  it("joins and contributes through exact authenticated actor scope", async () => {
    const { setCommunityMembershipAction, contributeJournalToCommunityAction } =
      await import("./actions");
    const formData = communityFormData("bg");
    formData.set("membershipState", "active");
    formData.set("journalEntryId", "00000000-0000-4000-8000-000000000401");

    await setCommunityMembershipAction(formData);
    await contributeJournalToCommunityAction(formData);

    expect(mocks.setCommunityMembership).toHaveBeenCalledWith(scope, {
      slug: "observation-and-care",
      state: "active",
    });
    expect(mocks.contributePublicJournalToCommunity).toHaveBeenCalledWith(
      scope,
      {
        slug: "observation-and-care",
        journalEntryId: "00000000-0000-4000-8000-000000000401",
      },
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/bg/communities/observation-and-care?communityAction=joined#community-membership",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/bg/communities/observation-and-care?communityAction=contributed#community-contribute",
    );
  });

  it("reports and blocks the exact canonical contribution", async () => {
    const {
      reportCommunityContributionAction,
      blockCommunityContributionAuthorAction,
    } = await import("./actions");
    const formData = communityFormData("ru");
    formData.set("contributionId", "00000000-0000-4000-8000-000000000201");
    formData.set("reason", "privacy");

    await reportCommunityContributionAction(formData);
    await blockCommunityContributionAuthorAction(formData);

    expect(mocks.reportCommunityContribution).toHaveBeenCalledWith(scope, {
      slug: "observation-and-care",
      contributionId: "00000000-0000-4000-8000-000000000201",
      reason: "privacy",
    });
    expect(mocks.blockCommunityContributionAuthor).toHaveBeenCalledWith(scope, {
      slug: "observation-and-care",
      contributionId: "00000000-0000-4000-8000-000000000201",
    });
  });

  it("does not convert the framework redirect into a false unavailable result", async () => {
    const { setCommunityMembershipAction } = await import("./actions");
    const formData = communityFormData("uk");
    formData.set("membershipState", "active");
    mocks.redirect.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(setCommunityMembershipAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/communities/observation-and-care?communityAction=joined#community-membership",
    );
  });
});

function communityFormData(locale: string) {
  const formData = new FormData();
  formData.set("locale", locale);
  formData.set("slug", "observation-and-care");
  return formData;
}
