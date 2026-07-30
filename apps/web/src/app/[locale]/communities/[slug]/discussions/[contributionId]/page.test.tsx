import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  targetQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));
vi.mock("@/server/engagement-repository", () => ({
  buildPublicCommunityContributionCommentTargetQuery: mocks.targetQuery,
  getEngagementCommentThread: vi.fn(),
}));

import ContributionDiscussionRoute from "./page";

describe("contribution discussion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    "not-a-uuid",
    "00000000-0000-4000-4000-000000000000",
  ])("fails closed before any session or database read for %s", async (contributionId) => {
    await expect(
      ContributionDiscussionRoute({
        params: Promise.resolve({
          locale: "bg",
          slug: "observation-and-care",
          contributionId,
        }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
    expect(mocks.targetQuery).not.toHaveBeenCalled();
  });
});
