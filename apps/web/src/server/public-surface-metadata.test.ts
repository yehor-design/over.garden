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

/**
 * ADR-0029 D1. Google ignores a relative `hreflang` outright and a relative
 * `og:url` resolves nowhere, so a path leaking out of this builder silently
 * disables the layer it belongs to. Walk every emitted value rather than
 * asserting the three we happen to remember.
 */
function everyEmittedUrl(metadata: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const visit = (value: unknown, key: string) => {
    if (typeof value === "string") {
      if (key === "canonical" || key === "url" || key === "x-default" ||
          /^[a-z]{2}(-[A-Za-z]+)?$/.test(key) || key === "images") {
        urls.push(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
      return;
    }
    if (value && typeof value === "object") {
      for (const [childKey, child] of Object.entries(value)) {
        visit(child, childKey);
      }
    }
  };
  visit(metadata.alternates, "alternates");
  visit(metadata.openGraph, "openGraph");
  visit(metadata.twitter, "twitter");
  return urls;
}

describe("public surface metadata", () => {
  it("emits no relative URL from any surface, in any locale", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      for (const type of [
        "Article",
        "BlogPosting",
        "CollectionPage",
        "ProfilePage",
        "ItemPage",
        "WebPage",
      ] as const) {
        const result = buildPublicSurfaceMetadata({
          discovery: discovery(["uk", "bg", "ru"]),
          locale,
          title: "Proof",
          description: "Proof",
          visibleFacts: {
            type,
            name: "Proof",
            image: "https://media.over.garden/proof.webp",
          },
        });
        const emitted = everyEmittedUrl(
          result.metadata as unknown as Record<string, unknown>,
        );
        expect(emitted.length).toBeGreaterThan(0);
        for (const url of emitted) {
          expect(url, `${locale}/${type} emitted a relative URL`).toMatch(
            /^https:\/\//,
          );
        }
      }
    }
  });

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
        canonical: "https://over.garden/bg/blog/proof-note",
        languages: {
          uk: "https://over.garden/blog/proof-note",
          bg: "https://over.garden/bg/blog/proof-note",
          ru: "https://over.garden/ru/blog/proof-note",
          "x-default": "https://over.garden/blog/proof-note",
        },
      },
      openGraph: {
        type: "article",
        siteName: "OverGarden",
        locale: "bg_BG",
        alternateLocale: ["uk_UA", "ru_BG"],
        url: "https://over.garden/bg/blog/proof-note",
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
      canonical: "https://over.garden/bg/blog/proof-note",
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
