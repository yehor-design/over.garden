import { afterEach, describe, expect, it, vi } from "vitest";

import { evaluatePublicVarietyIndexState } from "./public-variety-indexing";
import { buildPublicVarietyJsonLd } from "./public-variety-metadata";
import type { PublicVarietyPage } from "./public-variety-repository";

describe("public variety metadata", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("omits JSON-LD for thin noindex pages", () => {
    const page = buildPage({
      entryCount: 1,
      aggregateBodyLength: 200,
    });

    expect(buildPublicVarietyJsonLd(page)).toBeNull();
  });

  it("emits bounded JSON-LD for indexable pages without private fields", () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://example.test/base-path");
    const page = buildPage({
      entryCount: 3,
      aggregateBodyLength: 900,
    });

    const jsonLd = buildPublicVarietyJsonLd(page);

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Pomidor Cheri garden journal entries",
      url: "https://example.test/variety/pomidor-cheri-0000000101",
      isPartOf: {
        "@type": "WebSite",
        name: "OverGarden",
        url: "https://example.test/",
      },
      about: {
        "@type": "Thing",
        name: "Pomidor Cheri",
      },
      hasPart: [
        {
          "@type": "CreativeWork",
          headline: "First ripe cluster",
          datePublished: "2026-06-20",
          url: "https://example.test/journal/entry-1",
        },
      ],
    });

    const serialized = JSON.stringify(jsonLd);
    expect(serialized).not.toContain("Region");
    expect(serialized).not.toContain("UA-30");
    expect(serialized).not.toContain("fixture body");
    expect(serialized).not.toContain("owner");
    expect(serialized).not.toContain("quarantine");
    expect(serialized).not.toContain("derivative");
    expect(serialized).not.toContain("media");
    expect(serialized).not.toContain("email");
  });
});

function buildPage({
  entryCount,
  aggregateBodyLength,
}: {
  entryCount: number;
  aggregateBodyLength: number;
}): PublicVarietyPage {
  return {
    catalog: {
      canonicalName: "Pomidor Cheri",
      publicSlug: "pomidor-cheri-0000000101",
      status: "seeded",
      source: "seed",
      locale: "uk",
    },
    entryCount,
    photoCount: 1,
    aggregateBodyLength,
    indexState: evaluatePublicVarietyIndexState({
      entryCount,
      aggregateBodyLength,
    }),
    seedProof: null,
    entries: [
      {
        id: "entry-1",
        title: "First ripe cluster",
        body: "Private fixture body with UA-30 and owner email hidden@example.test.",
        entryDate: new Date("2026-06-20T12:00:00.000Z"),
        publicPath: "/journal/entry-1",
        plantObjectDisplayName: "Balcony tomato",
        varietyText: "Pomidor Cheri",
        safeLocationLabel: "Region: Kyiv",
        media: {
          id: "media-1",
          derivativeKey: "public/derivative.webp",
          publicUrl: "https://media.example.test/public/derivative.webp",
        },
      },
    ],
  };
}
