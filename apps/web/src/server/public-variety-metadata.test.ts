import { afterEach, describe, expect, it, vi } from "vitest";

import { emptyPublicOrganismCard } from "./public-organism-card-query";
import { resolvePublicSurfaceDiscoveryForRequest } from "./public-surface-discovery";
import {
  buildPublicVarietyJsonLd,
  buildPublicVarietySurfaceMetadata,
} from "./public-variety-metadata";
import {
  buildPublicVarietyDiscoverySource,
  type PublicVarietyPage,
} from "./public-variety-repository";

describe("public variety metadata", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("indexes a page with little text: there is no measured threshold (ADR-0022, D3)", () => {
    const page = buildPage({ rich: false });
    const surface = buildPublicVarietySurfaceMetadata(page);

    expect(surface.metadata.robots).toEqual({ index: true, follow: true });
    expect(surface.metadata.alternates).toMatchObject({
      canonical: expect.stringContaining("pomidor-cheri-0000000101"),
    });
    expect(surface.jsonLd).not.toBeNull();
  });

  it("recomputes from visible facts instead of trusting a stale page decision", () => {
    const page = buildPage({ rich: false });
    page.indexState = {
      ...page.indexState,
      value: "noindex",
      isIndexable: false,
      sitemapEligible: false,
      robots: { index: false, follow: false },
      reasons: ["candidate_input_unresolved"],
    };

    expect(buildPublicVarietyJsonLd(page)).not.toBeNull();
  });

  it("emits a Taxon with the permalink as @id, the identifiers as sameAs and a breadcrumb trail (ADR-0026 D9)", () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://example.test/base-path");
    const page = buildPage({ rich: true });
    page.catalog.identifiers = [
      { scheme: "eppo", value: "LYPES" },
      { scheme: "wikidata", value: "Q23501" },
      { scheme: "ua_register", value: "12345" },
    ];
    const jsonLd = buildPublicVarietyJsonLd(page);

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          url: "https://example.test/variety/pomidor-cheri-0000000101",
          mainEntity: {
            "@id":
              "https://example.test/id/00000000-0000-4000-8000-000000000101",
          },
        },
        {
          "@type": "Taxon",
          "@id": "https://example.test/id/00000000-0000-4000-8000-000000000101",
          name: "Pomidor Cheri",
          scientificName: "Pomidor Cheri",
          taxonRank: "cultivar",
          sameAs: [
            "https://gd.eppo.int/taxon/LYPES",
            "https://www.wikidata.org/wiki/Q23501",
          ],
          dateModified: "2026-08-23T00:00:00.000Z",
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { position: 1, name: "OverGarden", item: "https://example.test/" },
            {
              position: 2,
              name: "Pomidor Cheri",
              item: "https://example.test/variety/pomidor-cheri-0000000101",
            },
          ],
        },
        expect.objectContaining({ "@type": "Organization" }),
        expect.objectContaining({ "@type": "WebSite" }),
      ],
    });
    const taxon = (jsonLd as { "@graph": Record<string, unknown>[] })[
      "@graph"
    ][1];
    expect(taxon).not.toHaveProperty("parentTaxon");
    const serialized = JSON.stringify(jsonLd);
    expect(serialized).not.toMatch(
      /owner|quarantine|derivative|media|email|latitude|longitude|data\.gov|ua_register|12345/i,
    );
  });

  it("nests a form under its species: parentTaxon, a three-step breadcrumb and localized URLs", () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://example.test");
    const page = buildPage({ rich: true });
    page.catalog.speciesSlug = "solanum-lycopersicum";
    page.catalog.species = {
      canonicalName: "Solanum lycopersicum",
      publicSlug: "solanum-lycopersicum",
    };
    page.catalog.canonicalPath = "/species/solanum-lycopersicum/pomidor-cheri";
    const jsonLd = buildPublicVarietyJsonLd(page, "bg", "bg");

    expect(jsonLd).toMatchObject({
      "@graph": [
        {
          url: "https://example.test/bg/species/solanum-lycopersicum/pomidor-cheri",
        },
        {
          "@type": "Taxon",
          parentTaxon: {
            "@type": "Taxon",
            name: "Solanum lycopersicum",
            url: "https://example.test/bg/species/solanum-lycopersicum",
          },
        },
        {
          itemListElement: [
            { position: 1, item: "https://example.test/bg" },
            {
              position: 2,
              name: "Solanum lycopersicum",
              item: "https://example.test/bg/species/solanum-lycopersicum",
            },
            {
              position: 3,
              name: "Pomidor Cheri",
              item: "https://example.test/bg/species/solanum-lycopersicum/pomidor-cheri",
            },
          ],
        },
        expect.objectContaining({ "@type": "Organization" }),
        expect.objectContaining({ "@type": "WebSite" }),
      ],
    });
  });

  it("localizes visible chrome without claiming a UGC language", () => {
    const jsonLd = buildPublicVarietyJsonLd(buildPage({ rich: true }), "ru");
    expect(jsonLd).toMatchObject({
      "@graph": [
        expect.not.objectContaining({ inLanguage: expect.anything() }),
        expect.objectContaining({
          "@type": "Taxon",
          description: "Публичные записи сада: Pomidor Cheri.",
        }),
        expect.objectContaining({ "@type": "BreadcrumbList" }),
        expect.objectContaining({ "@type": "Organization" }),
        expect.objectContaining({ "@type": "WebSite" }),
      ],
    });
  });

  it("uses the species canonical path and rank for a species card", () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://example.test");
    const page = buildPage({ rich: true });
    page.catalog.catalogKind = "species";
    page.catalog.nodeKind = "taxon";
    page.catalog.rank = "species";
    page.catalog.publicSlug = "solanum-lycopersicum";
    page.catalog.canonicalName = "Solanum lycopersicum";
    page.catalog.scientificName = "Solanum lycopersicum";
    page.catalog.canonicalPath = "/species/solanum-lycopersicum";

    expect(buildPublicVarietyJsonLd(page)).toMatchObject({
      "@graph": [
        {
          url: "https://example.test/species/solanum-lycopersicum",
        },
        {
          "@type": "Taxon",
          scientificName: "Solanum lycopersicum",
          taxonRank: "species",
          description: "публічні записи про вид: Solanum lycopersicum.",
        },
        {
          "@type": "BreadcrumbList",
          "@id": "https://example.test/species/solanum-lycopersicum#breadcrumb",
        },
        expect.objectContaining({ "@type": "Organization" }),
        expect.objectContaining({ "@type": "WebSite" }),
      ],
    });
  });
});

function buildPage({ rich }: { rich: boolean }): PublicVarietyPage {
  const page = {
    catalog: {
      catalogItemId: "00000000-0000-4000-8000-000000000101",
      catalogKind: "plant_variety" as const,
      nodeKind: "cultivar",
      rank: null,
      kingdom: null,
      canonicalName: "Pomidor Cheri",
      scientificName: "Pomidor Cheri",
      publicSlug: "pomidor-cheri-0000000101",
      speciesSlug: null,
      species: null,
      canonicalPath: "/variety/pomidor-cheri-0000000101",
      permalinkPath: "/id/00000000-0000-4000-8000-000000000101",
      contentUpdatedAt: new Date("2026-08-23T00:00:00.000Z"),
      identifiers: [],
      source: "internal_seed",
      locale: "uk",
    },
    entryCount: 1,
    photoCount: 1,
    aggregateBodyLength: rich ? 900 : 10,
    latestMeaningfulAt: "2026-08-23T00:00:00.000Z",
    seedProof: null,
    sourceCredits: [],
    entries: [
      {
        id: "entry-1",
        title: "First ripe cluster",
        body: rich
          ? Array.from({ length: 130 }, (_, index) => `visible${index}`).join(
              " ",
            )
          : "short",
        entryDate: new Date("2026-06-20T12:00:00.000Z"),
        publicPath: "/journal/entry-1",
        plantObjectDisplayName: "Balcony tomato",
        varietyText: "Pomidor Cheri",
        safeLocationLabel: null,
        media: null,
      },
    ],
    card: emptyPublicOrganismCard({
      firstHandContentAt: new Date("2026-06-20T12:00:00.000Z"),
      hasFirstHandContent: true,
      gardenerCount: 1,
    }),
  } satisfies Omit<PublicVarietyPage, "indexState">;
  return {
    ...page,
    indexState: resolvePublicSurfaceDiscoveryForRequest(
      buildPublicVarietyDiscoverySource(page, "public_variety_repository"),
    ).decision,
  };
}
