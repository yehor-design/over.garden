import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  targetQuery: vi.fn(),
  commentThread: vi.fn(),
  engagementPanel: vi.fn(() => <div data-engagement-panel="true" />),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));
vi.mock("@/server/engagement-repository", () => ({
  buildPublicCommunityContributionCommentTargetQuery: mocks.targetQuery,
  getEngagementCommentThread: mocks.commentThread,
}));
vi.mock("@/app/engagement/public-engagement-panel", () => ({
  PublicEngagementPanel: mocks.engagementPanel,
}));
vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: () => null,
  SiteShellContextRailModules: () => null,
}));

import ContributionDiscussionRoute from "./page";

const CONTRIBUTION_ID = "00000000-0000-4000-8000-000000000201";

function targetRow(overrides: Record<string, unknown> = {}) {
  return {
    contributionId: CONTRIBUTION_ID,
    discussionState: "open",
    communitySlug: "observation-and-care",
    communityContentKey: "observation-and-care",
    entryTitle: "Томат після тижня спеки",
    entryPublicSlug: "tomato-after-heat",
    entryDate: "2026-07-12",
    objectDisplayName: "Томат Чорний принц",
    objectKind: "plant",
    authorHandle: "demo_olena",
    authorDisplayName: "Олена",
    addressHandle: "demo_olena",
    ...overrides,
  };
}

describe("contribution discussion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.commentThread.mockResolvedValue({
      target: { kind: "community_contribution", ref: CONTRIBUTION_ID },
      comments: [],
      hasMoreComments: false,
      nextCommentCursor: null,
    });
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

  it("says where the reader is and which entry is being discussed", async () => {
    mocks.targetQuery.mockReturnValue({
      executeTakeFirst: async () => targetRow(),
    });

    const html = renderToStaticMarkup(
      await ContributionDiscussionRoute({
        params: Promise.resolve({
          locale: "uk",
          slug: "observation-and-care",
          contributionId: CONTRIBUTION_ID,
        }),
      }),
    );

    expect(html).toContain(
      'data-public-community-discussion="observation-and-care"',
    );
    expect(html).toContain('href="/communities/observation-and-care"');
    // The entry is the thread's subject line, and a real address to it
    // (ADR-0029 D9: under its author).
    expect(html).toContain('href="/@demo_olena/tomato-after-heat"');
    expect(html).toContain("Томат Чорний принц");
    expect(html).toContain("Олена");
    expect(html).toContain('data-engagement-panel="true"');
  });

  it("keeps a closed discussion readable rather than answering with one sentence", async () => {
    mocks.targetQuery.mockReturnValue({
      executeTakeFirst: async () => targetRow({ discussionState: "closed" }),
    });

    const html = renderToStaticMarkup(
      await ContributionDiscussionRoute({
        params: Promise.resolve({
          locale: "uk",
          slug: "observation-and-care",
          contributionId: CONTRIBUTION_ID,
        }),
      }),
    );

    expect(html).toContain("Обговорення закрито модератором");
    expect(html).toContain('href="/@demo_olena/tomato-after-heat"');
    expect(html).toContain("До спільноти");
    // No thread is read for a closed discussion.
    expect(mocks.commentThread).not.toHaveBeenCalled();
    expect(html).not.toContain('data-engagement-panel="true"');
  });

  it("answers 404 when the contribution belongs to another community", async () => {
    mocks.targetQuery.mockReturnValue({
      executeTakeFirst: async () => targetRow({ communitySlug: "elsewhere" }),
    });

    await expect(
      ContributionDiscussionRoute({
        params: Promise.resolve({
          locale: "uk",
          slug: "observation-and-care",
          contributionId: CONTRIBUTION_ID,
        }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("stays out of the index: a conversation is not the indexable thing", async () => {
    const { generateMetadata } = await import("./page");
    expect(await generateMetadata()).toMatchObject({
      robots: { index: false, follow: false },
    });
  });
});
