import { describe, expect, it } from "vitest";

import {
  buildAnswerPageJsonLd,
  getAnswerPage,
  getMarketLanding,
  listAnswerPages,
  listBlogPosts,
  listGuides,
  listIndexableAuthoredPublicContentSitemapEntries,
  listMarketLandings,
} from "./public-seo-content";

describe("public SEO/AEO content foundation", () => {
  it("exposes authored content surfaces that are eligible for the sitemap", () => {
    const entries = listIndexableAuthoredPublicContentSitemapEntries();
    const paths = entries.map((entry) => entry.path);

    expect(paths).toEqual([
      "/uk/blog",
      "/bg/blog",
      "/ru/blog",
      "/uk/blog/ai-garden-advice-vs-real-garden-proof",
      "/bg/blog/ai-garden-advice-vs-real-garden-proof",
      "/ru/blog/ai-garden-advice-vs-real-garden-proof",
      "/uk/guides/start-a-living-plant-record",
      "/bg/guides/start-a-living-plant-record",
      "/ru/guides/start-a-living-plant-record",
      "/uk/answers/why-are-tomato-leaves-yellow",
      "/bg/answers/why-are-tomato-leaves-yellow",
      "/ru/answers/why-are-tomato-leaves-yellow",
      "/uk/markets/ukraine",
      "/ru/markets/ukraine",
      "/bg/markets/bulgaria",
      "/ru/markets/bulgaria",
      "/uk/markets/bulgaria",
    ]);
    expect(entries).toContainEqual({
      kind: "editorial_blog",
      locale: "uk",
      path: "/uk/blog",
      changeFrequency: "weekly",
      priority: 0.7,
    });
    expect(entries).toContainEqual({
      kind: "marketing_landing",
      locale: "bg",
      path: "/bg/markets/bulgaria",
      changeFrequency: "monthly",
      priority: 0.65,
    });
  });

  it("keeps the authored public content manifest free of private payload surfaces", () => {
    const serialized = JSON.stringify({
      blogPosts: listBlogPosts(),
      guides: listGuides(),
      answers: listAnswerPages(),
      markets: listMarketLandings(),
    });

    expect(serialized).not.toMatch(/owner[_ -]?user/i);
    expect(serialized).not.toMatch(/quarantine/i);
    expect(serialized).not.toMatch(/media[_ -]?key/i);
    expect(serialized).not.toMatch(/raw[_ -]?source/i);
    expect(serialized).not.toMatch(/source[_ -]?record/i);
    expect(serialized).not.toMatch(/latitude|longitude/i);
    expect(serialized).not.toMatch(/invite|token/i);
    expect(serialized).not.toContain("/admin");
    expect(serialized).not.toContain("/api/");
    expect(serialized).not.toContain("/journal/");
  });

  it("wires UA and BG market pages to the OVE-117 localization foundation handoff", () => {
    expect(getMarketLanding("ukraine")?.localizationHandoff).toEqual({
      locale: "uk",
      plannedPath: "/uk/markets/ukraine",
      owningIssue: "OVE-117",
    });

    expect(getMarketLanding("bulgaria")?.localizationHandoff).toEqual({
      locale: "bg",
      plannedPath: "/bg/markets/bulgaria",
      owningIssue: "OVE-117",
    });
  });

  it("builds curated structured metadata for answer pages", () => {
    const answerPage = getAnswerPage("why-are-tomato-leaves-yellow");
    expect(answerPage).not.toBeNull();

    const jsonLd = buildAnswerPageJsonLd(answerPage!, "bg");

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          name: "Why are tomato leaves turning yellow?",
          inLanguage: "bg",
          url: "https://over.garden/bg/answers/why-are-tomato-leaves-yellow",
        },
        {
          "@type": "FAQPage",
        },
      ],
    });
    expect(jsonLd["@graph"][1].mainEntity).toHaveLength(
      answerPage!.faqs.length,
    );
    expect(JSON.stringify(jsonLd)).not.toMatch(/owner|quarantine|latitude/i);
  });
});
