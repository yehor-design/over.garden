import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicFeedEntry } from "@/server/public-feed-repository";
import type { SpeciesPage } from "@/server/species-page";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  readPublicCatalogAddress: vi.fn(),
  readSpeciesPage: vi.fn(),
  readSpeciesEntries: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
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
  unstable_rethrow: () => undefined,
}));
vi.mock("@/server/public-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/public-cache")>()),
  readPublicCatalogAddress: mocks.readPublicCatalogAddress,
  readSpeciesPage: mocks.readSpeciesPage,
  readSpeciesEntries: mocks.readSpeciesEntries,
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
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

describe("a species page (OVE-519)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.readPublicCatalogAddress.mockImplementation(async (request) => ({
      status: "canonical",
      catalogItemId: ITEM_ID,
      canonicalPath: canonicalPathFor(request),
    }));
    mocks.readSpeciesPage.mockImplementation(async () => species());
  });

  it("is the name, the Latin name under it, the text, «Записи» and the entries — and nothing else", async () => {
    const { default: SpeciesRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await SpeciesRoute({
        params: Promise.resolve({ slug: "solanum-lycopersicum" }),
      }),
    );

    expect(mocks.readPublicCatalogAddress).toHaveBeenCalledWith({
      kind: "species",
      speciesSlug: "solanum-lycopersicum",
      formSlug: null,
    });
    expect(mocks.readSpeciesPage).toHaveBeenCalledWith(ITEM_ID, "uk");
    expect(html).toContain(">Помідор їстівний</h1>");
    expect(html).toMatch(
      /<p lang="la" data-species-latin="true"[^>]*>Solanum lycopersicum<\/p>/u,
    );
    expect(html).toContain(
      ">Записи про цю рослину від людей, які ведуть її журнал на Overgarden.</p>",
    );
    expect(html).toMatch(/<h2[^>]*>Записи<\/h2>/u);
    expect(html).toContain("Перші плоди");
    expect(html).toContain('href="/@olena/post/3"');

    // The five parts, in order, read out of the document.
    const order = [
      "<h1",
      "data-species-latin",
      "data-species-text",
      ">Записи</h2>",
      "Перші плоди",
    ].map((marker) => html.indexOf(marker));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    // Nothing else (DESIGN.md §5.18): no section, count, source, rail,
    // «Додати в мій сад» or owner control — for anybody.
    expect(html).not.toContain("Додати в мій сад");
    expect(html).not.toContain("data-organism-section");
    expect(html).not.toContain("/garden/objects/new");
    expect(html).not.toContain("Catalogue of Life");
    expect(html).not.toMatch(/\d+ (запис|фото|садівник)/u);
    expect(html.match(/<h2/gu)).toHaveLength(1);
  });

  it("says what it shows in its metadata: the two names, the visible text, the newest photo", async () => {
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "solanum-lycopersicum" }),
    });

    expect(metadata).toMatchObject({
      title: "Помідор їстівний · Solanum lycopersicum | OverGarden",
      description:
        "Записи про цю рослину від людей, які ведуть її журнал на Overgarden.",
      robots: { index: true, follow: true },
      alternates: {
        canonical: "https://over.garden/species/solanum-lycopersicum",
        languages: {
          uk: "https://over.garden/species/solanum-lycopersicum",
          bg: "https://over.garden/bg/species/solanum-lycopersicum",
          ru: "https://over.garden/ru/species/solanum-lycopersicum",
        },
      },
      openGraph: { images: ["https://media.over.garden/tomato.webp"] },
    });
  });

  it("names in its JSON-LD only what is on the page: the organism by its two names and the listed entries", async () => {
    const { default: SpeciesRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await SpeciesRoute({
        params: Promise.resolve({ slug: "solanum-lycopersicum" }),
      }),
    );
    const graph = jsonLdGraph(html);
    const taxon = graph.find((node) => node["@type"] === "Taxon");

    expect(taxon).toEqual({
      "@type": "Taxon",
      "@id": `https://over.garden/id/${ITEM_ID}`,
      url: "https://over.garden/species/solanum-lycopersicum",
      name: "Помідор їстівний",
      scientificName: "Solanum lycopersicum",
      description:
        "Записи про цю рослину від людей, які ведуть її журнал на Overgarden.",
      subjectOf: [
        {
          "@type": "Article",
          "@id": "https://over.garden/@olena/post/3#article",
          url: "https://over.garden/@olena/post/3",
        },
      ],
    });
    expect(graph.some((node) => node["@type"] === "BreadcrumbList")).toBe(
      false,
    );
  });

  it("links a later portion with «Показати ще» at its own `?cursor=` address", async () => {
    mocks.readSpeciesPage.mockImplementation(async () =>
      species({ nextCursor: "next-portion" }),
    );
    const { default: SpeciesRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await SpeciesRoute({
        params: Promise.resolve({ slug: "solanum-lycopersicum" }),
      }),
    );

    expect(html).toContain(
      'href="/species/solanum-lycopersicum?cursor=next-portion"',
    );
    expect(html).toContain("Показати ще");
  });

  it("renders a later portion from the `/q` twin, under the same header and canonical", async () => {
    mocks.readSpeciesEntries.mockResolvedValue({
      entries: [entry({ id: "e2", title: "Зав'язь", number: 2 })],
      nextCursor: null,
    });
    const { default: PortionRoute, generateMetadata } =
      await import("../../../[locale]/q/species/[slug]/page");
    const props = {
      params: Promise.resolve({ locale: "uk", slug: "solanum-lycopersicum" }),
      searchParams: Promise.resolve({ cursor: "second" }),
    };
    const html = renderToStaticMarkup(await PortionRoute(props));

    expect(mocks.readSpeciesEntries).toHaveBeenCalledWith(
      ITEM_ID,
      "second",
      "uk",
    );
    expect(html).toContain(">Помідор їстівний</h1>");
    expect(html).toContain("Зав&#x27;язь");
    expect(html).not.toContain("Перші плоди");
    // A later portion's first photograph is never the page's priority image.
    expect(html).not.toContain('fetchPriority="high"');
    await expect(generateMetadata(props)).resolves.toMatchObject({
      alternates: {
        canonical: "https://over.garden/species/solanum-lycopersicum",
      },
    });
  });

  it("keeps an unpublished page reachable, noindex, with its header and an empty state", async () => {
    mocks.readSpeciesPage.mockImplementation(async () =>
      species({ published: false, entries: [], shareImage: null }),
    );
    const { default: SpeciesRoute, generateMetadata } = await import("./page");
    const props = {
      params: Promise.resolve({ slug: "solanum-lycopersicum" }),
    };
    const html = renderToStaticMarkup(await SpeciesRoute(props));
    const metadata = await generateMetadata(props);

    expect(html).toContain('data-species-published="false"');
    expect(html).toContain(">Помідор їстівний</h1>");
    expect(html).toMatch(/<h2[^>]*>Записи<\/h2>/u);
    expect(html).toContain("Публічних записів ще немає.");
    expect(html).not.toContain("application/ld+json");
    expect(metadata).toMatchObject({
      robots: { index: false, follow: false },
      description:
        "Записи про цю рослину від людей, які ведуть її журнал на Overgarden.",
    });
    expect(metadata).not.toHaveProperty("alternates");
  });

  it("uses the animal placeholder for an animal and the Latin heading when there is no common name", async () => {
    mocks.readSpeciesPage.mockImplementation(async () =>
      species({
        kingdom: "Animalia",
        vernacularName: null,
        canonicalName: "Apis mellifera",
        scientificName: "Apis mellifera",
      }),
    );
    const { default: SpeciesRoute, generateMetadata } = await import("./page");
    const props = { params: Promise.resolve({ slug: "apis-mellifera" }) };
    const html = renderToStaticMarkup(await SpeciesRoute(props));

    expect(html).toContain('<h1 lang="la"');
    expect(html).toContain(">Apis mellifera</h1>");
    expect(html).not.toContain("data-species-latin");
    expect(html).toContain(
      "Записи про цю тварину від людей, які ведуть її журнал на Overgarden.",
    );
    await expect(generateMetadata(props)).resolves.toMatchObject({
      title: "Apis mellifera | OverGarden",
    });
  });

  it("renders a cultivar under its species with that form's placeholder and a link to the species", async () => {
    mocks.readSpeciesPage.mockImplementation(async () =>
      species({
        catalogKind: "plant_variety",
        nodeKind: "cultivar",
        canonicalName: "Де Барао",
        vernacularName: null,
        scientificName: "Де Барао",
        publicSlug: "de-barao",
        canonicalPath: "/species/solanum-lycopersicum/de-barao",
        species: {
          scientificName: "Solanum lycopersicum",
          displayName: "помідор їстівний",
          publicSlug: "solanum-lycopersicum",
        },
      }),
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

    expect(html).toContain(">Де Барао</h1>");
    expect(html).toMatch(
      /<a[^>]*href="\/species\/solanum-lycopersicum"[^>]*>Помідор їстівний <span lang="la" class="italic">Solanum lycopersicum<\/span><\/a>/u,
    );
    expect(html).toContain(
      "Записи про цей сорт від людей, які ведуть його журнал на Overgarden.",
    );
    const taxon = jsonLdGraph(html).find((node) => node["@type"] === "Taxon");
    expect(taxon).toMatchObject({
      name: "Де Барао",
      parentTaxon: {
        "@type": "Taxon",
        name: "Помідор їстівний",
        url: "https://over.garden/species/solanum-lycopersicum",
      },
    });
    expect(taxon).not.toHaveProperty("scientificName");
    await expect(generateMetadata(props)).resolves.toMatchObject({
      title: "Де Барао · Solanum lycopersicum | OverGarden",
    });
  });

  it("renders a breed at its legacy address in the route family's language, fully translated", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.readSpeciesPage.mockImplementation(async () =>
      species({
        catalogKind: "breed",
        nodeKind: "breed",
        kingdom: "Animalia",
        canonicalName: "Карпатська бджола",
        vernacularName: null,
        scientificName: "Карпатська бджола",
        publicSlug: "carpathian-bee",
        canonicalPath: "/breed/carpathian-bee",
        entries: [],
        published: false,
      }),
    );
    const { default: BreedRoute } =
      await import("../../../[locale]/breed/[slug]/page");
    const html = renderToStaticMarkup(
      await BreedRoute({
        params: Promise.resolve({ locale: "bg", slug: "carpathian-bee" }),
      }),
    );

    expect(mocks.readPublicCatalogAddress).toHaveBeenCalledWith({
      kind: "legacy",
      catalogKind: "breed",
      slug: "carpathian-bee",
    });
    expect(mocks.readSpeciesPage).toHaveBeenCalledWith(ITEM_ID, "bg");
    expect(html).toContain('lang="bg"');
    expect(html).toContain(
      "Записи за тази порода от хора, които водят дневника ѝ в Overgarden.",
    );
    expect(html).toContain("Още няма публични записи.");
    expect(html).not.toMatch(/[іїєґ]/u);
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
    await expect(
      LocalizedSpeciesRoute({
        params: Promise.resolve({
          locale: "bg",
          slug: "lycopersicon-esculentum",
        }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/bg/species/solanum-lycopersicum");
    await expect(
      generateMetadata({
        params: Promise.resolve({
          locale: "bg",
          slug: "lycopersicon-esculentum",
        }),
      }),
    ).resolves.toMatchObject({ robots: { index: false, follow: false } });
    expect(mocks.readSpeciesPage).not.toHaveBeenCalled();
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
    ).resolves.toMatchObject({ robots: { index: false, follow: false } });

    const { default: LocalizedSpeciesRoute } =
      await import("../../../[locale]/species/[slug]/page");
    mocks.readPublicCatalogAddress.mockClear();
    await expect(
      LocalizedSpeciesRoute({
        params: Promise.resolve({ locale: "xx", slug: "solanum-lycopersicum" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.readPublicCatalogAddress).not.toHaveBeenCalled();

    mocks.readSpeciesPage.mockResolvedValueOnce(null);
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

function jsonLdGraph(html: string) {
  const match = html.match(
    /<script type="application\/ld\+json">([^<]*)<\/script>/u,
  );
  expect(match).not.toBeNull();
  return JSON.parse(match![1]!)["@graph"] as Array<Record<string, unknown>>;
}

function entry(input: { id: string; title: string; number: number }) {
  return {
    id: input.id,
    title: input.title,
    excerpt: "Перші червоні помідори на балконі.",
    excerptTruncated: false,
    sourceLanguage: "uk",
    entryDate: "2026-08-01",
    publishedAt: "2026-08-02T10:00:00.000Z",
    publicPath: `/@olena/post/${input.number}`,
    object: {
      id: "22222222-2222-4222-8222-222222222222",
      displayName: "Помідори на балконі",
      kind: "plant",
      publicPath: "/@olena/objects/pomidory",
      safeRegionCode: null,
    },
    author: {
      handle: "olena",
      displayName: "Олена",
      avatarUrl: null,
      profilePath: "/@olena",
    },
    media: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        publicUrl: "https://media.over.garden/tomato.webp",
        focalX: 0.5,
        focalY: 0.5,
        intrinsicWidth: 1200,
        intrinsicHeight: 900,
        placeholderDataUri: null,
        variantLongEdges: [],
      },
    ],
    topics: [],
  } satisfies PublicFeedEntry;
}

function species(
  overrides: Partial<SpeciesPage["catalog"]> & {
    published?: boolean;
    entries?: PublicFeedEntry[];
    nextCursor?: string | null;
    shareImage?: SpeciesPage["shareImage"];
  } = {},
): SpeciesPage {
  const { published, entries, nextCursor, shareImage, ...catalog } = overrides;
  const listed = entries ?? [entry({ id: "e3", title: "Перші плоди", number: 3 })];
  return {
    catalog: {
      catalogItemId: ITEM_ID,
      catalogKind: "species",
      nodeKind: "taxon",
      rank: "species",
      kingdom: "Plantae",
      canonicalName: "Solanum lycopersicum",
      vernacularName: "помідор їстівний",
      scientificName: "Solanum lycopersicum",
      publicSlug: "solanum-lycopersicum",
      species: null,
      canonicalPath: "/species/solanum-lycopersicum",
      permalinkPath: `/id/${ITEM_ID}`,
      ...catalog,
    },
    published: published ?? true,
    entries: listed,
    nextCursor: nextCursor ?? null,
    shareImage:
      shareImage === undefined ? (listed[0]?.media[0] ?? null) : shareImage,
  };
}
