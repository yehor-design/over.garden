import { describe, expect, it } from "vitest";

import { resolvePublicSurfaceDiscovery } from "./public-surface-discovery";
import { buildPublicSurfaceMetadata } from "./public-surface-metadata";

const RICH_TEXT = Array.from(
  { length: 120 },
  (_, index) => `visible${index}`,
).join(" ");

/** The same, with the canonical path the caller is proving. */
function indexableDiscovery(
  canonicalPath: string,
  equivalentLocales: readonly ("uk" | "bg" | "ru")[],
) {
  return resolvePublicSurfaceDiscovery({
    consumerId: "localized_blog_post",
    candidateState: "candidate",
    visibleText: [RICH_TEXT],
    distinctPublicEntityIds: ["topic-proof"],
    canonicalPath,
    equivalentLocales,
  });
}

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
    // The page, the thing on it, and the site that publishes both. The site
    // nodes are repeated on every page on purpose: a crawler that fetches one
    // page has to resolve `publisher` from that page alone (ADR-0029 D13).
    expect(result.jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": "https://over.garden/bg/blog/proof-note",
          name: "Доказателствена бележка",
          description: "Видимо описание",
          inLanguage: "bg",
          isPartOf: { "@id": "https://over.garden/#website" },
        },
        {
          "@type": "Article",
          "@id": "https://over.garden/bg/blog/proof-note#article",
          headline: "Доказателствена бележка",
          mainEntityOfPage: { "@id": "https://over.garden/bg/blog/proof-note" },
          datePublished: "2026-08-23T00:00:00.000Z",
          about: "OverGarden editorial",
          publisher: { "@id": "https://over.garden/#organization" },
        },
        {
          "@type": "Organization",
          "@id": "https://over.garden/#organization",
          name: "OverGarden",
        },
        {
          "@type": "WebSite",
          "@id": "https://over.garden/#website",
          publisher: { "@id": "https://over.garden/#organization" },
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

  /**
   * The acceptance criterion of the entity graph, as one assertion: an entry
   * says what it is about by the organism's permalink, the card claims that
   * same permalink as its own `@id`, and the card points back at the entry's
   * `@id`. Two pages, one graph (ADR-0029 D13).
   */
  it("closes the traversal between an entry and the organism it is about", () => {
    const permalink = "https://over.garden/id/11111111-1111-4111-8111-111111111111";
    const entryUrl = "https://over.garden/@yehor/polyv";
    const cardUrl = "https://over.garden/species/solanum-lycopersicum/de-barao";

    const entry = buildPublicSurfaceMetadata({
      discovery: indexableDiscovery("/@yehor/polyv", ["uk"]),
      locale: "uk",
      title: "Полив | OverGarden",
      visibleFacts: {
        type: "BlogPosting",
        name: "Полив",
        about: { id: permalink, name: "Де Барао", url: cardUrl },
        author: {
          id: "https://over.garden/@yehor",
          name: "Yehor",
          url: "https://over.garden/@yehor",
        },
        images: [{ url: "https://media.over.garden/a.webp", caption: "Кущ" }],
      },
    });
    const card = buildPublicSurfaceMetadata({
      discovery: indexableDiscovery(
        "/species/solanum-lycopersicum/de-barao",
        ["uk"],
      ),
      locale: "uk",
      contentLocale: null,
      title: "Де Барао | OverGarden",
      visibleFacts: {
        type: "Taxon",
        name: "Де Барао",
        taxon: {
          id: permalink,
          scientificName: "Solanum lycopersicum",
          taxonRank: "cultivar",
          sameAs: [],
        },
        subjectOf: [{ id: `${entryUrl}#article`, url: entryUrl }],
      },
    });

    const nodeOf = (result: typeof entry, type: string) =>
      (result.jsonLd?.["@graph"] as Array<Record<string, unknown>>).find(
        (node) => node["@type"] === type,
      );

    const article = nodeOf(entry, "BlogPosting");
    const taxon = nodeOf(card, "Taxon");

    // Entry → card: the `about` `@id` is the card's own `@id`.
    expect((article?.about as Record<string, unknown>)["@id"]).toBe(permalink);
    expect(taxon?.["@id"]).toBe(permalink);

    // Card → entry: the `subjectOf` `@id` is the article's own `@id`.
    expect(taxon?.subjectOf).toEqual([
      { "@type": "Article", "@id": `${entryUrl}#article`, url: entryUrl },
    ]);
    expect(article?.["@id"]).toBe(`${entryUrl}#article`);

    // The author is a node of its own, referenced rather than inlined, so the
    // profile page and every entry name the same person.
    expect(article?.author).toEqual({ "@id": "https://over.garden/@yehor" });
    expect(nodeOf(entry, "Person")).toMatchObject({
      "@id": "https://over.garden/@yehor",
      name: "Yehor",
    });

    // Both photographs the page shows, with the caption a reader sees.
    expect(article?.image).toEqual([
      {
        "@type": "ImageObject",
        "@id": "https://media.over.garden/a.webp",
        url: "https://media.over.garden/a.webp",
        contentUrl: "https://media.over.garden/a.webp",
        caption: "Кущ",
      },
    ]);
  });
});
