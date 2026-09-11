import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyPublicOrganismCard } from "@/server/public-organism-card-query";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  readPublicCatalogAddress: vi.fn(),
  readPublicVarietyPageByCatalogItemId: vi.fn(),
  getEngagementSummary: vi.fn(async () => ({
    target: { kind: "variety", ref: "de-barao" },
    activeLikeCount: 0,
    comments: [],
  })),
  getRequestInterfaceLocale: vi.fn(),
  getSiteShellSessionState: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  permanentRedirect: mocks.permanentRedirect,
}));
vi.mock("@/server/public-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/public-cache")>()),
  readPublicCatalogAddress: mocks.readPublicCatalogAddress,
  readPublicVarietyPageByCatalogItemId:
    mocks.readPublicVarietyPageByCatalogItemId,
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/site-shell-session", () => ({
  getSiteShellSessionState: mocks.getSiteShellSessionState,
}));
vi.mock("@/server/engagement-repository", () => ({
  getEngagementSummary: mocks.getEngagementSummary,
}));
vi.mock("@/app/engagement/engagement-viewer", () => ({
  readViewerLikeState: vi.fn(async () => null),
}));
vi.mock("@/app/(default)/wishlist/actions", () => ({
  addCatalogPublicSlugToWishlistAction: vi.fn(),
}));
vi.mock("@/app/(default)/variety/[slug]/source-credits", () => ({
  PublicVarietySourceCredits: () => (
    <footer data-organism-section="attribution">Source credits</footer>
  ),
}));

describe("organism addresses (ADR-0026 D8, D9)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.getSiteShellSessionState.mockResolvedValue({
      isAuthenticated: false,
    });
    mocks.readPublicCatalogAddress.mockImplementation(async (request) => ({
      status: "canonical",
      catalogItemId: ITEM_ID,
      canonicalPath: canonicalPathFor(request),
    }));
    mocks.readPublicVarietyPageByCatalogItemId.mockImplementation(async () =>
      page("species", "solanum-lycopersicum"),
    );
  });

  it("renders a species at its hierarchical address with Taxon JSON-LD and canonical metadata", async () => {
    const { default: SpeciesRoute, generateMetadata } = await import("./page");
    const props = {
      params: Promise.resolve({ slug: "solanum-lycopersicum" }),
    };
    const html = renderToStaticMarkup(await SpeciesRoute(props));
    const metadata = await generateMetadata(props);

    expect(mocks.readPublicCatalogAddress).toHaveBeenCalledWith({
      kind: "species",
      speciesSlug: "solanum-lycopersicum",
      formSlug: null,
    });
    expect(mocks.readPublicVarietyPageByCatalogItemId).toHaveBeenCalledWith(
      ITEM_ID,
      "uk",
    );
    expect(html).toContain("Публічний вид");
    expect(html).toContain("Записати цей вид");
    expect(html).toContain('href="/objects?identity=species"');
    expect(html).not.toContain("списку бажань");
    // D9 section order: facts, experience, relations, names and sources, attribution.
    const markers = [
      'data-organism-section="facts"',
      'data-organism-section="experience"',
      'data-organism-section="relations"',
      'data-organism-section="names-and-sources"',
      'data-organism-section="attribution"',
    ];
    const positions = Object.fromEntries(
      markers.map((marker) => [marker, html.indexOf(marker)]),
    );
    expect(positions).toEqual(
      Object.fromEntries(markers.map((marker) => [marker, expect.any(Number)])),
    );
    const order = markers.map((marker) => positions[marker]!);
    expect(
      order.every((index) => index >= 0),
      JSON.stringify(positions),
    ).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain(
      "Solanum lycopersicum — вид. У каталозі 1 форма цього виду. Публічні журнали ведуть 2 садівники у 1 області.",
    );
    expect(html).toContain("Київська");
    expect(html).toContain('href="/species/solanum-lycopersicum/de-barao"');
    expect(html).toContain("Tuta absoluta");
    expect(html).toContain("основний живитель");
    expect(html).toMatch(
      /<details[^>]*data-organism-section="names-and-sources"/u,
    );
    expect(html).not.toMatch(/<details[^>]*open/u);
    expect(html).toContain("Джерела розходяться щодо прийнятої назви:");
    expect(html).toMatch(/"@type":\s*"Taxon"/u);
    expect(html).toContain(`/id/${ITEM_ID}`);
    expect(html).toContain("https://gd.eppo.int/taxon/LYPES");
    expect(html).toMatch(/"@type":\s*"BreadcrumbList"/u);
    expect(metadata).toMatchObject({
      title: "Solanum lycopersicum · вид | OverGarden",
      alternates: { canonical: "https://over.garden/species/solanum-lycopersicum" },
    });
    expect(mocks.permanentRedirect).not.toHaveBeenCalled();
  });

  it("shows presence for Ukraine and Bulgaria and the EPPO attribution with its date", async () => {
    const { default: SpeciesRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await SpeciesRoute({
        params: Promise.resolve({ slug: "solanum-lycopersicum" }),
      }),
    );

    expect(html).toContain('data-organism-section="presence"');
    expect(html).toContain('data-organism-presence="UA"');
    expect(html).toContain('data-organism-presence-status="present"');
    expect(html).toContain('data-organism-presence="BG"');
    expect(html).toContain('data-organism-presence-status="absent"');
    expect(html).toContain("Україна");
    expect(html).toContain("присутній");
    // The badge never claims more than EPPO wrote: the verbatim status and the
    // day it was observed sit beside the word (ADR-0026 D11).
    expect(html).toContain("Present, restricted distribution");
    expect(html).toContain('data-organism-attribution="eppo"');
    expect(html).toContain("EPPO Global Database, EPPO Open Data Licence");
    expect(html).toContain("Завантажено");
  });

  it("renders a form under its species from the [form] page, with the species as parentTaxon", async () => {
    mocks.readPublicVarietyPageByCatalogItemId.mockImplementation(async () =>
      page("plant_variety", "de-barao"),
    );
    const { default: FormRoute, generateMetadata } =
      await import("./[form]/page");
    const props = {
      params: Promise.resolve({
        slug: "solanum-lycopersicum",
        form: "de-barao",
      }),
    };
    const html = renderToStaticMarkup(await FormRoute(props));
    const metadata = await generateMetadata(props);

    expect(mocks.readPublicCatalogAddress).toHaveBeenCalledWith({
      kind: "species",
      speciesSlug: "solanum-lycopersicum",
      formSlug: "de-barao",
    });
    expect(html).toContain("Де Барао");
    expect(html).toMatch(/"parentTaxon":\s*\{/u);
    expect(html).toContain("/species/solanum-lycopersicum/de-barao");
    expect(mocks.getEngagementSummary).toHaveBeenCalledTimes(1);
    expect(metadata).toMatchObject({
      alternates: { canonical: "https://over.garden/species/solanum-lycopersicum/de-barao" },
    });
  });

  it("renders a source-only form reachable but noindex, with no JSON-LD and no engagement panel, and survives a refused panel", async () => {
    mocks.readPublicVarietyPageByCatalogItemId.mockImplementation(async () => ({
      ...page("plant_variety", "de-barao"),
      entryCount: 0,
      entries: [],
      card: emptyPublicOrganismCard(),
    }));
    const { default: FormRoute, generateMetadata } =
      await import("./[form]/page");
    const props = {
      params: Promise.resolve({
        slug: "solanum-lycopersicum",
        form: "de-barao",
      }),
    };
    const html = renderToStaticMarkup(await FormRoute(props));

    expect(html).toContain("Де Барао");
    expect(html).toContain("Публічних записів садівників ще немає.");
    expect(html).not.toMatch(/"@type":\s*"Taxon"/u);
    expect(html).not.toContain('data-organism-section="experience"');
    expect(html).not.toContain('data-organism-section="relations"');
    expect(mocks.getEngagementSummary).not.toHaveBeenCalled();
    await expect(generateMetadata(props)).resolves.toMatchObject({
      robots: { index: false, follow: false },
    });

    mocks.readPublicVarietyPageByCatalogItemId.mockImplementation(async () =>
      page("plant_variety", "de-barao"),
    );
    mocks.getEngagementSummary.mockRejectedValueOnce(
      new Error("Engagement target is not public."),
    );
    const degraded = renderToStaticMarkup(await FormRoute(props));
    expect(degraded).toContain("Де Барао");
    expect(degraded).toMatch(/"@type":\s*"Taxon"/u);
  });

  it("renders a localized bee breed page at its legacy address without plant-variety actions", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
    mocks.readPublicVarietyPageByCatalogItemId.mockImplementation(async () =>
      page("breed", "carpathian-bee"),
    );
    const { default: BreedRoute, generateMetadata } =
      await import("../../breed/[slug]/page");
    const props = { params: Promise.resolve({ slug: "carpathian-bee" }) };
    const html = renderToStaticMarkup(await BreedRoute(props));
    const metadata = await generateMetadata(props);

    expect(mocks.readPublicCatalogAddress).toHaveBeenCalledWith({
      kind: "legacy",
      catalogKind: "breed",
      slug: "carpathian-bee",
    });
    expect(html).toContain("Публична порода или линия");
    expect(html).toContain("Запишете тази порода или линия");
    expect(html).not.toContain("списъка с желания");
    expect(metadata).toMatchObject({
      alternates: { canonical: "https://over.garden/breed/carpathian-bee" },
    });
  });

  it("redirects a historical address to the canonical path on client navigation, localized", async () => {
    mocks.readPublicCatalogAddress.mockResolvedValue({
      status: "redirect",
      catalogItemId: ITEM_ID,
      canonicalPath: "/species/solanum-lycopersicum",
    });
    const { default: SpeciesRoute } = await import("./page");
    await expect(
      SpeciesRoute({
        params: Promise.resolve({ slug: "lycopersicon-esculentum" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/species/solanum-lycopersicum");

    const { default: LocalizedSpeciesRoute, generateMetadata } =
      await import("../../../[locale]/species/[slug]/page");
    mocks.getRequestInterfaceLocale.mockClear();
    await expect(
      LocalizedSpeciesRoute({
        params: Promise.resolve({
          locale: "bg",
          slug: "lycopersicon-esculentum",
        }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/bg/species/solanum-lycopersicum");
    expect(mocks.getRequestInterfaceLocale).not.toHaveBeenCalled();
    await expect(
      generateMetadata({
        params: Promise.resolve({
          locale: "bg",
          slug: "lycopersicon-esculentum",
        }),
      }),
    ).resolves.toMatchObject({ robots: { index: false, follow: false } });
    expect(mocks.readPublicVarietyPageByCatalogItemId).not.toHaveBeenCalled();
  });

  it("answers not found for an unknown slug, an unknown locale and a page the repository cannot provide", async () => {
    mocks.readPublicCatalogAddress.mockResolvedValueOnce({
      status: "not_found",
    });
    const { default: SpeciesRoute, generateMetadata } = await import("./page");
    await expect(
      SpeciesRoute({ params: Promise.resolve({ slug: "no-such-organism" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    mocks.readPublicCatalogAddress.mockResolvedValueOnce({
      status: "not_found",
    });
    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "no-such-organism" }),
      }),
    ).resolves.toMatchObject({
      title: "Публічний вид | OverGarden",
      robots: { index: false, follow: false },
    });

    const { default: LocalizedSpeciesRoute } =
      await import("../../../[locale]/species/[slug]/page");
    mocks.readPublicCatalogAddress.mockClear();
    await expect(
      LocalizedSpeciesRoute({
        params: Promise.resolve({ locale: "xx", slug: "solanum-lycopersicum" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.readPublicCatalogAddress).not.toHaveBeenCalled();

    mocks.readPublicVarietyPageByCatalogItemId.mockResolvedValueOnce(null);
    await expect(
      SpeciesRoute({
        params: Promise.resolve({ slug: "solanum-lycopersicum" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

function canonicalPathFor(request: {
  kind: string;
  speciesSlug?: string;
  formSlug?: string | null;
  catalogKind?: string;
  slug?: string;
}) {
  if (request.kind === "species") {
    return request.formSlug
      ? `/species/${request.speciesSlug}/${request.formSlug}`
      : `/species/${request.speciesSlug}`;
  }
  return `/${request.catalogKind === "breed" ? "breed" : "variety"}/${request.slug}`;
}

function page(kind: "species" | "breed" | "plant_variety", slug: string) {
  const species =
    kind === "plant_variety"
      ? {
          canonicalName: "Solanum lycopersicum",
          publicSlug: "solanum-lycopersicum",
        }
      : null;
  const canonicalName =
    kind === "species"
      ? "Solanum lycopersicum"
      : kind === "breed"
        ? "Карпатська бджола"
        : "Де Барао";
  return {
    catalog: {
      catalogItemId: ITEM_ID,
      catalogKind: kind,
      nodeKind:
        kind === "species" ? "taxon" : kind === "breed" ? "breed" : "cultivar",
      rank: kind === "species" ? "species" : null,
      canonicalName,
      scientificName: canonicalName,
      publicSlug: slug,
      speciesSlug: species?.publicSlug ?? null,
      species,
      canonicalPath:
        kind === "species"
          ? `/species/${slug}`
          : kind === "breed"
            ? `/breed/${slug}`
            : `/species/solanum-lycopersicum/${slug}`,
      permalinkPath: `/id/${ITEM_ID}`,
      contentUpdatedAt: new Date("2026-07-10T10:00:00.000Z"),
      identifiers: [{ scheme: "eppo", value: "LYPES" }],
      source:
        kind === "species"
          ? "species_backbone"
          : kind === "breed"
            ? "ua_official_bee_breed"
            : "ua_state_register",
      locale: "uk",
    },
    entryCount: 1,
    photoCount: 0,
    aggregateBodyLength: 200,
    qualityClass: "verified",
    latestMeaningfulAt: "2026-07-10T10:00:00.000Z",
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
    sourceCredits: [
      {
        sourceSlug: "eppo",
        sourceName: "EPPO Global Database",
        sourceVersion: "2026-09",
        sourceUrl: "https://gd.eppo.int/",
        license: "EPPO",
        licenseUrl: null,
        attributionRequired: true,
        attributionText: null,
        fetchedAt: "2026-09-02T00:00:00.000Z",
        lastObservedAt: "2026-09-03T00:00:00.000Z",
      },
    ],
    card: emptyPublicOrganismCard({
      firstHandContentAt: "2026-07-10T10:00:00.000Z",
      hasFirstHandContent: true,
      formCount: kind === "species" ? 1 : 0,
      gardenerCount: 2,
      regions: [
        {
          code: "UA-32",
          label: "Київська область",
          objectCount: 3,
          gardenerCount: 2,
        },
      ],
      forms:
        kind === "species"
          ? [
              {
                catalogItemId: "f1",
                canonicalName: "Де Барао",
                catalogKind: "plant_variety",
                publicPath: "/species/solanum-lycopersicum/de-barao",
                hostClass: null,
              },
            ]
          : [],
      pests:
        kind === "species"
          ? [
              {
                catalogItemId: "p1",
                canonicalName: "Tuta absoluta",
                catalogKind: "species",
                publicPath: "/species/tuta-absoluta",
                hostClass: "major_host",
              },
            ]
          : [],
      sourceGroups: [
        {
          sourceSlug: "col",
          sourceName: "Catalogue of Life",
          sourceVersion: "2026-08",
          observedAt: "2026-09-01T00:00:00.000Z",
          lines: [
            {
              kind: "name",
              label: "scientific_accepted",
              value: "Solanum lycopersicum L.",
              qualifier: "la",
              observedAt: "2026-09-01T00:00:00.000Z",
            },
          ],
        },
        {
          sourceSlug: "eppo",
          sourceName: "EPPO Global Database",
          sourceVersion: "2026-09",
          observedAt: "2026-09-03T00:00:00.000Z",
          lines: [
            {
              kind: "name",
              label: "scientific_accepted",
              value: "Lycopersicon esculentum Mill.",
              qualifier: "la",
              observedAt: "2026-09-02T00:00:00.000Z",
            },
            {
              kind: "identifier",
              label: "eppo",
              value: "LYPES",
              qualifier: null,
              observedAt: "2026-09-02T00:00:00.000Z",
            },
          ],
        },
      ],
      acceptedNameClaims: [
        { sourceName: "Catalogue of Life", name: "Solanum lycopersicum" },
        { sourceName: "EPPO Global Database", name: "Lycopersicon esculentum" },
      ],
      presence:
        kind === "species"
          ? [
              {
                regionCode: "UA",
                status: "present" as const,
                verbatim: "Present, restricted distribution",
                sourceName: "EPPO Global Database",
                observedAt: "2026-09-03T00:00:00.000Z",
              },
              {
                regionCode: "BG",
                status: "absent" as const,
                verbatim: "Absent, confirmed by survey",
                sourceName: "EPPO Global Database",
                observedAt: "2026-09-03T00:00:00.000Z",
              },
            ]
          : [],
      attributions: [
        {
          sourceSlug: "eppo",
          sourceName: "EPPO Global Database",
          text: "EPPO Global Database, EPPO Open Data Licence",
          downloadedAt: "2026-09-03T00:00:00.000Z",
        },
      ],
    }),
    entries: [
      {
        id: "entry-1",
        title: "First public note",
        body: "A public note with no private fixture values.",
        entryDate: "2026-07-10",
        publicPath: "/journal/first-public-note",
        plantObjectDisplayName: "Balcony organism",
        varietyText: canonicalName,
        safeLocationLabel: "Region: Kyiv",
        media: null,
      },
    ],
  };
}
