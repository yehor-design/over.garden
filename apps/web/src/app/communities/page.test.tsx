import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listPublicCommunities: vi.fn(),
  getPublicCommunityPage: vi.fn(),
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => null),
}));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: vi.fn(),
  mutationScopeResponse: vi.fn(),
  ownerUserIdFromFormData: vi.fn(),
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/community-repository", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/community-repository")>();
  return {
    ...actual,
    listPublicCommunities: mocks.listPublicCommunities,
    getPublicCommunityPage: mocks.getPublicCommunityPage,
  };
});

const directoryCommunity = {
  id: "00000000-0000-4000-8000-000000000184",
  slug: "observation-and-care",
  contentKey: "observation-and-care",
  topicSlug: "observation-and-care",
  lifecycleState: "active",
  participationState: "open",
  navigationReady: true,
  activeMemberCount: 4,
  activeContributionCount: 13,
  activeObjectCount: 8,
};

const communityPage = {
  ...directoryCommunity,
  rules: [],
  contributions: { items: [], nextCursor: null },
  viewer: {
    membershipState: null,
    isModerator: false,
    eligibleJournals: [],
  },
};

describe("community public routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.listPublicCommunities.mockResolvedValue([directoryCommunity]);
    mocks.getPublicCommunityPage.mockResolvedValue(communityPage);
  });

  it("renders the localized directory and detail guest-open with noindex metadata", async () => {
    const { default: Directory, generateMetadata: directoryMetadata } =
      await import("../[locale]/communities/page");
    const { default: Detail, generateMetadata: detailMetadata } =
      await import("../[locale]/communities/[slug]/page");

    const directoryHtml = renderToStaticMarkup(
      await Directory({ params: Promise.resolve({ locale: "bg" }) }),
    );
    const detailHtml = renderToStaticMarkup(
      await Detail({
        params: Promise.resolve({
          locale: "bg",
          slug: "observation-and-care",
        }),
        searchParams: Promise.resolve({
          kind: "plant",
          q: "домати",
          cursor: "eyJpZCI6IjEifQ",
        }),
      }),
    );

    expect(directoryHtml).toContain("Общности");
    expect(detailHtml).toContain(
      'data-public-community="observation-and-care"',
    );
    expect(mocks.getPublicCommunityPage).toHaveBeenCalledWith(
      "observation-and-care",
      "bg",
      expect.objectContaining({
        viewerScope: null,
        query: "домати",
        kind: "plant",
        cursor: "eyJpZCI6IjEifQ",
      }),
    );
    const directoryMeta = await directoryMetadata({
      params: Promise.resolve({ locale: "bg" }),
    });
    expect(directoryMeta).toMatchObject({
      robots: { index: false, follow: false },
    });
    expect(directoryMeta.alternates).toBeUndefined();
    const detailMeta = await detailMetadata({
      params: Promise.resolve({
        locale: "bg",
        slug: "observation-and-care",
      }),
    });
    expect(detailMeta).toMatchObject({
      robots: { index: false, follow: false },
    });
    expect(detailMeta.alternates).toBeUndefined();
  });

  it("redirects the unprefixed directory to the persisted locale", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("ru");
    const { default: RootDirectory } = await import("./page");

    await RootDirectory();

    expect(mocks.redirect).toHaveBeenCalledWith("/ru/communities");
  });
});
