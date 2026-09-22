import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listPublicCommunities: vi.fn(),
  getPublicCommunityPage: vi.fn(),
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: mocks.redirect,
  notFound: mocks.notFound,
  // `FilterBar` navigates through the router once hydrated; on the server it
  // renders a plain `GET` form, so a stub is all a rendering proof needs.
  useRouter: () => ({ push: vi.fn() }),
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
  contributors: [],
  contributions: { items: [], nextCursor: null },
  search: { mode: "browse", degradedReason: null, shortQuery: false },
  viewer: {
    membershipState: null,
    isModerator: false,
    eligibleJournals: [],
  },
};

describe("community public routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // The community pages are static documents: without a database in the
    // environment they defer to the request and render their skeleton.
    vi.stubEnv("DATABASE_URL", "postgresql://unit.test/x");
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.listPublicCommunities.mockResolvedValue([directoryCommunity]);
    mocks.getPublicCommunityPage.mockResolvedValue(communityPage);
  });

  it("renders the localized directory and detail guest-open with indexable metadata", async () => {
    const { default: Directory, generateMetadata: directoryMetadata } =
      await import("@/app/[locale]/communities/page");
    const {
      default: Detail,
      generateMetadata: detailMetadata,
      renderCommunityForRequest,
    } = await import("@/app/[locale]/communities/[slug]/page");

    const directoryHtml = renderToStaticMarkup(
      await Directory({ params: Promise.resolve({ locale: "bg" }) }),
    );
    const staticHtml = renderToStaticMarkup(
      await Detail({
        params: Promise.resolve({
          locale: "bg",
          slug: "observation-and-care",
        }),
      }),
    );
    expect(staticHtml).toContain(
      'data-public-community="observation-and-care"',
    );
    // A filtered view renders from the `/q` twin, at request time.
    const detailHtml = renderToStaticMarkup(
      await renderCommunityForRequest("bg", "observation-and-care", {
        kind: "plant",
        q: "домати",
        cursor: "eyJpZCI6IjEifQ",
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
      robots: { index: true, follow: true },
      alternates: { canonical: "https://over.garden/bg/communities" },
    });
    const detailMeta = await detailMetadata({
      params: Promise.resolve({
        locale: "bg",
        slug: "observation-and-care",
      }),
    });
    // The mocked community lists no contributions: an empty listing stays
    // noindex (ADR-0022, D3), whatever its readiness says.
    expect(detailMeta).toMatchObject({
      robots: { index: false, follow: false },
    });
    expect(detailMeta.alternates).toBeUndefined();

    mocks.getPublicCommunityPage.mockResolvedValueOnce({
      ...communityPage,
      navigationReady: false,
      contributions: {
        items: [
          {
            id: "contribution-1",
            title: "Домати на балкона",
            excerpt: "Първи плодове след три седмици.",
            object: { id: "object-1", displayName: "Домат" },
          },
        ],
        nextCursor: null,
      },
    });
    const listingMeta = await detailMetadata({
      params: Promise.resolve({
        locale: "bg",
        slug: "observation-and-care",
      }),
    });
    expect(listingMeta).toMatchObject({
      robots: { index: true, follow: true },
      alternates: {
        canonical: "https://over.garden/bg/communities/observation-and-care",
      },
    });
  });

  it("gives an empty community the first-run state, and keeps it out of the index", async () => {
    const { default: Detail, generateMetadata: detailMetadata } =
      await import("@/app/[locale]/communities/[slug]/page");
    mocks.getPublicCommunityPage.mockResolvedValue({
      ...communityPage,
      activeMemberCount: 0,
      activeContributionCount: 0,
      activeObjectCount: 0,
    });

    const html = renderToStaticMarkup(
      await Detail({
        params: Promise.resolve({
          locale: "uk",
          slug: "observation-and-care",
        }),
      }),
    );

    // `OVE-454` criteria 1, 2 and 6 in one place: one state rather than a
    // stack of empty sections, no count of zero anywhere on it, and an empty
    // listing is still one of the three places `noindex` is allowed
    // (ADR-0022 D4) — an empty state must not become an indexable thin page.
    expect(html).toContain('data-public-community-screen="empty-first-run"');
    expect(html).toContain('data-community-facts="none"');
    expect(html).not.toMatch(/>0</u);
    expect(
      await detailMetadata({
        params: Promise.resolve({
          locale: "uk",
          slug: "observation-and-care",
        }),
      }),
    ).toMatchObject({ robots: { index: false, follow: false } });
  });

  /**
   * The unprefixed route renders. The geography redirect that used to sit here
   * could not work — by the time it ran the shell had streamed, so the status
   * was already `200` and the location header had sailed — and ADR-0029 D10
   * settles it anyway: a canonical URL answers `200` to everyone.
   */
  it("renders the directory in the default locale whatever the reader's is", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("ru");
    const { default: RootDirectory } = await import("./page");

    const rendered = await RootDirectory();

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(rendered).toBeTruthy();
  });
});
