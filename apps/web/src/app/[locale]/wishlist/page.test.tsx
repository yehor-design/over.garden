import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  listWishlistShelfItems: vi.fn(),
  removeCatalogPublicSlugFromWishlistAction: vi.fn(),
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

vi.mock("@/server/wishlist-repository", () => ({
  listWishlistShelfItems: mocks.listWishlistShelfItems,
}));

vi.mock("../../garden/garden-auth-panel", () => ({
  GardenAuthPanel: ({ initialMessage }: { initialMessage?: string }) => (
    <section>{initialMessage ?? "Sign in"}</section>
  ),
}));

vi.mock("../../wishlist/actions", () => ({
  removeCatalogPublicSlugFromWishlistAction:
    mocks.removeCatalogPublicSlugFromWishlistAction,
}));

describe("/{locale}/wishlist", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.listWishlistShelfItems.mockResolvedValue([
      {
        key: "wishlist:safe-hash",
        catalog: {
          canonicalName: "Pomidor Cheri",
          publicSlug: "pomidor-cheri-0000000101",
          catalogKind: "plant_variety",
          locale: "uk",
          status: "seeded",
          source: "seed",
        },
        sourceSurface: "public_variety",
        addedAt: "2026-07-04T08:00:00.000Z",
        updatedAt: "2026-07-04T09:00:00.000Z",
        publicPath: "/variety/pomidor-cheri-0000000101",
        activationPath:
          "/garden?catalog=pomidor-cheri-0000000101&source=public-variety",
      },
    ]);
  });

  it("keeps wishlist metadata private and localized", async () => {
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "uk" }),
      }),
    ).resolves.toMatchObject({
      title: "Хочу спробувати | OverGarden",
      description: "Види, сорти й породи, які ви хочете додати згодом.",
      alternates: {
        canonical: "/wishlist",
      },
      robots: {
        index: false,
        follow: false,
      },
    });
  });

  it("requires auth before reading wishlist items", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);

    const { default: LocalizedWishlistRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedWishlistRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    expect(html).toContain("Увійдіть, щоб відкрити список бажань.");
    expect(mocks.listWishlistShelfItems).not.toHaveBeenCalled();
  });

  it("renders owner-scoped shelf items with public paths and activation prefill", async () => {
    const { default: LocalizedWishlistRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedWishlistRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    expect(mocks.listWishlistShelfItems).toHaveBeenCalledWith({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    });
    expect(html).toContain("Хочу спробувати");
    expect(html).toContain("Pomidor Cheri");
    expect(html).toContain("Спробувати пізніше");
    expect(html).toContain("/variety/pomidor-cheri-0000000101");
    expect(html).toContain(
      "/garden?catalog=pomidor-cheri-0000000101&amp;source=public-variety",
    );
    expect(html).toContain("Почати вести журнал");
    expect(html).toContain("Прибрати");
    expect(html).not.toMatch(
      /00000000-0000|session-1|private journal|journal body|plant_objects|quarantine|derivative|media key|ip_address|user_agent|email|phone|coordinates|invite|token/i,
    );
  });
});
