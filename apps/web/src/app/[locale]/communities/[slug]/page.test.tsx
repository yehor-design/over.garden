import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getPublicCommunityPage: vi.fn(),
  listPublicCommunities: vi.fn(),
  readPublicCommunityPage: vi.fn(),
  readPublicCommunityDirectory: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  publicCommunityView: vi.fn(
    (props: {
      state: string;
      viewer: string;
      request: { query: string; kind: string; cursor: string | null };
      otherCommunities?: readonly { slug: string }[];
      resumeAction?: string | null;
      resumeControl?: string | null;
    }) => (
      <div
        data-state={props.state}
        data-viewer={props.viewer}
        data-query={props.request.query}
        data-kind={props.request.kind}
        data-cursor={props.request.cursor ?? ""}
        data-others={props.otherCommunities?.length ?? 0}
        data-resume-action={props.resumeAction}
        data-resume-control={props.resumeControl}
      />
    ),
  ),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: mocks.notFound,
}));
vi.mock("@/components/public/public-community", () => ({
  PublicCommunityView: mocks.publicCommunityView,
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: () => null,
}));
vi.mock("@/server/community-repository", () => ({
  getPublicCommunityPage: mocks.getPublicCommunityPage,
  listPublicCommunities: mocks.listPublicCommunities,
  buildPublicCommunityDiscoverySource: () => ({
    consumerId: "localized_community",
    candidateState: "candidate",
    visibleText: ["Спостереження і догляд"],
    distinctPublicEntityIds: ["1"],
    canonicalPath: "/communities/observation-and-care",
    equivalentLocales: ["uk", "bg", "ru"],
  }),
}));
vi.mock("@/server/public-cache", () => ({
  readPublicCommunityPage: mocks.readPublicCommunityPage,
  readPublicCommunityDirectory: mocks.readPublicCommunityDirectory,
}));

const COMMUNITY = {
  id: "018f1840-0000-4000-8000-000000000002",
  slug: "observation-and-care",
  contentKey: "observation-and-care",
  topicSlug: "observation-and-care",
  lifecycleState: "active",
  participationState: "open",
  navigationReady: true,
  activeMemberCount: 3,
  activeContributionCount: 2,
  activeObjectCount: 1,
  coverUrl: null,
  coverFocalX: null,
  coverFocalY: null,
  coverIntrinsicWidth: null,
  coverIntrinsicHeight: null,
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

describe("localized community detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://overgarden:secret@localhost:5432/overgarden",
    );
    vi.stubEnv("R2_ENDPOINT", "http://localhost:9000");
    vi.stubEnv("R2_PUBLIC_BASE_URL", "http://localhost:9000/overgarden-public");
    vi.stubEnv("PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.readPublicCommunityPage.mockResolvedValue(COMMUNITY);
    mocks.getPublicCommunityPage.mockResolvedValue(COMMUNITY);
    mocks.readPublicCommunityDirectory.mockResolvedValue([
      COMMUNITY,
      { ...COMMUNITY, id: "other", slug: "quiet-start" },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("propagates repository failures to the route error boundary", async () => {
    const { default: CommunityDetailRoute } = await import("./page");
    mocks.readPublicCommunityPage.mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    await expect(
      CommunityDetailRoute({
        params: Promise.resolve({
          locale: "uk",
          slug: "observation-and-care",
        }),
      }),
    ).rejects.toThrow("database unavailable");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("reads one request object, and refuses a kind it does not know", async () => {
    const { default: CommunityDetailRoute } = await import("./page");
    const element = await CommunityDetailRoute({
      params: Promise.resolve({ locale: "uk", slug: "observation-and-care" }),
      searchParams: Promise.resolve({
        q: "  волога  ",
        kind: "fungus",
        cursor: "eyJpZCI6IjEifQ",
      }),
    });

    expect(element.props).toMatchObject({
      request: { query: "волога", kind: "all", cursor: "eyJpZCI6IjEifQ" },
    });
    // The repository is asked for exactly what the request says — `all`, not
    // the word the address carried.
    expect(mocks.readPublicCommunityPage).toHaveBeenCalledWith(
      "observation-and-care",
      "uk",
      "волога",
      "all",
      "eyJpZCI6IjEifQ",
    );
  });

  it("carries the rest of the directory for the rail, without the page itself", async () => {
    const { default: CommunityDetailRoute } = await import("./page");
    const element = await CommunityDetailRoute({
      params: Promise.resolve({ locale: "uk", slug: "observation-and-care" }),
    });

    // Digg's "Discover Communities" panel. It is the same cached read
    // `/communities` makes, so a reader who came from the list pays nothing.
    expect(mocks.readPublicCommunityDirectory).toHaveBeenCalledTimes(1);
    expect(element.props.otherCommunities).toHaveLength(2);
  });
});
