import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicVarietyPage: vi.fn(),
  buildPublicVarietyJsonLd: vi.fn(),
  getEngagementSummary: vi.fn(),
  addCatalogPublicSlugToWishlistAction: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
}));

vi.mock("@/server/public-variety-repository", () => ({
  getPublicVarietyPage: mocks.getPublicVarietyPage,
}));

vi.mock("@/server/public-variety-metadata", () => ({
  buildPublicVarietyJsonLd: mocks.buildPublicVarietyJsonLd,
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

vi.mock("./source-credits", () => ({
  PublicVarietySourceCredits: () => <section>Source credits</section>,
}));

describe("/variety/[slug]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.buildPublicVarietyJsonLd.mockReturnValue(null);
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
        canonicalName: "Pomidor Cheri",
        publicSlug: "pomidor-cheri-0000000101",
        status: "seeded",
        source: "seed",
        locale: "uk",
      },
      entryCount: 1,
      photoCount: 0,
      aggregateBodyLength: 200,
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
    expect(html).toContain("/api/engagement/bookmarks");
    expect(html).toContain("/api/engagement/comments");
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

  it("keeps thin public variety metadata noindex", async () => {
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "pomidor-cheri-0000000101" }),
      }),
    ).resolves.toMatchObject({
      robots: { index: false, follow: false },
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
