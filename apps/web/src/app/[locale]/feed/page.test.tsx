import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  listFollowedFeedStories: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/social-readback-repository", () => ({
  listFollowedFeedStories: mocks.listFollowedFeedStories,
}));

vi.mock("../../garden/garden-auth-panel", () => ({
  GardenAuthPanel: ({ initialMessage }: { initialMessage?: string }) => (
    <section>{initialMessage ?? "Sign in"}</section>
  ),
}));

describe("/{locale}/feed", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.listFollowedFeedStories.mockResolvedValue([
      {
        key: "followed-feed:safe",
        href: "/journal/public-story",
        ownerMention: "@green_thumb",
        targetObject: {
          displayName: "Balcony tomato",
          objectKind: "plant",
          catalogKind: "plant_variety",
          varietyText: "Red Cherry",
          varietyState: "selected",
        },
        entryDate: "2026-07-04",
        publishedAt: "2026-07-04T08:00:00.000Z",
      },
    ]);
  });

  it("keeps followed feed metadata private and localized", async () => {
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "uk" }),
      }),
    ).resolves.toMatchObject({
      title: "Followed feed | OverGarden",
      alternates: {
        canonical: "/feed",
      },
      robots: {
        index: false,
        follow: false,
      },
    });
  });

  it("requires auth before reading followed feed stories", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);

    const { default: LocalizedFollowedFeedRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedFollowedFeedRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    expect(html).toContain("Sign in to open your followed feed.");
    expect(mocks.listFollowedFeedStories).not.toHaveBeenCalled();
  });

  it("renders public-safe followed story links without raw ids", async () => {
    const { default: LocalizedFollowedFeedRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedFollowedFeedRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    expect(mocks.listFollowedFeedStories).toHaveBeenCalledWith({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    });
    expect(html).toContain("Followed feed");
    expect(html).toContain("/journal/public-story");
    expect(html).toContain("Balcony tomato");
    expect(html).toContain("@green_thumb");
    expect(html).toContain("Red Cherry");
    expect(html).not.toMatch(
      /00000000-0000|session-1|journal body|private journal|quarantine|derivative|media key|ip_address|user_agent|email|phone|coordinates|invite|token|source_reference_label/i,
    );
  });
});
