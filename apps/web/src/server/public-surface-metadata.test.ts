import { describe, expect, it } from "vitest";

import { resolvePublicSurfaceDiscovery } from "./public-surface-discovery";
import { buildPublicSurfaceMetadata } from "./public-surface-metadata";

const RICH_TEXT = Array.from(
  { length: 120 },
  (_, index) => `visible${index}`,
).join(" ");

function discovery(equivalentLocales: readonly ("uk" | "bg" | "ru")[]) {
  return resolvePublicSurfaceDiscovery(
    {
      consumerId: "localized_blog_post",
      candidateState: "candidate",
      visibleText: [RICH_TEXT],
      distinctPublicEntityIds: ["topic-proof"],
      canonicalPath: "/bg/blog/proof-note",
      equivalentLocales,
    });
}

describe("public surface metadata", () => {
  it("emits one canonical, actual language alternates, and visible-fact JSON-LD for an admitted source", () => {
    const result = buildPublicSurfaceMetadata({
      discovery: discovery(["uk", "bg", "ru"]),
      locale: "bg",
      title: "Доказателствена бележка",
      description: "Видимо описание",
      visibleFacts: {
        type: "Article",
        name: "Доказателствена бележка",
        description: "Видимо описание",
        datePublished: "2026-08-23T00:00:00.000Z",
        trustQualifier: "OverGarden editorial",
      },
    });

    expect(result.metadata).toMatchObject({
      alternates: {
        canonical: "/bg/blog/proof-note",
        languages: {
          uk: "/blog/proof-note",
          bg: "/bg/blog/proof-note",
          ru: "/ru/blog/proof-note",
          "x-default": "/blog/proof-note",
        },
      },
      robots: { index: true, follow: true },
    });
    expect(result.jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          name: "Доказателствена бележка",
          description: "Видимо описание",
          inLanguage: "bg",
        },
        {
          "@type": "Article",
          headline: "Доказателствена бележка",
          datePublished: "2026-08-23T00:00:00.000Z",
          about: "OverGarden editorial",
        },
      ],
    });
  });

  it("does not manufacture cross-locale alternates for a singleton authored source", () => {
    const result = buildPublicSurfaceMetadata({
      discovery: discovery(["bg"]),
      locale: "bg",
      title: "Един източник",
      description: "Само на български",
      visibleFacts: { type: "WebPage", name: "Един източник" },
    });

    expect(result.metadata.alternates).toEqual({
      canonical: "/bg/blog/proof-note",
    });
  });

  it("omits canonical admission and JSON-LD for a refused candidate", () => {
    const refused = resolvePublicSurfaceDiscovery(
      {
        consumerId: "localized_blog_post",
        candidateState: "candidate",
        visibleText: [],
        distinctPublicEntityIds: [],
        canonicalPath: "/blog/thin",
        equivalentLocales: ["uk"],
      });
    const result = buildPublicSurfaceMetadata({
      discovery: refused,
      locale: "uk",
      title: "Thin",
      visibleFacts: { type: "WebPage", name: "Thin" },
    });

    expect(result.metadata).toMatchObject({
      title: "Thin",
      robots: { index: false, follow: false },
    });
    expect(result.metadata.alternates).toBeUndefined();
    expect(result.jsonLd).toBeNull();
  });
});
