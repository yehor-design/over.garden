import type { PublicProfileEvidencePage } from "@/server/public-profile-repository";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicProfileEvidencePageByHandle: vi.fn(),
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  getProfileViewerState: vi.fn(),
  getPublicProfileLifecycleLookup: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/public-profile-repository", () => ({
  getPublicProfileEvidencePageByHandle:
    mocks.getPublicProfileEvidencePageByHandle,
  getPublicProfileLifecycleLookup: mocks.getPublicProfileLifecycleLookup,
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));

vi.mock("@/server/profile-interaction-repository", () => ({
  getProfileViewerState: mocks.getProfileViewerState,
}));

// The profile's tabs are a client component, and a real `Tabs` renders here.
// Only the router underneath is stubbed — the URL round-trip is a browser fact
// and `tests/public-profile.spec.ts` is where it is proven.
vi.mock("next/navigation", () => ({
  unstable_rethrow: () => undefined,
  notFound: mocks.notFound,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/uk/@green_thumb",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/[locale]/[profileHandle]/actions", () => ({
  followProfileAction: vi.fn(),
  unfollowProfileAction: vi.fn(),
  reportProfileAction: vi.fn(),
  blockProfileAction: vi.fn(),
}));

const PROFILE: PublicProfileEvidencePage = {
  handle: "green_thumb",
  mention: "@green_thumb",
  displayName: "Green Thumb",
  avatarUrl: null,
  avatarAlt: "Green Thumb",
  bio: "A public-safe profile biography.",
  languages: ["uk"],
  coarseRegionCode: "UA-30",
  summary: {
    publicEntryCount: 2,
    publicObjectCount: 1,
    objectKinds: { plant: 1, animal: 0 },
    relationships: { followers: 4, following: 2 },
  },
  objects: {
    items: [
      {
        objectId: "00000000-0000-4000-8000-000000000001",
        displayName: "Balcony tomato",
        objectKind: "plant",
        identityLabel: "Solanum lycopersicum",
        identityState: "confirmed",
        latestEntryDate: "2026-07-10",
        publicEntryCount: 2,
        publicPath: "/@green_thumb/objects/balcony-tomato",
        coverImageUrl: null,
        coverFocalX: null,
        coverFocalY: null,
        coverIntrinsicWidth: null,
        coverIntrinsicHeight: null,
        coverPlaceholderDataUri: null,
        coverVariantLongEdges: [],
        coverImageAlt: "Balcony tomato",
      },
    ],
    page: 1,
    pageCount: 1,
  },
  entries: {
    items: [
      {
        id: "10000000-0000-4000-8000-000000000001",
        title: "First harvest",
        excerpt: "A short public entry.",
        excerptTruncated: false,
        sourceLanguage: "uk",
        entryDate: "2026-07-10",
        publishedAt: "2026-07-10T10:00:00.000Z",
        publicPath: "/@green_thumb/post/1",
        object: {
          id: "00000000-0000-4000-8000-000000000001",
          displayName: "Balcony tomato",
          kind: "plant",
          publicPath: "/@green_thumb/objects/balcony-tomato",
          safeRegionCode: null,
        },
        space: null,
        author: {
          handle: "green_thumb",
          displayName: "Green Thumb",
          avatarUrl: null,
          profilePath: "/@green_thumb",
        },
        media: [],
        topics: [],
      },
    ],
    page: 1,
    pageCount: 1,
  },
};

describe("/{locale}/@:handle public profile route", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://test@127.0.0.1/test");
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.getProfileViewerState.mockResolvedValue({ kind: "not_following" });
    mocks.getPublicProfileLifecycleLookup.mockResolvedValue({
      status: "active",
    });
    mocks.getPublicProfileEvidencePageByHandle.mockResolvedValue(PROFILE);
  });

  it("indexes a thin profile with canonical discovery metadata", async () => {
    const { generateMetadata } = await import("./page");

    const metadata = await generateMetadata({
      params: Promise.resolve({
        locale: "uk",
        profileHandle: "@green_thumb",
      }),
    });

    expect(metadata).toMatchObject({
      title: "Green Thumb (@green_thumb) · публічний профіль | OverGarden",
      description: "A public-safe profile biography.",
      robots: { index: true, follow: true },
      alternates: { canonical: "https://over.garden/@green_thumb" },
    });
  });

  it("renders entries before objects and defers guest auth until interaction", async () => {
    const { default: LocalizedPublicProfileRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedPublicProfileRoute({
        params: Promise.resolve({
          locale: "uk",
          profileHandle: "%40green_thumb",
        }),
      }),
    );

    // The static document is the first page of each list.
    expect(mocks.getPublicProfileEvidencePageByHandle).toHaveBeenCalledWith(
      "@green_thumb",
      "uk",
      { entriesPage: 1, objectsPage: 1 },
    );
    expect(mocks.getPublicProfileLifecycleLookup).not.toHaveBeenCalled();
    expect(html).toContain('data-public-profile="v3"');
    expect(html).toContain('data-profile-tab="entries"');
    expect(html.indexOf('id="profile-entries"')).toBeLessThan(
      html.indexOf('id="profile-objects"'),
    );
    expect(html).toContain("Balcony tomato");
    expect(html).toContain("First harvest");
    expect(html).toContain('data-auth-intent-control="follow"');
    expect(html).not.toMatch(
      /email|provider|account|session-1|ip_address|user_agent|quarantine|derivative|invite|token|pending|precise|latitude|longitude/i,
    );
  });

  it("opens the tab `?tab=` names, and ignores one that is not a tab", async () => {
    const { default: LocalizedPublicProfileRoute } =
      await import("../../q/[profileHandle]/page");
    const open = async (query?: Record<string, string>) =>
      renderToStaticMarkup(
        await LocalizedPublicProfileRoute({
          params: Promise.resolve({
            locale: "uk",
            profileHandle: "@green_thumb",
          }),
          ...(query ? { searchParams: Promise.resolve(query) } : {}),
        }),
      );

    expect(await open({ tab: "objects" })).toContain(
      'data-profile-tab="objects"',
    );
    // A stale or hand-edited link lands on the gardener's entries rather than
    // on an error: a tab is a view, and an unknown view is not a 404. The
    // "about" tab is gone — its facts are the header (OVE-494).
    expect(await open({ tab: "about" })).toContain(
      'data-profile-tab="entries"',
    );
    expect(await open({ tab: "communities" })).toContain(
      'data-profile-tab="entries"',
    );
    expect(await open()).toContain('data-profile-tab="entries"');
  });

  it("reads the page of the open tab's list, and the first page of the other", async () => {
    const { default: LocalizedPublicProfileRoute } =
      await import("../../q/[profileHandle]/page");
    const open = (query: Record<string, string>) =>
      LocalizedPublicProfileRoute({
        params: Promise.resolve({
          locale: "uk",
          profileHandle: "@green_thumb",
        }),
        searchParams: Promise.resolve(query),
      });

    await open({ page: "3" });
    expect(mocks.getPublicProfileEvidencePageByHandle).toHaveBeenLastCalledWith(
      "green_thumb",
      "uk",
      { entriesPage: 3, objectsPage: 1 },
    );
    await open({ tab: "objects", page: "2" });
    expect(mocks.getPublicProfileEvidencePageByHandle).toHaveBeenLastCalledWith(
      "green_thumb",
      "uk",
      { entriesPage: 1, objectsPage: 2 },
    );
    // Not a page number is the first page, not an error.
    await open({ page: "two" });
    expect(mocks.getPublicProfileEvidencePageByHandle).toHaveBeenLastCalledWith(
      "green_thumb",
      "uk",
      { entriesPage: 1, objectsPage: 1 },
    );
  });

  it("uses the authenticated relationship state without exposing account data", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce({
      user: { id: "viewer-user" },
      session: { id: "session-1" },
    });
    mocks.getProfileViewerState.mockResolvedValueOnce({ kind: "following" });
    const { ProfileViewerActions, ProfileActionStatus } =
      await import("./profile-regions");
    const html = renderToStaticMarkup(
      await ProfileViewerActions({
        profile: PROFILE,
        locale: "bg",
        searchParams: Promise.resolve({ profileAction: "followed" }),
      }),
    );

    expect(mocks.getProfileViewerState).toHaveBeenCalledWith(
      { userId: "viewer-user", sessionId: "session-1" },
      "green_thumb",
    );
    expect(html).toContain("Спри следването");
    const status = renderToStaticMarkup(
      await ProfileActionStatus({
        locale: "bg",
        searchParams: Promise.resolve({ profileAction: "followed" }),
      }),
    );
    expect(status).toContain("Вече следвате този профил.");
    expect(html).not.toContain("viewer-user");
  });

  it("opens the exact profile control when auth returns to a report intent", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce({
      user: { id: "viewer-user" },
      session: { id: "session-1" },
    });
    mocks.getProfileViewerState.mockResolvedValueOnce({
      kind: "not_following",
    });
    const { ProfileViewerActions } = await import("./profile-regions");
    const html = renderToStaticMarkup(
      await ProfileViewerActions({
        profile: PROFILE,
        locale: "uk",
        searchParams: Promise.resolve({ authIntent: "report" }),
      }),
    );

    expect(html).toContain('id="profile-report" open=""');
    expect(html).toContain('data-auth-intent-control="report"');
  });

  it("builds public metadata without reading the viewer", async () => {
    const { generateMetadata } = await import("./page");
    await generateMetadata({
      params: Promise.resolve({ locale: "uk", profileHandle: "@green_thumb" }),
    });
    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
    expect(mocks.getProfileViewerState).not.toHaveBeenCalled();
    // Mutual-block refusal is now asserted at the proxy for documents, RSC
    // and prefetch requests, before the shared static representation is read.
    expect(mocks.getPublicProfileLifecycleLookup).not.toHaveBeenCalled();
  });

  it.each(["blocked", "unavailable"] as const)(
    "omits viewer controls for %s",
    async (kind) => {
      mocks.getCurrentSession.mockResolvedValue({
        user: { id: "viewer-user" },
        session: { id: "session-1" },
      });
      mocks.getProfileViewerState.mockResolvedValue({ kind });
      const { ProfileViewerActions } = await import("./profile-regions");
      const html = renderToStaticMarkup(
        await ProfileViewerActions({
          profile: PROFILE,
          locale: "uk",
          searchParams: undefined,
        }),
      );
      expect(html).not.toContain("<form");
      expect(html).not.toContain("viewer-user");
    },
  );

  it("never consumes request parameters while rendering the default profile", async () => {
    const { default: Page } = await import("./page");
    const query = {
      then: vi.fn(() => {
        throw new Error("request read by page");
      }),
    };
    await Page({
      params: Promise.resolve({ locale: "uk", profileHandle: "@green_thumb" }),
      searchParams: query as unknown as Promise<Record<string, string>>,
    });
    expect(query.then).not.toHaveBeenCalled();
    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
  });

  it("defers a failed static read instead of caching missing content", async () => {
    mocks.getPublicProfileEvidencePageByHandle.mockRejectedValue(
      new Error("database away"),
    );
    const { renderPublicProfile } = await import("./page");
    await expect(
      renderPublicProfile("uk", "@green_thumb", undefined, {
        tab: "entries",
        page: 1,
        phase: "static",
      }),
    ).rejects.toThrow("read_failed");
    await expect(
      renderPublicProfile("uk", "@green_thumb", undefined, {
        tab: "entries",
        page: 1,
        phase: "request",
      }),
    ).rejects.toThrow("database away");
  });

  it("renders its build placeholder without any database read", async () => {
    const { default: Page, generateStaticParams } = await import("./page");
    const params = generateStaticParams()[0]!;
    expect(
      await Page({ params: Promise.resolve({ locale: "uk", ...params }) }),
    ).toBeNull();
    expect(mocks.getPublicProfileEvidencePageByHandle).not.toHaveBeenCalled();
  });

  it("uses localized missing metadata without querying malformed routes", async () => {
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "bg", profileHandle: "blog" }),
      }),
    ).resolves.toMatchObject({
      title: "Профил на градинар | OverGarden",
      robots: { index: false, follow: false },
    });
    expect(mocks.getPublicProfileLifecycleLookup).not.toHaveBeenCalled();
    expect(mocks.getPublicProfileEvidencePageByHandle).not.toHaveBeenCalled();
  });
});
