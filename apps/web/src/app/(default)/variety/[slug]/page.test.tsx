import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyPublicOrganismCard } from "@/server/public-organism-card-query";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  readPublicCatalogAddress: vi.fn(),
  readPublicVarietyPageByCatalogItemId: vi.fn(),
  getEngagementSummary: vi.fn(),
  addCatalogPublicSlugToWishlistAction: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  getSiteShellSessionState: vi.fn(),
}));

vi.mock("@/server/public-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/public-cache")>()),
  readPublicCatalogAddress: mocks.readPublicCatalogAddress,
  readPublicVarietyPageByCatalogItemId:
    mocks.readPublicVarietyPageByCatalogItemId,
}));

vi.mock("@/server/engagement-repository", () => ({
  getEngagementSummary: mocks.getEngagementSummary,
}));

vi.mock("@/app/(default)/wishlist/actions", () => ({
  addCatalogPublicSlugToWishlistAction:
    mocks.addCatalogPublicSlugToWishlistAction,
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("@/server/site-shell-session", () => ({
  getSiteShellSessionState: mocks.getSiteShellSessionState,
}));

vi.mock("@/app/(default)/variety/[slug]/source-credits", () => ({
  PublicVarietySourceCredits: () => <section>Source credits</section>,
}));

// A database is configured. Without one a static page defers its render to
// the request (ADR-0032 D4) and these tests would be reading the fallback;
// `static-public-page.test.tsx` holds that branch.
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://unit.test/overgarden");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

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
    mocks.readPublicCatalogAddress.mockResolvedValue({
      status: "canonical",
      catalogItemId: ITEM_ID,
      canonicalPath: "/variety/pomidor-cheri-0000000101",
    });
    mocks.readPublicVarietyPageByCatalogItemId.mockResolvedValue({
      catalog: {
        catalogItemId: ITEM_ID,
        catalogKind: "plant_variety",
        nodeKind: "cultivar",
        rank: null,
        kingdom: null,
        canonicalName: "Pomidor Cheri",
        vernacularName: null,
        scientificName: "Pomidor Cheri",
        publicSlug: "pomidor-cheri-0000000101",
        speciesSlug: null,
        species: null,
        canonicalPath: "/variety/pomidor-cheri-0000000101",
        permalinkPath: `/id/${ITEM_ID}`,
        contentUpdatedAt: new Date("2026-06-20T10:00:00.000Z"),
        identifiers: [],
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
      card: emptyPublicOrganismCard({
        firstHandContentAt: "2026-06-20T10:00:00.000Z",
        hasFirstHandContent: true,
        gardenerCount: 1,
      }),
      entries: [
        {
          id: "entry-1",
          title: "First ripe cluster",
          body: "First-hand public note with no private fixture values.",
          sourceLanguage: "uk",
          entryDate: "2026-06-20",
          publicPath: "/journal/first-ripe-cluster",
          plantObjectDisplayName: "Balcony tomato",
          varietyText: "Pomidor Cheri",
          safeRegionCode: "UA-30",
          media: null,
        },
      ],
    });
    // The reader's cookie says Russian. The unprefixed route family is the
    // default locale's and renders Ukrainian regardless (ADR-0029 D10) — its
    // CDN copy is shared, so it cannot carry one reader's language.
    mocks.getRequestInterfaceLocale.mockResolvedValue("ru");
    mocks.getSiteShellSessionState.mockResolvedValue({
      isAuthenticated: false,
    });
  });

  it("never shows a reader a raw identity word", async () => {
    const { default: PublicVarietyRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await PublicVarietyRoute({
        params: Promise.resolve({ slug: "pomidor-cheri-0000000101" }),
      }),
    );

    // The status badge went with `catalog_items.status` (OVE-399): both
    // selectable values meant "in the catalog", so the badge said the same
    // thing on every card. What must still hold is that no internal word
    // reaches a reader.
    expect(html).not.toContain(">seeded<");
    expect(html).not.toContain(">confirmed<");
    expect(html).not.toContain(">active<");
  });

  it("renders a wishlist action without gating public variety reading", async () => {
    const { default: PublicVarietyRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await PublicVarietyRoute({
        params: Promise.resolve({ slug: "pomidor-cheri-0000000101" }),
      }),
    );

    expect(html).toContain("Зберегти до списку бажань");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("/auth/intent/start");
    expect(html).toContain('name="action" value="bookmark"');
    expect(html).toContain('name="action" value="comment"');
    expect(html).not.toContain("/api/engagement");
    expect(html).toContain('name="catalogPublicSlug"');
    expect(html).toContain('value="pomidor-cheri-0000000101"');
    // Adding the variety goes through object setup, which offers the
    // gardener's own objects of it first (OVE-485).
    expect(html).toContain(
      "/garden/objects/new?catalog=pomidor-cheri-0000000101",
    );
    expect(html).toContain("First ripe cluster");
  });

  it("renders the saved wishlist receipt from a region of its own, never from the card", async () => {
    // The receipt is what a redirect leaves in the address, so it is request
    // data — and the card is a static document (ADR-0032 D2): it renders the
    // same bytes whatever the query string says.
    const { default: PublicVarietyRoute } = await import("./page");
    const card = renderToStaticMarkup(
      await PublicVarietyRoute({
        params: Promise.resolve({ slug: "pomidor-cheri-0000000101" }),
        searchParams: new Promise(() => undefined),
      }),
    );
    expect(card).not.toContain("Збережено до вашого списку бажань.");

    const { WishlistSavedReceipt } =
      await import("@/app/catalog-evidence-route");
    const label = "Збережено до вашого списку бажань.";
    const saved = await WishlistSavedReceipt({
      searchParams: Promise.resolve({ wishlist: "saved" }),
      label,
    });
    expect(renderToStaticMarkup(saved)).toContain(label);
    expect(
      await WishlistSavedReceipt({
        searchParams: Promise.resolve({}),
        label,
      }),
    ).toBeNull();
  });

  it("indexes thin public variety metadata", async () => {
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "pomidor-cheri-0000000101" }),
      }),
    ).resolves.toMatchObject({
      robots: { index: true, follow: true },
      alternates: {
        canonical: "https://over.garden/variety/pomidor-cheri-0000000101",
      },
    });
  });

  it("keeps missing public variety metadata noindex", async () => {
    mocks.readPublicCatalogAddress.mockResolvedValueOnce({
      status: "not_found",
    });
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "missing-variety" }),
      }),
    ).resolves.toMatchObject({
      title: "Публічний сорт | OverGarden",
      robots: { index: false, follow: false },
    });
  });

  it("renders the unprefixed family in the default locale, whatever the reader's cookie says", async () => {
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
    // The kind in plain words (`OVE-497`), and the cultivar's own name as
    // the heading.
    expect(html).toContain(">сорт</p>");
    expect(html).not.toContain("Публічний");
    expect(html).toContain("Pomidor Cheri");
    expect(html).toContain("First ripe cluster");
  });

  // ADR-0029 D11, WCAG 3.1.2: a Bulgarian gardener's entry on a Ukrainian
  // card is read in Bulgarian. The date, region and name line above it are
  // the card's own and stay Ukrainian.
  it("marks a gardener's entry with its language, and nothing around it", async () => {
    // The page `beforeEach` serves, with its one entry written in Bulgarian.
    const page = await mocks.readPublicVarietyPageByCatalogItemId();
    mocks.readPublicVarietyPageByCatalogItemId.mockResolvedValue({
      ...page,
      entries: [
        {
          ...page.entries[0],
          sourceLanguage: "bg",
          title: "Първата зряла китка",
          body: "Узря три седмици след цъфтежа.",
        },
      ],
    });
    const { default: PublicVarietyRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await PublicVarietyRoute({
        params: Promise.resolve({ slug: "pomidor-cheri-0000000101" }),
      }),
    );

    expect(html).toContain('<main lang="uk"');
    expect(html).toMatch(/<h3[^>]*lang="bg"[^>]*>Първата зряла китка<\/h3>/u);
    expect(html).toMatch(
      /<p[^>]*lang="bg"[^>]*>Узря три седмици след цъфтежа\.<\/p>/u,
    );
    const card = html.slice(
      html.indexOf('aria-labelledby="organism-entry-entry-1-title"'),
    );
    const dateline = card.slice(0, card.indexOf("<h3"));
    expect(dateline).toContain('<time dateTime="2026-06-20');
    expect(dateline).toContain("Регіон: Україна — місто Київ");
    expect(dateline).toContain("Pomidor Cheri");
    expect(dateline).not.toContain("lang=");
  });
});
