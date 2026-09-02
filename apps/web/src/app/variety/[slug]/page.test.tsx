import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicVarietyPage: vi.fn(),
  getEngagementSummary: vi.fn(),
  addCatalogPublicSlugToWishlistAction: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  getSiteShellSessionState: vi.fn(),
}));

vi.mock("@/server/public-variety-repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/public-variety-repository")
  >()),
  getPublicVarietyPage: mocks.getPublicVarietyPage,
}));

vi.mock("@/server/engagement-repository", () => ({
  getEngagementSummary: mocks.getEngagementSummary,
}));

vi.mock("@/app/wishlist/actions", () => ({
  addCatalogPublicSlugToWishlistAction:
    mocks.addCatalogPublicSlugToWishlistAction,
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("@/server/site-shell-session", () => ({
  getSiteShellSessionState: mocks.getSiteShellSessionState,
}));

vi.mock("@/app/variety/[slug]/source-credits", () => ({
  PublicVarietySourceCredits: () => <section>Source credits</section>,
}));

describe("/variety/[slug]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getEngagementSummary.mockResolvedValue({
      target: {
        kind: "variety",
        ref: "pomidor-cheri-0000000101",
      },
      activeLikeCount: 0,
      comments: [],
    });
    mocks.getPublicVarietyPage.mockResolvedValue({
      catalog: {
        catalogKind: "plant_variety",
        canonicalName: "Pomidor Cheri",
        publicSlug: "pomidor-cheri-0000000101",
        status: "seeded",
        source: "seed",
        locale: "uk",
      },
      entryCount: 1,
      photoCount: 0,
      aggregateBodyLength: 200,
      qualityClass: "verified",
      latestMeaningfulAt: "2026-06-20T10:00:00.000Z",
      indexState: {
        value: "noindex",
        isIndexable: false,
        sitemapEligible: false,
        robots: { index: false, follow: false },
        reasons: ["entry_count_below_threshold"],
        threshold: {
          minPublicEntryCount: 3,
          minAggregateBodyLength: 600,
        },
      },
      seedProof: null,
      sourceCredits: [],
      entries: [
        {
          id: "entry-1",
          title: "First ripe cluster",
          body: "First-hand public note with no private fixture values.",
          entryDate: "2026-06-20",
          publicPath: "/journal/first-ripe-cluster",
          plantObjectDisplayName: "Balcony tomato",
          varietyText: "Pomidor Cheri",
          safeLocationLabel: "Region: Kyiv",
          media: null,
        },
      ],
    });
    mocks.getRequestInterfaceLocale.mockResolvedValue("ru");
    mocks.getSiteShellSessionState.mockResolvedValue({
      isAuthenticated: false,
    });
  });

  it("renders catalog status through user-facing labels", async () => {
    const { default: PublicVarietyRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await PublicVarietyRoute({
        params: Promise.resolve({ slug: "pomidor-cheri-0000000101" }),
      }),
    );

    expect(html).toContain("Пилотный каталог");
    expect(html).not.toContain(">seeded<");
    expect(html).not.toContain(">confirmed<");
  });

  it("renders a wishlist action without gating public variety reading", async () => {
    const { default: PublicVarietyRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await PublicVarietyRoute({
        params: Promise.resolve({ slug: "pomidor-cheri-0000000101" }),
      }),
    );

    expect(html).toContain("Сохранить в список желаний");
    expect(html).toContain("/api/engagement/likes");
    expect(html).toContain("/auth/intent/start");
    expect(html).toContain('name="action" value="bookmark"');
    expect(html).toContain('name="action" value="comment"');
    expect(html).not.toContain("/api/engagement/bookmarks");
    expect(html).not.toContain("/api/engagement/comments");
    expect(html).toContain('name="catalogPublicSlug"');
    expect(html).toContain('value="pomidor-cheri-0000000101"');
    expect(html).toContain("/garden?catalog=pomidor-cheri-0000000101");
    expect(html).toContain("First ripe cluster");
  });

  it("renders the saved wishlist status after a successful action redirect", async () => {
    const { default: PublicVarietyRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await PublicVarietyRoute({
        params: Promise.resolve({ slug: "pomidor-cheri-0000000101" }),
        searchParams: Promise.resolve({ wishlist: "saved" }),
      }),
    );

    expect(html).toContain("Сохранено в ваш список желаний.");
  });

  it("indexes thin public variety metadata", async () => {
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "pomidor-cheri-0000000101" }),
      }),
    ).resolves.toMatchObject({
      robots: { index: true, follow: true },
      alternates: { canonical: "/variety/pomidor-cheri-0000000101" },
    });
  });

  it("keeps missing public variety metadata noindex", async () => {
    mocks.getPublicVarietyPage.mockResolvedValueOnce(null);
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "missing-variety" }),
      }),
    ).resolves.toMatchObject({
      title: "Публичный сорт | OverGarden",
      robots: { index: false, follow: false },
    });
  });

  it("localizes variety chrome and metadata without translating canonical catalog or journal values", async () => {
    const { default: PublicVarietyRoute, generateMetadata } =
      await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "pomidor-cheri-0000000101" }),
    });
    const html = renderToStaticMarkup(
      await PublicVarietyRoute({
        params: Promise.resolve({ slug: "pomidor-cheri-0000000101" }),
      }),
    );

    expect(metadata.title).toBe("Pomidor Cheri · сорт | OverGarden");
    expect(html).toContain("Публичный сорт");
    expect(html).toContain("Pomidor Cheri");
    expect(html).toContain("First ripe cluster");
  });
});
