import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The route returns the page's own tree: one element, with its props. */
function asElement(node: ReactNode) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return node as ReactElement<Record<string, any>>;
}

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
  PublicCommunityUnavailable: (props: { retryHref: string }) => (
    <div data-unavailable={props.retryHref} />
  ),
  CommunityMembershipAction: () => null,
  CommunitySafetyActions: () => null,
  CommunityContributionStep: () => null,
  CommunityModeratorLink: () => null,
  communityOutcomeTone: () => "success",
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

  it("is the guest's community for every reader, and never reads the request", async () => {
    const { default: CommunityDetailRoute } = await import("./page");
    const query = {
      then: vi.fn(() => {
        throw new Error("request read by page");
      }),
    };
    const element = asElement(
      await CommunityDetailRoute({
        params: Promise.resolve({ locale: "uk", slug: "observation-and-care" }),
        searchParams: query as unknown as Promise<Record<string, string>>,
      }),
    );

    expect(query.then).not.toHaveBeenCalled();
    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
    expect(mocks.getPublicCommunityPage).not.toHaveBeenCalled();
    expect(element.props).toMatchObject({
      viewer: "guest",
      request: { query: "", kind: "all", cursor: null },
    });
    // Every viewer-dependent part arrives as a request-time region.
    expect(Object.keys(element.props.regions).sort()).toEqual([
      "contribute",
      "intentFocus",
      "membership",
      "moderator",
      "safety",
      "status",
    ]);
    expect(mocks.readPublicCommunityPage).toHaveBeenCalledWith(
      "observation-and-care",
      "uk",
      "",
      "all",
      null,
    );
  });

  it("renders nothing for the prerender's placeholder sample", async () => {
    const { default: CommunityDetailRoute } = await import("./page");
    expect(
      await CommunityDetailRoute({
        params: Promise.resolve({ locale: "uk", slug: "__static_params__" }),
      }),
    ).toBeNull();
    expect(mocks.readPublicCommunityPage).not.toHaveBeenCalled();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("defers a failed static read, and settles one at request time", async () => {
    const { renderStaticCommunity } = await import("./page");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.readPublicCommunityPage.mockRejectedValue(
      new Error("database unavailable"),
    );

    await expect(
      renderStaticCommunity("uk", "observation-and-care", undefined, "static"),
    ).rejects.toThrow("read_failed");
    const element = asElement(
      await renderStaticCommunity(
        "uk",
        "observation-and-care",
        undefined,
        "request",
      ),
    );
    expect(element.props).toMatchObject({
      retryHref: "/communities/observation-and-care",
    });
    expect(error).toHaveBeenCalledTimes(1);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("the twin reads one request object, and refuses a kind it does not know", async () => {
    const { renderCommunityForRequest } = await import("./page");
    const element = asElement(
      await renderCommunityForRequest("uk", "observation-and-care", {
        q: "  волога  ",
        kind: "fungus",
        cursor: "eyJpZCI6IjEifQ",
      }),
    );

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
    const element = asElement(
      await CommunityDetailRoute({
        params: Promise.resolve({ locale: "uk", slug: "observation-and-care" }),
      }),
    );

    // Digg's "Discover Communities" panel. It is the same cached read
    // `/communities` makes, so a reader who came from the list pays nothing.
    expect(mocks.readPublicCommunityDirectory).toHaveBeenCalledTimes(1);
    expect(element.props.otherCommunities).toHaveLength(2);
  });

  it("keeps the community when only the rail's directory fails (OVE-500)", async () => {
    const { default: CommunityDetailRoute } = await import("./page");
    mocks.readPublicCommunityDirectory.mockRejectedValue(
      new Error("directory unavailable"),
    );
    const element = asElement(
      await CommunityDetailRoute({
        params: Promise.resolve({ locale: "uk", slug: "observation-and-care" }),
      }),
    );

    // A partial failure stays partial: the rail loses its other
    // communities, and the page keeps everything else.
    expect(element.props).toMatchObject({ viewer: "guest", state: "ready" });
    expect(element.props.otherCommunities).toEqual([]);
  });

  it("hands the twin the contribution step's outcome and its fresh entry", async () => {
    const { renderCommunityForRequest } = await import("./page");
    const element = asElement(
      await renderCommunityForRequest("uk", "observation-and-care", {
        q: "волога",
        contributeAction: "not_member",
        contribute: "00000000-0000-4000-8000-000000000401",
      }),
    );

    expect(element.props).toMatchObject({
      contributeStatus: "not_member",
      contributeEntryId: "00000000-0000-4000-8000-000000000401",
    });
  });
});
