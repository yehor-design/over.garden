import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("emits the shared visible-fact graph without private source fields", () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://example.test/base-path");
    const jsonLd = buildPublicVarietyJsonLd(buildPage({ rich: true }));

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          url: "https://example.test/variety/pomidor-cheri-0000000101",
        },
        {
          "@type": "CollectionPage",
          name: "Pomidor Cheri · публічні записи саду",
          hasPart: [{ "@type": "Thing", name: "First ripe cluster" }],
          about: "Catalog status: seeded",
        },
      ],
    });
    const serialized = JSON.stringify(jsonLd);
    expect(serialized).not.toMatch(
      /owner|quarantine|derivative|media|email|latitude|longitude|data\.gov/i,
    );
  });

  it("localizes visible collection chrome without claiming a UGC language", () => {
    const jsonLd = buildPublicVarietyJsonLd(buildPage({ rich: true }), "ru");
    expect(jsonLd).toMatchObject({
      "@graph": [
        expect.not.objectContaining({ inLanguage: expect.anything() }),
        expect.objectContaining({
          name: "Pomidor Cheri · Публичные записи сада",
        }),
      ],
    });
  });

  it("uses the catalog-kind canonical path", () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://example.test");
    const page = buildPage({ rich: true });
    page.catalog.catalogKind = "species";
    page.catalog.publicSlug = "solanum-lycopersicum";
    page.catalog.canonicalName = "Solanum lycopersicum";

    expect(buildPublicVarietyJsonLd(page)).toMatchObject({
      "@graph": [
        {
          url: "https://example.test/species/solanum-lycopersicum",
        },
        {
          name: "Solanum lycopersicum · публічні записи про вид",
        },
      ],
    });
  });
});

function buildPage({ rich }: { rich: boolean }): PublicVarietyPage {
  const page = {
    catalog: {
      catalogKind: "plant_variety" as const,
      canonicalName: "Pomidor Cheri",
      publicSlug: "pomidor-cheri-0000000101",
      status: "seeded" as const,
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
  } satisfies Omit<PublicVarietyPage, "indexState">;
  return {
    ...page,
    indexState: resolvePublicSurfaceDiscoveryForRequest(buildPublicVarietyDiscoverySource(page, "public_variety_repository")).decision,
  };
}
