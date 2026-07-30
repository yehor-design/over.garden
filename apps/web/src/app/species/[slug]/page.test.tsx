import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicVarietyPage: vi.fn(),
  buildPublicVarietyJsonLd: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  getSiteShellSessionState: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/server/public-variety-repository", () => ({
  getPublicVarietyPage: mocks.getPublicVarietyPage,
}));
vi.mock("@/server/public-variety-metadata", () => ({
  buildPublicVarietyJsonLd: mocks.buildPublicVarietyJsonLd,
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/site-shell-session", () => ({
  getSiteShellSessionState: mocks.getSiteShellSessionState,
}));
vi.mock("@/server/engagement-repository", () => ({
  getEngagementSummary: vi.fn(),
}));
vi.mock("@/app/wishlist/actions", () => ({
  addCatalogPublicSlugToWishlistAction: vi.fn(),
}));
vi.mock("@/app/variety/[slug]/source-credits", () => ({
  PublicVarietySourceCredits: () => <section>Source credits</section>,
}));

describe("species and breed catalog evidence routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.buildPublicVarietyJsonLd.mockReturnValue(null);
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.getSiteShellSessionState.mockResolvedValue({
      isAuthenticated: false,
    });
    mocks.getPublicVarietyPage.mockImplementation(
      async (slug: string, kind: "species" | "breed") => page(kind, slug),
    );
  });

  it("renders a species page with species semantics and canonical metadata", async () => {
    const { default: SpeciesRoute, generateMetadata } = await import("./page");
    const props = {
      params: Promise.resolve({ slug: "solanum-lycopersicum" }),
    };
    const html = renderToStaticMarkup(await SpeciesRoute(props));
    const metadata = await generateMetadata(props);

    expect(mocks.getPublicVarietyPage).toHaveBeenCalledWith(
      "solanum-lycopersicum",
      "species",
      undefined,
      "uk",
    );
    expect(html).toContain("Публічний вид");
    expect(html).toContain("Записати цей вид");
    expect(html).toContain('href="/objects?identity=species"');
    expect(html).not.toContain("списку бажань");
    expect(metadata).toMatchObject({
      title: "Solanum lycopersicum · вид | OverGarden",
      alternates: { canonical: "/species/solanum-lycopersicum" },
    });
  });

  it("renders a localized bee breed page without plant-variety actions", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
    const { default: BreedRoute, generateMetadata } =
      await import("../../breed/[slug]/page");
    const props = { params: Promise.resolve({ slug: "carpathian-bee" }) };
    const html = renderToStaticMarkup(await BreedRoute(props));
    const metadata = await generateMetadata(props);

    expect(html).toContain("Публична порода или линия");
    expect(html).toContain("Запишете тази порода или линия");
    expect(html).not.toContain("списъка с желания");
    expect(metadata).toMatchObject({
      alternates: { canonical: "/breed/carpathian-bee" },
    });
  });

  it("returns not found when the repository cannot provide the expected kind", async () => {
    mocks.getPublicVarietyPage.mockResolvedValue(null);
    const { default: SpeciesRoute } = await import("./page");

    await expect(
      SpeciesRoute({ params: Promise.resolve({ slug: "wrong-kind" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

function page(kind: "species" | "breed", slug: string) {
  return {
    catalog: {
      catalogKind: kind,
      canonicalName:
        kind === "species" ? "Solanum lycopersicum" : "Карпатська бджола",
      publicSlug: slug,
      status: "seeded",
      source: kind === "species" ? "species_backbone" : "ua_official_bee_breed",
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
      threshold: { minPublicEntryCount: 3, minAggregateBodyLength: 600 },
    },
    seedProof: null,
    sourceCredits: [],
    entries: [
      {
        id: "entry-1",
        title: "Public evidence",
        body: "Public journal evidence.",
        entryDate: "2026-07-10",
        publicPath: "/journal/public-evidence",
        plantObjectDisplayName: "Living object",
        varietyText: null,
        safeLocationLabel: null,
        media: null,
      },
    ],
  };
}
