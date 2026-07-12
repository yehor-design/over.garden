import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicProfileEvidencePageByHandle: vi.fn(),
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  getProfileViewerState: vi.fn(),
}));

vi.mock("@/server/public-profile-repository", () => ({
  getPublicProfileEvidencePageByHandle:
    mocks.getPublicProfileEvidencePageByHandle,
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));

vi.mock("@/server/profile-interaction-repository", () => ({
  getProfileViewerState: mocks.getProfileViewerState,
}));

vi.mock("@/app/[locale]/[profileHandle]/actions", () => ({
  followProfileAction: vi.fn(),
  unfollowProfileAction: vi.fn(),
  reportProfileAction: vi.fn(),
  blockProfileAction: vi.fn(),
}));

const PROFILE = {
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
    objectKinds: { plant: 1, animal: 0, beeColony: 0 },
    confirmedLineageEdgeCount: 3,
    relationships: { followers: 4, following: 2 },
  },
  objects: [
    {
      objectId: "00000000-0000-4000-8000-000000000001",
      displayName: "Balcony tomato",
      objectKind: "plant",
      identityLabel: "Solanum lycopersicum",
      identityState: "confirmed",
      latestEntryDate: "2026-07-10",
      publicEntryCount: 2,
      publicPath: "/lineage/objects/00000000-0000-4000-8000-000000000001",
      coverImageUrl: null,
      coverImageAlt: "Balcony tomato",
    },
  ],
  journals: [
    {
      entryId: "10000000-0000-4000-8000-000000000001",
      title: "First harvest",
      bodyPreview: "A short public entry.",
      entryDate: "2026-07-10",
      publishedAt: "2026-07-10T10:00:00.000Z",
      publicPath: "/journal/first-harvest",
      context: {
        kind: "object",
        label: "Balcony tomato",
        publicPath: "/lineage/objects/00000000-0000-4000-8000-000000000001",
        objectKind: "plant",
      },
      coverImageUrl: null,
      coverImageAlt: "Balcony tomato",
    },
  ],
  hasMoreObjects: false,
  hasMoreJournals: false,
} as const;

describe("/{locale}/@:handle public profile route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.getProfileViewerState.mockResolvedValue({ kind: "not_following" });
    mocks.getPublicProfileEvidencePageByHandle.mockResolvedValue(PROFILE);
  });

  it("keeps profile metadata noindex with localized canonical and safe evidence", async () => {
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
      alternates: { canonical: "/@green_thumb" },
      robots: { index: false, follow: false },
    });
    expect(metadata.alternates?.languages).toMatchObject({
      uk: "/@green_thumb",
      bg: "/bg/@green_thumb",
      ru: "/ru/@green_thumb",
    });
  });

  it("renders objects before journals and defers guest auth until interaction", async () => {
    const { default: LocalizedPublicProfileRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedPublicProfileRoute({
        params: Promise.resolve({
          locale: "uk",
          profileHandle: "%40green_thumb",
        }),
      }),
    );

    expect(mocks.getPublicProfileEvidencePageByHandle).toHaveBeenCalledWith(
      "@green_thumb",
      "uk",
    );
    expect(html).toContain('data-public-profile="v2"');
    expect(html.indexOf("Живі об’єкти")).toBeLessThan(
      html.indexOf("Журнал догляду"),
    );
    expect(html).toContain("Balcony tomato");
    expect(html).toContain("First harvest");
    expect(html).toContain('data-auth-intent-control="follow"');
    expect(html).not.toMatch(
      /email|provider|account|session-1|ip_address|user_agent|quarantine|derivative|invite|token|pending|precise|latitude|longitude/i,
    );
  });

  it("uses the authenticated relationship state without exposing account data", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce({
      user: { id: "viewer-user" },
      session: { id: "session-1" },
    });
    mocks.getProfileViewerState.mockResolvedValueOnce({ kind: "following" });
    const { default: LocalizedPublicProfileRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedPublicProfileRoute({
        params: Promise.resolve({
          locale: "bg",
          profileHandle: "@green_thumb",
        }),
        searchParams: Promise.resolve({ profileAction: "followed" }),
      }),
    );

    expect(mocks.getProfileViewerState).toHaveBeenCalledWith(
      { userId: "viewer-user", sessionId: "session-1" },
      "green_thumb",
    );
    expect(html).toContain("Спри следването");
    expect(html).toContain("Вече следвате този профил.");
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
    const { default: LocalizedPublicProfileRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedPublicProfileRoute({
        params: Promise.resolve({
          locale: "uk",
          profileHandle: "@green_thumb",
        }),
        searchParams: Promise.resolve({ authIntent: "report" }),
      }),
    );

    expect(html).toContain('id="profile-report" open=""');
    expect(html).toContain('data-auth-intent-control="report"');
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
  });
});
