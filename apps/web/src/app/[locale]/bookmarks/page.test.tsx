import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
  listEngagementBookmarks: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: mocks.scopedToUser,
}));

vi.mock("@/server/engagement-repository", () => ({
  listEngagementBookmarks: mocks.listEngagementBookmarks,
}));

vi.mock("@/app/(default)/garden/garden-auth-panel", () => ({
  GardenAuthPanel: ({ initialMessage }: { initialMessage?: string }) => (
    <section>{initialMessage}</section>
  ),
}));

describe("/{locale}/bookmarks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.listEngagementBookmarks.mockResolvedValue([
      {
        key: "bookmark:one",
        target: {
          kind: "journal_entry",
          ref: "first-ripe-cluster",
          label: "First ripe cluster",
          href: "/journal/first-ripe-cluster",
        },
        addedAt: "2026-07-04T08:00:00.000Z",
        updatedAt: "2026-07-04T08:00:00.000Z",
      },
    ]);
  });

  it("keeps bookmark metadata private and localized", async () => {
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "bg" }),
      }),
    ).resolves.toMatchObject({
      title: "Отметки | OverGarden",
      description: "Запазени публични материали, към които да се върнете.",
      alternates: { canonical: "/bg/bookmarks" },
      robots: { index: false, follow: false },
    });
  });

  it("renders signed-in public-safe bookmarks for later reading", async () => {
    const { default: LocalizedBookmarksRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedBookmarksRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    expect(mocks.listEngagementBookmarks).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      undefined,
      "uk",
    );
    expect(html).toContain("Закладки");
    expect(html).toContain("First ripe cluster");
    expect(html).toContain("/journal/first-ripe-cluster");
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toMatch(
      /owner_user_id|author_user_id|quarantine|derivative_key|ip_address|user_agent|email|phone|coordinates|latitude|longitude/i,
    );
  });

  it("shows auth instead of a shelf when signed out", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { default: LocalizedBookmarksRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedBookmarksRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    expect(mocks.listEngagementBookmarks).not.toHaveBeenCalled();
    expect(html).toContain("Увійдіть, щоб відкрити закладки.");
  });
});
