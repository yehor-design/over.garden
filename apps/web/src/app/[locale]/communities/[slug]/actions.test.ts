import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CommunityMutationRefusal } from "@/server/community-repository";

const mocks = vi.hoisted(() => {
  /**
   * The repository's refusal, faked: the action tells a rule that refused
   * from any other failure only by this class, so the mock carries one of its
   * own and `communityMutationRefusal` reads it the way the real one does.
   */
  class CommunityMutationError extends Error {
    constructor(readonly refusal: CommunityMutationRefusal) {
      super(`Community mutation refused: ${refusal}.`);
      this.name = "CommunityMutationError";
    }
  }
  return {
    CommunityMutationError,
    requireCurrentRequestScope: vi.fn(),
    resolveMutationScope: vi.fn(),
    setCommunityMembership: vi.fn(),
    contributePublicJournalToCommunity: vi.fn(),
    reportCommunityContribution: vi.fn(),
    blockCommunityContributionAuthor: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath ,
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth-session", () => ({
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: vi.fn(() => null),
}));
vi.mock("@/server/community-repository", () => ({
  communityMutationRefusal: (error: unknown) =>
    error instanceof mocks.CommunityMutationError ? error.refusal : null,
  setCommunityMembership: mocks.setCommunityMembership,
  contributePublicJournalToCommunity: mocks.contributePublicJournalToCommunity,
  reportCommunityContribution: mocks.reportCommunityContribution,
  blockCommunityContributionAuthor: mocks.blockCommunityContributionAuthor,
}));

const scope = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};
const entryId = "00000000-0000-4000-8000-0000000004ab";

/** Every refusal the repository can name, and the word the reader gets. */
const refusalWording: [CommunityMutationRefusal, string][] = [
  ["participation_closed", "closed"],
  ["membership_required", "not_member"],
  ["membership_banned", "banned"],
  ["entry_not_eligible", "not_eligible"],
  ["entry_already_added", "already_added"],
  ["entry_removed", "removed"],
  ["community_unavailable", "community_unavailable"],
  // A moderator's rule and a vanished target have no step to point to on
  // this page; they read as "unavailable", as anything else does.
  ["moderation_denied", "unavailable"],
  ["target_unavailable", "unavailable"],
];

describe("community actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => undefined);
    mocks.requireCurrentRequestScope.mockResolvedValue(scope);
    mocks.resolveMutationScope.mockImplementation(async () => ({
      status: "admitted",
      scope: await mocks.requireCurrentRequestScope(),
    }));
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
    formData.set("journalEntryId", entryId);

    await setCommunityMembershipAction(undefined, formData);
    await contributeJournalToCommunityAction(undefined, formData);

    expect(mocks.setCommunityMembership).toHaveBeenCalledWith(scope, {
      slug: "observation-and-care",
      state: "active",
    });
    expect(mocks.contributePublicJournalToCommunity).toHaveBeenCalledWith(
      scope,
      {
        slug: "observation-and-care",
        journalEntryId: entryId,
      },
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/bg/communities/observation-and-care?communityAction=joined#community-membership",
    );
    // The contribution step reports its own outcome in place, under its own
    // key; an added entry is done, so nothing is offered again.
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/bg/communities/observation-and-care?contributeAction=contributed#community-contribute",
    );
  });

  it.each(refusalWording)(
    "words a contribution refused as %s and keeps the entry chosen for a one-press retry",
    async (refusal, status) => {
      const { contributeJournalToCommunityAction } = await import("./actions");
      const formData = communityFormData("bg");
      // As a browser may post it: the step's own value, uppercased and padded.
      formData.set("journalEntryId", ` ${entryId.toUpperCase()} `);
      mocks.contributePublicJournalToCommunity.mockRejectedValueOnce(
        new mocks.CommunityMutationError(refusal),
      );

      await contributeJournalToCommunityAction(undefined, formData);

      expect(mocks.redirect).toHaveBeenCalledTimes(1);
      expect(mocks.redirect).toHaveBeenCalledWith(
        `/bg/communities/observation-and-care?contributeAction=${status}&contribute=${entryId}#community-contribute`,
      );
    },
  );

  it("still says unavailable, with a retry, when something other than a rule failed", async () => {
    const { contributeJournalToCommunityAction } = await import("./actions");
    const formData = communityFormData("uk");
    formData.set("journalEntryId", entryId);
    mocks.contributePublicJournalToCommunity.mockRejectedValueOnce(
      new Error("Connection terminated unexpectedly"),
    );

    await contributeJournalToCommunityAction(undefined, formData);

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/communities/observation-and-care?contributeAction=unavailable&contribute=${entryId}#community-contribute`,
    );
  });

  it("never echoes a posted entry id that could not be one", async () => {
    const { contributeJournalToCommunityAction } = await import("./actions");
    const formData = communityFormData("ru");
    formData.set("journalEntryId", "../../garden?x=<script>");
    mocks.contributePublicJournalToCommunity.mockRejectedValueOnce(
      new mocks.CommunityMutationError("entry_not_eligible"),
    );

    await contributeJournalToCommunityAction(undefined, formData);

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/ru/communities/observation-and-care?contributeAction=not_eligible#community-contribute",
    );
  });

  it("returns a join made from the contribution step to that step, with the entry still offered first", async () => {
    const { setCommunityMembershipAction } = await import("./actions");
    const formData = communityFormData("bg");
    formData.set("membershipState", "active");
    formData.set("returnAnchor", "community-contribute");
    formData.set("contribute", entryId);

    await setCommunityMembershipAction(undefined, formData);

    expect(mocks.setCommunityMembership).toHaveBeenCalledWith(scope, {
      slug: "observation-and-care",
      state: "active",
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/bg/communities/observation-and-care?contributeAction=joined&contribute=${entryId}#community-contribute`,
    );
  });

  it("words a refused join from the contribution step there, still carrying the entry", async () => {
    const { setCommunityMembershipAction } = await import("./actions");
    for (const [refusal, status] of [
      ["membership_banned", "banned"],
      ["participation_closed", "closed"],
    ] as const) {
      mocks.redirect.mockClear();
      const formData = communityFormData("bg");
      formData.set("membershipState", "active");
      formData.set("returnAnchor", "community-contribute");
      formData.set("contribute", entryId);
      mocks.setCommunityMembership.mockRejectedValueOnce(
        new mocks.CommunityMutationError(refusal),
      );

      await setCommunityMembershipAction(undefined, formData);

      expect(mocks.redirect).toHaveBeenCalledWith(
        `/bg/communities/observation-and-care?contributeAction=${status}&contribute=${entryId}#community-contribute`,
      );
    }
  });

  it("drops a carried entry that could not be an id, and an anchor the page does not have", async () => {
    const { setCommunityMembershipAction } = await import("./actions");
    const fromStep = communityFormData("bg");
    fromStep.set("membershipState", "active");
    fromStep.set("returnAnchor", "community-contribute");
    fromStep.set("contribute", "javascript:alert(1)");

    await setCommunityMembershipAction(undefined, fromStep);

    expect(mocks.redirect).toHaveBeenLastCalledWith(
      "/bg/communities/observation-and-care?contributeAction=joined#community-contribute",
    );

    // Only the contribution step may send the reader somewhere else; any
    // other anchor is the membership control's own.
    const elsewhere = communityFormData("bg");
    elsewhere.set("membershipState", "active");
    elsewhere.set("returnAnchor", "comments");

    await setCommunityMembershipAction(undefined, elsewhere);

    expect(mocks.redirect).toHaveBeenLastCalledWith(
      "/bg/communities/observation-and-care?communityAction=joined#community-membership",
    );
  });

  it("words a refused join from the page head under the page's own key", async () => {
    const { setCommunityMembershipAction } = await import("./actions");
    const formData = communityFormData("uk");
    formData.set("membershipState", "active");
    mocks.setCommunityMembership.mockRejectedValueOnce(
      new mocks.CommunityMutationError("participation_closed"),
    );

    await setCommunityMembershipAction(undefined, formData);

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/communities/observation-and-care?communityAction=closed#community-membership",
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

    await reportCommunityContributionAction(undefined, formData);
    await blockCommunityContributionAuthorAction(undefined, formData);

    expect(mocks.reportCommunityContribution).toHaveBeenCalledWith(scope, {
      slug: "observation-and-care",
      contributionId: "00000000-0000-4000-8000-000000000201",
      reason: "privacy",
    });
    expect(mocks.blockCommunityContributionAuthor).toHaveBeenCalledWith(scope, {
      slug: "observation-and-care",
      contributionId: "00000000-0000-4000-8000-000000000201",
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/ru/communities/observation-and-care?communityAction=reported#community-journals",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/ru/communities/observation-and-care?communityAction=blocked#community-journals",
    );
  });

  it("words a refused report or block where the entry is, and carries no entry", async () => {
    const {
      reportCommunityContributionAction,
      blockCommunityContributionAuthorAction,
    } = await import("./actions");
    const formData = communityFormData("bg");
    formData.set("contributionId", "00000000-0000-4000-8000-000000000201");
    formData.set("reason", "spam");
    formData.set("contribute", entryId);
    mocks.reportCommunityContribution.mockRejectedValueOnce(
      new mocks.CommunityMutationError("community_unavailable"),
    );
    mocks.blockCommunityContributionAuthor.mockRejectedValueOnce(
      new mocks.CommunityMutationError("target_unavailable"),
    );

    await reportCommunityContributionAction(undefined, formData);
    await blockCommunityContributionAuthorAction(undefined, formData);

    expect(mocks.redirect).toHaveBeenNthCalledWith(
      1,
      "/bg/communities/observation-and-care?communityAction=community_unavailable#community-journals",
    );
    expect(mocks.redirect).toHaveBeenNthCalledWith(
      2,
      "/bg/communities/observation-and-care?communityAction=unavailable#community-journals",
    );
  });

  it("does not convert the framework redirect into a false unavailable result", async () => {
    const { setCommunityMembershipAction } = await import("./actions");
    const formData = communityFormData("uk");
    formData.set("membershipState", "active");
    mocks.redirect.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(setCommunityMembershipAction(undefined, formData)).rejects.toThrow(
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
