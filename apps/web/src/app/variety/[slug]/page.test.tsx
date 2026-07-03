import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicVarietyPage: vi.fn(),
  buildPublicVarietyJsonLd: vi.fn(),
}));

vi.mock("@/server/public-variety-repository", () => ({
  getPublicVarietyPage: mocks.getPublicVarietyPage,
}));

vi.mock("@/server/public-variety-metadata", () => ({
  buildPublicVarietyJsonLd: mocks.buildPublicVarietyJsonLd,
}));

vi.mock("./source-credits", () => ({
  PublicVarietySourceCredits: () => <section>Source credits</section>,
}));

describe("/variety/[slug]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.buildPublicVarietyJsonLd.mockReturnValue(null);
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
  });

  it("renders catalog status through user-facing labels", async () => {
    const { default: PublicVarietyRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await PublicVarietyRoute({
        params: Promise.resolve({ slug: "pomidor-cheri-0000000101" }),
      }),
    );

    expect(html).toContain("Pilot catalog");
    expect(html).not.toContain(">seeded<");
    expect(html).not.toContain(">confirmed<");
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
      title: "Variety | OverGarden",
      robots: { index: false, follow: false },
    });
  });
});
