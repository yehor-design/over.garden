import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  listFollowedFeedPage: vi.fn(),
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

vi.mock("@/server/social-return-repository", () => ({
  listFollowedFeedPage: mocks.listFollowedFeedPage,
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
    mocks.listFollowedFeedPage.mockResolvedValue({
      items: [
        {
          key: "feed:safe",
          href: "/journal/public-story",
          title: "First ripe cluster",
          excerpt: "A bounded public excerpt.",
          author: {
            handle: "green_thumb",
            label: "@green_thumb",
            href: "/@green_thumb",
          },
          object: {
            id: "opaque-object",
            displayName: "Balcony tomato",
            kind: "plant",
            catalogKind: "plant_variety",
            varietyText: "Red Cherry",
            href: "/lineage/objects/public-object",
          },
          entryDate: "2026-07-04",
          publishedAt: "2026-07-04T08:00:00.000Z",
          reasons: ["people", "objects"],
          mediaUrl: null,
        },
      ],
      nextCursor: "safe-cursor",
    });
  });

  it("keeps followed feed metadata private and localized", async () => {
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "uk" }),
      }),
    ).resolves.toMatchObject({
      title: "Стрічка підписок | OverGarden",
      description:
        "Нові публічні записи від людей, об'єктів і тем, за якими ви стежите.",
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

    expect(html).toContain("Увійдіть, щоб відкрити стрічку підписок.");
    expect(mocks.listFollowedFeedPage).not.toHaveBeenCalled();
  });

  it("renders public-safe followed story links without raw ids", async () => {
    const { default: LocalizedFollowedFeedRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedFollowedFeedRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    expect(mocks.listFollowedFeedPage).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      expect.objectContaining({
        source: "all",
        objectKind: "all",
        locale: "uk",
      }),
    );
    expect(html).toContain("Стрічка підписок");
    expect(html).toContain("/journal/public-story");
    expect(html).toContain("First ripe cluster");
    expect(html).toContain("Balcony tomato");
    expect(html).toContain("@green_thumb");
    expect(html).toContain("Red Cherry");
    expect(html).not.toMatch(
      /00000000-0000|session-1|journal body|private journal|quarantine|derivative|media key|ip_address|user_agent|email|phone|coordinates|invite|token|source_reference_label/i,
    );
  });

  it("eager-loads only the three desktop above-the-fold media cards", async () => {
    mocks.listFollowedFeedPage.mockResolvedValueOnce({
      items: Array.from({ length: 4 }, (_, index) => ({
        key: `feed:${index}`,
        href: `/journal/public-story-${index}`,
        title: `Public story ${index}`,
        excerpt: "A bounded public excerpt.",
        author: {
          handle: "green_thumb",
          label: "@green_thumb",
          href: "/@green_thumb",
        },
        object: {
          id: `opaque-object-${index}`,
          displayName: "Balcony tomato",
          kind: "plant",
          catalogKind: "plant_variety",
          varietyText: "Red Cherry",
          href: `/lineage/objects/public-object-${index}`,
        },
        entryDate: "2026-07-04",
        publishedAt: "2026-07-04T08:00:00.000Z",
        reasons: ["people", "objects"],
        mediaUrl: `https://media.over.garden/feed-${index}.jpg`,
      })),
      nextCursor: null,
    });

    const { default: LocalizedFollowedFeedRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedFollowedFeedRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    expect(html.match(/loading="eager"/g)).toHaveLength(3);
    expect(html.match(/loading="lazy"/g)).toHaveLength(1);
  });
});
